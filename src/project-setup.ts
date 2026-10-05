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
  type AgentSpec,
  type CreateAgentRequest,
  type FocusCoverage,
} from "./agent-create.ts";
import type { RoleDef, SuffixLevel } from "./engine.ts";
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
  const plans: { name: string; request: CreateAgentRequest; def: RoleDef }[] = [];
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
    plans.push({ name, request, def: resolved.def });
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
  if (opts.dryRun) return { ok: true, kept, dropped, added, roles, agents: agentPaths, warnings };

  // 5. Write the project plugin settings, then create the project agents.
  if (Object.keys(dirty).length > 0) {
    const written = writeRoleSettings(opts.lockPath, dirty, { dryRun: false });
    if (!written.ok) return { ok: false, errors: written.errors };
  }
  for (const plan of plans) {
    const result = createAgent({ ...plan.request, dryRun: false });
    if (!result.ok) return { ok: false, errors: result.errors };
  }

  return { ok: true, kept, dropped, added, roles, agents: agentPaths, warnings };
}
