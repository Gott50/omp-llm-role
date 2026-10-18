import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { parse as parseYaml } from "yaml";
import {
  bestRoute,
  blendOutputPrice,
  cardinalMetric,
  providerPinDrops,
  rankRole,
  rankedRoutes,
  routeEffectivePrice,
  routeInputPrice,
  routeOutputPrice,
  thinkingPriceFactor,
  type OpenRouterEndpointRecord,
  type RoleDef,
} from "../src/engine.ts";
import { resolveSettings } from "../src/settings.ts";
import { explainModel } from "../src/explorer/explain.ts";
import { runUpdater } from "../src/updater.ts";
import { fakeDeps, makeCatalog, makeModel, runInTempDir, setupAgentDir } from "./helpers.ts";

// Route-aware pricing (issue #20): a role pinned to a provider (`providerPin`)
// is priced by that route — its billed price and p50 throughput — not the
// 1/price² blend. A model with no matching route is ineligible; an unpinned
// role ignores `routes` entirely.

function route(over: Partial<OpenRouterEndpointRecord> = {}): OpenRouterEndpointRecord {
  return {
    id: "r",
    providerSlug: "prov",
    serviceTier: null,
    status: 0,
    free: false,
    variant: "org/m-1",
    price: 1,
    weightPrice: 1,
    tput: 10,
    latency: null,
    contextLength: null,
    maxCompletionTokens: null,
    supportsTools: null,
    ...over,
  };
}

function roleWith(over: Partial<RoleDef> = {}): RoleDef {
  return { description: "t", weights: { general: 0.5, price: 0.5 }, required: ["general", "price"], ...over };
}

/** A role that weights throughput so `parts.throughput` is the cardinal transform
 * of the raw value (qW = 0.5, w = 0.5). */
function tputRole(over: Partial<RoleDef> = {}): RoleDef {
  return roleWith({ weights: { throughput: 0.5, price: 0.5 }, required: ["throughput", "price"], ...over });
}

// --- pricing -----------------------------------------------------------------

test("a pinned role prices the matching route, not the blend", () => {
  const m = makeModel("m", 40, 5, 100); // blend price 5
  m.routes = [route({ providerSlug: "cerebras", price: 2 }), route({ id: "r2", providerSlug: "other", price: 9 })];
  const ranked = rankRole(roleWith({ providerPin: "cerebras" }), [m]);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].priceEff, 2);
});

test("a pinned role's priceEff is the route price × the thinking factor", () => {
  const m = makeModel("m", 40, 5, 100, true);
  m.routes = [route({ providerSlug: "cerebras", price: 2 })];
  const ranked = rankRole(roleWith({ providerPin: "cerebras", thinking: "high" }), [m]);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].priceEff, 2 * thinkingPriceFactor("high"));
});

test("a tiered pin matches the route slug verbatim", () => {
  const m = makeModel("m", 40, 5, 100);
  m.routes = [route({ providerSlug: "deepinfra/fp8", price: 3 }), route({ id: "r2", providerSlug: "deepinfra", price: 7 })];
  const ranked = rankRole(roleWith({ providerPin: "deepinfra/fp8" }), [m]);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].priceEff, 3);
});

test("maxPriceUsdPerM caps the pinned route price", () => {
  const m = makeModel("m", 40, 5, 100);
  m.routes = [route({ providerSlug: "cerebras", price: 8 })];
  const def = roleWith({ providerPin: "cerebras", filters: { maxPriceUsdPerM: 5 } });
  assert.deepEqual(rankRole(def, [m]), []);
});

// --- throughput --------------------------------------------------------------

test("a pinned role's throughput is the route's p50", () => {
  const m = makeModel("m", 40, 5, 100); // blend throughput 100
  m.routes = [route({ providerSlug: "cerebras", tput: 42 })];
  const ranked = rankRole(tputRole({ providerPin: "cerebras" }), [m]);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].parts.throughput, cardinalMetric("throughput", 42));
});

