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
import { countMetricCoverage, createAgent, CREATE_AGENT_USAGE, differentiationWarning, discoverBenchmarks, formatArchetypes, formatBenchmarks, formatCreateAgentReport, parseCreateAgentInput, resolveRole, tokenizeArgs, type DiscoveryOutcome } from "./agent-create.ts";
import { formatRemoveAgentReport, parseRemoveAgentArgs, removeAgent, REMOVE_AGENT_USAGE } from "./agent-remove.ts";
import { generateAgentSpec } from "./agent-architect.ts";
import { authorBenchmarkSource } from "./benchmark-author.ts";
import { declarationToSource, declaredSourceForLink, dryRunDeclaration, fetchJson, loadBenchmarkCatalog, loadBenchmarkScores, loadDeclaredSources, resolveBenchmarkSource, saveDeclaredSource, validateDeclaration, type BenchmarkCatalogEntry, type BenchmarkSource, type SourceDeclaration } from "./benchmark-sources.ts";
import { judgeBenchmarkRelevance } from "./benchmark-discovery.ts";
import { THINKING_LEVELS, catalogFromOmpModelsJson } from "./availability.ts";
import { loadRankData, type Model } from "./engine.ts";
import { startExplorer, type ExplorerHandle } from "./explorer/boot.ts";
import { isRecord } from "./guards.ts";
import { KNOWN_METRICS, readPluginSettingsMap, resolveSettings } from "./settings.ts";
import { runUpdater, type Deps } from "./updater.ts";

/** SPA directory shipped beside this extension (repo `web/`). */
const WEB_DIR = fileURLToPath(new URL("../web", import.meta.url));

