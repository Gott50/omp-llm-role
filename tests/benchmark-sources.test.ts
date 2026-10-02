import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  applyBenchmarkScores,
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
  parseSourceDeclaration,
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
    { a: 0.5 },
  );
  assert.equal(parseBenchmarkPayload(source, {}), null);
  assert.equal(parseBenchmarkPayload(source, null), null);
});

test("parseBenchmarkPayload reads the writing evidence shape", () => {
  const source = sourceForMetric("writing");
  assert.ok(source);
  assert.deepEqual(parseBenchmarkPayload(source, { records: [{ modelId: "q", writingBenchScore: 0.883 }, { modelId: "x" }] }), { q: 0.883 });
  assert.equal(parseBenchmarkPayload(source, { records: "nope" }), null);
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
    { benchmark_id: "writingbench", name: "WritingBench", description: "d", categories: ["writing"], model_count: 12 },
    { name: "no id" },
    "not an object",
    { benchmark_id: "gpqa", name: "GPQA", categories: "nope" },
  ];
  assert.deepEqual(parseBenchmarkCatalog(payload), [
    { id: "writingbench", name: "WritingBench", description: "d", categories: ["writing"], modelCount: 12 },
    { id: "gpqa", name: "GPQA", description: "", categories: [], modelCount: 0 },
  ]);
  assert.equal(parseBenchmarkCatalog({ benchmarks: [] }), null);
});

test("loadBenchmarkCatalog: fresh cache wins, a live fetch writes the cache, a stale cache is the last resort", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bench-cat-"));
  const cachePath = join(dir, "benchmark-catalog-fetched-data.json");
  const originalFetch = globalThis.fetch;
  let calls = 0;
  try {
    // Fresh cache wins: no fetch.
    writeFileSync(cachePath, JSON.stringify({ fetchedAt: new Date().toISOString(), source: "x", entries: [{ id: "a", name: "A", description: "", categories: [], modelCount: 1 }] }));
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
    writeFileSync(cachePath, JSON.stringify({ fetchedAt: "2000-01-01T00:00:00.000Z", source: "x", entries: [{ id: "c", name: "C", description: "", categories: [], modelCount: 0 }] }));
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
