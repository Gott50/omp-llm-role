import assert from "node:assert/strict";
import { test } from "node:test";
import { effectiveThinkingLevel, paretoFrontier, rankRole, SUFFIX_LEVELS, thinkingAdjustedPrice, thinkingPriceFactor, type RoleDef } from "../src/engine.ts";
import { enrichCatalogData, type CatalogEntry } from "../src/availability.ts";
import { deriveSettingsSchema, resolveSettings } from "../src/settings.ts";
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

test("catalog thinking[] wins over the OR flag: an unsupported level clamps to the model's range", () => {
  // thinker advertises thinking per OR but its catalog levels exclude max — the
  // clamp runs it at the model's highest level at or below the pin (`high`), so
  // the ranking prices it at `high`'s factor, not `max`'s and not bare.
  const models = [
    { ...makeModel("thinker", 90, 4, 50, true), thinkingLevels: ["low", "high"] },
    makeModel("plain", 80, 1, 50, false),
  ];
  const suffixed = rankRole({ ...ROLE, thinking: "max" }, models);
  const thinker = suffixed.find((r) => r.model.id === "thinker");
  assert.ok(thinker);
  assert.ok(Math.abs(thinker.priceEff - thinker.model.price * thinkingPriceFactor("high")) < 1e-9);
  const supported = rankRole({ ...ROLE, thinking: "high" }, models);
  const thinkerHigh = supported.find((r) => r.model.id === "thinker");
  assert.ok(thinkerHigh);
  assert.ok(Math.abs(thinkerHigh.priceEff - thinker.model.price * thinkingPriceFactor("high")) < 1e-9);
});

test("catalog data wins even when OR advertises support with an empty level list", () => {
  // The catalog's empty list is authoritative: the model runs `off`, priced 1×.
  const models = [{ ...makeModel("thinker", 90, 4, 50, true), thinkingLevels: [] }];
  const suffixed = rankRole({ ...ROLE, thinking: "max" }, models);
  assert.equal(suffixed[0].priceEff, suffixed[0].model.price);
});

test("a pin above the model's range clamps to the model's highest level", () => {
  const models = [{ ...makeModel("thinker", 90, 4, 50, true), thinkingLevels: ["low"] }];
  const high = rankRole({ ...ROLE, thinking: "high" }, models);
  assert.ok(Math.abs(high[0].priceEff - models[0].price * thinkingPriceFactor("low")) < 1e-9);
});

test("without catalog data the OR flag gates (standalone ranking fallback)", () => {
  const suffixed = rankRole({ ...ROLE, thinking: "max" }, MODELS);
  const thinker = suffixed.find((r) => r.model.id === "thinker");
  assert.ok(thinker);
  assert.ok(Math.abs(thinker.priceEff - thinker.model.price * thinkingPriceFactor("max")) < 1e-9);
});

test("enrichCatalogData joins by ranking id and leaves unmatched models alone", () => {
  const catalog: CatalogEntry[] = [
    { provider: "openrouter", id: "z-ai/glm-5.3", selector: "openrouter/z-ai/glm-5.3", name: "GLM", contextWindow: null, maxTokens: null, reasoning: true, thinking: ["low", "high", "max"], input: [], cost: null },
    { provider: "openrouter", id: "~z-ai/glm-latest", selector: "openrouter/~z-ai/glm-latest", name: "GLM", contextWindow: null, maxTokens: null, reasoning: true, thinking: ["low"], input: [], cost: null },
  ];
  const models = [makeModel("glm-5.3", 90, 4, 50, true), makeModel("unknown-model", 80, 1, 50, true)];
  enrichCatalogData(models, catalog);
  assert.deepEqual(models[0].thinkingLevels, ["low", "high", "max"]); // first non-empty wins
  assert.equal(models[1].thinkingLevels, undefined); // no catalog match: OR flag fallback
});

test("thinkingAdjustedPrice honors an explicit provider level list", () => {
  const m = makeModel("m", 90, 4, 50, true);
  const def: RoleDef = { ...ROLE, thinking: "high" };
  const factor = thinkingPriceFactor("high");
  // A level the provider advertises applies the factor.
  assert.equal(thinkingAdjustedPrice(m, def, 4, ["low", "high"]), 4 * factor);
  // A level it does not advertise clamps to the provider's highest at or below
  // the pin (`low`).
  assert.equal(thinkingAdjustedPrice(m, def, 4, ["low"]), 4 * thinkingPriceFactor("low"));
  // A non-thinking provider runs `off`, priced 1×.
  assert.equal(thinkingAdjustedPrice(m, def, 4, []), 4);
});

// ---------------------------------------------------------------------------
// The effective-level seam (issue #128): the one pure clamp, mirroring omp's
// `clampThinkingLevelForModel` (the floor rule).
// ---------------------------------------------------------------------------

test("effectiveThinkingLevel: the floor clamp table", () => {
  // pin in range -> pin
  assert.equal(effectiveThinkingLevel("medium", ["low", "medium", "high"], true), "medium");
  // pin between two supported levels -> the lower one
  assert.equal(effectiveThinkingLevel("medium", ["low", "high"], true), "low");
  // pin above the model's highest -> the model's highest
  assert.equal(effectiveThinkingLevel("max", ["low", "high"], true), "high");
  // pin below the model's lowest -> the model's lowest
  assert.equal(effectiveThinkingLevel("minimal", ["high", "xhigh"], true), "high");
  // a gap case: `minimal,high,xhigh` with pin `medium` -> `minimal`, never `high`
  assert.equal(effectiveThinkingLevel("medium", ["minimal", "high", "xhigh"], true), "minimal");
  // empty range -> off
  assert.equal(effectiveThinkingLevel("medium", [], true), "off");
  // no catalog -> reasoning ? pin : off
  assert.equal(effectiveThinkingLevel("medium", undefined, true), "medium");
  assert.equal(effectiveThinkingLevel("medium", undefined, false), "off");
  // off -> off
  assert.equal(effectiveThinkingLevel("off", ["high"], true), "off");
});

test("effectiveThinkingLevel is order-independent and ignores unknown levels", () => {
  assert.equal(effectiveThinkingLevel("medium", ["high", "low"], true), "low");
  assert.equal(effectiveThinkingLevel("medium", ["banana", "low"], true), "low");
  assert.equal(effectiveThinkingLevel("medium", ["banana"], true), "off");
});

test("resolveSettings maps a legacy auto to medium and fills an omitted level", () => {
  const legacy = resolveSettings({ roles: { slow: { thinking: "auto" } } });
  assert.deepEqual(legacy.errors, []);
  assert.equal(legacy.settings.roles.slow.thinking, "medium");
  // An omitted level resolves to medium (every resolved def is pinned). A
  // lock-file-only role (not deep-merged over a shipped def) keeps its weights.
  const omitted = resolveSettings({ roles: { brandnew: { weights: { general: 0.9, price: 0.1 }, required: ["general", "price"] } } });
  assert.deepEqual(omitted.errors, []);
  assert.equal(omitted.settings.roles.brandnew.thinking, "medium");
  // `auto` is no longer a schema value.
  assert.ok(!Object.keys(SUFFIX_LEVELS).includes("auto"));
  assert.ok(!deriveSettingsSchema()["roles.slow.thinking"].values.includes("auto"));
});
