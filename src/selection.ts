/**
 * The pure decision core shared by the updater and the explorer's preview
 * (spec #109): the six-arm hysteresis ladder, the fallback-chain builder, the
 * `task.disabledAgents` sync, and `previewSelection` — a probe-optimistic
 * "what the updater would write" computed without a request and without a write.
 *
 * `runUpdater` keeps the candidate building, the keyed prune, the probe walk,
 * the route probe, the orchestration, the config read and the write; it calls
 * into this module for the decision itself, so the preview and the run cannot
 * drift. The agreement test (`tests/selection-preview.test.ts`) pins the two
 * against each other on a probe-clean fixture.
 */

import { autoPinApplies, barSelection, computeRankings, endpointFilterDrops, META_LEVELS, pickOrder, providerPinDrops, rankedRoutes, type Ranked, type RankData, type RoleDef } from "./engine.ts";
import { currentRankingId, resolveVariant, splitThinkingSuffix, type CatalogEntry, type KeyAvailability, type Tier } from "./availability.ts";
import { roleUniverse, type ResolvedSettings } from "./settings.ts";
import type { AgentPin } from "./agent-pins.ts";

export type DecisionReason = "adopted" | "switched" | "switched-cost" | "kept-margin" | "kept-eligible" | "no-current";

export type Decision = {
  role: string;
  from: string | null;
  to: string;
  reason: DecisionReason;
  value: number;
  bestValue: number;
  currentValue: number | null;
  /** Catalog ids probed blocked (provider allowlist) while selecting this role. */
  blocked: string[];
  /** Ranking ids dropped by the role's endpoint capability filters (no capable
   * standard-tier route) — recorded like a probe-blocked candidate. */
  endpointBlocked: string[];
  /** Ranking ids dropped by the role's provider pin (no route matching the pin) —
   * recorded like a probe-blocked candidate. */
  pinBlocked: string[];
  /** Provider slugs the auto-pin's route probe rejected on the chosen model, in
   * walk order — rendered `; route-blocked: …`. Slugs, not ids: the sibling
   * `blocked` holds catalog ids and `pinBlocked` ranking ids. Empty when no
   * probe ran. */
  routeBlockedSlugs: string[];
  /** True when the auto-pin applies and the model has gate-passing routes but
   * every candidate was rejected (or the route-probe budget ran out): the
   * selector stays bare and OpenRouter routes the request itself. */
  pinDropped: boolean;
  /** Availability source for this role's selection: the keyed-catalog fast path or the probe walk. */
  availabilitySource: "keyed-catalog" | "probe";
  /** Candidates pruned as key-blocked (present in the public catalog, absent from the keyed one). */
  keyBlockedCount: number;
};

/** A ranked model resolved to a concrete catalog id. */
export type Candidate = { ranked: Ranked; catalogId: string };

/** Per managed role: its bare chain key, role suffix, provider pin, the
 * candidates its chain's fallback models are drawn from, the chosen model's
 * index in that list, and the inputs the auto-pin chain builder needs (the
 * expanded def for `rankedRoutes`, and whether the pin was auto-derived).
 * `candidates` is the role's ranked candidate list minus the candidates no
 * chain entry may name (key-blocked, probe-blocked) — not the probe-clean pool
 * — so the chain can reach a cheaper-or-equal model ranked below the probe
 * window. `pinnedSlug` is the route the auto-pin wrote — undefined for a manual
 * pin, for a dropped pin and with the capability off — so the chain builder can
 * exclude the pinned route by slug rather than by its position in the route
 * order. */
export type ChainPlan = { key: string; suffix: string | undefined; pin: string; pinnedSlug: string | undefined; candidates: Candidate[]; chosenIdx: number; def: RoleDef; autoPin: boolean };

/** What the updater would write, computed without a request and without a write. */
export type SelectionPreview = {
  decisions: Decision[];
  /** The chain upserts, keyed by chain key. */
  chains: Record<string, string[]>;
  chainPrunes: string[];
  roleRemovals: string[];
  agentDisableAdds: string[];
  agentDisableRemoves: string[];
  /** One entry per role the preview could not decide, with the reason. */
  skipped: { role: string; reason: string }[];
};