test("a pinned route with no p50 falls back to the model's blended throughput", () => {
  const m = makeModel("m", 40, 5, 100);
  m.routes = [route({ providerSlug: "cerebras", tput: null })];
  const ranked = rankRole(tputRole({ providerPin: "cerebras" }), [m]);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].parts.throughput, cardinalMetric("throughput", 100));
});

// --- eligibility -------------------------------------------------------------

test("a model with no matching route is ineligible for a pinned role", () => {
  const m = makeModel("m", 40, 5, 100);
  m.routes = [route({ providerSlug: "other" })];
  const def = roleWith({ providerPin: "cerebras" });
  assert.deepEqual(rankRole(def, [m]), []);
  assert.deepEqual(providerPinDrops(def, [m]), ["m"]);
});

test("a model with no route data is ineligible for a pinned role", () => {
  const m = makeModel("m", 40, 5, 100); // routes undefined
  const def = roleWith({ providerPin: "cerebras" });
  assert.deepEqual(rankRole(def, [m]), []);
  assert.deepEqual(providerPinDrops(def, [m]), ["m"]);
});

test("providerPinDrops is empty for an unpinned role", () => {
  const m = makeModel("m", 40, 5, 100);
  m.routes = [route({ providerSlug: "other" })];
  assert.deepEqual(providerPinDrops(roleWith(), [m]), []);
});

// --- unpinned unchanged ------------------------------------------------------

test("an unpinned role ignores routes and keeps the blend", () => {
  const m = makeModel("m", 40, 5, 100);
  m.routes = [route({ providerSlug: "cerebras", price: 2, tput: 42 })];
  const ranked = rankRole(tputRole(), [m]);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].priceEff, 5); // blend, not the route's 2
  assert.equal(ranked[0].parts.throughput, cardinalMetric("throughput", 100)); // blend, not 42
});

// --- the route-price accessors (the 3:1 blend's one home) --------------------

test("routeInputPrice/routeEffectivePrice/routeOutputPrice are the billed blend and its inverse", () => {
  // A billed $1.75/M price with a $1/M input price is the 3:1 blend of a $4/M
  // output: (3·1 + 4)/4 = 1.75.
  const r = route({ price: 1.75, weightPrice: 1 });
  assert.equal(routeInputPrice(r), 1);
  assert.equal(routeEffectivePrice(r), 1.75);
  assert.equal(routeOutputPrice(r), 4);
  // A second, exact case: billed $2.5/M, input $0.5/M → output $8.5/M.
  assert.equal(routeOutputPrice(route({ price: 2.5, weightPrice: 0.5 })), 8.5);
  // The standalone inverse agrees with the route accessor.
  assert.equal(blendOutputPrice(2.5, 0.5), 8.5);
});

test("the route-price accessors carry the role's cache-hit rate into both terms", () => {
  // effInput = 0.5·0.1 + 0.5·1 = 0.55; billed = 1.75 + 3·(0.55 − 1)/4 = 1.4125;
  // the output term is unchanged at $4/M.
  const cached = route({ price: 1.75, weightPrice: 1, cacheReadPrice: 0.1 });
  assert.ok(Math.abs(routeInputPrice(cached, 0.5) - 0.55) < 1e-12);
  assert.ok(Math.abs(routeEffectivePrice(cached, 0.5) - 1.4125) < 1e-12);
  assert.ok(Math.abs(routeOutputPrice(cached, 0.5) - 4) < 1e-12);
  // A route with no cache-read price keeps its full input price: missing data is
  // not a silent discount.
  const noCache = route({ price: 1.75, weightPrice: 1, cacheReadPrice: null });
  assert.equal(routeInputPrice(noCache, 0.5), 1);
  assert.equal(routeEffectivePrice(noCache, 0.5), 1.75);
  assert.equal(routeOutputPrice(noCache, 0.5), 4);
});

