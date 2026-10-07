/**
 * Benchmark-source registry: the single source of truth for "which benchmark
 * sources exist, what metric each feeds, and how to fetch, parse and join each".
 *
 * Two kinds of source:
 *
 *   - **static** (`BENCHMARK_SOURCES`) — the sources the plugin already ships:
 *     the llm-stats index leaderboard, the writing evidence export, Design Arena,
 *     and the six raw llm-stats benchmark pass rates. Each maps to a
 *     `KNOWN_METRICS` key, so the registry documents the link -> metric mapping
 *     the plugin already has and gives `sourceForMetric` a resolver. A source
 *     whose data the engine already fetches (the index, Design Arena, the raw
 *     benchmarks) carries no `fetch`.
 *   - **external** (`external: true`) — a metric the plugin does not ship. Two
 *     flavours: the generic llm-stats benchmark (`llm-stats.com/benchmarks/<id>`
 *     or a bare benchmark id -> `bench:<normalized-id>`), and a user-declared
 *     source (`benchmark-sources.json` under the agent dir) for a provider the
 *     plugin has never seen. Both are fetched by the engine's generic loop.
 *
 * Resolution and parsing are pure (testable without network); only the cache
 * chain (`loadBenchmarkScores`) and the declaration file I/O touch the disk.
 *
 * Dual-runtime rule: only `node:` builtins + global fetch; relative imports with
 * explicit `.ts` extensions. `engine.ts` imports this module at runtime; this
 * module imports `engine.ts` for types only (erased), so there is no cycle.
 */

import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeConfigAtomic } from "./config-edit.ts";
import type { Model } from "./engine.ts";
import { isRecord } from "./guards.ts";
import { agentDir } from "./state.ts";

const ENGINE_DIR = dirname(fileURLToPath(import.meta.url)); // <repo>/src
const REPO_ROOT = dirname(ENGINE_DIR); // <repo>
/** Daily UTC caches live in one gitignored dir, mirroring `src/engine.ts`. */
const CACHE_DIR = join(REPO_ROOT, "cache");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/** The writing leaderboard's canonical machine-readable export (CC BY 4.0, hourly). */
const WRITING_URL = "https://llm-stats.com/research/best-ai-for-writing/evidence.json";
/** The llm-stats backend that serves one benchmark's leaderboard as JSON. */
const LLM_STATS_BENCHMARK_URL = "https://api.zeroeval.com/leaderboard/benchmarks";
/** The catalog cache file under `CACHE_DIR` (shared by the loader and `cachedSourceInfo`). */
const CATALOG_CACHE_FILE = "benchmark-catalog-fetched-data.json";

/** How a source's ids map to the llm-stats bare id. */
export type JoinRule = "direct" | "slug-suffix" | "normalized";

export type BenchmarkSource = {
  /** Stable source id (e.g. `writing`, `design-arena`, `llm-stats-benchmark:alpacaeval-2_0`). */
  id: string;
  /** Human label for the report/explorer. */
  label: string;
  /** The metric key it feeds (a `KNOWN_METRICS` key, or an external key). */
  metric: string;
  /** The links that resolve to this source (host + path, `*` allowed). */
  urlPatterns: string[];
  /** The request to make; absent for sources whose data the engine already fetches. */
  fetch?: { url: string; method: "GET" | "POST"; body?: unknown };
  /** Pure: payload -> `Record<modelId, score>` (0-1), or `null` on an unusable shape. */
  parse(payload: unknown): Record<string, number> | null;
  /** How the source's ids map to the llm-stats bare id. */
  join: JoinRule;
  /** The daily cache file name under `CACHE_DIR`. */
  cacheFile: string;
  /** The cardinal class; external 0-1 scores are identity. */
  transform: "identity";
  /** The capability fill for models the source does not cover. */
  fill: number;
  /** Model field to mirror the raw score into (e.g. `writingBench`). */
  rawField?: string;
  /** True for a metric the plugin does not ship (generic llm-stats benchmark or declared source). */
  external?: boolean;
  /** The declaration that reproduces this source, when it is persistable. */
  declaration?: SourceDeclaration;
  /** Optional label extractor from the payload (the generic benchmark's `benchmark_name`). */
  labelFromPayload?: (payload: unknown) => string | null;
};

// ---------------------------------------------------------------------------
// Metric keys
// ---------------------------------------------------------------------------

/**
 * Normalize one metric-key part: lowercase, every character outside
 * `[a-z0-9_-]` (plus the `:` namespace separator) becomes `_`, runs collapse,
 * leading/trailing `_` trimmed. The result never contains `.`, which is a hard
 * requirement: the flat dotted settings path splits on `.`
 * (`setNested(patchObj, key.split("."), value)`), so a dotted metric key
 * mis-nests on read-back (the real llm-stats id `alpacaeval-2.0` would become
 * `...weights.bench:alpacaeval-2: {0: w}`).
 */
export function normalizeMetricKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_:-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** The external metric key for a namespace + local id, each normalized. */
export function externalMetricKey(namespace: string, localId: string): string {
  return `${normalizeMetricKey(namespace)}:${normalizeMetricKey(localId)}`;
}