/**
 * Cost-side escape from the hysteresis margin. `switchMargin` is a
 * flat band on `value`, so it can veto a switch worth up to `switchMargin / λ`
 * $/M while the incumbent is only marginally better — e.g. a role at λ 0.003
 * refuses up to $7/M of savings. A challenger inside that band is adopted when
 * it undercuts the incumbent's effective price by `priceSwitchFraction` (0.5 =
 * at least twice as cheap). 0 disables the override.
 *
 * The effective switch margin rides on `settings.switchMargin`: `runUpdater`
 * passes a copy of the resolved settings carrying a per-run override (spec #99),
 * so this helper reads one input, not two.
 */
export function cheaperInsideMargin(best: Ranked, current: Ranked, settings: ResolvedSettings): boolean {
  if (settings.priceSwitchFraction <= 0 || current.priceEff <= 0) return false;
  if (best.value < current.value - settings.switchMargin) return false;
  return best.priceEff <= current.priceEff * (1 - settings.priceSwitchFraction);
}

/** The six-arm hysteresis ladder. First match wins:
 *  no-current → adopted → kept-eligible → switched → switched-cost → kept-margin.
 *  The order is safe for both selection modes: in cheapest mode an under-bar
 *  incumbent can never be the pick (the pick is bar-clearing), so
 *  `kept-eligible` cannot shadow `switched`. */
export function decide<C extends { ranked: Ranked }>(input: {
  currentSelector: string | null;
  currentEntry: C | null;
  challenger: C;
  switched: (current: C) => boolean;
  costEscape: (current: C) => boolean;
}): { chosen: C; reason: DecisionReason } {
  if (input.currentSelector === null) return { chosen: input.challenger, reason: "no-current" };
  if (input.currentEntry === null) return { chosen: input.challenger, reason: "adopted" };
  if (input.currentEntry.ranked.model.id === input.challenger.ranked.model.id) return { chosen: input.currentEntry, reason: "kept-eligible" };
  if (input.switched(input.currentEntry)) return { chosen: input.challenger, reason: "switched" };
  if (input.costEscape(input.currentEntry)) return { chosen: input.challenger, reason: "switched-cost" };
  return { chosen: input.currentEntry, reason: "kept-margin" };
}

/**
 * The chain builder: shared-key claims, the quality floor, the auto-pin route
 * expansion (pinned slug excluded by slug), the manual/no-pin path, the thinking
 * suffix per target, the dedup, and the prune.
 *
 * A chain key is model-oriented: when several managed roles land on the same
 * model, one chain serves all of them, so its values stay level-free instead
 * of imposing whichever role iterated last. A key claimed by exactly one role
 * carries that role's thinking suffix on every entry whose target advertises
 * thinking support — so a fallback runs at the role's effort, not the
 * session default. Deduped, key excluded.
 *
 * `plans` is in decision order. `keepKeys` are the chain keys that must survive
 * the prune because their role is left untouched (locked roles and roles whose
 * pin matched no route). `writtenKeys` is `state.pluginWrittenChainKeys`.
 */
