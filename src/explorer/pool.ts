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
 *    filtered to allowed providers (`providerAllowed`), mirroring
 *    `src/updater.ts:349-357`. A null whitelist (no whitelist set / harvest
 *    failed) leaves the routes untouched;
 * 3. the keyed-catalog prune — drop every model the account's key cannot run
 *    (`availability.active && availability.blocked.has(id)`), mirroring the
 *    updater's `keyBlocked` (`src/updater.ts:458`). Key-blocked rows are pruned,
 *    not kept-and-marked: the pool's contract is "the pool the updater writes
 *    from", so its leader must be the model the updater would pick. An inactive
 *    keyed catalog (`active: false`) leaves the pool byte-identical to the
 *    two-filter result.
 *
 * Pure: the input `RankData` and its models are never mutated. The fetch
 * metadata (`fetchedAt`, `source`, `orMatched`, `orPriced`) describes the fetch,
 * not the pool, and is carried through unchanged.
 */

import { filterCatalog, providerAllowed, resolveVariant, type CatalogEntry, type KeyAvailability, type Tier } from "../availability.ts";
import type { RankData } from "../engine.ts";

/** Which dataset the explorer ranks: the raw fetch, or the pool the updater writes from. */
export type PoolMode = "raw" | "as-written";

/** The inputs the as-written pool needs beyond the ranking data: the omp catalog,
 * the key's tier, the account's allowed-providers whitelist (`null` = no
 * whitelist / harvest failed), and the keyed-catalog availability (the blocked
 * set, or the availability record). */
export type PoolInputs = {
  catalog: CatalogEntry[];
  tier: Tier;
  allowed: ReadonlySet<string> | null;
  availability: KeyAvailability;
};

/** The as-written pool: `rank` with the catalog/tier gate, the
 * allowed-providers prune, and the keyed-catalog prune applied. `tier: "none"`
 * yields an empty pool. */
export function asWrittenPool(rank: RankData, inputs: PoolInputs): RankData {
  const tier = inputs.tier;
  const eligible = filterCatalog(inputs.catalog, tier);
  const gated = tier === "none" ? [] : rank.models.filter((m) => resolveVariant(m.id, eligible, tier) !== null);
  const allowed = inputs.allowed;
  const routed =
    allowed === null
      ? gated
      : gated.map((m) => {
          const routes = m.routes;
          if (routes === undefined) return m;
          return { ...m, routes: routes.filter((r) => providerAllowed(allowed, r.providerSlug)) };
        });
  const availability = inputs.availability;
  const models = availability.active ? routed.filter((m) => !availability.blocked.has(m.id)) : routed;
  return { ...rank, models };
}
