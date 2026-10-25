/**
 * Orchestration: rank today's models -> tier gate + catalog
 * resolution -> per-role hysteresis -> fallback chains -> surgical config patch.
 *
 * When the account's OpenRouter keyed catalog is active it is the
 * availability source: allowed candidates skip the probe, key-blocked ones are
 * pruned from the walk order, and only candidates in neither catalog are probed.
 *
 * Every abort path notifies and returns `aborted` without touching config.yml.
 * A run with zero changes writes nothing (config mtime untouched) but still
 * stamps the day gate and appends a history row. Both entry points (the omp
 * extension and the Node CLI shim) drive this through injected Deps, so they
 * share one code path.
 */

import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { autoPinApplies, computeRankings, endpointFilterDrops, loadRankData, providerPinDrops, rankedRoutes, type RankData } from "./engine.ts";
import { currentRankingId, enrichThinkingLevels, fetchAllowedProviders, fetchKeyAvailability, fetchKeyMeta, filterCatalog, probeModel, probeRoute, pruneRoutesToAllowed, resolveVariant, splitThinkingSuffix, tierGate, type CatalogEntry, type KeyAvailability, type KeyMeta, type ProbeVerdict } from "./availability.ts";
import { ConfigEditError, parseConfig, patchConfig, writeConfigAtomic, type ConfigPatch } from "./config-edit.ts";
import { PLUGIN_SETTINGS_PATH, projectLockPath, readPluginSettingsMap, resolveSettings, type ResolvedSettings } from "./settings.ts";
import { discoverAgentPins } from "./agent-pins.ts";
import { registerProject } from "./project-registry.ts";
import { agentDir, acquireLock, appendHistory, loadState, releaseLock, saveState } from "./state.ts";
import { agentDisablePatch, buildChains, chainPlanFor, cheapestOrder, decide, ladderInputs, PROBE_BUDGET, selectorFor, type Candidate, type ChainPlan, type Decision, type DecisionReason } from "./selection.ts";

// The decision core lives in `src/selection.ts` (spec #109) so the explorer's
// preview and the run share one implementation; re-exported here so every
// existing importer keeps working.
export type { Decision, DecisionReason };

export type RunResult = {
  decisions: Decision[];
  wrote: boolean;
  /** Final selector the run chose for the `default` role, when that role was decided. */
  defaultSelector?: string;
  aborted?: string;
  /**
   * Set only on an unexpected exception abort (a bug): the `ConfigEditError` /
   * catch-all path. Unset on every enumerated environment abort (settings
   * invalid, ranking data unavailable, tier `none`, lock, conflict, key-fetch
   * failure) — those are conditions, not defects. The extension reads this to
   * decide whether to file a report.
   */
  defect?: string;
  /**
   * The config patch the run computed (the same object `writePatch` receives).
   * Present whenever the run reached the patch construction — including a dry
   * run, which writes no `config.yml` to read the chains from. Absent on an
   * abort.
   */
  patch?: ConfigPatch;
};

export type Trigger = "session-start" | "manual";

export type Deps = {
  getToken(): Promise<string>;
  getCatalog(): Promise<CatalogEntry[]>;
  notify(lines: string[]): void;
  nowUtcDay(): string;
  /** DI seams for tests; production defaults to the engine and the lock-file settings. */
  getRankData?(): Promise<RankData>;
  getSettings?(): Promise<Record<string, unknown>>;
  getKeyMeta?(token: string): Promise<KeyMeta>;
  probeModel?(token: string, catalogId: string): Promise<ProbeVerdict>;
  /**
   * DI seam like `probeModel`; production defaults to the real `probeRoute`.
   * One-token completion bound to a single provider route (`provider.only`), the
   * auto-pin's routability gate: OpenRouter's routing table can exclude a route
   * its endpoints API still lists as healthy.
   */
  probeRoute?(token: string, catalogId: string, providerSlug: string): Promise<ProbeVerdict>;
  /** DI seam like `getKeyMeta`/`probeModel`; production defaults to `fetchKeyAvailability` (never throws). */
  getKeyAvailability?(token: string): Promise<KeyAvailability>;
  /**
   * DI seam like `getKeyAvailability`; production defaults to
   * `fetchAllowedProviders` (never throws). Returns the account's
   * allowed-providers privacy whitelist, or null when there is none (or the
   * harvest failed) — a null result leaves every route pool untouched.
   */
  getAllowedProviders?(token: string, modelId: string): Promise<Set<string> | null>;
  /**
   * Host coupling (extension only): apply a concrete selector to the live
   * session model. Receives the final `default` selector (with thinking
   * suffix) plus the previously written `default` selector (null when the
   * role was unset); the host decides whether the session still qualifies.
   */
  applySessionModel?(selector: string, previous: string | null): Promise<void>;
};

