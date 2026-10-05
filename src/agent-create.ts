/**
 * `/create-agent` core: purpose -> archetype -> validated role -> agent `.md`,
 * in one call. The omp extension command is the only host; the tests drive this
 * module directly.
 *
 * The three writes are ordered so a failure leaves nothing half-made: every check
 * (name, weight math, existing agent file, the plugin's own validator via
 * `writeRoleSettings`) runs before either file is touched.
 *
 * Wiring `modelRoles.<name>` is the caller's job: the extension command runs the
 * updater in-process right after (the same path `/refresh-roles` takes).
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { AGENT_NAME_RE, RESERVED_AGENT_NAMES, isReadOnlyTools, projectAgentsDir, removeAgentFile, renderAgentFile, userAgentsDir, writeAgentFile } from "./agent-file.ts";
import { CAPABILITY_FILL, rankRole, type Model, type RoleDef, type SuffixLevel } from "./engine.ts";
import { metricMeta } from "./explorer/explain.ts";
import { ARCHETYPES, archetypeById, fitArchetype, type Archetype } from "./role-archetypes.ts";
import { writeRoleSettings, type RoleWriteResult } from "./role-settings.ts";
import { isKnownMetric, KNOWN_METRICS, PLUGIN_SETTINGS_PATH } from "./settings.ts";
import { catalogBenchmarkDeclaration, catalogMetric, sourceForMetric, type BenchmarkCatalogEntry, type SourceDeclaration } from "./benchmark-sources.ts";

/** The architect's output (omp's `/agents` hub contract): the routing rule and
 * the system prompt, plus the identifier omp would use for the file name. */
export type AgentSpec = {
  identifier: string;
  whenToUse: string;
  systemPrompt: string;
};

export type CreateAgentRequest = {
  name: string;
  /** One sentence: what the agent is for. Becomes the routing description. */
  purpose: string;
  /** Force a specific archetype instead of fitting one to the purpose. */
  archetypeId?: string;
  /** Override the archetype's weights entirely (must satisfy both invariants). */
  weights?: Record<string, number>;
  required?: string[];
  thinking?: SuffixLevel;
  tools?: string[];
  scope: "user" | "project";
  image?: boolean;
  /** Override the generated body. */
  body?: string;
  /**
   * omp's architect output. When present, its `whenToUse` becomes the routing
   * description and its `systemPrompt` the body — the template is not used.
   */
  spec?: AgentSpec;
  /**
   * Extra benchmarks to fold into the role's weights (the create flow asks the
   * user for these). Names already in the weights are duplicates; names outside
   * the known-metric set are unknown. Both are reported, not fatal.
   */
  extraBenchmarks?: string[];
  /**
   * Benchmark links the request named. The extension resolves each to a source
   * (an unknown link goes through the authoring step) and folds the resolved
   * metric names into `extraBenchmarks`; `createAgent` itself never fetches.
   */
  benchmarkLinks?: string[];
  /**
   * Human labels of the benchmarks the role is ranked on, for the generated
   * body's `<criteria>` (the architect path gets them in its prompt instead).
   */
  benchmarkLabels?: string[];
  /**
   * Per-metric coverage of the ranking field, for the focus-coverage gate and
   * the report annotation. The extension loads the ranking universe once and
   * supplies it; omitted (the CLI, tests) means the field size is unknown and
   * the share rule is skipped.
   */
  coverage?: FocusCoverage;
  /** Overwrite an existing agent file. */
  force: boolean;
  dryRun: boolean;
  lockPath: string;
  /** Project anchor for `scope: "project"`; defaults to the process cwd. */
  projectAnchor?: string;
};

export type CreateAgentResult =
  | {
      ok: true;
      name: string;
      archetype: Archetype;
      matched: string[];
      def: RoleDef;
      agentPath: string;
      model: string;
      readOnly: boolean;
      backupPath: string | null;
      dryRun: boolean;
      /** How the user-named benchmarks folded into the weights. */
      bench: BenchmarkApplication;
    }
  | { ok: false; errors: string[] };

/** The template body's `<critical>` for a writer; read-only agents restate their
 * contract instead. Used only when no architect spec is supplied. */
const WRITER_CRITICAL =
  "Keep the change scoped to the stated purpose. You NEVER widen it — no extra validation, telemetry, retries, or unrelated refactors — and you NEVER suppress a symptom to make a check pass.";

const READ_ONLY_CRITICAL =
  "You MUST operate as read-only. You NEVER write, edit, or modify files, and you NEVER run a state-changing command. Return findings only.";

/** Fold a free-text purpose into one line safe for a YAML scalar and a prompt. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Base-form verbs that read naturally after "MUST be used to"; anything else
 * takes "MUST be used for" (which also covers gerunds: "for writing …"). */
const PURPOSE_VERBS: Record<string, true> = {
  write: true, review: true, audit: true, analyze: true, analyse: true, refactor: true, test: true, deploy: true,
  research: true, design: true, document: true, generate: true, extract: true, summarize: true, summarise: true,
  translate: true, migrate: true, debug: true, profile: true, scrape: true, monitor: true, draft: true, edit: true,
  explain: true, plan: true, implement: true, build: true, fix: true, convert: true, compare: true, investigate: true,
};

/** The agent's routing description: `MUST be used to/for …` unless the caller
 * already wrote a routing rule. The purpose's own wording is preserved. */
