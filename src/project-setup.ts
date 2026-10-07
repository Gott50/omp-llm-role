/**
 * `/project-roles` core: a discovered project profile -> a project-scoped role
 * set (kept shipped roles, dropped ones, new fitted roles) written to the
 * project plugin settings lock file, plus the project agents for the new roles.
 *
 * Dual-runtime safe: `node:` builtins + relative `.ts` imports only, no SDK
 * import. The extension command does the LLM work (profile discovery, benchmark
 * discovery, agent authoring) and calls `setupProject`; the project-aware
 * updater (a later task) writes the project `modelRoles`.
 *
 * All-or-nothing: every check (names, metrics, weight math, the force gate, the
 * agent-file collisions) runs before any write, so a rejected plan leaves the
 * lock file and the agents dir untouched.
 */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { AGENT_NAME_RE, RESERVED_AGENT_NAMES, projectAgentsDir } from "./agent-file.ts";
import {
  applyFocusBenchmarks,
  checkWeightMath,
  createAgent,
  resolveRole,
  tokenizeArgs,
  type AgentSpec,
  type CreateAgentRequest,
  type FocusCoverage,
} from "./agent-create.ts";
import type { RoleDef, SuffixLevel } from "./engine.ts";
import { FEATURES, featureById } from "./features.ts";
import { isRecord } from "./guards.ts";
import { validateRole, writeRoleSettings } from "./role-settings.ts";
import { DEFAULT_ROLES, isKnownMetric, readPluginSettingsMap, resolveSettings, roleUniverse } from "./settings.ts";

/** One role the profile proposes: a shipped role to keep/drop, or a new role to fit. */
export type ProposedRole = {
  name: string;
  purpose: string;
  /** For a shipped role: keep (default) or drop. A new role with `keep: false` is not added. */
  keep?: boolean;
  /** Metric names the new role is ranked on (links resolved by the extension). */
  benchmarks?: string[];
  thinking?: SuffixLevel;
  tools?: string[];
  /** The architect's output, when the extension ran it. */
  spec?: AgentSpec;
};

/** The discovered project usecase. */
export type ProjectProfile = {
  summary: string;
  domain: string;
  primaryWork: string[];
  stack: string[];
  needs: string[];
  roles: ProposedRole[];
};

export type SetupProjectOpts = {
  /** omp's project dir: `<cwd>/.omp`. */
  projectDir: string;
  /** The project plugin settings lock file (`<projectDir>/plugins/omp-plugins.lock.json`). */
  lockPath: string;
  /** The project `config.yml` (`<projectDir>/config.yml`); written by the project-aware updater. */
  configPath: string;
  dryRun: boolean;
  force: boolean;
  yes: boolean;
  coverage?: FocusCoverage;
  /**
   * Capability flags to author on every new project role (`--feature`). Passed
   * through to each planned request, so `resolveRole` sets `def.features` and
   * the flag is persisted (not the knobs it expands to).
   */
  features?: Record<string, boolean>;
  /** Role validator; defaults to the plugin's own `validateRole`. */
  validate?: (name: string, def: RoleDef) => string[];
};

export type SetupProjectResult =
  | {
      ok: true;
      kept: string[];
      dropped: string[];
      added: string[];
      /** The project's effective role set (kept shipped defs + new defs). */
      roles: Record<string, RoleDef>;
      /** Archetype id each new role was fitted to, keyed by role name. */
      archetypes: Record<string, string>;
      /** The project agent `.md` paths (planned on a dry run, written otherwise). */
      agents: string[];
      warnings: string[];
    }
  | { ok: false; errors: string[] };

/** True when the project lock file already carries a project role config. */
function hasProjectRoleConfig(lockPath: string): boolean {
  const raw = readPluginSettingsMap({ global: lockPath, project: null });
  const nested = raw.roles;
  if (isRecord(nested) && Object.keys(nested).length > 0) return true;
  return Object.keys(raw).some((key) => key.startsWith("roles."));
}

