import assert from "node:assert/strict";
import { test } from "node:test";
import { filterCatalog, tierGate, type CatalogEntry } from "../src/availability.ts";

function entry(id: string): CatalogEntry {
  return {
    provider: "openrouter",
    id,
    selector: `openrouter/${id}`,
    name: id,
    contextWindow: 200000,
    maxTokens: 8192,
    reasoning: false,
    thinking: [],
    input: ["text"],
    cost: null,
  };
}

test("paid key with budget -> billed tier", () => {
  const tier = tierGate({ isFreeTier: false, limitRemaining: 8.9, freeRemaining: 1000, creditsRemaining: 800 });
  assert.equal(tier, "billed");
});

test("free-tier key -> free tier even with credits", () => {
  const tier = tierGate({ isFreeTier: true, limitRemaining: 0, freeRemaining: 5, creditsRemaining: 100 });
  assert.equal(tier, "free");
});

test("no budget on either branch -> none", () => {
  const tier = tierGate({ isFreeTier: true, limitRemaining: 0, freeRemaining: 0, creditsRemaining: 0 });
  assert.equal(tier, "none");
});

test("paid key with exhausted daily limit -> none (no free quota either)", () => {
  const tier = tierGate({ isFreeTier: false, limitRemaining: 0, freeRemaining: 0, creditsRemaining: 0 });
  assert.equal(tier, "none");
});

test("billed filter keeps plain ids, drops :free and :batch", () => {
  const kept = filterCatalog([entry("org/a"), entry("org/a:free"), entry("org/a:batch")], "billed");
  assert.deepEqual(kept.map((c) => c.id), ["org/a"]);
});

test("free tier keeps only :free ids, drops :batch and plain ids", () => {
  const kept = filterCatalog([entry("org/a"), entry("org/a:free"), entry("org/a:batch")], "free");
  assert.deepEqual(kept.map((c) => c.id), ["org/a:free"]);
});

test("none tier -> empty catalog", () => {
  assert.deepEqual(filterCatalog([entry("org/a")], "none"), []);
});

test("non-openrouter providers are always filtered out", () => {
  const foreign: CatalogEntry = { ...entry("x/y"), provider: "anthropic" };
  assert.deepEqual(filterCatalog([foreign], "billed"), []);
});