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
import { THINKING_LEVELS, catalogFromOmpModelsJson } from "./availability.ts";
import { isRecord } from "./guards.ts";
import { runUpdater, type Deps } from "./updater.ts";

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

export default function (pi: ExtensionAPI) {
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
}