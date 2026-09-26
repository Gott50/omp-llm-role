/**
 * Orchestration (SPEC §6–9): rank today's models -> tier gate + catalog
 * resolution -> per-role hysteresis -> fallback chains -> surgical config patch.
 *
 * Every abort path notifies and returns `aborted` without touching config.yml.
 * A run with zero changes writes nothing (config mtime untouched) but still
 * stamps the day gate and appends a history row. Both entry points (the omp
 * extension and the Node CLI shim) drive this through injected Deps, so they
 * share one code path.
 */

import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { computeRankings, loadRankData, type Ranked, type RankData } from "./engine.ts";
import { currentRankingId, fetchKeyMeta, filterCatalog, probeModel, resolveVariant, tierGate, type CatalogEntry, type KeyMeta, type ProbeVerdict } from "./availability.ts";
import { ConfigEditError, parseConfig, patchConfig, writeConfigAtomic, type ConfigPatch } from "./config-edit.ts";
import { readPluginSettingsMap, resolveSettings, type ResolvedSettings } from "./settings.ts";
import { agentDir, acquireLock, appendHistory, loadState, releaseLock, saveState } from "./state.ts";

export type DecisionReason = "adopted" | "switched" | "kept-margin" | "kept-eligible" | "no-current";

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
};

export type RunResult = {
  decisions: Decision[];
  wrote: boolean;
  aborted?: string;
};

export type Trigger = "session-start" | "manual" | "cli";

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
  return d.from === d.to
    ? `@${d.role}: kept ${d.to} (${d.reason}; ${scores}${blocked})`
    : `@${d.role}: ${from} -> ${d.to} (${d.reason}; ${scores}${blocked})`;
}

