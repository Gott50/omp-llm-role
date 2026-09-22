/**
 * Ranking engine for the omp model roles: fetches the llm-stats.com
 * leaderboard, enriches it with OpenRouter per-endpoint p50 throughput and
 * pricing, and computes percentile-weighted best-fit rankings per role.
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
 * Both datasets are cached daily (UTC) next to this module's repo root; the
 * cache is reused while from the current UTC day. Callers:
 *   - llm-role-rank.ts (CLI report)
 *   - src/updater.ts    (plugin actuator)
 *
 * Dual-runtime rule: only `node:` builtins + global fetch; relative imports
 * with explicit `.ts` extensions (runs under Node type-stripping and Bun).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_URL = "https://llm-stats.com/leaderboards/llm-leaderboard";
// Caches resolve against the repo root (this module lives in <repo>/src), never
// against cwd: the plugin runs with arbitrary cwd inside omp, while the CLI
// keeps using the same root-level cache files as before the extraction.
const ENGINE_DIR = dirname(fileURLToPath(import.meta.url)); // <repo>/src
const REPO_ROOT = dirname(ENGINE_DIR); // <repo>
const CACHE_PATH = join(REPO_ROOT, "llm-stats-fetched-rankings.json");
const OPENROUTER_CACHE_PATH = join(REPO_ROOT, "openrouter-fetched-data.json");
const OPENROUTER_FIND_URL =
  "https://openrouter.ai/api/frontend/v1/models/find?active=true&fmt=cards&order=top-weekly";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LlmStatsRow = {
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

export type Model = {
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

export type RoleDef = {
  description: string;
  /** metric -> weight; metrics are percentile-normalized across all models */
  weights: Record<string, number>;
  /** metrics the model must have to be ranked at all for this role */
  required: string[];
  /** schema-capability filters applied before ranking eligibility */
  filters?: { image?: boolean };
};

export type Ranked = { model: Model; score: number; qScore: number; parts: Record<string, number> };

