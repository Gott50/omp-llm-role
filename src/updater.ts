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
import { computeRankings, endpointFilterDrops, loadRankData, META_LEVELS, providerPinDrops, type Ranked, type RankData } from "./engine.ts";
import { currentRankingId, enrichThinkingLevels, fetchKeyAvailability, fetchKeyMeta, filterCatalog, probeModel, resolveVariant, THINKING_LEVELS, tierGate, type CatalogEntry, type KeyAvailability, type KeyMeta, type ProbeVerdict } from "./availability.ts";
import { ConfigEditError, parseConfig, patchConfig, writeConfigAtomic, type ConfigPatch } from "./config-edit.ts";
import { PLUGIN_SETTINGS_PATH, projectLockPath, readPluginSettingsMap, resolveSettings, roleUniverse, type ResolvedSettings } from "./settings.ts";
import { discoverAgentPins } from "./agent-pins.ts";
import { registerProject } from "./project-registry.ts";
import { agentDir, acquireLock, appendHistory, loadState, releaseLock, saveState } from "./state.ts";

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
  /** Availability source for this role's selection: the keyed-catalog fast path or the probe walk. */
  availabilitySource: "keyed-catalog" | "probe";
  /** Candidates pruned as key-blocked (present in the public catalog, absent from the keyed one). */
  keyBlockedCount: number;
};

export type RunResult = {
  decisions: Decision[];
  wrote: boolean;
  /** Final selector the run chose for the `default` role, when that role was decided. */
  defaultSelector?: string;
  aborted?: string;
};

export type Trigger = "session-start" | "manual";

/** A ranked model resolved to a concrete catalog id. */
type Candidate = { ranked: Ranked; catalogId: string };

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
  /** DI seam like `getKeyMeta`/`probeModel`; production defaults to `fetchKeyAvailability` (never throws). */
  getKeyAvailability?(token: string): Promise<KeyAvailability>;
  /**
   * Host coupling (extension only): apply a concrete selector to the live
   * session model. Receives the final `default` selector (with thinking
   * suffix) plus the previously written `default` selector (null when the
   * role was unset); the host decides whether the session still qualifies.
   */
  applySessionModel?(selector: string, previous: string | null): Promise<void>;
};

const CONFLICT_RETRIES = 3;

/** Per-role cap on allowlist probe requests (budget against pathological all-blocked pools). */
const PROBE_BUDGET = 12;

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
  return d.from === d.to
    ? `@${d.role}: kept ${d.to} (${d.reason}; ${scores}${blocked}${endpoint}${pin})`
    : `@${d.role}: ${from} -> ${d.to} (${d.reason}; ${scores}${blocked}${endpoint}${pin})`;
}

/**
 * Cost-side escape from the hysteresis margin. `switchMargin` is a
 * flat band on `value`, so it can veto a switch worth up to `switchMargin / λ`
 * $/M while the incumbent is only marginally better — e.g. a role at λ 0.003
 * refuses up to $7/M of savings. A challenger inside that band is adopted when
 * it undercuts the incumbent's effective price by `priceSwitchFraction` (0.5 =
 * at least twice as cheap). 0 disables the override.
 */
function cheaperInsideMargin(best: Ranked, current: Ranked, settings: ResolvedSettings): boolean {
  if (settings.priceSwitchFraction <= 0 || current.priceEff <= 0) return false;
  if (best.value < current.value - settings.switchMargin) return false;
  return best.priceEff <= current.priceEff * (1 - settings.priceSwitchFraction);
}

/** Abort lines for the two write-path failures (shared by the full run and the
 * settings-derived agent sync). */
const LOCK_ABORT = "omp-llm-role: could not acquire the refresh lock (concurrent run?) — no write";
const CONFLICT_ABORT = `omp-llm-role: config.yml kept changing underneath (${CONFLICT_RETRIES} mtime conflicts) — no write`;

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
 */