const CONFLICT_RETRIES = 3;

/** Per-role cap on route-probe requests for the auto-pin walk (budget against a
 * pathological route pool: a fully blocked model with dozens of routes must not
 * turn the daily update into a long probe walk). Hitting the cap with no clean
 * candidate drops the pin, exactly as an all-blocked pool does. */
export const ROUTE_PROBE_BUDGET = 12;

function mtimeOf(path: string): number {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0; // file absent — writeConfigAtomic accepts a create when it is still absent
  }
}

function decisionLine(d: Decision): string {
  const from = d.from ?? "(unset)";
  const scores = `value ${d.value.toFixed(3)}, best ${d.bestValue.toFixed(3)}${d.currentValue == null ? "" : `, was ${d.currentValue.toFixed(3)}`}`;
  const blocked = d.blocked.length > 0 ? `; blocked: ${d.blocked.join(", ")}` : "";
  const endpoint = d.endpointBlocked.length > 0 ? `; endpoint-blocked: ${d.endpointBlocked.join(", ")}` : "";
  const pin = d.pinBlocked.length > 0 ? `; pin-blocked: ${d.pinBlocked.join(", ")}` : "";
  const routes = d.routeBlockedSlugs.length > 0 ? `; route-blocked: ${d.routeBlockedSlugs.join(", ")}` : "";
  const dropped = d.pinDropped ? "; pin dropped (no routable route)" : "";
  return d.from === d.to
    ? `@${d.role}: kept ${d.to} (${d.reason}; ${scores}${blocked}${endpoint}${pin}${routes}${dropped})`
    : `@${d.role}: ${from} -> ${d.to} (${d.reason}; ${scores}${blocked}${endpoint}${pin}${routes}${dropped})`;
}

/** Abort lines for the two write-path failures (shared by the full run and the
 * settings-derived agent sync). */
const LOCK_ABORT = "omp-llm-role: could not acquire the refresh lock (concurrent run?) — no write";
const CONFLICT_ABORT = `omp-llm-role: config.yml kept changing underneath (${CONFLICT_RETRIES} mtime conflicts) — no write`;

/**
 * Read → patch → atomic write under the refresh lock, with mtime-conflict
 * retries. `before` is the pre-write text when a write landed. `patchConfig`
 * throws ConfigEditError (caller aborts) on a structural surprise.
 */
function writePatch(configPath: string, dir: string, patch: ConfigPatch): { status: "written" | "noop" | "conflict" | "locked"; before: string | null } {
  if (!acquireLock(dir)) return { status: "locked", before: null };
  try {
    for (let attempt = 0; attempt < CONFLICT_RETRIES; attempt++) {
      let text: string;
      try {
        text = readFileSync(configPath, "utf8");
      } catch {
        text = "";
      }
      const mtime = mtimeOf(configPath);
      const patched = patchConfig(text, patch);
      if (patched === text) return { status: "noop", before: text };
      if (writeConfigAtomic(configPath, patched, mtime) === "written") return { status: "written", before: text };
    }
    return { status: "conflict", before: null };
  } finally {
    releaseLock(dir);
  }
}

/**
 * The project dir omp reads for the current session (`<cwd>/.omp`), or null when
 * the project carries no `omp-llm-role` settings entry — then the global
 * behavior applies. omp resolves the project dir as `<cwd>/.omp` with no
 * walk-up, so the plugin's project-scope read must use the same dir (not the
 * walk-up anchor `findProjectAnchor` returns).
 *
 * Exported as the one home for "where this session's plugin state lives": the
 * updater scopes config/state/history/lock to it, and the extension records the
 * usage ledger there too, so a project's usage is separate from the user-level
 * profile.
 */
