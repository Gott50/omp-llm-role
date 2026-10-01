/**
 * Agent → role pins (GitHub issue #4): the role an agent routes to is derived
 * from its `model:` frontmatter chain (`model: "@designer, @default"`), not from
 * a hardcoded name match. The updater uses this to keep an agent in
 * `task.disabledAgents` exactly while the role it pins is disabled.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { projectAgentsDir, RESERVED_AGENT_NAMES, userAgentsDir } from "./agent-file.ts";

export type AgentPin = { agent: string; role: string; scope: "plugin" | "user" | "project" };

/** The repo's shipped `agents/` dir, resolved from this module's location. */
const SHIPPED_AGENTS_DIR = fileURLToPath(new URL("../agents", import.meta.url));

/** First `@<role>` reference in the `model:` frontmatter value, or null when the
 *  file has no `model:` line or the value names no `@role` (a literal model id). */
export function parseAgentPin(text: string): string | null {
  const lines = text.split("\n");
  if (lines[0]?.trim() !== "---") return null;
  let modelValue: string | null = null;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "---") break; // end of frontmatter
    const match = /^model:\s*(.*)$/.exec(line);
    if (match !== null) {
      modelValue = match[1];
      break;
    }
  }
  if (modelValue === null) return null;
  const role = /@([A-Za-z0-9_-]+)/.exec(modelValue);
  return role === null ? null : role[1];
}

/** Agent `.md` files in the shipped dir, the user agents dir and the project
 *  agents dir, each mapped to the role its `model:` chain pins. Missing dirs are
 *  skipped. A name present in several scopes resolves to the most specific one
 *  (project > user > plugin), matching omp's own agent lookup. */
export function discoverAgentPins(opts?: { shippedDir?: string; userDir?: string; projectDir?: string | null }): AgentPin[] {
  const shippedDir = opts?.shippedDir ?? SHIPPED_AGENTS_DIR;
  const userDir = opts?.userDir ?? userAgentsDir();
  const projectDir = opts?.projectDir === undefined ? projectAgentsDir(process.cwd()) : opts.projectDir;

  const byAgent = new Map<string, AgentPin>();
  const scan = (dir: string | null, scope: AgentPin["scope"]): void => {
    if (dir === null) return;
    let files: string[];
    try {
      files = readdirSync(dir);
    } catch {
      return; // missing dir — nothing to discover
    }
    for (const file of files) {
      if (!file.endsWith(".md")) continue;
      const agent = file.slice(0, -3);
      if (agent in RESERVED_AGENT_NAMES) continue;
      let text: string;
      try {
        text = readFileSync(join(dir, file), "utf8");
      } catch {
        continue;
      }
      const role = parseAgentPin(text);
      if (role === null) continue; // pins no role — the updater must leave it alone
      byAgent.set(agent, { agent, role, scope });
    }
  };
  scan(shippedDir, "plugin");
  scan(userDir, "user");
  scan(projectDir, "project");
  return [...byAgent.values()];
}