/** Catalog benchmark id -> the shipped metric it feeds, when one exists. */
export const SHIPPED_CATALOG_METRICS: Record<string, string> = {
  writingbench: "writing",
  gpqa: "gpqa",
  aime: "aime",
  "swe-bench-verified": "swe_bench",
  "arc-agi-v2": "arc_agi",
  "terminal-bench": "terminal_bench",
  "tau-bench": "tau_bench",
};

/** The metric a catalog benchmark feeds: a shipped key, or the generic `bench:<id>`. */
export function catalogMetric(benchmarkId: string): string {
  return SHIPPED_CATALOG_METRICS[benchmarkId] ?? externalMetricKey("bench", benchmarkId);
}

/** The declaration a catalog benchmark id needs so its metric key resolves on
 * the next update, or `null` when none is needed: a shipped id (its static
 * source already resolves) or a dot-free id the generic metric-key fallback
 * reconstructs. `normalizeMetricKey` folds separators (`.`, case, …), so a
 * dotted id's raw form survives only here — the declaration must carry it. */
export function catalogBenchmarkDeclaration(benchmarkId: string): SourceDeclaration | null {
  if (SHIPPED_CATALOG_METRICS[benchmarkId] !== undefined) return null;
  return normalizeMetricKey(benchmarkId) !== benchmarkId ? llmStatsBenchmarkDeclaration(benchmarkId) : null;
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

/**
 * WritingBench scores from the writing leaderboard's canonical export
 * (`/research/best-ai-for-writing/evidence.json`): `records[].modelId` is the
 * llm-stats id (bare, same space as `LlmStatsRow.model_id`), so the join is direct.
 * Null when the payload shape is unusable; rows without a finite score are skipped.
 */
export function parseWritingEvidence(v: unknown): Record<string, number> | null {
  if (!isRecord(v) || !("records" in v)) return null;
  const records: unknown = v.records;
  if (!Array.isArray(records)) return null;
  const out: Record<string, number> = {};
  for (const row of records) {
    if (!isRecord(row)) continue;
    const id: unknown = "modelId" in row ? row.modelId : null;
    const score: unknown = "writingBenchScore" in row ? row.writingBenchScore : null;
    if (typeof id !== "string" || typeof score !== "number" || !Number.isFinite(score)) continue;
    out[id] = score;
  }
  return out;
}

/**
 * The generic llm-stats benchmark payload (`api.zeroeval.com/leaderboard/
 * benchmarks/<id>`): `entries[]` carry `model_id` (the bare llm-stats id, so the
 * join is direct) and `normalized_score` (0-1). Null when the shape is unusable.
 */
export function parseLlmStatsBenchmark(v: unknown): Record<string, number> | null {
  if (!isRecord(v) || !Array.isArray(v.entries)) return null;
  const out: Record<string, number> = {};
  for (const row of v.entries) {
    if (!isRecord(row)) continue;
    const id: unknown = row.model_id;
    const score: unknown = row.normalized_score;
    if (typeof id !== "string" || typeof score !== "number" || !Number.isFinite(score)) continue;
    out[id] = score;
  }
  return out;
}

/**
 * The per-entry summary of an llm-stats benchmark payload, read in one pass:
 * the trust flags (`self_reported`/`verified`) and the `multimodal` flag.
 *
 * `trust` is `null` when no parsed entry carried a boolean `self_reported` — a
 * declared or writing-evidence payload has no entry flags, so the axis degrades
 * to `unknown` rather than a silent `ok`. `verified` is uniformly `false` today
 * (the source never sets it); it is kept for when the source starts to.
 *
 * `modality` is the per-entry `multimodal` summary: how many of the `entries[]`
 * carry a boolean `multimodal` (the share denominator) and how many of those are
 * `true`. It is `null` when no parsed entry carried the flag, so the axis
 * degrades to `unknown` rather than a silent `ok`.
 */
export type BenchmarkPayloadMeta = {
  trust: { selfReported: number; verified: number; covered: number } | null;
  modality: { multimodal: number; covered: number } | null;
};

/**
 * Pure: the per-entry summary of a raw llm-stats benchmark payload, or `null`
 * when the payload has no llm-stats entries shape. Junk rows are skipped exactly
 * like `parseLlmStatsBenchmark`; `verified` counts the covered rows (those
 * carrying a boolean `self_reported`), so `verified <= covered` holds. The two
 * summaries have independent denominators (a row may carry one flag and not the
 * other).
 */
export function parseBenchmarkPayloadMeta(v: unknown): BenchmarkPayloadMeta | null {
  if (!isRecord(v) || !Array.isArray(v.entries)) return null;
  let selfReported = 0;
  let verified = 0;
  let covered = 0;
  let multimodal = 0;
  let modalityCovered = 0;
  for (const row of v.entries) {
    if (!isRecord(row)) continue;
    if (typeof row.self_reported === "boolean") {
      covered++;
      if (row.self_reported) selfReported++;
      if (row.verified === true) verified++;
    }
    if (typeof row.multimodal === "boolean") {
      modalityCovered++;
      if (row.multimodal) multimodal++;
    }
  }
  return {
    trust: covered === 0 ? null : { selfReported, verified, covered },
    modality: modalityCovered === 0 ? null : { multimodal, covered: modalityCovered },
  };
}

/** One row of the llm-stats benchmark catalog (`GET /leaderboard/benchmarks`). */
export type BenchmarkCatalogEntry = {
  id: string;
  name: string;
  description: string;
  categories: string[];
  modelCount: number;
  /** The catalog row's `is_community` flag (a community-submitted benchmark);
   * `false` when absent or non-boolean. The only catalog-level trust signal. */
  isCommunity: boolean;
  /** The catalog row's `modality` (e.g. `"text"`, `"image"`, `"audio"`,
   * `"video"`, `"multimodal"`); `null` when absent or non-string. Kept as an
   * open string (not a closed enum) so a future value survives. */
  modality: string | null;
};

/** Pure: the catalog payload (a top-level array) -> entries; null when unusable. */
export function parseBenchmarkCatalog(v: unknown): BenchmarkCatalogEntry[] | null {
  if (!Array.isArray(v)) return null;
  const out: BenchmarkCatalogEntry[] = [];
  for (const row of v) {
    if (!isRecord(row)) continue;
    const id = row.benchmark_id;
    const name = row.name;
    if (typeof id !== "string" || id === "" || typeof name !== "string") continue;
    out.push({
      id,
      name,
      description: typeof row.description === "string" ? row.description : "",
      categories: Array.isArray(row.categories) ? row.categories.filter((c): c is string => typeof c === "string") : [],
      modelCount: typeof row.model_count === "number" && Number.isFinite(row.model_count) ? row.model_count : 0,
      isCommunity: row.is_community === true,
      modality: typeof row.modality === "string" && row.modality !== "" ? row.modality : null,
    });
  }
  return out;
}

/** The llm-stats per-benchmark endpoint's hard cap on `entries`: it returns at
 * most this many rows regardless of `limit`/`offset`/`page`/`per_page`, so a
 * generic `bench:<id>` metric can never load more and no pagination loop can
 * help. `total_models` still reports the full set, so `loaded < total` marks a
 * capped load. */
export const BENCHMARK_ENTRY_CAP = 20;

/** A parsed benchmark payload: the joined scores plus the loadable entry count
 * and the payload's declared total (`total_models`), so the caller can annotate
 * a capped load. `meta` carries the payload's per-entry trust summary; it is
 * `null` when the payload has no llm-stats entries shape (a declared or
 * writing-evidence payload carries no entry flags). */
export type BenchmarkPayload = {
  scores: Record<string, number>;
  /** Entries actually read from the payload — the loadable count. */
  loaded: number;
  /** The payload's declared total model count, when it carries one. */
  total: number | null;
  /** The payload's per-entry trust summary; `null` when the payload has no
   * llm-stats entries shape. */
  meta: BenchmarkPayloadMeta | null;
};

/** Pure: run a source's parser over a payload, carrying the loadable count (the
 * post-fetch coverage count) and the payload's declared total so the caller can
 * annotate `loaded < total` — never the catalog's `model_count`. The trust meta
 * is read independently of `source.parse`, so a declared/writing source (whose
 * parser reads no entry flags) still reports `meta: null`. */
export function parseBenchmarkPayload(source: BenchmarkSource, payload: unknown): BenchmarkPayload | null {
  const scores = source.parse(payload);
  if (scores === null) return null;
  const total = isRecord(payload) && typeof payload.total_models === "number" && Number.isFinite(payload.total_models) ? payload.total_models : null;
  return { scores, loaded: Object.keys(scores).length, total, meta: parseBenchmarkPayloadMeta(payload) };
}

// ---------------------------------------------------------------------------
// The shipped static sources
// ---------------------------------------------------------------------------

/** The six raw llm-stats benchmark pass rates: fields of the index payload, so
 * they carry no `fetch` — the engine's `buildModels` already populates them. */
const RAW_BENCHMARKS: ReadonlyArray<readonly [string, string]> = [
  ["gpqa", "GPQA"],
  ["aime", "AIME 2025"],
  ["swe_bench", "SWE-bench Verified"],
  ["arc_agi", "ARC-AGI v2"],
  ["terminal_bench", "Terminal-Bench"],
  ["tau_bench", "τ-bench (retail)"],
];

export const BENCHMARK_SOURCES: readonly BenchmarkSource[] = [
  {
    id: "llm-stats-index",
    label: "llm-stats leaderboard",
    metric: "general",
    urlPatterns: ["llm-stats.com/leaderboards/llm-leaderboard"],
    parse: () => null,
    join: "direct",
    cacheFile: "llm-stats-fetched-rankings.json",
    transform: "identity",
    fill: 0,
  },
  {
    id: "writing",
    label: "WritingBench (writing leaderboard)",
    metric: "writing",
    urlPatterns: [
      "llm-stats.com/research/best-ai-for-writing/evidence.json",
      "llm-stats.com/research/best-ai-for-writing",
      "llm-stats.com/leaderboards/best-ai-for-writing",
    ],
    fetch: { url: WRITING_URL, method: "GET" },
    parse: parseWritingEvidence,
    join: "direct",
    cacheFile: "writing-fetched-data.json",
    transform: "identity",
    fill: 0.195,
    rawField: "writingBench",
  },
  {
    id: "design-arena",
    label: "Design Arena (website)",
    metric: "website",
    urlPatterns: ["designarena.ai"],
    parse: () => null,
    join: "normalized",
    cacheFile: "designarena-fetched-data.json",
    transform: "identity",
    fill: 0.195,
  },
  ...RAW_BENCHMARKS.map(
    ([metric, label]): BenchmarkSource => ({
      id: metric,
      label,
      metric,
      urlPatterns: [`llm-stats.com/benchmarks/${metric}`, metric],
      parse: () => null,
      join: "direct",
      cacheFile: "llm-stats-fetched-rankings.json",
      transform: "identity",
      fill: 0,
    }),
  ),
];

// ---------------------------------------------------------------------------
// Declarative sources (data, not code)
// ---------------------------------------------------------------------------

/**
 * A user-level source declaration: the plugin fetches `fetch.url`, walks
 * `payloadPath`, reads `idField`/`scoreField`, normalizes `score / scoreMax` to
 * 0-1, joins via `join`, and applies with `fill`. No code execution — the
 * declaration is data, so adding a provider never runs untrusted code.
 */
export type SourceDeclaration = {
  id: string;
  label: string;
  metric: string;
  urlPatterns: string[];
  fetch: { url: string; method?: "GET" | "POST"; body?: unknown };
  payloadPath: string;
  idField: string;
  scoreField: string;
  scoreMax: number;
  join: JoinRule;
  fill: number;
};

const DECLARATION_ID_RE = /^[a-z0-9][a-z0-9_-]*$/;
/** External metric key: `<namespace>:<local>`, both dot-free. A shipped
 * `KNOWN_METRICS` key is colon-free, so this form can never collide with one. */
const EXTERNAL_METRIC_RE = /^[a-z0-9_-]+:[a-z0-9_-]+$/;

/** Validate a declaration. One error string per violation; empty = valid. */
export function validateDeclaration(decl: SourceDeclaration): string[] {
  const errors: string[] = [];
  if (!DECLARATION_ID_RE.test(decl.id)) errors.push(`id "${decl.id}" must match [a-z0-9_-]+`);
  if (decl.label.trim() === "") errors.push("label is required");
  if (!EXTERNAL_METRIC_RE.test(decl.metric)) {
    errors.push(`metric "${decl.metric}" must be <namespace>:<local> with no dots (a shipped metric key is colon-free, so this form cannot collide)`);
  }
  if (decl.urlPatterns.length === 0 || decl.urlPatterns.some((p) => typeof p !== "string" || p.trim() === "")) {
    errors.push("urlPatterns must be a non-empty list of strings");
  }
  if (decl.fetch.url.trim() === "") errors.push("fetch.url is required");
  if (decl.payloadPath.trim() === "") errors.push("payloadPath is required");
  if (decl.idField.trim() === "") errors.push("idField is required");
  if (decl.scoreField.trim() === "") errors.push("scoreField is required");
  if (!Number.isFinite(decl.scoreMax) || decl.scoreMax <= 0) errors.push("scoreMax must be a number > 0");
  if (decl.join !== "direct" && decl.join !== "slug-suffix" && decl.join !== "normalized") {
    errors.push(`join must be direct, slug-suffix or normalized, got ${JSON.stringify(decl.join)}`);
  }
  if (!Number.isFinite(decl.fill) || decl.fill < 0 || decl.fill > 1) errors.push("fill must be a number in [0, 1]");
  return errors;
}

/** Narrow an unknown value to a declaration, or return the validation error. */
export function parseSourceDeclaration(v: unknown): { declaration: SourceDeclaration } | { error: string } {
  if (!isRecord(v)) return { error: "source declaration is not an object" };
  const fetchRaw = isRecord(v.fetch) ? v.fetch : {};
  const decl: SourceDeclaration = {
    id: typeof v.id === "string" ? v.id : "",
    label: typeof v.label === "string" ? v.label : "",
    metric: typeof v.metric === "string" ? v.metric : "",
    urlPatterns: Array.isArray(v.urlPatterns) ? v.urlPatterns.filter((p): p is string => typeof p === "string") : [],
    fetch: {
      url: typeof fetchRaw.url === "string" ? fetchRaw.url : "",
      method: fetchRaw.method === "POST" ? "POST" : "GET",
      ...(fetchRaw.body !== undefined ? { body: fetchRaw.body } : {}),
    },
    payloadPath: typeof v.payloadPath === "string" ? v.payloadPath : "",
    idField: typeof v.idField === "string" ? v.idField : "",
    scoreField: typeof v.scoreField === "string" ? v.scoreField : "",
    scoreMax: typeof v.scoreMax === "number" ? v.scoreMax : Number.NaN,
    join: v.join === "slug-suffix" || v.join === "normalized" ? v.join : "direct",
    fill: typeof v.fill === "number" ? v.fill : 0.195,
  };
  const errors = validateDeclaration(decl);
  if (errors.length > 0) return { error: `source "${decl.id || "?"}": ${errors.join("; ")}` };
  return { declaration: decl };
}

/** The user-level declaration file, under the plugin's state dir. */
export function declaredSourcesPath(dir = agentDir()): string {
  return join(dir, "benchmark-sources.json");
}

/** Read the user-level declarations; a missing/unreadable file is `[]`, and an
 * invalid entry is warned and skipped (never fatal). */
export function loadDeclaredSources(dir = agentDir()): SourceDeclaration[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(declaredSourcesPath(dir), "utf8"));
  } catch {
    return [];
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.sources)) return [];
  const out: SourceDeclaration[] = [];
  for (const raw of parsed.sources) {
    const result = parseSourceDeclaration(raw);
    if ("error" in result) {
      console.error(`benchmark-sources: ${result.error}`);
      continue;
    }
    out.push(result.declaration);
  }
  return out;
}

