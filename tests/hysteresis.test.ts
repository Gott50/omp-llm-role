import assert from "node:assert/strict";
import { test } from "node:test";
import { rankRole } from "../src/engine.ts";
import { DEFAULT_ROLES } from "../src/settings.ts";
import { runUpdater } from "../src/updater.ts";
import { fakeDeps, makeCatalog, makeModel, runInTempDir, setupAgentDir } from "./helpers.ts";

// Uniform quality metrics -> q = Σ (w/qW)·(v+20)/80 over the weighted index metrics,
// plus the log-anchored throughput term when the role weights throughput.
// value = q − λ·price; margin(A,B) = value(A) − value(B).
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
  const margin = result.decisions[0].bestValue - (result.decisions[0].currentValue ?? 0);
  // The hysteresis step compares the role's ranked values, so the expected margin is the
  // engine's own value gap between the two models — not a formula duplicated here.
  const ranked = rankRole(DEFAULT_ROLES.default, MODELS);
  const a = ranked.find((r) => r.model.id === "model-a");
  const b = ranked.find((r) => r.model.id === "model-b");
  assert.ok(a && b);
  assert.ok(Math.abs(margin - (a.value - b.value)) < 1e-9);
});

test("best beats current by margin -> switch (switched)", async () => {
  const { result } = await run('modelRoles:\n  default: "openrouter/org/model-b"\n', { switchMargin: 0.1 });
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
  const { result } = await run("other: 1\n", { roles: { default: { thinking: "high" } } });
  assert.equal(result.decisions[0].to, "openrouter/org/model-a:high");
});

test("no suffix when the chosen catalog entry has empty thinking[]", async () => {
  const dir = setupAgentDir("other: 1\n");
  const deps = fakeDeps(MODELS, { roles: { default: { thinking: "high" } } }, {
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