test("the route-price accessors report missing data as null, never a price", () => {
  // No input price: the billed price stands, the input/output prices are unknown.
  const noInput = route({ price: 1.75, weightPrice: null });
  assert.equal(routeInputPrice(noInput), null);
  assert.equal(routeOutputPrice(noInput), null);
  assert.equal(routeEffectivePrice(noInput), 1.75);
  // No billed price: the input price is still known, the billed/output ones are not.
  const noBilled = route({ price: null, weightPrice: 1 });
  assert.equal(routeInputPrice(noBilled), 1);
  assert.equal(routeEffectivePrice(noBilled), null);
  assert.equal(routeOutputPrice(noBilled), null);
});

// --- best-route preference (issue #40, re-based by #58) ----------------------
// `preferOwnProvider` is a SOFT preference: a model is priced on its best route
// by the role's own value where one exists, else on the 1/price² blend. It never
// changes eligibility (unlike the hard `providerPin`).

test("bestRoute picks the value-max route under a throughput-weighted role", () => {
  const m = makeModel("m", 40, 5, 100);
  m.routes = [
    route({ providerSlug: "slow-cheap", price: 1, tput: 20 }),
    route({ id: "r2", providerSlug: "fast-pricey", price: 4, tput: 300 }),
  ];
  // vfm = wT·tNorm − wP·pNorm over the two-route set (tNorm/pNorm are 0/1 at the
  // extremes). tputRole(0.7/0.3): slow-cheap 0; fast-pricey 0.7 − 0.3 = 0.4 ⇒ the
  // faster, pricier route wins on the score.
  assert.equal(bestRoute(m, tputRole({ weights: { throughput: 0.7, price: 0.3 } }))?.providerSlug, "fast-pricey");
  // A price-heavy role flips the choice to the cheaper route (0.1 − 0.9 = −0.8).
  const priceHeavy = roleWith({ weights: { throughput: 0.1, price: 0.9 }, required: ["throughput", "price"] });
  assert.equal(bestRoute(m, priceHeavy)?.providerSlug, "slow-cheap");
});

test("bestRoute breaks equal-value ties by providerSlug then id", () => {
  const m = makeModel("m", 40, 5, 100);
  m.routes = [
    route({ id: "r1", providerSlug: "b", price: 2, tput: 50 }),
    route({ id: "r2", providerSlug: "a", price: 2, tput: 50 }),
  ];
  assert.equal(bestRoute(m, tputRole())?.providerSlug, "a");
  const sameSlug = makeModel("m2", 40, 5, 100);
  sameSlug.routes = [
    route({ id: "z", providerSlug: "a", price: 2, tput: 50 }),
    route({ id: "a", providerSlug: "a", price: 2, tput: 50 }),
  ];
  assert.equal(bestRoute(sameSlug, tputRole())?.id, "a");
});

test("rankedRoutes excludes a route over the role's maxPriceUsdPerM cap", () => {
  const m = makeModel("m", 40, 5, 100);
  m.routes = [route({ providerSlug: "cheap", price: 1 }), route({ id: "r2", providerSlug: "pricey", price: 5 })];
  const def = roleWith({ filters: { maxPriceUsdPerM: 3 } });
  assert.deepEqual(rankedRoutes(m, def).map((r) => r.providerSlug), ["cheap"]);
  assert.equal(bestRoute(m, def)?.providerSlug, "cheap");
});

test("rankedRoutes excludes a degraded route", () => {
  const m = makeModel("m", 40, 5, 100);
  m.routes = [route({ providerSlug: "down", status: 1, price: 1 }), route({ id: "r2", providerSlug: "up", price: 2 })];
  assert.deepEqual(rankedRoutes(m, roleWith()).map((r) => r.providerSlug), ["up"]);
});

test("rankedRoutes excludes an unpriced route", () => {
  const m = makeModel("m", 40, 5, 100);
  m.routes = [route({ providerSlug: "unpriced", price: null }), route({ id: "r2", providerSlug: "priced", price: 2 })];
  assert.deepEqual(rankedRoutes(m, roleWith()).map((r) => r.providerSlug), ["priced"]);
});

