import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  applyBenchmarkScores,
  BENCHMARK_ENTRY_CAP,
  catalogBenchmarkDeclaration,
  catalogMetric,
  declarationToSource,
  declaredSourceForLink,
  dryRunDeclaration,
  executeDeclaration,
  llmStatsBenchmarkDeclaration,
  loadBenchmarkCatalog,
  loadBenchmarkScores,
  normalizeMetricKey,
  parseBenchmarkCatalog,
  parseBenchmarkPayload,
  parseBenchmarkPayloadMeta,
  parseSourceDeclaration,
  readCatalogCache,
  resolveBenchmarkSource,
  sourceForMetric,
  validateDeclaration,
  type SourceDeclaration,
} from "../src/benchmark-sources.ts";
import { makeModel } from "./helpers.ts";

test("resolveBenchmarkSource maps links to sources and rejects an unknown host", () => {
  assert.equal(resolveBenchmarkSource("https://llm-stats.com/benchmarks/alpacaeval-2.0")?.metric, "bench:alpacaeval-2_0");
  assert.equal(resolveBenchmarkSource("alpacaeval-2.0")?.metric, "bench:alpacaeval-2_0");
  assert.equal(resolveBenchmarkSource("https://llm-stats.com/leaderboards/best-ai-for-writing")?.metric, "writing");
  assert.equal(resolveBenchmarkSource("https://www.designarena.ai/api/leaderboard")?.metric, "website");
  // A link to a benchmark the plugin already ships resolves to its existing metric.
  assert.equal(resolveBenchmarkSource("https://llm-stats.com/benchmarks/gpqa")?.metric, "gpqa");
  assert.equal(resolveBenchmarkSource("https://example.com/leaderboard"), null);
  assert.equal(resolveBenchmarkSource(""), null);
});

test("normalizeMetricKey is dot-free and collapses separators", () => {
  assert.equal(normalizeMetricKey("alpacaeval-2.0"), "alpacaeval-2_0");
  assert.equal(normalizeMetricKey("AlpacaEval-2.0"), "alpacaeval-2_0");
  assert.equal(normalizeMetricKey("a...b"), "a_b");
  assert.equal(normalizeMetricKey("swe_bench"), "swe_bench");
  assert.doesNotMatch(normalizeMetricKey("a.b.c"), /\./);
});

test("parseBenchmarkPayload reads the llm-stats entries shape and rejects junk", () => {
  const source = resolveBenchmarkSource("alpacaeval-2.0");
  assert.ok(source);
  assert.deepEqual(
    parseBenchmarkPayload(source, {
      entries: [
        { model_id: "a", normalized_score: 0.5 },
        { model_id: "b", normalized_score: "x" },
        { model_id: 3, normalized_score: 0.2 },
        "junk",
      ],
    }),
    { scores: { a: 0.5 }, loaded: 1, total: null, meta: { trust: null, modality: null, provenance: null, crossSource: null } },
  );
  assert.equal(parseBenchmarkPayload(source, {}), null);
  assert.equal(parseBenchmarkPayload(source, null), null);
});

test("parseBenchmarkPayloadMeta reads the per-entry self_reported/verified flags", () => {
  // 19 self-reported of 20 covered entries (the 20th carries the flag as false).
  const entries = Array.from({ length: 20 }, (_, i) => ({ model_id: `m${i}`, normalized_score: 0.5, self_reported: i < 19, verified: false }));
  const payload = { benchmark_id: "alpacaeval-2.0", total_models: 20, entries };
  assert.deepEqual(parseBenchmarkPayloadMeta(payload), { trust: { selfReported: 19, verified: 0, covered: 20 }, modality: null, provenance: null, crossSource: null });
  // The same summary rides `parseBenchmarkPayload`'s `meta`.
  const source = resolveBenchmarkSource("alpacaeval-2.0");
  assert.ok(source);
  assert.deepEqual(parseBenchmarkPayload(source, payload)?.meta, { trust: { selfReported: 19, verified: 0, covered: 20 }, modality: null, provenance: null, crossSource: null });
  // An independently measured source: no entry is self-reported.
  assert.deepEqual(parseBenchmarkPayloadMeta({ entries: [{ model_id: "a", normalized_score: 0.5, self_reported: false }] }), {
    trust: { selfReported: 0, verified: 0, covered: 1 },
    modality: null,
    provenance: null,
    crossSource: null,
  });
  // A payload whose entries carry no boolean self_reported: trust is null, not a silent ok.
  assert.deepEqual(parseBenchmarkPayloadMeta({ entries: [{ model_id: "a", normalized_score: 0.5 }] }), { trust: null, modality: null, provenance: null, crossSource: null });
  // A payload with no llm-stats entries shape (a writing/declared payload): the whole meta is null.
  assert.equal(parseBenchmarkPayloadMeta({ records: [{ modelId: "q", writingBenchScore: 0.9 }] }), null);
  assert.equal(parseBenchmarkPayloadMeta(null), null);
  assert.equal(parseBenchmarkPayloadMeta({ entries: "nope" }), null);
});

