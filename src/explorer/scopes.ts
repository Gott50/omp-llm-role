/**
 * Explorer scopes: a scope is a role-config source — the user-level lock file,
 * or one project where `/project-roles` was used. Resolution lives here (not in
 * the HTTP layer) so the boot path and the dataset union cannot drift, and the
 * per-scope read mirrors the updater's exactly (project lock merged over the
 * user-level lock), so the explorer and the plugin agree.
 */

import { existsSync } from "node:fs";
import type { RoleDef } from "../engine.ts";
import { readProjectRegistry } from "../project-registry.ts";
import { PLUGIN_SETTINGS_PATH, projectLockPath, readPluginSettingsMap, resolveSettings, roleUniverse, type UniverseEntry } from "../settings.ts";

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
 * matches the resolved baseline. */
export function readScopeRoles(scope: Scope, userLockPath: string): { roles: Record<string, RoleDef>; universe: Record<string, UniverseEntry>; features: Record<string, boolean>; errors: string[] } {
  const raw = scope.kind === "user"
    ? readPluginSettingsMap({ global: scope.lockPath, project: null })
    : readPluginSettingsMap({ global: userLockPath, project: scope.lockPath });
  const { settings, errors } = resolveSettings(raw);
  return { roles: settings.roles, universe: roleUniverse(raw, settings.roles), features: settings.features, errors };
}

/** The union of every known scope's resolved roles — the roles map the ranking
 * loader must receive so a metric only one scope weights (e.g. a project-only
 * declared `bench:<id>`) is fetched, keeping a scope switch free. */
export function unionRoles(scopes: Scope[], userLockPath: string): Record<string, RoleDef> {
  const out: Record<string, RoleDef> = {};
  for (const scope of scopes) Object.assign(out, readScopeRoles(scope, userLockPath).roles);
  return out;
}