function routingDescription(purpose: string): string {
  const line = oneLine(purpose);
  if (/^(MUST|SHOULD|ALWAYS|NEVER)\b/i.test(line)) return /[.!?]$/.test(line) ? line : `${line}.`;
  const [first = ""] = line.split(" ");
  const routed = `${first.toLowerCase() in PURPOSE_VERBS ? "MUST be used to" : "MUST be used for"} ${line}`;
  return /[.!?]$/.test(routed) ? routed : `${routed}.`;
}

function buildBody(request: CreateAgentRequest, archetype: Archetype, readOnly: boolean): string {
  if (request.body !== undefined && request.body.trim() !== "") return request.body.trim();
  const criteria = archetype.criteria.map((line) => `- ${line}`);
  const labels = request.benchmarkLabels ?? [];
  if (labels.length > 0) {
    criteria.push(`- The model for this role was chosen on ${labels.join(", ")}; hold the work to that standard.`);
  }
  return [
    `Work the ${archetype.label} role: ${oneLine(request.purpose)}.`,
    "",
    "<criteria>",
    criteria.join("\n"),
    "</criteria>",
    "",
    "<critical>",
    readOnly ? READ_ONLY_CRITICAL : WRITER_CRITICAL,
    "</critical>",
  ].join("\n");
}

/**
 * The two weight invariants the engine needs but the plugin's validator only
 * half-enforces (it accepts Σ ∈ [0.99, 1.01]; `rankRole` computes
 * `q = Σ (wᵢ/(1−w_price))·tᵢ`, so any other split silently rescales q against λ).
 */
export function checkWeightMath(name: string, weights: Record<string, number>, required: readonly string[]): string[] {
  const errors: string[] = [];
  const metrics = Object.keys(weights);
  if (metrics.length === 0) return [`role ${name}: no weights given`];

  const sum = metrics.reduce((total, metric) => total + weights[metric], 0);
  if (sum > 1.01 || sum < 0.99) errors.push(`role ${name}: weights sum to ${Number(sum.toFixed(4))}, must be 1.0`);

  const price = weights.price;
  if (price === undefined || price <= 0) {
    errors.push(`role ${name}: price must be weighted (the engine's λ is derived from it)`);
  } else {
    const nonPrice = sum - price;
    const expected = 1 - price;
    if (Math.abs(nonPrice - expected) > 1e-9) {
      errors.push(
        `role ${name}: non-price weights sum to ${Number(nonPrice.toFixed(4))}, must be exactly 1 − price = ${Number(expected.toFixed(4))}`,
      );
    }
  }
  if (weights.throughput === undefined || weights.throughput <= 0) {
    errors.push(`role ${name}: throughput must be weighted`);
  }
  for (const gate of ["general", "price", "throughput"]) {
    if (!required.includes(gate)) errors.push(`role ${name}: required must include "${gate}"`);
  }
  return errors;
}

/** The result of folding user-named benchmarks into a role's weights. */
export type BenchmarkApplication = {
  weights: Record<string, number>;
  added: string[];
  duplicates: string[];
  unknown: string[];
  /** Focus metrics dropped by the top-K cap (priority order preserved). */
  dropped: string[];
  /** Per-focus-metric coverage of the ranking field, for the report annotation. */
  coverage: Record<string, FocusCoverageEntry>;
};

/** The backbone every role keeps: the general/reasoning quality axes plus the
 * cost axes. A named benchmark is a *focus* metric and takes a decisive share of
 * the non-price budget instead of being diluted across the archetype's set. */
const BACKBONE_METRICS: Record<string, true> = { general: true, reasoning: true, price: true, throughput: true };

/** Focus-share bounds: a named benchmark must actually drive the ranking. */
const FOCUS_SHARE_FLOOR = 0.25;
const FOCUS_SHARE_CAP = 0.4;

/** The most focus metrics one role may weight, so one benchmark keeps a decisive
 * share instead of five sharing the budget. */
export const FOCUS_METRIC_CAP = 3;

/** The coverage share a fill-0 focus metric must clear to be safe to weight. */
export const FOCUS_COVERAGE_FLOOR = 0.35;

export type FocusCoverageStatus = "ok" | "below-bar" | "unknown";

/** Per-metric coverage of the ranking field, for the focus-coverage gate. */
export type FocusCoverage = {
  /** Total models in the ranking universe; null when the load failed. */
  total: number | null;
  /** metric -> models that actually carry it (not the imputed fill). */
  covered: Record<string, number>;
  /** Declared sources, so a declared metric's fill resolves. */
  declared?: readonly SourceDeclaration[];
};

export type FocusCoverageEntry = {
  covered: number;
  total: number | null;
  share: number | null;
  fill: number;
  status: FocusCoverageStatus;
};

/** The capability fill a metric's absence is scored at (0 = a coverage penalty). */
export function metricFill(metric: string, declared: readonly SourceDeclaration[] = []): number {
  return CAPABILITY_FILL[metric] ?? sourceForMetric(metric, declared)?.fill ?? 0;
}

/**
 * The one coverage rule, shared by the discovery gate and the report annotation:
 * a focus metric is safe when its source is capability-filled (`fill > 0`, so
 * absence is a known non-penalty) or its coverage share clears
 * `FOCUS_COVERAGE_FLOOR`. When the field size is unknown the share rule is
 * skipped and the result is `unknown` (annotated, not warned).
 */
export function focusCoverageOk(
  metric: string,
  covered: number,
  total: number | null,
  declared: readonly SourceDeclaration[] = [],
): FocusCoverageStatus {
  if (metricFill(metric, declared) > 0) return "ok";
  if (total === null || total <= 0) return "unknown";
  return covered / total >= FOCUS_COVERAGE_FLOOR ? "ok" : "below-bar";
}