test("parseBenchmarkPayloadMeta reads the per-entry multimodal flag", () => {
  // 1 of 2 entries is multimodal; the trust summary stays null (no self_reported).
  assert.deepEqual(
    parseBenchmarkPayloadMeta({
      entries: [
        { model_id: "a", normalized_score: 0.5, multimodal: true },
        { model_id: "b", normalized_score: 0.4, multimodal: false },
      ],
    }),
    { trust: null, modality: { multimodal: 1, covered: 2 }, provenance: null, crossSource: null },
  );
  // The three summaries have independent denominators: a row may carry one flag and not the others.
  assert.deepEqual(
    parseBenchmarkPayloadMeta({
      entries: [
        { model_id: "a", normalized_score: 0.5, self_reported: true, multimodal: true },
        { model_id: "b", normalized_score: 0.4, self_reported: false },
      ],
    }),
    { trust: { selfReported: 1, verified: 0, covered: 2 }, modality: { multimodal: 1, covered: 1 }, provenance: null, crossSource: null },
  );
  // No entry carries a boolean multimodal: modality is null, not a silent ok.
  assert.deepEqual(parseBenchmarkPayloadMeta({ entries: [{ model_id: "a", normalized_score: 0.5, multimodal: "yes" }] }), {
    trust: null,
    modality: null,
    provenance: null,
    crossSource: null,
  });
});

test("parseBenchmarkPayloadMeta reads the per-entry org distribution", () => {
  // Two openai entries and one google (via provider_id): openai dominates 2/3.
  assert.deepEqual(
    parseBenchmarkPayloadMeta({
      entries: [
        { model_id: "a", normalized_score: 0.5, organization_id: "openai" },
        { model_id: "b", normalized_score: 0.4, organization_id: "openai" },
        { model_id: "c", normalized_score: 0.3, provider_id: "google" },
      ],
    }),
    { trust: null, modality: null, provenance: { dominantOrg: "openai", dominantShare: 2 / 3, orgs: 2, covered: 3 }, crossSource: null },
  );
  // `organization_id` wins over `provider_id`; an empty string falls back.
  assert.deepEqual(
    parseBenchmarkPayloadMeta({
      entries: [
        { model_id: "a", normalized_score: 0.5, organization_id: "openai", provider_id: "other" },
        { model_id: "b", normalized_score: 0.4, organization_id: "", provider_id: "google" },
      ],
    }),
    { trust: null, modality: null, provenance: { dominantOrg: "openai", dominantShare: 0.5, orgs: 2, covered: 2 }, crossSource: null },
  );
  // A payload with no org fields: provenance is null, not a silent ok.
  assert.deepEqual(parseBenchmarkPayloadMeta({ entries: [{ model_id: "a", normalized_score: 0.5 }] }), { trust: null, modality: null, provenance: null, crossSource: null });
  // A non-string org is ignored; a payload with only junk orgs is null.
  assert.deepEqual(parseBenchmarkPayloadMeta({ entries: [{ model_id: "a", normalized_score: 0.5, organization_id: 3, provider_id: null }] }), {
    trust: null,
    modality: null,
    provenance: null,
    crossSource: null,
  });
  // The three summaries keep independent denominators: a row may carry an org and no flag.
  assert.deepEqual(
    parseBenchmarkPayloadMeta({
      entries: [
        { model_id: "a", normalized_score: 0.5, organization_id: "openai", self_reported: true },
        { model_id: "b", normalized_score: 0.4, organization_id: "openai" },
      ],
    }),
    { trust: { selfReported: 1, verified: 0, covered: 1 }, modality: null, provenance: { dominantOrg: "openai", dominantShare: 1, orgs: 1, covered: 2 }, crossSource: null },
  );
});

