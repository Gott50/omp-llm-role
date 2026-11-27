import assert from "node:assert/strict";
import { test } from "node:test";
import { enrichThinkingLevels, type CatalogEntry } from "../src/availability.ts";
import { makeModel } from "./helpers.ts";

function entry(
  provider: string,
  id: string,
  cost: { input: number; output: number } | null = null,
  thinking: string[] = [],
): CatalogEntry {
  return {
    provider,
    id,
    selector: `${provider}/${id}`,
    name: id,
    contextWindow: 200000,
    maxTokens: 8192,
    reasoning: thinking.length > 0,
    thinking,
    input: ["text"],
    cost,
  };
}

test("enrich attaches a provider offer with the 3:1 price and the row's thinking list", () => {
  const m = makeModel("deepseek-v4.1-flash", 50, 1, 100);
  enrichThinkingLevels([m], [entry("flocta", "deepseek-v4.1-flash", { input: 1, output: 3 }, ["low", "high"])]);
  assert.deepEqual(m.providerOffers, {
    flocta: { catalogId: "deepseek-v4.1-flash", price: 1.5, thinking: ["low", "high"] },
  });
});

test("a zero or absent catalog cost yields a null offer price", () => {
  const zero = makeModel("deepseek-v4.1-flash", 50, 1, 100);
  enrichThinkingLevels([zero], [entry("flocta", "deepseek-v4.1-flash", { input: 0, output: 0 })]);
  assert.equal(zero.providerOffers?.flocta.price, null);

  const absent = makeModel("deepseek-v4.1-flash", 50, 1, 100);
  enrichThinkingLevels([absent], [entry("flocta", "deepseek-v4.1-flash", null)]);
  assert.equal(absent.providerOffers?.flocta.price, null);
});

test("a provider with no row for the model is absent from the offers map", () => {
  const m = makeModel("deepseek-v4.1-flash", 50, 1, 100);
  enrichThinkingLevels([m], [entry("flocta", "some-other-model")]);
  assert.equal(m.providerOffers, undefined);
});

test("the provider's auto pseudo-model is excluded from the join", () => {
  const m = makeModel("auto", 50, 1, 100);
  enrichThinkingLevels([m], [entry("flocta", "auto")]);
  assert.equal(m.providerOffers, undefined);
});

test("a dated model id matches the provider's undated row", () => {
  const m = makeModel("deepseek-v4.1-flash-1017", 50, 1, 100);
  enrichThinkingLevels([m], [entry("flocta", "deepseek-v4.1-flash")]);
  assert.equal(m.providerOffers?.flocta.catalogId, "deepseek-v4.1-flash");
});

test("the thinking join is provider-scoped: neither provider's list leaks into the other", () => {
  const m = makeModel("deepseek-v4.1-flash", 50, 1, 100);
  enrichThinkingLevels([m], [
    entry("flocta", "deepseek-v4.1-flash", null, ["low"]),
    entry("openrouter", "deepseek/deepseek-v4.1-flash", null, ["high", "max"]),
  ]);
  // The OpenRouter row sets the selector's level list; the flocta row never does.
  assert.deepEqual(m.thinkingLevels, ["high", "max"]);
  // The flocta offer carries only the flocta row's list; the OpenRouter list never leaks in.
  assert.deepEqual(m.providerOffers?.flocta.thinking, ["low"]);
});

test("a non-OpenRouter row alone never sets thinkingLevels", () => {
  const m = makeModel("deepseek-v4.1-flash", 50, 1, 100);
  enrichThinkingLevels([m], [entry("flocta", "deepseek-v4.1-flash", null, ["low", "high"])]);
  assert.equal(m.thinkingLevels, undefined);
  assert.deepEqual(m.providerOffers?.flocta.thinking, ["low", "high"]);
});

test("no non-OpenRouter rows leaves providerOffers undefined and thinkingLevels unchanged", () => {
  const m = makeModel("deepseek-v4.1-flash", 50, 1, 100);
  enrichThinkingLevels([m], [entry("openrouter", "deepseek/deepseek-v4.1-flash", null, ["high"])]);
  assert.equal(m.providerOffers, undefined);
  assert.deepEqual(m.thinkingLevels, ["high"]);
});
