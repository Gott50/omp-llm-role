import assert from "node:assert/strict";
import { test } from "node:test";
import { paretoFrontier, rankRole, thinkingPriceFactor, type RoleDef } from "../src/engine.ts";
import { resolveSettings } from "../src/settings.ts";
import { makeModel } from "./helpers.ts";

// thinker: better quality and pricier, supports thinking; plain: cheaper, no thinking
// support (a non-thinking model ignores the role's suffix at write time).
const MODELS = [makeModel("thinker", 90, 4, 50, true), makeModel("plain", 80, 1, 50, false)];
const ROLE: RoleDef = { description: "", weights: { general: 0.9, price: 0.1 }, required: ["general", "price", "throughput"] };

test("bare and off roles leave the billed price unadjusted", () => {
  for (const r of rankRole(ROLE, MODELS)) assert.equal(r.priceEff, r.model.price);
  for (const r of rankRole({ ...ROLE, thinking: "off" }, MODELS)) assert.equal(r.priceEff, r.model.price);
});

test("a thinking level scales only thinking-capable models and can flip the rank order", () => {
  const bare = rankRole(ROLE, MODELS);
  assert.equal(bare[0].model.id, "thinker"); // quality wins at the billed price

  const suffixed = rankRole({ ...ROLE, thinking: "max" }, MODELS);
  const thinker = suffixed.find((r) => r.model.id === "thinker");
  const plain = suffixed.find((r) => r.model.id === "plain");
  assert.ok(thinker && plain);
  assert.ok(Math.abs(thinker.priceEff - thinker.model.price * thinkingPriceFactor("max")) < 1e-9);
  assert.equal(plain.priceEff, plain.model.price);
  assert.equal(suffixed[0].model.id, "plain"); // the inflated penalty flips the order
});

test("the frontier uses the effective price, so mixed thinking support breaks ties", () => {
  const pair = [makeModel("thinker", 90, 1, 50, true), makeModel("plain", 90, 1, 50, false)];
  const bare = rankRole(ROLE, pair);
  assert.deepEqual([...paretoFrontier(bare)].sort(), ["plain", "thinker"]); // equal price+q: tie keeps both

  const suffixed = rankRole({ ...ROLE, thinking: "high" }, pair);
  assert.deepEqual([...paretoFrontier(suffixed)], ["plain"]); // thinker's inflated price loses the tie
});

test("resolveSettings validates thinking and rejects the legacy suffixes map", () => {
  assert.deepEqual(resolveSettings({ roles: { slow: { thinking: "high" } } }).errors, []);
  assert.ok(resolveSettings({ roles: { slow: { thinking: "banana" } } }).errors.some((e) => e.includes("thinking")));
  assert.ok(resolveSettings({ suffixes: { smol: "off" } }).errors.some((e) => e.includes("roles.<role>.thinking")));
});
