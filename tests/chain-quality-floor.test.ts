import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { parse as parseYaml } from "yaml";
import type { KeyAvailability } from "../src/availability.ts";
import type { Model, OpenRouterEndpointRecord } from "../src/engine.ts";
import { runUpdater, type Deps, type RunResult } from "../src/updater.ts";
import { fakeDeps, makeModel, runInTempDir, setupAgentDir } from "./helpers.ts";

// Spec #95: the fallback chain's fallback *models* come from the role's whole
// ranked candidate list — cheaper-or-equal-to-the-chosen first, with a quality
// floor relative to the chosen model's own `q`, then the pricier candidates,
// truncated to `fallbackChainDepth`. Every assertion here is external behaviour:
// the `retry.fallbackChains` a full `runUpdater` run writes. No test asserts a
// probe count or an internal helper.

/** Every shipped role except `default` opted out, so one chain key is written
 * and a test's chain assertion cannot be perturbed by another role's claim. */
const ONLY_DEFAULT = Object.fromEntries(
  ["smol", "slow", "vision", "plan", "commit", "tiny", "task", "advisor", "designer"].map((r) => [r, { enabled: false }]),
);

function onlyDefault(extra: Record<string, unknown> = {}): Record<string, unknown> {
  const { roles, ...rest } = extra;
  return { ...rest, roles: { ...ONLY_DEFAULT, ...(roles as Record<string, unknown> | undefined) } };
}

/** A model whose routes are `slugs`, each priced at the model's own price plus
 * its position, so the price ladder the ranking sees under a pin (or the
 * auto-pin) matches the model's declared price instead of collapsing to one. */
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

/** One full updater pass over `models`; returns the written document, its raw
 * text, and the run result. */
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

// The `default` role on `makeModel`'s uniform metrics: q(general 90) = 1.3529,
// q(88) = 1.3287, q(86) = 1.3045, q(80) = 1.2319 (1.2319 ≥ 0.9·1.3529 = 1.2176,
// so general 80 clears the shipped floor and general 40 does not).

// Fixture: a cheap primary, a pricier rank 2/3, and a rank-4 candidate that is
// cheaper-or-equal and clears the floor. The probe walk stops after the top
// three, so the rank-4 model is unprobed — it enters the chain only because the
// chain's model set comes from the ranked candidate list (scenario 1).
const CHEAP_PRIMARY = [
  makeModel("chosen", 90, 2, 100),
  makeModel("p2", 88, 3, 100),
  makeModel("p3", 86, 4, 100),
  makeModel("cheap4", 80, 1, 100),
];

test("scenario 1: a cheaper rank-4 candidate that clears the floor becomes the first fallback", async () => {
  const { chains, modelRoles } = await runWrite(CHEAP_PRIMARY, onlyDefault());
  assert.equal(modelRoles.default, "openrouter/org/chosen:auto");
  // The rank-4 `cheap4` ($1 ≤ $2, q 1.2319 ≥ 0.9·chosen) leads; the pricier
  // next-best `p2` fills the remaining depth. The probe window alone would have
  // written [p2, p3].
  assert.deepEqual(chains["openrouter/org/chosen"], ["openrouter/org/cheap4:auto", "openrouter/org/p2:auto"]);
});

// Fixture: the `default` role's measured shape — a cheap primary whose only
// cheaper-or-equal candidates are far below the floor, so the chain keeps the
// next-best-by-value models (scenario 2, pinned as a regression).
const SUB_FLOOR_CHEAP = [
  makeModel("chosen", 90, 1, 100),
  makeModel("p2", 85, 2, 100),
  makeModel("p3", 80, 3, 100),
  makeModel("weak4", 40, 0.5, 100),
  makeModel("weak5", 30, 0.4, 100),
];

test("scenario 2: a cheap primary with only sub-floor cheaper candidates keeps the next-best-by-value models", async () => {
  const { chains } = await runWrite(SUB_FLOOR_CHEAP, onlyDefault());
  assert.deepEqual(chains["openrouter/org/chosen"], ["openrouter/org/p2:auto", "openrouter/org/p3:auto"]);
  assert.ok(!(chains["openrouter/org/chosen"] ?? []).some((v) => v.includes("weak")), "a sub-floor cheap model must not be chained");
});

test("scenario 3: fallbackQualityFloor 0 admits any cheaper-or-equal candidate", async () => {
  const { chains } = await runWrite(SUB_FLOOR_CHEAP, onlyDefault({ fallbackQualityFloor: 0 }));
  // The same fixture as scenario 2: with the floor off, the two cheap models the
  // floor excluded take the whole depth.
  assert.deepEqual(chains["openrouter/org/chosen"], ["openrouter/org/weak4:auto", "openrouter/org/weak5:auto"]);
});