/** Count the models a metric actually covers: a non-null value that is not the
 * source's imputed fill. */
export function countMetricCoverage(models: readonly Model[], metric: string, declared: readonly SourceDeclaration[] = []): number {
  const fill = metricFill(metric, declared);
  let covered = 0;
  for (const model of models) {
    const value = model.metrics[metric];
    if (value == null) continue;
    if (fill > 0 && value === fill) continue;
    covered++;
  }
  return covered;
}

/**
 * Fold user-named benchmarks into a role's weights as a decisive *focus* share.
 *
 * - `specialistShare` = the archetype's weights outside the backbone; the focus
 *   budget is `clamp(specialistShare, 0.25, 0.40)`.
 * - Each focus metric takes `focusShare / |focus|`; a metric already in the
 *   archetype's weights is not double-counted (it takes the focus share and
 *   leaves the rescaled pool).
 * - The archetype's remaining non-price weights are rescaled to fill
 *   `1 − w_price − focusShare`; `price` keeps the archetype's value.
 * - Rounded to 4 decimals with the residual absorbed in the largest non-price
 *   weight, so Σ = 1 and Σ(non-price) = 1 − w_price hold exactly.
 *
 * A name already in the weights is reported as a duplicate; a name outside the
 * known-metric set (a shipped key or an external `<ns>:<local>`) is unknown.
 * Naming the archetype's own specialist set is a no-op (the focus share equals
 * its archetype share). Nothing changes when the list is empty.
 *
 * The focus set is capped at `FOCUS_METRIC_CAP` in priority order (named/linked
 * first, then discovery order), so the caller's explicit choices survive and one
 * benchmark keeps a decisive share; the metrics beyond the cap are reported as
 * `dropped`. `coverage` (the ranking field's size and per-metric counts) drives
 * the per-metric `coverage` annotation via the shared `focusCoverageOk`.
 */
export function applyFocusBenchmarks(
  weights: Record<string, number>,
  metrics: readonly string[],
  coverage?: FocusCoverage,
): BenchmarkApplication {
  const added: string[] = [];
  const duplicates: string[] = [];
  const unknown: string[] = [];
  const focus: string[] = [];
  for (const raw of metrics) {
    const metric = raw.trim();
    if (metric === "") continue;
    if (!isKnownMetric(metric)) {
      unknown.push(metric);
      continue;
    }
    if (focus.includes(metric)) continue; // the same metric named twice
    focus.push(metric);
  }
  const kept = focus.slice(0, FOCUS_METRIC_CAP);
  const dropped = focus.slice(FOCUS_METRIC_CAP);
  for (const metric of kept) {
    if (metric in weights) duplicates.push(metric);
    else added.push(metric);
  }

  const declared = coverage?.declared ?? [];
  const total = coverage?.total ?? null;
  const coverageMap: Record<string, FocusCoverageEntry> = {};
  for (const metric of kept) {
    const covered = coverage?.covered[metric] ?? 0;
    coverageMap[metric] = {
      covered,
      total,
      share: total !== null && total > 0 ? covered / total : null,
      fill: metricFill(metric, declared),
      status: focusCoverageOk(metric, covered, total, declared),
    };
  }
  if (kept.length === 0) return { weights: { ...weights }, added, duplicates, unknown, dropped, coverage: coverageMap };

  const price = weights.price ?? 0;
  const specialistShare = Object.keys(weights)
    .filter((key) => key !== "price" && !BACKBONE_METRICS[key])
    .reduce((sum, key) => sum + weights[key], 0);
  const focusShare = Math.min(FOCUS_SHARE_CAP, Math.max(FOCUS_SHARE_FLOOR, specialistShare));
  const perFocus = focusShare / kept.length;

  const next: Record<string, number> = { ...weights };
  for (const metric of kept) next[metric] = perFocus;
  const rest = Object.keys(next).filter((key) => key !== "price" && !kept.includes(key));
  const restSum = rest.reduce((sum, key) => sum + next[key], 0);
  const target = 1 - price - focusShare;
  if (restSum > 0) for (const key of rest) next[key] = (next[key] * target) / restSum;
  else for (const key of rest) next[key] = target / rest.length;

  // Round to 4 decimals so the written role def stays readable, then absorb the
  // rounding residual in the largest non-price weight so Σ(non-price) = 1 − price
  // still holds exactly (the invariant `rankRole` divides by).
  const keys = Object.keys(next).filter((key) => key !== "price");
  for (const key of keys) next[key] = Math.round(next[key] * 1e4) / 1e4;
  const residual = 1 - price - keys.reduce((total, key) => total + next[key], 0);
  if (residual !== 0) {
    const largest = keys.reduce((a, b) => (next[a] >= next[b] ? a : b));
    next[largest] = Math.round((next[largest] + residual) * 1e4) / 1e4;
  }
  return { weights: next, added, duplicates, unknown, dropped, coverage: coverageMap };
}

/** A benchmark discovered for a purpose: the metric it feeds, its label, the
 * catalog's model count (the pre-fetch coverage numerator for the report
 * annotation), and — for an id whose raw form the metric key cannot reconstruct
 * (a dotted id) — the declaration the caller must persist so the updater can
 * re-fetch it. */
export type DiscoveredBenchmark = { metric: string; label: string; covered: number; declaration?: SourceDeclaration };

