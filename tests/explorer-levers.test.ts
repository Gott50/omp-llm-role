import assert from "node:assert/strict";
import { test } from "node:test";
import { rankRole, roleLambda, SUFFIX_LEVELS, thinkingPriceFactor, type RoleDef, type SuffixLevel } from "../src/engine.ts";
import { leaderFlip, thinkingLevelEffect } from "../src/explorer/levers.ts";
import { makeModel } from "./helpers.ts";

// premium dominates on quality but is far more expensive; budget is the cheap
// challenger. `general` is an index metric, so q = (general + 20)/80.
const MODELS = [makeModel("premium", 90, 20, 50), makeModel("budget", 60, 0.5, 200)];

/** A role weighting only the quality backbone and price. */
function role(price: number, extra: Partial<RoleDef> = {}): RoleDef {
  return {
    description: "",
    weights: { price, general: 1 - price },
    required: ["general", "price"],
    ...extra,
  };
}

test("leaderFlip: reports the price weight at which a cheaper challenger overtakes", () => {
  const def = role(0.1);
  const flip = leaderFlip(def, MODELS);
  assert.ok(flip, "a cheaper challenger exists");
  // λ* = (q_premium − q_budget)/(pEff_premium − pEff_budget) = 0.375/19.5 = 1/52,
  // w* = 20·λ* ÷ (1 + 20·λ*) = 5/18. Worked literals, not the implementation's
  // own inverse transform.
  assert.equal(flip.wPrice, 0.1);
  assert.ok(Math.abs(flip.flipW - 5 / 18) < 1e-12);
  assert.ok(Math.abs(flip.distance - (5 / 18 - 0.1)) < 1e-12);
  // λ = 0.1/0.9/20 = 1/180, so budget's value is 1 − 0.5/180 = 359/360.
  assert.deepEqual(flip.challenger, { id: "budget", name: "budget", value: 359 / 360, priceEff: 0.5 });
});

test("leaderFlip: the challenger is the argmin over cheaper challengers", () => {
  const models = [makeModel("leader", 90, 10, 50), makeModel("mid", 70, 4, 100), makeModel("cheap", 40, 0.5, 200)];
  const flip = leaderFlip(role(0.1), models);
  assert.ok(flip);
  // λ_mid = 0.25/6 = 0.041667 beats λ_cheap = 0.625/9.5 = 0.065789.
  assert.equal(flip.challenger.id, "mid");
  assert.ok(Math.abs(flip.flipW - 0.4545454545454546) < 1e-12);
});

test("leaderFlip: null when no cheaper challenger exists", () => {
  // `a` is both the value leader and the cheapest model.
  const models = [makeModel("a", 90, 1, 50), makeModel("b", 60, 5, 200)];
  assert.equal(leaderFlip(role(0.1), models), null);
  assert.equal(leaderFlip(role(0.1), []), null);
});

test("leaderFlip: the degenerate case (value leader = quality leader) is the min formula, never 0", () => {
  // premium is both the value leader and the quality leader, so the naive
  // (q_QL − q_VL)/(p_QL − p_VL) is 0/0 — undefined, not zero.
  const def = role(0.1);
  const ranked = rankRole(def, MODELS);
  assert.equal(ranked[0].model.id, "premium");
  assert.ok(ranked[0].q > ranked[1].q, "the value leader is also the quality leader");
  const flip = leaderFlip(def, MODELS);
  assert.ok(flip);
  assert.ok(flip.flipW > 0, "a real threshold, not the naive 0");
  assert.ok(Math.abs(flip.flipW - 5 / 18) < 1e-12);
});

test("leaderFlip: flipW round-trips — the challenger ties at flipW, the leader wins just below", () => {
  const flip = leaderFlip(role(0.1), MODELS);
  assert.ok(flip);
  const at = rankRole(role(flip.flipW), MODELS);
  assert.ok(Math.abs(at[0].value - at[1].value) < 1e-9, "tie at flipW");
  const below = rankRole(role(flip.flipW - 1e-6), MODELS);
  assert.equal(below[0].model.id, "premium", "the leader still wins just below flipW");
  const above = rankRole(role(flip.flipW + 1e-6), MODELS);
  assert.equal(above[0].model.id, "budget", "the challenger wins just above flipW");
});

// Thinking-capable fixtures: the level's factor applies only to a model that
// actually runs the level (`model.thinking`).
const THINKING_MODELS = [makeModel("premium", 90, 20, 50, true), makeModel("budget", 60, 0.5, 200, true)];

test("thinkingLevelEffect: null for a bare role", () => {
  assert.equal(thinkingLevelEffect(role(0.2), THINKING_MODELS), null);
});

test("thinkingLevelEffect: one row per level, with the factor and the leader at that level", () => {
  const rows = thinkingLevelEffect(role(0.2, { thinking: "off" }), THINKING_MODELS);
  assert.ok(rows);
  assert.deepEqual(
    rows.map((r) => r.level),
    Object.keys(SUFFIX_LEVELS),
  );
  // (1 + 3·0.25 + overhead)/(1 + 3·0.25) = (7/4 + overhead)/(7/4).
  assert.deepEqual(
    rows.map((r) => r.factor),
    [1, 8 / 7, 10 / 7, 13 / 7, 19 / 7, 31 / 7, 55 / 7, 13 / 7],
  );
  // w_price 0.2 → λ 0.0125: premium leads through `low`, budget takes over at
  // `medium` (λ·factor crosses 0.375/19.5).
  assert.deepEqual(
    rows.map((r) => r.leader?.id),
    ["premium", "premium", "premium", "budget", "budget", "budget", "budget", "budget"],
  );
  assert.ok(Math.abs((rows[0].leader?.value ?? 0) - 1.125) < 1e-12);
  assert.ok(Math.abs((rows[3].leader?.value ?? 0) - 0.9883928571428571) < 1e-12);
});

test("thinkingLevelEffect: the factor is inert for models that do not run the level", () => {
  const rows = thinkingLevelEffect(role(0.2, { thinking: "off" }), MODELS);
  assert.ok(rows);
  assert.deepEqual(
    rows.map((r) => r.leader?.id),
    Object.keys(SUFFIX_LEVELS).map(() => "premium"),
  );
});

test("thinkingLevelEffect: a level that ranks nothing reports a null leader", () => {
  const rows = thinkingLevelEffect(role(0.2, { thinking: "off" }), []);
  assert.ok(rows);
  assert.equal(rows.length, Object.keys(SUFFIX_LEVELS).length);
  assert.ok(rows.every((r) => r.leader === null));
});