export function buildChains(input: {
  plans: readonly { role: string; plan: ChainPlan }[];
  settings: ResolvedSettings;
  rowById: Map<string, CatalogEntry>;
  keepKeys: readonly string[];
  writtenKeys: readonly string[];
}): { chainUpserts: Record<string, string[]>; chainPrunes: string[] } {
  const chainUpserts: Record<string, string[]> = {};
  const referenced = new Set<string>();
  if (input.settings.writeFallbackChains) {
    const claims: Record<string, number> = {};
    for (const { plan } of input.plans) claims[plan.key] = (claims[plan.key] ?? 0) + 1;
    for (const { plan } of input.plans) {
      const suffix = claims[plan.key] === 1 ? plan.suffix : undefined;
      // Cost-aware ordering with a quality floor: prefer fallbacks priced at or
      // below the chosen model that still retain `fallbackQualityFloor` of its
      // quality (a failover must not silently drop the role onto a much weaker
      // model), then fill any remaining depth with the next-best by value. The
      // floor and the `after` set both key off the chosen model — the leader on
      // a fresh pick, the kept current candidate on a kept role — and the floor
      // never filters the pricier set, so a cheap-but-weak candidate set cannot
      // starve the chain.
      const after = plan.candidates.slice(plan.chosenIdx + 1);
      const chosen = plan.candidates[plan.chosenIdx];
      const cheaper = after.filter((p) => p.ranked.priceEff <= chosen.ranked.priceEff && p.ranked.q >= chosen.ranked.q * input.settings.fallbackQualityFloor);
      const pricier = after.filter((p) => p.ranked.priceEff > chosen.ranked.priceEff);
      const chainPool = [...cheaper, ...pricier].slice(0, input.settings.fallbackChainDepth);
      // A chain value's thinking level is appended only when the target's
      // catalog entry advertises support (or the level is a meta level).
      const levelFor = (catalogId: string): string => {
        const row = input.rowById.get(catalogId);
        return suffix !== undefined && row !== undefined && (META_LEVELS[suffix] === true || row.thinking.includes(suffix)) ? `:${suffix}` : "";
      };
      const values: string[] = [];
      if (plan.autoPin) {
        // Auto-pin chain (spec #58, expanded by #69): every gate-passing route
        // of the primary model except the pinned route, then every
        // gate-passing route of each fallback model, in the role's
        // value-for-money score order (`rankedRoutes`, spec #71) — every entry
        // bound to its route's provider, so a down primary
        // provider falls back to the same model on another provider rather
        // than a different model. `rankedRoutes` already applies every gate
        // (non-degraded, endpoint filters, usable billed price, the
        // maxPriceUsdPerM cap, the allowed-providers whitelist), so the chain
        // carries exactly the routes the role can use. The pin is excluded by
        // slug, not by position: the route probe can pin a route other than
        // the score leader, and with a dropped pin no route is excluded at
        // all. The dedup below collapses two routes that share a provider slug
        // (same chain value), so the chain length is (R_primary − 1) + Σ
        // R_fallback over distinct gate-passing provider slugs (R_primary with
        // no pin). Only the pinned route is probe-verified: one unroutable
        // chain entry is survivable, omp fails over.
        const chosenCandidate = plan.candidates[plan.chosenIdx];
        for (const r of rankedRoutes(chosenCandidate.ranked.model, plan.def)) {
          if (r.providerSlug === plan.pinnedSlug) continue;
          values.push(`openrouter/${chosenCandidate.catalogId}@${r.providerSlug}${levelFor(chosenCandidate.catalogId)}`);
        }
        for (const p of chainPool) {
          for (const r of rankedRoutes(p.ranked.model, plan.def)) {
            values.push(`openrouter/${p.catalogId}@${r.providerSlug}${levelFor(p.catalogId)}`);
          }
        }
      } else {
        // Manual pin (every value carries it) or no pin (bare values).
        for (const p of chainPool) values.push(`openrouter/${p.catalogId}${plan.pin}${levelFor(p.catalogId)}`);
      }
      chainUpserts[plan.key] = [...new Set(values)].filter((v) => v !== plan.key);
      referenced.add(plan.key);
    }
    // Locked roles keep their current chain: the plugin neither rewrites nor
    // prunes it, so its key must count as referenced. A role whose pin matched
    // no route is likewise left unchanged, so its current chain must survive
    // the prune.
    for (const key of input.keepKeys) referenced.add(key);
  }
  const chainPrunes = input.settings.writeFallbackChains ? input.writtenKeys.filter((k) => !referenced.has(k)) : [];
  return { chainUpserts, chainPrunes };
}