export type RankData = {
  models: Model[];
  fetchedAt: string;
  source: string;
  orMatched: number;
  orPriced: number;
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

export type OrEnrichment = { tput: number; latency: number | null; price: number | null };

/**
 * Build llm-stats model_id -> OpenRouter enrichment (p50 throughput, latency, blended price).
 * :batch variants are skipped (no perf data, half-price async tier). Throughput is the
 * highest-p50 variant, :free tiers included. Price is the standard route's blended $/M,
 * cheapest billed route as fallback — a $0 :free tier never sets the price.
 */
export function buildOpenRouterEnrichment(data: OpenRouterFindData): Record<string, OrEnrichment> {
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
export function applyOpenRouterData(models: Model[], orData: Record<string, OrEnrichment>): { matched: number; priced: number } {
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
export function parseFindData(v: unknown): { find: OpenRouterFindData; data: object } | null {
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
    if (typeof row !== "object" || row === null || !("endpoint" in row)) continue;
    const ep: unknown = row.endpoint;
    if (typeof ep !== "object" || ep === null || !("id" in ep) || !("pricing" in ep)) continue;
    const id: unknown = ep.id;
    const pr: unknown = ep.pricing;
    if (typeof id !== "string" || typeof pr !== "object" || pr === null) continue;
    const prompt = "prompt" in pr ? Number(pr.prompt) : Number.NaN;
    const completion = "completion" in pr ? Number(pr.completion) : Number.NaN;
    if (!Number.isFinite(prompt) || !Number.isFinite(completion) || prompt < 0 || completion < 0) continue;
    price[id] = ((3 * prompt + completion) / 4) * 1e6; // USD/token -> blended $/M, 3:1 in:out
  }
  return { find: { models: d.models, endpoint_perf: perf, endpoint_price: price }, data: d };
}

// Flight-payload extraction
// ---------------------------------------------------------------------------

/** Concatenate every `self.__next_f.push([1,"..."])` string in the page. */
export function extractFlight(html: string): string {
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
export function extractJsonArray(buf: string, key: string): unknown[] {
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
export function percentileNorm(models: Model[], key: string): Map<string, number> {
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

export function buildModels(rows: LlmStatsRow[]): Model[] {
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

export function rankRole(def: RoleDef, models: Model[], norms: Record<string, Map<string, number>>): Ranked[] {
  const totalW = Object.values(def.weights).reduce((a, b) => a + b, 0);
  const ranked: Ranked[] = [];
  for (const m of models) {
    if (def.required.some((k) => m.metrics[k] == null)) continue;
    if (def.filters?.image && !m.multimodal) continue;

    let score = 0;
    const parts: Record<string, number> = {};
    for (const [metric, w] of Object.entries(def.weights)) {
      let v = norms[metric]?.get(m.id);
      if (v == null) continue; // missing optional metric contributes nothing
      if (metric === "price") v = 1 - v; // cheaper is better
      parts[metric] = v;
      score += w * v;
    }
    const wPrice = def.weights.price ?? 0;
    const qScore =
      wPrice > 0 ? (score - wPrice * parts.price) / (totalW - wPrice) : score / totalW;
    ranked.push({ model: m, score: score / totalW, qScore, parts });
  }
  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

/** Ids of undominated models: no other ranked model is both cheaper and at least as good
 * (price-free score). Equal price+score ties leave both on the frontier. */
export function paretoFrontier(ranked: Ranked[]): Set<string> {
  const frontier = new Set<string>();
  for (const a of ranked) {
    const dominated = ranked.some(
      (b) =>
        b.model.id !== a.model.id &&
        b.model.price != null &&
        a.model.price != null &&
        b.model.price <= a.model.price &&
        b.qScore >= a.qScore &&
        (b.model.price < a.model.price || b.qScore > a.qScore),
    );
    if (!dominated) frontier.add(a.model.id);
  }
  return frontier;
}

// ---------------------------------------------------------------------------
// Daily caches
// ---------------------------------------------------------------------------

type CacheFile = {
  fetchedAt: string;
  source: string;
  modelCount: number;
  rankings: Array<LlmStatsRow & { rank: number }>;
};

/** Cache is current when its fetchedAt is the current UTC day. */
export function readCache(path: string): CacheFile | null {
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

export function writeCache(path: string, fetchedAt: string, source: string, rows: LlmStatsRow[]): void {
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
export function sortedStringify(value: object): string {
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
export function readOrCache(path: string, requireFresh: boolean): OrCacheFile | null {
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
export function writeOrCache(path: string, fetchedAt: string, data: object, modelCount: number): void {
  const cache: OrCacheFile = { fetchedAt, source: OPENROUTER_FIND_URL, modelCount, data };
  writeFileSync(path, sortedStringify(cache));
  console.error(`wrote ${path}`);
}

// ---------------------------------------------------------------------------
// Data load + ranking (shared by the CLI and the plugin)
// ---------------------------------------------------------------------------

/**
 * The cache -> fetch -> stale-cache chain from the original main(): a fresh
 * same-day llm-stats cache wins; otherwise the leaderboard is fetched live and
 * cached; OpenRouter enrichment reuses its own fresh cache, else fetches, else
 * falls back to a stale cache (non-fatal — affected models just go unranked).
 * Throws only when llm-stats has neither fresh cache nor a usable fetch (§9 abort).
 */
export async function loadRankData(opts?: { refresh?: boolean; url?: string }): Promise<RankData> {
  const refresh = opts?.refresh ?? false;
  const url = opts?.url ?? DEFAULT_URL;

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

  return { models, fetchedAt, source, orMatched, orPriced };
}

/**
 * Percentile-normalize every metric referenced by `roles` once, then rank each
 * role. `roles` comes from resolved settings (shipped defaults and/or user-defined
 * role weight sets), not a hardcoded table.
 */
export function computeRankings(models: Model[], roles: Record<string, RoleDef>): Record<string, Ranked[]> {
  const metricKeys = new Set<string>();
  for (const def of Object.values(roles)) for (const k of Object.keys(def.weights)) metricKeys.add(k);
  const norms: Record<string, Map<string, number>> = {};
  for (const k of metricKeys) norms[k] = percentileNorm(models, k);

  const rankings: Record<string, Ranked[]> = {};
  for (const [role, def] of Object.entries(roles)) rankings[role] = rankRole(def, models, norms);
  return rankings;
}