// Fixture: an exactly-equal-quality twin (same q, same price, ranked below the
// chosen by the stable tie order) and `near` (q 1.3408 = 0.99·chosen, cheaper).
const TWIN_AND_NEAR = [
  makeModel("chosen", 90, 2, 100),
  makeModel("twin", 90, 2, 100),
  makeModel("near", 89, 1, 100),
  makeModel("p3", 88, 3, 100),
  makeModel("p4", 87, 4, 100),
];

test("scenario 4: fallbackQualityFloor 1 admits only an exactly-equal-quality cheaper-or-equal candidate", async () => {
  const exact = await runWrite(TWIN_AND_NEAR, onlyDefault({ fallbackQualityFloor: 1 }));
  // `twin` matches the chosen model's q exactly and is priced at or below it, so
  // it qualifies; `near` (0.99·chosen) does not, and the pricier `p3` fills the
  // remaining depth.
  assert.deepEqual(exact.chains["openrouter/org/chosen"], ["openrouter/org/twin:auto", "openrouter/org/p3:auto"]);
  const relaxed = await runWrite(TWIN_AND_NEAR, onlyDefault({ fallbackQualityFloor: 0.9 }));
  assert.deepEqual(relaxed.chains["openrouter/org/chosen"], ["openrouter/org/twin:auto", "openrouter/org/near:auto"]);
});

// The floor's literal formula leaves a gap: `cheaper` needs `priceEff <=
// chosen.priceEff` AND the floor, `pricier` needs strictly greater — so a
// candidate priced exactly at the chosen model's price with `q` below the floor
// lands in neither set and drops out of the chain. Pinned here so a later change
// of the pricier bucket to `>=` cannot silently alter the chains.
test("an equal-priced candidate below the floor is in neither set and is dropped", async () => {
  const models = [makeModel("chosen", 90, 2, 100), makeModel("weak", 40, 2, 100)];
  const { chains } = await runWrite(models, onlyDefault());
  assert.equal(chains["openrouter/org/chosen"], undefined);
});

// Fixture: rank 2 is cheaper-or-equal and clears the floor — the model the new
// rule reaches for first when the account's key can use it.
const KEY_BLOCKABLE = [makeModel("chosen", 90, 2, 100), makeModel("ghost", 89, 1, 100), makeModel("p3", 88, 3, 100)];

test("scenario 5: a key-blocked cheaper candidate never enters the chain", async () => {
  const blocked = await runWrite(KEY_BLOCKABLE, onlyDefault(), {
    getKeyAvailability: async () => availability(["ghost"], ["chosen", "p3"]),
  });
  assert.deepEqual(blocked.chains["openrouter/org/chosen"], ["openrouter/org/p3:auto"]);
  assert.doesNotMatch(blocked.text, /ghost/);
  // The same fixture with the key allowing `ghost` chains it first — so the
  // exclusion, not the ranking, is what kept `ghost` out above.
  const allowed = await runWrite(KEY_BLOCKABLE, onlyDefault(), {
    getKeyAvailability: async () => availability([], ["chosen", "ghost", "p3"]),
  });
  assert.deepEqual(allowed.chains["openrouter/org/chosen"], ["openrouter/org/ghost:auto", "openrouter/org/p3:auto"]);
});

test("scenario 6: the chain stops at fallbackChainDepth, keeping the cheaper set's value order", async () => {
  const models = [...CHEAP_PRIMARY, makeModel("cheap6", 80, 0.5, 100)];
  const depth2 = await runWrite(models, onlyDefault());
  // Two qualifying cheaper candidates (`cheap6` $0.5, `cheap4` $1, both q 1.2319)
  // in value order, and nothing more: the depth cap wins over the pricier `p2`.
  assert.deepEqual(depth2.chains["openrouter/org/chosen"], ["openrouter/org/cheap6:auto", "openrouter/org/cheap4:auto"]);
  const depth3 = await runWrite(models, onlyDefault({ fallbackChainDepth: 3 }));
  assert.deepEqual(depth3.chains["openrouter/org/chosen"], [
    "openrouter/org/cheap6:auto",
    "openrouter/org/cheap4:auto",
    "openrouter/org/p2:auto",
  ]);
});

