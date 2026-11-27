/**
 * The as-written pool: the explorer's dataset filtered exactly as the updater
 * filters it before ranking (spec #81; keyed-catalog prune: spec #103). Three
 * filters, all sourced from the availability primitives so the two pools cannot
 * drift:
 *
 * 1. the catalog/tier gate — `filterCatalog(catalog, tier)`, then keep only
 *    models whose ranking id resolves to a tier-eligible entry
 *    (`resolveVariant`), mirroring `src/updater.ts:300` + `:376`;
 * 2. the allowed-providers whitelist prune — each kept model's routes are
 *    filtered to allowed providers (`pruneRoutesToAllowed`), mirroring
 *    `src/updater.ts:310-316`. A null whitelist (no whitelist set / harvest
 *    failed) leaves the routes untouched;
 * 3. the keyed-catalog prune — drop every model the account's key cannot run
 *    (`availability.active && availability.blocked.has(id)`), mirroring the
 *    updater's `keyBlocked` (`src/updater.ts:458`). Key-blocked rows are pruned,
 *    not kept-and-marked: the pool's contract is "the pool the updater writes
 *    from", so its leader must be the model the updater would pick. An inactive
 *    keyed catalog (`active: false`) leaves the pool byte-identical to the
 *    two-filter result. The prune is OpenRouter-only: a model whose effective
 *    provider is a prioritized non-OpenRouter provider is not key-blocked (the
 *    keyed set describes the OpenRouter key, not the provider's catalog).
 *
 * Provider priority (spec #116): the catalog/tier gate keeps a model when it
 * resolves on OpenRouter OR on any prioritized provider, so a provider-only
 * model stays in the pool. An empty priority list leaves the pool byte-identical
 * to the pre-#116 result.
 *
 * Pure: the input `RankData` and its models are never mutated. The fetch
 * metadata (`fetchedAt`, `source`, `orMatched`, `orPriced`) describes the fetch,
 * not the pool, and is carried through unchanged.
 */

import { filterCatalog, pruneRoutesToAllowed, resolveProviderVariant, resolveVariant, type CatalogEntry, type KeyAvailability, type Tier } from "../availability.ts";
import type { RankData } from "../engine.ts";
import { providerOrder } from "../provider-priority.ts";

/** Which dataset the explorer ranks: the raw fetch, or the pool the updater writes from. */
export type PoolMode = "raw" | "as-written";

/** The inputs the as-written pool needs beyond the ranking data: the omp catalog,
 * the key's tier, the account's allowed-providers whitelist (`null` = no
 * whitelist / harvest failed), the keyed-catalog availability (the blocked set,
 * or the availability record), and the global provider priority list (empty =
 * OpenRouter only). */
export type PoolInputs = {
  catalog: CatalogEntry[];
  tier: Tier;
  allowed: ReadonlySet<string> | null;
  availability: KeyAvailability;
  /** The scope's global `providerPriority` (spec #116). Empty = today's pool. */
  providerPriority: string[];
};

/** The model's effective provider in the pool: the first prioritized provider
 * that offers it, else `openrouter` (the implicit last resort). Mirrors
 * `effectiveProvider` but resolves against the catalog rather than the
 * enrichment-attached offers, so the pool is pure and order-independent. */
function effectiveProviderInPool(modelId: string, order: readonly string[], catalog: readonly CatalogEntry[], tier: "billed" | "free"): string {
  for (const provider of order) {
    if (provider === "openrouter") return "openrouter";
    if (resolveProviderVariant(modelId, provider, catalog, tier) !== null) return provider;
  }
  return "openrouter";
}

/** The as-written pool: `rank` with the catalog/tier gate, the
 * allowed-providers prune, and the keyed-catalog prune applied. `tier: "none"`
 * yields an empty pool. */
export function asWrittenPool(rank: RankData, inputs: PoolInputs): RankData {
  const tier = inputs.tier;
  const eligible = filterCatalog(inputs.catalog, tier);
  const order = providerOrder(inputs.providerPriority);
  const t: "billed" | "free" = tier === "free" ? "free" : "billed";
  // The gate keeps a model that resolves on OpenRouter OR on any prioritized
  // provider; an empty list leaves only the OpenRouter arm, today's behavior.
  const gated = tier === "none"
    ? []
    : rank.models.filter(
        (m) =>
          resolveVariant(m.id, eligible, t) !== null ||
          order.some((p) => p !== "openrouter" && resolveProviderVariant(m.id, p, inputs.catalog, t) !== null),
      );
  const allowed = inputs.allowed;
  const routed = pruneRoutesToAllowed(gated, allowed).models;
  const availability = inputs.availability;
  // The keyed prune is OpenRouter-only: a model whose effective provider is a
  // prioritized non-OpenRouter provider is not key-blocked.
  const models = availability.active
    ? routed.filter((m) => effectiveProviderInPool(m.id, order, inputs.catalog, t) !== "openrouter" || !availability.blocked.has(m.id))
    : routed;
  return { ...rank, models };
}
