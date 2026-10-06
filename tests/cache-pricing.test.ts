import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  blendRoutePool,
  rankRole,
  readEndpointsCache,
  routeEffectivePrice,
  type OpenRouterEndpointRecord,
  type RoleDef,
} from "../src/engine.ts";
import { explainModel } from "../src/explorer/explain.ts";
import { mergeExport } from "../src/role-settings.ts";
import { resolveSettings } from "../src/settings.ts";
import { makeModel } from "./helpers.ts";

// Cache-read pricing (issue #30): a role declares an assumed cache-hit rate and
// its effective input price blends the endpoint's cache-read price with its full
// input price before the 3:1 billed blend and the thinking factor. With no rate
// set the ranking is byte-identical; the 1/price² weight basis stays the listed
// input price (the router's sort key), so a cheap cache on a lightly-weighted
// route cannot dominate.

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
    cacheReadPrice: null,
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

// Two routes: `a` is the cheap one both on the listed input ($1) and the cache
// read ($0.10); `b` lists $2 and reports no cache-read price. `m.price` is the
// uncached 1/price² blend over them — what `applyOpenRouterData` would set — so
// the cached and uncached runs are directly comparable.
function twoRouteModel() {
  const m = makeModel("m", 40, 5, 100);
  m.routes = [
    route({ id: "a", providerSlug: "a", price: 1, weightPrice: 1, cacheReadPrice: 0.1 }),
    route({ id: "b", providerSlug: "b", price: 2, weightPrice: 2, cacheReadPrice: null }),
  ];
  m.price = 1.2;
  m.metrics.price = 1.2;
  return m;
}

// --- per-route effective price ----------------------------------------------

test("routeEffectivePrice blends the cache-read price into the billed 3:1 price", () => {
  // effInput = 0.9·0.10 + 0.1·1 = 0.19; billed = 1 + 3·(0.19 − 1)/4 = 0.3925.
  assert.ok(Math.abs((routeEffectivePrice(route({ price: 1, weightPrice: 1, cacheReadPrice: 0.1 }), 0.9) as number) - 0.3925) < 1e-9);
});

test("a route without a cache-read price keeps its full input price", () => {
  const r = route({ price: 2, weightPrice: 2, cacheReadPrice: null });
  assert.equal(routeEffectivePrice(r, 0.9), 2);
});

test("hitRate 0 leaves every route at its listed billed price (byte-identical)", () => {
  const r = route({ price: 1.5, weightPrice: 1, cacheReadPrice: 0.1 });
  assert.equal(routeEffectivePrice(r, 0), 1.5);
});

// --- the blend ---------------------------------------------------------------

test("blendRoutePool weighs by the listed input price and blends the cache-adjusted billed price", () => {
  const routes = [
    route({ id: "a", price: 1, weightPrice: 1, cacheReadPrice: 0.1 }),
    route({ id: "b", price: 2, weightPrice: 2, cacheReadPrice: null }),
  ];
  // w = 1 and 0.25; (1·0.3925 + 0.25·2) / 1.25 = 0.714.
  const cached = blendRoutePool(routes, 0.9);
  assert.ok(Math.abs((cached.price as number) - 0.714) < 1e-9);
  // Without the hit rate the blend is the plain listed-price blend: 1.5/1.25 = 1.2.
  assert.ok(Math.abs((blendRoutePool(routes).price as number) - 1.2) < 1e-9);
});

// --- the role's priceEff -----------------------------------------------------

test("a declared hit rate prices the role below the uncached pool when the cache is cheaper", () => {
  const m = twoRouteModel();
  const cached = rankRole(roleWith({ cacheHitRate: 0.9 }), [m]);
  const uncached = rankRole(roleWith({ cacheHitRate: 0 }), [m]);
  assert.equal(cached.length, 1);
  assert.ok(Math.abs(cached[0].priceEff - 0.714) < 1e-9);
  assert.equal(uncached[0].priceEff, 1.2);
  assert.ok(cached[0].priceEff < uncached[0].priceEff);
});

test("an unset cacheHitRate leaves the ranking byte-identical to hitRate 0", () => {
  const m = twoRouteModel();
  const unset = rankRole(roleWith(), [m]);
  const zero = rankRole(roleWith({ cacheHitRate: 0 }), [m]);
  assert.deepEqual(unset, zero);
  assert.equal(unset[0].priceEff, m.price); // no cache adjustment: the model's own blend
  assert.equal(unset[0].priceEff, 1.2);
});