// Fixture for the pinned paths: the models' routes carry the models' own prices,
// so every fallback below the primary is pricier and the floor cannot bite.
const PINNED_MODELS = [
  routed("model-a", 90, 1, 100, ["cheap", "mid", "exp"]),
  routed("model-b", 80, 5, 60, ["b1", "mid", "b3"]),
  routed("model-c", 70, 10, 30, ["c1", "mid", "c3"]),
];

test("scenario 7: the manual-pin path is unchanged", async () => {
  const { chains, modelRoles } = await runWrite(PINNED_MODELS, onlyDefault({ roles: { default: { providerPin: "mid" } } }));
  assert.equal(modelRoles.default, "openrouter/org/model-a@mid:auto");
  // One entry per fallback model, every value carrying the manual pin.
  assert.deepEqual(chains["openrouter/org/model-a@mid"], ["openrouter/org/model-b@mid:auto", "openrouter/org/model-c@mid:auto"]);
});

test("scenario 8: the auto-pin chain shape is unchanged", async () => {
  const { chains, modelRoles } = await runWrite(PINNED_MODELS, onlyDefault({ roles: { default: { preferOwnProvider: true } } }));
  assert.equal(modelRoles.default, "openrouter/org/model-a@cheap:auto");
  // The primary's other routes first (the pin excluded by slug), then each
  // fallback model's gate-passing routes in the role's route order.
  assert.deepEqual(chains["openrouter/org/model-a@cheap"], [
    "openrouter/org/model-a@mid:auto",
    "openrouter/org/model-a@exp:auto",
    "openrouter/org/model-b@b1:auto",
    "openrouter/org/model-b@mid:auto",
    "openrouter/org/model-b@b3:auto",
    "openrouter/org/model-c@c1:auto",
    "openrouter/org/model-c@mid:auto",
    "openrouter/org/model-c@c3:auto",
  ]);
});

test("scenario 9: an out-of-range fallbackQualityFloor is a settings error and writes nothing", async () => {
  const notified: string[] = [];
  const run = await runWrite(CHEAP_PRIMARY, onlyDefault({ fallbackQualityFloor: 1.5 }), {
    notify: (lines) => notified.push(...lines),
  });
  assert.equal(run.result.aborted, "omp-llm-role settings invalid, no write:");
  assert.equal(run.result.wrote, false);
  assert.ok(notified.some((l) => l.includes("fallbackQualityFloor: must be a number in [0, 1], got 1.5")));
  assert.equal(run.text, "other: 1\n");
  assert.equal(run.chains["openrouter/org/chosen"], undefined);
});

// Fixture: `kept` is the current selector and the value leader is within the
// switch margin, so the run keeps `kept` (kept-margin). Below `kept`: `cheaper`
// (cheaper, clears the shipped floor), `pricier` ($3), `weak` (sub-floor cheap).
const KEPT_ROLE = [
  makeModel("challenger", 91, 1, 100),
  makeModel("kept", 90, 2, 100),
  makeModel("pricier", 88, 3, 100),
  makeModel("cheaper", 82, 1, 100),
  makeModel("weak", 40, 0.5, 100),
];
const KEPT_CONFIG = 'modelRoles:\n  default: "openrouter/org/kept"\n';

test("scenario 10: a kept role's chain is built from the kept model's quality and the candidates below it", async () => {
  const settings = onlyDefault({ switchMargin: 0.6, priceSwitchFraction: 0 });
  const kept = await runWrite(KEPT_ROLE, settings, {}, KEPT_CONFIG);
  const decision = kept.result.decisions.find((d) => d.role === "default");
  assert.equal(decision?.reason, "kept-margin");
  assert.equal(decision?.to, "openrouter/org/kept:auto");
  // The floor reads `kept`'s q (the challenger above it is never chained):
  // `cheaper` (q 1.2561 ≥ 0.9·1.3529) qualifies, `weak` (0.7477) does not.
  assert.deepEqual(kept.chains["openrouter/org/kept"], ["openrouter/org/cheaper:auto", "openrouter/org/pricier:auto"]);
  // A tighter floor drops `cheaper` from the chain without touching the selector
  // or the decision reason.
  const tighter = await runWrite(KEPT_ROLE, onlyDefault({ switchMargin: 0.6, priceSwitchFraction: 0, fallbackQualityFloor: 0.95 }), {}, KEPT_CONFIG);
  const tighterDecision = tighter.result.decisions.find((d) => d.role === "default");
  assert.equal(tighterDecision?.reason, "kept-margin");
  assert.equal(tighterDecision?.to, "openrouter/org/kept:auto");
  assert.deepEqual(tighter.chains["openrouter/org/kept"], ["openrouter/org/pricier:auto"]);
});
