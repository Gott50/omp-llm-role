/**
 * Plugin settings for omp-llm-role: shipped defaults + deep-merged user
 * overrides from the omp plugin settings map.
 *
 * Source of truth (decision D1): `~/.omp/plugins/omp-plugins.lock.json` ->
 * `settings["omp-llm-role"]`, with `<anchor>/.omp/plugins/omp-plugins.lock.json`
 * merged under it (project wins). Keys are flat and dotted
 * (`roles.slow.weights.code=0.2`, written by `omp plugin config omp-llm-role
 * --set=k=v`) and are nested here; a `config` key holding JSON is accepted as a
 * power-user escape hatch for whole-object overrides.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { RoleDef } from "./engine.ts";
import { isRecord } from "./guards.ts";
export const DEFAULT_ROLES: Record<string, RoleDef> = {
  default: {
    description: "Main workhorse: strong general coding-agent quality, sane cost",
    weights: { general: 0.3, code: 0.25, agents: 0.2, tool_calling: 0.1, reasoning: 0.1, price: 0.05 },
    required: ["general", "price", "throughput"],
  },
  smol: {
    description: "Fast lightweight model: cheap and quick, still competent",
    weights: { price: 0.3, throughput: 0.25, general: 0.2, code: 0.15, tool_calling: 0.1 },
    required: ["general", "price", "throughput"],
  },
  slow: {
    description: "Most capable model for hard problems; cost and speed as tiebreakers",
    weights: { general: 0.25, reasoning: 0.25, code: 0.2, agents: 0.15, math: 0.1, price: 0.03, throughput: 0.02 },
    required: ["general", "price", "throughput"],
  },
  vision: {
    description: "Image understanding: vision index dominates",
    weights: { vision: 0.5, general: 0.2, reasoning: 0.15, code: 0.1, price: 0.03, throughput: 0.02 },
    required: ["vision", "general", "price", "throughput"],
    filters: { image: true },
  },
  plan: {
    description: "Planning: reasoning, math, long-context coherence",
    weights: { reasoning: 0.3, math: 0.15, long_context: 0.2, general: 0.2, mrcr: 0.1, price: 0.03, throughput: 0.02 },
    required: ["reasoning", "general", "price", "throughput"],
  },
  commit: {
    description: "Commit messages: cheap and fast with decent general quality",
    weights: { price: 0.35, throughput: 0.25, general: 0.25, code: 0.15 },
    required: ["general", "price", "throughput"],
  },
  tiny: {
    description: "Background tasks (titles, memory): cheapest and fastest wins",
    weights: { price: 0.4, throughput: 0.35, general: 0.25 },
    required: ["general", "price", "throughput"],
  },
  task: {
    description: "Subagents: agentic + tool calling, moderate cost sensitivity",
    weights: { agents: 0.3, tool_calling: 0.2, code: 0.2, general: 0.15, price: 0.1, throughput: 0.05 },
    required: ["general", "price", "throughput"],
  },
  advisor: {
    description: "Advisor/watchdog: deep reasoning over long context",
    weights: { reasoning: 0.35, general: 0.25, long_context: 0.2, math: 0.1, search: 0.05, price: 0.03, throughput: 0.02 },
    required: ["reasoning", "general", "price", "throughput"],
  },
};

export type SuffixLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | "auto";

const SUFFIX_LEVELS: Record<SuffixLevel, true> = {
  off: true,
  minimal: true,
  low: true,
  medium: true,
  high: true,
  xhigh: true,
  max: true,
  auto: true,
};

/** Metrics a role weight/required entry may name (SPEC §7). */
const KNOWN_METRICS: Record<string, true> = {
  general: true,
  reasoning: true,
  math: true,
  code: true,
  agents: true,
  search: true,
  vision: true,
  tool_calling: true,
  long_context: true,
  mrcr: true,
  price: true,
  throughput: true,
};

export type ResolvedSettings = {
  switchMargin: number;
  writeFallbackChains: boolean;
  fallbackChainDepth: number;
  suffixes: Record<string, SuffixLevel>;
  roles: Record<string, RoleDef>;
};

export const DEFAULT_SETTINGS: ResolvedSettings = {
  switchMargin: 0.02,
  writeFallbackChains: true,
  fallbackChainDepth: 2,
  suffixes: { smol: "off", slow: "max", vision: "auto", plan: "high", commit: "off" },
  roles: DEFAULT_ROLES,
};


/** Deep-merge `patch` into `target` in place; plain objects merge, everything else replaces. */
function deepMergeInto(target: Record<string, unknown>, patch: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(patch)) {
    if (isRecord(v) && isRecord(target[k])) deepMergeInto(target[k], v);
    else target[k] = v;
  }
}

/** Set `value` at a dotted path, creating intermediate plain objects. */
function setNested(target: Record<string, unknown>, path: string[], value: unknown): void {
  let node = target;
  for (let i = 0; i < path.length - 1; i++) {
    const k = path[i];
    // isRecord just checked (or we created) this node; the cast restates it for TS.
    if (!isRecord(node[k])) node[k] = {};
    node = node[k] as Record<string, unknown>;
  }
  node[path[path.length - 1]] = value;
}

