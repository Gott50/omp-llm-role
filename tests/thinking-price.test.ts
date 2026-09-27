import assert from "node:assert/strict";
import { test } from "node:test";
import { paretoFrontier, rankRole, thinkingPriceFactor, type RoleDef } from "../src/engine.ts";
import { enrichThinkingLevels, type CatalogEntry } from "../src/availability.ts";
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

test("catalog thinking[] wins over the OR flag: an unsupported level is priced bare", () => {
  // thinker advertises thinking per OR but its catalog levels exclude max —
  // omp clamps, so the ranking prices it bare (matching the updater's gate).
  const models = [
    { ...makeModel("thinker", 90, 4, 50, true), thinkingLevels: ["low", "high"] },
    makeModel("plain", 80, 1, 50, false),
  ];
  const suffixed = rankRole({ ...ROLE, thinking: "max" }, models);
  const thinker = suffixed.find((r) => r.model.id === "thinker");
  assert.ok(thinker);
  assert.equal(thinker.priceEff, thinker.model.price);
  const supported = rankRole({ ...ROLE, thinking: "high" }, models);
  const thinkerHigh = supported.find((r) => r.model.id === "thinker");
  assert.ok(thinkerHigh);
  assert.ok(Math.abs(thinkerHigh.priceEff - thinker.model.price * thinkingPriceFactor("high")) < 1e-9);
});

test("catalog data wins even when OR advertises support with an empty level list", () => {
  const models = [{ ...makeModel("thinker", 90, 4, 50, true), thinkingLevels: [] }];
  const suffixed = rankRole({ ...ROLE, thinking: "max" }, models);
  assert.equal(suffixed[0].priceEff, suffixed[0].model.price);
});

test("meta levels (off/auto) never gate the factor for thinking-capable models", () => {
  const models = [{ ...makeModel("thinker", 90, 4, 50, true), thinkingLevels: ["low"] }];
  const auto = rankRole({ ...ROLE, thinking: "auto" }, models);
  assert.ok(Math.abs(auto[0].priceEff - models[0].price * thinkingPriceFactor("auto")) < 1e-9);
});

test("without catalog data the OR flag gates (standalone ranking fallback)", () => {
  const suffixed = rankRole({ ...ROLE, thinking: "max" }, MODELS);
  const thinker = suffixed.find((r) => r.model.id === "thinker");
  assert.ok(thinker);
  assert.ok(Math.abs(thinker.priceEff - thinker.model.price * thinkingPriceFactor("max")) < 1e-9);
});

test("enrichThinkingLevels joins by ranking id and leaves unmatched models alone", () => {
  const catalog: CatalogEntry[] = [
    { provider: "openrouter", id: "z-ai/glm-5.3", selector: "openrouter/z-ai/glm-5.3", name: "GLM", contextWindow: null, maxTokens: null, reasoning: true, thinking: ["low", "high", "max"], input: [], cost: null },
    { provider: "openrouter", id: "~z-ai/glm-latest", selector: "openrouter/~z-ai/glm-latest", name: "GLM", contextWindow: null, maxTokens: null, reasoning: true, thinking: ["low"], input: [], cost: null },
  ];
  const models = [makeModel("glm-5.3", 90, 4, 50, true), makeModel("unknown-model", 80, 1, 50, true)];
  enrichThinkingLevels(models, catalog);
  assert.deepEqual(models[0].thinkingLevels, ["low", "high", "max"]); // first non-empty wins
  assert.equal(models[1].thinkingLevels, undefined); // no catalog match: OR flag fallback
});
