#!/usr/bin/env node
/**
 * Fetches the current llm-stats.com leaderboard and computes a best-fit
 * model ranking for each omp model role:
 *   default, smol, slow, vision, plan, commit, tiny, task, advisor
 *
 * Data sources:
 *   Quality: https://llm-stats.com/leaderboards/llm-leaderboard — the page
 *   server-renders its dataset into the Next.js RSC flight payload
 *   (`self.__next_f.push([1,"..."])` chunks ending in an `initialData: [...]`
 *   array). There is no public JSON API, so we extract that array.
 *   Throughput + price: OpenRouter per-endpoint p50 (last 30m routed traffic)
 *   and per-endpoint pricing — the sole sources; models without OpenRouter
 *   data are not ranked.
 *
 * Usage: node llm-role-rank.ts [--top N] [--json] [--out FILE] [--refresh] [--url URL]
 *
 * Caches the fetched leaderboard in llm-stats-fetched-rankings.json and the full
 * OpenRouter find response in openrouter-fetched-data.json; both are reused while
 * from the current UTC day; --refresh forces a refetch.
 */

import { readFileSync, writeFileSync } from "node:fs";

const DEFAULT_URL = "https://llm-stats.com/leaderboards/llm-leaderboard";
const CACHE_PATH = "llm-stats-fetched-rankings.json";
const OPENROUTER_CACHE_PATH = "openrouter-fetched-data.json";
const OPENROUTER_FIND_URL =
  "https://openrouter.ai/api/frontend/v1/models/find?active=true&fmt=cards&order=top-weekly";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LlmStatsRow = {
  model_id: string;
  name: string;
  organization: string;
  organization_id: string;
  context: number | null;
  release_date: string | null;
  multimodal: boolean | null;
  license: string | null;
  input_price: number | null; // $/M input tokens
  output_price: number | null; // $/M output tokens
  throughput: number | null; // output tok/s
  latency: number | null;
  // Index scores (0-100)
  index_general: number | null;
  index_reasoning: number | null;
  index_math: number | null;
  index_code: number | null;
  index_agents: number | null;
  index_search: number | null;
  index_vision: number | null;
  index_tool_calling: number | null;
  index_long_context: number | null;
  // Benchmarks (0-1)
  gpqa_score: number | null;
  aime_2025_score: number | null;
  swe_bench_verified_score: number | null;
  arc_agi_v2_score: number | null;
  mrcr_v2_score: number | null;
  terminal_bench_score: number | null;
  tau_bench_retail_score: number | null;
};

type Model = {
  id: string;
  name: string;
  org: string;
  orgId: string;
  context: number | null;
  multimodal: boolean;
  /** OpenRouter blended $/M (3:1 in:out, standard route); null until enrichment */
  price: number | null;
  /** output tok/s — OpenRouter p50 only; null when OpenRouter has no data */
  throughput: number | null;
  metrics: Record<string, number | null>;
};

type RoleDef = {
  description: string;
  /** metric -> weight; metrics are percentile-normalized across all models */
  weights: Record<string, number>;
  /** metrics the model must have to be ranked at all for this role */
  required: string[];
};

// ---------------------------------------------------------------------------
// Role definitions
//
// Metric keys:
//   general, reasoning, math, code, agents, search, vision, tool_calling,
//   long_context   -> llm-stats index_* (0-100)
//   gpqa, aime, swe_bench, arc_agi, mrcr, terminal_bench, tau_bench -> benchmarks (0-1)
//   price          -> OpenRouter blended $/M (3:1 in:out), inverted (cheaper = higher)
//   throughput     -> output tok/s (OpenRouter p50, last 30m routed traffic)
// ---------------------------------------------------------------------------