export function setupProject(profile: ProjectProfile, opts: SetupProjectOpts): SetupProjectResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Validate the profile's role names.
  const seen = new Set<string>();
  for (const role of profile.roles) {
    const name = role.name.trim();
    if (!AGENT_NAME_RE.test(name)) errors.push(`role "${name}" must match [A-Za-z0-9_-]+`);
    else if (name.toLowerCase() in RESERVED_AGENT_NAMES) errors.push(`role "${name}" is reserved by omp (main/sub are session sentinels)`);
    if (seen.has(name)) errors.push(`role "${name}" is listed twice`);
    seen.add(name);
  }
  if (errors.length > 0) return { ok: false, errors };

  // 2. Resolve the role set: shipped roles default to keep, `keep: false` drops
  //    one, every other name is a new role fitted from the archetype table.
  const wanted = new Set(Object.keys(DEFAULT_ROLES));
  const dropped: string[] = [];
  const newRoles: ProposedRole[] = [];
  for (const role of profile.roles) {
    const name = role.name.trim();
    const shipped = name in DEFAULT_ROLES;
    if (role.keep === false) {
      if (shipped) {
        wanted.delete(name);
        dropped.push(name);
      }
      continue;
    }
    if (shipped) continue;
    wanted.add(name);
    newRoles.push(role);
  }
  const kept = Object.keys(DEFAULT_ROLES).filter((name) => wanted.has(name));

  // Fit and validate each new role's weights.
  const validate = opts.validate ?? validateRole;
  const plans: { name: string; request: CreateAgentRequest; def: RoleDef; archetype: string }[] = [];
  for (const role of newRoles) {
    const name = role.name.trim();
    if (role.purpose.trim() === "") {
      errors.push(`role ${name}: purpose is required`);
      continue;
    }
    for (const metric of role.benchmarks ?? []) {
      if (!isKnownMetric(metric)) errors.push(`role ${name}: unknown metric "${metric}"`);
    }
    const request: CreateAgentRequest = {
      name,
      purpose: role.purpose,
      thinking: role.thinking,
      tools: role.tools,
      spec: role.spec,
      features: opts.features,
      extraBenchmarks: role.benchmarks ?? [],
      coverage: opts.coverage,
      scope: "project",
      projectAnchor: dirname(opts.projectDir),
      force: opts.force,
      dryRun: opts.dryRun,
      lockPath: opts.lockPath,
    };
    const resolved = resolveRole(request);
    if ("errors" in resolved) {
      errors.push(...resolved.errors);
      continue;
    }
    const bench = applyFocusBenchmarks(resolved.def.weights, request.extraBenchmarks ?? [], opts.coverage);
    resolved.def.weights = bench.weights;
    errors.push(...checkWeightMath(name, resolved.def.weights, resolved.def.required));
    errors.push(...validate(name, resolved.def));
    if (bench.dropped.length > 0) warnings.push(`role ${name}: focus benchmarks beyond the cap were dropped: ${bench.dropped.join(", ")}`);
    plans.push({ name, request, def: resolved.def, archetype: resolved.archetype.id });
  }
  if (errors.length > 0) return { ok: false, errors };

  // 3. The force gate and the agent-file collisions: every check before any write.
  if (hasProjectRoleConfig(opts.lockPath) && !opts.force) {
    errors.push(`${opts.lockPath} already has a project role config — pass --force to overwrite`);
  }
  const agentsDir = projectAgentsDir(dirname(opts.projectDir));
  const agentPaths = plans.map((plan) => join(agentsDir, `${plan.name}.md`));
  for (const agentPath of agentPaths) {
    if (existsSync(agentPath) && !opts.force) errors.push(`${agentPath} already exists — pass --force to overwrite`);
  }
  if (errors.length > 0) return { ok: false, errors };

  // 4. The project role set: `enabled: false` for every universe role the project
  //    does not want, plus the new roles' defs.
  const projectRaw = readPluginSettingsMap({ global: opts.lockPath, project: null });
  const { settings: projectResolved } = resolveSettings(projectRaw);
  const universe = roleUniverse(projectRaw, projectResolved.roles);
  const dirty: Record<string, RoleDef> = {};
  for (const name of Object.keys(universe)) {
    if (wanted.has(name)) continue;
    dirty[name] = { ...universe[name].def, enabled: false };
  }
  for (const plan of plans) dirty[plan.name] = plan.def;

  const roles: Record<string, RoleDef> = {};
  for (const name of kept) roles[name] = DEFAULT_ROLES[name];
  for (const plan of plans) roles[plan.name] = plan.def;

  const added = plans.map((plan) => plan.name);
  const archetypes: Record<string, string> = {};
  for (const plan of plans) archetypes[plan.name] = plan.archetype;
  if (opts.dryRun) return { ok: true, kept, dropped, added, roles, archetypes, agents: agentPaths, warnings };

  // 5. Write the project plugin settings, then create the project agents.
  if (Object.keys(dirty).length > 0) {
    const written = writeRoleSettings(opts.lockPath, dirty, { dryRun: false });
    if (!written.ok) return { ok: false, errors: written.errors };
  }
  for (const plan of plans) {
    const result = createAgent({ ...plan.request, dryRun: false });
    if (!result.ok) return { ok: false, errors: result.errors };
  }

  return { ok: true, kept, dropped, added, roles, archetypes, agents: agentPaths, warnings };
}