test("rankedRoutes excludes a route failing the role's endpoint filters", () => {
  const m = makeModel("m", 40, 5, 100);
  m.routes = [route({ providerSlug: "no-tools", supportsTools: false }), route({ id: "r2", providerSlug: "tools", supportsTools: true })];
  const def = roleWith({ filters: { tools: true } });
  assert.deepEqual(rankedRoutes(m, def).map((r) => r.providerSlug), ["tools"]);
});

test("rankedRoutes orders by the vfm score: a throughput-heavy role picks a faster route than a price-heavy role", () => {
  const m = makeModel("m", 40, 5, 100);
  m.routes = [
    route({ id: "cheap-slow", providerSlug: "cheap-slow", price: 1, tput: 20 }),
    route({ id: "mid", providerSlug: "mid", price: 3, tput: 100 }),
    route({ id: "fast-pricey", providerSlug: "fast-pricey", price: 6, tput: 300 }),
  ];
  const tputHeavy = roleWith({ weights: { throughput: 0.8, price: 0.2 }, required: ["throughput", "price"] });
  const priceHeavy = roleWith({ weights: { throughput: 0.2, price: 0.8 }, required: ["throughput", "price"] });
  // Same candidate set, opposite weights ⇒ opposite pick.
  assert.equal(bestRoute(m, tputHeavy)?.providerSlug, "fast-pricey");
  assert.equal(bestRoute(m, priceHeavy)?.providerSlug, "cheap-slow");
  // The full order is the score order (desc), not the price order.
  assert.deepEqual(rankedRoutes(m, tputHeavy).map((r) => r.providerSlug), ["fast-pricey", "mid", "cheap-slow"]);
  assert.deepEqual(rankedRoutes(m, priceHeavy).map((r) => r.providerSlug), ["cheap-slow", "mid", "fast-pricey"]);
});

test("the soft floor sorts a below-floor route last without dropping it", () => {
  const m = makeModel("m", 40, 5, 100);
  m.routes = [
    route({ id: "a-fast", providerSlug: "a-fast", price: 5, tput: 200 }),
    route({ id: "b-slow", providerSlug: "b-slow", price: 1, tput: 10 }),
  ];
  const priceHeavy = roleWith({ weights: { throughput: 0.2, price: 0.8 }, required: ["throughput", "price"] });
  // Without the floor the cheaper (slower) route wins on score.
  assert.deepEqual(rankedRoutes(m, priceHeavy).map((r) => r.providerSlug), ["b-slow", "a-fast"]);
  // With the floor the slow route is kept but sorted last.
  const floored = { ...priceHeavy, filters: { preferredMinThroughput: 50 } };
  assert.deepEqual(rankedRoutes(m, floored).map((r) => r.providerSlug), ["a-fast", "b-slow"]);
  assert.equal(rankedRoutes(m, floored).length, 2); // not dropped
  assert.equal(bestRoute(m, floored)?.providerSlug, "a-fast");
});

test("a route with no p50 uses the model's blended throughput for tNorm", () => {
  const m = makeModel("m", 40, 5, 100); // blended throughput 100
  m.routes = [
    route({ id: "z-null", providerSlug: "z-null", price: 1, tput: null }),
    route({ id: "a-slow", providerSlug: "a-slow", price: 1, tput: 10 }),
  ];
  const tputHeavy = roleWith({ weights: { throughput: 0.8, price: 0.2 }, required: ["throughput", "price"] });
  // z-null is treated as 100 tok/s (the blend), so it out-scores a-slow (10).
  assert.equal(bestRoute(m, tputHeavy)?.providerSlug, "z-null");
});

