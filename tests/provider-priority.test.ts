import assert from "node:assert/strict";
import { test } from "node:test";
import type { CatalogEntry } from "../src/availability.ts";
import type { Model } from "../src/engine.ts";
import {
  chainProviderOrder,
  effectiveProvider,
  priceBasisFor,
  providerBonusFor,
  providerOf,
  providerOffersFor,
  providerOrder,
} from "../src/provider-priority.ts";
import { makeModel } from "./helpers.ts";

function entry(provider: string, id: string, cost: { input: number; output: number } | null = null, thinking: string[] = []): CatalogEntry {
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

function model(id: string, price: number | null): Model {
  const m = makeModel(id, 50, price ?? 0, 100);
  m.price = price;
  return m;
}

// ---------------------------------------------------------------------------
// providerOf
// ---------------------------------------------------------------------------

test("providerOf returns the first path segment", () => {
  assert.equal(providerOf("flocta/deepseek-v4.1-flash"), "flocta");
  assert.equal(providerOf("flocta/deepseek/deepseek-v4.1-flash"), "flocta");
  assert.equal(providerOf("openrouter/z-ai/glm-5.3-flash"), "openrouter");
});

test("providerOf strips a trailing :level and an @slug pin", () => {
  assert.equal(providerOf("flocta/deepseek-v4.1-flash:high"), "flocta");
  assert.equal(providerOf("openrouter/x@deepinfra/fp8"), "openrouter");
  assert.equal(providerOf("openrouter/x@deepinfra/fp8:high"), "openrouter");
  assert.equal(providerOf("openrouter/z-ai/glm-4.7@cerebras:max"), "openrouter");
});

test("providerOf treats a bare selector as openrouter", () => {
  assert.equal(providerOf("deepseek-v4.1-flash"), "openrouter");
  assert.equal(providerOf("deepseek-v4.1-flash:high"), "openrouter");
});

// ---------------------------------------------------------------------------
// providerOrder
// ---------------------------------------------------------------------------

test("providerOrder appends openrouter to an empty list", () => {
  assert.deepEqual(providerOrder([]), ["openrouter"]);
});

test("providerOrder dedupes, preserves order and appends openrouter", () => {
  assert.deepEqual(providerOrder(["flocta"]), ["flocta", "openrouter"]);
  assert.deepEqual(providerOrder(["flocta", "other", "flocta"]), ["flocta", "other", "openrouter"]);
});

test("providerOrder keeps an explicit openrouter position", () => {
  assert.deepEqual(providerOrder(["openrouter", "flocta"]), ["openrouter", "flocta"]);
  assert.deepEqual(providerOrder(["flocta", "openrouter", "other"]), ["flocta", "openrouter", "other"]);
});

// ---------------------------------------------------------------------------
// providerOffersFor
// ---------------------------------------------------------------------------

test("empty priority list yields no offers (byte-identical to today)", () => {
  const m = model("deepseek-v4.1-flash", 1.5);
  const catalog = [entry("flocta", "deepseek/deepseek-v4.1-flash", { input: 1, output: 3 })];
  assert.deepEqual(providerOffersFor(m, catalog, providerOrder([])), {});
});

test("a single provider's offer carries its catalog id, price and thinking", () => {
  const m = model("deepseek-v4.1-flash", 1.5);
  const catalog = [entry("flocta", "deepseek/deepseek-v4.1-flash", { input: 1, output: 3 }, ["high"])];
  const offers = providerOffersFor(m, catalog, providerOrder(["flocta"]));
  assert.deepEqual(offers, {
    flocta: { catalogId: "deepseek/deepseek-v4.1-flash", price: 1.5, thinking: ["high"] },
  });
});

test("a multi-provider list attaches one offer per offering provider", () => {
  const m = model("deepseek-v4.1-flash", 1.5);
  const catalog = [
    entry("flocta", "deepseek/deepseek-v4.1-flash", { input: 1, output: 3 }),
    entry("other", "deepseek/deepseek-v4.1-flash", { input: 2, output: 2 }),
  ];
  const offers = providerOffersFor(m, catalog, providerOrder(["flocta", "other"]));
  assert.deepEqual(Object.keys(offers).sort(), ["flocta", "other"]);
  assert.equal(offers.flocta.price, 1.5);
  assert.equal(offers.other.price, 2);
});

test("a provider with no routable row is absent from the offers", () => {
  const m = model("deepseek-v4.1-flash", 1.5);
  const catalog = [entry("flocta", "deepseek/deepseek-v4.1-flash")];
  const offers = providerOffersFor(m, catalog, providerOrder(["flocta", "other"]));
  assert.deepEqual(Object.keys(offers), ["flocta"]);
});

test("a provider with an unknown price keeps the offer with a null price", () => {
  const m = model("deepseek-v4.1-flash", 1.5);
  const catalog = [entry("flocta", "deepseek/deepseek-v4.1-flash", null)];
  const offers = providerOffersFor(m, catalog, providerOrder(["flocta"]));
  assert.equal(offers.flocta.price, null);
});

test("a zero catalog cost is an unknown price, not a free model", () => {
  const m = model("deepseek-v4.1-flash", 1.5);
  const catalog = [entry("flocta", "deepseek/deepseek-v4.1-flash", { input: 0, output: 0 })];
  const offers = providerOffersFor(m, catalog, providerOrder(["flocta"]));
  assert.equal(offers.flocta.price, null);
});

test("a dated ranking id matches an undated provider id", () => {
  const m = model("deepseek-v4.1-flash-1017", 1.5);
  const catalog = [entry("flocta", "deepseek/deepseek-v4.1-flash", { input: 1, output: 3 })];
  const offers = providerOffersFor(m, catalog, providerOrder(["flocta"]));
  assert.equal(offers.flocta.catalogId, "deepseek/deepseek-v4.1-flash");
});

test("an undated ranking id matches the newest dated provider id", () => {
  const m = model("deepseek-v4.1-flash", 1.5);
  const catalog = [
    entry("flocta", "deepseek/deepseek-v4.1-flash-1017"),
    entry("flocta", "deepseek/deepseek-v4.1-flash-1103"),
  ];
  const offers = providerOffersFor(m, catalog, providerOrder(["flocta"]));
  assert.equal(offers.flocta.catalogId, "deepseek/deepseek-v4.1-flash-1103");
});

test("the provider's auto pseudo-model is excluded", () => {
  const m = model("auto", 1.5);
  const catalog = [entry("flocta", "flocta/auto")];
  assert.deepEqual(providerOffersFor(m, catalog, providerOrder(["flocta"])), {});
});

test("a row id that already carries the provider prefix is excluded", () => {
  const m = model("deepseek-v4.1-flash", 1.5);
  const catalog = [entry("flocta", "flocta/deepseek-v4.1-flash")];
  assert.deepEqual(providerOffersFor(m, catalog, providerOrder(["flocta"])), {});
});

test("the thinking join is provider-scoped", () => {
  const m = model("deepseek-v4.1-flash", 1.5);
  const catalog = [
    entry("flocta", "deepseek/deepseek-v4.1-flash", { input: 1, output: 3 }, ["high"]),
    entry("openrouter", "deepseek/deepseek-v4.1-flash", { input: 1, output: 3 }, ["low"]),
  ];
  const offers = providerOffersFor(m, catalog, providerOrder(["flocta"]));
  assert.deepEqual(offers.flocta.thinking, ["high"]);
  assert.equal("openrouter" in offers, false);
});

// ---------------------------------------------------------------------------
// effectiveProvider
// ---------------------------------------------------------------------------

test("empty priority list makes every model's effective provider openrouter", () => {
  const m = model("deepseek-v4.1-flash", 1.5);
  assert.equal(effectiveProvider(m, providerOrder([])), "openrouter");
});

test("the first listed provider that offers the model wins", () => {
  const m = model("deepseek-v4.1-flash", 1.5);
  m.providerOffers = {
    flocta: { catalogId: "deepseek/deepseek-v4.1-flash", price: 1.5, thinking: [] },
    other: { catalogId: "deepseek/deepseek-v4.1-flash", price: 2, thinking: [] },
  };
  assert.equal(effectiveProvider(m, providerOrder(["flocta", "other"])), "flocta");
  assert.equal(effectiveProvider(m, providerOrder(["other", "flocta"])), "other");
});

test("a model offered by none falls back to openrouter", () => {
  const m = model("deepseek-v4.1-flash", 1.5);
  assert.equal(effectiveProvider(m, providerOrder(["flocta", "other"])), "openrouter");
});

test("an explicit openrouter position is honored over a later provider", () => {
  const m = model("deepseek-v4.1-flash", 1.5);
  m.providerOffers = { other: { catalogId: "deepseek/deepseek-v4.1-flash", price: 2, thinking: [] } };
  assert.equal(effectiveProvider(m, providerOrder(["flocta", "openrouter", "other"])), "openrouter");
});

// ---------------------------------------------------------------------------
// providerBonusFor
// ---------------------------------------------------------------------------

test("the bonus decays by priority position", () => {
  const order = providerOrder(["flocta", "other"]);
  assert.equal(providerBonusFor("flocta", order, 0.3), 0.3);
  assert.equal(providerBonusFor("other", order, 0.3), 0.15);
});

test("openrouter and unlisted providers get no bonus", () => {
  const order = providerOrder(["flocta"]);
  assert.equal(providerBonusFor("openrouter", order, 0.3), 0);
  assert.equal(providerBonusFor("unlisted", order, 0.3), 0);
});

test("a model offered by several providers gets its highest-priority bonus", () => {
  const m = model("deepseek-v4.1-flash", 1.5);
  m.providerOffers = {
    flocta: { catalogId: "deepseek/deepseek-v4.1-flash", price: 1.5, thinking: [] },
    other: { catalogId: "deepseek/deepseek-v4.1-flash", price: 2, thinking: [] },
  };
  const order = providerOrder(["flocta", "other"]);
  assert.equal(providerBonusFor(effectiveProvider(m, order), order, 0.3), 0.3);
});

// ---------------------------------------------------------------------------
// priceBasisFor
// ---------------------------------------------------------------------------

test("empty priority list prices on the OpenRouter blend", () => {
  const m = model("deepseek-v4.1-flash", 1.5);
  assert.deepEqual(priceBasisFor(m, providerOrder([]), 1.5), { price: 1.5, source: "openrouter" });
});

test("a provider with a known price is a reference price", () => {
  const m = model("deepseek-v4.1-flash", 1.5);
  m.providerOffers = { flocta: { catalogId: "deepseek/deepseek-v4.1-flash", price: 2, thinking: [] } };
  assert.deepEqual(priceBasisFor(m, providerOrder(["flocta"]), 1.5), { price: 2, source: "reference" });
});

test("a provider with an unknown price uses the OpenRouter blend as a proxy", () => {
  const m = model("deepseek-v4.1-flash", 1.5);
  m.providerOffers = { flocta: { catalogId: "deepseek/deepseek-v4.1-flash", price: null, thinking: [] } };
  assert.deepEqual(priceBasisFor(m, providerOrder(["flocta"]), 1.5), { price: 1.5, source: "openrouter-proxy" });
});

test("a model with no provider offer prices on the OpenRouter blend", () => {
  const m = model("deepseek-v4.1-flash", 1.5);
  assert.deepEqual(priceBasisFor(m, providerOrder(["flocta"]), 1.5), { price: 1.5, source: "openrouter" });
});

// ---------------------------------------------------------------------------
// chainProviderOrder
// ---------------------------------------------------------------------------

test("the chain lists the model's other providers in priority order", () => {
  const m = model("deepseek-v4.1-flash", 1.5);
  m.providerOffers = {
    flocta: { catalogId: "deepseek/deepseek-v4.1-flash", price: 1.5, thinking: [] },
    other: { catalogId: "deepseek/deepseek-v4.1-flash", price: 2, thinking: [] },
  };
  const order = providerOrder(["flocta", "other"]);
  assert.deepEqual(chainProviderOrder(m, order, "flocta"), ["other", "openrouter"]);
  assert.deepEqual(chainProviderOrder(m, order, "openrouter"), ["flocta", "other"]);
});

test("openrouter is omitted from the chain when the model has no OpenRouter price", () => {
  const m = model("deepseek-v4.1-flash", null);
  m.providerOffers = {
    flocta: { catalogId: "deepseek/deepseek-v4.1-flash", price: 1.5, thinking: [] },
    other: { catalogId: "deepseek/deepseek-v4.1-flash", price: 2, thinking: [] },
  };
  assert.deepEqual(chainProviderOrder(m, providerOrder(["flocta", "other"]), "flocta"), ["other"]);
});

test("a model with only the chosen provider still chains to openrouter", () => {
  const m = model("deepseek-v4.1-flash", 1.5);
  m.providerOffers = { flocta: { catalogId: "deepseek/deepseek-v4.1-flash", price: 1.5, thinking: [] } };
  assert.deepEqual(chainProviderOrder(m, providerOrder(["flocta"]), "flocta"), ["openrouter"]);
});

test("empty priority list yields an empty chain", () => {
  const m = model("deepseek-v4.1-flash", 1.5);
  assert.deepEqual(chainProviderOrder(m, providerOrder([]), "openrouter"), []);
});
