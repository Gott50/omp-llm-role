import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyOpenRouterData,
  buildOpenRouterEnrichment,
  modelPassesEndpointFilters,
  narrowEndpointRecord,
  rankRole,
  routePassesEndpointFilters,
  type OpenRouterEndpointRecord,
  type RoleDef,
} from "../src/engine.ts";
import { explainModel } from "../src/explorer/explain.ts";
import { resolveSettings } from "../src/settings.ts";
import { runUpdater } from "../src/updater.ts";
import { fakeDeps, makeModel, runInTempDir, setupAgentDir } from "./helpers.ts";

// Per-endpoint capability ceilings (issue #18): the narrower reads
// context_length / max_completion_tokens / supported_parameters(tools), the
// endpoints cache carries them, and the role endpoint filters gate the route
// pool before ranking. A null field is kept (missing data is not a capability
// failure); a model with no capable route is ineligible.

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

function roleWith(filters: RoleDef["filters"]): RoleDef {
  return { description: "t", weights: { general: 0.5, price: 0.5 }, required: ["general", "price"], filters };
}

// --- the narrower ------------------------------------------------------------

test("the endpoint narrower reads context/output/tools; a missing field yields null", () => {
  const rec = narrowEndpointRecord({
    id: "e1",
    provider_slug: "prov",
    service_tier: null,
    status: 0,
    is_free: false,
    model_variant_permaslug: "org/m-1",
    pricing: { prompt: "0.000001", completion: "0.000002" },
    context_length: 131072,
    max_completion_tokens: 4096,
    supported_parameters: ["tools", "temperature"],
  });
  assert.ok(rec);
  assert.equal(rec.contextLength, 131072);
  assert.equal(rec.maxCompletionTokens, 4096);
  assert.equal(rec.supportsTools, true);

  const bare = narrowEndpointRecord({ id: "e2", provider_slug: "prov" });
  assert.ok(bare);
  assert.equal(bare.contextLength, null);
  assert.equal(bare.maxCompletionTokens, null);
  assert.equal(bare.supportsTools, null);

  const noTools = narrowEndpointRecord({ id: "e3", provider_slug: "prov", supported_parameters: ["temperature"] });
  assert.ok(noTools);
  assert.equal(noTools.supportsTools, false);
});

// --- the route gate ----------------------------------------------------------

test("a route failing a declared filter drops; a null field is kept", () => {
  assert.equal(routePassesEndpointFilters(route({ supportsTools: false }), { tools: true }), false);
  assert.equal(routePassesEndpointFilters(route({ supportsTools: true }), { tools: true }), true);
  assert.equal(routePassesEndpointFilters(route({ supportsTools: null }), { tools: true }), true);

  assert.equal(routePassesEndpointFilters(route({ contextLength: 8000 }), { minContextTokens: 16000 }), false);
  assert.equal(routePassesEndpointFilters(route({ contextLength: 32000 }), { minContextTokens: 16000 }), true);
  assert.equal(routePassesEndpointFilters(route({ contextLength: null }), { minContextTokens: 16000 }), true);

  assert.equal(routePassesEndpointFilters(route({ maxCompletionTokens: 248 }), { minOutputTokens: 4096 }), false);
  assert.equal(routePassesEndpointFilters(route({ maxCompletionTokens: 8192 }), { minOutputTokens: 4096 }), true);
  assert.equal(routePassesEndpointFilters(route({ maxCompletionTokens: null }), { minOutputTokens: 4096 }), true);

  // 0 / false = off: an incapable route passes when nothing is declared.
  assert.equal(
    routePassesEndpointFilters(route({ supportsTools: false, contextLength: 1, maxCompletionTokens: 1 }), {
      tools: false,
      minContextTokens: 0,
      minOutputTokens: 0,
    }),
    true,
  );
});

test("a model whose every route fails the endpoint filter is ineligible", () => {
  const capable = makeModel("capable", 40, 1, 100);
  capable.routes = [route({ supportsTools: true })];
  const incapable = makeModel("incapable", 60, 1, 100); // higher q, but no capable route
  incapable.routes = [route({ supportsTools: false })];
  const ranked = rankRole(roleWith({ tools: true }), [capable, incapable]);
  assert.deepEqual(ranked.map((r) => r.model.id), ["capable"]);
});

test("a model with an unstated capability field is kept", () => {
  const m = makeModel("m", 40, 1, 100);
  m.routes = [route({ supportsTools: null, contextLength: null, maxCompletionTokens: null })];
  assert.equal(modelPassesEndpointFilters(m, { tools: true, minContextTokens: 16000, minOutputTokens: 4096 }), true);
  assert.equal(rankRole(roleWith({ tools: true, minContextTokens: 16000, minOutputTokens: 4096 }), [m]).length, 1);
});

test("a model with no route data has no capable route and is ineligible", () => {
  const m = makeModel("m", 40, 1, 100); // routes undefined
  assert.equal(modelPassesEndpointFilters(m, { tools: true }), false);
  assert.equal(rankRole(roleWith({ tools: true }), [m]).length, 0);
});

