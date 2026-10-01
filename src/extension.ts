/**
 * omp extension entry (runs in-process under Bun inside omp): a day-gated
 * session_start refresh plus the /refresh-roles command.
 *
 * The session-start run is deferred through ctx.setTimeout so launch latency is
 * unaffected and a throw is contained (a raw setTimeout throw would tear the
 * session down). runUpdater owns all notifications — switches/errors on
 * session-start, every decision line for the manual command — so the handlers
 * here only surface unexpected failures.
 */

import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createAgent, CREATE_AGENT_USAGE, formatArchetypes, formatCreateAgentReport, parseCreateAgentArgs, tokenizeArgs } from "./agent-create.ts";
import { THINKING_LEVELS, catalogFromOmpModelsJson } from "./availability.ts";
import { loadRankData } from "./engine.ts";
import { startExplorer, type ExplorerHandle } from "./explorer/boot.ts";
import { isRecord } from "./guards.ts";
import { runUpdater, type Deps } from "./updater.ts";

/** SPA directory shipped beside this extension (repo `web/`). */
const WEB_DIR = fileURLToPath(new URL("../web", import.meta.url));

/** Structural slice of the extension context this plugin touches. */
type ExtContext = {
  hasUI: boolean;
  ui: { notify(message: string, level?: "info" | "warning" | "error"): void };
  modelRegistry: {
    getApiKeyForProvider(provider: string): string | undefined | Promise<string | undefined>;
    getAvailable(): unknown[];
  };
  /** Present on session contexts; branch inspection drives empty-conversation detection. */
  sessionManager?: {
    getBranch(): readonly unknown[];
  };
  /** Read-only model query: `current()` is live, `resolve(spec)` honors role aliases. */
  models?: {
    current(): unknown;
    resolve(spec: string): unknown;
  };
  setTimeout(callback: () => void, ms: number): unknown;
};

/** True when the session's conversation has no user/assistant content yet. */
function hasEmptyConversation(ctx: ExtContext): boolean {
  const branch = ctx.sessionManager?.getBranch();
  if (branch === undefined) return false;
  for (const entry of branch) {
    if (!isRecord(entry)) continue;
    if (entry.type === "message" || entry.type === "custom_message") return false;
  }
  return true;
}

/** True when the live session model resolves from the old default selector (same provider/id, any level). */
function sessionBootedOnOldDefault(ctx: ExtContext, oldSelector: string): boolean {
  const current = ctx.models?.current();
  const colon = oldSelector.lastIndexOf(":");
  const level = colon !== -1 && oldSelector.slice(colon + 1) in THINKING_LEVELS ? oldSelector.slice(colon + 1) : null;
  const base = level === null ? oldSelector : oldSelector.slice(0, oldSelector.length - level.length - 1);
  const oldModel = ctx.models?.resolve(base);
  if (current === undefined || current === null || oldModel === undefined || oldModel === null) return false;
  if (typeof current !== "object" || typeof oldModel !== "object") return false;
  if (!("provider" in current) || !("id" in current) || !("provider" in oldModel) || !("id" in oldModel)) return false;
  return current.provider === oldModel.provider && current.id === oldModel.id;
}

/**
 * Apply a concrete selector (with thinking suffix) to the live session model
 * via the ExtensionAPI surface (`pi.setModel`/`pi.setThinkingLevel` — probed
 * live: these exist on `pi`, not on the handler ctx). Applies only when this
 * is the main session, the conversation is still empty, and the session
 * actually booted on the model the old default role produced — so an explicit
 * `--model` launch is never clobbered. Any skip notifies why.
 */
function makeApplySessionModel(pi: ExtensionAPI, ctx: ExtContext, notify: (lines: string[]) => void): (selector: string, previous: string | null) => Promise<void> {
  return async (selector, previous) => {
    if (ctx.agent.kind !== "main") return;
    if (!hasEmptyConversation(ctx)) return;
    if (previous === null) return; // first run ever wrote a fresh default; the session predates no old role
    if (!sessionBootedOnOldDefault(ctx, previous)) return;
    const colon = selector.lastIndexOf(":");
    const level = colon !== -1 && selector.slice(colon + 1) in THINKING_LEVELS ? selector.slice(colon + 1) : null;
    const base = level === null ? selector : selector.slice(0, selector.length - level.length - 1);
    const model = ctx.models?.resolve(base);
    if (model === undefined || model === null) {
      notify([`omp-llm-role: session model not updated — "${base}" matches no available model`]);
      return;
    }
    await pi.setModel(model);
    if (level !== null) pi.setThinkingLevel(level);
    notify([`omp-llm-role: session model -> ${selector}`]);
  };
}

function extDeps(pi: ExtensionAPI, ctx: ExtContext): Deps {
  return {
    getToken: async () => {
      const key = await ctx.modelRegistry.getApiKeyForProvider("openrouter");
      if (!key) throw new Error("no OpenRouter key available via ctx.modelRegistry.getApiKeyForProvider");
      return key;
    },
    getCatalog: async () => {
      // Registry rows carry `thinking` as an effort object ({ mode, efforts[], ... });
      // normalize to the CLI-JSON string[] shape before parsing.
      const rows = ctx.modelRegistry.getAvailable().map((row) => {
        if (!isRecord(row)) return row;
        const t = row.thinking;
        const efforts = Array.isArray(t)
          ? t.filter((x): x is string => typeof x === "string")
          : isRecord(t) && Array.isArray(t.efforts)
            ? t.efforts.filter((x): x is string => typeof x === "string")
            : [];
        return { ...row, thinking: efforts };
      });
      return catalogFromOmpModelsJson({ models: rows });
    },
    notify: (lines) => {
      const text = lines.join("\n");
      ctx.ui.notify(text, "info");
      // Print/headless modes no-op ctx.ui.notify — mirror decisions and aborts to stderr.
      if (!ctx.hasUI) console.error(text);
    },
    nowUtcDay: () => new Date().toISOString().slice(0, 10),
    applySessionModel: (selector, previous) => {
      const notify = (lines: string[]) => {
        const text = lines.join("\n");
        ctx.ui.notify(text, "info");
        if (!ctx.hasUI) console.error(text);
      };
      return makeApplySessionModel(pi, ctx, notify)(selector, previous);
    },
  };
}