const ROLES: Record<string, RoleDef> = {
  default: {
    description: "Main workhorse: strong general coding-agent quality, sane cost",
    weights: { general: 0.3, code: 0.25, agents: 0.2, tool_calling: 0.1, reasoning: 0.1, price: 0.05 },
    required: ["general", "price", "throughput"],
  },
  smol: {
    description: "Fast lightweight model: cheap and quick, still competent",
    weights: { price: 0.3, throughput: 0.25, general: 0.2, code: 0.15, tool_calling: 0.1 },
    required: ["general", "price", "throughput"],
  },
  slow: {
    description: "Most capable model for hard problems; cost and speed as tiebreakers",
    weights: { general: 0.25, reasoning: 0.25, code: 0.2, agents: 0.15, math: 0.1, price: 0.03, throughput: 0.02 },
    required: ["general", "price", "throughput"],
  },
  vision: {
    description: "Image understanding: vision index dominates",
    weights: { vision: 0.5, general: 0.2, reasoning: 0.15, code: 0.1, price: 0.03, throughput: 0.02 },
    required: ["vision", "general", "price", "throughput"],
  },
  plan: {
    description: "Planning: reasoning, math, long-context coherence",
    weights: { reasoning: 0.3, math: 0.15, long_context: 0.2, general: 0.2, mrcr: 0.1, price: 0.03, throughput: 0.02 },
    required: ["reasoning", "general", "price", "throughput"],
  },
  commit: {
    description: "Commit messages: cheap and fast with decent general quality",
    weights: { price: 0.35, throughput: 0.25, general: 0.25, code: 0.15 },
    required: ["general", "price", "throughput"],
  },
  tiny: {
    description: "Background tasks (titles, memory): cheapest and fastest wins",
    weights: { price: 0.4, throughput: 0.35, general: 0.25 },
    required: ["general", "price", "throughput"],
  },
  task: {
    description: "Subagents: agentic + tool calling, moderate cost sensitivity",
    weights: { agents: 0.3, tool_calling: 0.2, code: 0.2, general: 0.15, price: 0.1, throughput: 0.05 },
    required: ["general", "price", "throughput"],
  },
  advisor: {
    description: "Advisor/watchdog: deep reasoning over long context",
    weights: { reasoning: 0.35, general: 0.25, long_context: 0.2, math: 0.1, search: 0.05, price: 0.03, throughput: 0.02 },
    required: ["reasoning", "general", "price", "throughput"],
  },
};

/** llm-stats org id -> omp provider id (best effort; first-party APIs only) */
const PROVIDER_BY_ORG: Record<string, string> = {
  openai: "openai",
  anthropic: "anthropic",
  google: "google",
  xai: "xai",
  deepseek: "deepseek",
};

// ---------------------------------------------------------------------------
// OpenRouter throughput + price (sole sources)
//
// Throughput: the OpenRouter models table (https://openrouter.ai/models?order=top-weekly)
// renders a Throughput column from `endpoint_perf` in this public endpoint's payload:
// per-endpoint p50 output tok/s and p50 latency over the last 30 minutes of routed traffic;
// the highest-p50 non-:batch variant wins (:free tiers included — they carry real traffic).
// Price: per-endpoint `pricing.prompt`/`pricing.completion` (USD/token strings, discounts
// already applied), blended to $/M at 3:1 input:output; the model's standard route wins,
// cheapest billed route as fallback — a $0 :free tier never sets the price.
// We join both by slug suffix (llm-stats ids are bare, OpenRouter slugs are provider-prefixed).
// They are the only sources used: throughput reflects real routed traffic across providers,
// where llm-stats measures a single provider (the two disagree wildly on some models), and
// OpenRouter pricing is what a caller actually pays on that router.
// ---------------------------------------------------------------------------

type OpenRouterPerf = { p50_latency: number | null; p50_throughput: number | null };

type OpenRouterFindData = {
  models: Array<{ slug: string; endpoint: { id: string; model_variant_permaslug: string | null; is_free: boolean | null } | null }>;
  endpoint_perf: Record<string, OpenRouterPerf>;
  /** endpoint id -> blended $/M (3:1 in:out); only endpoints with usable prompt+completion pricing */
  endpoint_price: Record<string, number>;
};

type OrEnrichment = { tput: number; latency: number | null; price: number | null };

/**
 * Build llm-stats model_id -> OpenRouter enrichment (p50 throughput, latency, blended price).
 * :batch variants are skipped (no perf data, half-price async tier). Throughput is the
 * highest-p50 variant, :free tiers included. Price is the standard route's blended $/M,
 * cheapest billed route as fallback — a $0 :free tier never sets the price.
 */
