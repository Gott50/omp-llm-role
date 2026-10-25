import assert from "node:assert/strict";
import { test } from "node:test";
import type { KeyAvailability } from "../src/availability.ts";
import { rankRole, type Model, type OpenRouterEndpointRecord, type RankData } from "../src/engine.ts";
import { rankRows } from "../src/explorer/explain.ts";
import { asWrittenPool } from "../src/explorer/pool.ts";
import { DEFAULT_ROLES } from "../src/settings.ts";
import { runUpdater } from "../src/updater.ts";
import { fakeDeps, makeCatalog, makeModel, runInTempDir, setupAgentDir } from "./helpers.ts";

// The as-written pool (spec #81, ticket #84; keyed-catalog prune: spec #103,
// ticket #104): the explorer's dataset filtered exactly as the updater filters
// it before ranking — the catalog/tier gate (`filterCatalog` + `resolveVariant`),
// the allowed-providers whitelist prune (`providerAllowed`), and the
// keyed-catalog prune (`availability.active && blocked.has(id)`). Pure: the
// input RankData and its models are never mutated.

/** The inactive keyed catalog: `blocked` empty, so the pool is unchanged. */
const INACTIVE: KeyAvailability = {
  active: false,
  reason: "unavailable",
  allowed: new Set(),
  blocked: new Set(),
  publicCount: 0,
  keyedCount: 0,
  fetchedAt: "2026-10-17T00:00:00.000Z",
};

/** KeyAvailability fixture: `active` with the given ranking-id sets unless overridden. */
function availability(overrides: Partial<KeyAvailability> = {}): KeyAvailability {
  return { ...INACTIVE, active: true, reason: "active", ...overrides };
}

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
  const pool = asWrittenPool(rank, { catalog: makeCatalog(["kept"]), tier: "billed", allowed: null, availability: INACTIVE });
  assert.deepEqual(pool.models.map((m) => m.id), ["kept"]);
});

test("a model that resolves is kept", () => {
  const rank = rankData([routed("kept", ["p"])]);
  const pool = asWrittenPool(rank, { catalog: makeCatalog(["kept"]), tier: "billed", allowed: null, availability: INACTIVE });
  assert.deepEqual(pool.models.map((m) => m.id), ["kept"]);
});

test("a :free catalog entry is not tier-eligible on the billed tier but is on the free tier", () => {
  const rank = rankData([routed("freebie", ["p"])]);
  const billed = asWrittenPool(rank, { catalog: makeCatalog(["freebie:free"]), tier: "billed", allowed: null, availability: INACTIVE });
  assert.deepEqual(billed.models, []);
  const free = asWrittenPool(rank, { catalog: makeCatalog(["freebie:free"]), tier: "free", allowed: null, availability: INACTIVE });
  assert.deepEqual(free.models.map((m) => m.id), ["freebie"]);
});

test("a :batch catalog entry is never tier-eligible", () => {
  const rank = rankData([routed("batched", ["p"])]);
  const pool = asWrittenPool(rank, { catalog: makeCatalog(["batched:batch"]), tier: "billed", allowed: null, availability: INACTIVE });
  assert.deepEqual(pool.models, []);
});

test("tier none yields an empty pool", () => {
  const rank = rankData([routed("a", ["p"])]);
  const pool = asWrittenPool(rank, { catalog: makeCatalog(["a"]), tier: "none", allowed: null, availability: INACTIVE });
  assert.deepEqual(pool.models, []);
});

// --- allowed-providers prune -------------------------------------------------

test("with allowed !== null, each kept model's routes are pruned to allowed providers", () => {
  const rank = rankData([routed("a", ["cheap", "mid", "exp"])]);
  const pool = asWrittenPool(rank, { catalog: makeCatalog(["a"]), tier: "billed", allowed: new Set(["mid"]), availability: INACTIVE });
  assert.deepEqual(pool.models[0].routes?.map((r) => r.providerSlug), ["mid"]);
});

test("a bare whitelist entry matches a tiered route slug by prefix", () => {
  const rank = rankData([routed("a", ["coreweave/fp8", "other"])]);
  const pool = asWrittenPool(rank, { catalog: makeCatalog(["a"]), tier: "billed", allowed: new Set(["coreweave"]), availability: INACTIVE });
  assert.deepEqual(pool.models[0].routes?.map((r) => r.providerSlug), ["coreweave/fp8"]);
});

test("a model left with zero routes is still kept", () => {
  const rank = rankData([routed("a", ["blocked"])]);
  const pool = asWrittenPool(rank, { catalog: makeCatalog(["a"]), tier: "billed", allowed: new Set(["mid"]), availability: INACTIVE });
  assert.deepEqual(pool.models.map((m) => m.id), ["a"]);
  assert.deepEqual(pool.models[0].routes, []);
});

test("a model with no routes is kept route-less", () => {
  const rank = rankData([makeModel("a", 50, 1, 10)]);
  const pool = asWrittenPool(rank, { catalog: makeCatalog(["a"]), tier: "billed", allowed: new Set(["mid"]), availability: INACTIVE });
  assert.deepEqual(pool.models.map((m) => m.id), ["a"]);
  assert.equal(pool.models[0].routes, undefined);
});

test("with allowed === null, routes are untouched", () => {
  const rank = rankData([routed("a", ["cheap", "mid"])]);
  const pool = asWrittenPool(rank, { catalog: makeCatalog(["a"]), tier: "billed", allowed: null, availability: INACTIVE });
  assert.deepEqual(pool.models[0].routes?.map((r) => r.providerSlug), ["cheap", "mid"]);
});