/** A candidate the discovery gate dropped, with the reason (for the report). */
export type DroppedBenchmark = { metric: string; label: string; reason: string };

/** The discovery outcome: the benchmarks to fold in, and the ones the coverage
 * gate dropped (non-fatal, reported). */
export type DiscoveryOutcome = { discovered: DiscoveredBenchmark[]; dropped: DroppedBenchmark[] };

/** Catalog benchmarks with fewer models than this are skipped (a 1-model
 * benchmark would distort the ranking). */
const MIN_CATALOG_MODELS = 3;

/** Cap the candidate list handed to the judge (the catalog holds ~745). */
const MAX_DISCOVERY_CANDIDATES = 40;

/** Purpose tokens for the catalog prefilter: lowercased, length >= 3, deduped. */
function purposeTokens(purpose: string): string[] {
  return [...new Set(purpose.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 3))];
}

/** The lowercased words of a catalog entry's name, description and categories. */
function catalogWords(entry: BenchmarkCatalogEntry): string[] {
  return `${entry.name} ${entry.description} ${entry.categories.join(" ")}`.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word !== "");
}

/** A purpose token matches a word exactly, or as a prefix when the token is at
 * least 4 chars ("writing" matches "writingbench", "com" does not match
 * "browsecomp"). */
function tokenMatchesWord(token: string, word: string): boolean {
  return word === token || (token.length >= 4 && word.startsWith(token));
}

/**
 * Rank catalog candidates by lexical relevance to the purpose, most relevant
 * first. A token's weight is inverse-document-frequency over the candidate set,
 * so a specific token ("writing") outweighs a generic one ("agent"); a category
 * that names the purpose's skill is the strongest signal. Ties break by id for
 * determinism. The result is capped at `MAX_DISCOVERY_CANDIDATES` so the judge
 * prompt stays bounded.
 */
