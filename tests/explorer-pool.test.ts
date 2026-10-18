import assert from "node:assert/strict";
import { test } from "node:test";
import type { Model, OpenRouterEndpointRecord, RankData } from "../src/engine.ts";
import { asWrittenPool } from "../src/explorer/pool.ts";
import { makeCatalog, makeModel } from "./helpers.ts";

// The as-written pool (spec #81, ticket #84): the explorer's dataset filtered
// exactly as the updater filters it before ranking — the catalog/tier gate
// (`filterCatalog` + `resolveVariant`) and the allowed-providers whitelist
// prune (`providerAllowed`). Pure: the input RankData and its models are never
// mutated.

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

/** A model whose routes are `slugs`, in order. */
function routed(id: string, slugs: string[]): Model {
  const m = makeModel(id, 50, 1, 10);
  m.routes = slugs.map((slug) => route({ id: `${id}-${slug}`, providerSlug: slug }));
  return m;
}

function rankData(models: Model[]): RankData {
  return { models, fetchedAt: "2026-10-17T00:00:00.000Z", source: "cache", orMatched: 3, orPriced: 2 };
}

// --- catalog/tier gate -------------------------------------------------------

test("a model whose ranking id resolves to no tier-eligible catalog entry is dropped", () => {
  const rank = rankData([routed("kept", ["p"]), routed("ghost", ["p"])]);
  const pool = asWrittenPool(rank, { catalog: makeCatalog(["kept"]), tier: "billed", allowed: null });
  assert.deepEqual(pool.models.map((m) => m.id), ["kept"]);
});

test("a model that resolves is kept", () => {
  const rank = rankData([routed("kept", ["p"])]);
  const pool = asWrittenPool(rank, { catalog: makeCatalog(["kept"]), tier: "billed", allowed: null });
  assert.deepEqual(pool.models.map((m) => m.id), ["kept"]);
});

test("a :free catalog entry is not tier-eligible on the billed tier but is on the free tier", () => {
  const rank = rankData([routed("freebie", ["p"])]);
  const billed = asWrittenPool(rank, { catalog: makeCatalog(["freebie:free"]), tier: "billed", allowed: null });
  assert.deepEqual(billed.models, []);
  const free = asWrittenPool(rank, { catalog: makeCatalog(["freebie:free"]), tier: "free", allowed: null });
  assert.deepEqual(free.models.map((m) => m.id), ["freebie"]);
});

test("a :batch catalog entry is never tier-eligible", () => {
  const rank = rankData([routed("batched", ["p"])]);
  const pool = asWrittenPool(rank, { catalog: makeCatalog(["batched:batch"]), tier: "billed", allowed: null });
  assert.deepEqual(pool.models, []);
});

test("tier none yields an empty pool", () => {
  const rank = rankData([routed("a", ["p"])]);
  const pool = asWrittenPool(rank, { catalog: makeCatalog(["a"]), tier: "none", allowed: null });
  assert.deepEqual(pool.models, []);
});

// --- allowed-providers prune -------------------------------------------------

test("with allowed !== null, each kept model's routes are pruned to allowed providers", () => {
  const rank = rankData([routed("a", ["cheap", "mid", "exp"])]);
  const pool = asWrittenPool(rank, { catalog: makeCatalog(["a"]), tier: "billed", allowed: new Set(["mid"]) });
  assert.deepEqual(pool.models[0].routes?.map((r) => r.providerSlug), ["mid"]);
});

test("a bare whitelist entry matches a tiered route slug by prefix", () => {
  const rank = rankData([routed("a", ["coreweave/fp8", "other"])]);
  const pool = asWrittenPool(rank, { catalog: makeCatalog(["a"]), tier: "billed", allowed: new Set(["coreweave"]) });
  assert.deepEqual(pool.models[0].routes?.map((r) => r.providerSlug), ["coreweave/fp8"]);
});

test("a model left with zero routes is still kept", () => {
  const rank = rankData([routed("a", ["blocked"])]);
  const pool = asWrittenPool(rank, { catalog: makeCatalog(["a"]), tier: "billed", allowed: new Set(["mid"]) });
  assert.deepEqual(pool.models.map((m) => m.id), ["a"]);
  assert.deepEqual(pool.models[0].routes, []);
});

test("a model with no routes is kept route-less", () => {
  const rank = rankData([makeModel("a", 50, 1, 10)]);
  const pool = asWrittenPool(rank, { catalog: makeCatalog(["a"]), tier: "billed", allowed: new Set(["mid"]) });
  assert.deepEqual(pool.models.map((m) => m.id), ["a"]);
  assert.equal(pool.models[0].routes, undefined);
});

test("with allowed === null, routes are untouched", () => {
  const rank = rankData([routed("a", ["cheap", "mid"])]);
  const pool = asWrittenPool(rank, { catalog: makeCatalog(["a"]), tier: "billed", allowed: null });
  assert.deepEqual(pool.models[0].routes?.map((r) => r.providerSlug), ["cheap", "mid"]);
});

// --- shape and purity --------------------------------------------------------

test("the fetch metadata is carried through unchanged", () => {
  const rank = rankData([routed("a", ["p"])]);
  const pool = asWrittenPool(rank, { catalog: makeCatalog(["a"]), tier: "billed", allowed: null });
  assert.equal(pool.fetchedAt, rank.fetchedAt);
  assert.equal(pool.source, rank.source);
  assert.equal(pool.orMatched, rank.orMatched);
  assert.equal(pool.orPriced, rank.orPriced);
});

test("the input RankData and its models are not mutated", () => {
  const rank = rankData([routed("a", ["cheap", "mid"]), routed("ghost", ["p"])]);
  const before = JSON.stringify(rank);
  const pool = asWrittenPool(rank, { catalog: makeCatalog(["a"]), tier: "billed", allowed: new Set(["mid"]) });
  assert.equal(JSON.stringify(rank), before);
  assert.notEqual(pool, rank);
  assert.equal(rank.models.length, 2);
  assert.deepEqual(rank.models[0].routes?.map((r) => r.providerSlug), ["cheap", "mid"]);
});
