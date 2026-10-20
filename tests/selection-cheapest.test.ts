import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { parse as parseYaml } from "yaml";
import type { KeyAvailability, ProbeVerdict } from "../src/availability.ts";
import { barSelection, rankRole, type Model, type OpenRouterEndpointRecord, type Ranked } from "../src/engine.ts";
import { DEFAULT_ROLES, DEFAULT_SETTINGS } from "../src/settings.ts";
import { runUpdater, type Deps, type RunResult } from "../src/updater.ts";
import { fakeDeps, makeModel, runInTempDir, setupAgentDir } from "./helpers.ts";

// Spec #103 / ticket #106: `selection: "cheapest"` replaces the primary
// choice's objective — the value leader — with the cheapest candidate that
// clears `qualityFloor × anchor.q`, where the anchor is the role's highest-`q`
// candidate. Every assertion here is external behaviour: the selector a full
// `runUpdater` run writes and the decision reason it records.

/** Every shipped role except `default` opted out, so one chain key is written
 * and a test's assertion cannot be perturbed by another role's claim. */
const ONLY_DEFAULT = Object.fromEntries(
  ["smol", "slow", "vision", "plan", "commit", "tiny", "task", "advisor", "designer"].map((r) => [r, { enabled: false }]),
);

function onlyDefault(extra: Record<string, unknown> = {}): Record<string, unknown> {
  const { roles, ...rest } = extra;
  return { ...rest, roles: { ...ONLY_DEFAULT, ...(roles as Record<string, unknown> | undefined) } };
}

/** A model whose routes are `slugs`, each priced at the model's own price plus
 * its position — the manual-pin fixture's shape. */
function routed(id: string, general: number, price: number, tput: number, slugs: string[]): Model {
  const m = makeModel(id, general, price, tput);
  m.routes = slugs.map((slug, i): OpenRouterEndpointRecord => ({
    id: `${id}-${slug}`,
    providerSlug: slug,
    serviceTier: null,
    status: 0,
    free: false,
    variant: "v",
    price: price + i,
    weightPrice: price + i,
    cacheReadPrice: null,
    tput,
    latency: null,
    contextLength: null,
    maxCompletionTokens: null,
    supportsTools: null,
  }));
  return m;
}

/** KeyAvailability fixture: `active` with the given ranking-id sets. */
function availability(blocked: string[], allowed: string[]): KeyAvailability {
  return {
    active: true,
    reason: "active",
    allowed: new Set(allowed),
    blocked: new Set(blocked),
    publicCount: 0,
    keyedCount: 0,
    fetchedAt: "2026-09-22T00:00:00.000Z",
  };
}

type Written = {
  chains: Record<string, string[]>;
  modelRoles: Record<string, string>;
  text: string;
  result: RunResult;
};

async function runWrite(
  models: Model[],
  settings: Record<string, unknown>,
  overrides: Partial<Deps> = {},
  configText = "other: 1\n",
): Promise<Written> {
  const dir = setupAgentDir(configText);
  const deps = fakeDeps(models, settings, overrides);
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  const text = readFileSync(join(dir, "config.yml"), "utf8");
  const doc = parseYaml(text) as { modelRoles?: Record<string, string>; retry?: { fallbackChains?: Record<string, string[]> } };
  return { chains: doc.retry?.fallbackChains ?? {}, modelRoles: doc.modelRoles ?? {}, text, result };
}

function decision(w: Written, role = "default") {
  const d = w.result.decisions.find((x) => x.role === role);
  if (d === undefined) throw new Error(`no decision for ${role}`);
  return d;
}

/** The `default` role's ranked row for `id` — the engine's own numbers, so a
 * premise is never a formula restated in the test. */
function row(models: Model[], id: string) {
  const r = rankRole(DEFAULT_ROLES.default, models).find((x) => x.model.id === id);
  if (r === undefined) throw new Error(`no ranked row for ${id}`);
  return r;
}

// The value leader (`premium`, $20/M) is 20× the cheapest bar-clearing
// candidate (`budget`, $1/M). `budget` ranks below the probe window — the walk
// stops after three clean candidates — so the pick is a candidate the walk
// never examined and must be probed on demand.
const TWENTY_X = [
  makeModel("premium", 90, 20, 100),
  makeModel("mid1", 89, 19, 100),
  makeModel("mid2", 88, 18, 100),
  makeModel("budget", 80, 1, 100),
  makeModel("mid3", 87, 17, 100),
];