function rankCatalogCandidates(purpose: string, candidates: readonly BenchmarkCatalogEntry[]): BenchmarkCatalogEntry[] {
  const tokens = purposeTokens(purpose);
  if (tokens.length === 0) return [];
  const words = candidates.map(catalogWords);
  const docFreq = new Map<string, number>();
  for (const token of tokens) {
    let count = 0;
    for (const ws of words) if (ws.some((word) => tokenMatchesWord(token, word))) count++;
    docFreq.set(token, count);
  }
  const total = candidates.length;
  return candidates
    .map((entry, i) => {
      let score = 0;
      for (const token of tokens) {
        if (!words[i].some((word) => tokenMatchesWord(token, word))) continue;
        score += Math.log(1 + total / (1 + (docFreq.get(token) ?? 0)));
      }
      if (entry.categories.some((category) => tokens.includes(category))) score += 100;
      return { entry, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id))
    .slice(0, MAX_DISCOVERY_CANDIDATES)
    .map((x) => x.entry);
}

/**
 * Discover the catalog benchmarks relevant to `purpose`. `decide` is the
 * injected relevance decision (the extension injects the judge-backed one; tests
 * inject a stub) and returns the selected benchmark ids. Benchmarks with too few
 * models are dropped, the survivors are lexically ranked against the purpose and
 * capped (the catalog is alphabetical, so a blind cap would drop late-sorting
 * benchmarks), a selected benchmark resolves to its shipped metric when one
 * exists (else `bench:<id>`), and a metric already in `exclude` is skipped.
 *
 * `fieldSize` is the ranking universe's model count (null when unknown). A
 * selected benchmark whose metric is fill-0 and whose catalog coverage is below
 * `FOCUS_COVERAGE_FLOOR` of the field is dropped (non-fatal) with a reason, so a
 * sparse pass-rate benchmark cannot turn `q` into a coverage score. When the
 * field size is unknown the share rule is skipped and only the fill rule applies.
 */
export async function discoverBenchmarks(
  purpose: string,
  catalog: readonly BenchmarkCatalogEntry[],
  decide: (purpose: string, candidates: readonly BenchmarkCatalogEntry[]) => Promise<readonly string[]>,
  exclude: readonly string[] = [],
  fieldSize: number | null = null,
): Promise<DiscoveryOutcome> {
  const candidates = catalog.filter((entry) => entry.modelCount >= MIN_CATALOG_MODELS);
  if (candidates.length === 0) return { discovered: [], dropped: [] };
  const ranked = rankCatalogCandidates(purpose, candidates);
  if (ranked.length === 0) return { discovered: [], dropped: [] };
  const selected = new Set(await decide(purpose, ranked));
  const seen = new Set(exclude);
  const discovered: DiscoveredBenchmark[] = [];
  const dropped: DroppedBenchmark[] = [];
  for (const entry of ranked) {
    if (!selected.has(entry.id)) continue;
    const metric = catalogMetric(entry.id);
    if (seen.has(metric)) continue;
    seen.add(metric);
    if (focusCoverageOk(metric, entry.modelCount, fieldSize) === "below-bar") {
      dropped.push({
        metric,
        label: entry.name,
        reason: `coverage ${entry.modelCount}/${fieldSize} is below the ${Math.round(FOCUS_COVERAGE_FLOOR * 100)}% bar`,
      });
      continue;
    }
    const declaration = catalogBenchmarkDeclaration(entry.id);
    discovered.push({ metric, label: entry.name, covered: entry.modelCount, ...(declaration !== null ? { declaration } : {}) });
  }
  return { discovered, dropped };
}

/**
 * The weightable benchmarks, for the create flow's "list all benchmarks in use,
 * to avoid duplicates": the shipped `KNOWN_METRICS` keys plus any external
 * metric in use (`extra`). `weights` marks the ones already in the role.
 */
export function formatBenchmarks(weights?: Record<string, number>, extra?: readonly string[]): string {
  const lines = ["Benchmarks in use (weightable metrics):"];
  const metrics = [...Object.keys(KNOWN_METRICS), ...(extra ?? []).filter((metric) => !(metric in KNOWN_METRICS))];
  for (const metric of metrics) {
    const label = metricMeta(metric).label;
    const mark = weights?.[metric] !== undefined ? "  <- in this role's weights" : "";
    lines.push(`  ${metric.padEnd(14)} ${label}${mark}`);
  }
  return lines.join("\n");
}

/** Shared empty match list for an explicitly chosen archetype (no keyword hits). */
const EMPTY_MATCHED: string[] = [];

/**
 * Resolve the archetype, then layer the caller's explicit overrides on top.
 * Exported so the extension can preview the request's weights (for the live
 * "already in this role's weights" marker) without writing anything.
 */
export function resolveRole(request: CreateAgentRequest): { archetype: Archetype; matched: string[]; def: RoleDef } | { errors: string[] } {
  const match = request.archetypeId === undefined ? fitArchetype(stripBenchmarkLinks(request.purpose)) : { archetype: archetypeById(request.archetypeId), matched: EMPTY_MATCHED };
  if (match.archetype === null) {
    return { errors: [`unknown archetype "${request.archetypeId}" — one of ${ARCHETYPES.map((a) => a.id).join(", ")}`] };
  }
  const archetype = match.archetype;
  const weights = request.weights ?? archetype.weights;
  const required = request.required ?? archetype.required;
  const def: RoleDef = { description: request.spec?.whenToUse ?? oneLine(request.purpose), weights, required };
  const thinking = request.thinking ?? archetype.thinking;
  if (thinking !== undefined) def.thinking = thinking;
  if (request.image === true || (request.image === undefined && archetype.image === true)) def.filters = { image: true };
  return { archetype, matched: match.matched, def };
}

/**
 * Create the role and the agent file for `request`. Nothing is written when any
 * check fails; `dryRun` runs every check and stops before the writes.
 *
 * The agent file is written **before** the role: an agent with no role is
 * harmless (its `@<name>, @default` chain falls back to `@default`), while a
 * role with no agent is a ranked-but-dead entry the updater would still wire. If
 * the role write fails after the agent file landed, the agent file is removed
 * (rollback), so a retry needs no `--force`.
 */
export function createAgent(request: CreateAgentRequest): CreateAgentResult {
  const errors: string[] = [];
  const name = request.name.trim();
  if (!AGENT_NAME_RE.test(name)) {
    errors.push(`name "${name}" must match [A-Za-z0-9_-]+`);
  } else if (name.toLowerCase() in RESERVED_AGENT_NAMES) {
    errors.push(`name "${name}" is reserved by omp (main/sub are session sentinels)`);
  }
  if (oneLine(request.purpose) === "") errors.push("purpose is required");

  const resolved = resolveRole(request);
  if ("errors" in resolved) return { ok: false, errors: [...errors, ...resolved.errors] };
  const bench = applyFocusBenchmarks(resolved.def.weights, request.extraBenchmarks ?? [], request.coverage);
  resolved.def.weights = bench.weights;
  errors.push(...checkWeightMath(name, resolved.def.weights, resolved.def.required));

  const tools = request.tools ?? resolved.archetype.tools;
  const readOnly = isReadOnlyTools(tools);
  const agentsDir = request.scope === "project" ? projectAgentsDir(request.projectAnchor ?? process.cwd()) : userAgentsDir();
  const agentPath = join(agentsDir, `${name}.md`);
  const model = `@${name}, @default`;
  // Pre-flight: the agent file must not be written when the role is going to be
  // refused, or a failed run leaves an agent behind for a role that never lands.
  if (existsSync(agentPath) && !request.force) errors.push(`${agentPath} already exists — pass --force to overwrite`);
  if (errors.length > 0) return { ok: false, errors };

  // Validate through the plugin's own resolver before either file is touched.
  const roleWrite = writeRoleSettings(request.lockPath, { [name]: resolved.def }, { dryRun: true });
  if (!roleWrite.ok) return { ok: false, errors: roleWrite.errors };
  if (request.dryRun) {
    return { ok: true, name, archetype: resolved.archetype, matched: resolved.matched, def: resolved.def, agentPath, model, readOnly, backupPath: null, dryRun: true, bench };
  }

  // omp's architect supplies the routing rule and the body; the plugin adds the
  // `model:`/`tools:` frontmatter omp's own writer omits. Without a spec (the
  // CLI, or a caller that skipped the architect) the archetype template is used.
  const description = request.spec?.whenToUse ?? routingDescription(request.purpose);
  const body = request.spec?.systemPrompt ?? buildBody(request, resolved.archetype, readOnly);
  const text = renderAgentFile({ name, description, model, tools, body });
  // Capture the prior text (only reachable with `--force`) so a failed role write
  // restores it instead of destroying the user's file and leaving the old role
  // dangling.
  const priorAgent = existsSync(agentPath) ? readFileSync(agentPath, "utf8") : null;
  const agent = writeAgentFile(agentPath, text, request.force);
  if (!agent.ok) return { ok: false, errors: [agent.error] };

  // The real role write can return `{ ok: false }` (validation/lock/merge/mtime)
  // or throw (a filesystem error in the atomic writer), so both paths roll the
  // agent file back — a retry then needs no `--force`.
  let written: RoleWriteResult;
  try {
    written = writeRoleSettings(request.lockPath, { [name]: resolved.def });
  } catch (err) {
    return { ok: false, errors: [rollbackAgent(agentPath, priorAgent, err instanceof Error ? err.message : String(err))] };
  }
  if (!written.ok) return { ok: false, errors: [rollbackAgent(agentPath, priorAgent, written.errors.join("; "))] };

  return { ok: true, name, archetype: resolved.archetype, matched: resolved.matched, def: resolved.def, agentPath, model, readOnly, backupPath: written.backupPath, dryRun: false, bench };
}

/**
 * Undo the agent write after a failed role write: restore the prior file when one
 * existed (a `--force` re-create), else remove the new one. Blind removal under
 * `--force` would destroy the user's agent and leave the old role dangling.
 */
function rollbackAgent(agentPath: string, priorAgent: string | null, roleError: string): string {
  if (priorAgent === null) {
    const removed = removeAgentFile(agentPath);
    const note = removed.ok ? "the agent file was removed" : `removing the agent file failed: ${removed.error}`;
    return `the agent file ${agentPath} was written, but the role was not: ${roleError} (${note})`;
  }
  const restored = writeAgentFile(agentPath, priorAgent, true);
  const note = restored.ok ? "the prior agent file was restored" : `restoring the prior agent file failed: ${restored.error}`;
  return `the agent file ${agentPath} was written, but the role was not: ${roleError} (${note})`;
}

/**
 * A warning when the new role's top pick equals the `default` role's top pick —
 * the role adds nothing over the default. `null` when they differ or the pool is
 * empty (nothing to compare).
 */
export function differentiationWarning(
  newDef: RoleDef,
  defaultDef: RoleDef,
  models: readonly Model[],
): string | null {
  if (models.length === 0) return null;
  const pool = models as Model[];
  const next = rankRole(newDef, pool);
  const base = rankRole(defaultDef, pool);
  if (next.length === 0 || base.length === 0) return null;
  if (next[0].model.id !== base[0].model.id) return null;
  return `the new role's leader (${next[0].model.id}) is also the default role's leader — the role adds nothing; raise its distinctive metric or drop it`;
}

/** The ok branch of a create run, for the report formatters. */
export type CreatedAgent = Extract<CreateAgentResult, { ok: true }>;

// ---------------------------------------------------------------------------
// Argument parsing and report formatting, shared by the `/create-agent` omp
// command (which receives the raw text typed after the command name) and the
// tests (which pass argv). One parser, so the two cannot drift.
// ---------------------------------------------------------------------------

export const CREATE_AGENT_USAGE = [
  "Usage: /create-agent <request>",
  "       /create-agent --name <name> --purpose <text> [options]",
  "",
  "  <request>              a natural-language request; the architect names the",
  "                         agent, any benchmark it names is folded in, and any",
  "                         benchmark link is resolved (an unknown link is",
  "                         authored into a source declaration after review)",
  "                         (trailing flags below still apply, e.g. --dry-run)",
  "  --name <name>          agent and role name ([A-Za-z0-9_-]+, not main/sub)",
  "  --purpose <text>       one sentence: what the agent is for (fits the weights)",
  "  --archetype <id>       force a weight archetype instead of fitting the purpose",
  "  --weights <m=w,...>    explicit weights (must sum to 1.0; overrides the archetype)",
  "  --required <m,...>     eligibility gate (default: the archetype's)",
  "  --thinking <level>     off|minimal|low|medium|high|xhigh|max|auto",
  "  --tools <a,b,...>      builtin tool allowlist (default: the archetype's)",
  "  --benchmarks <m,...>   extra benchmarks to fold into the weights (see --list-benchmarks)",
  "  --no-discover          skip benchmark discovery (rank only on named benchmarks)",
  "  --list-benchmarks      print the weightable benchmarks and exit",
  "  --scope <user|project> where the agent file goes (default: user)",
  "  --image                require image input (filters.image)",
  "  --body <text>          override the generated agent body",
  "  --body-file <path>     read the body from a file",
  "  --force                overwrite an existing agent file",
  "  --yes                  accept a proposed benchmark source without prompting",
  "  --lock <path>          settings lock file (default ~/.omp/plugins/omp-plugins.lock.json)",
  "  --dry-run              validate and print without writing",
  "  --json                 print the result as JSON",
  "  --list-archetypes      print the archetype table",
].join("\n");

/** Split a command string into tokens, honoring double and single quotes. */
export function tokenizeArgs(text: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let started = false;
  for (const char of text) {
    if (quote !== null) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      started = true;
      continue;
    }
    if (/\s/.test(char)) {
      if (started) tokens.push(current);
      current = "";
      started = false;
      continue;
    }
    current += char;
    started = true;
  }
  if (started) tokens.push(current);
  return tokens;
}