/** Upsert one declaration (by id and by metric) into the user-level file. */
export function saveDeclaredSource(decl: SourceDeclaration, dir = agentDir()): { ok: true; path: string } | { ok: false; error: string } {
  const errors = validateDeclaration(decl);
  if (errors.length > 0) return { ok: false, error: errors.join("; ") };
  const path = declaredSourcesPath(dir);
  const next = loadDeclaredSources(dir).filter((d) => d.id !== decl.id && d.metric !== decl.metric);
  next.push(decl);
  mkdirSync(dir, { recursive: true });
  let mtimeBefore = 0;
  try {
    mtimeBefore = statSync(path).mtimeMs;
  } catch {
    mtimeBefore = 0;
  }
  const text = `${JSON.stringify({ sources: next }, null, 2)}\n`;
  if (writeConfigAtomic(path, text, mtimeBefore) === "conflict") {
    return { ok: false, error: `${path} changed while writing — retry` };
  }
  return { ok: true, path };
}

/** Walk a dot-separated path into a payload; `undefined` when any step is missing. */
function walkPath(value: unknown, path: string): unknown {
  let node: unknown = value;
  for (const key of path.split(".")) {
    if (!isRecord(node)) return undefined;
    node = node[key];
  }
  return node;
}

/** Execute a declaration deterministically: payload -> `Record<sourceId, score>` (0-1). */
export function executeDeclaration(decl: SourceDeclaration, payload: unknown): Record<string, number> | null {
  const rows = walkPath(payload, decl.payloadPath);
  if (!Array.isArray(rows)) return null;
  const out: Record<string, number> = {};
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const id: unknown = row[decl.idField];
    const score: unknown = row[decl.scoreField];
    if (typeof id !== "string" || typeof score !== "number" || !Number.isFinite(score)) continue;
    out[id] = Math.min(1, Math.max(0, score / decl.scoreMax));
  }
  return out;
}

