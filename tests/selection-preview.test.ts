import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { enrichCatalogData, filterCatalog, type CatalogEntry, type KeyAvailability, type Tier } from "../src/availability.ts";
import { rankRole, type Model, type OpenRouterEndpointRecord, type RankData } from "../src/engine.ts";
import { DEFAULT_ROLES, resolveSettings, type ResolvedSettings } from "../src/settings.ts";
import { discoverAgentPins, type AgentPin } from "../src/agent-pins.ts";
import { parseConfig } from "../src/config-edit.ts";
import { previewSelection, type SelectionPreview } from "../src/selection.ts";
import { runUpdater, type Decision, type DecisionReason, type Deps, type RunResult } from "../src/updater.ts";
import { fakeDeps, makeCatalog, makeModel, NO_FILTER_AVAILABILITY, runInTempDir, setupAgentDir } from "./helpers.ts";

// Spec #109 / ticket #110: the pure decision module. Every assertion here is
// external behaviour — the `SelectionPreview` a fixture produces, and the
// agreement between the preview and a real dry run. No assertion on an internal
// helper, and no assertion on a probe count (the preview has no probe seam).

/** Every shipped role except `default` opted out, so one chain key is written
 * and one test's chain assertion cannot be perturbed by another role's claim. */
const ONLY_DEFAULT = Object.fromEntries(
  ["smol", "slow", "vision", "plan", "commit", "tiny", "task", "advisor", "designer"].map((r) => [r, { enabled: false }]),
);

function onlyDefault(extra: Record<string, unknown> = {}): Record<string, unknown> {
  const { roles, ...rest } = extra;
  return { ...rest, roles: { ...ONLY_DEFAULT, ...(roles as Record<string, unknown> | undefined) } };
}

/** The re-exported decision types (contract C1): the preview's decisions are the
 * updater's own `Decision`, so the SPA renders both with one shape. */
function reasonOf(p: SelectionPreview, role = "default"): DecisionReason {
  const d: Decision | undefined = p.decisions.find((x) => x.role === role);
  if (d === undefined) throw new Error(`no decision for ${role}`);
  return d.reason;
}

const MODELS = [makeModel("model-a", 90, 1, 100), makeModel("model-b", 80, 5, 60), makeModel("model-c", 70, 10, 30)];
// The fixture models are non-thinking and the catalog advertises no thinking
// support, so the shipped `medium` pin clamps to `off` (factor 1) — the numeric
// design of the fixtures is unchanged.
const CATALOG = makeCatalog(MODELS.map((m) => m.id));
const RANK: RankData = { models: MODELS, fetchedAt: "2026-09-22T00:00:00.000Z", source: "test", orMatched: MODELS.length, orPriced: MODELS.length };

/** Near-tie pair for the cost-side override: the cheaper model (x) leads the
 * ranking but only barely, while the incumbent (y) is 3x the price. */
const NEAR_TIE = [makeModel("model-x", 90, 1, 100), makeModel("model-y", 90.5, 3, 100)];

/** A cheap primary whose only cheaper-or-equal candidates are far below the
 * floor, so the chain's floor is observable (the `chain-quality-floor` fixture). */
const SUB_FLOOR_CHEAP = [
  makeModel("chosen", 90, 1, 100),
  makeModel("p2", 85, 2, 100),
  makeModel("p3", 80, 3, 100),
  makeModel("weak4", 40, 0.5, 100),
  makeModel("weak5", 30, 0.4, 100),
];

/** A model whose routes are `slugs`, each priced at the model's own price plus
 * its position — the auto-pin fixture's shape. */
function routed(id: string, general: number, price: number, tput: number, slugs: string[]): Model {
  const m = makeModel(id, general, price, tput);
  m.routes = slugs.map((slug, i): OpenRouterEndpointRecord => ({
    id: `${id}-${slug}`,
    providerSlug: slug,
    serviceTier: null,
    status: 0,
    free: false,
    variant: "v",
    price: price + i,
    weightPrice: price + i,
    cacheReadPrice: null,
    tput,
    latency: null,
    contextLength: null,
    maxCompletionTokens: null,
    supportsTools: null,
  }));
  return m;
}

/** KeyAvailability fixture: `active` with the given ranking-id sets. */
function availability(blocked: string[], allowed: string[]): KeyAvailability {
  return {
    active: true,
    reason: "active",
    allowed: new Set(allowed),
    blocked: new Set(blocked),
    publicCount: 0,
    keyedCount: 0,
    fetchedAt: "2026-09-22T00:00:00.000Z",
  };
}

