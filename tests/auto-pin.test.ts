import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { parse as parseYaml } from "yaml";
import type { Model, OpenRouterEndpointRecord } from "../src/engine.ts";
import { runUpdater } from "../src/updater.ts";
import { fakeDeps, makeModel, runInTempDir, setupAgentDir } from "./helpers.ts";

// Auto-pin (issue #61, spec #58; expanded by #69): when a role's expanded def
// has `preferOwnProvider === true` and no manual `providerPin`, the updater
// writes the chosen model's best route as the selector's `@<slug>` suffix and
// fills the fallback chain with every gate-passing route of the primary model
// (all but the pinned best) and of each fallback model, in route-value order,
// deduped by chain value. A manual pin is a hard gate and always wins; a model
// with no candidate route keeps default routing (bare selector).

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
    cacheReadPrice: null,
    tput: 10,
    latency: null,
    contextLength: null,
    maxCompletionTokens: null,
    supportsTools: null,
    ...over,
  };
}

/** A model whose routes are `slugs`, priced 1..n (so the first slug is the best
 * route by value) at the model's own throughput. */
function routed(id: string, general: number, price: number, tput: number, slugs: string[]): Model {
  const m = makeModel(id, general, price, tput);
  m.routes = slugs.map((slug, i) => route({ id: `${id}-${slug}`, providerSlug: slug, price: i + 1, tput }));
  return m;
}

/** Opt every shipped role except `default` out, so a test's chain assertions are
 * not perturbed by another role claiming the same chain key. */
const ONLY_DEFAULT = Object.fromEntries(
  ["smol", "slow", "vision", "plan", "commit", "tiny", "task", "advisor", "designer"].map((r) => [r, { enabled: false }]),
);

function onlyDefault(extra: Record<string, unknown> = {}): Record<string, unknown> {
  const { roles, ...rest } = extra;
  return { ...rest, roles: { ...ONLY_DEFAULT, ...(roles as Record<string, unknown> | undefined) } };
}

/** model-a's best route is `cheap`; model-b's is `b1`; model-c's is `c1`. All
 * three share a `mid` route so a manual `mid` pin keeps every model eligible. */
const MODELS = [
  routed("model-a", 90, 1, 100, ["cheap", "mid", "exp"]),
  routed("model-b", 80, 5, 60, ["b1", "mid", "b3"]),
  routed("model-c", 70, 10, 30, ["c1", "mid", "c3"]),
];

function readConfig(dir: string): { modelRoles: Record<string, string>; retry: { fallbackChains: Record<string, string[]> } } {
  return parseYaml(readFileSync(join(dir, "config.yml"), "utf8")) as {
    modelRoles: Record<string, string>;
    retry: { fallbackChains: Record<string, string[]> };
  };
}

// --- trigger -----------------------------------------------------------------

test("the capability on writes the best route as the selector's @<slug>", async () => {
  const dir = setupAgentDir("other: 1\n");
  const deps = fakeDeps(MODELS, onlyDefault({ roles: { default: { preferOwnProvider: true } } }));
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  assert.equal(result.aborted, undefined);
  assert.equal(readConfig(dir).modelRoles.default, "openrouter/org/model-a@cheap:auto");
});

test("the providerPinning feature flag enables the auto-pin", async () => {
  const dir = setupAgentDir("other: 1\n");
  const deps = fakeDeps(MODELS, onlyDefault({ features: { providerPinning: true } }));
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  assert.equal(result.aborted, undefined);
  assert.equal(readConfig(dir).modelRoles.default, "openrouter/org/model-a@cheap:auto");
});

test("the capability off writes a bare selector", async () => {
  const dir = setupAgentDir("other: 1\n");
  const deps = fakeDeps(MODELS, onlyDefault());
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  assert.equal(result.aborted, undefined);
  const doc = readConfig(dir);
  assert.equal(doc.modelRoles.default, "openrouter/org/model-a:auto");
  assert.deepEqual(doc.retry.fallbackChains["openrouter/org/model-a"], ["openrouter/org/model-b:auto", "openrouter/org/model-c:auto"]);
});

// --- manual pin wins ---------------------------------------------------------

test("a manual providerPin wins and the selector carries the manual slug", async () => {
  const dir = setupAgentDir("other: 1\n");
  const deps = fakeDeps(MODELS, onlyDefault({ roles: { default: { providerPin: "mid", preferOwnProvider: true } } }));
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  assert.equal(result.aborted, undefined);
  const doc = readConfig(dir);
  assert.equal(doc.modelRoles.default, "openrouter/org/model-a@mid:auto");
  // The manual pin is hard: every chain value carries it, not the auto route.
  assert.deepEqual(doc.retry.fallbackChains["openrouter/org/model-a@mid"], ["openrouter/org/model-b@mid:auto", "openrouter/org/model-c@mid:auto"]);
});