export function resolveProjectDir(): string | null {
  const projectDir = join(process.cwd(), ".omp");
  const raw = readPluginSettingsMap({ global: join(projectDir, "plugins", "omp-plugins.lock.json"), project: null });
  return Object.keys(raw).length > 0 ? projectDir : null;
}

export async function runUpdater(trigger: Trigger, deps: Deps, opts?: { force?: boolean; dryRun?: boolean; switchMargin?: number }): Promise<RunResult> {
  const notifyAll = trigger !== "session-start" || opts?.dryRun === true;
  const abort = (lines: string[]): RunResult => {
    deps.notify(lines);
    return { decisions: [], wrote: false, aborted: lines[0] };
  };
  try {
    // Project-aware resolution (issue #27): when the project has its own role
    // config, the whole run — config, state, history, lock — is scoped to
    // `<cwd>/.omp`; otherwise the global agent dir is used exactly as before.
    const projectDir = resolveProjectDir();
    // Register the project in the global registry (issue #28) immediately after
    // resolution and before any early return, so a day-stamped no-op session
    // start still records it. Dry runs register nothing. The registry lives in
    // the global agent dir, never the project's `.omp`.
    if (projectDir !== null && opts?.dryRun !== true) registerProject(dirname(projectDir));
    const dir = projectDir ?? agentDir();
    const state = loadState(dir);
    const today = deps.nowUtcDay();
    const raw = (await deps.getSettings?.()) ?? readPluginSettingsMap(projectDir !== null ? { global: PLUGIN_SETTINGS_PATH, project: projectLockPath() } : undefined);
    const { settings, errors } = resolveSettings(raw);
    if (errors.length > 0) return abort([`omp-llm-role settings invalid, no write:`, ...errors.map((e) => `  ${e}`)]);

    // Locked roles are ranked (they stay in the universe and their sources are
    // fetched) but excluded from every mutation: no selector write, no chain
    // upsert, no probe budget, no removal. They remain tracked in managedRoles.
    const lockedRoles = new Set(
      Object.entries(settings.roles)
        .filter(([, d]) => d.locked === true)
        .map(([n]) => n),
    );

    const configPath = join(dir, "config.yml");
    // The agent pins are a filesystem scan, harvested once here and passed in so
    // the same pins can be handed to the explorer's preview (spec #109).
    const agentDisables = agentDisablePatch(raw, settings, state.managedDisabledAgents, discoverAgentPins());
    const nextManagedDisabled = agentDisables.agentDisableAdds;

    // The settings-derived agent sync is not day-gated: enabling/disabling a
    // shipped role must take effect on the next session, not the next day.
    if (!opts?.force && state.lastRunDay === today) {
      if (opts?.dryRun) return { decisions: [], wrote: false };
      const patch: ConfigPatch = { roleSelectors: {}, roleRemovals: [], chainUpserts: {}, chainPrunes: [], ...agentDisables };
      const res = writePatch(configPath, dir, patch);
      if (res.status === "locked") return { decisions: [], wrote: false }; // another session is syncing — benign
      if (res.status === "conflict") return abort([CONFLICT_ABORT]);
      if (res.status === "written") {
        state.managedDisabledAgents = nextManagedDisabled;
        saveState(state, dir);
        if (notifyAll) deps.notify(["omp-llm-role: task.disabledAgents updated"]);
      }
      return { decisions: [], wrote: res.status === "written", patch };
    }

    let rank: RankData;
    try {
      rank = (await deps.getRankData?.()) ?? (await loadRankData({ roles: settings.roles }));
    } catch (err) {
      return abort([`omp-llm-role: ranking data unavailable, no write: ${err instanceof Error ? err.message : err}`]);
    }

    // A key-fetch failure (a missing/expired token, an OpenRouter outage) is an
    // enumerated environment abort, not a defect: notify-only, `defect` unset.
    // The message text is unchanged from the catch-all it used to reach.
    let token: string;
    let keyMeta: KeyMeta;
    try {
      token = await deps.getToken();
      keyMeta = (await deps.getKeyMeta?.(token)) ?? (await fetchKeyMeta(token));
    } catch (err) {
      return abort([`omp-llm-role: aborted, no write: ${err instanceof Error ? err.message : String(err)}`]);
    }
    const tier = tierGate(keyMeta);
    if (tier === "none") {
      return abort([
        `omp-llm-role: OpenRouter key has no usable budget ` +
          `(daily limit left ${keyMeta.limitRemaining}, credits ${keyMeta.creditsRemaining}, free requests ${keyMeta.freeRemaining}) — no write`,
      ]);
    }

    const catalog = await deps.getCatalog();
    const eligible = filterCatalog(catalog, tier);
    // Keyed-catalog availability: fetched once per run and shared
    // across roles. Never throws — an unavailable allowlist degrades to the
    // probe walk with no abort path.
    const availability = await (deps.getKeyAvailability?.(token) ?? fetchKeyAvailability(token));
    const rowById = new Map(eligible.map((c) => [c.id, c]));
    enrichThinkingLevels(rank.models, catalog);

    let configText = "";
    try {
      configText = readFileSync(configPath, "utf8");
    } catch {
      // no config yet (first run) — patchConfig will create the blocks
    }
    const current = parseConfig(configText);

    // Per-role selection: rank -> tier/catalog filter -> availability gate ->
    // hysteresis -> suffix. When the keyed catalog is active it classifies
    // candidates without a request (allowed -> clean, key-blocked -> pruned);
    // the probe walk still verifies candidates in neither catalog with
    // one-token completions, because the key's allowed-providers privacy
    // whitelist is otherwise invisible to /api/v1/key and the catalog
    // endpoints.
    const decisions: Decision[] = [];
    const notes: string[] = [];
    // Per-run `switchMargin` override (spec #99, `/refresh-roles --no-margin`):
    // it never reaches the lock file, the state or `resolveSettings` (which still
    // validates the configured value). A non-finite override is ignored, so the
    // configured margin applies (fail closed) instead of `>= NaN` degrading every
    // role to `kept-margin`.
    const marginOverride = typeof opts?.switchMargin === "number" && Number.isFinite(opts.switchMargin) ? opts.switchMargin : undefined;
    // The hysteresis ladder reads the run's effective margin: the resolved setting,
    // unless a per-run override replaced it. A copy, so every other consumer of
    // `settings` keeps the configured value.
    const hysteresis = marginOverride !== undefined ? { ...settings, switchMargin: marginOverride } : settings;
    if (marginOverride !== undefined) notes.push("switchMargin ignored for this run (--no-margin)");
    if (availability.active) {
      notes.push(
        `omp-llm-role: OpenRouter keyed catalog active — ${availability.keyedCount}/${availability.publicCount} models allowed; key-blocked candidates are pruned from the probe walk (up to ${PROBE_BUDGET} probes/role saved)`,
      );
    } else {
      notes.push(
        `omp-llm-role: OpenRouter keyed catalog ${availability.reason === "no-filter" ? "not filtering" : "unavailable"} — enable OpenRouter → Settings → "Filter the model catalog for API keys" to skip probing key-blocked models; the probe walk is still in use`,
      );
    }

    // Allowed-providers privacy whitelist (spec #65): harvested once per run
    // with a valid catalog model id (the canary 404s, so it bills no tokens).
    // The whitelist is invisible to /api/v1/key and the catalog endpoints, so a
    // route on a provider outside it would be written into config.yml and 404
    // at request time. Pruning every model's route pool to allowed providers
    // before ranking makes the soft basis, the auto-pin and the fallback chains
    // whitelist-aware through the single `m.routes` seam. A null result (no
    // whitelist set / harvest failed) leaves the pools untouched.
    const canaryModelId = eligible[0]?.id;
    const allowed =
      canaryModelId === undefined
        ? null
        : await (deps.getAllowedProviders ? deps.getAllowedProviders(token, canaryModelId) : fetchAllowedProviders(token, canaryModelId));
    if (allowed !== null) {
      const { models, pruned: prunedCount } = pruneRoutesToAllowed(rank.models, allowed);
      rank = { ...rank, models };
      notes.push(
        `omp-llm-role: OpenRouter allowed-providers whitelist active — ${allowed.size} providers; ${prunedCount} routes pruned`,
      );
    } else {
      notes.push(`omp-llm-role: OpenRouter allowed-providers whitelist: no whitelist`);
    }
    const chainPlanByRole: Record<string, ChainPlan> = {};
    /** Roles whose `providerPin` matched no route: left unchanged, their current chain preserved. */
    const pinUnmatched: string[] = [];
    const probe = deps.probeModel ?? probeModel;
    const probeVerdicts = new Map<string, ProbeVerdict>();
    const routeProbe = deps.probeRoute ?? probeRoute;
    /** Route verdicts, cached by `catalogId@slug` across roles: a route shared by
     * several roles is probed once per run. */
    const routeVerdicts = new Map<string, ProbeVerdict>();
    for (const [role, def] of Object.entries(settings.roles)) {
      // Locked: no ranking, no probe, no decision, no selector/chain write.
      if (lockedRoles.has(role)) continue;
      const rankings = computeRankings(rank.models, { [role]: def });
      const candidates: Candidate[] = [];
      for (const ranked of rankings[role] ?? []) {
        const catalogId = resolveVariant(ranked.model.id, eligible, tier);
        if (catalogId !== null) candidates.push({ ranked, catalogId });
      }
      if (candidates.length === 0) {
        // A pin that matches no route must never silently unpin: leave the role
        // unchanged (no selector write, no chain write) and say so. The ranking
        // already drops route-less models for a pinned role, so an empty pool
        // here means the pin matched nothing.
        if (def.providerPin !== undefined) {
          notes.push(`@${role}: providerPin "${def.providerPin}" matches no route — role untouched`);
          pinUnmatched.push(role);
        }
        continue; // nothing eligible — role untouched
      }

      const currentSelector = current.modelRoles[role] ?? null;
      const currentId = currentSelector === null ? null : currentRankingId(currentSelector);
      const currentIdx = currentId === null ? -1 : candidates.findIndex((c) => c.ranked.model.id === currentId);

      // Keyed-catalog fast path: when the account's OpenRouter
      // filter is on, membership in the keyed catalog is authoritative — an
      // allowed candidate is clean without a probe, and a key-blocked one is
      // pruned from the walk order entirely. Pruning (not pre-seeding a
      // "blocked" verdict) is load-bearing: the budget counts candidates
      // *examined*, so a pre-seeded blocked candidate would still consume it
      // and reproduce the all-blocked-pool failure this path exists to fix.
      const keyBlocked = (c: Candidate) => availability.active && availability.blocked.has(c.ranked.model.id);
      if (availability.active) {
        for (const c of candidates) {
          if (availability.allowed.has(c.ranked.model.id)) probeVerdicts.set(c.catalogId, "ok");
        }
      }
      const keyBlockedCount = candidates.filter(keyBlocked).length;
      // A key-blocked current candidate is not the walk's current: it will
      // never be kept, so the stop condition must not demand extra clean
      // candidates beyond it.
      const currentWalkIdx = currentIdx >= 0 && !keyBlocked(candidates[currentIdx]) ? currentIdx : -1;

      // Probe walk: current candidate first (hysteresis must see it), then rank
      // order. It stops only when 1 + chain depth clean candidates exist AND —
      // when the current candidate is clean — `fallbackChainDepth` clean
      // candidates lie beyond the current rank, so a kept role's written chain
      // is filled with probe-verified entries. Budget-capped (a short chain is
      // the graceful degradation); verdicts cached across roles.
      const target = 1 + settings.fallbackChainDepth;
      const order: number[] = [];
      if (currentWalkIdx >= 0) order.push(currentWalkIdx);
      for (let i = 0; i < candidates.length; i++) {
        if (i !== currentWalkIdx && !keyBlocked(candidates[i])) order.push(i);
      }
      const probed: number[] = [];
      const blockedForRole: string[] = [];
      let cleanCount = 0;
      let cleanAfterCurrent = 0;
      for (const idx of order) {
        if (probed.length >= PROBE_BUDGET) break;
        const id = candidates[idx].catalogId;
        let verdict = probeVerdicts.get(id);
        if (verdict === undefined) {
          verdict = await probe(token, id);
          probeVerdicts.set(id, verdict);
        }
        probed.push(idx);
        if (verdict === "blocked") {
          blockedForRole.push(id);
        } else {
          cleanCount++;
          if (currentWalkIdx >= 0 && idx > currentWalkIdx) cleanAfterCurrent++;
        }
        const currentClean = currentWalkIdx >= 0 && probeVerdicts.get(candidates[currentWalkIdx].catalogId) !== "blocked";
        if (cleanCount >= target && (!currentClean || cleanAfterCurrent >= settings.fallbackChainDepth)) break;
      }
      const pool = probed
        .filter((idx) => probeVerdicts.get(candidates[idx].catalogId) !== "blocked")
        .sort((a, b) => a - b)
        .map((idx) => candidates[idx]);
      if (pool.length === 0) {
        const keyed = availability.active ? `key-blocked: ${keyBlockedCount}, ` : "";
        notes.push(`@${role}: no probe-clean candidate among ${probed.length} probed (${keyed}blocked: ${blockedForRole.join(", ")}) — role untouched`);
        continue;
      }
      const best = pool[0];
      const mode = def.selection ?? settings.selection;
      // The rule's pool is the role's usable candidate set: the catalog/tier
      // gate and the allowed-providers prune are already baked into
      // `rank.models`, and the keyed-catalog prune is `keyBlocked`. NOT `pool`
      // — that is only the probe window (the top few value-ranked candidates),
      // and a cheap model ranks low by value, so the cheapest bar-clearing
      // candidate usually sits outside it.
      const usable = candidates.filter((c) => !keyBlocked(c));
      let ordered: Candidate[] = [];
      let pick: Candidate | null = null;
      if (mode === "cheapest") {
        if (usable.length === 0) {
          notes.push(`@${role}: no usable candidate (key-blocked: ${keyBlockedCount}) — role untouched`);
          continue;
        }
        ordered = cheapestOrder(usable, def.qualityFloor ?? settings.qualityFloor);
        // The pick may be a candidate the walk never examined: probe it on
        // demand (verdicts are cached by catalog id and shared across roles) and
        // fall through to the next-cheapest bar-clearing candidate when it is
        // blocked. The bar stays fixed — the anchor is a quality statement over
        // the usable pool, not over the probe-clean subset. Budgeted like the
        // walk: a pathological all-blocked `good` set must not cost one request
        // per candidate. Cached verdicts are free, so only newly-issued probes
        // count.
        let probesSpent = 0;
        for (const c of ordered) {
          let verdict = probeVerdicts.get(c.catalogId);
          if (verdict === undefined) {
            if (probesSpent >= PROBE_BUDGET) break;
            verdict = await probe(token, c.catalogId);
            probeVerdicts.set(c.catalogId, verdict);
            probesSpent++;
          }
          if (verdict !== "blocked") {
            pick = c;
            break;
          }
        }
      }
      // The per-mode inputs to the shared ladder (see `ladderInputs`): the
      // challenger, the incumbent and the two switch predicates. The incumbent
      // is looked up in the mode's own pool, and only when the probe accepts it
      // — a probe-blocked incumbent is not in the pool at all, and cheapest mode
      // must not keep a model the account cannot run. The walk probes the
      // incumbent first, so a non-key-blocked incumbent's verdict is known here.
      const inputs = ladderInputs({ mode, settings: hysteresis, usable, pool, currentId, ordered, pick, clean: (c) => probeVerdicts.get(c.catalogId) !== "blocked" });
      if (inputs === null) {
        notes.push(`@${role}: no probe-clean candidate at or above the bar (key-blocked: ${keyBlockedCount}) — role untouched`);
        continue;
      }
      // The six-arm decision ladder, shared by both modes (see `decide`).
      const { chosen, reason } = decide({ currentSelector, currentEntry: inputs.currentEntry, challenger: inputs.challenger, switched: inputs.switched, costEscape: inputs.costEscape });

      // A provider pin rides as the selector's `@<slug>` suffix, before the
      // thinking level (`openrouter/<id>@<slug>:<level>`) — omp's
      // `splitUpstreamRouting` parses the trailing `@<slug>` and applies
      // `compat.openRouterRouting = { only: [slug] }`.
      //
      // Auto-pin (spec #58, routability-verified by spec #90): with the soft
      // `preferOwnProvider` capability on and no manual pin, the best route the
      // probe accepts rides as that suffix. That candidate is the route the role
      // was priced on, so the price the ranking assumed is the price the request
      // pays — but only while the walk does not skip the candidate; a skipped
      // candidate means the route that replaced it pays, at its own price. A
      // manual `providerPin` is a hard gate and always wins; a model with no
      // gate-passing route keeps default routing (bare selector).
      //
      // The route order is the one the fallback chain already uses
      // (`rankedRoutes`). Every candidate is probed with `provider: { only:
      // [slug] }`, because OpenRouter's endpoints API can list a route as
      // healthy while its routing table excludes it — the failure the endpoints
      // data cannot see. A `blocked` route is skipped, `unknown` counts as
      // usable (a transient blip must never unpin a role), and a pool with no
      // clean candidate drops the pin: the selector stays bare and OpenRouter
      // routes the request itself instead of 404ing on an unroutable `@<slug>`.
      const autoRoutes = autoPinApplies(def) ? rankedRoutes(chosen.ranked.model, def) : [];
      // No gate-passing route means nothing to pin and nothing to drop: the bare
      // selector is default routing, not a dropped pin.
      const hasAutoRoutes = autoRoutes.length > 0;
      const routeBlockedSlugs: string[] = [];
      let autoSlug: string | undefined;
      let routeProbesSpent = 0;
      for (const r of autoRoutes) {
        const key = `${chosen.catalogId}@${r.providerSlug}`;
        let verdict = routeVerdicts.get(key);
        if (verdict === undefined) {
          if (routeProbesSpent >= ROUTE_PROBE_BUDGET) break;
          verdict = await routeProbe(token, chosen.catalogId, r.providerSlug);
          routeVerdicts.set(key, verdict);
          routeProbesSpent++;
        }
        if (verdict === "blocked") {
          // Deduped: two routes can share a provider slug (the chain collapses
          // them too), and the decision line should not list one slug twice.
          if (!routeBlockedSlugs.includes(r.providerSlug)) routeBlockedSlugs.push(r.providerSlug);
          continue;
        }
        autoSlug = r.providerSlug;
        break;
      }
      const parts = selectorFor({ chosen, def, rowById, autoPin: hasAutoRoutes, autoSlug });
      decisions.push({
        role,
        from: currentSelector,
        to: parts.selector,
        reason,
        value: chosen.ranked.value,
        bestValue: best.ranked.value,
        currentValue: inputs.currentEntry?.ranked.value ?? null,
        blocked: blockedForRole,
        endpointBlocked: endpointFilterDrops(def, rank.models),
        pinBlocked: providerPinDrops(def, rank.models),
        routeBlockedSlugs,
        pinDropped: hasAutoRoutes && autoSlug === undefined,
        availabilitySource: availability.active ? "keyed-catalog" : "probe",
        keyBlockedCount,
        chainKey: parts.key,
      });

      // Fallback chain inputs for every managed role: the bare key (a chain key
      // matches the active model id, never a level) plus the candidate list the
      // chain's fallback models are drawn from. Values are built after the loop,
      // once every key claim is known. The chain's fallback models come from the
      // role's whole ranked candidate list, so a cheaper-or-equal model ranked
      // below the probe window can be chained. Only the candidates the probe
      // walk would never accept are dropped — key-blocked (the account's key
      // cannot use them) and probe-verdict-blocked (present in the public
      // catalog but not for this key). An unprobed candidate stays: the chain's
      // deeper entries are no longer required to be probe-verified.
      if (settings.writeFallbackChains) {
        chainPlanByRole[role] = chainPlanFor({ role, chosen, candidates, selector: parts, def, keep: (c) => !keyBlocked(c) && probeVerdicts.get(c.catalogId) !== "blocked" }).plan;
      }
    }

    const roleSelectors: Record<string, string> = {};
    for (const d of decisions) roleSelectors[d.role] = d.to;
    const defaultSelector = roleSelectors["default"];
    // Locked roles keep their current chain: the plugin neither rewrites nor
    // prunes it, so its key must count as referenced. A role whose pin matched
    // no route is likewise left unchanged, so its current chain must survive the
    // prune. A chain key is the current selector minus a trailing `:level`
    // (chain keys are level-free).
    const keepKeys: string[] = [];
    for (const role of [...lockedRoles, ...pinUnmatched]) {
      const sel = current.modelRoles[role];
      if (sel === undefined) continue;
      keepKeys.push(splitThinkingSuffix(sel).base);
    }
    const plans = settings.writeFallbackChains ? decisions.map((d) => ({ role: d.role, plan: chainPlanByRole[d.role] })) : [];
    const { chainUpserts, chainPrunes } = buildChains({ plans, settings, rowById, keepKeys, writtenKeys: state.pluginWrittenChainKeys });
    // The chain keys the plugin now owns: every written chain key plus the keys
    // of the roles it left untouched — the same set `buildChains` prunes against.
    const referenced = new Set<string>([...plans.map((p) => p.plan.key), ...keepKeys]);
    // Roles the plugin managed on a previous run but no longer does (disabled via
    // `enabled: false` / `weights: null`, or removed from settings): delete their
    // `modelRoles.<role>` line so a stale pin cannot keep routing `@<role>`.
    const roleRemovals = state.managedRoles.filter((r) => !(r in settings.roles));
    const patch: ConfigPatch = { roleSelectors, roleRemovals, chainUpserts, chainPrunes, ...agentDisables };

    let wrote = false;
    // Dry runs stop here: decisions are reported, but nothing is written, no
    // day gate is stamped, and no history row is appended.
    if (!opts?.dryRun) {
      const res = writePatch(configPath, dir, patch); // throws ConfigEditError -> abort, no write
      if (res.status === "locked") return abort([LOCK_ABORT]);
      if (res.status === "conflict") return abort([CONFLICT_ABORT]);
      wrote = res.status === "written";
      const previousRoles = res.status === "written" && res.before !== null ? parseConfig(res.before).modelRoles : null;

      state.lastRunDay = today;
      state.managedRoles = [...decisions.map((d) => d.role), ...lockedRoles, ...pinUnmatched];
      state.managedDisabledAgents = nextManagedDisabled;
      for (const d of decisions) state.roleLastSelector[d.role] = d.to;
      if (settings.writeFallbackChains) state.pluginWrittenChainKeys = [...referenced];
      if (wrote) state.previousModelRoles = previousRoles;
      saveState(state, dir);

      appendHistory(dir, {
        ts: new Date().toISOString(),
        trigger,
        keyMeta: { isFreeTier: keyMeta.isFreeTier, limitRemaining: keyMeta.limitRemaining, creditsRemaining: keyMeta.creditsRemaining } satisfies Pick<KeyMeta, "isFreeTier" | "limitRemaining" | "creditsRemaining">,
        decisions,
        // Present only when the per-run override was active (spec #99), so the
        // append-only log records which runs ignored the configured margin.
        ...(marginOverride !== undefined ? { switchMargin: marginOverride } : {}),
      });
    }

    // Live-session coupling: after a real write, hand the new default selector
    // to the host so an empty conversation starts on the freshly ranked pick.
    // Only a real change applies (kept/default roles would append a pointless
    // model_change every run); the hook decides host-side qualification. Hook
    // failures never fail the run — the config write already succeeded.
    const defaultDecision = decisions.find((d) => d.role === "default");
    if (
      defaultSelector !== undefined &&
      defaultDecision !== undefined &&
      defaultDecision.from !== defaultDecision.to &&
      wrote &&
      settings.activateDefaultOnEmptySession &&
      deps.applySessionModel
    ) {
      try {
        await deps.applySessionModel(defaultSelector, defaultDecision.from);
      } catch (err) {
        deps.notify([`omp-llm-role: could not update the session model: ${err instanceof Error ? err.message : String(err)}`]);
      }
    }

    const lines: string[] = [];
    if (notifyAll) {
      lines.push(...notes);
      for (const d of decisions) lines.push(decisionLine(d));
      lines.push(wrote ? `wrote ${configPath}` : `no changes to ${configPath}${opts?.dryRun ? " (dry run)" : ""}`);
      deps.notify(lines);
    } else {
      for (const d of decisions) {
        if (d.from !== d.to) lines.push(decisionLine(d));
      }
      if (lines.length > 0 || notes.length > 0) deps.notify([...notes, ...lines]);
    }
    return { decisions, wrote, defaultSelector, patch };
  } catch (err) {
    const message = err instanceof ConfigEditError ? `config edit refused: ${err.message}` : err instanceof Error ? err.message : String(err);
    deps.notify([`omp-llm-role: aborted, no write: ${message}`]);
    // An exception escaping the run is a defect (a bug), unlike the enumerated
    // environment aborts above: mark it so the extension can report it.
    return { decisions: [], wrote: false, aborted: message, defect: message };
  }
}

export type { ResolvedSettings };