/**
 * `task.disabledAgents` entries the plugin manages: each discovered agent is
 * disabled exactly while the role its `model:` chain pins is disabled. An agent
 * whose pinned role is unknown (the `@role, @default` chain falls back) or that
 * pins no role is left alone, as are unrelated entries.
 *
 * `previouslyManaged` is the set the plugin added on a previous run (state
 * `managedDisabledAgents`): a name no longer in the desired add-set — its agent
 * file was removed (`/remove-agent`) or its role is no longer disabled — is
 * removed, so the plugin never leaves a stale entry behind. The returned
 * `agentDisableAdds` is the new managed set.
 *
 * `pins` is a parameter (not a `discoverAgentPins()` call) so the preview stays
 * pure: the caller harvests the filesystem scan once and passes the same pins
 * to the run and to the preview.
 */
export function agentDisablePatch(
  raw: Record<string, unknown>,
  settings: ResolvedSettings,
  previouslyManaged: readonly string[],
  pins: readonly AgentPin[],
): { agentDisableAdds: string[]; agentDisableRemoves: string[] } {
  const universe = roleUniverse(raw, settings.roles);
  const agentDisableAdds: string[] = [];
  const agentDisableRemoves: string[] = [];
  const desired = new Set<string>();
  for (const pin of pins) {
    const entry = universe[pin.role];
    if (entry === undefined) continue; // unknown role — the chain falls back, leave the agent alone
    if (entry.enabled) agentDisableRemoves.push(pin.agent);
    else {
      agentDisableAdds.push(pin.agent);
      desired.add(pin.agent);
    }
  }
  for (const name of previouslyManaged) {
    if (!desired.has(name) && !agentDisableRemoves.includes(name)) agentDisableRemoves.push(name);
  }
  return { agentDisableAdds, agentDisableRemoves };
}

/**
 * What the updater would write for a scope, computed from the same decision
 * core without a request and without a write.
 *
 * **Probe-optimistic**: every candidate in the pre-walk set is treated as clean,
 * so the walk's window is the whole usable set, no candidate is ever
 * probe-blocked, and the auto-pin takes the route leader. The written pin can
 * therefore differ (a later route, or none) and a probe-blocked candidate can
 * leave the pool — both are labelled, not simulated.
 *
 * The candidate set is the updater's pre-walk set: `computeRankings` →
 * `resolveVariant` (the catalog/tier gate), minus the key-blocked
 * (`availability.active && availability.blocked.has(ranked.model.id)`). The
 * keyed prune is applied here, so the preview's pick can differ from the
 * as-written pool's leader (issue #104).
 *
 * `rank.models` must already carry `thinkingLevels` (the caller enriches, as the
 * explorer's boot does) — the preview never mutates its inputs.
 */
