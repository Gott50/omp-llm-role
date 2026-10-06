import assert from "node:assert/strict";
import { test } from "node:test";
import { buildOpenRouterEnrichment, type OpenRouterEndpointRecord } from "../src/engine.ts";

// The find payload carries one traffic-getting route per model; the pages carry
// every provider route. Fixtures below exercise the price-based load balancing
// blend (P(route) ∝ 1/price²) and the single-route fallback.

type FindEndpoint = { id: string; model_variant_permaslug: string | null; is_free: boolean | null; status: number | null };

function makeFind(id: string, price: number | null, tput: number | null, over: Partial<FindEndpoint> = {}) {
  const endpoint: FindEndpoint = { id, model_variant_permaslug: "org/m-1", is_free: false, status: 0, ...over };
  return {
    models: [{ slug: "org/m", supports_reasoning: false, endpoint }],
    endpoint_perf: tput === null ? {} : { [id]: { p50_latency: null, p50_throughput: tput } },
    endpoint_price: price === null ? {} : { [id]: price },
    endpoint_weight_price: price === null ? {} : { [id]: price },
  };
}

// `weightPrice` defaults to `price` so the fixtures below pin the billed-price
// regression: with the weight basis equal to the billed blend, the blend reduces
// to the pre-input-basis behaviour. Tests that exercise the input basis override it.
function makeRec(id: string, price: number, tput: number | null, over: Partial<OpenRouterEndpointRecord> = {}): OpenRouterEndpointRecord {
  const base: OpenRouterEndpointRecord = {
    id,
    providerSlug: `prov/${id}`,
    serviceTier: null,
    status: 0,
    free: false,
    variant: "org/m-1",
    price,
    weightPrice: price,
    tput,
    latency: null,
    contextLength: null,
    maxCompletionTokens: null,
    supportsTools: null,
  };
  return { ...base, ...over };
}

test("price and throughput are the 1/price²-weighted means over the page routes", () => {
  // $1 route (10 tok/s) and $2 route (40 tok/s): w = 1 and 0.25.
  const enrichment = buildOpenRouterEnrichment(makeFind("a", 1, 10), { "org/m": [makeRec("a", 1, 10), makeRec("b", 2, 40)] });
  assert.ok(enrichment.m);
  assert.ok(Math.abs(enrichment.m.price - 1.2) < 1e-9); // (1·1 + 0.25·2) / 1.25
  assert.ok(Math.abs(enrichment.m.tput - 16) < 1e-9); // (1·10 + 0.25·40) / 1.25
});

test("flex/priority tiers, degraded, free and :batch routes stay out of the blend", () => {
  const routes = [
    makeRec("flex", 0.5, 100, { serviceTier: "flex" }),
    makeRec("priority", 5, 200, { serviceTier: "priority" }),
    makeRec("degraded", 0.1, 5, { status: -2 }),
    makeRec("free", 0, 7, { free: true }),
    makeRec("batch", 0.2, 50, { variant: "org/m-1:batch" }),
    makeRec("a", 3, 30),
  ];
  const enrichment = buildOpenRouterEnrichment(makeFind("a", 3, 30), { "org/m": routes });
  assert.ok(enrichment.m);
  assert.equal(enrichment.m.price, 3); // the $0.10 degraded route must not dominate
  assert.equal(enrichment.m.tput, 30);
});

test("throughput renormalizes over the routes that have data", () => {
  const enrichment = buildOpenRouterEnrichment(makeFind("a", 1, null), { "org/m": [makeRec("a", 1, null), makeRec("b", 2, 40)] });
  assert.ok(enrichment.m);
  assert.ok(Math.abs(enrichment.m.price - 1.2) < 1e-9); // price still blends both routes
  assert.equal(enrichment.m.tput, 40); // only route b has throughput
});

test("a find-row endpoint missing from the page joins the blend", () => {
  const enrichment = buildOpenRouterEnrichment(makeFind("a", 1, 10), { "org/m": [makeRec("b", 2, 40)] });
  assert.ok(enrichment.m);
  assert.ok(Math.abs(enrichment.m.price - 1.2) < 1e-9);
  assert.ok(Math.abs(enrichment.m.tput - 16) < 1e-9);
});

test("without pages the find-route pool blends the same way — a :free variant never contributes", () => {
  const data = {
    models: [
      { slug: "org/m", supports_reasoning: false, endpoint: { id: "f", model_variant_permaslug: "org/m-1:free", is_free: true, status: 0 } },
      { slug: "org/m", supports_reasoning: false, endpoint: { id: "c", model_variant_permaslug: "org/m-1", is_free: false, status: 0 } },
    ],
    endpoint_perf: { f: { p50_latency: null, p50_throughput: 100 }, c: { p50_latency: null, p50_throughput: 10 } },
    endpoint_price: { f: 0, c: 3 },
    endpoint_weight_price: { f: 0, c: 3 },
  };
  const enrichment = buildOpenRouterEnrichment(data);
  assert.ok(enrichment.m);
  assert.ok(Math.abs(enrichment.m.tput - 10) < 1e-9); // the billed route's own p50, not the free tier's 100
  assert.ok(Math.abs(enrichment.m.price - 3) < 1e-9);
});

