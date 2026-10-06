/**
 * The plugin's memory of the projects where `/project-roles` was used: a small
 * JSON file in the **global** agent dir (never a project's `.omp`), so the
 * explorer can list every project-scoped role set without scanning the
 * filesystem.
 *
 * Written by the project-aware `runUpdater` on any project-scoped run — before
 * the day-gate early return, so a day-stamped no-op session start still
 * registers — pruned of entries whose project lock file is gone, and replaced
 * atomically (temp + rename) so two sessions in different repos cannot
 * interleave into a corrupt file. Reading is pure and tolerant: a missing or
 * unparseable file yields [].
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isRecord } from "./guards.ts";
import { projectLockPath } from "./settings.ts";
import { agentDir } from "./state.ts";

/** Registry file name inside the agent dir. */
export const PROJECT_REGISTRY_FILE = "llm-role-projects.json";

export type ProjectRegistryEntry = { root: string; lastUsed: string };

/** Read the registry. Missing, unparseable, or unexpected-shape → []. */
export function readProjectRegistry(dir = agentDir()): ProjectRegistryEntry[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(join(dir, PROJECT_REGISTRY_FILE), "utf8"));
  } catch {
    return [];
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.projects)) return [];
  const out: ProjectRegistryEntry[] = [];
  for (const entry of parsed.projects) {
    if (!isRecord(entry) || typeof entry.root !== "string" || entry.root.length === 0) continue;
    out.push({ root: entry.root, lastUsed: typeof entry.lastUsed === "string" ? entry.lastUsed : "" });
  }
  return out;
}

/** Atomic replace (temp + rename) so concurrent writers cannot corrupt the file. */
function writeProjectRegistry(entries: ProjectRegistryEntry[], dir: string): void {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, PROJECT_REGISTRY_FILE);
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify({ projects: entries }, null, 2)}\n`);
  renameSync(tmp, path);
}

/**
 * Upsert `root` (stamped now) and prune entries whose project lock file is gone.
 * Best-effort: a write failure is logged, never thrown — the registry is a
 * convenience index, not a run prerequisite.
 */
export function registerProject(root: string, dir = agentDir()): void {
  try {
    const kept = readProjectRegistry(dir).filter((entry) => entry.root !== root && existsSync(projectLockPath(entry.root)));
    kept.push({ root, lastUsed: new Date().toISOString() });
    writeProjectRegistry(kept, dir);
  } catch (err) {
    console.error(`omp-llm-role: could not update the project registry: ${err instanceof Error ? err.message : err}`);
  }
}
