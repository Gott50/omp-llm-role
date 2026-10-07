/**
 * omp's in-process architects: the agent-creation architect (`/create-agent`,
 * `/agents` hub) and the project-profile architect (`/project-roles`).
 *
 * `/create-agent` no longer authors the agent body from a template: it runs the
 * same LLM architect omp's `/agents` hub uses (the prompt is shipped verbatim
 * from omp 18.4.8), then the plugin adds the `model:`/`tools:` frontmatter omp's
 * own writer omits. `/project-roles` runs a second architect over the repo's own
 * artifacts to discover the project's usecase as a role set.
 *
 * The SDK (`@oh-my-pi/pi-coding-agent`) is imported dynamically, inside the
 * architect runner: it only resolves inside omp, and a static import failure
 * would be fatal to the whole `extension.ts` load. Dynamic, this module stays
 * importable in a plain Node test (the command registration is testable) and a
 * resolution failure degrades to the caller's error path. The prompts are plugin
 * assets rather than omp imports (omp's extension loader does not resolve the
 * SDK subpath they live under).
 */

import { readFileSync } from "node:fs";
import type { AgentSpec } from "./agent-create.ts";
import type { ProjectProfile, ProposedRole } from "./project-setup.ts";
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
 * Run one isolated architect session and return its raw assistant text. The
 * session has no tools, no LSP/MCP/extensions/skills/context files, and does not
 * bind process state (the host session keeps the process-wide effects).
 */
async function runArchitect(opts: {
  systemPrompt: string;
  userPrompt: string;
  cwd: string;
  model?: unknown;
  modelRegistry?: unknown;
  onText?: (text: string) => void;
}): Promise<string> {
  // The SDK is imported dynamically, inside the function. Static import cannot
  // work: `@oh-my-pi/pi-coding-agent` only resolves inside omp, and a static
  // import failure is fatal to the whole `extension.ts` load — it would kill
  // every plugin command, not just the architect. Dynamic, the module stays
  // importable in a plain Node test (the command registration is testable) and a
  // resolution failure degrades to the caller's error path.
  const { createAgentSession } = await import("@oh-my-pi/pi-coding-agent");
  const { session } = await createAgentSession({
    cwd: opts.cwd,
    model: opts.model as never,
    modelRegistry: opts.modelRegistry as never,
    systemPrompt: [opts.systemPrompt],
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
    await session.prompt(opts.userPrompt, { expandPromptTemplates: false });
    const raw = extractAssistantText(session.state.messages);
    if (raw === null) throw new Error("architect returned no text");
    return raw;
  } finally {
    unsubscribe();
    await session.dispose();
  }
}

/**
 * Run the architect and parse its output, retrying only a PARSE failure. A
 * `run()` failure (the SDK import, "architect returned no text") propagates
 * immediately: a second session would fail the same way. The final error
 * carries the raw output so the caller's `notifyLines(ctx, ...err.message)`
 * surfaces what the architect actually said.
 */
export async function withArchitectRetry<T>(run: () => Promise<string>, parse: (raw: string) => T, attempts = 2): Promise<T> {
  let lastRaw = "";
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    lastRaw = await run();
    try {
      return parse(lastRaw);
    } catch (err) {
      lastError = err;
    }
  }
  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  const raw = lastRaw.length > 2000 ? `${lastRaw.slice(0, 2000)}…` : lastRaw;
  throw new Error(`${detail} (after ${attempts} attempts)\n--- raw architect output ---\n${raw}`);
}

/**
 * Run omp's architect and return the validated spec. The session is isolated:
 * no tools, no LSP/MCP/extensions/skills/context files, and it does not bind
 * process state (the host session keeps the process-wide effects).
 */