/** Parse `metric=weight` pairs; a malformed pair or a non-positive weight is fatal. */
function parseWeights(spec: string): string | Record<string, number> {
  const out: Record<string, number> = {};
  for (const pair of spec.split(",")) {
    const [metric, raw] = pair.split("=");
    if (!metric || raw === undefined) return `--weights: expected metric=weight, got "${pair}"`;
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) return `--weights: ${metric} must be a number > 0, got "${raw}"`;
    out[metric] = value;
  }
  return out;
}

function parseList(spec: string): string[] {
  return spec
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

export type ParsedCreateAgentArgs =
  | { ok: true; request: CreateAgentRequest; json: boolean; bodyFile: string | undefined; listArchetypes: boolean; listBenchmarks: boolean; help: boolean; freeText: boolean; yes: boolean; noDiscover: boolean; explicitBenchmarks: boolean }
  | { ok: false; error: string };

/** The flag half of the parse, without the required-name/purpose check (the
 * free-text form supplies those itself). */
type ParsedFlags =
  | { ok: true; request: CreateAgentRequest; json: boolean; bodyFile: string | undefined; listArchetypes: boolean; listBenchmarks: boolean; help: boolean; yes: boolean; noDiscover: boolean; explicitBenchmarks: boolean }
  | { ok: false; error: string };

function parseFlags(argv: string[]): ParsedFlags {
  const request: CreateAgentRequest = {
    name: "",
    purpose: "",
    scope: "user",
    force: false,
    dryRun: false,
    lockPath: PLUGIN_SETTINGS_PATH,
  };
  let json = false;
  let bodyFile: string | undefined;
  let listArchetypes = false;
  let listBenchmarks = false;
  let help = false;
  let yes = false;
  let noDiscover = false;
  let explicitBenchmarks = false;

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--help" || flag === "-h") {
      help = true;
      continue;
    }
    if (flag === "--list-archetypes") {
      listArchetypes = true;
      continue;
    }
    if (flag === "--list-benchmarks") {
      listBenchmarks = true;
      continue;
    }
    if (flag === "--force") {
      request.force = true;
      continue;
    }
    if (flag === "--dry-run") {
      request.dryRun = true;
      continue;
    }
    if (flag === "--json") {
      json = true;
      continue;
    }
    if (flag === "--image") {
      request.image = true;
      continue;
    }
    if (flag === "--yes") {
      yes = true;
      continue;
    }
    if (flag === "--no-discover") {
      noDiscover = true;
      continue;
    }
    const value = argv[++i];
    if (value === undefined) return { ok: false, error: `${flag} requires a value\n\n${CREATE_AGENT_USAGE}` };
    if (flag === "--name") request.name = value;
    else if (flag === "--purpose") request.purpose = value;
    else if (flag === "--archetype") request.archetypeId = value;
    else if (flag === "--weights") {
      const parsed = parseWeights(value);
      if (typeof parsed === "string") return { ok: false, error: parsed };
      request.weights = parsed;
    } else if (flag === "--required") request.required = parseList(value);
    else if (flag === "--thinking") request.thinking = value as SuffixLevel;
    else if (flag === "--tools") request.tools = parseList(value);
    else if (flag === "--benchmarks") {
      explicitBenchmarks = true;
      request.extraBenchmarks = parseList(value);
    } else if (flag === "--scope") {
      if (value !== "user" && value !== "project") return { ok: false, error: `--scope must be user or project, got "${value}"` };
      request.scope = value;
    } else if (flag === "--body") request.body = value;
    else if (flag === "--body-file") bodyFile = value;
    else if (flag === "--lock") request.lockPath = value;
    else return { ok: false, error: `unknown flag "${flag}"\n\n${CREATE_AGENT_USAGE}` };
  }

  return { ok: true, request, json, bodyFile, listArchetypes, listBenchmarks, help, yes, noDiscover, explicitBenchmarks };
}

