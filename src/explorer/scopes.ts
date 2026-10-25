/**
 * Explorer scopes: a scope is a role-config source — the user-level lock file,
 * or one project where `/project-roles` was used. Resolution lives here (not in
 * the HTTP layer) so the boot path and the dataset union cannot drift, and the
 * per-scope read mirrors the updater's exactly (project lock merged over the
 * user-level lock), so the explorer and the plugin agree.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseConfig } from "../config-edit.ts";
import type { RoleDef, SelectionMode } from "../engine.ts";
import { readProjectRegistry } from "../project-registry.ts";
import { DEFAULT_SETTINGS, PLUGIN_SETTINGS_PATH, globalSettingsOf, projectLockPath, readPluginSettingsMap, resolveSettings, roleUniverse, type GlobalSettings, type UniverseEntry } from "../settings.ts";

export type ScopeKind = "user" | "project";

export type Scope = {
  /** Stable across requests: `user`, or `project:<root>`. */
  id: string;
  /** Human label: `user-level`, or the project root path. */
  label: string;
  kind: ScopeKind;
  /** The lock file this scope reads and Export writes. */
  lockPath: string;
  /** Whether the lock file exists (the user scope is always available). */
  present: boolean;
  /** Project root (project scopes only). */
  root?: string;
};

/** A scope's GLOBAL model-selection rule: the resolved `selection` mode and its
 * `qualityFloor`. A role's own `selection`/`qualityFloor` overrides it. */
export type ScopeSelection = { mode: SelectionMode; qualityFloor: number };

/** A scope's global (non-role) settings, in the three shapes the Settings panel
 * needs: what the lock file authors, what that resolves to, and the shipped
 * defaults to reset to. */
export type ScopeGlobalSettings = {
  /** The scope's AUTHORED global keys, verbatim from the lock file (flat dotted
   *  keys included, e.g. `tokenProfile.inputTokens`). */
  authored: Record<string, unknown>;
  /** The scope's RESOLVED global settings (shipped defaults + authored). */
  resolved: GlobalSettings;
  /** The shipped defaults, so the panel can show and reset to them. */
  defaults: GlobalSettings;
};

/** The raw map's global (non-`roles`) keys, verbatim: the flat dotted keys the
 *  lock file carries (`tokenProfile.inputTokens`, `features.costCap`) stay flat,
 *  so the panel renders exactly what is set. */
function authoredGlobals(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === "roles" || key.startsWith("roles.")) continue;
    out[key] = value;
  }
  return out;
}

export type ScopeInputs = {
  /** The user-level lock file (the user scope's read/export target). */
  userLockPath?: string;
  /** Session cwd; its project joins the list when it has a project role config. */
  cwd: string;
  /** Agent dir holding the project registry (default: `agentDir()`). */
  registryDir?: string;
};

function projectScope(root: string): Scope {
  const lockPath = projectLockPath(root);
  return { id: `project:${root}`, label: root, kind: "project", lockPath, present: existsSync(lockPath), root };
}

/**
 * Every known scope: the user-level scope, the registry's projects (most
 * recently used first), and the session's project when it has a project role
 * config — included immediately, before the registry has recorded it.
 *
 * The session-project test is the updater's own `resolveProjectDir` test (a
 * project lock with a non-empty `omp-llm-role` settings entry), so the
 * explorer's "session project" and the updater's project mode agree.
 */
export function resolveScopes(inputs: ScopeInputs): Scope[] {
  const userLockPath = inputs.userLockPath ?? PLUGIN_SETTINGS_PATH;
  const byId = new Map<string, Scope>();
  // The user-level scope is always available: Export creates the lock file.
  byId.set("user", { id: "user", label: "user-level", kind: "user", lockPath: userLockPath, present: true });
  const entries = [...readProjectRegistry(inputs.registryDir)].sort((a, b) => (a.lastUsed < b.lastUsed ? 1 : a.lastUsed > b.lastUsed ? -1 : 0));
  for (const entry of entries) {
    const scope = projectScope(entry.root);
    if (!byId.has(scope.id)) byId.set(scope.id, scope);
  }
  if (Object.keys(readPluginSettingsMap({ global: projectLockPath(inputs.cwd), project: null })).length > 0) {
    const scope = projectScope(inputs.cwd);
    if (!byId.has(scope.id)) byId.set(scope.id, scope);
  }
  return [...byId.values()];
}

