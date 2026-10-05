import assert from "node:assert/strict";
import { test } from "node:test";
import { buildModels, cardinalMetric, rankRole } from "../src/engine.ts";
import { METRIC_META } from "../src/explorer/explain.ts";
import { makeModel, makeRow } from "./helpers.ts";

// The leaderboard fields issue #22 maps into Model.metrics. Index fields use the
// existing (v+20)/80 affine transform; the 0-1 benchmark scores are identity.
const NEW_INDEX = ["index_communication", "index_finance", "index_healthcare", "index_legal"] as const;
const NEW_BENCH = [
  "simpleqa_score",
  "hle_score",
  "mmmu_score",
  "mmmu_pro_score",
  "mmmlu_score",
  "browsecomp_score",
  "swe_bench_pro_score",
  "mcp_atlas_score",
  "apex_agents_score",
  "osworld_score",
  "scicode_score",
  "screenspot_pro_score",
  "charxiv_r_score",
  "frontiermath_score",
  "toolathlon_score",
] as const;

test("buildModels maps every new leaderboard field into metrics", () => {
  const row = makeRow({
    model_id: "m",
    index_communication: 40,
    index_finance: 20,
    index_healthcare: 60,
    index_legal: 0,
    simpleqa_score: 0.12,
    hle_score: 0.26,
    mmmu_score: 0.66,
    mmmu_pro_score: 0.72,
    mmmlu_score: 0.51,
    browsecomp_score: 0.67,
    swe_bench_pro_score: 0.6,
    mcp_atlas_score: 0.36,
    apex_agents_score: 0.1,
    osworld_score: 0.21,
    scicode_score: 0.24,
    screenspot_pro_score: 0.26,
    charxiv_r_score: 0.58,
    frontiermath_score: 0.17,
    toolathlon_score: 0.42,
  });
  const [m] = buildModels([row]);
  assert.equal(m.metrics.index_communication, 40);
  assert.equal(m.metrics.index_finance, 20);
  assert.equal(m.metrics.index_healthcare, 60);
  assert.equal(m.metrics.index_legal, 0);
  assert.equal(m.metrics.simpleqa_score, 0.12);
  assert.equal(m.metrics.hle_score, 0.26);
  assert.equal(m.metrics.mmmu_score, 0.66);
  assert.equal(m.metrics.mmmu_pro_score, 0.72);
  assert.equal(m.metrics.mmmlu_score, 0.51);
  assert.equal(m.metrics.browsecomp_score, 0.67);
  assert.equal(m.metrics.swe_bench_pro_score, 0.6);
  assert.equal(m.metrics.mcp_atlas_score, 0.36);
  assert.equal(m.metrics.apex_agents_score, 0.1);
  assert.equal(m.metrics.osworld_score, 0.21);
  assert.equal(m.metrics.scicode_score, 0.24);
  assert.equal(m.metrics.screenspot_pro_score, 0.26);
  assert.equal(m.metrics.charxiv_r_score, 0.58);
  assert.equal(m.metrics.frontiermath_score, 0.17);
  assert.equal(m.metrics.toolathlon_score, 0.42);
});

test("buildModels leaves an absent new field null (0-filled, not imputed)", () => {
  const [m] = buildModels([makeRow({ model_id: "m" })]);
  for (const metric of [...NEW_INDEX, ...NEW_BENCH]) {
    assert.equal(m.metrics[metric], null, `${metric} should be null when the row omits it`);
  }
});

test("every new metric has a METRIC_META entry with the right kind", () => {
  // The coupling trap: an index metric needs kind "index" so inverseCardinal
  // inverts the affine transform instead of falling through to identity.
  for (const metric of NEW_INDEX) assert.equal(METRIC_META[metric]?.kind, "index", metric);
  for (const metric of NEW_BENCH) assert.equal(METRIC_META[metric]?.kind, "benchmark", metric);
});

test("cardinalMetric: new index fields use the affine transform, benchmarks are identity", () => {
  for (const metric of NEW_INDEX) {
    assert.equal(cardinalMetric(metric, 0), 0.25, `${metric}@0`);
    assert.equal(cardinalMetric(metric, 60), 1, `${metric}@60`);
  }
  for (const metric of NEW_BENCH) {
    assert.equal(cardinalMetric(metric, 0.42), 0.42, `${metric} identity`);
  }
});

test("rankRole: a role weighting a new metric ranks it and 0-fills a model missing it", () => {
  const def = { description: "", weights: { general: 0.5, simpleqa_score: 0.3, price: 0.2 }, required: ["general", "price"] };
  const measured = makeModel("measured", 60, 1, 50);
  measured.metrics.simpleqa_score = 0.5;
  const missing = makeModel("missing", 60, 1, 50); // no simpleqa_score -> 0-fill
  const ranked = rankRole(def, [measured, missing]);

  assert.equal(ranked[0].model.id, "measured");
  assert.equal(ranked[1].model.id, "missing");
  // The measured model's q carries the weighted contribution; the missing one's does not.
  assert.ok(Math.abs(ranked[0].q - ranked[1].q - (0.3 / 0.8) * 0.5) < 1e-12);
  assert.equal(ranked[0].parts.simpleqa_score, (0.3 / 0.8) * 0.5);
  assert.equal(ranked[1].parts.simpleqa_score, undefined);
});

test("rankRole: a new index metric is scored through the affine transform", () => {
  const def = { description: "", weights: { index_legal: 0.5, price: 0.5 }, required: ["index_legal", "price"] };
  const a = makeModel("a", 0, 1, 50);
  a.metrics.index_legal = 60; // -> 1.0
  const b = makeModel("b", 0, 1, 50);
  b.metrics.index_legal = 0; // -> 0.25
  const ranked = rankRole(def, [a, b]);
  assert.equal(ranked[0].model.id, "a");
  assert.equal(ranked[0].parts.index_legal, 1);
  assert.equal(ranked[1].parts.index_legal, 0.25);
});
