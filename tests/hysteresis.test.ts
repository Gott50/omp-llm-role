import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { parse as parseYaml } from "yaml";
import { rankRole } from "../src/engine.ts";
import { DEFAULT_ROLES, DEFAULT_SETTINGS } from "../src/settings.ts";
import { runUpdater } from "../src/updater.ts";
import { fakeDeps, makeCatalog, makeModel, runInTempDir, setupAgentDir } from "./helpers.ts";

// Uniform quality metrics -> q = Σ (w/qW)·(v+20)/80 over the weighted index metrics,
// plus the log-anchored throughput term when the role weights throughput.
// value = q − λ·price; margin(A,B) = value(A) − value(B).
const MODELS = [makeModel("model-a", 90, 1, 100), makeModel("model-b", 80, 5, 60), makeModel("model-c", 70, 10, 30)];

/** Every shipped role except `default` opted out, so exactly one chain key is
 * written and one test's chain assertion cannot be perturbed by another role's
 * claim (the same fixture `tests/chain-quality-floor.test.ts` uses). */
const ONLY_DEFAULT = Object.fromEntries(
  ["smol", "slow", "vision", "plan", "commit", "tiny", "task", "advisor", "designer"].map((r) => [r, { enabled: false }]),
);

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

// ---------------------------------------------------------------------------
// Spec #99: `opts.switchMargin` — a per-run override of the resolved setting,
// applied to the hysteresis ladder only. External behaviour: the written
// `modelRoles` / `retry.fallbackChains` and the appended history row.
// ---------------------------------------------------------------------------

// The challenger `model-a` leads `model-b` by ~0.148 on `MODELS`, so a 0.6
// configured margin keeps the incumbent and the override (0) switches.
const OVERRIDE_CONFIG = 'modelRoles:\n  default: "openrouter/org/model-b"\n';

/** One full updater pass over `models`, returning the written document (parsed
 * YAML), its raw text and the run result. Non-`default` shipped roles are
 * disabled so exactly one chain key is written. */
async function writeRun(
  models = MODELS,
  configText = OVERRIDE_CONFIG,
  settings: Record<string, unknown> = {},
  opts: { switchMargin?: number } = {},
  overrides: Partial<Parameters<typeof fakeDeps>[2]> = {},
) {
  const dir = setupAgentDir(configText);
  const deps = fakeDeps(models, { roles: ONLY_DEFAULT, ...settings }, overrides);
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true, ...opts }));
  const text = readFileSync(join(dir, "config.yml"), "utf8");
  const doc = parseYaml(text) as { modelRoles?: Record<string, string>; retry?: { fallbackChains?: Record<string, string[]> } };
  return { dir, result, text, modelRoles: doc.modelRoles ?? {}, chains: doc.retry?.fallbackChains ?? {} };
}

