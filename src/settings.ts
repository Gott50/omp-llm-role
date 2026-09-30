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
import { SUFFIX_LEVELS, type RoleDef } from "./engine.ts";
import { isRecord } from "./guards.ts";
export const DEFAULT_ROLES: Record<string, RoleDef> = {
  default: {
    description: "Main workhorse: strong general coding-agent quality, sane cost",
    weights: { general: 0.3221, reasoning: 0.1705, code: 0.1705, agents: 0.1137, tool_calling: 0.0947, throughput: 0.0285, price: 0.1 },
    required: ["general", "price", "throughput"],
    // `auto`, not bare: the session default is `auto` (config.yml
    // `defaultThinkingLevel`), so a bare selector runs at auto effort while
    // being priced at 1× — pinning `auto` makes the ranking price what runs.
    thinking: "auto",
  },
  smol: {
    description: "Fast lightweight model: cheap and quick, still competent",
    weights: { price: 0.3, throughput: 0.28, general: 0.2, code: 0.12, tool_calling: 0.1 },
    required: ["general", "price", "throughput"],
    thinking: "off",
  },
  slow: {
    description: "Most capable model for hard problems; cost and speed as tiebreakers",
    weights: { general: 0.26, reasoning: 0.26, code: 0.18, agents: 0.13, math: 0.08, throughput: 0.04, price: 0.05 },
    required: ["general", "price", "throughput"],
    thinking: "high",
  },
  vision: {
    description: "Image understanding: vision index dominates",
    weights: { vision: 0.4767, general: 0.1833, reasoning: 0.1375, code: 0.055, throughput: 0.0275, price: 0.12 },
    required: ["vision", "general", "price", "throughput"],
    thinking: "auto",
    filters: { image: true },
  },
  plan: {
    description: "Planning: reasoning, math, long-context coherence",
    weights: { reasoning: 0.3129, general: 0.2542, long_context: 0.1369, math: 0.1369, throughput: 0.0391, price: 0.12 },
    required: ["reasoning", "general", "price", "throughput"],
    // `auto`, not `medium`: no reachable planning candidate lists `medium` in its
    // catalog thinking[], so a `medium` pin silently writes bare (the session
    // default) — `auto` is a meta level (always appended) at the same overhead.
    thinking: "auto",
  },
  commit: {
    description: "Commit messages: cheap and fast with decent general quality",
    weights: { price: 0.35, throughput: 0.27, general: 0.28, code: 0.1 },
    required: ["general", "price", "throughput"],
    thinking: "off",
  },
  tiny: {
    description: "Background tasks (titles, memory): cheapest and fastest wins",
    weights: { price: 0.4, throughput: 0.35, general: 0.25 },
    required: ["general", "price", "throughput"],
    // `off`, like `commit`: titles/memory need no deliberation, and bare would
    // run at the session default (`auto`, ×1.857) while priced at 1×.
    thinking: "off",
  },
  task: {
    description: "Subagents: agentic + tool calling, moderate cost sensitivity",
    weights: { agents: 0.26, tool_calling: 0.18, code: 0.16, general: 0.22, throughput: 0.05, price: 0.13 },
    required: ["general", "price", "throughput"],
    // `auto` for the same reason as `default`: honest pricing of the effort
    // the session default already applies.
    thinking: "auto",
  },
  advisor: {
    description: "Advisor/watchdog: deep reasoning over long context",
    weights: { reasoning: 0.3443, general: 0.287, long_context: 0.1148, math: 0.0957, throughput: 0.0382, price: 0.12 },
    required: ["reasoning", "general", "price", "throughput"],
    // `auto`, matching `plan`: the same model (Hy4 preview) runs both roles, so
    // pricing advisor bare while plan is `auto` understated advisor by 1.857×.
    thinking: "auto",
  },
  designer: {
    description: "Design work: visual/UX judgement on image-capable models",
    weights: { general: 0.26, code: 0.10, vision: 0.18, throughput: 0.13, price: 0.15, website: 0.18 },
    required: ["general", "price", "throughput"],
    // `auto` for the same reason as `plan`: nothing in the designer pool lists
    // `medium`, and `auto` is a meta level written as-is at the same overhead.
    thinking: "auto",
    filters: { image: true },
  },
};