/** `/explore-roles [--port N] [--no-open]` — the text typed after the command. */
function parseExplorerArgs(args: string): { port: number | undefined; open: boolean } {
  let port: number | undefined;
  let open = true;
  const parts = args.split(/\s+/);
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === "--port") port = Number(parts[i + 1]);
    else if (parts[i] === "--no-open") open = false;
  }
  const valid = port !== undefined && Number.isInteger(port) && port >= 1 && port <= 65535 ? port : undefined;
  return { port: valid, open };
}

/** Mirror an explorer line to the UI, and to stderr when the mode has no UI. */
function notifyLines(ctx: ExtContext, line: string): void {
  ctx.ui.notify(line, "info");
  if (!ctx.hasUI) console.error(line);
}

export default function (pi: ExtensionAPI) {
  /** Loopback explorer owned by this session binding (null until launched). */
  let explorer: ExplorerHandle | null = null;

  pi.on("session_start", async (_event, ctx: ExtContext) => {
    // Awaited, not deferred: the day-gated write must land — and the empty-
    // conversation session model must switch — before the first prompt is
    // dispatched. A ctx.setTimeout callback is unref'd and cleared on
    // session_shutdown, so a short-lived session (omp -p, subagent) can exit
    // before a deferred run finishes (observed live: probe walk cut off
    // mid-loop, no write). runUpdater catches its own abort paths; a throw
    // here is contained by handler dispatch (extension error channel).
    try {
      await runUpdater("session-start", extDeps(pi, ctx));
    } catch (err) {
      ctx.ui.notify(`llm-role: ${err instanceof Error ? err.message : err}`, "warning");
    }
  });

  pi.registerCommand("refresh-roles", {
    description: "Refresh model roles from today's llm-stats/OpenRouter rankings",
    handler: async (_args, ctx: ExtContext) => {
      try {
        await runUpdater("manual", extDeps(pi, ctx), { force: true });
      } catch (err) {
        ctx.ui.notify(`llm-role: ${err instanceof Error ? err.message : err}`, "warning");
      }
    },
  });

  // In-process explorer: no `node explore.ts` subprocess, catalog from the live
  // model registry. Same server the CLI boots (src/explorer/boot.ts), so the
  // UI's numbers are the plugin's numbers in both hosts.
  pi.registerCommand("explore-roles", {
    description: "Open the interactive model-role ranking explorer (loopback web UI)",
    handler: async (args, ctx: ExtContext) => {
      const { port, open } = parseExplorerArgs(typeof args === "string" ? args : "");
      try {
        if (explorer !== null) {
          notifyLines(ctx, `llm-role explorer: ${explorer.url}`);
          if (open && process.platform === "darwin") execFile("open", [explorer.url], () => {});
          return;
        }
        notifyLines(ctx, "llm-role explorer: loading today's rankings…");
        const rank = await loadRankData({});
        const catalog = await extDeps(pi, ctx).getCatalog();
        explorer = await startExplorer({
          webDir: WEB_DIR,
          rank,
          catalog,
          reload: (refresh) => loadRankData({ refresh }),
          port,
          open,
          unref: true,
          onLog: (line) => notifyLines(ctx, line),
        });
        notifyLines(ctx, `llm-role explorer: ${explorer.url}`);
      } catch (err) {
        ctx.ui.notify(`llm-role explorer: ${err instanceof Error ? err.message : err}`, "warning");
      }
    },
  });

  // One command -> agent .md + validated role + wired `modelRoles.<name>`.
  // Weights come from the archetype table fitted to --purpose (or --weights);
  // the updater run at the end is the same path `/refresh-roles` takes, so the
  // new role is ranked and written into config.yml without a second step.
  pi.registerCommand("create-agent", {
    description: "Create an omp subagent plus its model role, weights fitted to its purpose",
    handler: async (args, ctx: ExtContext) => {
      const parsed = parseCreateAgentArgs(tokenizeArgs(typeof args === "string" ? args : ""));
      if (!parsed.ok) {
        notifyLines(ctx, parsed.error);
        return;
      }
      if (parsed.help) {
        notifyLines(ctx, CREATE_AGENT_USAGE);
        return;
      }
      if (parsed.listArchetypes) {
        notifyLines(ctx, formatArchetypes());
        return;
      }
      if (parsed.bodyFile !== undefined) {
        try {
          parsed.request.body = readFileSync(parsed.bodyFile, "utf8");
        } catch (err) {
          notifyLines(ctx, `create-agent: --body-file ${parsed.bodyFile}: ${err instanceof Error ? err.message : err}`);
          return;
        }
      }
      const result = createAgent(parsed.request);
      if (!result.ok) {
        notifyLines(ctx, `create-agent: ${result.errors.join("\n")}`);
        return;
      }
      notifyLines(ctx, formatCreateAgentReport(result, "ranking the new role…"));
      if (result.dryRun) return;
      try {
        await runUpdater("manual", extDeps(pi, ctx), { force: true });
      } catch (err) {
        ctx.ui.notify(`llm-role: ${err instanceof Error ? err.message : err}`, "warning");
      }
    },
  });

  pi.on("session_shutdown", async () => {
    const handle = explorer;
    explorer = null;
    await handle?.close();
  });
}