// A cheap model below the bar (`weak`), a cheap one above it (`budget`), and a
// pricier anchor (`premium`).
const UNDER_BAR = [makeModel("premium", 90, 20, 100), makeModel("budget", 80, 1, 100), makeModel("weak", 60, 0.5, 100)];

// The incumbent (`mid`, $10/M) clears the bar; the pick (`cheap`) undercuts it
// by less than the shipped `priceSwitchFraction` (6 > 10·0.5) — and, in the
// second fixture, by more (4 ≤ 10·0.5).
const NEAR_UNDERCUT = [makeModel("premium", 90, 20, 100), makeModel("mid", 88, 10, 100), makeModel("cheap", 80, 6, 100)];
const DEEP_UNDERCUT = [makeModel("premium", 90, 20, 100), makeModel("mid", 88, 10, 100), makeModel("cheap", 80, 4, 100)];

// The value leader (`leader`, $1/M) is not the highest-`q` model (`expensive`,
// $100/M): the bar is measured against `expensive`, which excludes `cheap`.
const ANCHOR_SPLIT = [makeModel("expensive", 95, 100, 100), makeModel("leader", 90, 1, 100), makeModel("cheap", 80, 0.5, 100)];

// The value leader is also the cheapest bar-clearing candidate, so the mode
// cannot change the pick — the fixture for the chain byte-identity check.
const LEADER_IS_CHEAPEST = [makeModel("cheap-best", 90, 1, 100), makeModel("pricier", 88, 5, 100), makeModel("pricier2", 86, 10, 100)];

// The `mid` route is the pin: `model-a` is the value leader on it ($21/M) while
// `model-b` clears the bar at $2/M, so the rule's pick differs from the leader.
const PINNED = [
  routed("model-a", 90, 20, 100, ["cheap", "mid", "exp"]),
  routed("model-b", 80, 1, 100, ["b1", "mid", "b3"]),
  routed("model-c", 70, 0.5, 100, ["c1", "mid", "c3"]),
];

test("selection: value (the default) writes the value leader, byte-identical to an explicit value", async () => {
  const implicit = await runWrite(TWENTY_X, onlyDefault());
  const explicit = await runWrite(TWENTY_X, onlyDefault({ selection: "value" }));
  // The value leader, from the engine — not a formula restated here.
  assert.equal(rankRole(DEFAULT_ROLES.default, TWENTY_X)[0].model.id, "premium");
  assert.equal(implicit.modelRoles.default, "openrouter/org/premium:auto");
  assert.equal(decision(implicit).reason, "no-current");
  // The mode is opt-in: an absent key and an explicit "value" are the same run.
  assert.equal(explicit.text, implicit.text);
  assert.deepEqual(explicit.chains, implicit.chains);
});

test("cheapest mode picks the cheap bar-clearing candidate over a 20x value leader", async () => {
  const w = await runWrite(TWENTY_X, onlyDefault({ selection: "cheapest" }));
  assert.equal(w.result.aborted, undefined);
  // Premise, from the engine: the value leader is `premium` at 20× `budget`'s price.
  assert.equal(rankRole(DEFAULT_ROLES.default, TWENTY_X)[0].model.id, "premium");
  assert.equal(row(TWENTY_X, "premium").priceEff, 20);
  assert.equal(row(TWENTY_X, "budget").priceEff, 1);
  assert.equal(w.modelRoles.default, "openrouter/org/budget:auto");
  assert.equal(decision(w).reason, "no-current");
  // Reporting stays comparable: `bestValue` is still the value walk's leader,
  // `value` the chosen model's.
  assert.equal(decision(w).bestValue, row(TWENTY_X, "premium").value);
  assert.equal(decision(w).value, row(TWENTY_X, "budget").value);
});

test("an under-bar incumbent is dropped with no margin (switched)", async () => {
  // `switchMargin: 1` would veto every value-mode switch; cheapest mode must not
  // consult it.
  const w = await runWrite(UNDER_BAR, onlyDefault({ selection: "cheapest", switchMargin: 1 }), {}, 'modelRoles:\n  default: "openrouter/org/weak"\n');
  // Premise, from the engine: `weak` is under the bar, `budget` clears it.
  assert.ok(row(UNDER_BAR, "weak").q < 0.9 * row(UNDER_BAR, "premium").q);
  assert.ok(row(UNDER_BAR, "budget").q >= 0.9 * row(UNDER_BAR, "premium").q);
  const d = decision(w);
  assert.equal(d.reason, "switched");
  assert.equal(d.from, "openrouter/org/weak");
  assert.equal(d.to, "openrouter/org/budget:auto");
});