function resolved(raw: Record<string, unknown>): ResolvedSettings {
  const { settings, errors } = resolveSettings(raw);
  assert.deepEqual(errors, []);
  return settings;
}

type PreviewOpts = {
  models?: Model[];
  catalog?: CatalogEntry[];
  availability?: KeyAvailability;
  currentSelectors?: Record<string, string>;
  state?: { managedRoles: readonly string[]; pluginWrittenChainKeys: readonly string[]; managedDisabledAgents: readonly string[] };
  agentPins?: readonly AgentPin[];
  tier?: Tier;
};

/** `previewSelection` on a fixture, with the scope-side inputs defaulted. */
function preview(raw: Record<string, unknown>, opts: PreviewOpts = {}): SelectionPreview {
  const models = opts.models ?? MODELS;
  // The fixture models are non-thinking, so the shipped `medium` pin clamps to
  // `off` (factor 1); a test that wants a level passes its own catalog.
  const catalog = opts.catalog ?? makeCatalog(models.map((m) => m.id));
  return previewSelection({
    settings: resolved(raw),
    rank: { models, fetchedAt: "2026-09-22T00:00:00.000Z", source: "test", orMatched: models.length, orPriced: models.length },
    eligible: filterCatalog(catalog, opts.tier ?? "billed"),
    catalog,
    availability: opts.availability ?? NO_FILTER_AVAILABILITY,
    currentSelectors: opts.currentSelectors ?? {},
    state: opts.state ?? { managedRoles: [], pluginWrittenChainKeys: [], managedDisabledAgents: [] },
    agentPins: opts.agentPins ?? [],
    raw,
    tier: opts.tier,
  });
}

// ---------------------------------------------------------------------------
// The six ladder arms, driven through `previewSelection`.
// ---------------------------------------------------------------------------

test("no current selector -> no-current, the value leader", () => {
  const p = preview(onlyDefault());
  assert.equal(reasonOf(p), "no-current");
  assert.equal(p.decisions[0].from, null);
  assert.equal(p.decisions[0].to, "openrouter/org/model-a:off");
});

test("a current selector outside today's pool -> adopted", () => {
  const p = preview(onlyDefault(), { currentSelectors: { default: "openrouter/org/model-z" } });
  assert.equal(reasonOf(p), "adopted");
  assert.equal(p.decisions[0].to, "openrouter/org/model-a:off");
});

test("the current selector is already the challenger -> kept-eligible", () => {
  const p = preview(onlyDefault(), { currentSelectors: { default: "openrouter/org/model-a:off" } });
  assert.equal(reasonOf(p), "kept-eligible");
  assert.equal(p.decisions[0].from, p.decisions[0].to);
});

test("the challenger beats the incumbent by the margin -> switched", () => {
  const p = preview(onlyDefault({ switchMargin: 0.1 }), { currentSelectors: { default: "openrouter/org/model-b" } });
  assert.equal(reasonOf(p), "switched");
  assert.equal(p.decisions[0].to, "openrouter/org/model-a:off");
});

test("a challenger inside the margin but >=2x cheaper -> switched-cost", () => {
  const p = preview(onlyDefault(), { models: NEAR_TIE, currentSelectors: { default: "openrouter/org/model-y" } });
  assert.equal(reasonOf(p), "switched-cost");
  assert.equal(p.decisions[0].to, "openrouter/org/model-x:off");
});

test("the challenger is inside the margin and not cheap enough -> kept-margin", () => {
  const p = preview(onlyDefault({ switchMargin: 0.6, priceSwitchFraction: 0 }), { currentSelectors: { default: "openrouter/org/model-b" } });
  assert.equal(reasonOf(p), "kept-margin");
  assert.equal(p.decisions[0].to, "openrouter/org/model-b:off");
});

// ---------------------------------------------------------------------------
// The keyed prune (issue #104) and purity.
// ---------------------------------------------------------------------------

