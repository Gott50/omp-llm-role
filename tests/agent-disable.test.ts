import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
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
