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

/** User-level plugin settings lock file (the explorer's read/export target and
 * the default source for `readPluginSettingsMap`). */
export const PLUGIN_SETTINGS_PATH = join(homedir(), ".omp", "plugins", "omp-plugins.lock.json");

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
    // 2026-09-30 rebalance. Measured on the 2026-09-30 cache (advisor-eligible
    // pool n=38): `long_context` covered 44.7% and `math` 76.3% of the pool, and
    // a missing weighted metric used to score 0 while still occupying its share
    // of the (1 − w_price) denominator — a coverage penalty, not a quality
    // signal. `math` is dropped (collinear with reasoning, r 0.759, and a
    // lottery at 76% coverage); `long_context` is kept (the most independent
    // capability axis, r 0.739/0.767 with reasoning/general) and is now
    // capability-filled at 0.195 like `website` (src/engine.ts CAPABILITY_FILL),
    // so its 44.7% coverage no longer penalizes. `reasoning`↔`general` stay
    // collinear (r 0.972) but the independent axes now carry more. `price` is
    // raised to 0.20 (λ 0.0125) because the advisor fires on every primary turn
    // *and* every `task` subagent turn (config.yml task.agentAdvisor.task: on),
    // so spend is ~2× a per-turn count; `throughput` is raised to 0.1049 because
    // `syncBacklog: "1"` lets a slow advisor stall the primary up to 30s.
    // Non-price weights sum to 0.80 = 1 − price, as the (w/qW) blend requires.
    weights: { reasoning: 0.3498, general: 0.2449, long_context: 0.1004, price: 0.2, throughput: 0.1049 },
    required: ["reasoning", "general", "price", "throughput"],
    // `auto`, matching `plan`: the same model (Hy4 preview) runs both roles, so
    // pricing advisor bare while plan is `auto` understated advisor by 1.857×.
    thinking: "auto",
  },
  designer: {
    description: "Design work: visual/UX judgement on image-capable models",
    // Opt-in: the only role that is not an omp built-in id, and the only one
    // whose ranking needs a role-exclusive source (Design Arena `website`). Off
    // by default so a stock run ranks the nine built-in roles and fetches only
    // their sources; enable with `roles.designer.enabled=true` (the plugin then
    // ranks it and fetches Design Arena). The shipped `agents/designer.md` is
    // discovered from the plugin's extension root regardless; its
    // `model: "@designer, @default"` chain falls through to `@default` when the
    // role is disabled (an unresolved `@x` is a literal pattern, so a bare
    // `@designer` would hard-fail — the chain is what keeps the agent spawnable).
    enabled: false,
    weights: { general: 0.26, code: 0.10, vision: 0.18, throughput: 0.13, price: 0.15, website: 0.18 },
    required: ["general", "price", "throughput"],
    // `auto` for the same reason as `plan`: nothing in the designer pool lists
    // `medium`, and `auto` is a meta level written as-is at the same overhead.
    thinking: "auto",
    filters: { image: true },
  },
};

/**
 * Agents shipped in `agents/` (one `.md` per name). Each is opt-in: the plugin
 * keeps it in `task.disabledAgents` unless its same-named role is in the
 * resolved set — the shipped `designer` role is `enabled: false`, so the
 * `designer` agent is disabled until `roles.designer.enabled=true`. A test
 * asserts this list matches the shipped `agents/*.md` files.
 */
export const SHIPPED_AGENTS: string[] = ["designer"];


/**
 * Metrics a role weight/required entry may name (SPEC §7).
 *
 * The six raw llm-stats benchmark pass rates (`gpqa`, `aime`, `swe_bench`,
 * `arc_agi`, `terminal_bench`, `tau_bench`) are weightable too: they are already
 * in `Model.metrics` and scored by `cardinalMetric` (gpqa chance-anchored at
 * 0.25, the rest raw 0-1). They are sparse (gpqa 62.5%, aime 30.5%, swe_bench
 * 29.0%, arc_agi/terminal_bench/tau_bench ~5-6% of the field), so weight them as
 * differentiators, never as `required` gates — a missing weighted metric
 * contributes 0 and turns q into a coverage score.
 */
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
  writing: true,
  gpqa: true,
  aime: true,
  swe_bench: true,
  arc_agi: true,
  terminal_bench: true,
  tau_bench: true,
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