/** Parse the flag form of `/create-agent` into a request. */
export function parseCreateAgentArgs(argv: string[]): ParsedCreateAgentArgs {
  const parsed = parseFlags(argv);
  if (!parsed.ok) return parsed;
  if (!parsed.help && !parsed.listArchetypes && !parsed.listBenchmarks) {
    if (parsed.request.name === "") return { ok: false, error: `--name is required\n\n${CREATE_AGENT_USAGE}` };
    if (parsed.request.purpose === "") return { ok: false, error: `--purpose is required\n\n${CREATE_AGENT_USAGE}` };
  }
  return { ...parsed, freeText: false };
}

/** Metrics every archetype already weights, so naming one in prose adds nothing
 * and must not be read as a benchmark. `reasoning` is deliberately absent: not
 * every archetype weights it, so it stays extractable. */
const ALWAYS_WEIGHTED_METRICS: Record<string, true> = { general: true, price: true, throughput: true };

/**
 * Metric names a free-text request names explicitly. Whole-word, case-insensitive,
 * with `_`/`-`/space interchangeable inside a name (`long_context` ↔ "long context").
 * The always-weighted backbone (`general`/`price`/`throughput`) is excluded: every
 * archetype already weights them, so ordinary prose naming one adds nothing.
 */
export function extractBenchmarks(text: string): string[] {
  const found: string[] = [];
  for (const metric of Object.keys(KNOWN_METRICS)) {
    if (metric in ALWAYS_WEIGHTED_METRICS) continue;
    const pattern = metric.replace(/_/g, "[ _-]?");
    if (new RegExp(`\\b${pattern}\\b`, "i").test(text)) found.push(metric);
  }
  return found;
}

/** URLs a free-text request points at, in order, deduped. Trailing sentence
 * punctuation is stripped; the extension resolves each to a benchmark source. */