/** Build a runtime source from a declaration. */
export function declarationToSource(decl: SourceDeclaration): BenchmarkSource {
  return {
    id: decl.id,
    label: decl.label,
    metric: decl.metric,
    urlPatterns: decl.urlPatterns,
    fetch: { url: decl.fetch.url, method: decl.fetch.method ?? "GET", ...(decl.fetch.body !== undefined ? { body: decl.fetch.body } : {}) },
    parse: (payload) => executeDeclaration(decl, payload),
    join: decl.join,
    cacheFile: `${decl.id}-fetched-data.json`,
    transform: "identity",
    fill: decl.fill,
    external: true,
    declaration: decl,
  };
}

/** The generic llm-stats benchmark as a declaration (the raw id is preserved
 * here for the fetch URL; the metric key is the normalized form). */
export function llmStatsBenchmarkDeclaration(rawId: string): SourceDeclaration {
  const local = normalizeMetricKey(rawId);
  return {
    id: `llm-stats-benchmark-${local}`,
    label: rawId,
    metric: `bench:${local}`,
    urlPatterns: [`llm-stats.com/benchmarks/${rawId}`],
    fetch: { url: `${LLM_STATS_BENCHMARK_URL}/${rawId}`, method: "GET" },
    payloadPath: "entries",
    idField: "model_id",
    scoreField: "normalized_score",
    scoreMax: 1,
    join: "direct",
    fill: 0.195,
  };
}