/** Metrics a role weight/required entry may name (SPEC §7). */
export const KNOWN_METRICS: Record<string, true> = {
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
  website: true,
  price: true,
  throughput: true,
};

/**
 * Live-session coupling (SPEC §6 session-start semantics): after the day-gated
 * session-start write, a freshly started session whose conversation is still
 * empty had its active model resolved from the pre-write config. Reapply the
 * new `default` selector to the session's active model so the user's first
 * prompt runs on the freshly ranked pick.
 */
export const ACTIVATE_DEFAULT_KEY = "activateDefaultOnEmptySession";

export type ResolvedSettings = {
  switchMargin: number;
  /**
   * Cost-side escape hatch from `switchMargin` (SPEC §7): the margin is a flat
   * band on `value`, so a role with a loose posture (small λ) can refuse a
   * switch worth up to `switchMargin/λ` $/M. When a challenger sitting inside
   * the margin undercuts the incumbent's effective price by at least this
   * fraction (0.5 = at least twice as cheap), it is adopted anyway. 0 disables
   * the override.
   */
  priceSwitchFraction: number;
  writeFallbackChains: boolean;
  fallbackChainDepth: number;
  roles: Record<string, RoleDef>;
  activateDefaultOnEmptySession: boolean;
};

export const DEFAULT_SETTINGS: ResolvedSettings = {
  switchMargin: 0.02,
  priceSwitchFraction: 0.5,
  writeFallbackChains: true,
  fallbackChainDepth: 2,
  roles: DEFAULT_ROLES,
  activateDefaultOnEmptySession: true,
};


/** Deep-merge `patch` into `target` in place; plain objects merge, everything else replaces. */
export function deepMergeInto(target: Record<string, unknown>, patch: Record<string, unknown>): void {
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
    if (key === "suffixes" || key.startsWith("suffixes.")) {
      errors.push(`${key}: suffixes moved into roles — set roles.<role>.thinking instead`);
      continue;
    }
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
  if (isRecord((merged as unknown as Record<string, unknown>).suffixes)) {
    errors.push("config: suffixes moved into roles — set roles.<role>.thinking instead");
  }

  if (typeof merged.switchMargin !== "number" || !Number.isFinite(merged.switchMargin) || merged.switchMargin < 0 || merged.switchMargin > 1) {
    errors.push(`switchMargin: must be a number in [0, 1], got ${JSON.stringify(merged.switchMargin)}`);
  }
  if (typeof merged.priceSwitchFraction !== "number" || !Number.isFinite(merged.priceSwitchFraction) || merged.priceSwitchFraction < 0 || merged.priceSwitchFraction > 1) {
    errors.push(`priceSwitchFraction: must be a number in [0, 1], got ${JSON.stringify(merged.priceSwitchFraction)}`);
  }
  if (typeof merged.writeFallbackChains !== "boolean") {
    errors.push(`writeFallbackChains: must be a boolean, got ${JSON.stringify(merged.writeFallbackChains)}`);
  }
  if (!Number.isInteger(merged.fallbackChainDepth) || merged.fallbackChainDepth < 0) {
    errors.push(`fallbackChainDepth: must be an integer >= 0, got ${JSON.stringify(merged.fallbackChainDepth)}`);
  }
  if (typeof merged.activateDefaultOnEmptySession !== "boolean") {
    errors.push(
      `${ACTIVATE_DEFAULT_KEY}: must be a boolean, got ${JSON.stringify(merged.activateDefaultOnEmptySession)}`,
    );
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
    if (rdef.thinking !== undefined && (typeof rdef.thinking !== "string" || !(rdef.thinking in SUFFIX_LEVELS))) {
      errors.push(`role ${name}: thinking must be one of ${Object.keys(SUFFIX_LEVELS).join(", ")}`);
      delete rdef.thinking;
    }
    if (rdef.lambda !== undefined) {
      if (typeof rdef.lambda !== "number" || !Number.isFinite(rdef.lambda) || rdef.lambda < 0) {
        errors.push(`role ${name}: lambda must be a number ≥ 0`);
        delete rdef.lambda;
      }
    }
    if (rdef.description === undefined) rdef.description = "";
  }

  return { settings: merged, errors };
}