// ---------------------------------------------------------------------------
// `/project-roles` argument parsing and the plan report, shared by the omp
// command (which receives the raw text typed after the command name) and the
// tests (which pass the same raw text). One parser, so the two cannot drift.
// ---------------------------------------------------------------------------

export const PROJECT_ROLES_USAGE = [
  "Usage: /project-roles [options]",
  "",
  "  Discovers the project's usecase from its own artifacts (README, package.json,",
  "  AGENTS.md, docs, git log, file tree), proposes a project-scoped role set, and",
  "  applies it: the project plugin settings, the new roles' agents, and the",
  "  project's modelRoles in <cwd>/.omp/config.yml.",
  "",
  "  --purpose <text>   override the discovered usecase (one sentence)",
  "  --roles <spec>     override the role set: comma-separated entries;",
  "                     `-name` drops a shipped role, `name` keeps/adds one,",
  "                     `name=purpose` adds a new role with that purpose",
  "  --feature <id,...> capability flag(s) to author on every new project role",
  "                     (see /create-agent --list-features); repeatable, merged",
  "  --force            overwrite an existing project role config",
  "  --yes              apply without prompting",
  "  --dry-run          print the plan without writing",
  "  --json             print the result as JSON",
].join("\n");

/**
 * Parse a `--roles` spec: comma-separated entries. `-name` drops a shipped role;
 * `name` keeps a shipped role (or adds a new one, purpose defaulting to the
 * name); `name=purpose` adds a new role with that purpose. Returns the proposed
 * roles, or an error string.
 */
export function parseRolesSpec(spec: string): ProposedRole[] | string {
  const roles: ProposedRole[] = [];
  for (const raw of spec.split(",")) {
    const entry = raw.trim();
    if (entry === "") continue;
    if (entry.startsWith("-")) {
      const name = entry.slice(1).trim();
      if (name === "") return `--roles: "-" needs a role name`;
      roles.push({ name, purpose: "", keep: false });
      continue;
    }
    const eq = entry.indexOf("=");
    if (eq === -1) {
      roles.push({ name: entry, purpose: entry in DEFAULT_ROLES ? "" : entry });
      continue;
    }
    const name = entry.slice(0, eq).trim();
    const purpose = entry.slice(eq + 1).trim();
    if (name === "" || purpose === "") return `--roles: expected name=purpose, got "${entry}"`;
    roles.push({ name, purpose });
  }
  if (roles.length === 0) return `--roles: no roles given`;
  return roles;
}

export type ParsedProjectRolesArgs =
  | { ok: true; purpose: string | undefined; roles: ProposedRole[] | undefined; features: Record<string, boolean> | undefined; force: boolean; yes: boolean; dryRun: boolean; json: boolean; help: boolean }
  | { ok: false; error: string };

/** Parse the raw text after `/project-roles` (tokenized here, so the command and
 * the tests share one parser). */
