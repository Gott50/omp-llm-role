/**
 * The one validated write path for role definitions in the plugin settings lock
 * file (`~/.omp/plugins/omp-plugins.lock.json` -> `settings["omp-llm-role"]`).
 *
 * `omp plugin config set` stores every value as a string, and the plugin's
 * validator rejects a string weight/required/boolean, so role settings must be
 * written as typed JSON. The explorer's Export handler and the
 * `src/cli/create-role.ts` CLI both go through here, so a role created either
 * way is byte-identical and validated by the plugin's own resolver.
 */

import { copyFileSync, existsSync, readFileSync, statSync } from "node:fs";
import { writeConfigAtomic } from "./config-edit.ts";
import type { RoleDef } from "./engine.ts";
import { isRecord } from "./guards.ts";
import { resolveSettings } from "./settings.ts";

/** Validate one role def through the plugin's own validator (resolveSettings
 * clones its input, so this is safe per call). Errors are returned verbatim. */
export function validateRole(name: string, def: RoleDef): string[] {
  return resolveSettings({ roles: { [name]: def } }).errors;
}

/** Merge dirty role defs into a parsed lock file, preserving `plugins` and every
 * sibling settings key. Returns the new lock object or a refusal.
 *
 * Roles are written as flat dotted keys (`roles.<name>.weights.<metric>`) because
 * omp's `/settings` Plugins tab shallow-merges the settings object and does not
 * flatten nested objects — a nested `roles` object would render as schema
 * defaults. A pre-existing nested entry for a dirty role is deleted so an older
 * lock file is normalized on the next write. */
export function mergeExport(existing: unknown, dirty: Record<string, RoleDef>): { lock: object } | { error: string } {
  if (!isRecord(existing)) return { error: "lock file root is not an object" };
  const lock = structuredClone(existing);
  if (!isRecord(lock.settings)) lock.settings = {};
  const settings = lock.settings as Record<string, unknown>;
  if (!isRecord(settings["omp-llm-role"])) settings["omp-llm-role"] = {};
  const plugin = settings["omp-llm-role"] as Record<string, unknown>;

  for (const [name, def] of Object.entries(dirty)) {
    // Normalize: drop any nested entry left by an older write path.
    const nested = plugin.roles;
    if (isRecord(nested)) {
      delete nested[name];
      if (Object.keys(nested).length === 0) delete plugin.roles;
    }

    // An Export means "make this role's keys match this def", so a key the def
    // no longer carries (a capability flag set back to inherit, a cleared knob,
    // a dropped filter) is removed rather than left stale. Same prefix rule as
    // `mergeRemove` below.
    const prefix = `roles.${name}`;
    for (const key of Object.keys(plugin)) {
      if (key === prefix || key.startsWith(`${prefix}.`)) delete plugin[key];
    }

    plugin[`${prefix}.description`] = def.description;
    if (def.enabled !== undefined) plugin[`${prefix}.enabled`] = def.enabled;
    if (def.locked !== undefined) plugin[`${prefix}.locked`] = def.locked;
    plugin[`${prefix}.required`] = def.required;
    if (def.thinking !== undefined) plugin[`${prefix}.thinking`] = def.thinking;
    if (def.providerPin !== undefined) plugin[`${prefix}.providerPin`] = def.providerPin;
    if (def.preferOwnProvider !== undefined) plugin[`${prefix}.preferOwnProvider`] = def.preferOwnProvider;
    if (def.cacheHitRate !== undefined) plugin[`${prefix}.cacheHitRate`] = def.cacheHitRate;
    if (def.lambda !== undefined) plugin[`${prefix}.lambda`] = def.lambda;
    if (def.filters?.image !== undefined) plugin[`${prefix}.filters.image`] = def.filters.image;
    if (def.filters?.tools !== undefined) plugin[`${prefix}.filters.tools`] = def.filters.tools;
    if (def.filters?.minContextTokens !== undefined) plugin[`${prefix}.filters.minContextTokens`] = def.filters.minContextTokens;
    if (def.filters?.minOutputTokens !== undefined) plugin[`${prefix}.filters.minOutputTokens`] = def.filters.minOutputTokens;
    if (def.filters?.maxPriceUsdPerM !== undefined) plugin[`${prefix}.filters.maxPriceUsdPerM`] = def.filters.maxPriceUsdPerM;
    // The capability flags are written as flat dotted keys too, so omp's
    // shallow settings merge keeps them and `mergeRemove`'s `roles.<name>.`
    // prefix deletes them with the rest of the role. Both `true` and `false`
    // are written: a per-role `false` is how a role opts out of a global flag.
    if (def.features !== undefined) {
      for (const [id, on] of Object.entries(def.features)) plugin[`${prefix}.features.${id}`] = on;
    }
    for (const [metric, weight] of Object.entries(def.weights)) plugin[`${prefix}.weights.${metric}`] = weight;
  }
  return { lock };
}