// --- locked / disabled -------------------------------------------------------

test("a locked role's selector is untouched", async () => {
  const dir = setupAgentDir("modelRoles:\n  default: openrouter/org/model-b:auto\n", {
    lastRunDay: null,
    managedRoles: [],
    roleLastSelector: {},
    pluginWrittenChainKeys: [],
    previousModelRoles: null,
  });
  const deps = fakeDeps(MODELS, onlyDefault({ roles: { default: { locked: true, preferOwnProvider: true } } }));
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  assert.equal(result.aborted, undefined);
  assert.equal(readConfig(dir).modelRoles.default, "openrouter/org/model-b:auto");
});

test("a disabled role is not pinned", async () => {
  const dir = setupAgentDir("modelRoles:\n  default: openrouter/org/model-b:auto\n", {
    lastRunDay: null,
    managedRoles: [],
    roleLastSelector: {},
    pluginWrittenChainKeys: [],
    previousModelRoles: null,
  });
  const deps = fakeDeps(MODELS, onlyDefault({ roles: { default: { enabled: false, preferOwnProvider: true } } }));
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  assert.equal(result.aborted, undefined);
  assert.equal(readConfig(dir).modelRoles.default, "openrouter/org/model-b:auto");
});

// --- no candidate route ------------------------------------------------------

test("a chosen model with no candidate route keeps default routing", async () => {
  const a = makeModel("model-a", 90, 1, 100);
  a.routes = [route({ providerSlug: "degraded", status: 1, price: 1 })]; // degraded ⇒ no candidate
  const b = makeModel("model-b", 80, 5, 60);
  b.routes = [route({ providerSlug: "b1", price: 1 })];
  const c = makeModel("model-c", 70, 10, 30);
  c.routes = [route({ providerSlug: "c1", price: 1 })];
  const dir = setupAgentDir("other: 1\n");
  const deps = fakeDeps([a, b, c], onlyDefault({ roles: { default: { preferOwnProvider: true } } }));
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  assert.equal(result.aborted, undefined);
  const doc = readConfig(dir);
  assert.equal(doc.modelRoles.default, "openrouter/org/model-a:auto");
  assert.deepEqual(doc.retry.fallbackChains["openrouter/org/model-a"], ["openrouter/org/model-b:auto", "openrouter/org/model-c:auto"]);
});

// --- chain shape -------------------------------------------------------------

test("the chain has the exact 8-value shape at depth 2", async () => {
  const dir = setupAgentDir("other: 1\n");
  const deps = fakeDeps(MODELS, onlyDefault({ roles: { default: { preferOwnProvider: true } } }));
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  assert.equal(result.aborted, undefined);
  const doc = readConfig(dir);
  assert.equal(doc.modelRoles.default, "openrouter/org/model-a@cheap:auto");
  const chain = doc.retry.fallbackChains["openrouter/org/model-a@cheap"];
  // Every gate-passing route: the primary's non-pinned routes, then each
  // fallback model's routes. The fixture's models have 3 routes each, so the
  // count is unchanged (2 + 3 + 3 = 8) — the rule is "all gate-passing routes",
  // not "top-3".
  assert.deepEqual(chain, [
    "openrouter/org/model-a@mid:auto",
    "openrouter/org/model-a@exp:auto",
    "openrouter/org/model-b@b1:auto",
    "openrouter/org/model-b@mid:auto",
    "openrouter/org/model-b@b3:auto",
    "openrouter/org/model-c@c1:auto",
    "openrouter/org/model-c@mid:auto",
    "openrouter/org/model-c@c3:auto",
  ]);
  assert.equal(chain.length, 8);
});

test("a model with only one candidate route contributes only that route", async () => {
  const models = [
    routed("model-a", 90, 1, 100, ["cheap", "mid", "exp"]),
    routed("model-b", 80, 5, 60, ["b1"]),
    routed("model-c", 70, 10, 30, ["c1"]),
  ];
  const dir = setupAgentDir("other: 1\n");
  const deps = fakeDeps(models, onlyDefault({ roles: { default: { preferOwnProvider: true } } }));
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  assert.equal(result.aborted, undefined);
  const doc = readConfig(dir);
  assert.deepEqual(doc.retry.fallbackChains["openrouter/org/model-a@cheap"], [
    "openrouter/org/model-a@mid:auto",
    "openrouter/org/model-a@exp:auto",
    "openrouter/org/model-b@b1:auto",
    "openrouter/org/model-c@c1:auto",
  ]);
});