test("the keyed prune drops the as-written leader, so the preview's pick differs (issue #104)", () => {
  // The as-written pool's leader — the model the table would show — is key-blocked.
  assert.equal(rankRole(DEFAULT_ROLES.default, MODELS)[0].model.id, "model-a");
  const p = preview(onlyDefault(), { availability: availability(["model-a"], ["model-b", "model-c"]) });
  assert.equal(p.decisions[0].to, "openrouter/org/model-b:off");
  assert.equal(p.decisions[0].keyBlockedCount, 1);
  assert.equal(p.decisions[0].availabilitySource, "keyed-catalog");
});

test("previewSelection issues no request: a throwing global fetch is never reached", () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (() => {
    calls++;
    throw new Error("network");
  }) as typeof fetch;
  try {
    const p = preview(onlyDefault());
    assert.equal(calls, 0);
    assert.equal(p.decisions.length, 1);
    // No probe ran, so nothing is recorded as blocked.
    assert.deepEqual(p.decisions[0].blocked, []);
    assert.deepEqual(p.decisions[0].routeBlockedSlugs, []);
    assert.equal(p.decisions[0].pinDropped, false);
  } finally {
    globalThis.fetch = original;
  }
});

// ---------------------------------------------------------------------------
// The chain: the quality floor and the shared-key claim.
// ---------------------------------------------------------------------------

test("fallbackQualityFloor 0 lets a far-below-floor cheap candidate lead the chain", () => {
  const p = preview(onlyDefault({ fallbackQualityFloor: 0 }), { models: SUB_FLOOR_CHEAP });
  assert.deepEqual(p.chains["openrouter/org/chosen"], ["openrouter/org/weak4:off", "openrouter/org/weak5:off"]);
});

test("fallbackQualityFloor 0.9 keeps the next-best-by-value models", () => {
  const p = preview(onlyDefault({ fallbackQualityFloor: 0.9 }), { models: SUB_FLOOR_CHEAP });
  assert.deepEqual(p.chains["openrouter/org/chosen"], ["openrouter/org/p2:off", "openrouter/org/p3:off"]);
});

test("fallbackQualityFloor 1 requires an exact quality match", () => {
  const p = preview(onlyDefault({ fallbackQualityFloor: 1 }), { models: SUB_FLOOR_CHEAP });
  assert.deepEqual(p.chains["openrouter/org/chosen"], ["openrouter/org/p2:off", "openrouter/org/p3:off"]);
});

test("a chain key claimed by two roles stays level-free", () => {
  // `smol` re-weighted to `default`'s ranking but with a different thinking level:
  // both land on `model-a`, so one chain serves both and its values carry no level.
  const raw = onlyDefault({ roles: { smol: { weights: DEFAULT_ROLES.default.weights, required: DEFAULT_ROLES.default.required, thinking: "off" } } });
  const p = preview(raw);
  assert.deepEqual(Object.keys(p.chains), ["openrouter/org/model-a"]);
  assert.deepEqual(p.chains["openrouter/org/model-a"], ["openrouter/org/model-b", "openrouter/org/model-c"]);
  // Each decision carries the chain key its chain is filed under, so the SPA
  // reads it instead of re-deriving it from the selector and the resolved level.
  assert.deepEqual(p.decisions.map((d) => d.chainKey), ["openrouter/org/model-a", "openrouter/org/model-a"]);
});

// ---------------------------------------------------------------------------
// The config side effects.
// ---------------------------------------------------------------------------

test("a role the plugin managed but no longer resolves appears in roleRemovals", () => {
  const p = preview(onlyDefault(), { state: { managedRoles: ["vision"], pluginWrittenChainKeys: [], managedDisabledAgents: [] } });
  assert.deepEqual(p.roleRemovals, ["vision"]);
});

test("an agent whose pinned role is disabled appears in agentDisableAdds", () => {
  const p = preview(onlyDefault(), { agentPins: [{ agent: "designer", role: "designer", scope: "plugin" }] });
  assert.deepEqual(p.agentDisableAdds, ["designer"]);
  assert.deepEqual(p.agentDisableRemoves, []);
});

test("a previously-managed name whose role is re-enabled appears in agentDisableRemoves", () => {
  // `designer` ships disabled; enabling it must clear the agent's managed entry.
  const p = preview({ roles: { designer: { enabled: true } } }, {
    agentPins: [{ agent: "designer", role: "designer", scope: "plugin" }],
    state: { managedRoles: [], pluginWrittenChainKeys: [], managedDisabledAgents: ["designer"] },
  });
  assert.deepEqual(p.agentDisableAdds, []);
  assert.deepEqual(p.agentDisableRemoves, ["designer"]);
});

