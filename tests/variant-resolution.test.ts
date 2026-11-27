import assert from "node:assert/strict";
import { test } from "node:test";
import { catalogFromOmpModelsJson, currentRankingId, rankingIdOf, resolveProviderVariant, resolveVariant, type CatalogEntry } from "../src/availability.ts";

function entry(id: string): CatalogEntry {
  return {
    provider: "openrouter",
    id,
    selector: `openrouter/${id}`,
    name: id,
    contextWindow: 200000,
    maxTokens: 8192,
    reasoning: false,
    thinking: ["high"],
    input: ["text"],
    cost: null,
  };
}

const catalog = (ids: string[]) => ids.map(entry);

test("rankingIdOf strips org prefix, :free, and one -latest", () => {
  assert.equal(rankingIdOf("deepseek/deepseek-v4-flash"), "deepseek-v4-flash");
  assert.equal(rankingIdOf("~deepseek/deepseek-v4-flash-latest"), "deepseek-v4-flash");
  assert.equal(rankingIdOf("inclusionai/ling-3.0-flash:free"), "ling-3.0-flash");
  assert.equal(rankingIdOf("z-ai/glm-5.3-flash"), "glm-5.3-flash");
});

test("currentRankingId drops thinking suffix and openrouter/ prefix", () => {
  assert.equal(currentRankingId("openrouter/~deepseek/deepseek-v4-flash-latest:off"), "deepseek-v4-flash");
  assert.equal(currentRankingId("openrouter/z-ai/glm-5.3-flash:max"), "glm-5.3-flash");
  assert.equal(currentRankingId("openrouter/inclusionai/ling-3.0-flash"), "ling-3.0-flash");
  // :batch is not a thinking level — it stays part of the identity (and fails the gate)
  assert.equal(currentRankingId("openrouter/org/model:batch"), "model:batch");
});

test("currentRankingId drops a trailing @<slug> provider pin", () => {
  // The pin rides before the thinking level; both are stripped for identity.
  assert.equal(currentRankingId("openrouter/z-ai/glm-4.7@cerebras:high"), "glm-4.7");
  assert.equal(currentRankingId("openrouter/z-ai/glm-4.7@cerebras"), "glm-4.7");
  // A tiered pin is dropped whole (everything from the last @).
  assert.equal(currentRankingId("openrouter/z-ai/glm-4.7@deepinfra/fp8:high"), "glm-4.7");
  // No pin: unchanged.
  assert.equal(currentRankingId("openrouter/z-ai/glm-4.7:high"), "glm-4.7");
});

test("exact id beats dated alias and bare alias", () => {
  const got = resolveVariant(
    "deepseek-v4-flash",
    catalog(["~deepseek/deepseek-v4-flash-latest", "deepseek/deepseek-v4-flash", "deepseek/deepseek-v4-flash:batch"]),
    "billed",
  );
  assert.equal(got, "deepseek/deepseek-v4-flash");
});

test("alias is the last resort when no exact form exists", () => {
  const got = resolveVariant("deepseek-v4-flash", catalog(["~deepseek/deepseek-v4-flash-latest"]), "billed");
  assert.equal(got, "~deepseek/deepseek-v4-flash-latest");
});

test("dated ranking id prefers the exact dated id over its -latest alias", () => {
  const got = resolveVariant(
    "deepseek-v4-flash-0731",
    catalog(["~deepseek/deepseek-v4-flash-0731-latest", "deepseek/deepseek-v4-flash-0731"]),
    "billed",
  );
  assert.equal(got, "deepseek/deepseek-v4-flash-0731");
  const aliasOnly = resolveVariant("deepseek-v4-flash-0731", catalog(["~deepseek/deepseek-v4-flash-0731-latest"]), "billed");
  assert.equal(aliasOnly, "~deepseek/deepseek-v4-flash-0731-latest");
});
test("org prefixes (including ~) are ignored for matching; ties break lexicographically", () => {
  assert.equal(resolveVariant("model", catalog(["~aaa/model-latest", "bbb/model"]), "billed"), "bbb/model");
  assert.equal(resolveVariant("model", catalog(["~aab/model-latest", "~aaa/model-latest"]), "billed"), "~aaa/model-latest");
});


