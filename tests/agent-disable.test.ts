import assert from "node:assert/strict";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { parseConfig } from "../src/config-edit.ts";
import { SHIPPED_AGENTS } from "../src/settings.ts";
import { runUpdater } from "../src/updater.ts";
import { fakeDeps, makeModel, runInTempDir, setupAgentDir } from "./helpers.ts";

const MODELS = [makeModel("model-a", 90, 1, 100), makeModel("model-b", 80, 5, 60)];

test("SHIPPED_AGENTS matches the shipped agents/*.md files", () => {
  const dir = fileURLToPath(new URL("../agents", import.meta.url));
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.slice(0, -3))
    .sort();
  assert.deepEqual([...SHIPPED_AGENTS].sort(), files);
});

test("a shipped agent is disabled by default (its role is opt-in)", async () => {
  const dir = setupAgentDir("modelRoles:\n  default: openrouter/org/model-a:auto\n");
  const result = await runInTempDir(dir, () => runUpdater("manual", fakeDeps(MODELS), { force: true }));
  assert.equal(result.aborted, undefined);
  assert.deepEqual(parseConfig(readFileSync(join(dir, "config.yml"), "utf8")).disabledAgents, ["designer"]);
});

test("enabling the role removes the agent from disabledAgents", async () => {
  const dir = setupAgentDir('modelRoles:\n  default: openrouter/org/model-a:auto\ntask:\n  disabledAgents:\n    - "designer"\n');
  const result = await runInTempDir(dir, () =>
    runUpdater("manual", fakeDeps(MODELS, { roles: { designer: { enabled: true } } }), { force: true }),
  );
  assert.equal(result.aborted, undefined);
  assert.deepEqual(parseConfig(readFileSync(join(dir, "config.yml"), "utf8")).disabledAgents, []);
});

test("the agent sync is not day-gated", async () => {
  const dir = setupAgentDir("modelRoles:\n  default: openrouter/org/model-a:auto\n", {
    lastRunDay: "2026-09-22",
    managedRoles: [],
    roleLastSelector: {},
    pluginWrittenChainKeys: [],
    previousModelRoles: null,
  });
  const result = await runInTempDir(dir, () => runUpdater("session-start", fakeDeps(MODELS)));
  assert.equal(result.wrote, true);
  assert.deepEqual(parseConfig(readFileSync(join(dir, "config.yml"), "utf8")).disabledAgents, ["designer"]);
});

/** Write a user agent `.md` into `<dir>/agents` pinning `model`. */
function writeUserAgent(dir: string, name: string, model: string): void {
  mkdirSync(join(dir, "agents"), { recursive: true });
  writeFileSync(join(dir, "agents", `${name}.md`), `---\nname: ${name}\ndescription: d\nmodel: ${model}\n---\n\nBody.\n`);
}

/** Raw settings for a user role `myrole` (weights sum 1.0) with `enabled` toggled. */
function myroleSettings(enabled: boolean): Record<string, unknown> {
  return {
    "roles.myrole.enabled": enabled,
    roles: { myrole: { weights: { general: 0.5, price: 0.5 }, required: ["general", "price"] } },
  };
}

test("a user agent pinning a disabled role is added to disabledAgents", async () => {
  const dir = setupAgentDir("modelRoles:\n  default: openrouter/org/model-a:auto\n");
  writeUserAgent(dir, "myagent", '"@myrole, @default"');
  const result = await runInTempDir(dir, () => runUpdater("manual", fakeDeps(MODELS, myroleSettings(false)), { force: true }));
  assert.equal(result.aborted, undefined);
  const disabled = parseConfig(readFileSync(join(dir, "config.yml"), "utf8")).disabledAgents;
  assert.ok(disabled.includes("myagent"), `expected myagent in ${JSON.stringify(disabled)}`);
});

test("enabling the pinned role removes the user agent", async () => {
  const dir = setupAgentDir('modelRoles:\n  default: openrouter/org/model-a:auto\ntask:\n  disabledAgents:\n    - "myagent"\n');
  writeUserAgent(dir, "myagent", '"@myrole, @default"');
  const result = await runInTempDir(dir, () => runUpdater("manual", fakeDeps(MODELS, myroleSettings(true)), { force: true }));
  assert.equal(result.aborted, undefined);
  const disabled = parseConfig(readFileSync(join(dir, "config.yml"), "utf8")).disabledAgents;
  assert.ok(!disabled.includes("myagent"), `expected myagent removed from ${JSON.stringify(disabled)}`);
});

test("an unrelated disabledAgents entry keeps its position", async () => {
  const dir = setupAgentDir('modelRoles:\n  default: openrouter/org/model-a:auto\ntask:\n  disabledAgents:\n    - "security-reviewer"\n');
  writeUserAgent(dir, "myagent", '"@myrole, @default"');
  const result = await runInTempDir(dir, () => runUpdater("manual", fakeDeps(MODELS, myroleSettings(false)), { force: true }));
  assert.equal(result.aborted, undefined);
  const disabled = parseConfig(readFileSync(join(dir, "config.yml"), "utf8")).disabledAgents;
  assert.deepEqual(disabled, ["security-reviewer", "designer", "myagent"]);
});

test("an agent pinning an unknown role is never added", async () => {
  const dir = setupAgentDir("modelRoles:\n  default: openrouter/org/model-a:auto\n");
  writeUserAgent(dir, "ghost", '"@ghostrole, @default"');
  const result = await runInTempDir(dir, () => runUpdater("manual", fakeDeps(MODELS), { force: true }));
  assert.equal(result.aborted, undefined);
  const disabled = parseConfig(readFileSync(join(dir, "config.yml"), "utf8")).disabledAgents;
  assert.ok(!disabled.includes("ghost"), `expected ghost absent from ${JSON.stringify(disabled)}`);
});
