/** The `plan` cost posture (issue #16): the price weight must bind on the pool
 * the selector is actually chosen from, so a cheaper model whose weighted
 * `long_context` is *imputed* (capability fill — llm-stats has no evidence, not
 * a zero) outranks a dearer one that has it measured, once λ reaches the shipped
 * value.
 *
 * The fixture role derives its non-price weights from the shipped `plan` shape
 * rescaled to (1 − price), so `q` is invariant and only the price term moves —
 * no weight constant is re-pinned. `at(SHIPPED.price)` reproduces the shipped
 * definition. */

import assert from "node:assert/strict";
import { test } from "node:test";
import { rankRole, type Model, type RoleDef } from "../src/engine.ts";
import { DEFAULT_ROLES } from "../src/settings.ts";

const SHIPPED = DEFAULT_ROLES.plan.weights;
const SHAPE = {
  general: SHIPPED.general / (1 - SHIPPED.price),
  long_context: SHIPPED.long_context / (1 - SHIPPED.price),
  throughput: SHIPPED.throughput / (1 - SHIPPED.price),
};

/** `plan` at an arbitrary price weight: the non-price weights are the shipped
 * shape rescaled to (1 − price), keeping Σ(weights) = 1. */
function at(price: number): RoleDef {
  const k = 1 - price;
  return {
    ...DEFAULT_ROLES.plan,
    weights: {
      general: SHAPE.general * k,
      long_context: SHAPE.long_context * k,
      throughput: SHAPE.throughput * k,
      price,
    },
  };
}

function planner(id: string, general: number, tput: number, price: number, longContext: number | null): Model {
  return {
    id,
    name: id,
    org: "Org",
    orgId: "org",
    context: 200_000,
    multimodal: false,
    thinking: false,
    price,
    throughput: tput,
    designElo: null,
    designEloAgents: null,
    writingBench: null,
    metrics: { general, reasoning: general, long_context: longContext, throughput: tput, price },
  };
}

// The measured 2026-10-03 pair: DeepSeek-V4.1-Flash is 5.4× cheaper and leads on
// the measured axes (general 51.2 vs 50.4, 81 vs 36 tok/s), but its
// index_long_context is null, so it scores the 0.195 capability fill against
// Hy4 preview's measured 18.9.
const POOL: Model[] = [
  planner("deepseek-v4.1-flash", 51.2, 81, 0.43, null),
  planner("hy4-preview", 50.4, 36, 2.32, 18.9),
];

test("plan cost posture: the price weight binds on an imputed-capability pool", () => {
  // λ = 0: quality decides — the dearer model's measured long_context wins.
  assert.equal(rankRole(at(0), POOL)[0].model.id, "hy4-preview");

  // A price weight below the binding threshold leaves the quality leader in front.
  assert.equal(rankRole(at(0.05), POOL)[0].model.id, "hy4-preview");

  // The shipped weights: the price term outweighs the imputed-capability edge.
  assert.equal(rankRole(at(SHIPPED.price), POOL)[0].model.id, "deepseek-v4.1-flash");

  // The flip is the price term, not the capability blend: `q` is invariant
  // across price weights.
  const cheapQ = (d: RoleDef) => rankRole(d, POOL).find((r) => r.model.id === "deepseek-v4.1-flash")?.q ?? NaN;
  assert.ok(Math.abs(cheapQ(at(0)) - cheapQ(at(SHIPPED.price))) < 1e-12);
});