/** The default active scope: the session's project when present, else user-level. */
export function defaultScopeId(scopes: Scope[], cwd: string): string {
  const project = scopes.find((s) => s.kind === "project" && s.root === cwd && s.present);
  if (project) return project.id;
  return scopes.find((s) => s.kind === "user")?.id ?? scopes[0]?.id ?? "user";
}

/** The scope a request should use: the requested id when known and present,
 * else the default. */
export function resolveScope(scopes: Scope[], requestedId: string | null, cwd: string): Scope {
  const found = requestedId === null ? undefined : scopes.find((s) => s.id === requestedId && s.present);
  if (found) return found;
  const fallback = defaultScopeId(scopes, cwd);
  return scopes.find((s) => s.id === fallback) ?? scopes[0];
}

/** Read one scope's roles and universe. A project scope merges the project lock
 * over the user-level lock — the exact read the updater performs.
 *
 * `roles` is the EFFECTIVE def (the authored def with the enabled capability
 * flags' recommended knobs filled in); `universe[role].def` is the AUTHORED def
 * (flags + explicit keys only) — the def the explorer edits and exports.
 * `features` is the scope's GLOBAL capability flags (`features.<id>`), which the
 * explorer's rank/explain handlers expand a posted def with so the preview
 * matches the resolved baseline. `selection` is the scope's GLOBAL
 * model-selection rule (`selection` + `qualityFloor`), which a role's own
 * `selection`/`qualityFloor` overrides. `settings` is the scope's global
 * settings in the three shapes the Settings panel needs (authored / resolved /
 * defaults), and `raw` is the merged raw settings map the updater itself reads
 * (the project lock deep-merged over the user-level lock). */
export function readScopeRoles(scope: Scope, userLockPath: string): { roles: Record<string, RoleDef>; universe: Record<string, UniverseEntry>; features: Record<string, boolean>; selection: ScopeSelection; settings: ScopeGlobalSettings; raw: Record<string, unknown>; errors: string[] } {
  const raw = scope.kind === "user"
    ? readPluginSettingsMap({ global: scope.lockPath, project: null })
    : readPluginSettingsMap({ global: userLockPath, project: scope.lockPath });
  const { settings, errors } = resolveSettings(raw);
  return {
    roles: settings.roles,
    universe: roleUniverse(raw, settings.roles),
    features: settings.features,
    selection: { mode: settings.selection, qualityFloor: settings.qualityFloor },
    settings: {
      authored: authoredGlobals(raw),
      resolved: globalSettingsOf(settings),
      defaults: globalSettingsOf(DEFAULT_SETTINGS),
    },
    raw,
    errors,
  };
}

/** The agent dir a scope's `config.yml`, state and history live in: the
 * project's `<root>/.omp`, or the user-level agent dir. The same resolution
 * `runUpdater` performs (`resolveProjectDir() ?? agentDir()`). */
export function scopeDir(scope: Scope, userAgentDir: string): string {
  return scope.kind === "project" && scope.root !== undefined ? join(scope.root, ".omp") : userAgentDir;
}

/** The scope's `config.yml` current selectors (the hysteresis incumbent). A
 * missing or unparseable config yields an empty map, so every role reads
 * `no-current` rather than the read throwing. */
export function readScopeConfig(scope: Scope, userAgentDir: string): { modelRoles: Record<string, string> } {
  let text: string;
  try {
    text = readFileSync(join(scopeDir(scope, userAgentDir), "config.yml"), "utf8");
  } catch {
    return { modelRoles: {} };
  }
  try {
    return { modelRoles: parseConfig(text).modelRoles };
  } catch {
    return { modelRoles: {} };
  }
}

/** The union of every known scope's resolved roles — the roles map the ranking
 * loader must receive so a metric only one scope weights (e.g. a project-only
 * declared `bench:<id>`) is fetched, keeping a scope switch free. */
export function unionRoles(scopes: Scope[], userLockPath: string): Record<string, RoleDef> {
  const out: Record<string, RoleDef> = {};
  for (const scope of scopes) Object.assign(out, readScopeRoles(scope, userLockPath).roles);
  return out;
}
