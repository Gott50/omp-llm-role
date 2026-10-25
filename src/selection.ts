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

import { autoPinApplies, barSelection, computeRankings, endpointFilterDrops, META_LEVELS, pickOrder, providerPinDrops, rankedRoutes, type Ranked, type RankData, type RoleDef, type SelectionMode } from "./engine.ts";
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
  /** The bare chain key this decision's chain is filed under: the selector minus
   *  its trailing `:level` (chain keys are level-free). Carried on the decision
   *  so a consumer (the explorer's SPA) reads it instead of re-deriving it from
   *  the selector and the role's resolved thinking level. */
  chainKey: string;
};

/** Per-role cap on allowlist probe requests (budget against pathological
 * all-blocked pools). Shared with the updater's walk so the preview's window
 * cannot drift from the run's. */
export const PROBE_BUDGET = 12;

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
 * The cheapest mode's bar-clearing candidates in `pickOrder` order — the list
 * the pick is drawn from. Empty only for an empty pool. The caller resolves the
 * pick from this list: the run probe-verifies it on demand (falling through a
 * blocked candidate), the preview takes the first.
 */
export function cheapestOrder(usable: readonly Candidate[], floor: number): Candidate[] {
  const bar = barSelection(usable.map((c) => c.ranked), floor);
  if (bar === null) return [];
  const goodIds = new Set(bar.good.map((r) => r.model.id));
  return usable.filter((c) => goodIds.has(c.ranked.model.id)).sort((a, b) => pickOrder(a.ranked, b.ranked));
}

/**
 * The per-mode inputs to the shared ladder: the challenger, the incumbent
 * (looked up in the mode's own pool) and the two switch predicates. `null` when
 * the cheapest mode has no pick (every bar-clearing candidate was probe-blocked,
 * or the probe budget ran out).
 *
 * `pick` is the cheapest mode's bar-clearing pick — the run probe-verifies it,
 * the preview takes the cheapest. `ordered` is that mode's bar-clearing list
 * (its ids are the bar's `good` set). `clean` reports the probe verdict for the
 * incumbent lookup; the preview is probe-optimistic, so it passes `() => true`.
 */
export function ladderInputs(input: {
  mode: SelectionMode;
  settings: ResolvedSettings;
  /** The role's usable candidate set (the keyed prune applied). */
  usable: readonly Candidate[];
  /** The walk window: value mode's challenger and incumbent lookup. */
  pool: readonly Candidate[];
  currentId: string | null;
  /** Cheapest mode: the bar-clearing candidates in `pickOrder` order. */
  ordered: readonly Candidate[];
  /** Cheapest mode: the pick from `ordered`. */
  pick: Candidate | null;
  /** Cheapest mode: whether a candidate is probe-clean. */
  clean: (c: Candidate) => boolean;
}): { challenger: Candidate; currentEntry: Candidate | null; switched: (cur: Candidate) => boolean; costEscape: (cur: Candidate) => boolean } | null {
  if (input.mode === "cheapest") {
    const pick = input.pick;
    if (pick === null) return null;
    const goodIds = new Set(input.ordered.map((c) => c.ranked.model.id));
    return {
      challenger: pick,
      // The incumbent is looked up in `usable` (not the walk window: an
      // incumbent outside it is still a valid incumbent to compare against),
      // but only when the probe accepts it — a probe-blocked incumbent is not
      // in the pool at all, and cheapest mode must not keep a model the account
      // cannot run.
      currentEntry: input.currentId === null ? null : input.usable.find((c) => c.ranked.model.id === input.currentId && input.clean(c)) ?? null,
      // The incumbent fell below the bar: dropped with no margin.
      switched: (cur) => !goodIds.has(cur.ranked.model.id),
      // The same guards as value mode's `cheaperInsideMargin`: a non-positive
      // fraction disables the cost-side switch, and a non-positive incumbent
      // price has no fraction to undercut.
      costEscape: (cur) =>
        input.settings.priceSwitchFraction > 0 &&
        cur.ranked.priceEff > 0 &&
        pick.ranked.priceEff <= cur.ranked.priceEff * (1 - input.settings.priceSwitchFraction),
    };
  }
  const best = input.pool[0];
  return {
    challenger: best,
    currentEntry: input.currentId === null ? null : input.pool.find((c) => c.ranked.model.id === input.currentId) ?? null,
    switched: (cur) => best.ranked.value - cur.ranked.value >= input.settings.switchMargin,
    costEscape: (cur) => cheaperInsideMargin(best.ranked, cur.ranked, input.settings),
  };
}