export function extractBenchmarkLinks(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(/https?:\/\/[^\s<>"')\]]+/gi)) {
    const url = match[0].replace(/[.,;:!?]+$/, "");
    if (url !== "" && !found.includes(url)) found.push(url);
  }
  return found;
}

/** Remove benchmark links from a purpose before the archetype fit, so a URL
 * path containing a generic keyword cannot bias the archetype. */
function stripBenchmarkLinks(text: string): string {
  return text.replace(/https?:\/\/[^\s<>"')\]]+/gi, " ").replace(/\s+/g, " ").trim();
}

/**
 * Parse the raw text after `/create-agent`. Flag form (`--name … --purpose …`)
 * when the first token is a flag; otherwise the text up to the first `--flag` is
 * a natural-language request: it becomes the purpose, any benchmark it names is
 * folded in, any benchmark link it points at is recorded for the extension to
 * resolve, and the name is left empty for the architect's identifier to fill
 * (the extension does that after `generateAgentSpec`). Trailing flags still work,
 * so `/create-agent <request> --dry-run` previews without writing.
 */
export function parseCreateAgentInput(raw: string): ParsedCreateAgentArgs {
  const text = raw.trim();
  if (text === "") return { ok: false, error: `nothing to create\n\n${CREATE_AGENT_USAGE}` };
  const tokens = tokenizeArgs(text);
  const firstFlag = tokens.findIndex((token) => token.startsWith("-"));
  if (firstFlag === 0) return parseCreateAgentArgs(tokens);

  const purpose = (firstFlag === -1 ? tokens : tokens.slice(0, firstFlag)).join(" ").trim();
  if (purpose === "") return { ok: false, error: `nothing to create\n\n${CREATE_AGENT_USAGE}` };
  const parsed = parseFlags(firstFlag === -1 ? [] : tokens.slice(firstFlag));
  if (!parsed.ok) return parsed;
  if (parsed.help || parsed.listArchetypes || parsed.listBenchmarks) return { ...parsed, freeText: false };

  parsed.request.purpose = purpose;
  if (parsed.request.extraBenchmarks === undefined) {
    const benchmarks = extractBenchmarks(purpose);
    if (benchmarks.length > 0) parsed.request.extraBenchmarks = benchmarks;
  }
  const links = extractBenchmarkLinks(purpose);
  if (links.length > 0) parsed.request.benchmarkLinks = links;
  return { ...parsed, freeText: true };
}

/** The archetype table, for `--list-archetypes`. */
export function formatArchetypes(): string {
  return ARCHETYPES.map((archetype) => {
    const weights = Object.entries(archetype.weights).map(([metric, weight]) => `${metric}=${weight}`).join(",");
    const image = archetype.image === true ? "  filters.image: true" : "";
    return `${archetype.id.padEnd(10)} ${archetype.label}\n  weights: ${weights}\n  thinking: ${archetype.thinking}${image}`;
  }).join("\n\n");
}

/** One coverage line: `metric covered/total (share) status`, or `unknown`. */
function coverageLine(metric: string, entry: FocusCoverageEntry): string {
  if (entry.status === "unknown") return `${metric} unknown (field size unavailable)`;
  const share = entry.share === null ? "?" : `${(entry.share * 100).toFixed(1)}%`;
  return `${metric} ${entry.covered}/${entry.total} (${share}) ${entry.status}`;
}

/** The human-readable report for a completed (or dry-run) create. */
export function formatCreateAgentReport(
  result: CreatedAgent,
  updaterHint: string,
  opts: { differentiation?: string | null } = {},
): string {
  const weights = Object.entries(result.def.weights).map(([metric, weight]) => `${metric}=${weight}`).join(",");
  const fit = result.matched.length > 0 ? `matched ${result.matched.join(", ")}` : "fallback (no purpose keyword matched)";
  const lines = [
    `create-agent: ${result.dryRun ? "(dry run) " : ""}${result.name}`,
    `  archetype: ${result.archetype.id} (${result.archetype.label}) — ${fit}`,
    `  role:      ${weights}`,
    `             required=${result.def.required.join(",")}  thinking=${result.def.thinking ?? "bare"}${result.def.filters?.image === true ? "  filters.image=true" : ""}`,
    `  agent:     ${result.agentPath}${result.readOnly ? "  (read-only)" : ""}`,
    `             model: ${result.model}`,
  ];
  if (result.bench.added.length > 0) lines.push(`  benchmarks: added ${result.bench.added.join(", ")}`);
  if (result.bench.duplicates.length > 0) lines.push(`  benchmarks: already weighted (skipped) ${result.bench.duplicates.join(", ")}`);
  if (result.bench.unknown.length > 0) lines.push(`  benchmarks: unknown (skipped) ${result.bench.unknown.join(", ")}`);
  if (result.bench.dropped.length > 0) lines.push(`  benchmarks: dropped (focus cap ${FOCUS_METRIC_CAP}) ${result.bench.dropped.join(", ")}`);
  for (const [metric, entry] of Object.entries(result.bench.coverage)) lines.push(`  coverage:  ${coverageLine(metric, entry)}`);
  for (const [metric, entry] of Object.entries(result.bench.coverage)) {
    if (entry.status === "below-bar") {
      lines.push(
        `  warning:   ${metric} coverage ${entry.covered}/${entry.total} is below the ${Math.round(FOCUS_COVERAGE_FLOOR * 100)}% bar — the role may rank on coverage, not quality`,
      );
    }
  }
  if (opts.differentiation) lines.push(`  warning:   ${opts.differentiation}`);
  if (result.backupPath !== null) lines.push(`  backup:    ${result.backupPath}`);
  if (result.dryRun) lines.push("  nothing written (--dry-run)");
  else lines.push(`  next:      ${updaterHint}`);
  return lines.join("\n");
}