// ---------------------------------------------------------------------------
// The roles the preview could not decide.
// ---------------------------------------------------------------------------

test("a locked role is skipped with a reason", () => {
  const p = preview(onlyDefault({ roles: { default: { locked: true } } }));
  assert.deepEqual(p.skipped, [{ role: "default", reason: "locked" }]);
  assert.deepEqual(p.decisions, []);
});

test("a role with no eligible candidate is skipped with a reason", () => {
  const p = preview(onlyDefault({ roles: { default: { required: ["vision"] } } }));
  assert.deepEqual(p.skipped, [{ role: "default", reason: "no eligible candidate" }]);
});

test("a providerPin that matches no route is skipped with a reason", () => {
  const p = preview(onlyDefault({ roles: { default: { providerPin: "nope" } } }));
  assert.deepEqual(p.skipped, [{ role: "default", reason: 'providerPin "nope" matches no route' }]);
});

// ---------------------------------------------------------------------------
// `RunResult.patch`.
// ---------------------------------------------------------------------------

test("RunResult.patch carries the computed patch on a dry run", async () => {
  const dir = setupAgentDir('modelRoles:\n  default: "openrouter/org/model-b"\n');
  const deps = fakeDeps(MODELS, onlyDefault(), { getRankData: async () => RANK, getCatalog: async () => CATALOG });
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true, dryRun: true }));
  assert.equal(result.wrote, false);
  const patch = result.patch;
  if (patch === undefined) throw new Error("a dry run must carry the patch");
  assert.equal(patch.roleSelectors.default, "openrouter/org/model-a:off");
  assert.deepEqual(patch.chainUpserts["openrouter/org/model-a"], ["openrouter/org/model-b:off", "openrouter/org/model-c:off"]);
});

test("RunResult.patch is absent on an abort", async () => {
  const dir = setupAgentDir("other: 1\n");
  const deps = fakeDeps(MODELS, { switchMargin: 1.5 }, { getRankData: async () => RANK, getCatalog: async () => CATALOG });
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true, dryRun: true }));
  assert.ok(result.aborted);
  assert.equal(result.patch, undefined);
});

// ---------------------------------------------------------------------------
// The agreement test: the preview is the updater's decision, not a second one.
// ---------------------------------------------------------------------------

type StateFixture = { managedRoles?: string[]; pluginWrittenChainKeys?: string[]; managedDisabledAgents?: string[] };

/** A real dry run and a preview on the same fixture, in the same agent dir, with
 * the same harvested agent pins. `opts.catalog` is the full catalog (every
 * provider) for a provider-priority fixture; `opts.deps` overrides the fake
 * deps (the provider catalog seams). */
async function agreement(
  raw: Record<string, unknown>,
  models: Model[],
  configText: string,
  state: StateFixture = {},
  opts: { catalog?: CatalogEntry[]; deps?: Partial<Deps>; availability?: KeyAvailability } = {},
) {
  const catalog = opts.catalog ?? makeCatalog(models.map((m) => m.id));
  const availability = opts.availability ?? NO_FILTER_AVAILABILITY;
  const rank: RankData = { models, fetchedAt: "2026-09-22T00:00:00.000Z", source: "test", orMatched: models.length, orPriced: models.length };
  // One shared `RankData`, enriched once before either call: `runUpdater` enriches
  // in place, so a preview run first on unenriched models would diverge on the
  // thinking price factor for a non-bug reason.
  enrichCatalogData(rank.models, catalog);
  const dir = setupAgentDir(configText, state);
  const deps = fakeDeps(models, raw, {
    getRankData: async () => rank,
    getCatalog: async () => catalog,
    getKeyAvailability: async () => availability,
    probeModel: async () => "ok",
    probeRoute: async () => "ok",
    // Per-test cache path: the provider refresh must never touch the repo cache.
    providerCatalogCachePath: join(dir, "provider-catalog-cache.json"),
    ...opts.deps,
  });
  return runInTempDir(dir, async () => {
    const result = await runUpdater("manual", deps, { force: true, dryRun: true });
    const preview = previewSelection({
      settings: resolved(raw),
      rank,
      eligible: filterCatalog(catalog, "billed"),
      catalog,
      availability,
      currentSelectors: parseConfig(readFileSync(join(dir, "config.yml"), "utf8")).modelRoles,
      state: {
        managedRoles: state.managedRoles ?? [],
        pluginWrittenChainKeys: state.pluginWrittenChainKeys ?? [],
        managedDisabledAgents: state.managedDisabledAgents ?? [],
      },
      agentPins: discoverAgentPins(),
      raw,
    });
    return { result, preview };
  });
}