export function parseProjectRolesArgs(raw: string): ParsedProjectRolesArgs {
  const argv = tokenizeArgs(raw);
  let purpose: string | undefined;
  let roles: ProposedRole[] | undefined;
  let features: Record<string, boolean> | undefined;
  let force = false;
  let yes = false;
  let dryRun = false;
  let json = false;
  let help = false;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--help" || flag === "-h") {
      help = true;
      continue;
    }
    if (flag === "--force") {
      force = true;
      continue;
    }
    if (flag === "--yes") {
      yes = true;
      continue;
    }
    if (flag === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (flag === "--json") {
      json = true;
      continue;
    }
    if (flag !== "--purpose" && flag !== "--roles" && flag !== "--feature") return { ok: false, error: `unknown flag "${flag}"\n\n${PROJECT_ROLES_USAGE}` };
    const value = argv[++i];
    if (value === undefined) return { ok: false, error: `${flag} requires a value\n\n${PROJECT_ROLES_USAGE}` };
    if (flag === "--purpose") purpose = value;
    else if (flag === "--feature") {
      const ids = value.split(",").map((token) => token.trim()).filter((token) => token.length > 0);
      if (ids.length === 0) return { ok: false, error: `--feature: no capability id given\n\n${PROJECT_ROLES_USAGE}` };
      const merged = features ?? {};
      for (const id of ids) {
        if (featureById(id) === null) {
          return { ok: false, error: `--feature: unknown capability "${id}" — one of ${FEATURES.map((f) => f.id).join(", ")}\n\n${PROJECT_ROLES_USAGE}` };
        }
        merged[id] = true;
      }
      features = merged;
    } else {
      const parsed = parseRolesSpec(value);
      if (typeof parsed === "string") return { ok: false, error: `${parsed}\n\n${PROJECT_ROLES_USAGE}` };
      roles = parsed;
    }
  }
  return { ok: true, purpose, roles, features, force, yes, dryRun, json, help };
}

/** Apply the `--purpose`/`--roles` overrides to a discovered profile. */
export function applyProfileOverrides(profile: ProjectProfile, over: { purpose?: string; roles?: ProposedRole[] }): ProjectProfile {
  return {
    ...profile,
    ...(over.purpose !== undefined ? { summary: over.purpose } : {}),
    ...(over.roles !== undefined ? { roles: over.roles } : {}),
  };
}

/** The human-readable plan for a `/project-roles` run. `topPicks` maps a new
 * role name to its ranked leader (computed by the extension from the ranking
 * universe); `warnings` are the divergence/coverage notes. */
export function formatProjectRolesReport(
  profile: ProjectProfile,
  result: Extract<SetupProjectResult, { ok: true }>,
  opts: { topPicks?: Record<string, string>; warnings?: readonly string[] } = {},
): string {
  const lines: string[] = ["project-roles: plan"];
  lines.push(`  kept:    ${result.kept.join(", ") || "(none)"}`);
  lines.push(`  dropped: ${result.dropped.join(", ") || "(none)"}`);
  lines.push(`  added:   ${result.added.join(", ") || "(none)"}`);
  for (const name of result.added) {
    const def = result.roles[name];
    const proposed = profile.roles.find((role) => role.name.trim() === name);
    const weights = Object.entries(def.weights).map(([metric, weight]) => `${metric}=${weight}`).join(", ");
    const focus = proposed?.benchmarks !== undefined && proposed.benchmarks.length > 0 ? proposed.benchmarks.join(", ") : "(archetype default)";
    const top = opts.topPicks?.[name];
    lines.push(`  @${name} [${result.archetypes[name] ?? "?"}]`);
    lines.push(`    weights: ${weights}`);
    lines.push(`    focus:   ${focus}`);
    const features = Object.entries(def.features ?? {});
    if (features.length > 0) lines.push(`    features: ${features.map(([id, on]) => `${id}=${on}`).join(",")}`);
    if (top !== undefined) lines.push(`    top pick: ${top}`);
  }
  for (const warning of opts.warnings ?? []) lines.push(`  warning: ${warning}`);
  for (const warning of result.warnings) lines.push(`  warning: ${warning}`);
  return lines.join("\n");
}
