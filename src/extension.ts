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
import { catalogFromOmpModelsJson } from "./availability.ts";
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
  setTimeout(callback: () => void, ms: number): unknown;
};

function extDeps(ctx: ExtContext): Deps {
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
  };
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx: ExtContext) => {
    ctx.setTimeout(() => {
      runUpdater("session-start", extDeps(ctx)).catch((err) => {
        ctx.ui.notify(`llm-role: ${err instanceof Error ? err.message : err}`, "warning");
      });
    }, 0);
  });

  pi.registerCommand("refresh-roles", {
    description: "Refresh model roles from today's llm-stats/OpenRouter rankings",
    handler: async (_args, ctx: ExtContext) => {
      try {
        await runUpdater("manual", extDeps(ctx), { force: true });
      } catch (err) {
        ctx.ui.notify(`llm-role: ${err instanceof Error ? err.message : err}`, "warning");
      }
    },
  });
}