function assertAgrees(result: RunResult, preview: SelectionPreview): void {
  const patch = result.patch;
  if (patch === undefined) throw new Error("the dry run must carry the patch");
  assert.deepEqual(preview.decisions, result.decisions);
  assert.deepEqual(preview.chains, patch.chainUpserts);
  assert.deepEqual(preview.chainPrunes, patch.chainPrunes);
  assert.deepEqual(preview.roleRemovals, patch.roleRemovals);
  assert.deepEqual(preview.agentDisableAdds, patch.agentDisableAdds);
  assert.deepEqual(preview.agentDisableRemoves, patch.agentDisableRemoves);
}

test("agreement: the preview matches a real dry run's decisions and patch", async () => {
  const { result, preview } = await agreement(onlyDefault(), MODELS, 'modelRoles:\n  default: "openrouter/org/model-b"\n', {
    managedRoles: ["vision"],
    pluginWrittenChainKeys: ["openrouter/org/stale"],
    managedDisabledAgents: ["designer", "ghost"],
  });
  assertAgrees(result, preview);
  // The fixture is non-trivial: the side effects are all exercised.
  assert.deepEqual(preview.roleRemovals, ["vision"]);
  assert.deepEqual(preview.chainPrunes, ["openrouter/org/stale"]);
  assert.deepEqual(preview.agentDisableAdds, ["designer"]);
  assert.deepEqual(preview.agentDisableRemoves, ["ghost"]);
});

test("agreement: the preview matches a real dry run with the auto-pin chain", async () => {
  const models = [routed("model-a", 90, 1, 100, ["alpha", "beta"]), routed("model-b", 80, 5, 60, ["gamma"])];
  const raw = onlyDefault({ roles: { default: { preferOwnProvider: true } } });
  const { result, preview } = await agreement(raw, models, "other: 1\n");
  assertAgrees(result, preview);
  // The auto-pin chain: the primary's other route, then the fallback's route.
  // The chain key carries the pin (a chain key is the selector minus its level).
  assert.equal(preview.decisions[0].to, "openrouter/org/model-a@alpha:off");
  assert.deepEqual(preview.chains["openrouter/org/model-a@alpha"], ["openrouter/org/model-a@beta:off", "openrouter/org/model-b@gamma:off"]);
});

test("agreement: at fallbackChainDepth 0 the walk window is the incumbent alone", async () => {
  // The walk probes the incumbent first and stops as soon as `1 + depth` clean
  // candidates exist, so at depth 0 the window is the incumbent alone: the
  // updater keeps it even though the value leader beats it by the margin. The
  // preview must use the same window, not the whole usable set — otherwise it
  // reports `switched` where the run reports `kept-eligible` (user story 27).
  const raw = onlyDefault({ fallbackChainDepth: 0, switchMargin: 0.1 });
  const { result, preview } = await agreement(raw, MODELS, 'modelRoles:\n  default: "openrouter/org/model-b"\n');
  assertAgrees(result, preview);
  assert.deepEqual(preview.decisions.map((d) => d.reason), ["kept-eligible"]);
  assert.equal(preview.decisions[0].to, "openrouter/org/model-b:off");
});

test("agreement: the preview matches a real dry run on a shared chain key", async () => {
  // `smol` re-weighted to `default`'s ranking but with a different thinking level:
  // both are kept-eligible on `model-a`, so one chain serves both and its values
  // carry no level. This is the shared-key claim compared against the updater.
  const raw = onlyDefault({ roles: { smol: { weights: DEFAULT_ROLES.default.weights, required: DEFAULT_ROLES.default.required, thinking: "off" } } });
  const configText = 'modelRoles:\n  default: "openrouter/org/model-a:off"\n  smol: "openrouter/org/model-a:off"\n';
  const { result, preview } = await agreement(raw, MODELS, configText);
  assertAgrees(result, preview);
  assert.deepEqual(preview.decisions.map((d) => d.reason), ["kept-eligible", "kept-eligible"]);
  assert.deepEqual(Object.keys(preview.chains), ["openrouter/org/model-a"]);
  assert.deepEqual(preview.chains["openrouter/org/model-a"], ["openrouter/org/model-b", "openrouter/org/model-c"]);
});

