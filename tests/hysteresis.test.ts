import assert from "node:assert/strict";
import { test } from "node:test";
import { runUpdater } from "../src/updater.ts";
import { fakeDeps, makeCatalog, makeModel, runInTempDir, setupAgentDir } from "./helpers.ts";

// Uniform quality metrics -> scores: A 1.0, B 0.5, C 0.0; margin(A,B) = 0.5.
const MODELS = [makeModel("model-a", 90, 1, 100), makeModel("model-b", 80, 5, 60), makeModel("model-c", 70, 10, 30)];

async function run(configText: string | null, settings: Record<string, unknown> = {}) {
  const dir = setupAgentDir(configText);
  const notified: string[] = [];
  const deps = fakeDeps(MODELS, settings, { notify: (lines) => notified.push(...lines) });
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true, dryRun: true }));
  return { result, notified };
}

test("no current entry -> adopt best (no-current)", async () => {
  const { result } = await run("other: 1\n");
  // A role-less config gives every role with an eligible pool a no-current decision.
  const d = result.decisions.find((x) => x.role === "default");
  assert.ok(d);
  assert.equal(d.reason, "no-current");
  assert.equal(d.from, null);
  assert.equal(d.to, "openrouter/org/model-a");
});

test("current not in today's pool -> adopt best (adopted)", async () => {
  const { result } = await run('modelRoles:\n  default: "openrouter/org/model-z"\n');
  assert.equal(result.decisions[0].reason, "adopted");
  assert.equal(result.decisions[0].to, "openrouter/org/model-a");
});

test("best not better by margin -> keep current (kept-margin)", async () => {
  const { result } = await run('modelRoles:\n  default: "openrouter/org/model-b"\n', { switchMargin: 0.6 });
  assert.equal(result.decisions[0].reason, "kept-margin");
  assert.equal(result.decisions[0].to, "openrouter/org/model-b");
  assert.equal(result.decisions[0].bestScore - (result.decisions[0].currentScore ?? 0), 0.5);
});

test("best beats current by margin -> switch (switched)", async () => {
  const { result } = await run('modelRoles:\n  default: "openrouter/org/model-b"\n', { switchMargin: 0.4 });
  assert.equal(result.decisions[0].reason, "switched");
  assert.equal(result.decisions[0].to, "openrouter/org/model-a");
});

test("switchMargin 0 always takes today's best", async () => {
  const { result } = await run('modelRoles:\n  default: "openrouter/org/model-b"\n', { switchMargin: 0 });
  assert.equal(result.decisions[0].reason, "switched");
  assert.equal(result.decisions[0].to, "openrouter/org/model-a");
});

test("current already best -> kept-eligible with identical selector", async () => {
  const { result } = await run('modelRoles:\n  default: "openrouter/org/model-a"\n');
  assert.equal(result.decisions[0].reason, "kept-eligible");
  assert.equal(result.decisions[0].from, result.decisions[0].to);
});

test("suffix appended from settings when the catalog entry thinks", async () => {
  const { result } = await run("other: 1\n", { suffixes: { default: "high" } });
  assert.equal(result.decisions[0].to, "openrouter/org/model-a:high");
});

test("no suffix when the chosen catalog entry has empty thinking[]", async () => {
  const dir = setupAgentDir("other: 1\n");
  const deps = fakeDeps(MODELS, { suffixes: { default: "high" } }, {
    getCatalog: async () => makeCatalog(MODELS.map((m) => m.id), []),
  });
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true, dryRun: true }));
  assert.equal(result.decisions[0].to, "openrouter/org/model-a");
});

test("day gate: second same-day run without force is a silent no-op", async () => {
  const dir = setupAgentDir('modelRoles:\n  default: "openrouter/org/model-b"\n');
  const deps = fakeDeps(MODELS);
  const first = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  assert.equal(first.wrote, true);
  const second = await runInTempDir(dir, () => runUpdater("session-start", deps));
  assert.deepEqual(second.decisions, []);
  assert.equal(second.wrote, false);
});