test("a bar-clearing incumbent undercut by less than priceSwitchFraction is kept (kept-margin)", async () => {
  const w = await runWrite(NEAR_UNDERCUT, onlyDefault({ selection: "cheapest" }), {}, 'modelRoles:\n  default: "openrouter/org/mid"\n');
  // Premise, from the engine: the pick is cheaper but not by the shipped fraction.
  assert.ok(row(NEAR_UNDERCUT, "cheap").priceEff > row(NEAR_UNDERCUT, "mid").priceEff * (1 - DEFAULT_SETTINGS.priceSwitchFraction));
  const d = decision(w);
  assert.equal(d.reason, "kept-margin");
  assert.equal(d.to, "openrouter/org/mid:auto");
});

test("a bar-clearing incumbent undercut by more than priceSwitchFraction is switched (switched-cost)", async () => {
  const w = await runWrite(DEEP_UNDERCUT, onlyDefault({ selection: "cheapest" }), {}, 'modelRoles:\n  default: "openrouter/org/mid"\n');
  assert.ok(row(DEEP_UNDERCUT, "cheap").priceEff <= row(DEEP_UNDERCUT, "mid").priceEff * (1 - DEFAULT_SETTINGS.priceSwitchFraction));
  const d = decision(w);
  assert.equal(d.reason, "switched-cost");
  assert.equal(d.to, "openrouter/org/cheap:auto");
});

test("priceSwitchFraction 0 keeps a bar-clearing incumbent (kept-margin)", async () => {
  const w = await runWrite(
    DEEP_UNDERCUT,
    onlyDefault({ selection: "cheapest", priceSwitchFraction: 0 }),
    {},
    'modelRoles:\n  default: "openrouter/org/mid"\n',
  );
  // Premise, from the engine: the pick undercuts the incumbent by more than the
  // shipped fraction, so the default would switch — the guard is the only
  // difference between this run and the next test.
  assert.ok(row(DEEP_UNDERCUT, "cheap").priceEff <= row(DEEP_UNDERCUT, "mid").priceEff * (1 - DEFAULT_SETTINGS.priceSwitchFraction));
  const d = decision(w);
  assert.equal(d.reason, "kept-margin");
  assert.equal(d.to, "openrouter/org/mid:auto");
});

test("the default priceSwitchFraction switches the same incumbent (switched-cost)", async () => {
  const w = await runWrite(DEEP_UNDERCUT, onlyDefault({ selection: "cheapest" }), {}, 'modelRoles:\n  default: "openrouter/org/mid"\n');
  const d = decision(w);
  assert.equal(d.reason, "switched-cost");
  assert.equal(d.to, "openrouter/org/cheap:auto");
});

test("a probe-blocked incumbent is adopted away from, not kept", async () => {
  // `mid` clears the bar and is the incumbent, but the probe rejects it: it is
  // not in the pool, so the pick (`cheap`) is chosen — value mode's behaviour.
  const w = await runWrite(
    NEAR_UNDERCUT,
    onlyDefault({ selection: "cheapest" }),
    { probeModel: async (_token: string, catalogId: string): Promise<ProbeVerdict> => (catalogId === "org/mid" ? "blocked" : "ok") },
    'modelRoles:\n  default: "openrouter/org/mid"\n',
  );
  // Premise, from the engine: `mid` clears the bar and the pick is `cheap`.
  assert.ok(row(NEAR_UNDERCUT, "mid").q >= 0.9 * row(NEAR_UNDERCUT, "premium").q);
  assert.equal(row(NEAR_UNDERCUT, "cheap").priceEff, 6);
  const d = decision(w);
  assert.equal(d.reason, "adopted");
  assert.equal(d.to, "openrouter/org/cheap:auto");
});