test("a model with more than three gate-passing routes contributes all of them", async () => {
  // Acceptance fixture: a 5-route primary (4 non-pinned) + a 4-route fallback at
  // depth 1, so the chain is exactly the 8 non-pinned routes in route-value order.
  const models = [
    routed("model-a", 90, 1, 100, ["a1", "a2", "a3", "a4", "a5"]),
    routed("model-b", 80, 5, 60, ["b1", "b2", "b3", "b4"]),
  ];
  const dir = setupAgentDir("other: 1\n");
  const deps = fakeDeps(models, onlyDefault({ fallbackChainDepth: 1, roles: { default: { preferOwnProvider: true } } }));
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  assert.equal(result.aborted, undefined);
  const doc = readConfig(dir);
  assert.equal(doc.modelRoles.default, "openrouter/org/model-a@a1:auto");
  assert.deepEqual(doc.retry.fallbackChains["openrouter/org/model-a@a1"], [
    "openrouter/org/model-a@a2:auto",
    "openrouter/org/model-a@a3:auto",
    "openrouter/org/model-a@a4:auto",
    "openrouter/org/model-a@a5:auto",
    "openrouter/org/model-b@b1:auto",
    "openrouter/org/model-b@b2:auto",
    "openrouter/org/model-b@b3:auto",
    "openrouter/org/model-b@b4:auto",
  ]);
});

test("the primary model contributes all its non-pinned routes", async () => {
  const models = [
    routed("model-a", 90, 1, 100, ["a1", "a2", "a3", "a4"]),
    routed("model-b", 80, 5, 60, ["b1"]),
    routed("model-c", 70, 10, 30, ["c1"]),
  ];
  const dir = setupAgentDir("other: 1\n");
  const deps = fakeDeps(models, onlyDefault({ roles: { default: { preferOwnProvider: true } } }));
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  assert.equal(result.aborted, undefined);
  const doc = readConfig(dir);
  assert.deepEqual(doc.retry.fallbackChains["openrouter/org/model-a@a1"], [
    "openrouter/org/model-a@a2:auto",
    "openrouter/org/model-a@a3:auto",
    "openrouter/org/model-a@a4:auto",
    "openrouter/org/model-b@b1:auto",
    "openrouter/org/model-c@c1:auto",
  ]);
});

test("a degraded route is excluded from the chain", async () => {
  const a = makeModel("model-a", 90, 1, 100);
  a.routes = [
    route({ id: "a-cheap", providerSlug: "cheap", price: 1, tput: 100 }),
    route({ id: "a-mid", providerSlug: "mid", price: 2, tput: 100 }),
    route({ id: "a-down", providerSlug: "down", price: 3, tput: 100, status: 1 }),
    route({ id: "a-exp", providerSlug: "exp", price: 4, tput: 100 }),
  ];
  const models = [a, routed("model-b", 80, 5, 60, ["b1"]), routed("model-c", 70, 10, 30, ["c1"])];
  const dir = setupAgentDir("other: 1\n");
  const deps = fakeDeps(models, onlyDefault({ roles: { default: { preferOwnProvider: true } } }));
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  assert.equal(result.aborted, undefined);
  const chain = readConfig(dir).retry.fallbackChains["openrouter/org/model-a@cheap"];
  assert.deepEqual(chain, [
    "openrouter/org/model-a@mid:auto",
    "openrouter/org/model-a@exp:auto",
    "openrouter/org/model-b@b1:auto",
    "openrouter/org/model-c@c1:auto",
  ]);
  assert.ok(!chain.some((v) => v.includes("@down")));
});

test("a route over filters.maxPriceUsdPerM is excluded from the chain", async () => {
  const a = makeModel("model-a", 90, 1, 100);
  a.routes = [
    route({ id: "a-cheap", providerSlug: "cheap", price: 1, tput: 100 }),
    route({ id: "a-mid", providerSlug: "mid", price: 2, tput: 100 }),
    route({ id: "a-over", providerSlug: "over", price: 3, tput: 100 }),
    route({ id: "a-exp", providerSlug: "exp", price: 4, tput: 100 }),
  ];
  const models = [a, routed("model-b", 80, 2, 60, ["b1"]), routed("model-c", 70, 3, 30, ["c1"])];
  const dir = setupAgentDir("other: 1\n");
  const deps = fakeDeps(models, onlyDefault({ roles: { default: { preferOwnProvider: true, filters: { maxPriceUsdPerM: 3 } } } }));
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  assert.equal(result.aborted, undefined);
  const chain = readConfig(dir).retry.fallbackChains["openrouter/org/model-a@cheap"];
  assert.deepEqual(chain, [
    "openrouter/org/model-a@mid:auto",
    "openrouter/org/model-a@over:auto",
    "openrouter/org/model-b@b1:auto",
    "openrouter/org/model-c@c1:auto",
  ]);
  assert.ok(!chain.some((v) => v.includes("@exp")));
});

