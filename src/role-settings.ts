/**
 * The one validated write path for role definitions in the plugin settings lock
 * file (`~/.omp/plugins/omp-plugins.lock.json` -> `settings["omp-llm-role"]`).
 *
 * `omp plugin config set` stores every value as a string, and the plugin's
 * validator rejects a string weight/required/boolean, so role settings must be
 * written as typed JSON. The explorer's Export handler and the `create-role.ts`
 * CLI both go through here, so a role created either way is byte-identical and
 * validated by the plugin's own resolver.
 */

import { copyFileSync, existsSync, readFileSync, statSync } from "node:fs";
import { writeConfigAtomic } from "./config-edit.ts";
import type { RoleDef } from "./engine.ts";
import { isRecord } from "./guards.ts";
import { deepMergeInto, resolveSettings } from "./settings.ts";

/** Validate one role def through the plugin's own validator (resolveSettings
 * clones its input, so this is safe per call). Errors are returned verbatim. */
export function validateRole(name: string, def: RoleDef): string[] {
  return resolveSettings({ roles: { [name]: def } }).errors;
}

/** Merge dirty role defs into a parsed lock file, preserving `plugins` and every
 * sibling settings key. Returns the new lock object or a refusal. */
export function mergeExport(existing: unknown, dirty: Record<string, RoleDef>): { lock: object } | { error: string } {
  if (!isRecord(existing)) return { error: "lock file root is not an object" };
  const lock = structuredClone(existing);
  if (!isRecord(lock.settings)) lock.settings = {};
  const settings = lock.settings as Record<string, unknown>;
  if (!isRecord(settings["omp-llm-role"])) settings["omp-llm-role"] = {};
  deepMergeInto(settings["omp-llm-role"] as Record<string, unknown>, { roles: dirty });
  return { lock };
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

  let text = "";
  try {
    text = readFileSync(lockPath, "utf8");
  } catch {
    text = "";
  }
  let parsed: unknown = {};
  if (text.trim() !== "") {
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, errors: [`${lockPath} is not valid JSON — refusing to overwrite`] };
    }
  }

  const merged = mergeExport(parsed, dirty);
  if ("error" in merged) return { ok: false, errors: [merged.error] };
  if (opts.dryRun) return { ok: true, backupPath: null, roles: Object.keys(dirty) };

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

  const result = writeConfigAtomic(lockPath, JSON.stringify(merged.lock, null, 2) + "\n", mtimeBefore);
  if (result === "conflict") return { ok: false, errors: ["lock file changed since load — reload and retry"] };
  return { ok: true, backupPath, roles: Object.keys(dirty) };
}