function buildOpenRouterEnrichment(data: OpenRouterFindData): Record<string, OrEnrichment> {
  const bySuffix: Record<string, Array<{ free: boolean; perf: OpenRouterPerf | null; price: number | null }>> = {};
  for (const m of data.models) {
    const ep = m.endpoint;
    if (!ep) continue;
    const variant = ep.model_variant_permaslug ?? "";
    if (variant.endsWith(":batch")) continue;
    const key = m.slug.split("/")[1] ?? m.slug;
    (bySuffix[key] ??= []).push({
      free: variant.endsWith(":free") || ep.is_free === true,
      perf: data.endpoint_perf[ep.id] ?? null,
      price: data.endpoint_price[ep.id] ?? null,
    });
  }
  const out: Record<string, OrEnrichment> = {};
  for (const [suffix, cands] of Object.entries(bySuffix)) {
    let tput: number | null = null;
    let latency: number | null = null;
    for (const c of cands) {
      const t = c.perf?.p50_throughput;
      if (t != null && (tput == null || t > tput)) {
        tput = t;
        latency = c.perf?.p50_latency ?? null;
      }
    }
    if (tput == null) continue;
    // Price: the standard (non-:free) route; cheapest billed route as fallback. A $0 free
    // tier must never set the price — it would dominate the cost percentiles.
    const billed: number[] = [];
    for (const c of cands) if (!c.free && c.price != null && c.price > 0) billed.push(c.price);
    const price = billed.length === 0 ? null : Math.min(...billed);
    out[suffix] = { tput, latency, price };
  }
  return out;
}

/** Set model throughput and price from OpenRouter where matched. Returns match counts. */
function applyOpenRouterData(models: Model[], orData: Record<string, OrEnrichment>): { matched: number; priced: number } {
  let matched = 0;
  let priced = 0;
  for (const m of models) {
    const or = orData[m.id];
    if (!or) continue;
    matched++;
    m.throughput = or.tput;
    m.metrics.throughput = or.tput;
    if (or.price != null) {
      priced++;
      m.price = or.price;
      m.metrics.price = or.price;
    }
  }
  return { matched, priced };
}

/** Validated find payload: `find` is narrowed for throughput/price derivation; `data` is the
 * full response.data object (every section the endpoint returned), stored verbatim in the cache. */
function parseFindData(v: unknown): { find: OpenRouterFindData; data: object } | null {
  if (typeof v !== "object" || v === null || !("data" in v)) return null;
  const d: unknown = v.data;
  if (typeof d !== "object" || d === null || !("models" in d) || !("endpoint_perf" in d)) return null;
  if (!Array.isArray(d.models) || typeof d.endpoint_perf !== "object" || d.endpoint_perf === null) return null;
  const perf: Record<string, OpenRouterPerf> = {};
  for (const [id, p] of Object.entries(d.endpoint_perf)) {
    if (typeof p !== "object" || p === null) continue;
    const latency = "p50_latency" in p && typeof p.p50_latency === "number" ? p.p50_latency : null;
    const tput = "p50_throughput" in p && typeof p.p50_throughput === "number" ? p.p50_throughput : null;
    perf[id] = { p50_latency: latency, p50_throughput: tput };
  }
  const price: Record<string, number> = {};
  for (const row of d.models) {
    const ep: unknown = (row as { endpoint?: unknown })?.endpoint;
    if (typeof ep !== "object" || ep === null) continue;
    const id: unknown = (ep as { id?: unknown }).id;
    const pr: unknown = (ep as { pricing?: unknown }).pricing;
    if (typeof id !== "string" || typeof pr !== "object" || pr === null) continue;
    const prompt = Number((pr as { prompt?: unknown }).prompt);
    const completion = Number((pr as { completion?: unknown }).completion);
    if (!Number.isFinite(prompt) || !Number.isFinite(completion) || prompt < 0 || completion < 0) continue;
    price[id] = ((3 * prompt + completion) / 4) * 1e6; // USD/token -> blended $/M, 3:1 in:out
  }
  return { find: { models: d.models, endpoint_perf: perf, endpoint_price: price }, data: d };
}

// Flight-payload extraction
// ---------------------------------------------------------------------------

