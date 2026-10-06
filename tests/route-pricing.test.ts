import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { parse as parseYaml } from "yaml";
import {
  cardinalMetric,
  providerPinDrops,
  rankRole,
  thinkingPriceFactor,
  type OpenRouterEndpointRecord,
  type RoleDef,
} from "../src/engine.ts";
import { resolveSettings } from "../src/settings.ts";
import { explainModel } from "../src/explorer/explain.ts";
import { runUpdater } from "../src/updater.ts";
import { fakeDeps, makeCatalog, makeModel, runInTempDir, setupAgentDir } from "./helpers.ts";

// Route-aware pricing (issue #20): a role pinned to a provider (`providerPin`)
// is priced by that route — its billed price and p50 throughput — not the
// 1/price² blend. A model with no matching route is ineligible; an unpinned
// role ignores `routes` entirely.

function route(over: Partial<OpenRouterEndpointRecord> = {}): OpenRouterEndpointRecord {
  return {
    id: "r",
    providerSlug: "prov",
    serviceTier: null,
    status: 0,
    free: false,
    variant: "org/m-1",
    price: 1,
    weightPrice: 1,
    tput: 10,
    latency: null,
    contextLength: null,
    maxCompletionTokens: null,
    supportsTools: null,
    ...over,
  };
}

function roleWith(over: Partial<RoleDef> = {}): RoleDef {
  return { description: "t", weights: { general: 0.5, price: 0.5 }, required: ["general", "price"], ...over };
}

/** A role that weights throughput so `parts.throughput` is the cardinal transform
 * of the raw value (qW = 0.5, w = 0.5). */
function tputRole(over: Partial<RoleDef> = {}): RoleDef {
  return roleWith({ weights: { throughput: 0.5, price: 0.5 }, required: ["throughput", "price"], ...over });
}

// --- pricing -----------------------------------------------------------------

test("a pinned role prices the matching route, not the blend", () => {
  const m = makeModel("m", 40, 5, 100); // blend price 5
  m.routes = [route({ providerSlug: "cerebras", price: 2 }), route({ id: "r2", providerSlug: "other", price: 9 })];
  const ranked = rankRole(roleWith({ providerPin: "cerebras" }), [m]);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].priceEff, 2);
});

test("a pinned role's priceEff is the route price × the thinking factor", () => {
  const m = makeModel("m", 40, 5, 100, true);
  m.routes = [route({ providerSlug: "cerebras", price: 2 })];
  const ranked = rankRole(roleWith({ providerPin: "cerebras", thinking: "high" }), [m]);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].priceEff, 2 * thinkingPriceFactor("high"));
});

test("a tiered pin matches the route slug verbatim", () => {
  const m = makeModel("m", 40, 5, 100);
  m.routes = [route({ providerSlug: "deepinfra/fp8", price: 3 }), route({ id: "r2", providerSlug: "deepinfra", price: 7 })];
  const ranked = rankRole(roleWith({ providerPin: "deepinfra/fp8" }), [m]);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].priceEff, 3);
});

test("maxPriceUsdPerM caps the pinned route price", () => {
  const m = makeModel("m", 40, 5, 100);
  m.routes = [route({ providerSlug: "cerebras", price: 8 })];
  const def = roleWith({ providerPin: "cerebras", filters: { maxPriceUsdPerM: 5 } });
  assert.deepEqual(rankRole(def, [m]), []);
});

// --- throughput --------------------------------------------------------------

test("a pinned role's throughput is the route's p50", () => {
  const m = makeModel("m", 40, 5, 100); // blend throughput 100
  m.routes = [route({ providerSlug: "cerebras", tput: 42 })];
  const ranked = rankRole(tputRole({ providerPin: "cerebras" }), [m]);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].parts.throughput, cardinalMetric("throughput", 42));
});

test("a pinned route with no p50 falls back to the model's blended throughput", () => {
  const m = makeModel("m", 40, 5, 100);
  m.routes = [route({ providerSlug: "cerebras", tput: null })];
  const ranked = rankRole(tputRole({ providerPin: "cerebras" }), [m]);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].parts.throughput, cardinalMetric("throughput", 100));
});

