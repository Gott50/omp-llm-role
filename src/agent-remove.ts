/**
 * `/remove-agent` core: delete an agent `.md` and its model role, the inverse of
 * `src/agent-create.ts`. The omp extension command is the only host; the tests
 * drive this module directly.
 *
 * Two writes, ordered so a failure leaves nothing half-made: the role's lock-file
 * keys are deleted first (validated through the plugin's own reader), then the
 * agent file(s). Wiring `modelRoles.<name>` and the `task.disabledAgents` entry
 * is the caller's job: the extension command runs the updater in-process right
 * after (the same path `/refresh-roles` takes), which drops the stale
 * `modelRoles.<name>` line and the plugin-managed disabled-agent entry.
 *
 * A shipped default role (`DEFAULT_ROLES`) cannot be deleted — it is built in —
 * so the command refuses it and points at the explorer's "Reset to shipped
 * default" instead. Only user-created roles are removable.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { AGENT_NAME_RE, projectAgentsDir, removeAgentFile, RESERVED_AGENT_NAMES, userAgentsDir } from "./agent-file.ts";
import { removeRoleSettings } from "./role-settings.ts";
import { DEFAULT_ROLES, PLUGIN_SETTINGS_PATH } from "./settings.ts";

export type RemoveAgentRequest = {
  name: string;
  /** Restrict the agent-file removal to one scope; omitted = both user and project. */
  scope?: "user" | "project";
  dryRun: boolean;
  lockPath: string;
  /** Project anchor for `scope: "project"`; defaults to the process cwd. */
  projectAnchor?: string;
};

export type RemoveAgentResult =
  | {
      ok: true;
      name: string;
      /** The role had lock-file keys and they were deleted. */
      roleRemoved: boolean;
      /** Agent files deleted (or, on a dry run, that would be deleted). */
      agentPaths: string[];
      backupPath: string | null;
      dryRun: boolean;
    }
  | { ok: false; errors: string[] };

/** The agent dirs a removal searches, most specific last (project > user). */
function agentDirs(request: RemoveAgentRequest): string[] {
  const dirs: string[] = [];
  if (request.scope !== "project") dirs.push(userAgentsDir());
  if (request.scope !== "user") dirs.push(projectAgentsDir(request.projectAnchor ?? process.cwd()));
  return dirs;
}

/**
 * Remove the role and the agent file(s) for `request`. Nothing is written when
 * any check fails; `dryRun` runs every check and stops before the writes.
 */
export function removeAgent(request: RemoveAgentRequest): RemoveAgentResult {
  const errors: string[] = [];
  const name = request.name.trim();
  if (!AGENT_NAME_RE.test(name)) {
    errors.push(`name "${name}" must match [A-Za-z0-9_-]+`);
  } else if (name.toLowerCase() in RESERVED_AGENT_NAMES) {
    errors.push(`name "${name}" is reserved by omp (main/sub are session sentinels)`);
  } else if (name in DEFAULT_ROLES) {
    errors.push(
      `role "${name}" is a shipped default and cannot be removed — use the explorer's "Reset to shipped default" to drop your overrides`,
    );
  }
  if (errors.length > 0) return { ok: false, errors };

  const dirs = agentDirs(request);
  const agentPaths = dirs.map((dir) => join(dir, `${name}.md`)).filter((path) => existsSync(path));

  // Dry-run the role removal first: it reports whether the role had any keys, so
  // "nothing to remove" is decided before either write.
  const probe = removeRoleSettings(request.lockPath, [name], { dryRun: true });
  if (!probe.ok) return { ok: false, errors: probe.errors };
  const roleRemoved = probe.roles.includes(name);

  if (!roleRemoved && agentPaths.length === 0) {
    return {
      ok: false,
      errors: [`nothing to remove for "${name}" — no role in ${request.lockPath} and no agent file in ${dirs.join(", ")}`],
    };
  }
  if (request.dryRun) {
    return { ok: true, name, roleRemoved, agentPaths, backupPath: null, dryRun: true };
  }

  let backupPath: string | null = null;
  if (roleRemoved) {
    const written = removeRoleSettings(request.lockPath, [name]);
    if (!written.ok) return { ok: false, errors: written.errors };
    backupPath = written.backupPath;
  }

  const removedPaths: string[] = [];
  for (const path of agentPaths) {
    const res = removeAgentFile(path);
    if (!res.ok) {
      return { ok: false, errors: [`role removed, but ${path} was not: ${res.error}`] };
    }
    removedPaths.push(path);
  }

  return { ok: true, name, roleRemoved, agentPaths: removedPaths, backupPath, dryRun: false };
}

// ---------------------------------------------------------------------------
// Argument parsing and report formatting, shared by the `/remove-agent` omp
// command (which receives the raw text typed after the command name) and the
// tests (which pass argv). One parser, so the two cannot drift.
// ---------------------------------------------------------------------------

export const REMOVE_AGENT_USAGE = [
  "Usage: /remove-agent --name <name> [options]",
  "",
  "  --name <name>          agent and role to remove ([A-Za-z0-9_-]+, not main/sub)",
  "  --scope <user|project> restrict the agent-file removal (default: both)",
  "  --lock <path>          settings lock file (default ~/.omp/plugins/omp-plugins.lock.json)",
  "  --yes                  skip the in-session confirmation prompt",
  "  --dry-run              validate and print without writing",
].join("\n");

export type ParsedRemoveAgentArgs =
  | { ok: true; request: RemoveAgentRequest; yes: boolean; help: boolean }
  | { ok: false; error: string };

/** Parse the flags of `/remove-agent` into a request. */
export function parseRemoveAgentArgs(argv: string[]): ParsedRemoveAgentArgs {
  const request: RemoveAgentRequest = { name: "", dryRun: false, lockPath: PLUGIN_SETTINGS_PATH };
  let yes = false;
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--help" || flag === "-h") {
      help = true;
      continue;
    }
    if (flag === "--yes" || flag === "-y") {
      yes = true;
      continue;
    }
    if (flag === "--dry-run") {
      request.dryRun = true;
      continue;
    }
    const value = argv[++i];
    if (value === undefined) return { ok: false, error: `${flag} requires a value\n\n${REMOVE_AGENT_USAGE}` };
    if (flag === "--name") request.name = value;
    else if (flag === "--scope") {
      if (value !== "user" && value !== "project") return { ok: false, error: `--scope must be user or project, got "${value}"` };
      request.scope = value;
    } else if (flag === "--lock") request.lockPath = value;
    else return { ok: false, error: `unknown flag "${flag}"\n\n${REMOVE_AGENT_USAGE}` };
  }

  if (!help && request.name === "") return { ok: false, error: `--name is required\n\n${REMOVE_AGENT_USAGE}` };
  return { ok: true, request, yes, help };
}

/** The human-readable report for a completed (or dry-run) removal. */
export function formatRemoveAgentReport(result: Extract<RemoveAgentResult, { ok: true }>, updaterHint: string): string {
  const lines = [
    `remove-agent: ${result.dryRun ? "(dry run) " : ""}${result.name}`,
    `  role:  ${result.roleRemoved ? "removed from the settings lock file" : "no lock-file entry (nothing to delete)"}`,
  ];
  if (result.agentPaths.length > 0) {
    for (const path of result.agentPaths) lines.push(`  agent: ${path}`);
  } else {
    lines.push("  agent: no agent file found (user or project scope)");
  }
  if (result.backupPath !== null) lines.push(`  backup: ${result.backupPath}`);
  if (result.dryRun) lines.push("  nothing written (--dry-run)");
  else lines.push(`  next:  ${updaterHint}`);
  return lines.join("\n");
}