/** Structural slice of the extension context this plugin touches. */
type ExtContext = {
  hasUI: boolean;
  cwd: string;
  ui: {
    notify(message: string, level?: "info" | "warning" | "error"): void;
    /** Interactive prompts; absent in print/RPC mode (guard on `hasUI`). */
    input?(title: string, placeholder?: string): Promise<string | undefined>;
    select?(title: string, options: { label: string; description?: string }[]): Promise<string | undefined>;
  };
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

/** External metrics already weighted by a resolved role, for `--list-benchmarks`. */
function externalMetricsInUse(): string[] {
  const { settings } = resolveSettings(readPluginSettingsMap());
  const out = new Set<string>();
  for (const def of Object.values(settings.roles)) {
    for (const metric of Object.keys(def.weights)) if (!(metric in KNOWN_METRICS)) out.add(metric);
  }
  return [...out];
}

/**
 * Author a source declaration for a link the registry does not know: fetch ->
 * architect -> validate -> dry-run (coverage/leader) -> confirm -> save. Returns
 * the source, or null when the user cancels or the declaration is unusable.
 */
async function authorLink(ctx: ExtContext, link: string, yes: boolean): Promise<BenchmarkSource | null> {
  notifyLines(ctx, `create-agent: ${link} is not a known benchmark source — authoring a declaration…`);
  let declaration: SourceDeclaration;
  try {
    declaration = await authorBenchmarkSource({ link, cwd: ctx.cwd, model: ctx.models?.current(), modelRegistry: ctx.modelRegistry });
  } catch (err) {
    notifyLines(ctx, `create-agent: authoring failed: ${err instanceof Error ? err.message : err}`);
    return null;
  }
  const errors = validateDeclaration(declaration);
  if (errors.length > 0) {
    notifyLines(ctx, `create-agent: proposed source is invalid: ${errors.join("; ")}`);
    return null;
  }
  let payload: unknown;
  try {
    payload = await fetchJson(declaration.fetch.url, declaration.fetch.method ?? "GET", declaration.fetch.body);
  } catch (err) {
    notifyLines(ctx, `create-agent: dry-run fetch failed: ${err instanceof Error ? err.message : err}`);
    return null;
  }
  const dry = dryRunDeclaration(declaration, payload);
  if (!dry.ok) {
    notifyLines(ctx, `create-agent: proposed source rejected: ${dry.errors.join("; ")}`);
    return null;
  }
  notifyLines(
    ctx,
    [
      "create-agent: proposed benchmark source",
      `  ${declaration.label} (${declaration.metric})`,
      `  fetch: ${declaration.fetch.url}`,
      `  coverage: ${dry.covered} rows, leader ${dry.leader?.id ?? "?"} ${dry.leader?.score ?? ""}`,
    ].join("\n"),
  );
  if (!yes && ctx.hasUI && ctx.ui.select) {
    const answer = await ctx.ui.select(`Add benchmark source "${declaration.label}"?`, [
      { label: "Add", description: "save the declaration and rank the role on it" },
      { label: "Cancel" },
    ]);
    if (answer !== "Add") {
      notifyLines(ctx, "create-agent: cancelled");
      return null;
    }
  }
  const saved = saveDeclaredSource(declaration);
  if (!saved.ok) {
    notifyLines(ctx, `create-agent: could not save the source: ${saved.error}`);
    return null;
  }
  notifyLines(ctx, `create-agent: saved ${saved.path}`);
  return declarationToSource(declaration);
}

/**
 * Resolve the request's benchmark links to metric names, authoring a source for
 * a link the registry does not know, and warming each source's cache. Returns
 * null when the user cancels or a link cannot be resolved.
 */
async function resolveBenchmarkLinks(ctx: ExtContext, links: readonly string[], yes: boolean): Promise<{ metrics: string[]; labels: string[] } | null> {
  const metrics: string[] = [];
  const labels: string[] = [];
  const declared = loadDeclaredSources();
  for (const link of links) {
    // A saved declaration wins, so a provider is authored once (US28); then the
    // shipped registry; an unknown link goes through the authoring step.
    let source = declaredSourceForLink(link, declared) ?? resolveBenchmarkSource(link);
    if (source === null) {
      source = await authorLink(ctx, link, yes);
      if (source === null) return null;
    }
    const loaded = await loadBenchmarkScores(source, false);
    if (loaded === null) {
      notifyLines(ctx, `create-agent: ${source.metric} (${source.label}) — no data fetched; the role will rank on its other weights`);
    } else {
      notifyLines(ctx, `create-agent: ${source.metric} (${loaded.label}) — ${Object.keys(loaded.scores).length} rows`);
    }
    metrics.push(source.metric);
    labels.push(loaded?.label ?? source.label);
  }
  return { metrics, labels };
}

/**
 * Discover the catalog benchmarks relevant to `purpose` (non-fatal): a catalog
 * fetch or judge failure just skips discovery, so the command still creates the
 * role. `fieldSize` is the ranking universe's model count (null when unknown),
 * for the coverage gate. Returns null when discovery could not run.
 */
async function discoverForPurpose(ctx: ExtContext, purpose: string, exclude: readonly string[], fieldSize: number | null): Promise<DiscoveryOutcome | null> {
  let catalog: BenchmarkCatalogEntry[] | null;
  try {
    catalog = await loadBenchmarkCatalog(false);
  } catch (err) {
    notifyLines(ctx, `create-agent: benchmark catalog unavailable (${err instanceof Error ? err.message : err}) — skipping discovery`);
    return null;
  }
  if (catalog === null) {
    notifyLines(ctx, "create-agent: benchmark catalog unavailable — skipping discovery");
    return null;
  }
  try {
    return await discoverBenchmarks(purpose, catalog, (p, candidates) => judgeBenchmarkRelevance(p, candidates, ctx.cwd), exclude, fieldSize);
  } catch (err) {
    notifyLines(ctx, `create-agent: benchmark discovery failed (${err instanceof Error ? err.message : err}) — skipping`);
    return null;
  }
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

  // In-process explorer: no subprocess, catalog from the live model registry.
  // Same server src/explorer/boot.ts exposes, so the UI's numbers are the
  // plugin's numbers.
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
    description: "Create an omp subagent (via omp's agent-creation architect) plus its model role",
    handler: async (args, ctx: ExtContext) => {
      const parsed = parseCreateAgentInput(typeof args === "string" ? args : "");
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
      if (parsed.listBenchmarks) {
        notifyLines(ctx, formatBenchmarks(undefined, externalMetricsInUse()));
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

      // 1. Resolve benchmark links first, so the architect can name the
      //    benchmark the role is ranked on. A link the registry knows resolves
      //    to its metric; an unknown link is authored into a source declaration
      //    (fetch -> architect -> dry-run -> confirm -> save). The resolved
      //    metric names are folded into `extraBenchmarks`.
      if (parsed.request.benchmarkLinks !== undefined && parsed.request.benchmarkLinks.length > 0) {
        const resolved = await resolveBenchmarkLinks(ctx, parsed.request.benchmarkLinks, parsed.yes);
        if (resolved === null) return;
        parsed.request.extraBenchmarks = [...(parsed.request.extraBenchmarks ?? []), ...resolved.metrics];
        parsed.request.benchmarkLabels = resolved.labels;
      }

      // 1a. Load today's ranking universe once: the coverage denominator, the
      //     per-metric coverage of named benchmarks, and the differentiation
      //     comparison all need it. Cached (the updater re-reads the same daily
      //     cache), and non-fatal — an unknown field size skips the share rule.
      let rankModels: Model[] | null = null;
      try {
        rankModels = (await loadRankData({})).models;
      } catch (err) {
        notifyLines(ctx, `create-agent: ranking universe unavailable (${err instanceof Error ? err.message : err}) — coverage share checks skipped`);
      }
      const fieldSize = rankModels === null ? null : rankModels.length;

      // 1b. Discover the catalog benchmarks relevant to the purpose (unless
      //     --no-discover or an explicit --benchmarks list was given). Non-fatal:
      //     a catalog or judge failure just skips discovery. A candidate whose
      //     coverage is too low to rank on is dropped, not folded in.
      const discoveredCovered = new Map<string, number>();
      if (!parsed.noDiscover && !parsed.explicitBenchmarks && parsed.request.purpose.trim() !== "") {
        const outcome = await discoverForPurpose(ctx, parsed.request.purpose, parsed.request.extraBenchmarks ?? [], fieldSize);
        if (outcome !== null) {
          if (outcome.dropped.length > 0) {
            notifyLines(ctx, `create-agent: dropped benchmarks (coverage): ${outcome.dropped.map((d) => `${d.label} (${d.metric}) — ${d.reason}`).join(", ")}`);
          }
          if (outcome.discovered.length > 0) {
            parsed.request.extraBenchmarks = [...(parsed.request.extraBenchmarks ?? []), ...outcome.discovered.map((d) => d.metric)];
            parsed.request.benchmarkLabels = [...(parsed.request.benchmarkLabels ?? []), ...outcome.discovered.map((d) => d.label)];
            for (const d of outcome.discovered) discoveredCovered.set(d.metric, d.covered);
            notifyLines(ctx, `create-agent: discovered benchmarks: ${outcome.discovered.map((d) => `${d.label} (${d.metric})`).join(", ")}`);
          }
        }
      }

      // 2. omp's agent-creation architect authors the routing rule and the body
      //    (the same architect the `/agents` hub runs). `--body`/`--body-file`
      //    skip it; the plugin still adds the model/tools frontmatter.
      if (parsed.request.body === undefined) {
        notifyLines(ctx, `create-agent: running omp's agent-creation architect for "${parsed.request.purpose}"…`);
        try {
          parsed.request.spec = await generateAgentSpec({
            description: parsed.request.purpose,
            cwd: ctx.cwd,
            model: ctx.models?.current(),
            modelRegistry: ctx.modelRegistry,
            benchmarks: parsed.request.benchmarkLabels,
          });
        } catch (err) {
          notifyLines(ctx, `create-agent: architect failed: ${err instanceof Error ? err.message : err}`);
          return;
        }
      }

      // Free-text form: the architect's identifier is the agent/role name.
      if (parsed.freeText && parsed.request.name === "") {
        parsed.request.name = parsed.request.spec?.identifier ?? "";
        if (parsed.request.name === "") {
          notifyLines(ctx, "create-agent: free-text form needs --name when --body/--body-file is given");
          return;
        }
      }

      // 3. Ask for extra benchmarks. The list is every weightable metric, so the
      //    user can see what is already in use and avoid duplicates. `--benchmarks`
      //    covers headless runs, where there is no prompt.
      if (ctx.hasUI && ctx.ui.input && parsed.request.extraBenchmarks === undefined) {
        // Preview the request's resolved weights so the list marks what the role
        // already weights (the "already in this role's weights" marker).
        const preview = resolveRole(parsed.request);
        notifyLines(ctx, formatBenchmarks("errors" in preview ? undefined : preview.def.weights, externalMetricsInUse()));
        const answer = await ctx.ui.input(
          "Additional benchmarks",
          "comma-separated metric names to add to the weights, or empty",
        );
        if (answer !== undefined) {
          parsed.request.extraBenchmarks = answer
            .split(",")
            .map((token) => token.trim())
            .filter((token) => token !== "");
        }
      }

      // 3b. Coverage of the focus metrics: a discovered metric's coverage is the
      //     catalog's model count; a named metric's is the loaded models that
      //     carry it. The gate and the report share `focusCoverageOk`.
      const declared = loadDeclaredSources();
      const covered: Record<string, number> = {};
      for (const metric of parsed.request.extraBenchmarks ?? []) {
        covered[metric] = discoveredCovered.get(metric) ?? (rankModels === null ? 0 : countMetricCoverage(rankModels, metric, declared));
      }
      parsed.request.coverage = { total: fieldSize, covered, declared };

      // 4. Write the role + the agent file, then wire `modelRoles.<name>` in-process.
      const result = createAgent(parsed.request);
      if (!result.ok) {
        notifyLines(ctx, `create-agent: ${result.errors.join("\n")}`);
        return;
      }
      const defaultDef = resolveSettings(readPluginSettingsMap({ global: parsed.request.lockPath, project: null })).settings.roles.default;
      const differentiation = rankModels !== null && defaultDef !== undefined ? differentiationWarning(result.def, defaultDef, rankModels) : null;
      if (parsed.json) notifyLines(ctx, JSON.stringify({ ...result, differentiation }, null, 2));
      else notifyLines(ctx, formatCreateAgentReport(result, "ranking the new role…", { differentiation }));
      if (result.dryRun) return;
      try {
        await runUpdater("manual", extDeps(pi, ctx), { force: true });
      } catch (err) {
        ctx.ui.notify(`llm-role: ${err instanceof Error ? err.message : err}`, "warning");
      }
    },
  });

  // The inverse of /create-agent: delete the agent .md and its role, then run
  // the updater in-process so `modelRoles.<name>` and the plugin-managed
  // `task.disabledAgents` entry are dropped in the same command.
  pi.registerCommand("remove-agent", {
    description: "Remove an agent and its model role (deletes the agent .md and the role)",
    handler: async (args, ctx: ExtContext) => {
      const parsed = parseRemoveAgentArgs(tokenizeArgs(typeof args === "string" ? args : ""));
      if (!parsed.ok) {
        notifyLines(ctx, parsed.error);
        return;
      }
      if (parsed.help) {
        notifyLines(ctx, REMOVE_AGENT_USAGE);
        return;
      }
      if (!parsed.yes && ctx.hasUI && ctx.ui.select) {
        const answer = await ctx.ui.select(`Remove agent "${parsed.request.name}" and its role?`, [
          { label: "Remove", description: "delete the agent file and the role" },
          { label: "Cancel" },
        ]);
        if (answer !== "Remove") {
          notifyLines(ctx, "remove-agent: cancelled");
          return;
        }
      }
      const result = removeAgent(parsed.request);
      if (!result.ok) {
        notifyLines(ctx, `remove-agent: ${result.errors.join("\n")}`);
        return;
      }
      notifyLines(ctx, formatRemoveAgentReport(result, "cleaning up config.yml…"));
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