// --- eligibility -------------------------------------------------------------

test("a model with no matching route is ineligible for a pinned role", () => {
  const m = makeModel("m", 40, 5, 100);
  m.routes = [route({ providerSlug: "other" })];
  const def = roleWith({ providerPin: "cerebras" });
  assert.deepEqual(rankRole(def, [m]), []);
  assert.deepEqual(providerPinDrops(def, [m]), ["m"]);
});

test("a model with no route data is ineligible for a pinned role", () => {
  const m = makeModel("m", 40, 5, 100); // routes undefined
  const def = roleWith({ providerPin: "cerebras" });
  assert.deepEqual(rankRole(def, [m]), []);
  assert.deepEqual(providerPinDrops(def, [m]), ["m"]);
});

test("providerPinDrops is empty for an unpinned role", () => {
  const m = makeModel("m", 40, 5, 100);
  m.routes = [route({ providerSlug: "other" })];
  assert.deepEqual(providerPinDrops(roleWith(), [m]), []);
});

// --- unpinned unchanged ------------------------------------------------------

test("an unpinned role ignores routes and keeps the blend", () => {
  const m = makeModel("m", 40, 5, 100);
  m.routes = [route({ providerSlug: "cerebras", price: 2, tput: 42 })];
  const ranked = rankRole(tputRole(), [m]);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].priceEff, 5); // blend, not the route's 2
  assert.equal(ranked[0].parts.throughput, cardinalMetric("throughput", 100)); // blend, not 42
});

// --- validation --------------------------------------------------------------

test("resolveSettings accepts a providerPin and rejects bad ones", () => {
  const ok = resolveSettings({ "roles.default.providerPin": "deepinfra/fp8" });
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.settings.roles.default.providerPin, "deepinfra/fp8");

  for (const bad of ["", "a@b", "a:b", 5]) {
    const { errors } = resolveSettings({ "roles.default.providerPin": bad });
    assert.ok(
      errors.some((e) => e.includes("providerPin must be a non-empty string")),
      `expected a providerPin error for ${JSON.stringify(bad)}`,
    );
  }
});

// --- explorer explanation ----------------------------------------------------

test("explainModel reports a pinned model with no matching route as ineligible", () => {
  const m = makeModel("m", 40, 5, 100);
  m.routes = [route({ providerSlug: "other" })];
  const ex = explainModel(roleWith({ providerPin: "cerebras" }), [m], "m");
  assert.equal(ex.eligible, false);
  if (!ex.eligible) assert.ok(ex.reasons.some((r) => r.includes("provider pin")));
});

test("explainModel prices a pinned model by its route", () => {
  const m = makeModel("m", 40, 5, 100);
  m.routes = [route({ providerSlug: "cerebras", price: 2, tput: 42 })];
  const ex = explainModel(tputRole({ providerPin: "cerebras" }), [m], "m");
  assert.equal(ex.eligible, true);
  if (ex.eligible) {
    assert.equal(ex.priceEff, 2);
    assert.equal(ex.cost.billedPrice, 2);
    const t = ex.contributions.find((c) => c.metric === "throughput");
    assert.ok(t);
    assert.equal(t.raw, 42);
  }
});

// --- decision recording ------------------------------------------------------

test("the updater records provider-pin drops on the decision", async () => {
  const pinned = makeModel("model-a", 90, 1, 100);
  pinned.routes = [route({ providerSlug: "cerebras" })];
  const unpinned = makeModel("model-b", 80, 1, 100);
  unpinned.routes = [route({ providerSlug: "other" })];
  const dir = setupAgentDir("other: 1\n");
  const deps = fakeDeps([pinned, unpinned], { "roles.default.providerPin": "cerebras" });
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true, dryRun: true }));
  const d = result.decisions.find((x) => x.role === "default");
  assert.ok(d);
  assert.equal(d.to, "openrouter/org/model-a@cerebras:auto");
  assert.deepEqual(d.pinBlocked, ["model-b"]);
});

