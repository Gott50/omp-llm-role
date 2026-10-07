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
import { execFile, execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { assessFocusMetric, countMetricCoverage, createAgent, CREATE_AGENT_USAGE, differentiationWarning, discoverBenchmarks, formatArchetypes, formatBenchmarks, formatCreateAgentReport, parseCreateAgentInput, resolveRole, tokenizeArgs, type DiscoveryOutcome, type FocusAssessor, type FocusMetricAssessment } from "./agent-create.ts";
import { formatRemoveAgentReport, parseRemoveAgentArgs, removeAgent, REMOVE_AGENT_USAGE } from "./agent-remove.ts";
import { generateAgentSpec, generateProjectProfile } from "./agent-architect.ts";
import { authorBenchmarkSource } from "./benchmark-author.ts";
import { applyBenchmarkScores, BENCHMARK_ENTRY_CAP, cachedSourceInfo, declarationToSource, declaredSourceForLink, dryRunDeclaration, fetchJson, loadBenchmarkCatalog, loadBenchmarkScores, loadDeclaredSources, resolveBenchmarkSource, saveDeclaredSource, sourceForMetric, validateDeclaration, type BenchmarkCatalogEntry, type BenchmarkPayloadMeta, type BenchmarkSource, type SourceDeclaration } from "./benchmark-sources.ts";
import { judgeBenchmarkRelevance } from "./benchmark-discovery.ts";
import { THINKING_LEVELS, catalogFromOmpModelsJson, fetchKeyAvailability, type KeyAvailability } from "./availability.ts";
import { loadRankData, rankRole, type Model } from "./engine.ts";
import { startExplorer, type ExplorerHandle } from "./explorer/boot.ts";
import { resolveScopes, unionRoles } from "./explorer/scopes.ts";
import { isRecord } from "./guards.ts";
import { applyProfileOverrides, formatProjectRolesReport, parseProjectRolesArgs, PROJECT_ROLES_USAGE, setupProject, type ProjectProfile } from "./project-setup.ts";
import { DEFAULT_ROLES, findProjectAnchor, KNOWN_METRICS, PLUGIN_SETTINGS_PATH, projectLockPath, readPluginSettingsMap, resolveSettings } from "./settings.ts";
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
    // A generic llm-stats benchmark's raw id lives only in its declaration (the
    // metric key folds `.`→`_`), so persist it before the update run — otherwise
    // the updater's metric-key fallback fetches the wrong, 404-ing URL.
    const declaration = source.declaration;
    if (declaration !== undefined && source.labelFromPayload !== undefined && !declared.some((d) => d.metric === declaration.metric)) {
      const saved = saveDeclaredSource(declaration);
      if (saved.ok) declared.push(declaration);
      else notifyLines(ctx, `create-agent: could not persist ${source.metric} source: ${saved.error}`);
    }
    const loaded = await loadBenchmarkScores(source, false);
    if (loaded === null) {
      notifyLines(ctx, `create-agent: ${source.metric} (${source.label}) — no data fetched; the role will rank on its other weights`);
    } else {
      notifyLines(
        ctx,
        `create-agent: ${source.metric} (${loaded.label}) — ${loaded.loaded} rows${loaded.total !== null && loaded.loaded < loaded.total ? ` of ${loaded.total} (endpoint caps entries at ${BENCHMARK_ENTRY_CAP})` : ""}`,
      );
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
async function discoverForPurpose(ctx: ExtContext, purpose: string, exclude: readonly string[], fieldSize: number | null, assess: FocusAssessor): Promise<DiscoveryOutcome | null> {
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
    return await discoverBenchmarks(purpose, catalog, (p, candidates) => judgeBenchmarkRelevance(p, candidates, ctx.cwd), exclude, fieldSize, assess);
  } catch (err) {
    notifyLines(ctx, `create-agent: benchmark discovery failed (${err instanceof Error ? err.message : err}) — skipping`);
    return null;
  }
}

/** Bounded repository artifacts for the `/project-roles` profile architect:
 * README, package.json, AGENTS.md, a docs listing, the recent git log and a
 * shallow file tree. Every read is best-effort — a missing file or a non-git cwd
 * just contributes nothing. */
function gatherProjectArtifacts(cwd: string): string {
  const parts: string[] = [];
  const readBounded = (rel: string, cap = 4000): string | null => {
    try {
      return readFileSync(join(cwd, rel), "utf8").slice(0, cap);
    } catch {
      return null;
    }
  };
  for (const rel of ["README.md", "package.json", "AGENTS.md", "pyproject.toml", "Cargo.toml", "go.mod"]) {
    const text = readBounded(rel);
    if (text !== null) parts.push(`### ${rel}\n${text}`);
  }
  try {
    const docs = readdirSync(join(cwd, "docs"), { recursive: true })
      .map(String)
      .filter((p) => p.endsWith(".md"))
      .slice(0, 40);
    if (docs.length > 0) parts.push(`### docs/\n${docs.join("\n")}`);
  } catch {
    // no docs dir
  }
  try {
    const log = execFileSync("git", ["log", "--oneline", "-20"], { cwd, encoding: "utf8", timeout: 5000 });
    parts.push(`### git log\n${log}`);
  } catch {
    // not a git repo
  }
  try {
    const entries = readdirSync(cwd, { withFileTypes: true })
      .filter((entry) => !entry.name.startsWith(".") && entry.name !== "node_modules")
      .map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name))
      .slice(0, 60);
    parts.push(`### files\n${entries.join("\n")}`);
  } catch {
    // unreadable cwd
  }
  return parts.join("\n\n");
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
        // The explorer ranks the resolved roles of every known scope, so its
        // dataset must carry every metric any of them weights — including
        // generic llm-stats benchmarks (`bench:<id>`) that only a project role
        // pulls in. `loadRankData({})` loads declared sources only, so a role
        // weighting an undeclared benchmark would rank on a dataset missing that
        // metric and the explorer would disagree with the updater. Pass the
        // union of every scope's resolved roles plus the shipped keys, so the
        // dataset stays a superset of any def the UI can rank (the UI can weight
        // `website`/`writing` even when no role does) and a scope switch is free.
        const scopeInputs = { userLockPath: PLUGIN_SETTINGS_PATH, cwd: ctx.cwd };
        const explorerRoles = () => unionRoles(resolveScopes(scopeInputs), PLUGIN_SETTINGS_PATH);
        const rank = await loadRankData({ roles: explorerRoles(), extraMetrics: Object.keys(KNOWN_METRICS) });
        const catalog = await extDeps(pi, ctx).getCatalog();
        // Best-effort key-availability overlay: a missing key or a failed fetch
        // degrades to "unavailable" and never blocks Explorer boot.
        const loadAvailability = async (): Promise<KeyAvailability> => {
          const token = await ctx.modelRegistry.getApiKeyForProvider("openrouter").catch(() => undefined);
          return token
            ? fetchKeyAvailability(token)
            : { active: false, reason: "unavailable", allowed: new Set(), blocked: new Set(), publicCount: 0, keyedCount: 0, fetchedAt: new Date().toISOString() };
        };
        explorer = await startExplorer({
          webDir: WEB_DIR,
          cwd: ctx.cwd,
          rank,
          catalog,
          availability: await loadAvailability(),
          reloadAvailability: loadAvailability,
          reload: (refresh) => loadRankData({ refresh, roles: explorerRoles(), extraMetrics: Object.keys(KNOWN_METRICS) }),
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

      // 1a-bis. The focus-metric gate must not run on the score-less create-agent
      //     pool: it carries no `bench:<id>` scores, so a gate over it would see
      //     nothing for exactly the benchmarks it targets. Probe-fetch each
      //     candidate's source, join it onto a copy of the pool, and assess the
      //     joined pool. A metric whose scores were not loaded reports every new
      //     axis `unknown` (never a silent `ok`).
      const declared = loadDeclaredSources();
      const focusPool: Model[] = rankModels === null ? [] : rankModels.map((m) => ({ ...m, metrics: { ...m.metrics } }));
      const assess: FocusAssessor = async (metric) => {
        const source = sourceForMetric(metric, declared);
        let payload: BenchmarkPayloadMeta | null = null;
        if (source !== null) {
          const loaded = await loadBenchmarkScores(source, false);
          if (loaded !== null) {
            applyBenchmarkScores(focusPool, source, loaded.scores);
            payload = loaded.meta;
          }
        }
        return assessFocusMetric(focusPool, metric, declared, { payload, catalog: cachedSourceInfo(metric, declared).catalog });
      };

      // 1b. Discover the catalog benchmarks relevant to the purpose (unless
      //     --no-discover or an explicit --benchmarks list was given). Non-fatal:
      //     a catalog or judge failure just skips discovery. A candidate whose
      //     coverage is too low to rank on is dropped, not folded in.
      const discoveredCovered = new Map<string, number>();
      if (!parsed.noDiscover && !parsed.explicitBenchmarks && parsed.request.purpose.trim() !== "") {
        const outcome = await discoverForPurpose(ctx, parsed.request.purpose, parsed.request.extraBenchmarks ?? [], fieldSize, assess);
        if (outcome !== null) {
          if (outcome.dropped.length > 0) {
            notifyLines(ctx, `create-agent: dropped benchmarks: ${outcome.dropped.map((d) => `${d.label} (${d.metric}) — ${d.reason}`).join(", ")}`);
          }
          if (outcome.discovered.length > 0) {
            parsed.request.extraBenchmarks = [...(parsed.request.extraBenchmarks ?? []), ...outcome.discovered.map((d) => d.metric)];
            parsed.request.benchmarkLabels = [...(parsed.request.benchmarkLabels ?? []), ...outcome.discovered.map((d) => d.label)];
            for (const d of outcome.discovered) discoveredCovered.set(d.metric, d.covered);
            // A dotted id's raw form cannot be reconstructed from its metric key,
            // so persist its declaration now — otherwise the updater fetches the
            // normalized (404-ing) URL and the metric is dead weight.
            for (const d of outcome.discovered) {
              if (d.declaration === undefined) continue;
              const saved = saveDeclaredSource(d.declaration);
              if (!saved.ok) notifyLines(ctx, `create-agent: could not persist ${d.metric} source: ${saved.error}`);
            }
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

      // 3b. Assess the focus metrics: a discovered metric's coverage is the
      //     catalog's model count; a named metric's is the loaded models that
      //     carry it. The five-axis assessment is computed over the joined pool
      //     (the same object the gate and the report consume).
      const covered: Record<string, number> = {};
      const assessments: Record<string, FocusMetricAssessment> = {};
      for (const metric of parsed.request.extraBenchmarks ?? []) {
        assessments[metric] = await assess(metric);
        covered[metric] = discoveredCovered.get(metric) ?? countMetricCoverage(focusPool, metric, declared);
      }
      parsed.request.coverage = { total: fieldSize, covered, declared, assessments };

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

  // Discover the project's usecase from its own artifacts and apply a
  // project-scoped role set: the project plugin settings, the new roles' agents,
  // and the project's modelRoles in <cwd>/.omp/config.yml. The project-aware
  // updater (run in-process at the end) keeps the global config untouched.
  pi.registerCommand("project-roles", {
    description: "Discover the project's usecase and apply a project-scoped role set",
    handler: async (args, ctx: ExtContext) => {
      const parsed = parseProjectRolesArgs(typeof args === "string" ? args : "");
      if (!parsed.ok) {
        notifyLines(ctx, parsed.error);
        return;
      }
      if (parsed.help) {
        notifyLines(ctx, PROJECT_ROLES_USAGE);
        return;
      }

      const cwd = ctx.cwd;
      const projectDir = join(cwd, ".omp");
      const lockPath = projectLockPath(cwd);
      const configPath = join(projectDir, "config.yml");

      // omp reads <cwd>/.omp with no walk-up; the plugin's walk-up anchor may
      // differ (a session launched in a subdirectory). The written config is what
      // omp reads, but the anchor would read/write a different .omp — warn.
      const warnings: string[] = [];
      const anchor = findProjectAnchor(cwd);
      if (anchor !== null && anchor !== cwd) {
        warnings.push(
          `the session cwd (${cwd}) is not the project anchor (${anchor}); the config is written to ${projectDir}, which is what omp reads — the plugin's walk-up anchor would read a different .omp`,
        );
      }

      // 1. Gather the repo artifacts and run the profile architect.
      notifyLines(ctx, "project-roles: reading the project…");
      let profile: ProjectProfile;
      try {
        profile = await generateProjectProfile({
          artifacts: gatherProjectArtifacts(cwd),
          cwd,
          model: ctx.models?.current(),
          modelRegistry: ctx.modelRegistry,
          purpose: parsed.purpose,
        });
      } catch (err) {
        notifyLines(ctx, `project-roles: profile discovery failed: ${err instanceof Error ? err.message : err}`);
        return;
      }
      profile = applyProfileOverrides(profile, { purpose: parsed.purpose, roles: parsed.roles });

      // 2. Load the ranking universe once: the coverage denominator, the focus
      //    assessment pool and the top picks all need it. Non-fatal.
      let rankModels: Model[] | null = null;
      try {
        rankModels = (await loadRankData({})).models;
      } catch (err) {
        notifyLines(ctx, `project-roles: ranking universe unavailable (${err instanceof Error ? err.message : err}) — coverage checks skipped`);
      }
      const fieldSize = rankModels === null ? null : rankModels.length;
      const declared = loadDeclaredSources();
      const focusPool: Model[] = rankModels === null ? [] : rankModels.map((m) => ({ ...m, metrics: { ...m.metrics } }));
      const assess: FocusAssessor = async (metric) => {
        const source = sourceForMetric(metric, declared);
        let payload: BenchmarkPayloadMeta | null = null;
        if (source !== null) {
          const loaded = await loadBenchmarkScores(source, false);
          if (loaded !== null) {
            applyBenchmarkScores(focusPool, source, loaded.scores);
            payload = loaded.meta;
          }
        }
        return assessFocusMetric(focusPool, metric, declared, { payload, catalog: cachedSourceInfo(metric, declared).catalog });
      };

      // 3. Per new role: discover benchmarks (judge-backed) and author the agent.
      const covered: Record<string, number> = {};
      const assessments: Record<string, FocusMetricAssessment> = {};
      for (const role of profile.roles) {
        if (role.keep === false) continue;
        if (role.name.trim() in DEFAULT_ROLES) continue; // shipped role — no new agent
        if (role.benchmarks === undefined || role.benchmarks.length === 0) {
          const outcome = await discoverForPurpose(ctx, role.purpose, [], fieldSize, assess);
          if (outcome !== null) {
            if (outcome.dropped.length > 0) {
              notifyLines(ctx, `project-roles: dropped benchmarks (coverage): ${outcome.dropped.map((d) => `${d.label} (${d.metric}) — ${d.reason}`).join(", ")}`);
            }
            role.benchmarks = outcome.discovered.map((d) => d.metric);
            for (const d of outcome.discovered) {
              if (d.declaration === undefined) continue;
              const saved = saveDeclaredSource(d.declaration);
              if (!saved.ok) notifyLines(ctx, `project-roles: could not persist ${d.metric} source: ${saved.error}`);
            }
          }
        }
        for (const metric of role.benchmarks ?? []) {
          assessments[metric] = await assess(metric);
          covered[metric] = rankModels === null ? 0 : countMetricCoverage(focusPool, metric, declared);
        }
        try {
          role.spec = await generateAgentSpec({
            description: role.purpose,
            cwd,
            model: ctx.models?.current(),
            modelRegistry: ctx.modelRegistry,
            benchmarks: role.benchmarks,
          });
        } catch (err) {
          notifyLines(ctx, `project-roles: architect failed for "${role.name}": ${err instanceof Error ? err.message : err}`);
          return;
        }
      }

      // 4. Plan first (a dry run of the same all-or-nothing core), print it, then
      //    apply. `--dry-run` stops after the plan; without `--force` an existing
      //    project role config is refused by the core.
      const planOpts = {
        projectDir,
        lockPath,
        configPath,
        force: parsed.force,
        yes: parsed.yes,
        coverage: { total: fieldSize, covered, declared, assessments },
      };
      const plan = setupProject(profile, { ...planOpts, dryRun: true });
      if (!plan.ok) {
        notifyLines(ctx, `project-roles: ${plan.errors.join("\n")}`);
        return;
      }
      const topPicks: Record<string, string> = {};
      if (rankModels !== null) {
        for (const name of plan.added) {
          const ranked = rankRole(plan.roles[name], rankModels);
          if (ranked.length > 0) topPicks[name] = ranked[0].model.id;
        }
      }
      if (parsed.json) notifyLines(ctx, JSON.stringify({ profile, ...plan, warnings }, null, 2));
      else notifyLines(ctx, formatProjectRolesReport(profile, plan, { topPicks, warnings }));
      if (parsed.dryRun) return;

      if (!parsed.yes && ctx.hasUI && ctx.ui.select) {
        const answer = await ctx.ui.select("Apply this project role set?", [
          { label: "Apply", description: "write the project settings, agents and modelRoles" },
          { label: "Cancel" },
        ]);
        if (answer !== "Apply") {
          notifyLines(ctx, "project-roles: cancelled");
          return;
        }
      }

      const result = setupProject(profile, { ...planOpts, dryRun: false });
      if (!result.ok) {
        notifyLines(ctx, `project-roles: ${result.errors.join("\n")}`);
        return;
      }

      // 5. Run the updater in-process so the project's modelRoles land.
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