/** Concatenate every `self.__next_f.push([1,"..."])` string in the page. */
function extractFlight(html: string): string {
  const marker = "self.__next_f.push([1,";
  let out = "";
  let i = html.indexOf(marker);
  while (i !== -1) {
    let p = i + marker.length;
    while (html[p] === " ") p++;
    if (html[p] === `"`) {
      let s = p + 1;
      let esc = false;
      while (s < html.length) {
        const c = html[s];
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === `"`) break;
        s++;
      }
      try {
        out += JSON.parse(html.slice(p, s + 1)) as string;
      } catch {
        // malformed chunk; skip
      }
      i = html.indexOf(marker, s + 1);
    } else {
      i = html.indexOf(marker, p);
    }
  }
  return out;
}

/** Extract the balanced JSON array that follows `key` in the flight buffer. */
function extractJsonArray(buf: string, key: string): unknown[] {
  const k = buf.indexOf(key);
  if (k === -1) throw new Error(`Key ${JSON.stringify(key)} not found in flight payload`);
  const start = buf.indexOf("[", k + key.length);
  if (start === -1) throw new Error(`No array after ${JSON.stringify(key)}`);
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < buf.length; i++) {
    const c = buf[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === `"`) inStr = false;
    } else if (c === `"`) inStr = true;
    else if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) return JSON.parse(buf.slice(start, i + 1)) as unknown[];
    }
  }
  throw new Error(`Unterminated array after ${JSON.stringify(key)}`);
}

// ---------------------------------------------------------------------------
// Normalization + scoring
// ---------------------------------------------------------------------------

/** Midrank percentile (0..1) per model for one metric; null-safe. */
function percentileNorm(models: Model[], key: string): Map<string, number> {
  const present = models
    .filter((m) => m.metrics[key] != null)
    .map((m) => [m.id, m.metrics[key] as number] as const)
    .sort((a, b) => a[1] - b[1]);
  const norm = new Map<string, number>();
  const n = present.length;
  if (n === 0) return norm;
  if (n === 1) {
    norm.set(present[0][0], 0.5);
    return norm;
  }
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && present[j + 1][1] === present[i][1]) j++;
    const mid = (i + j) / (2 * (n - 1)); // average 0-indexed rank of the tie group -> 0..1
    for (let k = i; k <= j; k++) norm.set(present[k][0], mid);
    i = j + 1;
  }
  return norm;
}

function buildModels(rows: LlmStatsRow[]): Model[] {
  // Price is OpenRouter-only (applyOpenRouterData); llm-stats input/output prices are unused.
  return rows.map((r) => ({
    id: r.model_id,
    name: r.name,
    org: r.organization,
    orgId: r.organization_id,
    context: r.context,
    multimodal: r.multimodal === true,
    price: null,
    throughput: null,
    metrics: {
      general: r.index_general,
      reasoning: r.index_reasoning,
      math: r.index_math,
      code: r.index_code,
      agents: r.index_agents,
      search: r.index_search,
      vision: r.index_vision,
      tool_calling: r.index_tool_calling,
      long_context: r.index_long_context,
      gpqa: r.gpqa_score,
      aime: r.aime_2025_score,
      swe_bench: r.swe_bench_verified_score,
      arc_agi: r.arc_agi_v2_score,
      mrcr: r.mrcr_v2_score,
      terminal_bench: r.terminal_bench_score,
      tau_bench: r.tau_bench_retail_score,
      price: null, // set by OpenRouter enrichment; inverted at scoring time (cheaper is better)
      throughput: null,
    },
  }));
}

type Ranked = { model: Model; score: number; parts: Record<string, number> };