test("unrelated ids never match (suffix must be exact)", () => {
  assert.equal(resolveVariant("glm-5.3-flash", catalog(["z-ai/glm-5.3-flashx"]), "billed"), null);
  assert.equal(resolveVariant("model", catalog(["org/other", "org/another-model"]), "billed"), null);
});

test("catalogFromOmpModelsJson tolerates malformed rows and defaults fields", () => {
  const parsed = catalogFromOmpModelsJson({
    models: [
      { provider: "openrouter", id: "org/a" },
      { provider: "openrouter" },
      "not-an-object",
      { provider: "openrouter", id: "org/b", name: "B", thinking: ["low", 3, "high"], input: ["text", 7], cost: { input: 1, output: 2 } },
    ],
  });
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].selector, "openrouter/org/a");
  assert.deepEqual(parsed[0].thinking, []);
  assert.equal(parsed[1].name, "B");
  assert.deepEqual(parsed[1].thinking, ["low", "high"]);
  assert.deepEqual(parsed[1].cost, { input: 1, output: 2 });
  assert.equal(catalogFromOmpModelsJson(null).length, 0);
  assert.equal(catalogFromOmpModelsJson({}).length, 0);
});
// ---------------------------------------------------------------------------
// resolveProviderVariant — provider-scoped variant resolution
// ---------------------------------------------------------------------------

function providerEntry(provider: string, id: string): CatalogEntry {
  return {
    provider,
    id,
    selector: `${provider}/${id}`,
    name: id,
    contextWindow: 200000,
    maxTokens: 8192,
    reasoning: false,
    thinking: [],
    input: ["text"],
    cost: null,
  };
}

const providerCatalog = (provider: string, ids: string[]) => ids.map((id) => providerEntry(provider, id));

test("resolveProviderVariant resolves a non-OpenRouter provider's exact row", () => {
  const got = resolveProviderVariant("deepseek-v4.1-flash", "flocta", providerCatalog("flocta", ["deepseek-v4.1-flash"]), "billed");
  assert.equal(got, "deepseek-v4.1-flash");
});

test("resolveProviderVariant matches a dated model id to the provider's undated row", () => {
  const got = resolveProviderVariant("deepseek-v4.1-flash-1017", "flocta", providerCatalog("flocta", ["deepseek-v4.1-flash"]), "billed");
  assert.equal(got, "deepseek-v4.1-flash");
});

test("resolveProviderVariant matches an undated model id to the provider's newest dated row", () => {
  const got = resolveProviderVariant(
    "deepseek-v4.1-flash",
    "flocta",
    providerCatalog("flocta", ["deepseek-v4.1-flash-1017", "deepseek-v4.1-flash-1103"]),
    "billed",
  );
  assert.equal(got, "deepseek-v4.1-flash-1103");
});

test("resolveProviderVariant falls back to the provider's ~org alias row", () => {
  const got = resolveProviderVariant("deepseek-v4.1-flash", "flocta", providerCatalog("flocta", ["~deepseek/deepseek-v4.1-flash-latest"]), "billed");
  assert.equal(got, "~deepseek/deepseek-v4.1-flash-latest");
});

test("resolveProviderVariant returns null when the provider has no row", () => {
  assert.equal(resolveProviderVariant("deepseek-v4.1-flash", "flocta", providerCatalog("flocta", ["other-model"]), "billed"), null);
  assert.equal(resolveProviderVariant("deepseek-v4.1-flash", "flocta", providerCatalog("openrouter", ["deepseek-v4.1-flash"]), "billed"), null);
});

test("resolveProviderVariant excludes the provider's auto pseudo-model", () => {
  assert.equal(resolveProviderVariant("auto", "flocta", providerCatalog("flocta", ["auto"]), "billed"), null);
});

test("resolveProviderVariant delegates OpenRouter to resolveVariant (tier rules intact)", () => {
  const cat = catalog(["deepseek/deepseek-v4-flash", "deepseek/deepseek-v4-flash:free"]);
  assert.equal(resolveProviderVariant("deepseek-v4-flash", "openrouter", cat, "billed"), resolveVariant("deepseek-v4-flash", cat, "billed"));
  assert.equal(resolveProviderVariant("deepseek-v4-flash", "openrouter", cat, "billed"), "deepseek/deepseek-v4-flash");
  assert.equal(resolveProviderVariant("deepseek-v4-flash", "openrouter", cat, "free"), resolveVariant("deepseek-v4-flash", cat, "free"));
});
