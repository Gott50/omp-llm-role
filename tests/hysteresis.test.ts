import assert from "node:assert/strict";
import { test } from "node:test";
import { rankRole } from "../src/engine.ts";
import { DEFAULT_ROLES, DEFAULT_SETTINGS } from "../src/settings.ts";
import { runUpdater } from "../src/updater.ts";
import { fakeDeps, makeCatalog, makeModel, runInTempDir, setupAgentDir } from "./helpers.ts";

// Uniform quality metrics -> q = Σ (w/qW)·(v+20)/80 over the weighted index metrics,
// plus the log-anchored throughput term when the role weights throughput.
// value = q − λ·price; margin(A,B) = value(A) − value(B).
const MODELS = [makeModel("model-a", 90, 1, 100), makeModel("model-b", 80, 5, 60), makeModel("model-c", 70, 10, 30)];

async function run(configText: string | null, settings: Record<string, unknown> = {}, models = MODELS) {
  const dir = setupAgentDir(configText);
  const notified: string[] = [];
  const deps = fakeDeps(models, settings, { notify: (lines) => notified.push(...lines) });
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
  assert.equal(d.to, "openrouter/org/model-a:auto");
});

test("current not in today's pool -> adopt best (adopted)", async () => {
  const { result } = await run('modelRoles:\n  default: "openrouter/org/model-z"\n');
  assert.equal(result.decisions[0].reason, "adopted");
  assert.equal(result.decisions[0].to, "openrouter/org/model-a:auto");
});

test("best not better by margin -> keep current (kept-margin)", async () => {
  const { result } = await run('modelRoles:\n  default: "openrouter/org/model-b"\n', { switchMargin: 0.6, priceSwitchFraction: 0 });
  assert.equal(result.decisions[0].reason, "kept-margin");
  assert.equal(result.decisions[0].to, "openrouter/org/model-b:auto");
  const margin = result.decisions[0].bestValue - (result.decisions[0].currentValue ?? 0);
  // The hysteresis step compares the role's ranked values, so the expected margin is the
  // engine's own value gap between the two models — not a formula duplicated here.
  const ranked = rankRole(DEFAULT_ROLES.default, MODELS);
  const a = ranked.find((r) => r.model.id === "model-a");
  const b = ranked.find((r) => r.model.id === "model-b");
  assert.ok(a && b);
  assert.ok(Math.abs(margin - (a.value - b.value)) < 1e-9);
});

// Near-tie pair for the cost-side override: the cheaper model (x) leads the ranking but
// only barely, while the incumbent (y) is 3x the price — the case a flat margin vetoes.
const NEAR_TIE = [makeModel("model-x", 90, 1, 100), makeModel("model-y", 90.5, 3, 100)];

test("challenger inside the margin but >=2x cheaper -> switch (switched-cost)", async () => {
  const { result } = await run('modelRoles:\n  default: "openrouter/org/model-y"\n', {}, NEAR_TIE);
  // Premise from the engine, not restated arithmetic: x sits inside the switch margin of
  // the incumbent and undercuts it by at least priceSwitchFraction.
  const ranked = rankRole(DEFAULT_ROLES.default, NEAR_TIE);
  const best = ranked[0];
  const current = ranked.find((r) => r.model.id === "model-y");
  assert.ok(best.model.id === "model-x" && current);
  assert.ok(best.value - current.value < DEFAULT_SETTINGS.switchMargin);
  assert.ok(best.priceEff <= current.priceEff * (1 - DEFAULT_SETTINGS.priceSwitchFraction));
  assert.equal(result.decisions[0].reason, "switched-cost");
  assert.equal(result.decisions[0].to, "openrouter/org/model-x:auto");
});

test("priceSwitchFraction 0 keeps the switch margin in charge", async () => {
  const { result } = await run('modelRoles:\n  default: "openrouter/org/model-y"\n', { priceSwitchFraction: 0 }, NEAR_TIE);
  assert.equal(result.decisions[0].reason, "kept-margin");
  assert.equal(result.decisions[0].to, "openrouter/org/model-y:auto");
});

test("inside the margin but not cheap enough -> keep current", async () => {
  // A 0.9 fraction demands a >=10x undercut; this pair's 3x is not enough.
  const { result } = await run('modelRoles:\n  default: "openrouter/org/model-y"\n', { priceSwitchFraction: 0.9 }, NEAR_TIE);
  assert.equal(result.decisions[0].reason, "kept-margin");
  assert.equal(result.decisions[0].to, "openrouter/org/model-y:auto");
});

test("best beats current by margin -> switch (switched)", async () => {
  const { result } = await run('modelRoles:\n  default: "openrouter/org/model-b"\n', { switchMargin: 0.1 });
  assert.equal(result.decisions[0].reason, "switched");
  assert.equal(result.decisions[0].to, "openrouter/org/model-a:auto");
});

test("switchMargin 0 always takes today's best", async () => {
  const { result } = await run('modelRoles:\n  default: "openrouter/org/model-b"\n', { switchMargin: 0 });
  assert.equal(result.decisions[0].reason, "switched");
  assert.equal(result.decisions[0].to, "openrouter/org/model-a:auto");
});

test("current already best -> kept-eligible with identical selector", async () => {
  const { result } = await run('modelRoles:\n  default: "openrouter/org/model-a:auto"\n');
  assert.equal(result.decisions[0].reason, "kept-eligible");
  assert.equal(result.decisions[0].from, result.decisions[0].to);
});

test("suffix appended from settings when the catalog entry thinks", async () => {
  const dir = setupAgentDir("other: 1\n");
  const deps = fakeDeps(MODELS, { roles: { default: { thinking: "high" } } }, {
    getCatalog: async () => makeCatalog(MODELS.map((m) => m.id), ["high"]),
  });
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true, dryRun: true }));
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

test("no suffix when the pinned level is not in the model's thinking[]", async () => {
  const dir = setupAgentDir("other: 1\n");
  const deps = fakeDeps(MODELS, { roles: { default: { thinking: "high" } } }, {
    getCatalog: async () => makeCatalog(MODELS.map((m) => m.id), ["low"]),
  });
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true, dryRun: true }));
  assert.equal(result.decisions[0].to, "openrouter/org/model-a"); // omp would clamp: bare
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