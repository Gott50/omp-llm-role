import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { parse as parseYaml } from "yaml";
import type { CatalogEntry } from "../src/availability.ts";
import type { Ranked } from "../src/engine.ts";
import { selectorFor } from "../src/selection.ts";
import { DEFAULT_ROLES } from "../src/settings.ts";
import { runUpdater } from "../src/updater.ts";
import { fakeDeps, makeCatalog, makeModel, runInTempDir, setupAgentDir } from "./helpers.ts";

// Uniform quality metrics -> q = (v+20)/80: A 1.375, B 1.25, C 1.125.
const MODELS = [makeModel("model-a", 90, 1, 100), makeModel("model-b", 80, 5, 60), makeModel("model-c", 70, 10, 30)];

// Only `smol` is managed, with a non-default suffix, so the chain assertions are exact.
const SMOL_ONLY = Object.fromEntries(
  ["default", "slow", "vision", "plan", "commit", "tiny", "task", "advisor", "designer"].map((r) => [r, { weights: null }]),
);
const SETTINGS = { roles: { ...SMOL_ONLY, smol: { thinking: "max" } } };

type ConfigDoc = {
  modelRoles: Record<string, string>;
  retry: { fallbackChains: Record<string, string[]> };
};

async function run(catalog?: CatalogEntry[]) {
  const dir = setupAgentDir('modelRoles:\n  smol: "openrouter/org/model-a"\n');
  const deps = fakeDeps(MODELS, SETTINGS, catalog ? { getCatalog: async () => catalog } : {});
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  return { result, doc: parseYaml(readFileSync(join(dir, "config.yml"), "utf8")) as ConfigDoc };
}

test("chain values carry the role's thinking suffix; the chain key stays bare", async () => {
  const { result, doc } = await run(makeCatalog(["model-a", "model-b", "model-c"], ["max"]));
  assert.equal(result.aborted, undefined);
  assert.equal(doc.modelRoles.smol, "openrouter/org/model-a:max");
  // Key without suffix (it must match the active model id), values with it.
  assert.deepEqual(doc.retry.fallbackChains["openrouter/org/model-a"], ["openrouter/org/model-b:max", "openrouter/org/model-c:max"]);
});

test("a chain entry without thinking support runs off", async () => {
  const { doc } = await run([...makeCatalog(["model-a", "model-b"], ["max"]), ...makeCatalog(["model-c"], [])]);
  assert.equal(doc.modelRoles.smol, "openrouter/org/model-a:max");
  // model-c advertises no thinking support, so the clamp runs it at `off`.
  assert.deepEqual(doc.retry.fallbackChains["openrouter/org/model-a"], ["openrouter/org/model-b:max", "openrouter/org/model-c:off"]);
});

test("two roles on the same model share one level-free chain", async () => {
  // `default` (`:medium`) and `smol` (`:max`) both rank model-a first, so the chain
  // key `openrouter/org/model-a` serves both and must not carry either role's level.
  // The catalog advertises only `max`, so `default`'s `medium` clamps up to the
  // model's lowest level (`max`) — the floor rule.
  const optOut = Object.fromEntries(
    ["slow", "vision", "plan", "commit", "tiny", "task", "advisor", "designer"].map((r) => [r, { weights: null }]),
  );
  const dir = setupAgentDir("other: 1\n");
  const deps = fakeDeps(MODELS, { roles: { ...optOut, smol: { thinking: "max" } } }, {
    getCatalog: async () => makeCatalog(["model-a", "model-b", "model-c"], ["max"]),
  });
  await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  const doc = parseYaml(readFileSync(join(dir, "config.yml"), "utf8")) as ConfigDoc;
  assert.equal(doc.modelRoles.default, "openrouter/org/model-a:max");
  assert.equal(doc.modelRoles.smol, "openrouter/org/model-a:max");
  assert.deepEqual(doc.retry.fallbackChains["openrouter/org/model-a"], ["openrouter/org/model-b", "openrouter/org/model-c"]);
});

// ---------------------------------------------------------------------------
// Spec #116: a non-OpenRouter selector's thinking suffix comes from that
// provider's own catalog row (`providerOffers[provider].thinking`), never
// another provider's list, and it never carries an `@<slug>` pin.
// ---------------------------------------------------------------------------

/** A candidate on `provider` whose offer advertises `thinking`. */
function providerCandidate(id: string, provider: string, thinking: string[]): { ranked: Ranked; catalogId: string } {
  const model = makeModel(id, 0, 1, 100);
  model.providerOffers = { [provider]: { catalogId: `org/${id}`, price: 1, thinking } };
  return {
    ranked: { model, value: 1, q: 1, priceEff: 1, parts: {}, provider, providerBonus: 0.05, priceSource: "reference" },
    catalogId: `org/${id}`,
  };
}

test("a non-OpenRouter selector's suffix comes from the provider's offer thinking list", () => {
  const parts = selectorFor({
    chosen: providerCandidate("model-a", "flocta", ["high"]),
    def: { ...DEFAULT_ROLES.default, thinking: "high" },
    rowById: new Map(),
    autoPin: false,
    autoSlug: undefined,
  });
  assert.equal(parts.selector, "flocta/org/model-a:high");
  assert.equal(parts.key, "flocta/org/model-a");
  assert.equal(parts.pin, "");
  assert.equal(parts.pinnedSlug, undefined);
  assert.equal(parts.autoPin, false);
});

test("a level the provider does not advertise clamps to its own range", () => {
  const parts = selectorFor({
    chosen: providerCandidate("model-a", "flocta", ["low"]),
    def: { ...DEFAULT_ROLES.default, thinking: "high" },
    rowById: new Map(),
    autoPin: false,
    autoSlug: undefined,
  });
  // The offer advertises only `low`, so `high` clamps down to `low`.
  assert.equal(parts.selector, "flocta/org/model-a:low");
  assert.equal(parts.key, "flocta/org/model-a");
});

test("a non-thinking offer runs off", () => {
  // `DEFAULT_ROLES.default.thinking` is `medium`; the offer advertises no
  // thinking support, so the clamp runs the model at `off`.
  const parts = selectorFor({
    chosen: providerCandidate("model-a", "flocta", []),
    def: DEFAULT_ROLES.default,
    rowById: new Map(),
    autoPin: false,
    autoSlug: undefined,
  });
  assert.equal(parts.selector, "flocta/org/model-a:off");
  assert.equal(parts.key, "flocta/org/model-a");
});

test("a non-OpenRouter selector never carries an @slug pin", () => {
  const parts = selectorFor({
    chosen: providerCandidate("model-a", "flocta", ["high"]),
    def: { ...DEFAULT_ROLES.default, thinking: "high", providerPin: "deepinfra" },
    rowById: new Map(),
    autoPin: true,
    autoSlug: "deepinfra",
  });
  assert.equal(parts.selector, "flocta/org/model-a:high");
  assert.equal(parts.pin, "");
  assert.equal(parts.pinnedSlug, undefined);
  assert.equal(parts.autoPin, false);
});