test("the anchor is the max-q candidate, not the value leader", async () => {
  const w = await runWrite(ANCHOR_SPLIT, onlyDefault({ selection: "cheapest" }));
  // Premise, from the engine: the value leader is not the highest-q model, and
  // `cheap` clears the bar only when it is measured against the value leader.
  assert.equal(rankRole(DEFAULT_ROLES.default, ANCHOR_SPLIT)[0].model.id, "leader");
  assert.ok(row(ANCHOR_SPLIT, "cheap").q < 0.9 * row(ANCHOR_SPLIT, "expensive").q);
  assert.ok(row(ANCHOR_SPLIT, "cheap").q >= 0.9 * row(ANCHOR_SPLIT, "leader").q);
  // Measured against the max-q anchor, `cheap` is out and the pick is `leader`.
  assert.equal(w.modelRoles.default, "openrouter/org/leader:auto");
});

test("equal-price equal-quality candidates tie-break on model.id ascending", async () => {
  // `zzz` precedes `aaa` in the ranking (the engine's sort is stable), so only
  // the id tie-break can make `aaa` the pick.
  const twins = [makeModel("anchor", 90, 20, 100), makeModel("zzz", 80, 1, 100), makeModel("aaa", 80, 1, 100)];
  const w = await runWrite(twins, onlyDefault({ selection: "cheapest" }));
  assert.equal(row(twins, "aaa").priceEff, row(twins, "zzz").priceEff);
  assert.equal(row(twins, "aaa").q, row(twins, "zzz").q);
  assert.equal(w.modelRoles.default, "openrouter/org/aaa:auto");
});

test("qualityFloor 0 selects the cheapest usable candidate and 1 selects the anchor", async () => {
  const off = await runWrite(UNDER_BAR, onlyDefault({ selection: "cheapest", qualityFloor: 0 }));
  assert.equal(off.modelRoles.default, "openrouter/org/weak:auto");
  const tight = await runWrite(UNDER_BAR, onlyDefault({ selection: "cheapest", qualityFloor: 1 }));
  assert.equal(tight.modelRoles.default, "openrouter/org/premium:auto");
});

test("a key-blocked cheap candidate is never selected", async () => {
  const settings = onlyDefault({ selection: "cheapest", qualityFloor: 0 });
  const blocked = await runWrite(UNDER_BAR, settings, {
    getKeyAvailability: async () => availability(["weak"], ["premium", "budget"]),
  });
  // Premise: `weak` is the cheapest usable candidate when the key can run it.
  const control = await runWrite(UNDER_BAR, settings);
  assert.equal(control.modelRoles.default, "openrouter/org/weak:auto");
  assert.equal(blocked.modelRoles.default, "openrouter/org/budget:auto");
  assert.equal(decision(blocked).keyBlockedCount, 1);
});

test("a probe-blocked pick falls through to the next-cheapest bar-clearing candidate", async () => {
  const w = await runWrite(TWENTY_X, onlyDefault({ selection: "cheapest" }), {
    probeModel: async (_token: string, catalogId: string): Promise<ProbeVerdict> => (catalogId === "org/budget" ? "blocked" : "ok"),
  });
  // `budget` is the cheapest good candidate but the probe rejects it. The bar is
  // fixed, so the next-cheapest good candidate (`mid3`, $17/M) is picked.
  assert.equal(w.modelRoles.default, "openrouter/org/mid3:auto");
});

test("a role whose every bar-clearing candidate is probe-blocked is left untouched", async () => {
  const w = await runWrite(UNDER_BAR, onlyDefault({ selection: "cheapest" }), {
    probeModel: async (_token: string, catalogId: string): Promise<ProbeVerdict> => (catalogId === "org/weak" ? "ok" : "blocked"),
  });
  assert.equal(w.result.decisions.length, 0);
  assert.equal(w.modelRoles.default, undefined);
});

test("the fallback chain is byte-identical with the mode on and off", async () => {
  const off = await runWrite(LEADER_IS_CHEAPEST, onlyDefault({ selection: "value" }));
  const on = await runWrite(LEADER_IS_CHEAPEST, onlyDefault({ selection: "cheapest" }));
  // The value leader is the cheapest bar-clearing candidate, so the rule cannot
  // move the pick — the whole document must be unchanged.
  assert.equal(off.modelRoles.default, "openrouter/org/cheap-best:auto");
  assert.equal(on.text, off.text);
  assert.deepEqual(on.chains, off.chains);
  assert.deepEqual(on.chains["openrouter/org/cheap-best"], ["openrouter/org/pricier:auto", "openrouter/org/pricier2:auto"]);
});