// ---------------------------------------------------------------------------
// Spec #116: the preview resolves a candidate on its effective provider. The
// full catalog is passed so the provider-scoped resolution can see the
// non-OpenRouter rows (`eligible` is OpenRouter-only).
// ---------------------------------------------------------------------------

/** Catalog rows for a non-OpenRouter provider. */
function providerCatalog(provider: string, ids: string[], thinking: string[] = []): CatalogEntry[] {
  return ids.map((id) => ({
    provider,
    id: `org/${id}`,
    selector: `${provider}/org/${id}`,
    name: id,
    contextWindow: 200000,
    maxTokens: 8192,
    reasoning: true,
    thinking,
    input: ["text"],
    cost: null,
  }));
}

test("a provider priority resolves the candidate on its effective provider", () => {
  const models = [makeModel("model-a", 90, 1, 100), makeModel("model-b", 80, 5, 60)];
  const catalog = [...makeCatalog(["model-a", "model-b"]), ...providerCatalog("flocta", ["model-a"])];
  enrichCatalogData(models, catalog);
  const p = preview(onlyDefault({ providerPriority: "flocta" }), { models, catalog });
  assert.equal(p.decisions[0].to, "flocta/org/model-a:off");
  assert.equal(p.decisions[0].chainKey, "flocta/org/model-a");
  // The chain's primary cross-provider entry is the OpenRouter wildcard (the
  // OpenRouter catalog id equals the chosen provider's), then the fallback.
  assert.deepEqual(p.chains["flocta/org/model-a"], ["openrouter/*:off", "openrouter/org/model-b:off"]);
});

test("a none tier resolves no candidate even with a full catalog", () => {
  // The key has no usable budget: `eligible` is empty, and the full catalog
  // passed for provider resolution must not resurrect a candidate.
  const models = [makeModel("model-a", 90, 1, 100)];
  const catalog = [...makeCatalog(["model-a"]), ...providerCatalog("flocta", ["model-a"])];
  enrichCatalogData(models, catalog);
  const p = preview(onlyDefault({ providerPriority: "flocta" }), { models, catalog, tier: "none" });
  assert.deepEqual(p.decisions, []);
  assert.deepEqual(p.skipped, [{ role: "default", reason: "no eligible candidate" }]);
});

test("a non-OpenRouter candidate is not pruned by the OpenRouter keyed set", () => {
  // `model-a` is blocked on OpenRouter, but its effective provider is flocta, so
  // the OpenRouter keyed prune must not drop it: the role is still decided and
  // the decision's key-blocked count is 0.
  const models = [makeModel("model-a", 90, 1, 100), makeModel("model-b", 80, 5, 60)];
  const catalog = [...makeCatalog(["model-a", "model-b"]), ...providerCatalog("flocta", ["model-a"])];
  enrichCatalogData(models, catalog);
  const p = preview(onlyDefault({ providerPriority: "flocta" }), { models, catalog, availability: availability(["model-a"], ["model-b"]) });
  assert.equal(p.decisions.length, 1);
  assert.equal(p.decisions[0].to, "flocta/org/model-a:off");
  assert.equal(p.decisions[0].keyBlockedCount, 0);
});

// Spec #116: the preview and the run share the provider-priority decision, so
// they cannot drift on the selector or the cross-provider chain.
test("agreement: the preview matches a real dry run under a provider priority", async () => {
  // Fresh models: `enrichCatalogData` mutates the ranking rows in place.
  const models = [makeModel("model-a", 90, 1, 100), makeModel("model-b", 80, 5, 60), makeModel("model-c", 70, 10, 30)];
  const flocta = providerCatalog("flocta", ["model-a"]);
  const catalog = [...makeCatalog(models.map((m) => m.id)), ...flocta];
  const raw = onlyDefault({ providerPriority: "flocta" });
  const { result, preview } = await agreement(raw, models, "other: 1\n", {}, {
    catalog,
    deps: {
      getProviderCatalog: async () => flocta,
      refreshProviderCatalog: async (provider) => ({ provider, ok: true }),
    },
  });
  assertAgrees(result, preview);
  assert.equal(preview.decisions[0].to, "flocta/org/model-a:off");
  // The chosen model on OpenRouter first (the wildcard keeps the model id),
  // then the next-best models in value order.
  assert.deepEqual(preview.chains["flocta/org/model-a"], [
    "openrouter/*:off",
    "openrouter/org/model-b:off",
    "openrouter/org/model-c:off",
  ]);
});