// --- emission ----------------------------------------------------------------

test("a pinned role emits the @<slug> selector; chain key and values carry the pin", async () => {
  const a = makeModel("model-a", 90, 1, 100);
  a.routes = [route({ providerSlug: "cerebras" })];
  const b = makeModel("model-b", 80, 1, 100);
  b.routes = [route({ providerSlug: "cerebras" })];
  const dir = setupAgentDir("other: 1\n");
  const deps = fakeDeps([a, b], { "roles.default.providerPin": "cerebras" });
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  assert.equal(result.aborted, undefined);
  const doc = parseYaml(readFileSync(join(dir, "config.yml"), "utf8")) as {
    modelRoles: Record<string, string>;
    retry: { fallbackChains: Record<string, string[]> };
  };
  assert.equal(doc.modelRoles.default, "openrouter/org/model-a@cerebras:auto");
  // The chain key is level-free and pinned; every value carries the same pin.
  assert.deepEqual(doc.retry.fallbackChains["openrouter/org/model-a@cerebras"], ["openrouter/org/model-b@cerebras:auto"]);
});

test("a pinned current selector is visible to hysteresis", async () => {
  const a = makeModel("model-a", 90, 1, 100);
  a.routes = [route({ providerSlug: "cerebras" })];
  const b = makeModel("model-b", 80, 5, 60);
  b.routes = [route({ providerSlug: "cerebras" })];
  const dir = setupAgentDir('modelRoles:\n  default: "openrouter/org/model-b@cerebras:auto"\n');
  const deps = fakeDeps([a, b], { "roles.default.providerPin": "cerebras", switchMargin: 0.6, priceSwitchFraction: 0 });
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true, dryRun: true }));
  const d = result.decisions.find((x) => x.role === "default");
  assert.ok(d);
  // The pinned incumbent is recognized (not "no-current") and kept.
  assert.equal(d.reason, "kept-margin");
  assert.equal(d.to, "openrouter/org/model-b@cerebras:auto");
});

// --- no-match guard ----------------------------------------------------------

test("a pin matching no route leaves the role unchanged with a notify", async () => {
  const a = makeModel("model-a", 90, 1, 100);
  a.routes = [route({ providerSlug: "other" })];
  const dir = setupAgentDir("modelRoles:\n  default: openrouter/org/model-a\n");
  const notified: string[] = [];
  const deps = fakeDeps([a], { "roles.default.providerPin": "cerebras" }, { notify: (lines) => notified.push(...lines) });
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  assert.equal(result.aborted, undefined);
  assert.equal(result.decisions.some((d) => d.role === "default"), false);
  assert.ok(notified.some((l) => l.includes("default") && l.includes("cerebras") && l.includes("no route")));
  // No selector write: the existing line is byte-identical.
  const text = readFileSync(join(dir, "config.yml"), "utf8");
  assert.ok(text.includes("  default: openrouter/org/model-a\n"));
});

test("a pin matching no route preserves the role's existing chain", async () => {
  const a = makeModel("model-a", 90, 1, 100);
  a.routes = [route({ providerSlug: "other" })];
  const config = "modelRoles:\n  default: openrouter/org/model-a@cerebras\nretry:\n  fallbackChains:\n    openrouter/org/model-a@cerebras:\n      - openrouter/org/model-b@cerebras\n";
  const dir = setupAgentDir(config, {
    lastRunDay: null,
    managedRoles: ["default"],
    roleLastSelector: {},
    pluginWrittenChainKeys: ["openrouter/org/model-a@cerebras"],
    previousModelRoles: null,
  });
  const deps = fakeDeps([a], { "roles.default.providerPin": "cerebras" });
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  assert.equal(result.aborted, undefined);
  const doc = parseYaml(readFileSync(join(dir, "config.yml"), "utf8")) as { retry: { fallbackChains: Record<string, string[]> } };
  // The pinned chain key is referenced, not pruned.
  assert.deepEqual(doc.retry.fallbackChains["openrouter/org/model-a@cerebras"], ["openrouter/org/model-b@cerebras"]);
});