test("a locked role is untouched", async () => {
  const w = await runWrite(TWENTY_X, onlyDefault({ selection: "cheapest", roles: { default: { locked: true } } }), {}, 'modelRoles:\n  default: "openrouter/org/keepme"\n');
  assert.equal(w.result.decisions.length, 0);
  assert.equal(w.modelRoles.default, "openrouter/org/keepme");
});

test("a manual providerPin keeps its hard-gate meaning in cheapest mode", async () => {
  const pinned = onlyDefault({ selection: "cheapest", roles: { default: { providerPin: "mid" } } });
  const w = await runWrite(PINNED, pinned);
  // The rule picks within the pinned pool and the pin rides the selector: the
  // cheapest bar-clearing pin-eligible model, never the value leader.
  assert.equal(w.modelRoles.default, "openrouter/org/model-b@mid:auto");
  const value = await runWrite(PINNED, onlyDefault({ roles: { default: { providerPin: "mid" } } }));
  assert.equal(value.modelRoles.default, "openrouter/org/model-a@mid:auto");
});

test("two runs on the same data write the same selector", async () => {
  const dir = setupAgentDir("other: 1\n");
  const settings = onlyDefault({ selection: "cheapest" });
  const first = await runInTempDir(dir, () => runUpdater("manual", fakeDeps(TWENTY_X, settings), { force: true }));
  const second = await runInTempDir(dir, () => runUpdater("manual", fakeDeps(TWENTY_X, settings), { force: true }));
  const doc = parseYaml(readFileSync(join(dir, "config.yml"), "utf8")) as { modelRoles?: Record<string, string> };
  assert.equal(doc.modelRoles?.default, "openrouter/org/budget:auto");
  assert.equal(first.decisions.find((d) => d.role === "default")?.to, second.decisions.find((d) => d.role === "default")?.to);
  assert.equal(second.decisions.find((d) => d.role === "default")?.reason, "kept-eligible");
});

// --- the pure rule itself (the seam ticket #107 consumes) -------------------
// The integration fixtures above never create a price tie, so the tie-break and
// the pool contract are pinned here directly.

/** A `Ranked` row carrying only the fields `barSelection` reads. */
function rankedRow(id: string, q: number, priceEff: number): Ranked {
  return { model: makeModel(id, 0, priceEff, 100), value: q - priceEff, q, priceEff, parts: {} };
}

test("barSelection: an empty pool has no selection", () => {
  assert.equal(barSelection([], 0.9), null);
});

test("barSelection: the anchor is the max-q row, not the first", () => {
  const sel = barSelection([rankedRow("leader", 1.0, 1), rankedRow("anchor", 1.4, 100)], 0.9);
  assert.ok(sel);
  assert.equal(sel.anchor.model.id, "anchor");
  assert.equal(sel.bar, 0.9 * 1.4);
});

test("barSelection: good keeps the pool's rank order", () => {
  const sel = barSelection([rankedRow("a", 1.4, 100), rankedRow("b", 1.0, 1), rankedRow("c", 1.3, 50)], 0.7);
  assert.ok(sel);
  assert.deepEqual(sel.good.map((r) => r.model.id), ["a", "b", "c"]);
  assert.equal(sel.pick.model.id, "b");
});

test("barSelection: ties break on higher q, then model.id ascending", () => {
  const anchor = rankedRow("anchor", 1.6, 100);
  // Equal price, different q: the higher-q row wins.
  assert.equal(barSelection([rankedRow("zzz", 1.5, 1), rankedRow("aaa", 1.4, 1), anchor], 0.8)?.pick.model.id, "zzz");
  // Equal price and q: the lower id wins, whatever the pool order.
  assert.equal(barSelection([rankedRow("zzz", 1.5, 1), rankedRow("aaa", 1.5, 1), anchor], 0.8)?.pick.model.id, "aaa");
});

test("barSelection: qualityFloor 0 admits every row and 1 admits only the anchor", () => {
  const pool = [rankedRow("anchor", 1.4, 100), rankedRow("cheap", 0.2, 1)];
  assert.deepEqual(barSelection(pool, 0)?.good.map((r) => r.model.id), ["anchor", "cheap"]);
  assert.deepEqual(barSelection(pool, 1)?.good.map((r) => r.model.id), ["anchor"]);
});

test("barSelection: never mutates the pool", () => {
  const pool = [rankedRow("a", 1.4, 100), rankedRow("b", 1.0, 1)];
  const before = pool.map((r) => ({ ...r }));
  barSelection(pool, 0.9);
  assert.deepEqual(pool, before);
});