test("a route with no p50 uses the model's blended throughput for the floor check", () => {
  const m = makeModel("m", 40, 5, 100); // blended throughput 100
  m.routes = [
    route({ id: "z-null", providerSlug: "z-null", price: 1, tput: null }),
    route({ id: "a-fast", providerSlug: "a-fast", price: 5, tput: 200 }),
  ];
  const priceHeavy = roleWith({
    weights: { throughput: 0.2, price: 0.8 },
    required: ["throughput", "price"],
    filters: { preferredMinThroughput: 50 },
  });
  // z-null (blend 100) clears the floor, so the score decides: z-null (0) > a-fast (−0.6).
  assert.equal(bestRoute(m, priceHeavy)?.providerSlug, "z-null");
});

test("a route with no p50 falls back to the endpoint-filtered blend, not the raw model throughput", () => {
  const m = makeModel("m", 40, 5, 100); // raw model throughput 100
  m.routes = [
    route({ id: "z-null", providerSlug: "z-null", price: 1, tput: null }),
    route({ id: "a-slow", providerSlug: "a-slow", price: 1, tput: 10 }),
  ];
  // cacheHitRate > 0 forces the endpoint-filtered blend: the pool's only known
  // p50 is 10, so z-null is treated as 10 (not the raw 100) and both fall below
  // the floor — the slug tie-break then picks a-slow.
  const def = roleWith({
    weights: { throughput: 0.8, price: 0.2 },
    required: ["throughput", "price"],
    cacheHitRate: 0.9,
    filters: { preferredMinThroughput: 50 },
  });
  assert.equal(bestRoute(m, def)?.providerSlug, "a-slow");
});

test("an all-equal-throughput candidate set still orders by price (zero tSpan)", () => {
  const m = makeModel("m", 40, 5, 100);
  m.routes = [
    route({ id: "a-pricey", providerSlug: "a-pricey", price: 6, tput: 50 }),
    route({ id: "b-cheap", providerSlug: "b-cheap", price: 1, tput: 50 }),
  ];
  const tputHeavy = roleWith({ weights: { throughput: 0.8, price: 0.2 }, required: ["throughput", "price"] });
  // tSpan is 0, so tNorm is 0 for both and the score reduces to −wP·pNorm: the
  // cheaper route wins — no NaN, and the price ordering is not lost.
  assert.deepEqual(rankedRoutes(m, tputHeavy).map((r) => r.providerSlug), ["b-cheap", "a-pricey"]);
  assert.equal(bestRoute(m, tputHeavy)?.providerSlug, "b-cheap");
});

test("explainModel's autoPin is the score-max route", () => {
  const m = makeModel("m", 40, 5, 100);
  m.routes = [
    route({ id: "cheap-slow", providerSlug: "cheap-slow", price: 1, tput: 20 }),
    route({ id: "fast-pricey", providerSlug: "fast-pricey", price: 6, tput: 300 }),
  ];
  const tputHeavy = roleWith({ weights: { throughput: 0.8, price: 0.2 }, required: ["throughput", "price"], preferOwnProvider: true });
  const ex = explainModel(tputHeavy, [m], "m");
  assert.equal(ex.eligible, true);
  if (ex.eligible) assert.equal(ex.autoPin, "fast-pricey");
});

test("maxPriceUsdPerM gates the model's own price, not the soft best route", () => {
  // Review counterexample: blend 5 > cap 3, routes [cheap 2, pricey 9]. Off, the
  // blend is gated; on, the soft best route (cheap, 2) must NOT rescue the model —
  // the cap is basis-independent, so both counts are 0.
  const overCap = makeModel("overcap", 40, 5, 100);
  overCap.routes = [route({ providerSlug: "cheap", price: 2 }), route({ id: "r2", providerSlug: "pricey", price: 9 })];
  const def = roleWith({ filters: { maxPriceUsdPerM: 3 } });
  const off = rankRole(def, [overCap]);
  const on = rankRole({ ...def, preferOwnProvider: true }, [overCap]);
  assert.equal(off.length, 0);
  assert.equal(on.length, off.length);

  // Blend ≤ cap with an over-cap value-best route: eligible both on and off, and
  // the auto-pin route is under the cap.
  const underCap = makeModel("undercap", 40, 2, 100);
  underCap.routes = [route({ providerSlug: "cheap", price: 1, tput: 10 }), route({ id: "r2", providerSlug: "pricey", price: 9, tput: 1000 })];
  const tdef = tputRole({ filters: { maxPriceUsdPerM: 3 } });
  const off2 = rankRole(tdef, [underCap]);
  const on2 = rankRole({ ...tdef, preferOwnProvider: true }, [underCap]);
  assert.equal(off2.length, 1);
  assert.equal(on2.length, off2.length);
  const pin = bestRoute(underCap, { ...tdef, preferOwnProvider: true });
  assert.ok(pin);
  assert.ok(pin.price <= 3);
});