/** The selector a decision writes, and the parts the chain plan needs. */
export type SelectorParts = {
  /** `openrouter/<catalogId>[@<slug>][:<level>]`. */
  selector: string;
  /** The bare chain key: the selector minus its trailing `:level` (chain keys
   *  are level-free). */
  key: string;
  /** The `@<slug>` suffix ("" when unpinned). */
  pin: string;
  /** The role's thinking level, when the model's catalog entry advertises it. */
  suffix: string | undefined;
  /** The route the auto-pin wrote — undefined for a manual pin, a dropped pin
   *  and with the capability off. */
  pinnedSlug: string | undefined;
  /** Whether the auto-pin applies and the model has gate-passing routes. */
  autoPin: boolean;
};

/**
 * Assemble the selector a decision writes: the catalog id, the pin suffix (a
 * manual `providerPin` always wins; else the route the auto-pin accepted), and
 * the thinking level — appended only when the model's catalog `thinking[]`
 * actually supports it, because omp clamps an unsupported level, so an
 * unsupported pin would run at a different effort than the role intends (and
 * than the ranking priced).
 */
export function selectorFor(input: {
  chosen: Candidate;
  def: RoleDef;
  rowById: Map<string, CatalogEntry>;
  /** Whether the auto-pin applies and the model has gate-passing routes. */
  autoPin: boolean;
  /** The route the auto-pin accepted (the run's route probe; the preview's
   *  route leader) — undefined for a manual pin, a dropped pin and with the
   *  capability off. */
  autoSlug: string | undefined;
}): SelectorParts {
  const suffix = input.def.thinking;
  const pinSlug = input.def.providerPin ?? input.autoSlug;
  const pin = pinSlug !== undefined ? `@${pinSlug}` : "";
  const chosenRow = input.rowById.get(input.chosen.catalogId);
  const appendSuffix = suffix !== undefined && chosenRow !== undefined && (META_LEVELS[suffix] === true || chosenRow.thinking.includes(suffix));
  const selector = `openrouter/${input.chosen.catalogId}${pin}${appendSuffix ? `:${suffix}` : ""}`;
  // A chain key is the selector minus a trailing `:level` (chain keys are
  // level-free), so a level the model does not support leaves the key bare.
  const key = suffix !== undefined && selector.endsWith(`:${suffix}`) ? selector.slice(0, -(suffix.length + 1)) : selector;
  return {
    selector,
    key,
    pin,
    suffix,
    pinnedSlug: input.autoSlug,
    autoPin: input.autoPin,
  };
}

/**
 * The chain plan for a decided role: the bare chain key (the selector minus its
 * trailing `:level` — chain keys are level-free), the candidates the chain's
 * fallback models are drawn from, and the chosen model's index in that list.
 *
 * `keep` is the caller's extra candidate filter: the run drops probe-blocked
 * candidates (the chain's deeper entries are no longer required to be
 * probe-verified, but a candidate the account cannot run must not be chained),
 * the preview is probe-optimistic. The chosen model passed every predicate, so
 * it is always in the list and `chosenIdx` is never -1.
 */
