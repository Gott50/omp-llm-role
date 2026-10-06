/**
 * Benchmark-source authoring: when `/create-agent` is given a link the registry
 * cannot resolve, an in-process architect proposes a declarative source spec
 * from the fetched content. The extension then dry-runs the declaration (fetch,
 * parse, join, coverage/leader) and asks the user to confirm before it is saved.
 *
 * This module is extension-only: it imports `@oh-my-pi/pi-coding-agent`
 * dynamically, inside the function (the SDK only resolves inside omp; a static
 * import failure would be fatal to the whole `extension.ts` load). The tests
 * import the pure validation/execution path in `src/benchmark-sources.ts`
 * instead.
 */

import { readFileSync } from "node:fs";
import { fetchText, parseSourceDeclaration, type SourceDeclaration } from "./benchmark-sources.ts";
import { extractAssistantText, extractJsonObject } from "./agent-architect.ts";

const ARCHITECT_PROMPT = readFileSync(new URL("./prompts/benchmark-source-architect.md", import.meta.url), "utf8");
const USER_PROMPT = readFileSync(new URL("./prompts/benchmark-source-user.md", import.meta.url), "utf8");

/** Cap the fetched content handed to the architect (a page can be megabytes). */
const MAX_CONTENT = 200_000;

/** Parse the architect's JSON into a validated declaration. */
export function parseSourceDeclarationJson(raw: string): SourceDeclaration {
  const parsed: unknown = JSON.parse(extractJsonObject(raw));
  const result = parseSourceDeclaration(parsed);
  if ("error" in result) throw new Error(result.error);
  return result.declaration;
}

export type BenchmarkAuthorOptions = {
  /** The link the user pointed at. */
  link: string;
  cwd: string;
  /** Live session model (a `Model`); omitted lets the SDK resolve the default. */
  model?: unknown;
  modelRegistry?: unknown;
  /** Streamed architect text, for a live progress line. */
  onText?: (text: string) => void;
};

/**
 * Fetch the link and run the architect to propose a source declaration. The
 * session is isolated: no tools, no LSP/MCP/extensions/skills/context files, and
 * it does not bind process state (the host session keeps the process-wide
 * effects).
 */
export async function authorBenchmarkSource(opts: BenchmarkAuthorOptions): Promise<SourceDeclaration> {
  const content = (await fetchText(opts.link)).slice(0, MAX_CONTENT);
  // Dynamic, inside the function: `@oh-my-pi/pi-coding-agent` only resolves
  // inside omp, and a static import failure would be fatal to the whole
  // `extension.ts` load (see `agent-architect.ts`).
  const { createAgentSession } = await import("@oh-my-pi/pi-coding-agent");
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
    await session.prompt(USER_PROMPT.replace("{{link}}", opts.link).replace("{{content}}", content), { expandPromptTemplates: false });
    const raw = extractAssistantText(session.state.messages);
    if (raw === null) throw new Error("benchmark-source architect returned no text");
    return parseSourceDeclarationJson(raw);
  } finally {
    unsubscribe();
    await session.dispose();
  }
}