export function previewSelection(input: {
  /** The resolved settings, with the edited globals already expanded into each role def. */
  settings: ResolvedSettings;
  /** The as-written pool's ranking data (allowed-providers prune already applied to `m.routes`). */
  rank: RankData;
  /** `filterCatalog(catalog, tier)`. */
  eligible: CatalogEntry[];
  availability: KeyAvailability;
  /** The scope's `config.yml` modelRoles (the hysteresis incumbent). */
  currentSelectors: Record<string, string>;
  state: { managedRoles: readonly string[]; pluginWrittenChainKeys: readonly string[]; managedDisabledAgents: readonly string[] };
  /** The discovered agent pins (`discoverAgentPins()`), harvested by the caller. */
  agentPins: readonly AgentPin[];
  /** The scope's raw settings map (for `roleUniverse`). */
  raw: Record<string, unknown>;
  /** The key's tier. Optional: recovered from `eligible` (which `filterCatalog`
   *  already narrowed to the tier) when the caller has only the filtered catalog. */
  tier?: Tier;
}): SelectionPreview {
  const { settings, rank, eligible, availability, currentSelectors, state, agentPins, raw } = input;
  // `resolveVariant` takes the billed/free tier; `none` yields an empty
  // `eligible`, so it never resolves a variant. When the caller has only the
  // tier-filtered catalog, the tier is recovered from it.
  const tier: "billed" | "free" = input.tier === "free" || (input.tier === undefined && eligible.length > 0 && eligible.every((c) => c.id.endsWith(":free"))) ? "free" : "billed";
  const rowById = new Map(eligible.map((c) => [c.id, c]));
  // Locked roles are ranked but excluded from every mutation: no selector write,
  // no chain upsert, no probe budget, no removal.
  const lockedRoles = new Set(
    Object.entries(settings.roles)
      .filter(([, d]) => d.locked === true)
      .map(([n]) => n),
  );
  const decisions: Decision[] = [];
  const plans: { role: string; plan: ChainPlan }[] = [];
  const skipped: { role: string; reason: string }[] = [];
  /** Roles whose `providerPin` matched no route: left unchanged, their current chain preserved. */
  const pinUnmatched: string[] = [];
  for (const [role, def] of Object.entries(settings.roles)) {
    if (lockedRoles.has(role)) {
      skipped.push({ role, reason: "locked" });
      continue;
    }
    const rankings = computeRankings(rank.models, { [role]: def });
    const candidates: Candidate[] = [];
    for (const ranked of rankings[role] ?? []) {
      const catalogId = resolveVariant(ranked.model.id, eligible, tier);
      if (catalogId !== null) candidates.push({ ranked, catalogId });
    }
    if (candidates.length === 0) {
      // A pin that matches no route must never silently unpin: the ranking
      // already drops route-less models for a pinned role, so an empty pool
      // here means the pin matched nothing.
      if (def.providerPin !== undefined) {
        pinUnmatched.push(role);
        skipped.push({ role, reason: `providerPin "${def.providerPin}" matches no route` });
      } else {
        skipped.push({ role, reason: "no eligible candidate" });
      }
      continue;
    }
    const currentSelector = currentSelectors[role] ?? null;
    const currentId = currentSelector === null ? null : currentRankingId(currentSelector);
    const keyBlocked = (c: Candidate) => availability.active && availability.blocked.has(c.ranked.model.id);
    const keyBlockedCount = candidates.filter(keyBlocked).length;
    // Probe-optimistic: every candidate in the pre-walk set is clean, so the
    // walk's window is the whole usable set.
    const usable = candidates.filter((c) => !keyBlocked(c));
    if (usable.length === 0) {
      skipped.push({ role, reason: `no usable candidate (key-blocked: ${keyBlockedCount})` });
      continue;
    }
    const pool = usable;
    const best = pool[0];
    const mode = def.selection ?? settings.selection;
    let challenger: Candidate;
    let currentEntry: Candidate | null;
    let switchedPredicate: (cur: Candidate) => boolean;
    let costEscapePredicate: (cur: Candidate) => boolean;
    if (mode === "cheapest") {
      // The rule's pool is the role's usable candidate set (see `runUpdater`):
      // the catalog/tier gate and the allowed-providers prune are baked into
      // `rank.models`, and the keyed-catalog prune is `keyBlocked`.
      const bar = barSelection(usable.map((c) => c.ranked), def.qualityFloor ?? settings.qualityFloor);
      if (bar === null) {
        skipped.push({ role, reason: `no usable candidate (key-blocked: ${keyBlockedCount})` });
        continue;
      }
      const goodIds = new Set(bar.good.map((r) => r.model.id));
      const ordered = usable.filter((c) => goodIds.has(c.ranked.model.id)).sort((a, b) => pickOrder(a.ranked, b.ranked));
      const pick = ordered[0];
      if (pick === undefined) {
        skipped.push({ role, reason: "no candidate at or above the bar" });
        continue;
      }
      currentEntry = currentId === null ? null : usable.find((c) => c.ranked.model.id === currentId) ?? null;
      challenger = pick;
      // The incumbent fell below the bar: dropped with no margin.
      switchedPredicate = (cur) => !goodIds.has(cur.ranked.model.id);
      costEscapePredicate = (cur) =>
        // The same guards as value mode's `cheaperInsideMargin`: a non-positive
        // fraction disables the cost-side switch, and a non-positive incumbent
        // price has no fraction to undercut.
        settings.priceSwitchFraction > 0 &&
        cur.ranked.priceEff > 0 &&
        pick.ranked.priceEff <= cur.ranked.priceEff * (1 - settings.priceSwitchFraction);
    } else {
      currentEntry = currentId === null ? null : pool.find((p) => p.ranked.model.id === currentId) ?? null;
      challenger = best;
      switchedPredicate = (cur) => best.ranked.value - cur.ranked.value >= settings.switchMargin;
      costEscapePredicate = (cur) => cheaperInsideMargin(best.ranked, cur.ranked, settings);
    }
    const { chosen, reason } = decide({ currentSelector, currentEntry, challenger, switched: switchedPredicate, costEscape: costEscapePredicate });

    const suffix = def.thinking;
    const manualPin = def.providerPin;
    const autoRoutes = autoPinApplies(def) ? rankedRoutes(chosen.ranked.model, def) : [];
    const hasAutoRoutes = autoRoutes.length > 0;
    // Probe-optimistic: the first gate-passing route is accepted, so the pin is
    // the route leader and no route is ever blocked.
    const autoSlug = hasAutoRoutes ? autoRoutes[0].providerSlug : undefined;
    const pinSlug = manualPin ?? autoSlug;
    const pin = pinSlug !== undefined ? `@${pinSlug}` : "";
    const chosenRow = rowById.get(chosen.catalogId);
    // Append only a level the model's catalog thinking[] actually supports —
    // omp clamps unsupported levels, so an unsupported pin would run at a
    // different effort than the role intends (and than the ranking priced).
    const appendSuffix = suffix !== undefined && chosenRow !== undefined && (META_LEVELS[suffix] === true || chosenRow.thinking.includes(suffix));
    const finalSelector = `openrouter/${chosen.catalogId}${pin}${appendSuffix ? `:${suffix}` : ""}`;
    decisions.push({
      role,
      from: currentSelector,
      to: finalSelector,
      reason,
      value: chosen.ranked.value,
      bestValue: best.ranked.value,
      currentValue: currentEntry?.ranked.value ?? null,
      blocked: [],
      endpointBlocked: endpointFilterDrops(def, rank.models),
      pinBlocked: providerPinDrops(def, rank.models),
      routeBlockedSlugs: [],
      pinDropped: false,
      availabilitySource: availability.active ? "keyed-catalog" : "probe",
      keyBlockedCount,
    });

    if (settings.writeFallbackChains) {
      const key = suffix !== undefined && finalSelector.endsWith(`:${suffix}`) ? finalSelector.slice(0, -(suffix.length + 1)) : finalSelector;
      // The chain's fallback models come from the role's whole ranked candidate
      // list; probe-optimistically only the key-blocked are dropped.
      const chainCandidates = candidates.filter((c) => !keyBlocked(c));
      plans.push({ role, plan: { key, suffix, pin, pinnedSlug: autoSlug, candidates: chainCandidates, chosenIdx: chainCandidates.indexOf(chosen), def, autoPin: hasAutoRoutes } });
    }
  }

  // A chain key is the current selector minus a trailing `:level` (chain keys
  // are level-free).
  const keepKeys: string[] = [];
  for (const role of [...lockedRoles, ...pinUnmatched]) {
    const sel = currentSelectors[role];
    if (sel === undefined) continue;
    keepKeys.push(splitThinkingSuffix(sel).base);
  }
  const { chainUpserts, chainPrunes } = buildChains({ plans, settings, rowById, keepKeys, writtenKeys: state.pluginWrittenChainKeys });
  const { agentDisableAdds, agentDisableRemoves } = agentDisablePatch(raw, settings, state.managedDisabledAgents, agentPins);
  // Roles the plugin managed on a previous run but no longer does (disabled via
  // `enabled: false` / `weights: null`, or removed from settings): delete their
  // `modelRoles.<role>` line so a stale pin cannot keep routing `@<role>`.
  const roleRemovals = state.managedRoles.filter((r) => !(r in settings.roles));
  return { decisions, chains: chainUpserts, chainPrunes, roleRemovals, agentDisableAdds, agentDisableRemoves, skipped };
}
