import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { parse as parseYaml } from "yaml";
import { parseConfig } from "../src/config-edit.ts";
import { runUpdater } from "../src/updater.ts";
import { fakeDeps, makeModel, runInTempDir, setupAgentDir } from "./helpers.ts";

const MODELS = [makeModel("model-a", 90, 1, 100), makeModel("model-b", 80, 5, 60), makeModel("model-c", 70, 10, 30)];

const CONFIG = `modelRoles:
  default: openrouter/org/model-b
retry:
  fallbackChains:
    openrouter/~owner/owner-model-latest:
      - openrouter/org/model-x
    openrouter/org/model-stale:
      - openrouter/org/model-a
    openrouter/org/model-a:
      - openrouter/org/model-b
`;

const STATE = {
  lastRunDay: null,
  managedRoles: [],
  roleLastSelector: {},
  pluginWrittenChainKeys: ["openrouter/org/model-stale", "openrouter/org/model-a"],
  previousModelRoles: null,
};

test("chain maintenance: prune stale plugin keys, preserve owner keys, replace must-write keys in place", async () => {
  const dir = setupAgentDir(CONFIG, STATE);
  const result = await runInTempDir(dir, () => runUpdater("manual", fakeDeps(MODELS), { force: true }));
  assert.equal(result.aborted, undefined);
  assert.equal(result.wrote, true);

  const text = readFileSync(join(dir, "config.yml"), "utf8");
  const parsed = parseConfig(text);
  // default switched to model-a (margin 0.5 > default 0.02)
  assert.equal(parsed.modelRoles.default, "openrouter/org/model-a:auto");

  // Stale plugin-written key removed; owner-written unreferenced key preserved;
  // the key the plugin must write exists exactly once (replaced, not duplicated).
  assert.deepEqual(parsed.chainKeys.sort(), ["openrouter/org/model-a", "openrouter/~owner/owner-model-latest"]);
  const keyLineCount = text.split("\n").filter((l) => l.trim() === "openrouter/org/model-a:").length;
  assert.equal(keyLineCount, 1);

  const doc = parseYaml(text) as {
    retry: { fallbackChains: Record<string, string[]> };
  };
  // Refreshed chain for the chosen model: next two tier-eligible candidates, deduped.
  assert.deepEqual(doc.retry.fallbackChains["openrouter/org/model-a"], ["openrouter/org/model-b", "openrouter/org/model-c"]);
  // Owner chain values untouched.
  assert.deepEqual(doc.retry.fallbackChains["openrouter/~owner/owner-model-latest"], ["openrouter/org/model-x"]);

  // State: plugin now owns exactly the referenced key; day stamped; pre-write snapshot kept.
  const state = JSON.parse(readFileSync(join(dir, "llm-role-state.json"), "utf8"));
  assert.deepEqual(state.pluginWrittenChainKeys, ["openrouter/org/model-a"]);
  assert.equal(state.lastRunDay, "2026-09-22");
  assert.deepEqual(state.previousModelRoles, { default: "openrouter/org/model-b" });

  // History: exactly one row for this run.
  const history = readFileSync(join(dir, "llm-role-history.jsonl"), "utf8").trim().split("\n");
  assert.equal(history.length, 1);
  assert.equal(JSON.parse(history[0]).trigger, "manual");
});
test("zero-change run writes nothing and leaves no mtime trace", async () => {
  // Config already matches today's best (model-a, bare selector for the suffix-less role)
  // and already carries the opt-in agent's disabled entry, so the run is a true no-op.
  const config = "modelRoles:\n  default: openrouter/org/model-a:auto\ntask:\n  disabledAgents:\n    - \"designer\"\nretry:\n  fallbackChains:\n    openrouter/org/model-a:\n      - openrouter/org/model-b:auto\n      - openrouter/org/model-c:auto\n";
  const dir = setupAgentDir(config, {
    lastRunDay: null,
    managedRoles: [],
    roleLastSelector: {},
    pluginWrittenChainKeys: ["openrouter/org/model-a"],
    previousModelRoles: null,
  });
  // Restrict the run to the default role (opt the shipped defaults out) so the
  // pre-set config is genuinely a zero-change match.
  const optOut = Object.fromEntries(
    ["smol", "slow", "vision", "plan", "commit", "tiny", "task", "advisor", "designer"].map((r) => [r, { weights: null }]),
  );
  const before = readFileSync(join(dir, "config.yml"), "utf8");
  const result = await runInTempDir(dir, () => runUpdater("manual", fakeDeps(MODELS, { roles: optOut }), { force: true }));
  assert.equal(result.wrote, false);
  assert.equal(result.decisions[0].reason, "kept-eligible");
  assert.equal(readFileSync(join(dir, "config.yml"), "utf8"), before);
  // Day still stamped so the next session-start no-ops.
  const state = JSON.parse(readFileSync(join(dir, "llm-role-state.json"), "utf8"));
  assert.equal(state.lastRunDay, "2026-09-22");
});

test("writeFallbackChains: false leaves chains untouched and prunes nothing", async () => {
  const dir = setupAgentDir(CONFIG, STATE);
  const result = await runInTempDir(dir, () => runUpdater("manual", fakeDeps(MODELS, { writeFallbackChains: false }), { force: true }));
  assert.equal(result.wrote, true);
  const text = readFileSync(join(dir, "config.yml"), "utf8");
  // Role line changed, chains byte-identical (stale key NOT pruned when chains are off).
  assert.ok(text.includes("openrouter/org/model-stale:"));
  assert.ok(text.includes("openrouter/~owner/owner-model-latest:"));
  const state = JSON.parse(readFileSync(join(dir, "llm-role-state.json"), "utf8"));
  assert.deepEqual(state.pluginWrittenChainKeys, ["openrouter/org/model-stale", "openrouter/org/model-a"]);
});

test("a role that left the managed set is pruned from modelRoles", async () => {
  // `designer` was managed last run (state) but ships disabled, so this run must
  // delete its stale pin — otherwise the shipped agent keeps routing to it.
  const config = "modelRoles:\n  default: openrouter/org/model-b\n  designer: openrouter/org/model-c\n";
  const dir = setupAgentDir(config, {
    lastRunDay: null,
    managedRoles: ["default", "designer"],
    roleLastSelector: {},
    pluginWrittenChainKeys: [],
    previousModelRoles: null,
  });
  const result = await runInTempDir(dir, () => runUpdater("manual", fakeDeps(MODELS), { force: true }));
  assert.equal(result.aborted, undefined);
  const parsed = parseConfig(readFileSync(join(dir, "config.yml"), "utf8"));
  assert.equal(parsed.modelRoles.designer, undefined);
  assert.ok(parsed.modelRoles.default !== undefined);
});