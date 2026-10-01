/**
 * Rendering and placement for omp agent `.md` files.
 *
 * The routing rule and the body come from omp's agent-creation architect
 * (`src/agent-architect.ts`, the same architect the `/agents` hub runs); this
 * module adds the `model:`/`tools:` frontmatter omp's own writer omits. A
 * file-based agent must declare what a bundled one gets from code: a routing
 * description, a model pin, and (deliberately) a tools allowlist. Two rules the
 * generator must not get wrong:
 *
 *   - `model:` is an ordered fallback chain `@<role>, @default`. A bare `@<role>`
 *     is a literal model pattern when the role is absent (disabled or unranked)
 *     and hard-fails with `Model "@x" not found`, so the chain is what keeps the
 *     agent spawnable before the first ranking run.
 *   - `thinking-level` is NOT written. The role's `thinking` field already sets
 *     the effort and prices it; a second pin would silently disagree with it.
 */

import { existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { writeConfigAtomic } from "./config-edit.ts";
import { agentDir } from "./state.ts";

/** omp's read-only tool set (`task/read-only-policy.ts`). A tools list is
 * read-only iff it is non-empty and every entry is in here; any other name —
 * including an unknown one, which omp silently drops — makes the agent a writer. */
export const READ_ONLY_TOOLS: Record<string, true> = {
  read: true,
  wait: true,
  grep: true,
  glob: true,
  find: true,
  web_search: true,
  ast_grep: true,
  yield: true,
  ask: true,
  todo: true,
  recall: true,
  reflect: true,
  retain: true,
  memory_edit: true,
  checkpoint: true,
  rewind: true,
};

export function isReadOnlyTools(tools: readonly string[]): boolean {
  return tools.length > 0 && tools.every((tool) => tool in READ_ONLY_TOOLS);
}

/** Agent names omp reserves for session sentinels (omp's `parseAgentFields`). */
export const RESERVED_AGENT_NAMES: Record<string, true> = { main: true, sub: true };

/** Valid agent/role name: what omp accepts, and what is safe unquoted in YAML. */
export const AGENT_NAME_RE = /^[A-Za-z0-9_-]+$/;

/** The global user agents dir (`~/.omp/agent/agents`, profile- and env-aware). */
export function userAgentsDir(): string {
  return join(agentDir(), "agents");
}

/** The project-scoped agents dir (`.omp/agents` under the project anchor). */
export function projectAgentsDir(anchor: string): string {
  return join(anchor, ".omp", "agents");
}

/** YAML double-quoted scalar: backslashes and quotes escaped, newlines folded. */
function quoteYaml(text: string): string {
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export type AgentFileSpec = {
  name: string;
  /** The routing rule the main model dispatches on (omp's task-agent contract). */
  description: string;
  /** `@<role>, @default` — always the chain, never the bare alias. */
  model: string;
  /** Builtin tool allowlist; empty means full session access. */
  tools: readonly string[];
  /** The system prompt, verbatim. */
  body: string;
};

/** Serialize one agent definition to its `.md` text. */
export function renderAgentFile(spec: AgentFileSpec): string {
  const head = ["---", `name: ${spec.name}`, `description: ${quoteYaml(spec.description)}`, `model: ${quoteYaml(spec.model)}`];
  if (spec.tools.length > 0) head.push(`tools: ${spec.tools.join(", ")}`);
  head.push("---");
  return `${head.join("\n")}\n\n${spec.body.trim()}\n`;
}

export type AgentWriteResult = { ok: true; path: string } | { ok: false; error: string };

/**
 * Write the agent file, refusing to clobber an existing one unless `force`.
 * Goes through the same tmp+rename, mtime-guarded writer as the settings lock
 * file, so a half-written file can never be read as an agent.
 */
export function writeAgentFile(path: string, text: string, force: boolean): AgentWriteResult {
  if (existsSync(path) && !force) {
    return { ok: false, error: `${path} already exists — pass --force to overwrite` };
  }
  // A first agent may be the first thing in the dir (~/.omp/agent/agents is not
  // created by omp until something writes there).
  mkdirSync(dirname(path), { recursive: true });
  const mtimeBefore = existsSync(path) ? statSync(path).mtimeMs : 0;
  const result = writeConfigAtomic(path, text, mtimeBefore);
  if (result === "conflict") return { ok: false, error: `${path} changed while writing — refusing to overwrite` };
  return { ok: true, path };
}