export async function runUpdater(trigger: Trigger, deps: Deps, opts?: { force?: boolean; dryRun?: boolean }): Promise<RunResult> {
  const notifyAll = trigger !== "session-start" || opts?.dryRun === true;
  const abort = (lines: string[]): RunResult => {
    deps.notify(lines);
    return { decisions: [], wrote: false, aborted: lines[0] };
  };
  try {
    const state = loadState();
    const today = deps.nowUtcDay();
    if (!opts?.force && state.lastRunDay === today) return { decisions: [], wrote: false };

    const raw = (await deps.getSettings?.()) ?? readPluginSettingsMap();
    const { settings, errors } = resolveSettings(raw);
    if (errors.length > 0) return abort([`omp-llm-role settings invalid, no write:`, ...errors.map((e) => `  ${e}`)]);

    let rank: RankData;
    try {
      rank = (await deps.getRankData?.()) ?? (await loadRankData());
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
    const rowById = new Map(eligible.map((c) => [c.id, c]));

    const dir = agentDir();
    const configPath = join(dir, "config.yml");
    let configText = "";
    try {
      configText = readFileSync(configPath, "utf8");
    } catch {
      // no config yet (first run) — patchConfig will create the blocks
    }
    const current = parseConfig(configText);

    // Per-role selection: rank -> tier/catalog filter -> probe gate ->
    // hysteresis -> suffix. The probe walk verifies candidates with one-token
    // completions because the key's allowed-providers privacy whitelist is
    // invisible to /api/v1/key and the catalog endpoints (SPEC §5 addendum).
    const decisions: Decision[] = [];
    const notes: string[] = [];
    const poolByRole: Record<string, Candidate[]> = {};
    /** Per managed role: its bare chain key, role suffix, and the pool it was chosen from. */
    const chainPlanByRole: Record<string, { key: string; suffix: string | undefined; pool: Candidate[]; chosenIdx: number }> = {};
    const probe = deps.probeModel ?? probeModel;
    const probeVerdicts = new Map<string, ProbeVerdict>();
    for (const [role, def] of Object.entries(settings.roles)) {
      const rankings = computeRankings(rank.models, { [role]: def });
      const candidates: Candidate[] = [];
      for (const ranked of rankings[role] ?? []) {
        const catalogId = resolveVariant(ranked.model.id, eligible, tier);
        if (catalogId !== null) candidates.push({ ranked, catalogId });
      }
      if (candidates.length === 0) continue; // nothing eligible — role untouched

      const currentSelector = current.modelRoles[role] ?? null;
      const currentId = currentSelector === null ? null : currentRankingId(currentSelector);
      const currentIdx = currentId === null ? -1 : candidates.findIndex((c) => c.ranked.model.id === currentId);

      // Probe walk: current candidate first (hysteresis must see it), then rank
      // order. It stops only when 1 + chain depth clean candidates exist AND —
      // when the current candidate is clean — `fallbackChainDepth` clean
      // candidates lie beyond the current rank, so a kept role's written chain
      // is filled with probe-verified entries. Budget-capped (a short chain is
      // the graceful degradation); verdicts cached across roles.
      const target = 1 + settings.fallbackChainDepth;
      const order: number[] = [];
      if (currentIdx >= 0) order.push(currentIdx);
      for (let i = 0; i < candidates.length; i++) {
        if (i !== currentIdx) order.push(i);
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
          if (currentIdx >= 0 && idx > currentIdx) cleanAfterCurrent++;
        }
        const currentClean = currentIdx >= 0 && probeVerdicts.get(candidates[currentIdx].catalogId) !== "blocked";
        if (cleanCount >= target && (!currentClean || cleanAfterCurrent >= settings.fallbackChainDepth)) break;
      }
      const pool = probed
        .filter((idx) => probeVerdicts.get(candidates[idx].catalogId) !== "blocked")
        .sort((a, b) => a - b)
        .map((idx) => candidates[idx]);
      if (pool.length === 0) {
        notes.push(`@${role}: no probe-clean candidate among ${probed.length} probed (blocked: ${blockedForRole.join(", ")}) — role untouched`);
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
      else {
        chosen = currentEntry;
        reason = "kept-margin";
      }

      const suffix = settings.suffixes[role];
      const chosenRow = rowById.get(chosen.catalogId);
      const finalSelector = `openrouter/${chosen.catalogId}${suffix !== undefined && (chosenRow?.thinking.length ?? 0) > 0 ? `:${suffix}` : ""}`;
      decisions.push({
        role,
        from: currentSelector,
        to: finalSelector,
        reason,
        value: chosen.ranked.value,
        bestValue: best.ranked.value,
        currentValue: currentEntry?.ranked.value ?? null,
        blocked: blockedForRole,
      });

      // Fallback chain inputs for every managed role: the bare key (a chain key
      // matches the active model id, never a level) plus the pool the chosen model
      // came from. Values are built after the loop, once every key claim is known.
      if (settings.writeFallbackChains) {
        const key = suffix !== undefined && finalSelector.endsWith(`:${suffix}`) ? finalSelector.slice(0, -(suffix.length + 1)) : finalSelector;
        chainPlanByRole[role] = { key, suffix, pool, chosenIdx: pool.indexOf(chosen) };
      }
    }

    const roleSelectors: Record<string, string> = {};
    for (const d of decisions) roleSelectors[d.role] = d.to;
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
        chainUpserts[plan.key] = [
          ...new Set(plan.pool.slice(plan.chosenIdx + 1, plan.chosenIdx + 1 + settings.fallbackChainDepth).map((p) => {
            const row = rowById.get(p.catalogId);
            const level = suffix !== undefined && (row?.thinking.length ?? 0) > 0 ? `:${suffix}` : "";
            return `openrouter/${p.catalogId}${level}`;
          })),
        ].filter((v) => v !== plan.key);
        referenced.add(plan.key);
      }
    }
    const chainPrunes = settings.writeFallbackChains ? state.pluginWrittenChainKeys.filter((k) => !referenced.has(k)) : [];
    const patch: ConfigPatch = { roleSelectors, chainUpserts, chainPrunes };

    let wrote = false;
    // Dry runs stop here: decisions are reported, but nothing is written, no
    // day gate is stamped, and no history row is appended.
    if (!opts?.dryRun) {
      if (!acquireLock(dir)) return abort(["omp-llm-role: could not acquire the refresh lock (concurrent run?) — no write"]);
      let previousRoles: Record<string, string> | null = null;
      try {
        for (let attempt = 0; attempt < CONFLICT_RETRIES; attempt++) {
          let text: string;
          try {
            text = readFileSync(configPath, "utf8");
          } catch {
            text = "";
          }
          const mtime = mtimeOf(configPath);
          const patched = patchConfig(text, patch); // throws ConfigEditError -> abort, no write
          if (patched === text) break; // zero changes — no write, no mtime touch
          if (writeConfigAtomic(configPath, patched, mtime) === "written") {
            wrote = true;
            previousRoles = parseConfig(text).modelRoles;
            break;
          }
          if (attempt === CONFLICT_RETRIES - 1) {
            return abort([`omp-llm-role: config.yml kept changing underneath (${CONFLICT_RETRIES} mtime conflicts) — no write`]);
          }
        }
      } finally {
        releaseLock(dir);
      }

      state.lastRunDay = today;
      state.managedRoles = decisions.map((d) => d.role);
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
    return { decisions, wrote };
  } catch (err) {
    const message = err instanceof ConfigEditError ? `config edit refused: ${err.message}` : err instanceof Error ? err.message : String(err);
    deps.notify([`omp-llm-role: aborted, no write: ${message}`]);
    return { decisions: [], wrote: false, aborted: message };
  }
}

export type { ResolvedSettings };