/** The generic llm-stats benchmark source for a raw benchmark id. */
export function genericBenchmarkSource(rawId: string): BenchmarkSource {
  const declaration = llmStatsBenchmarkDeclaration(rawId);
  return {
    ...declarationToSource(declaration),
    label: rawId,
    parse: parseLlmStatsBenchmark,
    labelFromPayload: (payload) => (isRecord(payload) && typeof payload.benchmark_name === "string" ? payload.benchmark_name : null),
  };
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/** Strip scheme/www/query/trailing slash so a link compares against a pattern. */
function normalizeLink(link: string): string {
  return link
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split(/[?#]/)[0]
    .replace(/\/+$/, "");
}

/** A pattern matches a link exactly, as a path prefix, or as a `*` glob. */
function matchesPattern(link: string, pattern: string): boolean {
  if (pattern.includes("*")) {
    const re = new RegExp(`^${pattern.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`, "i");
    return re.test(link);
  }
  return link === pattern || link.startsWith(`${pattern}/`);
}

/**
 * Resolve a link (or a bare benchmark id) to a source. Static sources' patterns
 * are checked first, so a link to a benchmark the plugin already ships resolves
 * to its existing metric; `llm-stats.com/benchmarks/<id>` and a bare id fall
 * back to the generic llm-stats benchmark source. `null` when nothing matches.
 */
export function resolveBenchmarkSource(link: string): BenchmarkSource | null {
  const normalized = normalizeLink(link);
  if (normalized === "") return null;
  for (const source of BENCHMARK_SOURCES) {
    if (source.urlPatterns.some((pattern) => matchesPattern(normalized, pattern))) return source;
  }
  const page = /^llm-stats\.com\/benchmarks\/([a-z0-9][a-z0-9._-]*)$/i.exec(normalized);
  if (page) return genericBenchmarkSource(page[1]);
  if (/^[a-z0-9][a-z0-9._-]*$/i.test(normalized)) return genericBenchmarkSource(normalized);
  return null;
}

/** Resolve a declared source by link, or `null`. */
export function declaredSourceForLink(link: string, declared: readonly SourceDeclaration[]): BenchmarkSource | null {
  const normalized = normalizeLink(link);
  if (normalized === "") return null;
  for (const decl of declared) {
    if (decl.urlPatterns.some((pattern) => matchesPattern(normalized, pattern))) return declarationToSource(decl);
  }
  return null;
}

/**
 * Metric -> source, for the engine's gating: a shipped static source, a declared
 * source, or the generic llm-stats benchmark for a `bench:<local>` key (the raw
 * id is the local part — correct for a dot-free id; a dotted id must be declared
 * so its raw form survives).
 */
export function sourceForMetric(metric: string, declared: readonly SourceDeclaration[] = []): BenchmarkSource | null {
  const staticSource = BENCHMARK_SOURCES.find((s) => s.metric === metric);
  if (staticSource) return staticSource;
  const decl = declared.find((d) => d.metric === metric);
  if (decl) return declarationToSource(decl);
  const generic = /^bench:([a-z0-9_-]+)$/.exec(metric);
  if (generic) return genericBenchmarkSource(generic[1]);
  return null;
}

// ---------------------------------------------------------------------------
// Join + apply
// ---------------------------------------------------------------------------

/** Join key for Design Arena ids: case-folded, separators stripped, trailing
 * dated snapshot removed — the endpoint's `gpt-4o` and llm-stats'
 * `gpt-4o-2024-08-06` both normalize to `gpt4o`. */
export function normalizeDesignId(id: string): string {
  return id.toLowerCase().replace(/[-_.]/g, "").replace(/(20\d{6}|\d{4})$/, "");
}

function modelKey(source: BenchmarkSource, id: string): string {
  return source.join === "normalized" ? normalizeDesignId(id) : id;
}

/** Map a source's scores onto llm-stats ids via the source's join rule. */
export function joinBenchmarkScores(source: BenchmarkSource, scores: Record<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  for (const [id, score] of Object.entries(scores)) {
    const key = source.join === "slug-suffix" ? (id.split("/")[1] ?? id) : source.join === "normalized" ? normalizeDesignId(id) : id;
    out.set(key, score);
  }
  return out;
}

/**
 * Join + set `metrics[source.metric]`, capability-filling uncovered models at
 * `source.fill` so absence is not a coverage penalty. Mirrors the raw score into
 * `source.rawField` when declared (e.g. `writingBench`).
 */
export function applyBenchmarkScores(models: Model[], source: BenchmarkSource, scores: Record<string, number>): { covered: number; imputed: number } {
  const byId = joinBenchmarkScores(source, scores);
  let covered = 0;
  let imputed = 0;
  for (const m of models) {
    const score = byId.get(modelKey(source, m.id));
    if (score !== undefined) {
      m.metrics[source.metric] = score;
      if (source.rawField !== undefined) (m as unknown as Record<string, unknown>)[source.rawField] = score;
      covered++;
    } else {
      m.metrics[source.metric] = source.fill;
      if (source.rawField !== undefined) (m as unknown as Record<string, unknown>)[source.rawField] = null;
      imputed++;
    }
  }
  return { covered, imputed };
}

// ---------------------------------------------------------------------------
// Cache chain
// ---------------------------------------------------------------------------

type ScoresCacheFile = { fetchedAt: string; source: string; scores: Record<string, number>; total?: number | null; meta?: BenchmarkPayloadMeta | null };

/** Daily cache: current when fetchedAt is the current UTC day; requireFresh=false accepts stale. */
function readScoresCache(path: string, requireFresh: boolean): ScoresCacheFile | null {
  let parsed: ScoresCacheFile;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8")) as ScoresCacheFile;
  } catch {
    return null;
  }
  if (typeof parsed?.scores !== "object" || parsed.scores === null) return null;
  if (requireFresh && parsed.fetchedAt?.slice(0, 10) !== new Date().toISOString().slice(0, 10)) return null;
  return parsed;
}

/** Pretty-printed with sorted keys for scannable diffs, mirroring the other caches. */
function writeScoresCache(path: string, fetchedAt: string, source: string, scores: Record<string, number>, total: number | null, meta: BenchmarkPayloadMeta | null): void {
  const cache: ScoresCacheFile = { fetchedAt, source, scores, total, meta };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(cache, null, 2));
  console.error(`wrote ${path}`);
}

/** Annotate a capped load: the llm-stats endpoint returns at most
 * `BENCHMARK_ENTRY_CAP` entries, so the loadable count (the post-fetch coverage
 * count) is below the payload's `total_models`. */
function annotateCappedLoad(source: BenchmarkSource, loaded: number, total: number | null): void {
  if (total !== null && loaded < total) {
    console.error(
      `${source.id}: loaded ${loaded}/${total} models — the endpoint caps entries at ${BENCHMARK_ENTRY_CAP}; ${source.metric} covers only the loadable ${loaded}`,
    );
  }
}

export type BenchmarkScores = {
  scores: Record<string, number>;
  label: string;
  /** Entries actually loaded — the post-fetch coverage count, never the catalog count. */
  loaded: number;
  /** The payload's declared total model count, when known. */
  total: number | null;
  /** The payload's per-entry trust summary; `null` when the payload carried no
   * entry flags (a declared/writing source) or the cache predates the field. */
  meta: BenchmarkPayloadMeta | null;
};

/** Fetch a URL as JSON (the cache chain and the authoring dry-run). Throws on a
 * non-200 or a non-JSON body. */
export async function fetchJson(url: string, method: "GET" | "POST" = "GET", body?: unknown): Promise<unknown> {
  const headers: Record<string, string> = { "user-agent": UA };
  const init: RequestInit = { method, headers, signal: AbortSignal.timeout(30_000) };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    headers["content-type"] = "application/json";
  }
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

/** Fetch a URL as text (the authoring step's page/API read). */
export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

/**
 * The cache -> fetch -> stale-cache chain, shared by every source: a fresh
 * same-day cache wins; otherwise the source is fetched live and cached; a stale
 * cache is the last resort. `null` only when all three fail (the caller then
 * leaves the metric unfilled and the role ranks on the rest of its weights).
 * An unusable payload is never cached, so the next run retries.
 */
export async function loadBenchmarkScores(source: BenchmarkSource, refresh: boolean, cacheDir = CACHE_DIR): Promise<BenchmarkScores | null> {
  const path = join(cacheDir, source.cacheFile);
  if (!refresh) {
    const cached = readScoresCache(path, true);
    if (cached) {
      console.error(`using cache ${path} (fetched ${cached.fetchedAt})`);
      const loaded = Object.keys(cached.scores).length;
      const total = cached.total ?? null;
      annotateCappedLoad(source, loaded, total);
      return { scores: cached.scores, label: source.label, loaded, total, meta: cached.meta ?? null };
    }
  }
  if (source.fetch) {
    try {
      const payload = await fetchJson(source.fetch.url, source.fetch.method, source.fetch.body);
      const parsed = parseBenchmarkPayload(source, payload);
      if (parsed && parsed.loaded > 0) {
        writeScoresCache(path, new Date().toISOString(), source.fetch.url, parsed.scores, parsed.total, parsed.meta);
        annotateCappedLoad(source, parsed.loaded, parsed.total);
        return { scores: parsed.scores, label: source.labelFromPayload?.(payload) ?? source.label, loaded: parsed.loaded, total: parsed.total, meta: parsed.meta };
      }
      console.error(`${source.id}: unexpected payload shape; skipping`);
    } catch (err) {
      console.error(`${source.id}: fetch failed (${err instanceof Error ? err.message : err})`);
    }
  }
  const stale = readScoresCache(path, false);
  if (stale) {
    console.error(`using stale cache ${path} (fetched ${stale.fetchedAt})`);
    const loaded = Object.keys(stale.scores).length;
    const total = stale.total ?? null;
    annotateCappedLoad(source, loaded, total);
    return { scores: stale.scores, label: source.label, loaded, total, meta: stale.meta ?? null };
  }
  return null;
}

type CatalogCacheFile = { fetchedAt: string; source: string; entries: BenchmarkCatalogEntry[] };

/** Daily cache: current when fetchedAt is the current UTC day; requireFresh=false accepts stale.
 * Exported for the shape-guard test (a cache predating `isCommunity` must be rejected). */
export function readCatalogCache(path: string, requireFresh: boolean): CatalogCacheFile | null {
  let parsed: CatalogCacheFile;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8")) as CatalogCacheFile;
  } catch {
    return null;
  }
  if (!Array.isArray(parsed?.entries)) return null;
  // A cache written before `isCommunity`/`modality` landed lacks the field;
  // refetch rather than silently reporting `undefined` (mirrors
  // `readEndpointsCache`). An empty catalog is still `null` (nothing to sample,
  // nothing to discover).
  const sample = parsed.entries[0];
  if (typeof sample !== "object" || sample === null || !("isCommunity" in sample) || !("modality" in sample)) return null;
  if (requireFresh && parsed.fetchedAt?.slice(0, 10) !== new Date().toISOString().slice(0, 10)) return null;
  return parsed;
}

