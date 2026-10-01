import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { parse as parseYaml } from "yaml";
import { parseConfig } from "../src/config-edit.ts";
import { resolveSettings } from "../src/settings.ts";
import { runUpdater } from "../src/updater.ts";
import { fakeDeps, makeModel, runInTempDir, setupAgentDir } from "./helpers.ts";

const MODELS = [makeModel("model-a", 90, 1, 100), makeModel("model-b", 80, 5, 60), makeModel("model-c", 70, 10, 30)];

/** Opt every shipped role out except the ones a test names, so a run's decisions
 * and chain writes are limited to the roles under test. */
const OPT_OUT = Object.fromEntries(
  ["smol", "vision", "plan", "commit", "tiny", "task", "advisor", "designer"].map((r) => [r, { weights: null }]),
);

test("resolveSettings: locked boolean survives, non-boolean errors", () => {
  const ok = resolveSettings({ roles: { slow: { locked: true } } });
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.settings.roles.slow.locked, true);

  const bad = resolveSettings({ roles: { slow: { locked: "yes" } } });
  assert.ok(bad.errors.some((e) => e.includes("locked must be a boolean")));
});

test("locked role is not switched while a sibling unlocked role switches", async () => {
  const config = `modelRoles:\n  slow: openrouter/org/model-b\n  default: openrouter/org/model-b\nretry:\n  fallbackChains:\n    openrouter/org/model-b:\n      - openrouter/org/model-c\n`;
  const dir = setupAgentDir(config, {
    lastRunDay: null,
    managedRoles: ["slow", "default"],
    roleLastSelector: {},
    pluginWrittenChainKeys: ["openrouter/org/model-b"],
    previousModelRoles: null,
  });
  const settings = { roles: { ...OPT_OUT, slow: { locked: true } } };
  const result = await runInTempDir(dir, () => runUpdater("manual", fakeDeps(MODELS, settings), { force: true }));
  assert.equal(result.aborted, undefined);

  // No decision for the locked role; the sibling still switches.
  assert.equal(result.decisions.some((d) => d.role === "slow"), false);
  const d = result.decisions.find((x) => x.role === "default");
  assert.ok(d);
  assert.equal(d.reason, "switched");
  assert.equal(d.to, "openrouter/org/model-a:auto");

  const text = readFileSync(join(dir, "config.yml"), "utf8");
  const parsed = parseConfig(text);
  // The locked role's modelRoles line is byte-identical.
  assert.equal(parsed.modelRoles.slow, "openrouter/org/model-b");
  assert.ok(text.includes("  slow: openrouter/org/model-b\n"));
  // Its fallback chain is neither rewritten nor pruned.
  const doc = parseYaml(text) as { retry: { fallbackChains: Record<string, string[]> } };
  assert.deepEqual(doc.retry.fallbackChains["openrouter/org/model-b"], ["openrouter/org/model-c"]);

  const state = JSON.parse(readFileSync(join(dir, "llm-role-state.json"), "utf8"));
  assert.ok(state.managedRoles.includes("slow"));
  assert.ok(state.pluginWrittenChainKeys.includes("openrouter/org/model-b"));
});

test("a locked role's plugin-written chain key survives chainPrunes", async () => {
  const config = `modelRoles:\n  slow: openrouter/org/model-b\nretry:\n  fallbackChains:\n    openrouter/org/model-b:\n      - openrouter/org/model-c\n`;
  const dir = setupAgentDir(config, {
    lastRunDay: null,
    managedRoles: ["slow"],
    roleLastSelector: {},
    pluginWrittenChainKeys: ["openrouter/org/model-b"],
    previousModelRoles: null,
  });
  const settings = { roles: { ...OPT_OUT, default: { weights: null }, slow: { locked: true } } };
  const result = await runInTempDir(dir, () => runUpdater("manual", fakeDeps(MODELS, settings), { force: true }));
  assert.equal(result.aborted, undefined);
  assert.deepEqual(result.decisions, []);

  const text = readFileSync(join(dir, "config.yml"), "utf8");
  const doc = parseYaml(text) as { retry: { fallbackChains: Record<string, string[]> } };
  // The whole retry block is untouched: the locked key is referenced, not pruned.
  assert.deepEqual(doc.retry.fallbackChains, { "openrouter/org/model-b": ["openrouter/org/model-c"] });

  const state = JSON.parse(readFileSync(join(dir, "llm-role-state.json"), "utf8"));
  assert.deepEqual(state.pluginWrittenChainKeys, ["openrouter/org/model-b"]);
  assert.deepEqual(state.managedRoles, ["slow"]);
});

test("unlocking restores the normal daily switch", async () => {
  const config = `modelRoles:\n  slow: openrouter/org/model-b\n`;
  const dir = setupAgentDir(config, {
    lastRunDay: null,
    managedRoles: ["slow"],
    roleLastSelector: {},
    pluginWrittenChainKeys: [],
    previousModelRoles: null,
  });
  const settings = { roles: { ...OPT_OUT, default: { weights: null }, slow: { locked: false } } };
  const result = await runInTempDir(dir, () => runUpdater("manual", fakeDeps(MODELS, settings), { force: true }));
  assert.equal(result.aborted, undefined);
  const d = result.decisions.find((x) => x.role === "slow");
  assert.ok(d);
  assert.equal(d.reason, "switched");
  assert.equal(d.to, "openrouter/org/model-a");
  const parsed = parseConfig(readFileSync(join(dir, "config.yml"), "utf8"));
  assert.equal(parsed.modelRoles.slow, "openrouter/org/model-a");
});

test("a locked role that is disabled still leaves the managed set", async () => {
  const config = `modelRoles:\n  slow: openrouter/org/model-b\n`;
  const dir = setupAgentDir(config, {
    lastRunDay: null,
    managedRoles: ["slow"],
    roleLastSelector: {},
    pluginWrittenChainKeys: [],
    previousModelRoles: null,
  });
  const settings = { roles: { ...OPT_OUT, default: { weights: null }, slow: { locked: true, enabled: false } } };
  const result = await runInTempDir(dir, () => runUpdater("manual", fakeDeps(MODELS, settings), { force: true }));
  assert.equal(result.aborted, undefined);
  const parsed = parseConfig(readFileSync(join(dir, "config.yml"), "utf8"));
  assert.equal("slow" in parsed.modelRoles, false);
});