test("explainModel reports the maxPriceUsdPerM cap as an ineligibility reason", () => {
  const m = makeModel("m", 40, 5, 100);
  m.routes = [route({ providerSlug: "cheap", price: 2 })];
  const ex = explainModel(roleWith({ filters: { maxPriceUsdPerM: 3 } }), [m], "m");
  assert.equal(ex.eligible, false);
  if (!ex.eligible) assert.ok(ex.reasons.some((r) => r.includes("maxPriceUsdPerM")));
});

test("preferOwnProvider never changes the eligible count", () => {
  const withRoutes = makeModel("withroutes", 40, 5, 100);
  withRoutes.routes = [route({ providerSlug: "a", price: 2 }), route({ id: "r2", providerSlug: "b", price: 9 })];
  const noRoutes = makeModel("noroutes", 40, 5, 100); // routes undefined
  const degraded = makeModel("degraded", 40, 5, 100);
  degraded.routes = [route({ providerSlug: "d", status: 1, price: 2 })];
  const models = [withRoutes, noRoutes, degraded];
  const base = rankRole(roleWith(), models);
  const pref = rankRole(roleWith({ preferOwnProvider: true }), models);
  assert.equal(base.length, 3);
  assert.equal(pref.length, base.length);
  assert.deepEqual(
    pref.map((r) => r.model.id).sort(),
    base.map((r) => r.model.id).sort(),
  );
});

test("a model with no candidate route keeps the blended price under preferOwnProvider", () => {
  const m = makeModel("m", 40, 5, 100);
  m.routes = [route({ providerSlug: "d", status: 1, price: 2 })]; // degraded ⇒ no candidate
  const ranked = rankRole(roleWith({ preferOwnProvider: true }), [m]);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].priceEff, 5); // the model's blend price, unchanged
});

test("preferOwnProvider re-prices a model on its best route", () => {
  const m = makeModel("m", 40, 5, 100);
  m.routes = [route({ providerSlug: "cheap", price: 2 }), route({ id: "r2", providerSlug: "pricey", price: 9 })];
  const base = rankRole(roleWith(), [m]);
  const pref = rankRole(roleWith({ preferOwnProvider: true }), [m]);
  assert.equal(base[0].priceEff, 5);
  assert.equal(pref[0].priceEff, 2); // the best route, not the blend
  assert.ok(pref[0].value > base[0].value); // cheaper price ⇒ higher value
  assert.equal(pref[0].q, base[0].q); // quality is untouched
});

test("a hard providerPin wins over preferOwnProvider", () => {
  const m = makeModel("m", 40, 5, 100);
  m.orgId = "deepseek";
  m.org = "DeepSeek";
  m.routes = [route({ providerSlug: "deepseek", price: 2 }), route({ id: "r2", providerSlug: "cerebras", price: 7 })];
  const ranked = rankRole(roleWith({ providerPin: "cerebras", preferOwnProvider: true }), [m]);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].priceEff, 7); // the pin's route, not the soft best route
});