export async function generateAgentSpec(opts: ArchitectOptions): Promise<AgentSpec> {
  const request =
    opts.benchmarks !== undefined && opts.benchmarks.length > 0
      ? `${opts.description}\n\nThis agent's model role is ranked on: ${opts.benchmarks.join(", ")}. Name that benchmark in the agent's rubric so the body matches the model that was chosen.`
      : opts.description;
  return withArchitectRetry(
    () =>
      runArchitect({
        systemPrompt: ARCHITECT_PROMPT,
        userPrompt: USER_PROMPT.replace("{{request}}", request),
        cwd: opts.cwd,
        model: opts.model,
        modelRegistry: opts.modelRegistry,
        onText: opts.onText,
      }),
    parseAgentSpec,
  );
}

const PROJECT_ARCHITECT_PROMPT = readFileSync(new URL("./prompts/project-profile-architect.md", import.meta.url), "utf8");
const PROJECT_USER_PROMPT = readFileSync(new URL("./prompts/project-profile-user.md", import.meta.url), "utf8");

/** Validate the profile architect's JSON into a `ProjectProfile`. */
export function parseProjectProfile(raw: string): ProjectProfile {
  const parsed = JSON.parse(extractJsonObject(raw)) as Partial<ProjectProfile>;
  if (!parsed || typeof parsed !== "object") throw new Error("profile architect output is not a JSON object");
  const stringArray = (value: unknown, field: string): string[] => {
    if (!Array.isArray(value) || value.some((x) => typeof x !== "string")) throw new Error(`profile.${field} must be a string array`);
    return value as string[];
  };
  if (typeof parsed.summary !== "string" || parsed.summary.trim() === "") throw new Error("profile.summary is required");
  if (typeof parsed.domain !== "string") throw new Error("profile.domain is required");
  const primaryWork = stringArray(parsed.primaryWork, "primaryWork");
  const stack = stringArray(parsed.stack, "stack");
  const needs = stringArray(parsed.needs, "needs");
  if (!Array.isArray(parsed.roles)) throw new Error("profile.roles must be an array");
  const roles: ProposedRole[] = parsed.roles.map((role, i) => {
    if (!role || typeof role !== "object") throw new Error(`profile.roles[${i}] is not an object`);
    const r = role as Partial<ProposedRole>;
    if (typeof r.name !== "string" || r.name.trim() === "") throw new Error(`profile.roles[${i}].name is required`);
    // A shipped role to keep/drop needs no purpose; `setupProject` requires one
    // for a new role, so the semantic check stays there.
    const out: ProposedRole = { name: r.name.trim(), purpose: typeof r.purpose === "string" ? r.purpose.trim() : "" };
    if (r.keep === false) out.keep = false;
    if (r.benchmarks !== undefined) out.benchmarks = stringArray(r.benchmarks, `roles[${i}].benchmarks`);
    return out;
  });
  return { summary: parsed.summary.trim(), domain: parsed.domain.trim(), primaryWork, stack, needs, roles };
}

export type ProjectArchitectOptions = {
  /** The gathered repository artifacts (README, package.json, AGENTS.md, docs, git log, file tree). */
  artifacts: string;
  cwd: string;
  /** Live session model (a `Model`); omitted lets the SDK resolve the default. */
  model?: unknown;
  modelRegistry?: unknown;
  /** A user-supplied usecase override; the architect is told to honor it. */
  purpose?: string;
  /** Streamed architect text, for a live progress line. */
  onText?: (text: string) => void;
};

/**
 * Run the profile-discovery architect and return the validated `ProjectProfile`.
 * Same isolated session as `generateAgentSpec`; the extension then resolves
 * benchmarks and authors each new role's agent.
 */
export async function generateProjectProfile(opts: ProjectArchitectOptions): Promise<ProjectProfile> {
  const purpose = opts.purpose !== undefined && opts.purpose.trim() !== "" ? `The user overrides the discovered usecase with: ${opts.purpose.trim()}` : "";
  return withArchitectRetry(
    () =>
      runArchitect({
        systemPrompt: PROJECT_ARCHITECT_PROMPT,
        userPrompt: PROJECT_USER_PROMPT.replace("{{artifacts}}", opts.artifacts).replace("{{purpose}}", purpose),
        cwd: opts.cwd,
        model: opts.model,
        modelRegistry: opts.modelRegistry,
        onText: opts.onText,
      }),
    parseProjectProfile,
  );
}