/** Nearest ancestor dir (or cwd itself) containing a `.omp` or `.git` anchor; null when none. */
function findProjectAnchor(): string | null {
  let dir = process.cwd();
  for (;;) {
    if (existsSync(join(dir, ".omp")) || existsSync(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Read the raw `settings["omp-llm-role"]` map: user-level lock file, with the
 * project-anchor lock file merged over it. Missing files (or missing settings
 * entries) yield {}; unparseable lock files warn and yield {}.
 */
export function readPluginSettingsMap(paths?: { global?: string; project?: string }): Record<string, unknown> {
  const globalPath = paths?.global ?? join(homedir(), ".omp", "plugins", "omp-plugins.lock.json");
  const anchor = paths?.project === undefined ? findProjectAnchor() : null;
  const projectPath = paths?.project ?? (anchor ? join(anchor, ".omp", "plugins", "omp-plugins.lock.json") : null);

  const read = (path: string): Record<string, unknown> => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(path, "utf8"));
    } catch (err) {
      if (existsSync(path)) console.error(`omp-llm-role: ${path} unreadable (${err instanceof Error ? err.message : err})`);
      return {};
    }
    if (!isRecord(parsed) || !isRecord(parsed.settings)) return {};
    const own = parsed.settings["omp-llm-role"];
    return isRecord(own) ? own : {};
  };

  const merged: Record<string, unknown> = {};
  deepMergeInto(merged, read(globalPath));
  if (projectPath) deepMergeInto(merged, read(projectPath));
  return merged;
}

/**
 * Deep-merge the raw settings map over the shipped defaults and validate the
 * result (SPEC §7). Roles whose resolved `weights` is null are dropped (explicit
 * opt-out). Never mutates the defaults. One error string per violation; an empty
 * error list means the settings are valid.
 */
export function resolveSettings(raw: Record<string, unknown>): { settings: ResolvedSettings; errors: string[] } {
  const errors: string[] = [];
  const merged = structuredClone(DEFAULT_SETTINGS) as ResolvedSettings;

  // Flat dotted keys are nested into a fresh patch object, then deep-merged over the
  // defaults — so a nested `roles: {...}` value merges per role instead of replacing
  // the whole roles map (SPEC #8: the plugin deep-merges dotted keys itself).
  const patchObj: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === "config") continue;
    setNested(patchObj, key.split("."), value);
  }
  deepMergeInto(merged as unknown as Record<string, unknown>, patchObj);
  const hatch = raw.config;
  if (hatch != null) {
    let obj: unknown = hatch;
    if (typeof hatch === "string") {
      try {
        obj = JSON.parse(hatch);
      } catch {
        errors.push("config: invalid JSON");
        obj = null;
      }
    }
    if (isRecord(obj)) deepMergeInto(merged as unknown as Record<string, unknown>, obj);
  }

  if (typeof merged.switchMargin !== "number" || !Number.isFinite(merged.switchMargin) || merged.switchMargin < 0 || merged.switchMargin > 1) {
    errors.push(`switchMargin: must be a number in [0, 1], got ${JSON.stringify(merged.switchMargin)}`);
  }
  if (typeof merged.writeFallbackChains !== "boolean") {
    errors.push(`writeFallbackChains: must be a boolean, got ${JSON.stringify(merged.writeFallbackChains)}`);
  }
  if (!Number.isInteger(merged.fallbackChainDepth) || merged.fallbackChainDepth < 0) {
    errors.push(`fallbackChainDepth: must be an integer >= 0, got ${JSON.stringify(merged.fallbackChainDepth)}`);
  }
  for (const [role, level] of Object.entries(merged.suffixes)) {
    if (!(level in SUFFIX_LEVELS)) errors.push(`suffixes.${role}: unknown thinking level ${JSON.stringify(level)}`);
  }

  for (const [name, rdef] of Object.entries(merged.roles)) {
    if (!isRecord(rdef)) {
      errors.push(`role ${name}: must be an object with weights/required, got ${JSON.stringify(rdef)}`);
      delete merged.roles[name];
      continue;
    }
    // weights: null opts the role out of the resolved set entirely.
    if (rdef.weights == null) {
      delete merged.roles[name];
      continue;
    }
    if (!isRecord(rdef.weights)) {
      errors.push(`role ${name}: weights must be an object or null, got ${JSON.stringify(rdef.weights)}`);
      delete merged.roles[name];
      continue;
    }
    let sum = 0;
    for (const [metric, w] of Object.entries(rdef.weights)) {
      if (!(metric in KNOWN_METRICS)) errors.push(`role ${name}: unknown metric "${metric}"`);
      if (typeof w !== "number" || !Number.isFinite(w) || w <= 0) errors.push(`role ${name}: weight ${metric} must be a number > 0`);
      else sum += w;
    }
    if (sum > 1.01 || sum < 0.99) errors.push(`role ${name}: weights sum ${Number(sum.toFixed(4))}`);
    const weights = rdef.weights as Record<string, number>;
    if (rdef.required === undefined) rdef.required = [];
    if (!Array.isArray(rdef.required) || rdef.required.some((k) => typeof k !== "string")) {
      errors.push(`role ${name}: required must be an array of metric names`);
      rdef.required = [];
    }
    for (const k of rdef.required) {
      // `required` is the eligibility gate (metric must be non-null to rank), not a
      // weight — the shipped defaults require `throughput` without weighting it, so
      // membership in the known-metric set is the check, not presence in `weights`.
      if (!(k in KNOWN_METRICS)) errors.push(`role ${name}: required "${k}" is not a known metric`);
    }
    if (rdef.filters !== undefined) {
      if (!isRecord(rdef.filters)) errors.push(`role ${name}: filters must be an object`);
      else if (rdef.filters.image !== undefined && typeof rdef.filters.image !== "boolean") {
        errors.push(`role ${name}: filters.image must be a boolean`);
      }
    }
    if (rdef.description === undefined) rdef.description = "";
  }

  return { settings: merged, errors };
}