test("the find-route fallback does not resurrect an incapable model", () => {
  // The page's only route is a flex tier (ineligible), so the blend pool is empty
  // and the find row supplies throughput/price — but routes[] stays empty, so a
  // role with an endpoint filter still drops the model.
  const data = {
    models: [{ slug: "org/m", supports_reasoning: false, endpoint: { id: "a", model_variant_permaslug: "org/m-1", is_free: false, status: 0 } }],
    endpoint_perf: { a: { p50_latency: null, p50_throughput: 10 } },
    endpoint_price: { a: 2 },
    endpoint_weight_price: { a: 2 },
  };
  const enrichment = buildOpenRouterEnrichment(data, { "org/m": [route({ id: "a", serviceTier: "flex" })] });
  assert.ok(enrichment.m);
  assert.deepEqual(enrichment.m.routes, []);
  const m = makeModel("m", 40, 1, 100);
  applyOpenRouterData([m], enrichment);
  assert.equal(m.routes?.length, 0);
  assert.equal(rankRole(roleWith({ tools: true }), [m]).length, 0);
});

test("the enrichment carries the eligible routes with their capability fields", () => {
  const data = {
    models: [{ slug: "org/m", supports_reasoning: false, endpoint: { id: "a", model_variant_permaslug: "org/m-1", is_free: false, status: 0 } }],
    endpoint_perf: { a: { p50_latency: null, p50_throughput: 10 } },
    endpoint_price: { a: 2 },
    endpoint_weight_price: { a: 2 },
  };
  const enrichment = buildOpenRouterEnrichment(data, {
    "org/m": [route({ id: "a", contextLength: 131072, maxCompletionTokens: 4096, supportsTools: true })],
  });
  assert.ok(enrichment.m);
  assert.equal(enrichment.m.routes.length, 1);
  assert.equal(enrichment.m.routes[0].contextLength, 131072);
  assert.equal(enrichment.m.routes[0].maxCompletionTokens, 4096);
  assert.equal(enrichment.m.routes[0].supportsTools, true);
});

// --- maxPriceUsdPerM ---------------------------------------------------------

test("maxPriceUsdPerM drops a model whose role-priced blend exceeds the cap", () => {
  const cheap = makeModel("cheap", 40, 1, 100);
  const pricey = makeModel("pricey", 40, 5, 100);
  const ranked = rankRole(roleWith({ maxPriceUsdPerM: 2 }), [cheap, pricey]);
  assert.deepEqual(ranked.map((r) => r.model.id), ["cheap"]);
});

test("maxPriceUsdPerM caps the thinking-adjusted role price", () => {
  const m = makeModel("m", 40, 1, 100, true); // thinking-capable
  const def: RoleDef = {
    description: "t",
    weights: { general: 0.5, price: 0.5 },
    required: ["general", "price"],
    thinking: "high", // factor 2.71
    filters: { maxPriceUsdPerM: 2 },
  };
  assert.equal(rankRole(def, [m]).length, 0); // 1 × 2.71 > 2
});

// --- recording ---------------------------------------------------------------

test("the explorer records the endpoint-filter drop", () => {
  const m = makeModel("m", 40, 1, 100);
  m.routes = [route({ supportsTools: false })];
  const ex = explainModel(roleWith({ tools: true }), [m], "m");
  assert.equal(ex.eligible, false);
  assert.ok(!ex.eligible && ex.reasons.some((r) => r.includes("endpoint filters")));
});

// --- settings validation -----------------------------------------------------

test("resolveSettings accepts the endpoint filters", () => {
  const { settings, errors } = resolveSettings({
    "roles.default.filters.tools": true,
    "roles.default.filters.minContextTokens": 16000,
    "roles.default.filters.minOutputTokens": 4096,
    "roles.default.filters.maxPriceUsdPerM": 5,
  });
  assert.deepEqual(errors, []);
  assert.equal(settings.roles.default.filters?.tools, true);
  assert.equal(settings.roles.default.filters?.minContextTokens, 16000);
  assert.equal(settings.roles.default.filters?.minOutputTokens, 4096);
  assert.equal(settings.roles.default.filters?.maxPriceUsdPerM, 5);
});

test("resolveSettings rejects bad endpoint filter values", () => {
  const { errors } = resolveSettings({
    "roles.default.filters.tools": "yes",
    "roles.default.filters.minContextTokens": -1,
    "roles.default.filters.minOutputTokens": "x",
    "roles.default.filters.maxPriceUsdPerM": -0.5,
  });
  assert.equal(errors.length, 4);
  assert.ok(errors.some((e) => e.includes("filters.tools must be a boolean")));
  assert.ok(errors.some((e) => e.includes("filters.minContextTokens must be a number ≥ 0")));
  assert.ok(errors.some((e) => e.includes("filters.minOutputTokens must be a number ≥ 0")));
  assert.ok(errors.some((e) => e.includes("filters.maxPriceUsdPerM must be a number ≥ 0")));
});

// --- decision recording ------------------------------------------------------

test("the updater records endpoint-filter drops on the decision", async () => {
  const capable = makeModel("model-a", 90, 1, 100);
  capable.routes = [route({ supportsTools: true })];
  const incapable = makeModel("model-b", 80, 1, 100);
  incapable.routes = [route({ supportsTools: false })];
  const dir = setupAgentDir("other: 1\n");
  const deps = fakeDeps([capable, incapable], { "roles.default.filters.tools": true });
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true, dryRun: true }));
  const d = result.decisions.find((x) => x.role === "default");
  assert.ok(d);
  assert.equal(d.to, "openrouter/org/model-a:auto");
  assert.deepEqual(d.endpointBlocked, ["model-b"]);
});