test("a whitelist-blocked route is excluded from the chain", async () => {
  const models = [
    routed("model-a", 90, 1, 100, ["cheap", "mid", "blocked"]),
    routed("model-b", 80, 5, 60, ["b1"]),
    routed("model-c", 70, 10, 30, ["c1"]),
  ];
  const dir = setupAgentDir("other: 1\n");
  const deps = fakeDeps(models, onlyDefault({ roles: { default: { preferOwnProvider: true } } }), {
    getAllowedProviders: async () => new Set(["cheap", "mid", "b1", "c1"]),
  });
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  assert.equal(result.aborted, undefined);
  const chain = readConfig(dir).retry.fallbackChains["openrouter/org/model-a@cheap"];
  assert.deepEqual(chain, [
    "openrouter/org/model-a@mid:auto",
    "openrouter/org/model-b@b1:auto",
    "openrouter/org/model-c@c1:auto",
  ]);
  assert.ok(!chain.some((v) => v.includes("@blocked")));
});

test("two routes sharing a provider slug collapse to one chain entry", async () => {
  const a = makeModel("model-a", 90, 1, 100);
  a.routes = [
    route({ id: "a-cheap", providerSlug: "cheap", price: 1, tput: 100 }),
    route({ id: "a-shared-1", providerSlug: "shared", price: 2, tput: 100 }),
    route({ id: "a-shared-2", providerSlug: "shared", price: 3, tput: 100 }),
    route({ id: "a-exp", providerSlug: "exp", price: 4, tput: 100 }),
  ];
  const models = [a, routed("model-b", 80, 5, 60, ["b1"]), routed("model-c", 70, 10, 30, ["c1"])];
  const dir = setupAgentDir("other: 1\n");
  const deps = fakeDeps(models, onlyDefault({ roles: { default: { preferOwnProvider: true } } }));
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  assert.equal(result.aborted, undefined);
  const chain = readConfig(dir).retry.fallbackChains["openrouter/org/model-a@cheap"];
  assert.deepEqual(chain, [
    "openrouter/org/model-a@shared:auto",
    "openrouter/org/model-a@exp:auto",
    "openrouter/org/model-b@b1:auto",
    "openrouter/org/model-c@c1:auto",
  ]);
  assert.equal(chain.filter((v) => v.includes("@shared")).length, 1);
});

// --- determinism / prune -----------------------------------------------------

test("a re-run is idempotent (config.yml byte-identical)", async () => {
  const dir = setupAgentDir("other: 1\n");
  const deps = fakeDeps(MODELS, onlyDefault({ roles: { default: { preferOwnProvider: true } } }));
  await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  const first = readFileSync(join(dir, "config.yml"), "utf8");
  await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  assert.equal(readFileSync(join(dir, "config.yml"), "utf8"), first);
});

test("changing the pin prunes the old chain key", async () => {
  const config =
    "modelRoles:\n  default: openrouter/org/model-a@old:auto\nretry:\n  fallbackChains:\n    openrouter/org/model-a@old:\n      - openrouter/org/model-b@old:auto\n";
  const dir = setupAgentDir(config, {
    lastRunDay: null,
    managedRoles: ["default"],
    roleLastSelector: {},
    pluginWrittenChainKeys: ["openrouter/org/model-a@old"],
    previousModelRoles: null,
  });
  const deps = fakeDeps(MODELS, onlyDefault({ roles: { default: { preferOwnProvider: true } } }));
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  assert.equal(result.aborted, undefined);
  const doc = readConfig(dir);
  assert.equal(doc.modelRoles.default, "openrouter/org/model-a@cheap:auto");
  assert.equal(doc.retry.fallbackChains["openrouter/org/model-a@old"], undefined);
  assert.ok(doc.retry.fallbackChains["openrouter/org/model-a@cheap"]);
  const state = JSON.parse(readFileSync(join(dir, "llm-role-state.json"), "utf8"));
  assert.deepEqual(state.pluginWrittenChainKeys, ["openrouter/org/model-a@cheap"]);
});