/** Pretty-printed for scannable diffs, mirroring the other caches. */
function writeCatalogCache(path: string, fetchedAt: string, source: string, entries: BenchmarkCatalogEntry[]): void {
  const cache: CatalogCacheFile = { fetchedAt, source, entries };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(cache, null, 2));
  console.error(`wrote ${path}`);
}

/**
 * The catalog cache -> fetch -> stale-cache chain, mirroring `loadBenchmarkScores`:
 * a fresh same-day cache wins; otherwise the catalog is fetched live and cached;
 * a stale cache is the last resort. `null` only when all three fail. An unusable
 * payload is never cached, so the next run retries.
 */
export async function loadBenchmarkCatalog(refresh: boolean, cacheDir = CACHE_DIR): Promise<BenchmarkCatalogEntry[] | null> {
  const path = join(cacheDir, CATALOG_CACHE_FILE);
  if (!refresh) {
    const cached = readCatalogCache(path, true);
    if (cached) {
      console.error(`using cache ${path} (fetched ${cached.fetchedAt})`);
      return cached.entries;
    }
  }
  try {
    const payload = await fetchJson(LLM_STATS_BENCHMARK_URL);
    const entries = parseBenchmarkCatalog(payload);
    if (entries && entries.length > 0) {
      writeCatalogCache(path, new Date().toISOString(), LLM_STATS_BENCHMARK_URL, entries);
      return entries;
    }
    console.error("benchmark catalog: unexpected payload shape; skipping");
  } catch (err) {
    console.error(`benchmark catalog: fetch failed (${err instanceof Error ? err.message : err})`);
  }
  const stale = readCatalogCache(path, false);
  if (stale) {
    console.error(`using stale cache ${path} (fetched ${stale.fetchedAt})`);
    return stale.entries;
  }
  return null;
}