function rankRole(role: string, def: RoleDef, models: Model[], norms: Record<string, Map<string, number>>): Ranked[] {
  const totalW = Object.values(def.weights).reduce((a, b) => a + b, 0);
  const ranked: Ranked[] = [];
  for (const m of models) {
    if (def.required.some((k) => m.metrics[k] == null)) continue;
    if (role === "vision" && !m.multimodal) continue;

    let score = 0;
    const parts: Record<string, number> = {};
    for (const [metric, w] of Object.entries(def.weights)) {
      let v = norms[metric]?.get(m.id);
      if (v == null) continue; // missing optional metric contributes nothing
      if (metric === "price") v = 1 - v; // cheaper is better
      parts[metric] = v;
      score += w * v;
    }
    ranked.push({ model: m, score: score / totalW, parts });
  }
  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------


/** Metric key -> column header abbreviation for the weighted-contribution columns. */
const METRIC_ABBR: Record<string, string> = {
  general: "gen",
  reasoning: "rea",
  math: "math",
  code: "code",
  agents: "ag",
  search: "sea",
  vision: "vis",
  tool_calling: "tool",
  long_context: "lc",
  mrcr: "mrcr",
  price: "price",
  throughput: "tput",
};

function formatRankings(
  rankings: Record<string, Ranked[]>,
  models: Model[],
  top: number,
  fetchedAt: string,
  orMatched: number,
  orPriced: number,
): string {
  const lines: string[] = [
    `llm-stats.com best-fit ranking per omp model role — ${models.length} models, ` +
      `${fetchedAt.slice(0, 10)}`,
    "Score = Σ weight × percentile per metric (1.0 = best). The columns after | show each",
    "metric's weighted contribution (weight × percentile); they sum to the score. price is",
    "the inverted (cheaper = better) percentile; — = metric missing (contributes 0).",
    "Abbr: gen=general rea=reasoning mat=math ag=agents tool=tool_calling lc=long_context",
    "sea=search vis=vision tput=throughput (code, price, mrcr as-is).",
  ];
  lines.push(
    `Throughput + price: OpenRouter (p50 tok/s, last 30m routed traffic; standard-route` +
      ` $/M 3:1 in:out), throughput ${orMatched}/${models.length}, priced ${orPriced}; models` +
      " without OpenRouter throughput or a billed route are not ranked.",
  );
  lines.push("");

  for (const [role, def] of Object.entries(ROLES)) {
    const ranked = rankings[role] ?? [];
    lines.push(`## @${role} — ${def.description}`);
    lines.push(
      `   weights: ${Object.entries(def.weights).map(([k, w]) => `${k}:${w}`).join(", ")}` +
        ` | eligible: ${ranked.length}`,
    );
    if (ranked.length === 0) {
      lines.push("   (no eligible models)", "");
      continue;
    }
    let header = "   #   score  model                          org            $/M    tok/s   ctx |";
    for (const k of Object.keys(def.weights)) header += ` ${METRIC_ABBR[k].padEnd(5)}`;
    lines.push(header);
    for (let i = 0; i < Math.min(top, ranked.length); i++) {
      const r = ranked[i];
      const m = r.model;
      const price =
        m.price == null ? "  —  " : `$${m.price < 10 ? m.price.toFixed(2) : m.price.toFixed(1)}`;
      const tokS = (m.throughput?.toFixed(0) ?? "—").padStart(5);
      const ctx =
        m.context == null
          ? "—"
          : m.context >= 1e6
            ? `${(m.context / 1e6).toFixed(1)}M`
            : `${Math.round(m.context / 1e3)}k`;
      let contribs = "";
      for (const [k, w] of Object.entries(def.weights)) {
        const p: number | undefined = r.parts[k];
        contribs += p == null ? "    —" : ` ${(w * p).toFixed(3)}`;
      }
      lines.push(
        `   ${String(i + 1).padStart(2)}  ${r.score.toFixed(3)}  ${m.name.padEnd(30).slice(0, 30)}  ` +
          `${m.org.padEnd(14).slice(0, 14)}  ${price}  ${tokS}   ${ctx}` +
          ` |${contribs}`,
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}

function formatModelRolesYaml(rankings: Record<string, Ranked[]>): string {
  const lines: string[] = [
    "# Suggested settings.modelRoles (best-fit #1 per role).",
    "# provider/model_id is best-effort: llm-stats org -> omp provider;",
    "# bare model_id means pick the provider yourself (OpenRouter etc.).",
    "modelRoles:",
  ];
  for (const role of Object.keys(ROLES)) {
    const best = rankings[role]?.[0];
    if (!best) continue;
    const provider = PROVIDER_BY_ORG[best.model.orgId];
    const selector = provider ? `${provider}/${best.model.id}` : best.model.id;
    const note = provider ? "" : `  # org: ${best.model.org}`;
    lines.push(`  ${role}: "${selector}"${note}`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

type CacheFile = {
  fetchedAt: string;
  source: string;
  modelCount: number;
  rankings: Array<LlmStatsRow & { rank: number }>;
};

/** Cache is current when its fetchedAt is the current UTC day. */
function readCache(path: string): CacheFile | null {
  let parsed: CacheFile;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8")) as CacheFile;
  } catch {
    return null;
  }
  const rows = parsed?.rankings;
  if (!Array.isArray(rows) || rows.length === 0 || !rows[0].model_id) return null;
  if (parsed.fetchedAt?.slice(0, 10) !== new Date().toISOString().slice(0, 10)) return null;
  return parsed;
}

function writeCache(path: string, fetchedAt: string, source: string, rows: LlmStatsRow[]): void {
  const cache: CacheFile = {
    fetchedAt,
    source,
    modelCount: rows.length,
    // Rows arrive in the site's leaderboard order; rank = array position.
    rankings: rows.map((r, i) => ({ rank: i + 1, ...r })),
  };
  writeFileSync(path, JSON.stringify(cache, null, 2));
  console.error(`wrote ${path}`);
}

type OrCacheFile = {
  fetchedAt: string;
  source: string;
  modelCount: number;
  /** Full find?fmt=cards data object — every section the endpoint returned. */
  data: object;
};

/** JSON with recursively sorted object keys (arrays keep order); the root keeps its given order. */
function sortedStringify(value: object): string {
  return JSON.stringify(
    value,
    (key, v: unknown) => {
      if (key === "" || v === null || typeof v !== "object" || Array.isArray(v)) return v;
      const sorted: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) sorted[k] = val;
      return sorted;
    },
    2,
  );
}

/** Daily cache: current when fetchedAt is the current UTC day; requireFresh=false accepts stale. */
function readOrCache(path: string, requireFresh: boolean): OrCacheFile | null {
  let parsed: OrCacheFile;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8")) as OrCacheFile;
  } catch {
    return null;
  }
  if (typeof parsed?.data !== "object" || parsed.data === null) return null;
  if (requireFresh && parsed.fetchedAt?.slice(0, 10) !== new Date().toISOString().slice(0, 10)) return null;
  return parsed;
}

/** Pretty-printed with sorted keys for scannable diffs; throughput and price are re-derived from data on read. */
function writeOrCache(path: string, fetchedAt: string, data: object, modelCount: number): void {
  const cache: OrCacheFile = { fetchedAt, source: OPENROUTER_FIND_URL, modelCount, data };
  writeFileSync(path, sortedStringify(cache));
  console.error(`wrote ${path}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let url = DEFAULT_URL;
  let top = 10;
  let asJson = false;
  let outPath: string | null = null;
  let refresh = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--top") top = Number(args[++i]);
    else if (args[i] === "--json") asJson = true;
    else if (args[i] === "--out") outPath = args[++i];
    else if (args[i] === "--refresh") refresh = true;
    else if (args[i] === "--url") url = args[++i];
    else if (args[i] === "--help" || args[i] === "-h") {
      console.log("Usage: node llm-role-rank.ts [--top N] [--json] [--out FILE] [--refresh] [--url URL]");
      process.exit(0);
    }
  }

  const cached = refresh ? null : readCache(CACHE_PATH);
  let rows: LlmStatsRow[];
  let fetchedAt: string;
  let source: string;
  if (cached) {
    rows = cached.rankings;
    fetchedAt = cached.fetchedAt;
    source = cached.source;
    console.error(`using cache ${CACHE_PATH} (fetched ${fetchedAt})`);
  } else {
    const res = await fetch(url, { headers: { "user-agent": UA } });
    if (!res.ok) throw new Error(`Fetch failed: HTTP ${res.status} for ${url}`);
    const flight = extractFlight(await res.text());
    rows = extractJsonArray(flight, `"initialData":`) as LlmStatsRow[];
    if (!Array.isArray(rows) || rows.length === 0 || !rows[0].model_id) {
      throw new Error("Could not extract leaderboard rows from page payload");
    }
    fetchedAt = new Date().toISOString();
    source = url;
    writeCache(CACHE_PATH, fetchedAt, source, rows);
  }

  const models = buildModels(rows);

  // OpenRouter per-endpoint p50 throughput (last 30m routed traffic) and per-endpoint
  // pricing — the sole throughput and price sources. The full find data object is cached
  // daily in OPENROUTER_CACHE_PATH and the enrichment map is re-derived from it; non-fatal
  // on failure (affected models simply lack throughput/price and are not ranked; stale
  // cache as last resort).
  let orMatched = 0;
  let orPriced = 0;
  let orData: Record<string, OrEnrichment> | null = null;
  const cachedOr = refresh ? null : readOrCache(OPENROUTER_CACHE_PATH, true);
  if (cachedOr) {
    const parsed = parseFindData(cachedOr);
    if (parsed) {
      orData = buildOpenRouterEnrichment(parsed.find);
      console.error(`using cache ${OPENROUTER_CACHE_PATH} (fetched ${cachedOr.fetchedAt})`);
    } else {
      console.error(`${OPENROUTER_CACHE_PATH}: unexpected payload shape; refetching`);
    }
  }
  if (!orData) {
    let cacheData: object | null = null;
    let cacheCount = 0;
    try {
      const orRes = await fetch(OPENROUTER_FIND_URL, { headers: { "user-agent": UA } });
      if (!orRes.ok) {
        console.error(`openrouter fetch failed: HTTP ${orRes.status}`);
      } else {
        const parsed = parseFindData(await orRes.json());
        if (!parsed) {
          console.error("openrouter: unexpected payload shape; skipping enrichment");
        } else {
          const built = buildOpenRouterEnrichment(parsed.find);
          // An empty map would poison the whole day; leave uncached so the next run retries.
          if (Object.keys(built).length === 0) {
            console.error("openrouter: no enrichment data extracted; not caching");
          } else {
            orData = built;
            cacheData = parsed.data;
            cacheCount = parsed.find.models.length;
          }
        }
      }
    } catch {
      console.error("openrouter fetch failed");
    }
    if (orData && cacheData) {
      writeOrCache(OPENROUTER_CACHE_PATH, new Date().toISOString(), cacheData, cacheCount);
    }
    if (!orData) {
      // Fetch failed: a stale cache still beats losing ~100 models of coverage.
      const stale = readOrCache(OPENROUTER_CACHE_PATH, false);
      const staleParsed = stale ? parseFindData(stale) : null;
      if (staleParsed) {
        orData = buildOpenRouterEnrichment(staleParsed.find);
        console.error(`using stale cache ${OPENROUTER_CACHE_PATH} (fetched ${stale?.fetchedAt})`);
      }
    }
  }
  if (orData) {
    ({ matched: orMatched, priced: orPriced } = applyOpenRouterData(models, orData));
    console.error(`openrouter: matched ${orMatched}/${models.length} models (throughput), ${orPriced} priced`);
  }

  // Percentile-normalize every metric once; reused across roles.
  const metricKeys = new Set<string>();
  for (const def of Object.values(ROLES)) for (const k of Object.keys(def.weights)) metricKeys.add(k);
  const norms: Record<string, Map<string, number>> = {};
  for (const k of metricKeys) norms[k] = percentileNorm(models, k);

  const rankings: Record<string, Ranked[]> = {};
  for (const [role, def] of Object.entries(ROLES)) rankings[role] = rankRole(role, def, models, norms);

  let report: string;
  if (asJson) {
    const payload: Record<string, unknown> = {
      fetchedAt,
      source,
      modelCount: models.length,
      roles: Object.fromEntries(
        Object.entries(rankings).map(([role, ranked]) => [
          role,
          ranked.slice(0, top).map((r, i) => ({
            rank: i + 1,
            modelId: r.model.id,
            name: r.model.name,
            organization: r.model.org,
            score: Number(r.score.toFixed(4)),
            priceBlendedUsdPerM: r.model.price,
            throughputTokS: r.model.throughput,
            contextTokens: r.model.context,
          })),
        ]),
      ),
    };
    report = JSON.stringify(payload, null, 2);
  } else {
    report =
      formatRankings(rankings, models, top, fetchedAt, orMatched, orPriced) + "\n" + formatModelRolesYaml(rankings) + "\n";
  }

  if (outPath) {
    writeFileSync(outPath, report);
    console.error(`wrote ${outPath}`);
  } else {
    console.log(report);
  }
}

main().catch((err) => {
  console.error(`error: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