/** One row of the plugin's settings schema (omp's `PluginSettingSchema`): the
 *  flat, dotted key set omp's `/settings` Plugins tab renders and writes. */
export type PluginSettingSchema = {
  type: "string" | "number" | "boolean" | "enum";
  description?: string;
  default?: string | number | boolean;
  min?: number;
  max?: number;
  step?: number;
  values?: string[];
};

/** The plugin's settings schema, derived from the shipped defaults — the single
 *  source of truth for package.json `omp.settings` (asserted by a test). */
export function deriveSettingsSchema(): Record<string, PluginSettingSchema> {
  const schema: Record<string, PluginSettingSchema> = {
    switchMargin: {
      type: "number",
      description: "Value margin a challenger must beat the incumbent by before switching",
      default: DEFAULT_SETTINGS.switchMargin,
      min: 0,
      max: 1,
      step: 0.001,
    },
    priceSwitchFraction: {
      type: "number",
      description: "Adopt a challenger inside the margin when it is at least this fraction cheaper (0 disables)",
      default: DEFAULT_SETTINGS.priceSwitchFraction,
      min: 0,
      max: 1,
      step: 0.001,
    },
    writeFallbackChains: {
      type: "boolean",
      description: "Write per-role fallback chains into config.yml",
      default: DEFAULT_SETTINGS.writeFallbackChains,
    },
    fallbackChainDepth: {
      type: "number",
      description: "Number of fallback models per role chain",
      default: DEFAULT_SETTINGS.fallbackChainDepth,
      min: 0,
      step: 1,
    },
    activateDefaultOnEmptySession: {
      type: "boolean",
      description: "Reapply the new default selector to an empty session's active model",
      default: DEFAULT_SETTINGS.activateDefaultOnEmptySession,
    },
  };
  for (const [name, def] of Object.entries(DEFAULT_ROLES)) {
    const p = `roles.${name}`;
    schema[`${p}.enabled`] = {
      type: "boolean",
      description: `Enable the ${name} role`,
      default: def.enabled ?? true,
    };
    schema[`${p}.description`] = {
      type: "string",
      description: `Description of the ${name} role`,
      default: def.description,
    };
    schema[`${p}.thinking`] = {
      type: "enum",
      description: `Thinking level appended to the ${name} selector`,
      default: def.thinking ?? "auto",
      values: Object.keys(SUFFIX_LEVELS),
    };
    schema[`${p}.required`] = {
      type: "string",
      description: `Comma-separated metrics a model must have to rank for ${name}`,
      default: def.required.join(","),
    };
    schema[`${p}.filters.image`] = {
      type: "boolean",
      description: `Restrict the ${name} pool to image-capable models`,
      default: def.filters?.image ?? false,
    };
    schema[`${p}.lambda`] = {
      type: "number",
      description: `Explicit λ ($ per quality point) override for ${name}`,
      min: 0,
    };
    for (const [metric, w] of Object.entries(def.weights)) {
      schema[`${p}.weights.${metric}`] = {
        type: "number",
        description: `Weight of ${metric} in the ${name} quality composite`,
        default: w,
        min: 0,
        max: 1,
        step: 0.001,
      };
    }
  }
  return schema;
}


/** Deep-merge `patch` into `target` in place; plain objects merge, everything else replaces. */
export function deepMergeInto(target: Record<string, unknown>, patch: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(patch)) {
    if (isRecord(v) && isRecord(target[k])) deepMergeInto(target[k], v);
    else target[k] = v;
  }
}

/** Set `value` at a dotted path, creating intermediate plain objects. A record
 * value deep-merges into an existing record leaf instead of replacing it, so a
 * flat dotted key (`roles.review.weights.general`) and a nested object
 * (`roles: { review: {...} }`) in the same settings map both survive. */