test("parseBenchmarkPayloadMeta reads the per-entry cross-source price/throughput/context", () => {
  // The four fields are read in the same pass, keyed by the entry's model_id.
  assert.deepEqual(
    parseBenchmarkPayloadMeta({
      entries: [{ model_id: "a", normalized_score: 0.5, input_cost_per_million: 1, output_cost_per_million: 3, speed_rps: 2, context_window: 1000 }],
    }),
    { trust: null, modality: null, provenance: null, crossSource: { a: { input: 1, output: 3, speed: 2, context: 1000 } } },
  );
  // A non-finite or non-number field is null; a row with none of the four is skipped.
  assert.deepEqual(
    parseBenchmarkPayloadMeta({
      entries: [
        { model_id: "a", normalized_score: 0.5, input_cost_per_million: 1, output_cost_per_million: "x", speed_rps: Number.NaN, context_window: null },
        { model_id: "b", normalized_score: 0.4 },
        { model_id: 3, normalized_score: 0.2, input_cost_per_million: 5 },
      ],
    }),
    { trust: null, modality: null, provenance: null, crossSource: { a: { input: 1, output: null, speed: null, context: null } } },
  );
  // No entry carries any of the four: the whole map is null, not an empty object.
  assert.deepEqual(parseBenchmarkPayloadMeta({ entries: [{ model_id: "a", normalized_score: 0.5 }] }), {
    trust: null,
    modality: null,
    provenance: null,
    crossSource: null,
  });
  // The four summaries keep independent denominators: a row may carry a price and no flag.
  assert.deepEqual(
    parseBenchmarkPayloadMeta({
      entries: [
        { model_id: "a", normalized_score: 0.5, self_reported: true, input_cost_per_million: 2 },
        { model_id: "b", normalized_score: 0.4, organization_id: "openai" },
      ],
    }),
    {
      trust: { selfReported: 1, verified: 0, covered: 1 },
      modality: null,
      provenance: { dominantOrg: "openai", dominantShare: 1, orgs: 1, covered: 1 },
      crossSource: { a: { input: 2, output: null, speed: null, context: null } },
    },
  );
});

test("parseBenchmarkPayload reads the writing evidence shape", () => {
  const source = sourceForMetric("writing");
  assert.ok(source);
  assert.deepEqual(parseBenchmarkPayload(source, { records: [{ modelId: "q", writingBenchScore: 0.883 }, { modelId: "x" }] }), {
    scores: { q: 0.883 },
    loaded: 1,
    total: null,
    meta: null,
  });
  assert.equal(parseBenchmarkPayload(source, { records: "nope" }), null);
});

test("the llm-stats cap is surfaced: loaded count vs total_models", () => {
  const source = resolveBenchmarkSource("deepswe-1.1");
  assert.ok(source);
  const entries = Array.from({ length: BENCHMARK_ENTRY_CAP }, (_, i) => ({ model_id: `m${i}`, normalized_score: 0.5 }));
  const parsed = parseBenchmarkPayload(source, { benchmark_id: "deepswe-1.1", total_models: 40, entries });
  assert.ok(parsed);
  assert.equal(parsed.loaded, BENCHMARK_ENTRY_CAP);
  assert.equal(parsed.total, 40);
  assert.equal(Object.keys(parsed.scores).length, parsed.loaded);
});