/** The cached trust inputs for one focus metric: the payload's per-entry trust
 * summary (from the source's scores cache) and the catalog row (from the catalog
 * cache). Either half is `null` when its cache is absent or predates the field. */
export type FocusSourceInfo = {
  payload?: BenchmarkPayloadMeta | null;
  catalog?: BenchmarkCatalogEntry | null;
};

/**
 * The cached trust inputs for a focus metric, with no network: the source's
 * scores cache (if any) for the payload meta, and the catalog cache (if any) for
 * the matching row. The metric is reverse-mapped to a catalog id through
 * `catalogMetric` (a shipped key via `SHIPPED_CATALOG_METRICS`, else the
 * `bench:<local>` form), so a shipped metric and a generic `bench:<id>` both
 * resolve. `null` for either half when the cache is absent or the metric is
 * unknown to the catalog.
 */
export function cachedSourceInfo(metric: string, declared: readonly SourceDeclaration[] = [], cacheDir = CACHE_DIR): FocusSourceInfo {
  const source = sourceForMetric(metric, declared);
  const payload = source === null ? null : readScoresCache(join(cacheDir, source.cacheFile), false)?.meta ?? null;
  const catalog = readCatalogCache(join(cacheDir, CATALOG_CACHE_FILE), false);
  return { payload, catalog: catalog?.entries.find((entry) => catalogMetric(entry.id) === metric) ?? null };
}