test("explainModel reports the soft best-route basis", () => {
  const m = makeModel("m", 40, 5, 100);
  m.routes = [route({ providerSlug: "cheap", price: 2 })];
  const ex = explainModel(roleWith({ preferOwnProvider: true }), [m], "m");
  assert.equal(ex.eligible, true);
  if (ex.eligible) {
    assert.equal(ex.ownProvider, true);
    assert.equal(ex.priceEff, 2);
    assert.equal(ex.cost.billedPrice, 2);
  }
  // Without the flag the model is priced on the blend and the basis is false.
  const blend = explainModel(roleWith(), [m], "m");
  assert.equal(blend.eligible, true);
  if (blend.eligible) {
    assert.equal(blend.ownProvider, false);
    assert.equal(blend.priceEff, 5);
  }
});

test("explainModel reports no soft basis when the model has no candidate route", () => {
  const m = makeModel("m", 40, 5, 100);
  m.routes = [route({ providerSlug: "d", status: 1, price: 3 })]; // degraded ⇒ no candidate
  const ex = explainModel(roleWith({ preferOwnProvider: true }), [m], "m");
  assert.equal(ex.eligible, true);
  if (ex.eligible) {
    assert.equal(ex.ownProvider, false);
    assert.equal(ex.priceEff, 5);
  }
});

test("explainModel reports a pinned model as not own-provider", () => {
  const m = makeModel("m", 40, 5, 100);
  m.orgId = "deepseek";
  m.org = "DeepSeek";
  m.routes = [route({ providerSlug: "deepseek", price: 2 })];
  const ex = explainModel(roleWith({ providerPin: "deepseek" }), [m], "m");
  assert.equal(ex.eligible, true);
  if (ex.eligible) assert.equal(ex.ownProvider, false);
});

// --- validation --------------------------------------------------------------

test("resolveSettings accepts a providerPin and rejects bad ones", () => {
  const ok = resolveSettings({ "roles.default.providerPin": "deepinfra/fp8" });
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.settings.roles.default.providerPin, "deepinfra/fp8");

  for (const bad of ["", "a@b", "a:b", 5]) {
    const { errors } = resolveSettings({ "roles.default.providerPin": bad });
    assert.ok(
      errors.some((e) => e.includes("providerPin must be a non-empty string")),
      `expected a providerPin error for ${JSON.stringify(bad)}`,
    );
  }
});

// --- explorer explanation ----------------------------------------------------

test("explainModel reports a pinned model with no matching route as ineligible", () => {
  const m = makeModel("m", 40, 5, 100);
  m.routes = [route({ providerSlug: "other" })];
  const ex = explainModel(roleWith({ providerPin: "cerebras" }), [m], "m");
  assert.equal(ex.eligible, false);
  if (!ex.eligible) assert.ok(ex.reasons.some((r) => r.includes("provider pin")));
});

test("explainModel prices a pinned model by its route", () => {
  const m = makeModel("m", 40, 5, 100);
  m.routes = [route({ providerSlug: "cerebras", price: 2, tput: 42 })];
  const ex = explainModel(tputRole({ providerPin: "cerebras" }), [m], "m");
  assert.equal(ex.eligible, true);
  if (ex.eligible) {
    assert.equal(ex.priceEff, 2);
    assert.equal(ex.cost.billedPrice, 2);
    const t = ex.contributions.find((c) => c.metric === "throughput");
    assert.ok(t);
    assert.equal(t.raw, 42);
  }
});

// --- decision recording ------------------------------------------------------

test("the updater records provider-pin drops on the decision", async () => {
  const pinned = makeModel("model-a", 90, 1, 100);
  pinned.routes = [route({ providerSlug: "cerebras" })];
  const unpinned = makeModel("model-b", 80, 1, 100);
  unpinned.routes = [route({ providerSlug: "other" })];
  const dir = setupAgentDir("other: 1\n");
  const deps = fakeDeps([pinned, unpinned], { "roles.default.providerPin": "cerebras" });
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true, dryRun: true }));
  const d = result.decisions.find((x) => x.role === "default");
  assert.ok(d);
  assert.equal(d.to, "openrouter/org/model-a@cerebras:auto");
  assert.deepEqual(d.pinBlocked, ["model-b"]);
});

// --- emission ----------------------------------------------------------------