test("a :free tier still rescues a model whose billed routes have no throughput", () => {
  const data = {
    models: [
      { slug: "org/m", supports_reasoning: false, endpoint: { id: "f", model_variant_permaslug: "org/m-1:free", is_free: true, status: 0 } },
      { slug: "org/m", supports_reasoning: false, endpoint: { id: "c", model_variant_permaslug: "org/m-1", is_free: false, status: 0 } },
    ],
    endpoint_perf: { f: { p50_latency: null, p50_throughput: 100 } },
    endpoint_price: { f: 0, c: 3 },
    endpoint_weight_price: { f: 0, c: 3 },
  };
  const enrichment = buildOpenRouterEnrichment(data);
  assert.ok(enrichment.m);
  assert.equal(enrichment.m.tput, 100); // only the free tier carries traffic
  assert.equal(enrichment.m.price, 3); // but it never sets the price
});
test("a page whose eligible routes all lack throughput falls back to the find route", () => {
  // The page's copy of endpoint a wins the pool merge but has no stats, so the
  // blend is impossible; the find row's own p50 and price are used instead.
  const enrichment = buildOpenRouterEnrichment(makeFind("a", 2, 10), { "org/m": [makeRec("a", 1, null)] });
  assert.ok(enrichment.m);
  assert.equal(enrichment.m.tput, 10);
  assert.equal(enrichment.m.price, 2);
});

test("a model with no throughput anywhere is not enriched", () => {
  const enrichment = buildOpenRouterEnrichment(makeFind("a", 2, null));
  assert.equal(enrichment.m, undefined);
});

// --- input-price weight basis (the router's sort key) -------------------------

test("the 1/price² weight follows the input price, not the billed blend", () => {
  // Two routes with the SAME billed 3:1 blend ($2/M) but different input prices
  // ($1 vs $2): the router sorts on the input price, so w = 1 and 0.25.
  const routes = [makeRec("a", 2, 10, { weightPrice: 1 }), makeRec("b", 2, 40, { weightPrice: 2 })];
  const enrichment = buildOpenRouterEnrichment(makeFind("a", 2, 10), { "org/m": routes });
  assert.ok(enrichment.m);
  // Throughput exposes the weight basis: (1·10 + 0.25·40) / 1.25 = 16, not the
  // equal-weight 25 the billed basis would give.
  assert.ok(Math.abs(enrichment.m.tput - 16) < 1e-9);
  // The reported price is the billed blend under that input-based distribution.
  assert.ok(Math.abs(enrichment.m.price - 2) < 1e-9);
});

test("the reported price is the billed blend, weighted by the input price", () => {
  // Billed $1 and $3, input $1 and $2: w = 1 and 0.25.
  const routes = [makeRec("a", 1, 10, { weightPrice: 1 }), makeRec("b", 3, 40, { weightPrice: 2 })];
  const enrichment = buildOpenRouterEnrichment(makeFind("a", 1, 10), { "org/m": routes });
  assert.ok(enrichment.m);
  assert.ok(Math.abs(enrichment.m.price - 1.4) < 1e-9); // (1·1 + 0.25·3) / 1.25
});

test("a route with no input price drops from the blend pool", () => {
  const routes = [makeRec("a", 1, 10, { weightPrice: 1 }), makeRec("b", 2, 40, { weightPrice: null })];
  const enrichment = buildOpenRouterEnrichment(makeFind("a", 1, 10), { "org/m": routes });
  assert.ok(enrichment.m);
  assert.equal(enrichment.m.price, 1); // route b cannot be scored by the router
  assert.equal(enrichment.m.tput, 10);
});

test("a find-only route carries its input price into the blend", () => {
  const data = {
    models: [
      { slug: "org/m", supports_reasoning: false, endpoint: { id: "a", model_variant_permaslug: "org/m-1", is_free: false, status: 0 } },
      { slug: "org/m", supports_reasoning: false, endpoint: { id: "b", model_variant_permaslug: "org/m-1", is_free: false, status: 0 } },
    ],
    endpoint_perf: { a: { p50_latency: null, p50_throughput: 10 }, b: { p50_latency: null, p50_throughput: 40 } },
    endpoint_price: { a: 2, b: 2 },
    endpoint_weight_price: { a: 1, b: 2 },
  };
  const enrichment = buildOpenRouterEnrichment(data);
  assert.ok(enrichment.m);
  assert.ok(Math.abs(enrichment.m.tput - 16) < 1e-9);
  assert.ok(Math.abs(enrichment.m.price - 2) < 1e-9);
});