// ---------------------------------------------------------------------------
// Dry run (the authoring step's guardrail)
// ---------------------------------------------------------------------------

export type DeclarationDryRun =
  | { ok: true; covered: number; leader: { id: string; score: number } | null }
  | { ok: false; errors: string[] };

/**
 * Validate a declaration against a fetched payload: parse, join, and report the
 * coverage and the leader. With `models`, coverage is the joined model count and
 * a declaration that joins zero models is rejected; without, coverage is the
 * parsed row count.
 */
export function dryRunDeclaration(decl: SourceDeclaration, payload: unknown, models?: readonly Model[]): DeclarationDryRun {
  const errors = validateDeclaration(decl);
  if (errors.length > 0) return { ok: false, errors };
  const scores = executeDeclaration(decl, payload);
  if (scores === null) return { ok: false, errors: ["payload does not match payloadPath/idField/scoreField"] };
  const entries = Object.entries(scores);
  if (entries.length === 0) return { ok: false, errors: ["the declaration parsed zero rows"] };
  const leader = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
  if (models === undefined) return { ok: true, covered: entries.length, leader: { id: leader[0], score: leader[1] } };
  const source = declarationToSource(decl);
  const byId = joinBenchmarkScores(source, scores);
  const covered = models.filter((m) => byId.has(modelKey(source, m.id))).length;
  if (covered === 0) return { ok: false, errors: ["the declaration joins zero models"] };
  return { ok: true, covered, leader: { id: leader[0], score: leader[1] } };
}
