import { test } from "node:test";
import assert from "node:assert/strict";
import { applyWritingScores, CAPABILITY_FILL, parseWritingEvidence, rankRole } from "../src/engine.ts";
import { makeModel } from "./helpers.ts";

test("parseWritingEvidence keys finite scores by model id and rejects unusable shapes", () => {
  const parsed = parseWritingEvidence({
    records: [
      { modelId: "qwen3-235b-a22b-thinking-2507", writingBenchScore: 0.883 },
      { modelId: "qwen3-14b", writingBenchScore: 0.78 },
      { modelId: "no-score" },
      { modelId: 42, writingBenchScore: 0.5 },
      { writingBenchScore: 0.5 },
      "junk",
    ],
  });
  assert.deepEqual(parsed, { "qwen3-235b-a22b-thinking-2507": 0.883, "qwen3-14b": 0.78 });
  assert.equal(parseWritingEvidence({}), null);
  assert.equal(parseWritingEvidence({ records: "nope" }), null);
  assert.equal(parseWritingEvidence(null), null);
});

test("applyWritingScores fills uncovered models at the capability fill and leaves no metric null", () => {
  const covered = makeModel("covered", 30, 1, 50);
  const uncovered = makeModel("uncovered", 30, 1, 50);
  const result = applyWritingScores([covered, uncovered], { covered: 0.883 });
  assert.deepEqual(result, { covered: 1, imputed: 1 });
  assert.equal(covered.writingBench, 0.883);
  assert.equal(covered.metrics.writing, 0.883);
  assert.equal(uncovered.writingBench, null);
  assert.equal(uncovered.metrics.writing, CAPABILITY_FILL.writing);
});

test("a role weighting writing ranks an identical covered model above an uncovered one", () => {
  const covered = makeModel("covered", 30, 1, 50);
  const uncovered = makeModel("uncovered", 30, 1, 50);
  applyWritingScores([covered, uncovered], { covered: 0.883 });
  const ranked = rankRole(
    { description: "", weights: { general: 0.7, writing: 0.2, price: 0.1 }, required: ["general", "price"] },
    [covered, uncovered],
  );
  assert.deepEqual(
    ranked.map((r) => r.model.id),
    ["covered", "uncovered"],
  );
  assert.ok(ranked[0].value > ranked[1].value);
});