function historyRows(dir: string): Record<string, unknown>[] {
  return readFileSync(join(dir, "llm-role-history.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

test("switchMargin override 0 switches a challenger that sits inside the configured margin", async () => {
  const { result, modelRoles } = await writeRun(MODELS, OVERRIDE_CONFIG, { switchMargin: 0.6, priceSwitchFraction: 0 }, { switchMargin: 0 });
  const d = result.decisions.find((x) => x.role === "default");
  assert.ok(d);
  assert.equal(d.reason, "switched");
  assert.equal(d.to, "openrouter/org/model-a:auto");
  assert.equal(modelRoles.default, "openrouter/org/model-a:auto");
});

test("without the override the same fixture keeps the incumbent (regression pin)", async () => {
  const { result, modelRoles } = await writeRun(MODELS, OVERRIDE_CONFIG, { switchMargin: 0.6, priceSwitchFraction: 0 });
  const d = result.decisions.find((x) => x.role === "default");
  assert.ok(d);
  assert.equal(d.reason, "kept-margin");
  assert.equal(d.to, "openrouter/org/model-b:auto");
  assert.equal(modelRoles.default, "openrouter/org/model-b:auto");
});

test("the override leaves an already-best incumbent kept-eligible", async () => {
  const { result, modelRoles } = await writeRun(MODELS, 'modelRoles:\n  default: "openrouter/org/model-a:auto"\n', {}, { switchMargin: 0 });
  const d = result.decisions.find((x) => x.role === "default");
  assert.ok(d);
  assert.equal(d.reason, "kept-eligible");
  assert.equal(d.from, d.to);
  assert.equal(modelRoles.default, "openrouter/org/model-a:auto");
});

test("the override leaves the adopted path (current not in the pool) unchanged", async () => {
  const { result, modelRoles } = await writeRun(MODELS, 'modelRoles:\n  default: "openrouter/org/model-z"\n', {}, { switchMargin: 0 });
  const d = result.decisions.find((x) => x.role === "default");
  assert.ok(d);
  assert.equal(d.reason, "adopted");
  assert.equal(d.to, "openrouter/org/model-a:auto");
  assert.equal(modelRoles.default, "openrouter/org/model-a:auto");
});

test("the override cannot touch a locked role", async () => {
  const configText = 'modelRoles:\n  default: "openrouter/org/model-b"\n  vision: "openrouter/org/model-b"\n';
  const { result, modelRoles } = await writeRun(MODELS, configText, { roles: { ...ONLY_DEFAULT, vision: { locked: true } } }, { switchMargin: 0 });
  assert.equal(result.decisions.some((d) => d.role === "vision"), false);
  assert.equal(modelRoles.vision, "openrouter/org/model-b");
  assert.equal(modelRoles.default, "openrouter/org/model-a:auto");
});

test("the override cannot resurrect a disabled role", async () => {
  const configText = 'modelRoles:\n  default: "openrouter/org/model-b"\n  vision: "openrouter/org/model-b"\n';
  const settings = { roles: { ...ONLY_DEFAULT, vision: { enabled: false } } };
  const { result, modelRoles } = await writeRun(MODELS, configText, settings, { switchMargin: 0 });
  assert.equal(result.decisions.some((d) => d.role === "vision"), false);
  assert.equal(modelRoles.vision, "openrouter/org/model-b");
});

test("the chain is rebuilt from the newly chosen model under the override", async () => {
  const base = { switchMargin: 0.6, priceSwitchFraction: 0 };
  // Without the override the incumbent stays: its own chain key holds its fallbacks.
  const kept = await writeRun(MODELS, OVERRIDE_CONFIG, base);
  assert.equal(kept.result.decisions.find((d) => d.role === "default")?.reason, "kept-margin");
  assert.deepEqual(kept.chains["openrouter/org/model-b"], ["openrouter/org/model-c:auto"]);
  // With the override the selector moves to the leader and the chain follows it —
  // the model-b key is not written at all.
  const forced = await writeRun(MODELS, OVERRIDE_CONFIG, base, { switchMargin: 0 });
  assert.deepEqual(forced.chains["openrouter/org/model-a"], ["openrouter/org/model-b:auto", "openrouter/org/model-c:auto"]);
  assert.equal(forced.chains["openrouter/org/model-b"], undefined);
  assert.equal(forced.modelRoles.default, "openrouter/org/model-a:auto");
});

test("the override is not persisted: a later run uses the configured margin, not the last override", async () => {
  // The margin must be *observable* on the run that follows the override. On a
  // fixed leaderboard it is not: a margin-free switch always lands on the
  // leader, so the next run keeps it under any margin. The leaderboard is
  // therefore moved for the third run.
  const configured = { roles: ONLY_DEFAULT, switchMargin: 0.3, priceSwitchFraction: 0 };
  const gone = [makeModel("model-w", 98, 1, 100), makeModel("model-a", 90, 5, 60), makeModel("model-c", 70, 10, 30)];
  // Run 1: `MODELS`, incumbent `model-b`, gap 0.148 inside the configured 0.3.
  const one = await writeRun(MODELS, OVERRIDE_CONFIG, configured);
  assert.equal(one.result.decisions.find((d) => d.role === "default")?.reason, "kept-margin");
  assert.equal(one.modelRoles.default, "openrouter/org/model-b:auto");
  // Run 2: same leaderboard and the incumbent run 1 kept; the override adopts the
  // leader — which the history row records as the only trace of the override.
  const two = await writeRun(MODELS, 'modelRoles:\n  default: "openrouter/org/model-b"\n', configured, { switchMargin: 0 });
  assert.equal(two.result.decisions.find((d) => d.role === "default")?.reason, "switched");
  assert.equal(two.modelRoles.default, "openrouter/org/model-a:auto");
  // Run 3: `model-a` (the incumbent run 2 wrote) is now second to `model-w` by
  // 0.1238 — inside the configured 0.3, so it is kept. A persisted override of
  // 0 would switch to `model-w`.
  const three = await writeRun(gone, 'modelRoles:\n  default: "openrouter/org/model-a"\n', configured);
  const d = three.result.decisions.find((x) => x.role === "default");
  assert.ok(d);
  assert.equal(d.reason, "kept-margin");
  assert.equal(d.to, "openrouter/org/model-a:auto");
  assert.equal(three.modelRoles.default, "openrouter/org/model-a:auto");
});

test("the history row records the override when active and omits it otherwise", async () => {
  const dir = setupAgentDir(OVERRIDE_CONFIG);
  const deps = fakeDeps(MODELS, { roles: ONLY_DEFAULT, switchMargin: 0.6, priceSwitchFraction: 0 });
  const forced = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true, switchMargin: 0 }));
  // The overridden run really moved the selector (so the row records something
  // that happened, not just an option the run happened to receive).
  assert.equal(forced.decisions.find((d) => d.role === "default")?.to, "openrouter/org/model-a:auto");
  const plain = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  assert.equal(plain.decisions.find((d) => d.role === "default")?.reason, "kept-eligible");
  const rows = historyRows(dir);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].switchMargin, 0);
  assert.equal("switchMargin" in rows[1], false);
});

test("the run notification notes the ignored margin when the override is active", async () => {
  const notified: string[] = [];
  await writeRun(MODELS, OVERRIDE_CONFIG, { switchMargin: 0.6, priceSwitchFraction: 0 }, { switchMargin: 0 }, { notify: (lines) => notified.push(...lines) });
  assert.ok(notified.includes("switchMargin ignored for this run (--no-margin)"));
  // Without the override the note is absent.
  const plain: string[] = [];
  await writeRun(MODELS, OVERRIDE_CONFIG, { switchMargin: 0.6, priceSwitchFraction: 0 }, {}, { notify: (lines) => plain.push(...lines) });
  assert.equal(plain.includes("switchMargin ignored for this run (--no-margin)"), false);
});

test("an out-of-range configured switchMargin still aborts the run with the override present", async () => {
  const notified: string[] = [];
  const { result, text } = await writeRun(MODELS, OVERRIDE_CONFIG, { switchMargin: 1.5 }, { switchMargin: 0 }, { notify: (lines) => notified.push(...lines) });
  assert.equal(result.aborted, "omp-llm-role settings invalid, no write:");
  assert.equal(result.wrote, false);
  assert.deepEqual(result.decisions, []);
  assert.ok(notified.some((l) => l.includes("switchMargin: must be a number in [0, 1], got 1.5")));
  assert.equal(text, OVERRIDE_CONFIG);
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