function setNested(target: Record<string, unknown>, path: string[], value: unknown): void {
  let node = target;
  for (let i = 0; i < path.length - 1; i++) {
    const k = path[i];
    // isRecord just checked (or we created) this node; the cast restates it for TS.
    if (!isRecord(node[k])) node[k] = {};
    node = node[k] as Record<string, unknown>;
  }
  const leaf = path[path.length - 1];
  if (isRecord(value) && isRecord(node[leaf])) deepMergeInto(node[leaf] as Record<string, unknown>, value);
  else node[leaf] = value;
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
  const globalPath = paths?.global ?? PLUGIN_SETTINGS_PATH;
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
 * The merge half of `resolveSettings`: shipped defaults + flat dotted keys +
 * nested objects + the `config` escape hatch, with no validation and no pruning.
 * Disabled roles (`enabled: false` / `weights: null`) survive in `roles`;
 * `resolveSettings` prunes them after validating, while `roleUniverse` needs them
 * to describe every role the plugin knows.
 */
function mergeRawSettings(raw: Record<string, unknown>): { merged: ResolvedSettings; errors: string[] } {
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
  return { merged, errors };
}

/**
 * Deep-merge the raw settings map over the shipped defaults and validate the
 * result (SPEC §7). Roles whose resolved `weights` is null are dropped (explicit
 * opt-out). Never mutates the defaults. One error string per violation; an empty
 * error list means the settings are valid.
 */
export function resolveSettings(raw: Record<string, unknown>): { settings: ResolvedSettings; errors: string[] } {
  const { merged, errors } = mergeRawSettings(raw);

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
    if (rdef.enabled !== undefined && typeof rdef.enabled !== "boolean") {
      errors.push(`role ${name}: enabled must be a boolean, got ${JSON.stringify(rdef.enabled)}`);
    }
    if (rdef.locked !== undefined && typeof rdef.locked !== "boolean") {
      errors.push(`role ${name}: locked must be a boolean, got ${JSON.stringify(rdef.locked)}`);
    }
    // enabled: false opts the role out of the resolved set entirely (shipped
    // opt-in roles); a user override to true re-enables it.
    if (rdef.enabled === false) {
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
    // `required` arrives as an array from the plugin's own write path, but omp's
    // `/settings` Plugins tab writes the flat string form (`"general, price"`).
    // Coerce the comma-separated string to a trimmed, empty-dropped array before
    // the array/known-metric validation below.
    const requiredRaw: unknown = rdef.required;
    if (typeof requiredRaw === "string") {
      rdef.required = requiredRaw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }
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

export type RoleKind = "default" | "plugin" | "user";

export type UniverseEntry = { kind: RoleKind; enabled: boolean; locked: boolean; def: RoleDef };

/** Every role the plugin knows: shipped DEFAULT_ROLES (disabled included) union
 *  roles present in the raw plugin settings map. Never mutates inputs. */
export function roleUniverse(raw: Record<string, unknown>, resolved: Record<string, RoleDef>): Record<string, UniverseEntry> {
  const { merged } = mergeRawSettings(raw);
  const rolesRaw = (merged as unknown as Record<string, unknown>).roles;
  const mergedRoles = isRecord(rolesRaw) ? (rolesRaw as Record<string, unknown>) : {};

  const entry = (name: string): UniverseEntry => {
    // Effective def = shipped default merged with the raw overrides (the merge
    // half never prunes disabled roles). A malformed override falls back to the
    // shipped def so the UI always has a def to render.
    const rawDef = mergedRoles[name];
    const def = (isRecord(rawDef) ? rawDef : DEFAULT_ROLES[name] ?? { description: "", weights: {}, required: [] }) as RoleDef;
    const enabled = name in resolved;
    // Provenance, not state: a shipped role is `default` while enabled and
    // `plugin` once it ships opt-in/disabled; anything else is lock-file-only.
    const kind: RoleKind = !(name in DEFAULT_ROLES) ? "user" : enabled ? "default" : "plugin";
    return { kind, enabled, locked: (def as RoleDef & { locked?: boolean }).locked === true, def };
  };

  // Insertion order: DEFAULT_ROLES order first, then lock-file-only names in
  // first-seen order (merged.roles already leads with the shipped keys).
  const out: Record<string, UniverseEntry> = {};
  for (const name of Object.keys(DEFAULT_ROLES)) out[name] = entry(name);
  for (const name of Object.keys(mergedRoles)) if (!(name in out)) out[name] = entry(name);
  return out;
}

