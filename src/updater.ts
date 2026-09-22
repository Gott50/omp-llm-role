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
import { currentRankingId, fetchKeyMeta, filterCatalog, resolveVariant, tierGate, type CatalogEntry, type KeyMeta } from "./availability.ts";
import { ConfigEditError, parseConfig, patchConfig, writeConfigAtomic, type ConfigPatch } from "./config-edit.ts";
import { readPluginSettingsMap, resolveSettings, type ResolvedSettings } from "./settings.ts";
import { agentDir, acquireLock, appendHistory, loadState, releaseLock, saveState } from "./state.ts";

export type DecisionReason = "adopted" | "switched" | "kept-margin" | "kept-eligible" | "no-current";

export type Decision = {
  role: string;
  from: string | null;
  to: string;
  reason: DecisionReason;
  score: number;
  bestScore: number;
  currentScore: number | null;
};

export type RunResult = {
  decisions: Decision[];
  wrote: boolean;
  aborted?: string;
};

export type Trigger = "session-start" | "manual" | "cli";

export type Deps = {
  getToken(): Promise<string>;
  getCatalog(): Promise<CatalogEntry[]>;
  notify(lines: string[]): void;
  nowUtcDay(): string;
  /** DI seams for tests; production defaults to the engine and the lock-file settings. */
  getRankData?(): Promise<RankData>;
  getSettings?(): Promise<Record<string, unknown>>;
  getKeyMeta?(token: string): Promise<KeyMeta>;
};

const CONFLICT_RETRIES = 3;

function mtimeOf(path: string): number {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0; // file absent — writeConfigAtomic accepts a create when it is still absent
  }
}

function decisionLine(d: Decision): string {
  const from = d.from ?? "(unset)";
  const scores = `score ${d.score.toFixed(3)}, best ${d.bestScore.toFixed(3)}${d.currentScore == null ? "" : `, was ${d.currentScore.toFixed(3)}`}`;
  return d.from === d.to
    ? `@${d.role}: kept ${d.to} (${d.reason}; ${scores})`
    : `@${d.role}: ${from} -> ${d.to} (${d.reason}; ${scores})`;
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

    const dir = agentDir();
    const configPath = join(dir, "config.yml");
    let configText = "";
    try {
      configText = readFileSync(configPath, "utf8");
    } catch {
      // no config yet (first run) — patchConfig will create the blocks
    }
    const current = parseConfig(configText);

    // Per-role selection: rank -> tier/catalog filter -> hysteresis -> suffix.
    const decisions: Decision[] = [];
    const poolByRole: Record<string, Array<{ ranked: Ranked; catalogId: string }>> = {};
    const chainKeyByRole: Record<string, string> = {};
    const chainValuesByRole: Record<string, string[]> = {};
    for (const [role, def] of Object.entries(settings.roles)) {
      const rankings = computeRankings(rank.models, { [role]: def });
      const pool: Array<{ ranked: Ranked; catalogId: string }> = [];
      for (const ranked of rankings[role] ?? []) {
        const catalogId = resolveVariant(ranked.model.id, eligible, tier);
        if (catalogId !== null) pool.push({ ranked, catalogId });
      }
      if (pool.length === 0) continue; // nothing eligible — role untouched
      poolByRole[role] = pool;
      const best = pool[0];
      const currentSelector = current.modelRoles[role] ?? null;
      const currentId = currentSelector === null ? null : currentRankingId(currentSelector);
      const currentEntry = currentId === null ? null : pool.find((p) => p.ranked.model.id === currentId) ?? null;

      let chosen = best;
      let reason: Decision["reason"];
      if (currentSelector === null) reason = "no-current";
      else if (currentEntry === null) reason = "adopted";
      else if (currentEntry.ranked.model.id === best.ranked.model.id) {
        chosen = currentEntry;
        reason = "kept-eligible";
      } else if (best.ranked.score - currentEntry.ranked.score >= settings.switchMargin) reason = "switched";
      else {
        chosen = currentEntry;
        reason = "kept-margin";
      }

      const suffix = settings.suffixes[role];
      const chosenRow = eligible.find((c) => c.id === chosen.catalogId);
      const finalSelector = `openrouter/${chosen.catalogId}${suffix !== undefined && (chosenRow?.thinking.length ?? 0) > 0 ? `:${suffix}` : ""}`;
      decisions.push({
        role,
        from: currentSelector,
        to: finalSelector,
        reason,
        score: chosen.ranked.score,
        bestScore: best.ranked.score,
        currentScore: currentEntry?.ranked.score ?? null,
      });

      // Fallback chain for every managed role: key = chosen selector without suffix,
      // values = next tier-eligible candidates after it (deduped, key excluded).
      if (settings.writeFallbackChains) {
        const key = suffix !== undefined && finalSelector.endsWith(`:${suffix}`) ? finalSelector.slice(0, -(suffix.length + 1)) : finalSelector;
        const chosenIdx = pool.indexOf(chosen);
        const values = [
          ...new Set(pool.slice(chosenIdx + 1, chosenIdx + 1 + settings.fallbackChainDepth).map((p) => `openrouter/${p.catalogId}`)),
        ].filter((v) => v !== key);
        chainKeyByRole[role] = key;
        chainValuesByRole[role] = values;
      }
    }

    const roleSelectors: Record<string, string> = {};
    for (const d of decisions) roleSelectors[d.role] = d.to;
    const chainUpserts: Record<string, string[]> = {};
    const referenced = new Set<string>();
    if (settings.writeFallbackChains) {
      for (const d of decisions) {
        const key = chainKeyByRole[d.role];
        chainUpserts[key] = chainValuesByRole[d.role];
        referenced.add(key);
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
      for (const d of decisions) lines.push(decisionLine(d));
      lines.push(wrote ? `wrote ${configPath}` : `no changes to ${configPath}${opts?.dryRun ? " (dry run)" : ""}`);
      deps.notify(lines);
    } else {
      for (const d of decisions) {
        if (d.from !== d.to) lines.push(decisionLine(d));
      }
      if (lines.length > 0) deps.notify(lines);
    }
    return { decisions, wrote };
  } catch (err) {
    const message = err instanceof ConfigEditError ? `config edit refused: ${err.message}` : err instanceof Error ? err.message : String(err);
    deps.notify([`omp-llm-role: aborted, no write: ${message}`]);
    return { decisions: [], wrote: false, aborted: message };
  }
}

export type { ResolvedSettings };
