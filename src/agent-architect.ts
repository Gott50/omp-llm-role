/**
 * omp's agent-creation architect, run in-process.
 *
 * `/create-agent` no longer authors the agent body from a template: it runs the
 * same LLM architect omp's `/agents` hub uses (the prompt is shipped verbatim
 * from omp 18.4.8), then the plugin adds the `model:`/`tools:` frontmatter omp's
 * own writer omits. The SDK is imported from the host package root — omp's
 * extension loader resolves that to the running binary; subpath imports do not
 * resolve, so the prompt is a plugin asset rather than an omp import.
 *
 * This module is extension-only: it imports `@oh-my-pi/pi-coding-agent`, which
 * only resolves inside omp. The tests import `src/agent-create.ts` instead,
 * which never imports this file.
 */

import { readFileSync } from "node:fs";
import { createAgentSession } from "@oh-my-pi/pi-coding-agent";
import type { AgentSpec } from "./agent-create.ts";
import { ARCHITECT_PROMPT_VERSION } from "./architect-provenance.ts";

export { ARCHITECT_PROMPT_VERSION };

const ARCHITECT_PROMPT = readFileSync(new URL("./prompts/agent-creation-architect.md", import.meta.url), "utf8");
const USER_PROMPT = readFileSync(new URL("./prompts/agent-creation-user.md", import.meta.url), "utf8");

/** omp's identifier rule (`AgentsHubComponent`): lowercase kebab, 2-6 words. */
const IDENTIFIER_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+){1,5}$/;

/** Strip a ```json fence or slice the outermost braces, mirroring omp. */
export function extractJsonObject(raw: string): string {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) return fence[1].trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end >= start) return raw.slice(start, end + 1).trim();
  return raw.trim();
}

/** Validate the architect's JSON exactly as omp's hub does. */
export function parseAgentSpec(raw: string): AgentSpec {
  const parsed = JSON.parse(extractJsonObject(raw)) as Partial<AgentSpec>;
  if (!parsed || typeof parsed !== "object") throw new Error("architect output is not a JSON object");
  if (
    typeof parsed.identifier !== "string" ||
    typeof parsed.whenToUse !== "string" ||
    typeof parsed.systemPrompt !== "string"
  ) {
    throw new Error("architect output is missing identifier/whenToUse/systemPrompt");
  }
  const identifier = parsed.identifier.trim();
  const whenToUse = parsed.whenToUse.trim();
  const systemPrompt = parsed.systemPrompt.trim();
  if (!IDENTIFIER_PATTERN.test(identifier)) {
    throw new Error(`architect identifier "${identifier}" is not lowercase kebab-case (2+ words)`);
  }
  if (!whenToUse.toLowerCase().startsWith("use this agent when")) {
    throw new Error("architect whenToUse must start with 'Use this agent when'");
  }
  if (systemPrompt === "") throw new Error("architect systemPrompt is empty");
  return { identifier, whenToUse, systemPrompt };
}

/** Last assistant text block, mirroring omp's `extractAssistantText`. */
export function extractAssistantText(messages: readonly unknown[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i] as { role?: string; content?: unknown } | undefined;
    if (message?.role !== "assistant" || !Array.isArray(message.content)) continue;
    const text = message.content
      .map((block) => {
        if (!block || typeof block !== "object") return "";
        const typed = block as { type?: unknown; text?: unknown };
        return typed.type === "text" && typeof typed.text === "string" ? typed.text : "";
      })
      .join("\n")
      .trim();
    if (text !== "") return text;
  }
  return null;
}

export type ArchitectOptions = {
  /** The user's one-sentence purpose. */
  description: string;
  cwd: string;
  /** Live session model (a `Model`); omitted lets the SDK resolve the default. */
  model?: unknown;
  modelRegistry?: unknown;
  /** Streamed architect text, for a live progress line. */
  onText?: (text: string) => void;
  /** Human labels of the benchmarks the role is ranked on; the architect is told
   * to name them in the agent's rubric so the body matches the chosen model. */
  benchmarks?: string[];
};

/**
 * Run omp's architect and return the validated spec. The session is isolated:
 * no tools, no LSP/MCP/extensions/skills/context files, and it does not bind
 * process state (the host session keeps the process-wide effects).
 */
export async function generateAgentSpec(opts: ArchitectOptions): Promise<AgentSpec> {
  const { session } = await createAgentSession({
    cwd: opts.cwd,
    model: opts.model as never,
    modelRegistry: opts.modelRegistry as never,
    systemPrompt: [ARCHITECT_PROMPT],
    hasUI: false,
    enableLsp: false,
    enableMCP: false,
    disableExtensionDiscovery: true,
    toolNames: ["__none__"],
    customTools: [],
    skills: [],
    contextFiles: [],
    promptTemplates: [],
    slashCommands: [],
    bindProcessState: false,
  });
  const unsubscribe = session.subscribe((event: { type?: string; assistantMessageEvent?: { type?: string; delta?: string } }) => {
    const delta = event.assistantMessageEvent;
    if (event.type === "message_update" && delta?.type === "text_delta" && typeof delta.delta === "string") {
      opts.onText?.(delta.delta);
    }
  });
  try {
    const request =
      opts.benchmarks !== undefined && opts.benchmarks.length > 0
        ? `${opts.description}\n\nThis agent's model role is ranked on: ${opts.benchmarks.join(", ")}. Name that benchmark in the agent's rubric so the body matches the model that was chosen.`
        : opts.description;
    await session.prompt(USER_PROMPT.replace("{{request}}", request), { expandPromptTemplates: false });
    const raw = extractAssistantText(session.state.messages);
    if (raw === null) throw new Error("architect returned no text");
    return parseAgentSpec(raw);
  } finally {
    unsubscribe();
    await session.dispose();
  }
}