test("an endpoint filter and a hit rate compose: the pool is filtered, then cache-priced", () => {
  const m = makeModel("m", 40, 5, 100);
  m.routes = [
    route({ id: "a", price: 1, weightPrice: 1, cacheReadPrice: 0.1, supportsTools: true }),
    route({ id: "b", price: 2, weightPrice: 2, cacheReadPrice: null, supportsTools: false }),
  ];
  const ranked = rankRole(roleWith({ cacheHitRate: 0.9, filters: { tools: true } }), [m]);
  assert.equal(ranked.length, 1);
  assert.ok(Math.abs(ranked[0].priceEff - 0.3925) < 1e-9); // route b is filtered out
});

test("maxPriceUsdPerM caps the cache-adjusted priceEff", () => {
  const m = twoRouteModel();
  const capped = rankRole(roleWith({ cacheHitRate: 0.9, filters: { maxPriceUsdPerM: 0.5 } }), [m]);
  assert.equal(capped.length, 0); // 0.714 > 0.5
  const kept = rankRole(roleWith({ cacheHitRate: 0.9, filters: { maxPriceUsdPerM: 0.8 } }), [m]);
  assert.equal(kept.length, 1);
});

// --- the pinned route --------------------------------------------------------

test("a pinned role prices the route's cache-adjusted price", () => {
  const m = makeModel("m", 40, 5, 100);
  m.routes = [
    route({ id: "pin", providerSlug: "cerebras", price: 1, weightPrice: 1, cacheReadPrice: 0.1, tput: 42 }),
    route({ id: "other", providerSlug: "other", price: 9, weightPrice: 9 }),
  ];
  const ranked = rankRole(roleWith({ providerPin: "cerebras", cacheHitRate: 0.9 }), [m]);
  assert.equal(ranked.length, 1);
  assert.ok(Math.abs(ranked[0].priceEff - 0.3925) < 1e-9);
});

// --- explorer explanation ----------------------------------------------------

test("explainModel mirrors the cache-adjusted price and carries the rate", () => {
  const ex = explainModel(roleWith({ cacheHitRate: 0.9 }), [twoRouteModel()], "m");
  assert.equal(ex.eligible, true);
  if (!ex.eligible) return;
  assert.ok(Math.abs(ex.priceEff - 0.714) < 1e-9);
  assert.ok(Math.abs(ex.cost.billedPrice - 0.714) < 1e-9);
  assert.equal(ex.role.cacheHitRate, 0.9);
});

// --- validation --------------------------------------------------------------

test("resolveSettings accepts a cacheHitRate in [0, 1] and rejects one outside it", () => {
  const ok = resolveSettings({ "roles.default.cacheHitRate": 0.5 });
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.settings.roles.default.cacheHitRate, 0.5);

  for (const bad of [1.5, -0.1, Number.NaN, "0.5"]) {
    const { errors } = resolveSettings({ "roles.default.cacheHitRate": bad });
    assert.ok(
      errors.some((e) => e.includes("cacheHitRate must be a number in [0, 1]")),
      `expected a cacheHitRate error for ${JSON.stringify(bad)}`,
    );
  }
});

// --- persistence -------------------------------------------------------------

test("mergeExport persists cacheHitRate as a flat dotted key", () => {
  const merged = mergeExport({}, { default: roleWith({ cacheHitRate: 0.5 }) });
  assert.ok("lock" in merged);
  if (!("lock" in merged)) return;
  // mergeExport's lock contract (see role-settings.ts): a settings bag keyed by plugin id.
  const lock = merged.lock as { settings: { "omp-llm-role": Record<string, unknown> } };
  const plugin = lock.settings["omp-llm-role"];
  assert.equal(plugin["roles.default.cacheHitRate"], 0.5);
});

// --- cache shape guard -------------------------------------------------------

test("the endpoints cache is rejected when its records predate the cache-read price", () => {
  const dir = mkdtempSync(join(tmpdir(), "endpoints-cache-"));
  const path = join(dir, "openrouter-endpoints-fetched-data.json");
  // A record in the pre-#30 narrowed shape: every field the guard checks except cacheReadPrice.
  const legacy = {
    id: "e",
    providerSlug: "p",
    serviceTier: null,
    status: 0,
    free: false,
    variant: "",
    price: 1,
    weightPrice: 1,
    tput: null,
    latency: null,
    contextLength: null,
    maxCompletionTokens: null,
    supportsTools: null,
  };
  const write = (sample: object) =>
    writeFileSync(
      path,
      JSON.stringify({ fetchedAt: new Date().toISOString(), source: "t", slugCount: 1, slugs: { "a/b": [sample] } }),
    );

  write(legacy);
  assert.equal(readEndpointsCache(path, true), null, "a cache without cacheReadPrice must be rejected");

  write({ ...legacy, cacheReadPrice: 0.1 });
  assert.ok(readEndpointsCache(path, true), "a cache with cacheReadPrice must be accepted");
});