// --- shape and purity --------------------------------------------------------

test("the fetch metadata is carried through unchanged", () => {
  const rank = rankData([routed("a", ["p"])]);
  const pool = asWrittenPool(rank, { catalog: makeCatalog(["a"]), tier: "billed", allowed: null, availability: INACTIVE });
  assert.equal(pool.fetchedAt, rank.fetchedAt);
  assert.equal(pool.source, rank.source);
  assert.equal(pool.orMatched, rank.orMatched);
  assert.equal(pool.orPriced, rank.orPriced);
});

test("the input RankData and its models are not mutated", () => {
  const rank = rankData([routed("a", ["cheap", "mid"]), routed("ghost", ["p"])]);
  const before = JSON.stringify(rank);
  const pool = asWrittenPool(rank, { catalog: makeCatalog(["a"]), tier: "billed", allowed: new Set(["mid"]), availability: INACTIVE });
  assert.equal(JSON.stringify(rank), before);
  assert.notEqual(pool, rank);
  assert.equal(rank.models.length, 2);
  assert.deepEqual(rank.models[0].routes?.map((r) => r.providerSlug), ["cheap", "mid"]);
});

// --- keyed-catalog prune (spec #103, ticket #104) ----------------------------

test("the as-written pool drops a model the keyed catalog blocks and keeps one it allows", () => {
  const rank = rankData([routed("kept", ["p"]), routed("blocked", ["p"])]);
  const pool = asWrittenPool(rank, {
    catalog: makeCatalog(["kept", "blocked"]),
    tier: "billed",
    allowed: null,
    availability: availability({ allowed: new Set(["kept"]), blocked: new Set(["blocked"]) }),
  });
  assert.deepEqual(pool.models.map((m) => m.id), ["kept"]);
});

test("a model in neither keyed-catalog set is kept (unknown is not blocked)", () => {
  const rank = rankData([routed("unknown", ["p"])]);
  const pool = asWrittenPool(rank, {
    catalog: makeCatalog(["unknown"]),
    tier: "billed",
    allowed: null,
    availability: availability({ allowed: new Set(["other"]), blocked: new Set(["blocked"]) }),
  });
  assert.deepEqual(pool.models.map((m) => m.id), ["unknown"]);
});

test("with the keyed catalog inactive the pool is unchanged", () => {
  const rank = rankData([routed("a", ["cheap", "mid"]), routed("b", ["p"])]);
  const inputs = { catalog: makeCatalog(["a", "b"]), tier: "billed" as const, allowed: new Set(["mid"]) };
  const today = asWrittenPool(rank, { ...inputs, availability: INACTIVE });
  // A non-empty `blocked` set on an inactive record must not prune: the updater
  // gates on `availability.active`, and so must the pool.
  const inactiveWithBlocked = asWrittenPool(rank, { ...inputs, availability: { ...INACTIVE, blocked: new Set(["b"]) } });
  assert.deepEqual(inactiveWithBlocked.models, today.models);
  // ...and "today" is the two-filter result: both models kept, `a`'s routes pruned.
  assert.deepEqual(today.models.map((m) => m.id), ["a", "b"]);
  assert.deepEqual(today.models[0].routes?.map((r) => r.providerSlug), ["mid"]);
});

test("the raw path is untouched: every row is kept and the overlay still marks key-blocked rows", () => {
  const rank = rankData([routed("kept", ["p"]), routed("blocked", ["p"])]);
  const avail = availability({ allowed: new Set(["kept"]), blocked: new Set(["blocked"]) });
  // Raw mode ranks `rank` itself (server.ts `poolRank`), so the key-blocked row
  // survives and the `key` column carries the diagnostic.
  const rows = rankRows(DEFAULT_ROLES.default, rank.models, [], avail);
  assert.deepEqual(rows.map((r) => r.id).sort(), ["blocked", "kept"]);
  assert.equal(rows.find((r) => r.id === "blocked")?.key, "blocked");
  assert.equal(rows.find((r) => r.id === "kept")?.key, "usable");
  // The as-written pool on the same inputs is where the prune happens.
  const pool = asWrittenPool(rank, { catalog: makeCatalog(["kept", "blocked"]), tier: "billed", allowed: null, availability: avail });
  assert.deepEqual(pool.models.map((m) => m.id), ["kept"]);
});

test("the as-written leader is the model the updater picks when the value leader is key-blocked", async () => {
  const models = [makeModel("model-a", 90, 1, 100), makeModel("model-b", 80, 5, 60), makeModel("model-c", 70, 10, 30)];
  const avail = availability({ allowed: new Set(["model-b", "model-c"]), blocked: new Set(["model-a"]), publicCount: 3, keyedCount: 2 });
  const rank = rankData(models);
  // model-a is the raw value leader; the keyed prune removes it.
  assert.equal(rankRole(DEFAULT_ROLES.default, rank.models)[0].model.id, "model-a");
  const pool = asWrittenPool(rank, { catalog: makeCatalog(models.map((m) => m.id)), tier: "billed", allowed: null, availability: avail });
  const leader = rankRole(DEFAULT_ROLES.default, pool.models)[0];
  assert.equal(leader.model.id, "model-b");

  const dir = setupAgentDir("other: 1\n");
  const deps = fakeDeps(models, {}, { getKeyAvailability: async () => avail });
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true, dryRun: true }));
  const d = result.decisions.find((x) => x.role === "default");
  assert.ok(d);
  assert.equal(d.to, `openrouter/org/${leader.model.id}:auto`);
});