export function chainPlanFor(input: {
  role: string;
  chosen: Candidate;
  candidates: readonly Candidate[];
  selector: SelectorParts;
  def: RoleDef;
  keep: (c: Candidate) => boolean;
}): { role: string; plan: ChainPlan } {
  const { key, pin, suffix, pinnedSlug, autoPin } = input.selector;
  const candidates = input.candidates.filter(input.keep);
  return { role: input.role, plan: { key, suffix, pin, pinnedSlug, candidates, chosenIdx: candidates.indexOf(input.chosen), def: input.def, autoPin } };
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
 * The probe walk's window, probe-optimistically: the walk probes the incumbent
 * first, then rank order, and stops when `1 + fallbackChainDepth` clean
 * candidates exist AND — when the incumbent is clean — `fallbackChainDepth`
 * clean candidates lie beyond it. Every candidate is clean here, so the window
 * is a prefix of the walk order, capped at `PROBE_BUDGET`, returned in rank
 * order (the walk sorts its pool by index). `currentIdx` is the incumbent's
 * index in `candidates`, or -1 when there is none (or it is key-blocked, so it
 * is not in `candidates` at all).
 *
 * At `fallbackChainDepth: 0` the window is the incumbent alone, so a kept role
 * stays kept — the run's own behaviour, which the agreement test pins.
 */
export function probeWindow<C extends { ranked: Ranked }>(candidates: readonly C[], currentIdx: number, fallbackChainDepth: number): C[] {
  const order: number[] = [];
  if (currentIdx >= 0) order.push(currentIdx);
  for (let i = 0; i < candidates.length; i++) if (i !== currentIdx) order.push(i);
  const target = 1 + fallbackChainDepth;
  const currentClean = currentIdx >= 0;
  const window: number[] = [];
  let cleanCount = 0;
  let cleanAfterCurrent = 0;
  for (const idx of order) {
    if (window.length >= PROBE_BUDGET) break;
    window.push(idx);
    cleanCount++;
    if (currentClean && idx > currentIdx) cleanAfterCurrent++;
    if (cleanCount >= target && (!currentClean || cleanAfterCurrent >= fallbackChainDepth)) break;
  }
  return window.sort((a, b) => a - b).map((idx) => candidates[idx]);
}

/**
 * What the updater would write for a scope, computed from the same decision
 * core without a request and without a write.
 *
 * **Probe-optimistic**: every candidate in the pre-walk set is treated as clean,
 * so the walk's window is the prefix of the walk order the stop condition
 * admits (`probeWindow`), no candidate is ever probe-blocked, and the auto-pin
 * takes the route leader. The written pin can therefore differ (a later route,
 * or none) and a probe-blocked candidate can leave the pool — both are labelled,
 * not simulated.
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
    // walk's window is the prefix of the walk order its stop condition admits
    // (`probeWindow`) — NOT the whole usable set. At `fallbackChainDepth: 0`
    // that is the incumbent alone, so a kept role stays kept, exactly as the run
    // reports it (user story 27).
    const usable = candidates.filter((c) => !keyBlocked(c));
    if (usable.length === 0) {
      skipped.push({ role, reason: `no usable candidate (key-blocked: ${keyBlockedCount})` });
      continue;
    }
    const currentIdx = currentId === null ? -1 : usable.findIndex((c) => c.ranked.model.id === currentId);
    const pool = probeWindow(usable, currentIdx, settings.fallbackChainDepth);
    const best = pool[0];
    const mode = def.selection ?? settings.selection;
    // The cheapest mode's bar-clearing list: the rule's pool is the role's
    // usable candidate set (see `runUpdater`) — the catalog/tier gate and the
    // allowed-providers prune are baked into `rank.models`, and the keyed-catalog
    // prune is `keyBlocked`. Probe-optimistically the pick is the cheapest
    // bar-clearing candidate.
    const ordered = mode === "cheapest" ? cheapestOrder(usable, def.qualityFloor ?? settings.qualityFloor) : [];
    const inputs = ladderInputs({ mode, settings, usable, pool, currentId, ordered, pick: ordered[0] ?? null, clean: () => true });
    if (inputs === null) {
      skipped.push({ role, reason: "no candidate at or above the bar" });
      continue;
    }
    const { chosen, reason } = decide({ currentSelector, currentEntry: inputs.currentEntry, challenger: inputs.challenger, switched: inputs.switched, costEscape: inputs.costEscape });

    const autoRoutes = autoPinApplies(def) ? rankedRoutes(chosen.ranked.model, def) : [];
    const hasAutoRoutes = autoRoutes.length > 0;
    // Probe-optimistic: the first gate-passing route is accepted, so the pin is
    // the route leader and no route is ever blocked.
    const parts = selectorFor({ chosen, def, rowById, autoPin: hasAutoRoutes, autoSlug: hasAutoRoutes ? autoRoutes[0].providerSlug : undefined });
    decisions.push({
      role,
      from: currentSelector,
      to: parts.selector,
      reason,
      value: chosen.ranked.value,
      bestValue: best.ranked.value,
      currentValue: inputs.currentEntry?.ranked.value ?? null,
      blocked: [],
      endpointBlocked: endpointFilterDrops(def, rank.models),
      pinBlocked: providerPinDrops(def, rank.models),
      routeBlockedSlugs: [],
      pinDropped: false,
      availabilitySource: availability.active ? "keyed-catalog" : "probe",
      keyBlockedCount,
      chainKey: parts.key,
    });

    if (settings.writeFallbackChains) {
      // The chain's fallback models come from the role's whole ranked candidate
      // list; probe-optimistically only the key-blocked are dropped.
      plans.push(chainPlanFor({ role, chosen, candidates, selector: parts, def, keep: (c) => !keyBlocked(c) }));
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
