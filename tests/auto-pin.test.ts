import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { parse as parseYaml } from "yaml";
import type { ProbeVerdict } from "../src/availability.ts";
import type { Model, OpenRouterEndpointRecord } from "../src/engine.ts";
import { rankedRoutes } from "../src/engine.ts";
import { resolveSettings } from "../src/settings.ts";
import { ROUTE_PROBE_BUDGET, runUpdater } from "../src/updater.ts";
import { fakeDeps, makeModel, runInTempDir, setupAgentDir } from "./helpers.ts";

// Auto-pin (issue #61, spec #58; expanded by #69): when a role's expanded def
// has `preferOwnProvider === true` and no manual `providerPin`, the updater
// writes the chosen model's best route as the selector's `@<slug>` suffix and
// fills the fallback chain with every gate-passing route of the primary model
// (all but the pinned best) and of each fallback model, in the role's
// value-for-money score order (`rankedRoutes`, spec #71), deduped by chain
// value. A manual pin is a hard gate and always wins; a model
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

test("the auto-pin chain is in rankedRoutes (score) order", async () => {
  // Distinct price/throughput per route so the value-for-money score order is
  // non-trivial: the pricier-but-faster `fast` route outranks the cheapest
  // `slow` route, which in turn outranks the expensive `pricey` route. A
  // price-ordered chain would be slow, fast, pricey. Every route clears the
  // providerPinning preset's soft throughput floor, so the floor never reorders.
  const a = makeModel("model-a", 90, 1, 100);
  a.routes = [
    route({ id: "a-slow", providerSlug: "slow", price: 1, tput: 60 }),
    route({ id: "a-fast", providerSlug: "fast", price: 1.2, tput: 300 }),
    route({ id: "a-pricey", providerSlug: "pricey", price: 10, tput: 300 }),
  ];
  const models = [a, routed("model-b", 80, 5, 60, ["b1"]), routed("model-c", 70, 10, 30, ["c1"])];
  const settings = onlyDefault({ features: { providerPinning: true } });
  const dir = setupAgentDir("other: 1\n");
  const deps = fakeDeps(models, settings);
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  assert.equal(result.aborted, undefined);
  const doc = readConfig(dir);
  // The def the updater ranks with, so the expected order is the engine's own.
  const def = resolveSettings(settings).settings.roles.default;
  const ranked = rankedRoutes(a, def);
  // The pinned best is the score leader; the chain carries the rest in score order.
  assert.equal(doc.modelRoles.default, `openrouter/org/model-a@${ranked[0].providerSlug}:auto`);
  const chain = doc.retry.fallbackChains[`openrouter/org/model-a@${ranked[0].providerSlug}`];
  const primary = ranked.slice(1).map((r) => `openrouter/org/model-a@${r.providerSlug}:auto`);
  assert.deepEqual(chain.slice(0, primary.length), primary);
  // The score order is not the price order: `fast` (pricier) outranks `slow`.
  assert.deepEqual(primary, ["openrouter/org/model-a@slow:auto", "openrouter/org/model-a@pricey:auto"]);
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

test("a route failing an endpoint filter is excluded from the chain", async () => {
  const a = makeModel("model-a", 90, 1, 100);
  a.routes = [
    route({ id: "a-cheap", providerSlug: "cheap", price: 1, tput: 100 }),
    route({ id: "a-mid", providerSlug: "mid", price: 2, tput: 100 }),
    route({ id: "a-notools", providerSlug: "notools", price: 3, tput: 100, supportsTools: false }),
    route({ id: "a-exp", providerSlug: "exp", price: 4, tput: 100 }),
  ];
  const models = [a, routed("model-b", 80, 5, 60, ["b1"]), routed("model-c", 70, 10, 30, ["c1"])];
  const dir = setupAgentDir("other: 1\n");
  const deps = fakeDeps(models, onlyDefault({ roles: { default: { preferOwnProvider: true, filters: { tools: true } } } }));
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  assert.equal(result.aborted, undefined);
  const chain = readConfig(dir).retry.fallbackChains["openrouter/org/model-a@cheap"];
  assert.deepEqual(chain, [
    "openrouter/org/model-a@mid:auto",
    "openrouter/org/model-a@exp:auto",
    "openrouter/org/model-b@b1:auto",
    "openrouter/org/model-c@c1:auto",
  ]);
  assert.ok(!chain.some((v) => v.includes("@notools")));
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

// --- route probe walk (#92) --------------------------------------------------
//
// Spec #90: the auto-pin verifies the route before it writes it. The updater
// walks the role's route order (`rankedRoutes`, the same order the chain uses),
// probes each candidate with `provider: { only: [slug] }`, pins the first route
// that is not `blocked` (`ok` and `unknown` are both usable) and drops the pin
// when no candidate is clean — the selector then stays bare so OpenRouter routes
// the request itself instead of 404ing on an unroutable `@<slug>`.

/** Today's auto-pin output for the MODELS fixture, captured from the pre-#92
 * code (pin = the score leader, chain = the primary's other routes then each
 * fallback model's). The `task:` block is host-dependent (the repo's shipped
 * agent pins), so the golden covers the two blocks the auto-pin owns — byte for
 * byte. */
const TODAYS_AUTOPIN_BLOCKS = `modelRoles:
  default: "openrouter/org/model-a@cheap:auto"
retry:
  fallbackChains:
    openrouter/org/model-a@cheap:
      - "openrouter/org/model-a@mid:auto"
      - "openrouter/org/model-a@exp:auto"
      - "openrouter/org/model-b@b1:auto"
      - "openrouter/org/model-b@mid:auto"
      - "openrouter/org/model-b@b3:auto"
      - "openrouter/org/model-c@c1:auto"
      - "openrouter/org/model-c@mid:auto"
      - "openrouter/org/model-c@c3:auto"
`;

/** The auto-pin-owned region of a written config.yml, from `modelRoles:` up to
 * the host-dependent `task:` block. */
function autoPinBlocks(text: string): string {
  const end = text.indexOf("\ntask:");
  return text.slice(text.indexOf("modelRoles:"), end === -1 ? undefined : end + 1);
}

/** A route-probe stub: `blocked` for the listed slugs, `ok` otherwise, counting
 * every call when a counter is passed. */
function probeBlocking(blocked: string[], counter?: { n: number }) {
  return async (_token: string, _catalogId: string, slug: string): Promise<ProbeVerdict> => {
    if (counter) counter.n++;
    return blocked.includes(slug) ? "blocked" : "ok";
  };
}

/** Run one fixture twice in fresh temp dirs — once with the route probe muted
 * (a stub that throws, so any call fails the run) and once with the hermetic
 * default — and report both written config.yml texts, so a no-op path is proven
 * by byte-identity plus a zero call count. */
async function mutedProbeRun(
  configText: string,
  settings: Record<string, unknown>,
  models: Model[] = MODELS,
): Promise<{ muted: string; control: string; called: number; aborted: string | undefined }> {
  const counter = { n: 0 };
  const mutedDir = setupAgentDir(configText);
  const mutedDeps = fakeDeps(models, settings, {
    probeRoute: async () => {
      counter.n++;
      throw new Error("the route probe must not run");
    },
  });
  const mutedResult = await runInTempDir(mutedDir, () => runUpdater("manual", mutedDeps, { force: true }));
  const controlDir = setupAgentDir(configText);
  const controlResult = await runInTempDir(controlDir, () => runUpdater("manual", fakeDeps(models, settings), { force: true }));
  assert.equal(controlResult.aborted, undefined);
  return {
    muted: readFileSync(join(mutedDir, "config.yml"), "utf8"),
    control: readFileSync(join(controlDir, "config.yml"), "utf8"),
    called: counter.n,
    aborted: mutedResult.aborted,
  };
}

test("a blocked best route pins the next route and records the skipped slug", async () => {
  const dir = setupAgentDir("other: 1\n");
  const notified: string[] = [];
  const deps = fakeDeps(MODELS, onlyDefault({ roles: { default: { preferOwnProvider: true } } }), {
    probeRoute: probeBlocking(["cheap"]),
    notify: (lines) => notified.push(...lines),
  });
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  assert.equal(result.aborted, undefined);
  const d = result.decisions.find((x) => x.role === "default");
  assert.ok(d);
  assert.equal(d.to, "openrouter/org/model-a@mid:auto");
  assert.deepEqual(d.routeBlocked, ["cheap"]);
  assert.equal(d.pinDropped, false);
  assert.ok(notified.some((l) => l.includes("@default:") && l.includes("route-blocked: cheap")));
  const doc = readConfig(dir);
  assert.equal(doc.modelRoles.default, "openrouter/org/model-a@mid:auto");
  // The chain excludes the pinned route by slug — not by index: the blocked
  // score leader `cheap` rides as a fallback entry while `mid` does not.
  assert.deepEqual(doc.retry.fallbackChains["openrouter/org/model-a@mid"], [
    "openrouter/org/model-a@cheap:auto",
    "openrouter/org/model-a@exp:auto",
    "openrouter/org/model-b@b1:auto",
    "openrouter/org/model-b@mid:auto",
    "openrouter/org/model-b@b3:auto",
    "openrouter/org/model-c@c1:auto",
    "openrouter/org/model-c@mid:auto",
    "openrouter/org/model-c@c3:auto",
  ]);
});

test("a route probe that cannot tell (unknown) is usable and stays pinned", async () => {
  const dir = setupAgentDir("other: 1\n");
  const deps = fakeDeps(MODELS, onlyDefault({ roles: { default: { preferOwnProvider: true } } }), {
    probeRoute: async () => "unknown",
  });
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  assert.equal(result.aborted, undefined);
  const d = result.decisions.find((x) => x.role === "default");
  assert.ok(d);
  assert.equal(d.to, "openrouter/org/model-a@cheap:auto");
  assert.deepEqual(d.routeBlocked, []);
  assert.equal(d.pinDropped, false);
  assert.equal(readConfig(dir).modelRoles.default, "openrouter/org/model-a@cheap:auto");
});

test("every route blocked writes a bare selector and drops the pin", async () => {
  const dir = setupAgentDir("other: 1\n");
  const notified: string[] = [];
  const deps = fakeDeps(MODELS, onlyDefault({ roles: { default: { preferOwnProvider: true } } }), {
    probeRoute: async () => "blocked",
    notify: (lines) => notified.push(...lines),
  });
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  assert.equal(result.aborted, undefined);
  const d = result.decisions.find((x) => x.role === "default");
  assert.ok(d);
  assert.equal(d.to, "openrouter/org/model-a:auto");
  assert.equal(d.pinDropped, true);
  assert.deepEqual(d.routeBlocked, ["cheap", "mid", "exp"]);
  assert.ok(notified.some((l) => l.includes("@default:") && l.includes("pin dropped")));
  const doc = readConfig(dir);
  assert.equal(doc.modelRoles.default, "openrouter/org/model-a:auto");
  // No pin was written, so the chain carries every gate-passing route of the
  // primary (the blocked ones included — one unroutable chain entry is
  // survivable, and only the primary pin is probed).
  assert.deepEqual(doc.retry.fallbackChains["openrouter/org/model-a"], [
    "openrouter/org/model-a@cheap:auto",
    "openrouter/org/model-a@mid:auto",
    "openrouter/org/model-a@exp:auto",
    "openrouter/org/model-b@b1:auto",
    "openrouter/org/model-b@mid:auto",
    "openrouter/org/model-b@b3:auto",
    "openrouter/org/model-c@c1:auto",
    "openrouter/org/model-c@mid:auto",
    "openrouter/org/model-c@c3:auto",
  ]);
});

test("every route clean writes today's config byte for byte", async () => {
  const dir = setupAgentDir("other: 1\n");
  const counter = { n: 0 };
  const deps = fakeDeps(MODELS, onlyDefault({ roles: { default: { preferOwnProvider: true } } }), {
    probeRoute: probeBlocking([], counter),
  });
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  assert.equal(result.aborted, undefined);
  const d = result.decisions.find((x) => x.role === "default");
  assert.ok(d);
  assert.deepEqual(d.routeBlocked, []);
  assert.equal(d.pinDropped, false);
  // The clean leader ends the walk: one probe, not one per route.
  assert.equal(counter.n, 1);
  assert.equal(autoPinBlocks(readFileSync(join(dir, "config.yml"), "utf8")), TODAYS_AUTOPIN_BLOCKS);
});

test("the probe is never consulted with the capability off", async () => {
  const r = await mutedProbeRun("other: 1\n", onlyDefault());
  assert.equal(r.aborted, undefined);
  assert.equal(r.called, 0);
  assert.equal(r.muted, r.control);
});

test("the probe is never consulted with a manual providerPin", async () => {
  const r = await mutedProbeRun("other: 1\n", onlyDefault({ roles: { default: { providerPin: "mid", preferOwnProvider: true } } }));
  assert.equal(r.aborted, undefined);
  assert.equal(r.called, 0);
  assert.equal(r.muted, r.control);
});

test("the probe is never consulted for a locked role", async () => {
  const r = await mutedProbeRun('modelRoles:\n  default: "openrouter/org/model-b:auto"\n', onlyDefault({ roles: { default: { locked: true, preferOwnProvider: true } } }));
  assert.equal(r.aborted, undefined);
  assert.equal(r.called, 0);
  assert.equal(r.muted, r.control);
});

test("the probe is never consulted for a disabled role", async () => {
  const r = await mutedProbeRun('modelRoles:\n  default: "openrouter/org/model-b:auto"\n', onlyDefault({ roles: { default: { enabled: false, preferOwnProvider: true } } }));
  assert.equal(r.aborted, undefined);
  assert.equal(r.called, 0);
  assert.equal(r.muted, r.control);
});

test("the probe is never consulted when the chosen model has no route data", async () => {
  const a = makeModel("model-a", 90, 1, 100);
  a.routes = [route({ providerSlug: "degraded", status: 1, price: 1 })]; // degraded ⇒ no gate-passing route
  const models = [a, routed("model-b", 80, 5, 60, ["b1"]), routed("model-c", 70, 10, 30, ["c1"])];
  const r = await mutedProbeRun("other: 1\n", onlyDefault({ roles: { default: { preferOwnProvider: true } } }), models);
  assert.equal(r.aborted, undefined);
  assert.equal(r.called, 0);
  assert.equal(r.muted, r.control);
});

test("a role whose whole route pool is blocked issues at most ROUTE_PROBE_BUDGET probes", async () => {
  const slugs = Array.from({ length: ROUTE_PROBE_BUDGET + 8 }, (_, i) => `p${i}`);
  const models = [routed("model-a", 90, 1, 100, slugs), routed("model-b", 80, 5, 60, ["b1"]), routed("model-c", 70, 10, 30, ["c1"])];
  const dir = setupAgentDir("other: 1\n");
  const counter = { n: 0 };
  const deps = fakeDeps(models, onlyDefault({ roles: { default: { preferOwnProvider: true } } }), {
    probeRoute: async () => {
      counter.n++;
      return "blocked";
    },
  });
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  assert.equal(result.aborted, undefined);
  assert.equal(counter.n, ROUTE_PROBE_BUDGET);
  assert.ok(counter.n < slugs.length);
  const d = result.decisions.find((x) => x.role === "default");
  assert.ok(d);
  assert.equal(d.pinDropped, true);
  assert.equal(d.routeBlocked.length, ROUTE_PROBE_BUDGET);
  assert.equal(readConfig(dir).modelRoles.default, "openrouter/org/model-a:auto");
});

test("a route already probed for another role is not probed again", async () => {
  const dir = setupAgentDir("other: 1\n");
  const counter = { n: 0 };
  const deps = fakeDeps(MODELS, onlyDefault({ roles: { default: { preferOwnProvider: true }, slow: { preferOwnProvider: true } } }), {
    probeRoute: probeBlocking(["cheap"], counter),
  });
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  assert.equal(result.aborted, undefined);
  const doc = readConfig(dir);
  // Both roles land on model-a and walk the same route order — so the shared
  // verdicts collapse to one probe each: `cheap` (blocked) and `mid` (ok).
  assert.equal(doc.modelRoles.default, "openrouter/org/model-a@mid:auto");
  // `slow` pins `:high`, which the fixture's catalog does not advertise, so its
  // selector stays level-free.
  assert.equal(doc.modelRoles.slow, "openrouter/org/model-a@mid");
  assert.equal(counter.n, 2);
});

test("two blocked routes sharing a provider slug are recorded once", async () => {
  const a = makeModel("model-a", 90, 1, 100);
  a.routes = [
    route({ id: "a-shared-1", providerSlug: "shared", price: 1, tput: 100 }),
    route({ id: "a-shared-2", providerSlug: "shared", price: 2, tput: 100 }),
    route({ id: "a-exp", providerSlug: "exp", price: 3, tput: 100 }),
  ];
  const models = [a, routed("model-b", 80, 5, 60, ["b1"]), routed("model-c", 70, 10, 30, ["c1"])];
  const dir = setupAgentDir("other: 1\n");
  const deps = fakeDeps(models, onlyDefault({ roles: { default: { preferOwnProvider: true } } }), { probeRoute: async () => "blocked" });
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  assert.equal(result.aborted, undefined);
  const d = result.decisions.find((x) => x.role === "default");
  assert.ok(d);
  assert.deepEqual(d.routeBlocked, ["shared", "exp"]);
});
