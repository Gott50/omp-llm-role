/**
 * Plugin state, history, and the refresh lock — all under the omp agent dir,
 * next to the config.yml they describe (SPEC §8).
 *
 * - `llm-role-state.json` — day gate, managed roles, last selectors, chain keys
 *   the plugin owns, and the pre-write `modelRoles` snapshot (manual rollback aid).
 * - `llm-role-history.jsonl` — append-only decision log, one row per completed run.
 * - `.llm-role-refresh.lock` — O_EXCL create; serializes concurrent session starts.
 *   Stale (> 60 s) locks are unlinked and retried once; an uncontended failure
 *   makes the caller no-op.
 */

import { appendFileSync, closeSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { isRecord } from "./guards.ts";

export type PluginState = {
  lastRunDay: string | null;
  managedRoles: string[];
  roleLastSelector: Record<string, string>;
  pluginWrittenChainKeys: string[];
  /** Agent names the plugin added to `task.disabledAgents`; lets a later run
   *  remove an entry whose agent file is gone (e.g. `/remove-agent`). */
  managedDisabledAgents: string[];
  previousModelRoles: Record<string, string> | null;
};

export function freshState(): PluginState {
  return {
    lastRunDay: null,
    managedRoles: [],
    roleLastSelector: {},
    pluginWrittenChainKeys: [],
    managedDisabledAgents: [],
    previousModelRoles: null,
  };
}

/**
 * Agent dir resolution (decision D4): test override, then `PI_CODING_AGENT_DIR`,
 * then a non-default `OMP_PROFILE` -> `~/.omp/profiles/<name>/agent`, else the
 * default `~/.omp/agent`.
 */
export function agentDir(): string {
  const override = process.env.OMP_LLM_ROLE_AGENT_DIR;
  if (override) return override;
  const pi = process.env.PI_CODING_AGENT_DIR;
  if (pi) return pi;
  const profile = process.env.OMP_PROFILE;
  if (profile && profile !== "default") return join(homedir(), ".omp", "profiles", profile, "agent");
  return join(homedir(), ".omp", "agent");
}

function stringRecord(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (isRecord(v)) for (const [k, val] of Object.entries(v)) if (typeof val === "string") out[k] = val;
  return out;
}

function stringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];
}

export function loadState(dir = agentDir()): PluginState {
  const path = join(dir, "llm-role-state.json");
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    if (statSyncSafe(path) !== null) console.error(`omp-llm-role: ${path} unreadable (${err instanceof Error ? err.message : err}); starting fresh`);
    return freshState();
  }
  if (!isRecord(parsed)) {
    console.error(`omp-llm-role: ${path} has unexpected shape; starting fresh`);
    return freshState();
  }
  return {
    lastRunDay: typeof parsed.lastRunDay === "string" ? parsed.lastRunDay : null,
    managedRoles: stringArray(parsed.managedRoles),
    roleLastSelector: stringRecord(parsed.roleLastSelector),
    pluginWrittenChainKeys: stringArray(parsed.pluginWrittenChainKeys),
    managedDisabledAgents: stringArray(parsed.managedDisabledAgents),
    previousModelRoles: isRecord(parsed.previousModelRoles) ? stringRecord(parsed.previousModelRoles) : null,
  };
}

export function saveState(state: PluginState, dir = agentDir()): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "llm-role-state.json"), `${JSON.stringify(state, null, 2)}\n`);
}

export function appendHistory(dir: string, row: object): void {
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, "llm-role-history.jsonl"), `${JSON.stringify(row)}\n`);
}

function statSyncSafe(path: string): number | null {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return null;
  }
}

/** O_EXCL lock create; stale (> 60 s) locks are broken and retried once. False = someone else holds it. */
export function acquireLock(dir: string): boolean {
  const path = join(dir, ".llm-role-refresh.lock");
  const attempt = (): boolean => {
    try {
      const fd = openSync(path, "wx");
      try {
        writeFileSync(fd, `${process.pid} ${new Date().toISOString()}`);
      } finally {
        closeSync(fd);
      }
      return true;
    } catch {
      return false;
    }
  };
  if (attempt()) return true;
  const mtime = statSyncSafe(path);
  if (mtime !== null && Date.now() - mtime > 60_000) {
    try {
      unlinkSync(path);
    } catch {
      return false; // someone else broke it first
    }
    return attempt();
  }
  return false;
}

export function releaseLock(dir: string): void {
  try {
    unlinkSync(join(dir, ".llm-role-refresh.lock"));
  } catch {
    // already gone
  }
}