function agentDisablePatch(
  raw: Record<string, unknown>,
  settings: ResolvedSettings,
  previouslyManaged: readonly string[],
): Pick<ConfigPatch, "agentDisableAdds" | "agentDisableRemoves"> {
  const universe = roleUniverse(raw, settings.roles);
  const agentDisableAdds: string[] = [];
  const agentDisableRemoves: string[] = [];
  const desired = new Set<string>();
  for (const pin of discoverAgentPins()) {
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
 */
function resolveProjectDir(): string | null {
  const projectDir = join(process.cwd(), ".omp");
  const raw = readPluginSettingsMap({ global: join(projectDir, "plugins", "omp-plugins.lock.json"), project: null });
  return Object.keys(raw).length > 0 ? projectDir : null;
}

export async function runUpdater(trigger: Trigger, deps: Deps, opts?: { force?: boolean; dryRun?: boolean }): Promise<RunResult> {
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
    const agentDisables = agentDisablePatch(raw, settings, state.managedDisabledAgents);
    const nextManagedDisabled = agentDisables.agentDisableAdds;

    // The settings-derived agent sync is not day-gated: enabling/disabling a
    // shipped role must take effect on the next session, not the next day.
    if (!opts?.force && state.lastRunDay === today) {
      if (opts?.dryRun) return { decisions: [], wrote: false };
      const res = writePatch(configPath, dir, { roleSelectors: {}, roleRemovals: [], chainUpserts: {}, chainPrunes: [], ...agentDisables });
      if (res.status === "locked") return { decisions: [], wrote: false }; // another session is syncing — benign
      if (res.status === "conflict") return abort([CONFLICT_ABORT]);
      if (res.status === "written") {
        state.managedDisabledAgents = nextManagedDisabled;
        saveState(state, dir);
        if (notifyAll) deps.notify(["omp-llm-role: task.disabledAgents updated"]);
      }
      return { decisions: [], wrote: res.status === "written" };
    }

    let rank: RankData;
    try {
      rank = (await deps.getRankData?.()) ?? (await loadRankData({ roles: settings.roles }));
    } catch (err) {
      return abort([`omp-llm-role: ranking data unavailable, no write: ${err instanceof Error ? err.message : err}`]);
    }

    const token = await deps.getToken();
    const keyMeta = (await deps.getKeyMeta?.(token)) ?? (await fetchKeyMeta(token));
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
    if (availability.active) {
      notes.push(
        `omp-llm-role: OpenRouter keyed catalog active — ${availability.keyedCount}/${availability.publicCount} models allowed; key-blocked candidates are pruned from the probe walk (up to ${PROBE_BUDGET} probes/role saved)`,
      );
    } else {
      notes.push(
        `omp-llm-role: OpenRouter keyed catalog ${availability.reason === "no-filter" ? "not filtering" : "unavailable"} — enable OpenRouter → Settings → "Filter the model catalog for API keys" to skip probing key-blocked models; the probe walk is still in use`,
      );
    }
    const poolByRole: Record<string, Candidate[]> = {};
    /** Per managed role: its bare chain key, role suffix, provider pin, and the pool it was chosen from. */
    const chainPlanByRole: Record<string, { key: string; suffix: string | undefined; pin: string; pool: Candidate[]; chosenIdx: number }> = {};
    /** Roles whose `providerPin` matched no route: left unchanged, their current chain preserved. */
    const pinUnmatched: string[] = [];
    const probe = deps.probeModel ?? probeModel;
    const probeVerdicts = new Map<string, ProbeVerdict>();
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
      poolByRole[role] = pool;
      const best = pool[0];
      const currentEntry = currentId === null ? null : pool.find((p) => p.ranked.model.id === currentId) ?? null;

      let chosen = best;
      let reason: Decision["reason"];
      if (currentSelector === null) reason = "no-current";
      else if (currentEntry === null) reason = "adopted";
      else if (currentEntry.ranked.model.id === best.ranked.model.id) {
        chosen = currentEntry;
        reason = "kept-eligible";
      } else if (best.ranked.value - currentEntry.ranked.value >= settings.switchMargin) reason = "switched";
      else if (cheaperInsideMargin(best.ranked, currentEntry.ranked, settings)) reason = "switched-cost";
      else {
        chosen = currentEntry;
        reason = "kept-margin";
      }

      const suffix = def.thinking;
      // A provider pin rides as the selector's `@<slug>` suffix, before the
      // thinking level (`openrouter/<id>@<slug>:<level>`) — omp's
      // `splitUpstreamRouting` parses the trailing `@<slug>` and applies
      // `compat.openRouterRouting = { only: [slug] }`.
      const pin = def.providerPin !== undefined ? `@${def.providerPin}` : "";
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
        blocked: blockedForRole,
        endpointBlocked: endpointFilterDrops(def, rank.models),
        pinBlocked: providerPinDrops(def, rank.models),
        availabilitySource: availability.active ? "keyed-catalog" : "probe",
        keyBlockedCount,
      });

      // Fallback chain inputs for every managed role: the bare key (a chain key
      // matches the active model id, never a level) plus the pool the chosen model
      // came from. Values are built after the loop, once every key claim is known.
      if (settings.writeFallbackChains) {
        const key = suffix !== undefined && finalSelector.endsWith(`:${suffix}`) ? finalSelector.slice(0, -(suffix.length + 1)) : finalSelector;
        chainPlanByRole[role] = { key, suffix, pin, pool, chosenIdx: pool.indexOf(chosen) };
      }
    }

    const roleSelectors: Record<string, string> = {};
    for (const d of decisions) roleSelectors[d.role] = d.to;
    const defaultSelector = roleSelectors["default"];
    const chainUpserts: Record<string, string[]> = {};
    const referenced = new Set<string>();
    if (settings.writeFallbackChains) {
      // A chain key is model-oriented: when several managed roles land on the same
      // model, one chain serves all of them, so its values stay level-free instead
      // of imposing whichever role iterated last. A key claimed by exactly one role
      // carries that role's thinking suffix on every entry whose target advertises
      // thinking support — so a fallback runs at the role's effort, not the
      // session default. Deduped, key excluded.
      const claims: Record<string, number> = {};
      for (const d of decisions) claims[chainPlanByRole[d.role].key] = (claims[chainPlanByRole[d.role].key] ?? 0) + 1;
      for (const d of decisions) {
        const plan = chainPlanByRole[d.role];
        const suffix = claims[plan.key] === 1 ? plan.suffix : undefined;
        // Cost-aware ordering: prefer fallbacks priced at or below the chosen
        // model (a fallback should not cost more than the primary), then fill any
        // remaining depth with the next-best by value.
        const after = plan.pool.slice(plan.chosenIdx + 1);
        const chosenPrice = plan.pool[plan.chosenIdx].ranked.priceEff;
        const cheaper = after.filter((p) => p.ranked.priceEff <= chosenPrice);
        const pricier = after.filter((p) => p.ranked.priceEff > chosenPrice);
        const chainPool = [...cheaper, ...pricier].slice(0, settings.fallbackChainDepth);
        chainUpserts[plan.key] = [
          ...new Set(chainPool.map((p) => {
            const row = rowById.get(p.catalogId);
            const level = suffix !== undefined && row !== undefined && (META_LEVELS[suffix] === true || row.thinking.includes(suffix)) ? `:${suffix}` : "";
            return `openrouter/${p.catalogId}${plan.pin}${level}`;
          })),
        ].filter((v) => v !== plan.key);
        referenced.add(plan.key);
      }
      // Locked roles keep their current chain: the plugin neither rewrites nor
      // prunes it, so its key must count as referenced. A chain key is the
      // current selector minus a trailing `:level` (chain keys are level-free).
      // A role whose pin matched no route is likewise left unchanged, so its
      // current chain must survive the prune.
      for (const role of [...lockedRoles, ...pinUnmatched]) {
        const sel = current.modelRoles[role];
        if (sel === undefined) continue;
        const colon = sel.lastIndexOf(":");
        referenced.add(colon !== -1 && sel.slice(colon + 1) in THINKING_LEVELS ? sel.slice(0, colon) : sel);
      }
    }
    const chainPrunes = settings.writeFallbackChains ? state.pluginWrittenChainKeys.filter((k) => !referenced.has(k)) : [];
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
    return { decisions, wrote, defaultSelector };
  } catch (err) {
    const message = err instanceof ConfigEditError ? `config edit refused: ${err.message}` : err instanceof Error ? err.message : String(err);
    deps.notify([`omp-llm-role: aborted, no write: ${message}`]);
    return { decisions: [], wrote: false, aborted: message };
  }
}

export type { ResolvedSettings };