test("loadBenchmarkScores reports the loadable count (post-fetch coverage) and the total", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bench-cap-"));
  const source = declarationToSource({ ...llmStatsBenchmarkDeclaration("deepswe-1.1"), id: "cap-src" });
  const originalFetch = globalThis.fetch;
  try {
    const entries = Array.from({ length: BENCHMARK_ENTRY_CAP }, (_, i) => ({ model_id: `m${i}`, normalized_score: 0.5 }));
    globalThis.fetch = (async () => new Response(JSON.stringify({ total_models: 40, entries }))) as typeof fetch;
    const loaded = await loadBenchmarkScores(source, true, dir);
    assert.ok(loaded);
    // The coverage count is the loadable count, not the catalog's 40.
    assert.equal(loaded.loaded, BENCHMARK_ENTRY_CAP);
    assert.equal(loaded.total, 40);
    assert.equal(loaded.loaded, Object.keys(loaded.scores).length);
    // The cap rides in the cache, so a cache hit still reports loaded < total.
    const cached = await loadBenchmarkScores(source, false, dir);
    assert.equal(cached?.loaded, BENCHMARK_ENTRY_CAP);
    assert.equal(cached?.total, 40);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("catalogBenchmarkDeclaration carries a dotted id's raw form, null when unneeded", () => {
  const decl = catalogBenchmarkDeclaration("deepswe-1.1");
  assert.ok(decl);
  assert.equal(decl.metric, "bench:deepswe-1_1");
  assert.equal(decl.fetch.url, "https://api.zeroeval.com/leaderboard/benchmarks/deepswe-1.1");
  // Persisted, the declaration makes the normalized metric key resolve to the raw-id URL.
  assert.equal(sourceForMetric("bench:deepswe-1_1", [decl])?.fetch?.url, "https://api.zeroeval.com/leaderboard/benchmarks/deepswe-1.1");
  // A dot-free id needs no declaration (the generic fallback reconstructs it) …
  assert.equal(catalogBenchmarkDeclaration("creative-writing-v3"), null);
  // … and a shipped id resolves through its static source.
  assert.equal(catalogBenchmarkDeclaration("gpqa"), null);
});

test("applyBenchmarkScores fills uncovered models and leaves no metric null", () => {
  const source = resolveBenchmarkSource("alpacaeval-2.0");
  assert.ok(source);
  const covered = makeModel("covered", 30, 1, 50);
  const uncovered = makeModel("uncovered", 30, 1, 50);
  const result = applyBenchmarkScores([covered, uncovered], source, { covered: 0.7 });
  assert.deepEqual(result, { covered: 1, imputed: 1 });
  assert.equal(covered.metrics["bench:alpacaeval-2_0"], 0.7);
  assert.equal(uncovered.metrics["bench:alpacaeval-2_0"], 0.195);
});

test("loadBenchmarkScores: fresh cache wins, a live fetch writes the cache, a stale cache is the last resort", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bench-src-"));
  const source = declarationToSource({ ...llmStatsBenchmarkDeclaration("alpacaeval-2.0"), id: "test-src" });
  const cachePath = join(dir, source.cacheFile);
  const originalFetch = globalThis.fetch;
  let calls = 0;
  try {
    // Fresh cache wins: no fetch.
    writeFileSync(cachePath, JSON.stringify({ fetchedAt: new Date().toISOString(), source: "x", scores: { a: 0.9 } }));
    globalThis.fetch = (async () => {
      calls++;
      return new Response(JSON.stringify({ entries: [{ model_id: "b", normalized_score: 0.1 }] }));
    }) as typeof fetch;
    const fresh = await loadBenchmarkScores(source, false, dir);
    assert.deepEqual(fresh?.scores, { a: 0.9 });
    assert.equal(calls, 0);

    // A live fetch writes the cache.
    const live = await loadBenchmarkScores(source, true, dir);
    assert.deepEqual(live?.scores, { b: 0.1 });
    assert.equal(calls, 1);
    assert.deepEqual(JSON.parse(readFileSync(cachePath, "utf8")).scores, { b: 0.1 });

    // A stale cache is the last resort when the fetch fails.
    writeFileSync(cachePath, JSON.stringify({ fetchedAt: "2000-01-01T00:00:00.000Z", source: "x", scores: { c: 0.3 } }));
    globalThis.fetch = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    const stale = await loadBenchmarkScores(source, false, dir);
    assert.deepEqual(stale?.scores, { c: 0.3 });

    // An unusable payload is never cached: the stale cache still stands.
    globalThis.fetch = (async () => new Response(JSON.stringify({ nope: true }))) as typeof fetch;
    const junk = await loadBenchmarkScores(source, true, dir);
    assert.deepEqual(junk?.scores, { c: 0.3 });
    assert.deepEqual(JSON.parse(readFileSync(cachePath, "utf8")).scores, { c: 0.3 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("parseBenchmarkCatalog keeps valid rows and rejects a non-array payload", () => {
  const payload = [
    { benchmark_id: "writingbench", name: "WritingBench", description: "d", categories: ["writing"], model_count: 12, is_community: true, modality: "text" },
    { name: "no id" },
    "not an object",
    { benchmark_id: "gpqa", name: "GPQA", categories: "nope" },
  ];
  assert.deepEqual(parseBenchmarkCatalog(payload), [
    {
      id: "writingbench",
      name: "WritingBench",
      description: "d",
      categories: ["writing"],
      modelCount: 12,
      isCommunity: true,
      modality: "text",
      updatedAt: null,
      versionCount: null,
      latestVersionRowCount: null,
      starCount: null,
      datasetId: null,
      datasetOrgId: null,
      datasetSlug: null,
    },
    {
      id: "gpqa",
      name: "GPQA",
      description: "",
      categories: [],
      modelCount: 0,
      isCommunity: false,
      modality: null,
      updatedAt: null,
      versionCount: null,
      latestVersionRowCount: null,
      starCount: null,
      datasetId: null,
      datasetOrgId: null,
      datasetSlug: null,
    },
  ]);
  assert.equal(parseBenchmarkCatalog({ benchmarks: [] }), null);
});

test("parseBenchmarkCatalog carries the row's maintenance fields, nulling a missing or non-finite one", () => {
  const entries = parseBenchmarkCatalog([
    { benchmark_id: "x", name: "X", updated_at: "2023-01-15T00:00:00Z", version_count: 4, latest_version_row_count: 40, star_count: 7 },
    { benchmark_id: "y", name: "Y" },
    { benchmark_id: "z", name: "Z", updated_at: 123, version_count: Number.NaN, latest_version_row_count: Number.POSITIVE_INFINITY, star_count: "9" },
    { benchmark_id: "w", name: "W", updated_at: "" },
  ]);
  assert.deepEqual(entries?.[0], {
    id: "x",
    name: "X",
    description: "",
    categories: [],
    modelCount: 0,
    isCommunity: false,
    modality: null,
    updatedAt: "2023-01-15T00:00:00Z",
    versionCount: 4,
    latestVersionRowCount: 40,
    starCount: 7,
    datasetId: null,
    datasetOrgId: null,
    datasetSlug: null,
  });
  // A missing field, a non-string `updated_at` and a non-finite count are all null.
  assert.deepEqual(entries?.slice(1, 3).map((e) => [e.updatedAt, e.versionCount, e.latestVersionRowCount, e.starCount]), [
    [null, null, null, null],
    [null, null, null, null],
  ]);
  // An empty string is still a string: carried as-is (the axis degrades to unknown).
  assert.equal(entries?.[3].updatedAt, "");
});

test("parseBenchmarkCatalog carries the row's modality, keeping an unknown value", () => {
  const entries = parseBenchmarkCatalog([
    { benchmark_id: "x", name: "X", modality: "image" },
    { benchmark_id: "y", name: "Y", modality: null },
    { benchmark_id: "z", name: "Z", modality: "" },
    { benchmark_id: "w", name: "W", modality: 3 },
    { benchmark_id: "v", name: "V", modality: "3d" },
  ]);
  assert.deepEqual(entries?.map((e) => e.modality), ["image", null, null, null, "3d"]);
});

test("parseBenchmarkCatalog carries the row's dataset provenance, nulling a missing or non-string one", () => {
  const entries = parseBenchmarkCatalog([
    { benchmark_id: "x", name: "X", dataset_id: "ds-1", dataset_org_id: "metr", dataset_slug: "metr/swe" },
    { benchmark_id: "y", name: "Y" },
    { benchmark_id: "z", name: "Z", dataset_id: 3, dataset_org_id: "", dataset_slug: null },
  ]);
  assert.deepEqual(entries?.map((e) => [e.datasetId, e.datasetOrgId, e.datasetSlug]), [
    ["ds-1", "metr", "metr/swe"],
    [null, null, null],
    [null, null, null],
  ]);
});

test("loadBenchmarkCatalog: fresh cache wins, a live fetch writes the cache, a stale cache is the last resort", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bench-cat-"));
  const cachePath = join(dir, "benchmark-catalog-fetched-data.json");
  const originalFetch = globalThis.fetch;
  let calls = 0;
  try {
    // Fresh cache wins: no fetch.
    writeFileSync(cachePath, JSON.stringify({ fetchedAt: new Date().toISOString(), source: "x", entries: [{ id: "a", name: "A", description: "", categories: [], modelCount: 1, isCommunity: false, modality: null, updatedAt: null, versionCount: null, latestVersionRowCount: null, starCount: null, datasetId: null, datasetOrgId: null, datasetSlug: null }] }));
    globalThis.fetch = (async () => {
      calls++;
      return new Response(JSON.stringify([{ benchmark_id: "b", name: "B" }]));
    }) as typeof fetch;
    const fresh = await loadBenchmarkCatalog(false, dir);
    assert.deepEqual(fresh?.map((e) => e.id), ["a"]);
    assert.equal(calls, 0);

    // A live fetch writes the cache.
    const live = await loadBenchmarkCatalog(true, dir);
    assert.deepEqual(live?.map((e) => e.id), ["b"]);
    assert.equal(calls, 1);
    assert.deepEqual(JSON.parse(readFileSync(cachePath, "utf8")).entries.map((e: { id: string }) => e.id), ["b"]);

    // A stale cache is the last resort when the fetch fails.
    writeFileSync(cachePath, JSON.stringify({ fetchedAt: "2000-01-01T00:00:00.000Z", source: "x", entries: [{ id: "c", name: "C", description: "", categories: [], modelCount: 0, isCommunity: false, modality: null, updatedAt: null, versionCount: null, latestVersionRowCount: null, starCount: null, datasetId: null, datasetOrgId: null, datasetSlug: null }] }));
    globalThis.fetch = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    const stale = await loadBenchmarkCatalog(false, dir);
    assert.deepEqual(stale?.map((e) => e.id), ["c"]);

    // An unusable payload is never cached: the stale cache still stands.
    globalThis.fetch = (async () => new Response(JSON.stringify({ nope: true }))) as typeof fetch;
    const junk = await loadBenchmarkCatalog(true, dir);
    assert.deepEqual(junk?.map((e) => e.id), ["c"]);
    assert.deepEqual(JSON.parse(readFileSync(cachePath, "utf8")).entries.map((e: { id: string }) => e.id), ["c"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("catalogMetric maps shipped ids and falls back to a dot-free bench key", () => {
  assert.equal(catalogMetric("writingbench"), "writing");
  assert.equal(catalogMetric("creative-writing-v3"), "bench:creative-writing-v3");
  assert.equal(catalogMetric("alpacaeval-2.0"), "bench:alpacaeval-2_0");
});

test("the catalog cache is rejected when its entries predate isCommunity/modality, the maintenance fields or the provenance fields", () => {
  const dir = mkdtempSync(join(tmpdir(), "catalog-guard-"));
  const path = join(dir, "benchmark-catalog-fetched-data.json");
  // A row in the pre-#34 shape: every field the guard checks except the newer ones.
  const legacy = { id: "a", name: "A", description: "", categories: [], modelCount: 1 };
  const write = (entries: object[]) => writeFileSync(path, JSON.stringify({ fetchedAt: new Date().toISOString(), source: "t", entries }));

  write([legacy]);
  assert.equal(readCatalogCache(path, true), null, "a cache without isCommunity/modality must be rejected");

  write([{ ...legacy, isCommunity: false }]);
  assert.equal(readCatalogCache(path, true), null, "a cache without modality must be rejected");

  // isCommunity + modality but no maintenance fields (a pre-#36 cache): rejected.
  write([{ ...legacy, isCommunity: false, modality: null }]);
  assert.equal(readCatalogCache(path, true), null, "a cache without the maintenance fields must be rejected");

  // Every maintenance field is required: dropping any one rejects the cache.
  const maintained = { ...legacy, isCommunity: false, modality: null, updatedAt: null, versionCount: null, latestVersionRowCount: null, starCount: null };
  for (const key of ["updatedAt", "versionCount", "latestVersionRowCount", "starCount"] as const) {
    const { [key]: _omitted, ...without } = maintained;
    write([without]);
    assert.equal(readCatalogCache(path, true), null, `a cache without ${key} must be rejected`);
  }

  // The maintenance fields but no provenance fields (a pre-#37 cache): rejected.
  write([maintained]);
  assert.equal(readCatalogCache(path, true), null, "a cache without the provenance fields must be rejected");

  // Every provenance field is required: dropping any one rejects the cache.
  const full = { ...maintained, datasetId: null, datasetOrgId: null, datasetSlug: null };
  for (const key of ["datasetId", "datasetOrgId", "datasetSlug"] as const) {
    const { [key]: _omitted, ...without } = full;
    write([without]);
    assert.equal(readCatalogCache(path, true), null, `a cache without ${key} must be rejected`);
  }

  write([full]);
  assert.ok(readCatalogCache(path, true), "a cache with every field must be accepted");

  write([{ ...full, modality: "image" }]);
  assert.ok(readCatalogCache(path, true), "a non-null modality is accepted too");

  // An empty catalog is still null (nothing to sample, nothing to discover).
  write([]);
  assert.equal(readCatalogCache(path, true), null);
});

test("executeDeclaration walks the payload path, normalizes scoreMax and joins", () => {
  const decl: SourceDeclaration = {
    id: "my-provider",
    label: "My Provider",
    metric: "my-provider:writing",
    urlPatterns: ["myprovider.example/leaderboard"],
    fetch: { url: "https://myprovider.example/api", method: "GET" },
    payloadPath: "data.entries",
    idField: "model_id",
    scoreField: "score",
    scoreMax: 100,
    join: "slug-suffix",
    fill: 0.195,
  };
  assert.deepEqual(validateDeclaration(decl), []);
  assert.deepEqual(executeDeclaration(decl, { data: { entries: [{ model_id: "org/a", score: 50 }, { model_id: "org/b", score: 200 }] } }), {
    "org/a": 0.5,
    "org/b": 1,
  });
  assert.equal(executeDeclaration(decl, { data: {} }), null);

  const models = [makeModel("a", 30, 1, 50), makeModel("b", 30, 1, 50)];
  const scores = executeDeclaration(decl, { data: { entries: [{ model_id: "org/a", score: 50 }] } });
  assert.ok(scores);
  const applied = applyBenchmarkScores(models, declarationToSource(decl), scores);
  assert.deepEqual(applied, { covered: 1, imputed: 1 });
  assert.equal(models[0].metrics["my-provider:writing"], 0.5);
  assert.equal(models[1].metrics["my-provider:writing"], 0.195);
});

test("a declaration whose metric collides with a shipped key is rejected", () => {
  const decl = { ...llmStatsBenchmarkDeclaration("alpacaeval-2.0"), metric: "writing" };
  assert.ok(validateDeclaration(decl).some((e) => e.includes("must be <namespace>:<local>")));
  assert.ok("error" in parseSourceDeclaration(decl));
});

test("dryRunDeclaration reports coverage and leader and rejects a zero-join", () => {
  const decl = llmStatsBenchmarkDeclaration("alpacaeval-2.0");
  const payload = { entries: [{ model_id: "a", normalized_score: 0.4 }, { model_id: "b", normalized_score: 0.9 }] };
  const models = [makeModel("a", 30, 1, 50), makeModel("b", 30, 1, 50)];

  const dry = dryRunDeclaration(decl, payload, models);
  assert.ok(dry.ok);
  assert.equal(dry.covered, 2);
  assert.deepEqual(dry.leader, { id: "b", score: 0.9 });

  const zero = dryRunDeclaration(decl, { entries: [{ model_id: "zzz", normalized_score: 0.4 }] }, models);
  assert.equal(zero.ok, false);
  assert.match(zero.ok ? "" : zero.errors.join(" "), /joins zero models/);

  // Without a model list, coverage is the parsed row count.
  const noModels = dryRunDeclaration(decl, payload);
  assert.ok(noModels.ok);
  assert.equal(noModels.covered, 2);
});

test("sourceForMetric resolves a shipped key, a declared source and a generic bench key", () => {
  assert.equal(sourceForMetric("writing")?.id, "writing");
  assert.equal(sourceForMetric("bench:alpacaeval-2_0")?.fetch?.url, "https://api.zeroeval.com/leaderboard/benchmarks/alpacaeval-2_0");
  const decl = llmStatsBenchmarkDeclaration("alpacaeval-2.0");
  assert.equal(sourceForMetric("bench:alpacaeval-2_0", [decl])?.fetch?.url, "https://api.zeroeval.com/leaderboard/benchmarks/alpacaeval-2.0");
  assert.equal(sourceForMetric("nope"), null);
});

test("declaredSourceForLink reuses a saved declaration for a matching link", () => {
  const decl: SourceDeclaration = {
    id: "my-provider",
    label: "My Provider",
    metric: "my-provider:writing",
    urlPatterns: ["myprovider.example/leaderboard/*"],
    fetch: { url: "https://myprovider.example/api", method: "GET" },
    payloadPath: "entries",
    idField: "model_id",
    scoreField: "score",
    scoreMax: 1,
    join: "direct",
    fill: 0.195,
  };
  assert.equal(declaredSourceForLink("https://myprovider.example/leaderboard/writing", [decl])?.metric, "my-provider:writing");
  assert.equal(declaredSourceForLink("https://other.example/leaderboard", [decl]), null);
});