test("a pinned role emits the @<slug> selector; chain key and values carry the pin", async () => {
  const a = makeModel("model-a", 90, 1, 100);
  a.routes = [route({ providerSlug: "cerebras" })];
  const b = makeModel("model-b", 80, 1, 100);
  b.routes = [route({ providerSlug: "cerebras" })];
  const dir = setupAgentDir("other: 1\n");
  const deps = fakeDeps([a, b], { "roles.default.providerPin": "cerebras" });
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  assert.equal(result.aborted, undefined);
  const doc = parseYaml(readFileSync(join(dir, "config.yml"), "utf8")) as {
    modelRoles: Record<string, string>;
    retry: { fallbackChains: Record<string, string[]> };
  };
  assert.equal(doc.modelRoles.default, "openrouter/org/model-a@cerebras:auto");
  // The chain key is level-free and pinned; every value carries the same pin.
  assert.deepEqual(doc.retry.fallbackChains["openrouter/org/model-a@cerebras"], ["openrouter/org/model-b@cerebras:auto"]);
});

test("a pinned current selector is visible to hysteresis", async () => {
  const a = makeModel("model-a", 90, 1, 100);
  a.routes = [route({ providerSlug: "cerebras" })];
  const b = makeModel("model-b", 80, 5, 60);
  b.routes = [route({ providerSlug: "cerebras" })];
  const dir = setupAgentDir('modelRoles:\n  default: "openrouter/org/model-b@cerebras:auto"\n');
  const deps = fakeDeps([a, b], { "roles.default.providerPin": "cerebras", switchMargin: 0.6, priceSwitchFraction: 0 });
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true, dryRun: true }));
  const d = result.decisions.find((x) => x.role === "default");
  assert.ok(d);
  // The pinned incumbent is recognized (not "no-current") and kept.
  assert.equal(d.reason, "kept-margin");
  assert.equal(d.to, "openrouter/org/model-b@cerebras:auto");
});

// --- no-match guard ----------------------------------------------------------

test("a pin matching no route leaves the role unchanged with a notify", async () => {
  const a = makeModel("model-a", 90, 1, 100);
  a.routes = [route({ providerSlug: "other" })];
  const dir = setupAgentDir("modelRoles:\n  default: openrouter/org/model-a\n");
  const notified: string[] = [];
  const deps = fakeDeps([a], { "roles.default.providerPin": "cerebras" }, { notify: (lines) => notified.push(...lines) });
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  assert.equal(result.aborted, undefined);
  assert.equal(result.decisions.some((d) => d.role === "default"), false);
  assert.ok(notified.some((l) => l.includes("default") && l.includes("cerebras") && l.includes("no route")));
  // No selector write: the existing line is byte-identical.
  const text = readFileSync(join(dir, "config.yml"), "utf8");
  assert.ok(text.includes("  default: openrouter/org/model-a\n"));
});

test("a pin matching no route preserves the role's existing chain", async () => {
  const a = makeModel("model-a", 90, 1, 100);
  a.routes = [route({ providerSlug: "other" })];
  const config = "modelRoles:\n  default: openrouter/org/model-a@cerebras\nretry:\n  fallbackChains:\n    openrouter/org/model-a@cerebras:\n      - openrouter/org/model-b@cerebras\n";
  const dir = setupAgentDir(config, {
    lastRunDay: null,
    managedRoles: ["default"],
    roleLastSelector: {},
    pluginWrittenChainKeys: ["openrouter/org/model-a@cerebras"],
    previousModelRoles: null,
  });
  const deps = fakeDeps([a], { "roles.default.providerPin": "cerebras" });
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  assert.equal(result.aborted, undefined);
  const doc = parseYaml(readFileSync(join(dir, "config.yml"), "utf8")) as { retry: { fallbackChains: Record<string, string[]> } };
  // The pinned chain key is referenced, not pruned.
  assert.deepEqual(doc.retry.fallbackChains["openrouter/org/model-a@cerebras"], ["openrouter/org/model-b@cerebras"]);
});