/**
 * Delete every flat dotted key (`roles.<name>.*`) and any nested `roles.<name>`
 * entry for `names` from a parsed lock file, preserving `plugins` and every
 * sibling settings key. Returns the new lock object plus the names that actually
 * had keys (a name with no entry is a no-op, not an error).
 */
export function mergeRemove(existing: unknown, names: readonly string[]): { lock: object; removed: string[] } | { error: string } {
  if (!isRecord(existing)) return { error: "lock file root is not an object" };
  const lock = structuredClone(existing);
  if (!isRecord(lock.settings)) return { lock, removed: [] };
  const settings = lock.settings as Record<string, unknown>;
  const plugin = settings["omp-llm-role"];
  if (!isRecord(plugin)) return { lock, removed: [] };

  const removed: string[] = [];
  for (const name of names) {
    const prefix = `roles.${name}.`;
    let hit = false;
    for (const key of Object.keys(plugin)) {
      if (key === `roles.${name}` || key.startsWith(prefix)) {
        delete plugin[key];
        hit = true;
      }
    }
    const nested = plugin.roles;
    if (isRecord(nested) && name in nested) {
      delete nested[name];
      if (Object.keys(nested).length === 0) delete plugin.roles;
      hit = true;
    }
    if (hit) removed.push(name);
  }
  return { lock, removed };
}

export type RoleWriteResult =
  | { ok: true; backupPath: string | null; roles: string[] }
  | { ok: false; errors: string[] };

/** Local-time `YYYYMMDD-HHMMSS` stamp for backup siblings. */
export function timestamp(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const hms = `${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}${String(d.getSeconds()).padStart(2, "0")}`;
  return `${ymd}-${hms}`;
}

/** Read and parse the lock file. A missing file is `{}`; unparseable is an error. */
function readLock(lockPath: string): { parsed: unknown } | { error: string } {
  let text = "";
  try {
    text = readFileSync(lockPath, "utf8");
  } catch {
    text = "";
  }
  if (text.trim() === "") return { parsed: {} };
  try {
    return { parsed: JSON.parse(text) };
  } catch {
    return { error: `${lockPath} is not valid JSON — refusing to overwrite` };
  }
}

/** Back up the lock file (when present) and write `lock` atomically, mtime-guarded.
 * `names` is the affected role set, echoed back on the result. */
function commitLock(lockPath: string, lock: object, names: string[], dryRun: boolean): RoleWriteResult {
  if (dryRun) return { ok: true, backupPath: null, roles: names };

  let mtimeBefore = 0;
  try {
    mtimeBefore = statSync(lockPath).mtimeMs;
  } catch {
    mtimeBefore = 0;
  }

  let backupPath: string | null = null;
  if (existsSync(lockPath)) {
    backupPath = `${lockPath}.bak-${timestamp()}`;
    copyFileSync(lockPath, backupPath);
  }

  const result = writeConfigAtomic(lockPath, JSON.stringify(lock, null, 2) + "\n", mtimeBefore);
  if (result === "conflict") return { ok: false, errors: ["lock file changed since load — reload and retry"] };
  return { ok: true, backupPath, roles: names };
}

/**
 * Validate every dirty role, then merge them into the lock file and write it
 * atomically (backup sibling first, mtime-guarded). Never writes on a validation
 * error, an unreadable lock file, or a concurrent change. `dryRun` runs the same
 * validation and merge but stops before the backup and the write.
 */
export function writeRoleSettings(
  lockPath: string,
  dirty: Record<string, RoleDef>,
  opts: { dryRun?: boolean } = {},
): RoleWriteResult {
  const errors: string[] = [];
  for (const [name, def] of Object.entries(dirty)) errors.push(...validateRole(name, def));
  if (errors.length > 0) return { ok: false, errors };

  const read = readLock(lockPath);
  if ("error" in read) return { ok: false, errors: [read.error] };

  const merged = mergeExport(read.parsed, dirty);
  if ("error" in merged) return { ok: false, errors: [merged.error] };
  return commitLock(lockPath, merged.lock, Object.keys(dirty), opts.dryRun === true);
}

/**
 * Delete `names` from the lock file (flat dotted keys and any nested entry),
 * through the same backup + atomic mtime-guarded write as `writeRoleSettings`.
 * A name with no entry is a no-op; the result's `roles` lists the names that
 * actually had keys. `dryRun` stops before the backup and the write.
 */
export function removeRoleSettings(
  lockPath: string,
  names: readonly string[],
  opts: { dryRun?: boolean } = {},
): RoleWriteResult {
  const read = readLock(lockPath);
  if ("error" in read) return { ok: false, errors: [read.error] };

  const merged = mergeRemove(read.parsed, names);
  if ("error" in merged) return { ok: false, errors: [merged.error] };
  return commitLock(lockPath, merged.lock, merged.removed, opts.dryRun === true);
}