test("agreement: a provider change is a margin switch, not a kept-eligible rewrite", async () => {
  // The incumbent is `openrouter/org/model-a`; the priority makes model-a's
  // effective provider flocta. A bonus inside the margin keeps the incumbent on
  // OpenRouter, and the preview must agree with the run.
  const models = [makeModel("model-a", 90, 1, 100), makeModel("model-b", 80, 5, 60)];
  const flocta = providerCatalog("flocta", ["model-a"]);
  const catalog = [...makeCatalog(models.map((m) => m.id)), ...flocta];
  const raw = onlyDefault({ providerPriority: "flocta", providerBonus: 0.01 });
  const { result, preview } = await agreement(raw, models, 'modelRoles:\n  default: "openrouter/org/model-a"\n', {}, {
    catalog,
    deps: {
      getProviderCatalog: async () => flocta,
      refreshProviderCatalog: async (provider) => ({ provider, ok: true }),
    },
  });
  assertAgrees(result, preview);
  assert.equal(preview.decisions[0].reason, "kept-margin");
  assert.equal(preview.decisions[0].to, "openrouter/org/model-a:off");
});

test("agreement: a provider bonus promotes a lower-value model and bestValue follows the challenger", async () => {
  // model-a is the honest value leader; model-b is offered by the prioritized
  // provider, so its bonus makes it the effective-value leader. The decision's
  // `bestValue` must be the challenger's honest value (not the value walk's
  // leader), and the preview must agree.
  const models = [makeModel("model-a", 90, 1, 100), makeModel("model-b", 88, 1, 100)];
  const flocta = providerCatalog("flocta", ["model-b"]);
  const catalog = [...makeCatalog(models.map((m) => m.id)), ...flocta];
  const raw = onlyDefault({ providerPriority: "flocta" });
  const { result, preview } = await agreement(raw, models, "other: 1\n", {}, {
    catalog,
    deps: {
      getProviderCatalog: async () => flocta,
      refreshProviderCatalog: async (provider) => ({ provider, ok: true }),
    },
  });
  assertAgrees(result, preview);
  const ranked = rankRole(resolved(raw).roles.default, models);
  const modelA = ranked.find((r) => r.model.id === "model-a");
  const modelB = ranked.find((r) => r.model.id === "model-b");
  assert.ok(modelA && modelB);
  // The bonus flips the effective leader: model-b's honest value is lower.
  assert.ok(modelB.value < modelA.value);
  assert.ok(modelB.value + (modelB.providerBonus ?? 0) > modelA.value + (modelA.providerBonus ?? 0));
  assert.equal(result.decisions[0].to, "flocta/org/model-b:off");
  assert.equal(result.decisions[0].bestValue, modelB.value);
  assert.equal(preview.decisions[0].bestValue, modelB.value);
});

test("agreement: a key-blocked OpenRouter incumbent is adopted away from, not kept", async () => {
  // model `x` is key-blocked on OpenRouter; its effective provider is flocta
  // (blend 4.5 vs OpenRouter 5). The incumbent `openrouter/org/x` is not usable,
  // so both the run and the preview adopt the flocta challenger.
  const models = [makeModel("x", 90, 5, 100)];
  const flocta = [{ ...providerCatalog("flocta", ["x"])[0], cost: { input: 4.5, output: 4.5 } }];
  const catalog = [...makeCatalog(["x"]), ...flocta];
  const raw = onlyDefault({ providerPriority: "flocta", providerBonus: 0.01, switchMargin: 0.5 });
  const { result, preview } = await agreement(raw, models, 'modelRoles:\n  default: "openrouter/org/x"\n', {}, {
    catalog,
    availability: availability(["x"], []),
    deps: {
      getProviderCatalog: async () => flocta,
      refreshProviderCatalog: async (provider) => ({ provider, ok: true }),
    },
  });
  assertAgrees(result, preview);
  assert.equal(result.decisions[0].reason, "adopted");
  assert.equal(result.decisions[0].to, "flocta/org/x:off");
  assert.equal(preview.decisions[0].reason, "adopted");
  assert.equal(preview.decisions[0].to, "flocta/org/x:off");
});
