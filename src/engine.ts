/**
 * Ranking engine for the omp model roles: fetches the llm-stats.com
 * leaderboard, enriches it with OpenRouter per-endpoint p50 throughput and
 * pricing, and computes per-role value rankings: a cardinal quality composite q
 * minus a λ·($/M) cost penalty, with fixed-anchor metric transforms.
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
const OPENROUTER_ENDPOINTS_CACHE_PATH = join(REPO_ROOT, "openrouter-endpoints-fetched-data.json");
/** Model pages are ~1-2 MB of RSC flight each; fetched with a small worker pool. */
const OPENROUTER_PAGE_CONCURRENCY = 8;
const DESIGN_ARENA_CACHE_PATH = join(REPO_ROOT, "designarena-fetched-data.json");
const DESIGN_ARENA_URL = "https://www.designarena.ai/api/leaderboard";
/** Minimum battles for an endpoint Elo to be trusted over the OR mirror's snapshot. */
const DESIGN_MIN_BATTLES = 300;
/** Below-median fill for sparse capability metrics, keyed by metric name. A model
 * missing one of these metrics is scored at the fill instead of 0, so absence is
 * not a coverage penalty. The scalar is the percentile implied by the uncovered
 * cohort's mean general index (29.8 vs covered 38.2) — a property of the fill
 * policy, not the metric, so `website` and `long_context` share it. Metrics not
 * listed here keep the 0-fill (a missing value contributes nothing). */
export const CAPABILITY_FILL: Record<string, number> = { website: 0.195, long_context: 0.195 };
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
  /** supports reasoning (OpenRouter `supports_reasoning`) — the fallback gate
   * for the role's thinking price factor and the selector suffix at write
   * time; the omp catalog's per-model level list (`thinkingLevels`) wins when
   * present */
  thinking: boolean;
  /** omp catalog `thinking[]` for the joined model (per-model level list), set
   * by `enrichThinkingLevels` when the catalog is available. Undefined = no
   * catalog data — the ranking falls back to the `supports_reasoning` flag. */
  thinkingLevels?: string[];
  /** OpenRouter blended $/M (3:1 in:out, standard route); null until enrichment */
  price: number | null;
  /** output tok/s — OpenRouter p50 only; null when OpenRouter has no data */
  throughput: number | null;
  /** Design Arena `models-website` Elo (raw; the OpenRouter `benchmarks[permaslug].da`
   * mirror merged with the keyless designarena.ai endpoint, see `mergeDesignElo`);
   * null when the model has no Design Arena data — `metrics.website` is then
   * imputed, see `applyDesignPercentiles` */
  designElo: number | null;
  /** Design Arena `agents/agon_webapps` Elo (raw, from the designarena.ai
   * endpoint); report context only, never scored. null when the model has no
   * board row. */
  designEloAgents: number | null;
  metrics: Record<string, number | null>;
};

export type RoleDef = {
  description: string;
  /** Shipped-default opt-in gate. `false` drops the role from the resolved set
   * (like `weights: null`), so a role that ships disabled is not ranked and its
   * sources are not fetched until a user override sets `enabled: true`. Absent
   * = enabled. */
  enabled?: boolean;
  /** metric -> weight; metrics are cardinal-normalized with fixed anchors */
  weights: Record<string, number>;
  /** metrics the model must have to be ranked at all for this role */
  required: string[];
  /** schema-capability filters applied before ranking eligibility */
  filters?: { image?: boolean };
  /** explicit λ override ($ per quality point); default derives from the price weight */
  lambda?: number;
  /** thinking level appended to the role's selector (`:level`) when the chosen
   * catalog entry supports thinking; absent = bare (session default level).
   * Also scales the price axis for ranking (thinkingPriceFactor). */
  thinking?: SuffixLevel;
};

/** One role's ranking: `q` is the price-free quality composite (parts sum to it),
 * `value = q − λ·priceEff` is the sort key — `priceEff` is the billed blend scaled
 * by the role's thinking factor when the model supports thinking. */
export type Ranked = { model: Model; value: number; q: number; priceEff: number; parts: Record<string, number> };

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
// Two payloads, joined to llm-stats by slug suffix (llm-stats ids are bare):
// - find?fmt=cards: ONE endpoint row per model — the route currently getting the
//   traffic — with its p50 (last 30m routed traffic) and pricing.
// - model pages (https://openrouter.ai/<slug>, RSC flight): EVERY provider route
//   of a model — pricing, service tier, status, and routed-traffic p50 stats.
//
// OpenRouter's default routing is price-based load balancing: a request goes to
// ONE provider, picked among the stable standard-tier routes with probability
// proportional to 1/price² (docs: "select one weighted by inverse square of the
// price"). The enrichment is therefore the expected value over that distribution:
// price = Σ(1/p²)·p / Σ(1/p²), throughput = Σ(1/p²)·t / Σ(1/p²) over the routes
// that have throughput data (renormalized — a provider without recent traffic
// can't contribute). flex/priority service tiers are excluded (only the :floor /
// :nitro variants make them eligible), as are degraded routes (status ≠ 0 — they
// are fallbacks), :batch variants and $0 :free tiers (1/p² blows up at 0).
// Without page data the pool is the find route(s) alone (a :free variant never
// contributes there either — it is a separate slug default routing never requests);
// the pre-page max-p50/min-price path remains only for pools where no eligible
// route carries throughput.
// These are the only sources used: throughput reflects real routed traffic across
// providers, where llm-stats measures a single provider (the two disagree wildly),
// and OpenRouter pricing is what a caller actually pays on that router.
// ---------------------------------------------------------------------------

type OpenRouterPerf = { p50_latency: number | null; p50_throughput: number | null };

type OpenRouterFindData = {
  models: Array<{ slug: string; supports_reasoning: boolean | null; endpoint: { id: string; model_variant_permaslug: string | null; is_free: boolean | null; status: number | null } | null }>;
  endpoint_perf: Record<string, OpenRouterPerf>;
  /** endpoint id -> blended $/M (3:1 in:out); only endpoints with usable prompt+completion pricing */
  endpoint_price: Record<string, number>;
};

/** One provider route from a model page, narrowed: pricing blended to $/M (3:1
 * in:out), throughput/latency from the record's routed-traffic stats.
 * `serviceTier` null = the standard tier (the only tier default routing uses). */
export type OpenRouterEndpointRecord = {
  id: string;
  providerSlug: string;
  serviceTier: string | null;
  status: number;
  free: boolean;
  variant: string;
  price: number | null;
  tput: number | null;
  latency: number | null;
};

/** OR slug -> its provider routes, from the model pages. */
export type OpenRouterEndpointPages = Record<string, OpenRouterEndpointRecord[]>;

export type OrEnrichment = { tput: number; latency: number | null; price: number | null; thinking: boolean };

/**
 * Build llm-stats model_id -> OpenRouter enrichment (throughput, latency, blended
 * price, thinking support). :batch variants are skipped (no perf data, half-price
 * async tier). Price and throughput are the 1/price²-weighted means over the pool's
 * stable standard-tier billed routes — the expected values under OpenRouter's default
 * price-based load balancing. The pool is the page's per-provider routes plus any
 * find-row endpoint the page doesn't list; without page data it is the find route(s)
 * alone, so a :free variant never contributes there either (it is a separate slug
 * default routing never requests). Only when no eligible route carries throughput
 * does the pre-page behavior apply: throughput = highest-p50 variant (:free tiers
 * included — they carry real traffic and rescue otherwise-unranked models), price =
 * cheapest billed route — a $0 :free tier never sets the price. Thinking is any
 * variant row advertising `supports_reasoning`.
 */
export function buildOpenRouterEnrichment(data: OpenRouterFindData, pages?: OpenRouterEndpointPages): Record<string, OrEnrichment> {
  type Cand = { slug: string; id: string; free: boolean; think: boolean; status: number | null; variant: string; perf: OpenRouterPerf | null; price: number | null };
  const bySuffix: Record<string, Cand[]> = {};
  for (const m of data.models) {
    const ep = m.endpoint;
    if (!ep) continue;
    const variant = ep.model_variant_permaslug ?? "";
    if (variant.endsWith(":batch")) continue;
    const key = m.slug.split("/")[1] ?? m.slug;
    (bySuffix[key] ??= []).push({
      slug: m.slug,
      id: ep.id,
      free: variant.endsWith(":free") || ep.is_free === true,
      think: m.supports_reasoning === true,
      status: ep.status,
      variant,
      perf: data.endpoint_perf[ep.id] ?? null,
      price: data.endpoint_price[ep.id] ?? null,
    });
  }
  const out: Record<string, OrEnrichment> = {};
  for (const [suffix, cands] of Object.entries(bySuffix)) {
    // Pool of default-routing candidates: the page's per-provider routes, plus any
    // find-row endpoint the page doesn't list (the page is normally a superset).
    const pool: Record<string, OpenRouterEndpointRecord> = {};
    for (const c of cands) {
      const page = pages?.[c.slug];
      if (!page) continue;
      for (const rec of page) if (pool[rec.id] === undefined) pool[rec.id] = rec;
    }
    for (const c of cands) {
      if (pool[c.id] !== undefined) continue;
      pool[c.id] = {
        id: c.id,
        providerSlug: "",
        serviceTier: null,
        status: c.status ?? 1, // unknown status is not a stable route
        free: c.free,
        variant: c.variant,
        price: c.price,
        tput: c.perf?.p50_throughput ?? null,
        latency: c.perf?.p50_latency ?? null,
      };
    }
    const eligible = Object.values(pool).filter(
      (r) => r.serviceTier === null && r.status === 0 && !r.free && r.price !== null && r.price > 0 && !r.variant.endsWith(":batch"),
    );
    const withTput = eligible.filter((r) => r.tput !== null);
    if (eligible.length > 0 && withTput.length > 0) {
      // Expected price/throughput of one request under price-based load balancing:
      // P(route i) ∝ 1/price_i². Throughput renormalizes over the routes with data.
      const weighted = eligible.map((r) => ({ r, w: 1 / (r.price * r.price) }));
      const wSum = weighted.reduce((a, x) => a + x.w, 0);
      const price = weighted.reduce((a, x) => a + x.w * x.r.price, 0) / wSum;
      const tputKnown = weighted.filter((x) => x.r.tput !== null);
      const tputW = tputKnown.reduce((a, x) => a + x.w, 0);
      const tput = tputKnown.reduce((a, x) => a + x.w * (x.r.tput ?? 0), 0) / tputW;
      const latKnown = tputKnown.filter((x) => x.r.latency !== null);
      const latW = latKnown.reduce((a, x) => a + x.w, 0);
      const latency = latW > 0 ? latKnown.reduce((a, x) => a + x.w * (x.r.latency ?? 0), 0) / latW : null;
      out[suffix] = { tput, latency, price, thinking: cands.some((c) => c.think) };
      continue;
    }
    // Fallback: the find route alone. Throughput is the highest-p50 variant, :free
    // tiers included (they carry real traffic); price is the cheapest billed route
    // — a $0 free tier must never set the price (it would dominate the cost percentiles).
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
    const billed: number[] = [];
    for (const c of cands) if (!c.free && c.price != null && c.price > 0) billed.push(c.price);
    const price = billed.length === 0 ? null : Math.min(...billed);
    out[suffix] = { tput, latency, price, thinking: cands.some((c) => c.think) };
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
    m.thinking = or.thinking;
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

// ---------------------------------------------------------------------------
// OpenRouter model pages: every provider route of a model (per-endpoint pricing,
// service tier, status and routed-traffic p50 stats), extracted from the RSC flight.
// ---------------------------------------------------------------------------

/** Narrow one page endpoint record; null when the row isn't the expected shape. */
function narrowEndpointRecord(row: unknown): OpenRouterEndpointRecord | null {
  if (typeof row !== "object" || row === null) return null;
  if (!("id" in row) || typeof row.id !== "string") return null;
  if (!("provider_slug" in row) || typeof row.provider_slug !== "string") return null;
  const tier = "service_tier" in row && typeof row.service_tier === "string" ? row.service_tier : null;
  const status = "status" in row && typeof row.status === "number" ? row.status : 1; // unknown ≠ stable
  const free = "is_free" in row && row.is_free === true;
  const variant = "model_variant_permaslug" in row && typeof row.model_variant_permaslug === "string" ? row.model_variant_permaslug : "";
  let price: number | null = null;
  if ("pricing" in row && typeof row.pricing === "object" && row.pricing !== null) {
    const prompt = "prompt" in row.pricing ? Number(row.pricing.prompt) : Number.NaN;
    const completion = "completion" in row.pricing ? Number(row.pricing.completion) : Number.NaN;
    if (Number.isFinite(prompt) && Number.isFinite(completion) && prompt >= 0 && completion >= 0) {
      price = ((3 * prompt + completion) / 4) * 1e6; // USD/token -> blended $/M, 3:1 in:out
    }
  }
  let tput: number | null = null;
  let latency: number | null = null;
  if ("stats" in row && typeof row.stats === "object" && row.stats !== null) {
    if ("p50_throughput" in row.stats && typeof row.stats.p50_throughput === "number") tput = row.stats.p50_throughput;
    if ("p50_latency" in row.stats && typeof row.stats.p50_latency === "number") latency = row.stats.p50_latency;
  }
  return { id: row.id, providerSlug: row.provider_slug, serviceTier: tier, status, free, variant, price, tput, latency };
}

/** Extract the per-provider endpoint records from a model page's RSC flight. The
 * page dehydrates the endpoint list as React-Query state — sometimes twice, one
 * copy without stats — so records merge by endpoint id, the stats-carrying copy winning. */
export function parseModelPage(html: string): OpenRouterEndpointRecord[] | null {
  const flight = extractFlight(html);
  const byId: Record<string, OpenRouterEndpointRecord> = {};
  let pos = 0;
  while (true) {
    const at = flight.indexOf('"queries":', pos);
    if (at === -1) break;
    pos = at + 10;
    let queries: unknown[];
    try {
      queries = extractJsonArray(flight.slice(at), '"queries":');
    } catch {
      continue;
    }
    for (const q of queries) {
      if (typeof q !== "object" || q === null) continue;
      const state: unknown = "state" in q ? q.state : null;
      if (typeof state !== "object" || state === null || !("data" in state)) continue;
      const data: unknown = state.data;
      if (!Array.isArray(data) || data.length === 0) continue;
      const first = data[0];
      if (typeof first !== "object" || first === null || !("id" in first) || !("provider_slug" in first)) continue;
      for (const row of data) {
        const rec = narrowEndpointRecord(row);
        if (!rec) continue;
        const prev = byId[rec.id];
        if (prev === undefined || (prev.tput === null && rec.tput !== null)) byId[rec.id] = rec;
      }
    }
  }
  const recs = Object.values(byId);
  return recs.length > 0 ? recs : null;
}

/** Fetch one model page and extract its provider records; one retry on transient
 * failure, permanent 404/410 gives up immediately. */
async function fetchPageRecords(slug: string): Promise<OpenRouterEndpointRecord[] | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`https://openrouter.ai/${slug}`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(30_000) });
      if (res.status === 404 || res.status === 410) return null;
      if (res.ok) return parseModelPage(await res.text());
    } catch {
      // timeout/network error: fall through to the retry
    }
  }
  return null;
}

/** Fetch the model pages for `slugs` with a small worker pool. A page that fails is
 * simply absent — those models keep the single-route find enrichment. */
async function fetchEndpointPages(slugs: string[]): Promise<OpenRouterEndpointPages> {
  const out: OpenRouterEndpointPages = {};
  const queue = [...slugs];
  const workers: Array<Promise<void>> = [];
  for (let i = 0; i < OPENROUTER_PAGE_CONCURRENCY && i < slugs.length; i++) {
    workers.push(
      (async () => {
        while (true) {
          const slug = queue.shift();
          if (slug === undefined) return;
          const recs = await fetchPageRecords(slug);
          if (recs) out[slug] = recs;
        }
      })(),
    );
  }
  await Promise.all(workers);
  const failed = slugs.length - Object.keys(out).length;
  console.error(
    `openrouter endpoints: ${Object.keys(out).length}/${slugs.length} model pages` +
      (failed > 0 ? `, ${failed} unavailable (those models keep the single-route fallback)` : ""),
  );
  return out;
}

/** Daily cache -> fetch -> stale-cache chain for the model pages, mirroring the find
 * cache; non-fatal throughout (missing slugs fall back to the find route). */
async function loadEndpointPages(slugs: string[], refresh: boolean): Promise<OpenRouterEndpointPages> {
  if (slugs.length === 0) return {};
  if (!refresh) {
    const cached = readEndpointsCache(OPENROUTER_ENDPOINTS_CACHE_PATH, true);
    if (cached) {
      console.error(`using cache ${OPENROUTER_ENDPOINTS_CACHE_PATH} (fetched ${cached.fetchedAt})`);
      return cached.slugs;
    }
  }
  try {
    const fetched = await fetchEndpointPages(slugs);
    if (Object.keys(fetched).length > 0) {
      writeEndpointsCache(OPENROUTER_ENDPOINTS_CACHE_PATH, new Date().toISOString(), fetched);
      return fetched;
    }
    console.error("openrouter endpoints: no pages fetched; trying stale cache");
  } catch (e) {
    console.error(`openrouter endpoints: ${e instanceof Error ? e.message : String(e)}; trying stale cache`);
  }
  const stale = readEndpointsCache(OPENROUTER_ENDPOINTS_CACHE_PATH, false);
  if (stale) console.error(`using stale cache ${OPENROUTER_ENDPOINTS_CACHE_PATH} (fetched ${stale.fetchedAt})`);
  return stale?.slugs ?? {};
}

/**
 * Design Arena `models-website` Elo -> the `website` metric: a percentile within
 * the design-covered population (the merged OR-mirror + endpoint field, see
 * `mergeDesignElo`). Models without Design Arena data get
 * `CAPABILITY_FILL.website` — the percentile implied by the uncovered cohort's
 * mean general index (29.8 vs the covered 38.2).
 *
 * Why capability-derived, not the covered median. The covered set is
 * self-selected (arena participation picks stronger, cheaper models), so the
 * covered median overstates an unmeasured model; the uncovered cohort's own
 * mean general index sits at the 0.195 percentile of the covered field. A
 * below-median covered model therefore still scores below the fill — that
 * residual inversion is documented in README Known quirks. (A regression fill
 * was rejected: a least-squares fit of percentile on the general index
 * saturates at 0 for ~19% of the uncovered eligible pool, and a
 * nearest-neighbour fill is discontinuous (0.49 jumps between models 0.06
 * index points apart); both also double-count capability that the
 * general/code/vision terms already carry — the fill takes one scalar, not a
 * re-fit of the capability axis.)
 *
 * The percentile is taken over every model with Design Arena data (not the role's
 * eligible pool), so the metric is role-independent and identical for every role
 * that weights it.
 */
export function applyDesignPercentiles(
  models: Model[],
  designElo: Record<string, number>,
): { covered: number; imputed: number } {
  for (const m of models) m.designElo = designElo[m.id] ?? null;
  const covered = models.filter((m) => m.designElo != null);
  if (covered.length === 0) {
    for (const m of models) m.metrics.website = null;
    return { covered: 0, imputed: 0 };
  }

  const sorted = [...covered].sort((a, b) => (a.designElo ?? 0) - (b.designElo ?? 0));
  const pct = new Map<string, number>();
  sorted.forEach((m, i) => pct.set(m.id, (i + 0.5) / sorted.length));

  let imputed = 0;
  for (const m of models) {
    const p = pct.get(m.id);
    if (p != null) {
      m.metrics.website = p;
      continue;
    }
    m.metrics.website = CAPABILITY_FILL.website; // capability-consistent: uncovered cohort mean general 29.8 vs covered 38.2
    imputed++;
  }
  return { covered: covered.length, imputed };
}

/** Validated find payload: `find` is narrowed for throughput/price derivation; `data` is the
 * full response.data object (every section the endpoint returned), stored verbatim in the cache;
 * `designElo` is the Design Arena `models-website` Elo keyed by llm-stats model id. */
export type ParsedFindData = { find: OpenRouterFindData; data: object; designElo: Record<string, number> } | null;

export function parseFindData(v: unknown): ParsedFindData {
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
  return { find: { models: d.models, endpoint_perf: perf, endpoint_price: price }, data: d, designElo: extractDesignElo(d.models, "benchmarks" in d ? d.benchmarks : null) };
}

/**
 * Design Arena `models-website` Elo -> llm-stats model id. The benchmark keys are
 * dated permaslugs (`anthropic/claude-opus-5-20260723`) while `models[].slug` is
 * bare (`anthropic/claude-opus-5`), so the join goes permaslug -> slug -> the bare
 * id the leaderboard uses. Only the `models-website` category is read: it is the
 * deepest design category that overlaps the ranked pool (116/131 entries, and the
 * same set as the category union among eligible models); `graphicdesign`/`logo`
 * cover image generators only, and `uicomponent` (r = 0.98 with website) is
 * redundant.
 */
function extractDesignElo(models: unknown[], benchmarks: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (typeof benchmarks !== "object" || benchmarks === null) return out;
  const suffixByPermaslug = new Map<string, string>();
  for (const row of models) {
    if (typeof row !== "object" || row === null) continue;
    const permaslug: unknown = "permaslug" in row ? row.permaslug : null;
    const slug: unknown = "slug" in row ? row.slug : null;
    if (typeof permaslug !== "string" || typeof slug !== "string") continue;
    suffixByPermaslug.set(permaslug, slug.split("/").pop() ?? slug);
  }
  for (const [permaslug, entry] of Object.entries(benchmarks)) {
    const suffix = suffixByPermaslug.get(permaslug);
    if (suffix === undefined || typeof entry !== "object" || entry === null) continue;
    const da: unknown = "da" in entry ? entry.da : null;
    if (typeof da !== "object" || da === null) continue;
    const byCategory: unknown = "elo_by_category" in da ? da.elo_by_category : null;
    if (typeof byCategory !== "object" || byCategory === null) continue;
    const elo: unknown = "models-website" in byCategory ? byCategory["models-website"] : null;
    if (typeof elo === "number") out[suffix] = elo;
  }
  return out;
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
// Cardinal scoring
// ---------------------------------------------------------------------------

/** Fixed dollar reference for λ derivation: a price weight share w means
 * $P_REF_USD buys w/(1−w) quality points. */
const P_REF_USD = 20;

/** llm-stats index_* metrics: interval scale with arbitrary zero (observed
 * −16..+60 across the field). Fixed affine anchors −20→0, +60→1 preserve
 * intervals; values outside the anchors extrapolate (no clamping — clamping
 * would destroy cardinality at the edges). */
const INDEX_METRICS: Record<string, true> = {
  general: true,
  reasoning: true,
  math: true,
  code: true,
  agents: true,
  search: true,
  vision: true,
  tool_calling: true,
  long_context: true,
};

/** Chance-level pass rates for benchmark metrics (guessing baseline = true zero
 * of skill). Benchmarks absent here guess ≈ 0 and use the raw pass rate. */
const BENCHMARK_CHANCE: Record<string, number> = {
  gpqa: 0.25, // 4-way multiple choice
};

/** Throughput log anchor: equal log-ratios count equally (10→0, 300→1 tok/s);
 * saturated outside the anchors (slower than the floor adds no speed value). */
const TPUT_MIN_TOKS = 10;
const TPUT_MAX_TOKS = 300;

/** Fixed-anchor cardinal transform for one metric value. Uses no field
 * statistics — the scale is sample-independent, unlike percentile ranks. */
export function cardinalMetric(metric: string, v: number): number {
  if (metric === "throughput") {
    const t = Math.log(v / TPUT_MIN_TOKS) / Math.log(TPUT_MAX_TOKS / TPUT_MIN_TOKS);
    return Math.min(1, Math.max(0, t));
  }
  const chance = BENCHMARK_CHANCE[metric];
  if (chance !== undefined) return (v - chance) / (1 - chance);
  if (INDEX_METRICS[metric]) return (v + 20) / 80;
  return v; // unclassed metric: already 0-1 (benchmark pass rate, or a percentile such as `website`)
}

/** λ ($ per quality point) for a role: explicit override wins; default derives
 * from the price weight's share — w_price/(1−w_price) quality points per $P_REF. */
export function roleLambda(def: RoleDef): number {
  if (def.lambda !== undefined) return def.lambda;
  const wPrice = def.weights.price ?? 0;
  if (wPrice <= 0) return 0; // quality-only role: cost is not a factor
  if (wPrice >= 1) return 1 / P_REF_USD; // pure-cost role: no quality blend to trade against
  return wPrice / (1 - wPrice) / P_REF_USD;
}
// ---------------------------------------------------------------------------
// Thinking-level price adjustment
// ---------------------------------------------------------------------------

/** Selector levels a role's `thinking` field may take (omp `provider/model[:level]`). */
export type SuffixLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | "auto";

export const SUFFIX_LEVELS: Record<SuffixLevel, true> = {
  off: true,
  minimal: true,
  low: true,
  medium: true,
  high: true,
  xhigh: true,
  max: true,
  auto: true,
};

/** Levels omp accepts for any thinking-capable model regardless of the model's
 * own effort list: `off` (reasoning off) and `auto` (model decides per turn). */
export const META_LEVELS: Record<string, true> = {
  off: true,
  auto: true,
};

/** Thinking tokens per unit of visible output, by level (coding-agent workload:
 * ~1-2k visible tokens/turn; effort budgets roughly double per step). `auto`
 * nets out to ~medium — models think when the turn warrants it. */
export const THINKING_TOKEN_OVERHEAD: Record<SuffixLevel, number> = {
  off: 0,
  minimal: 0.25,
  low: 0.75,
  medium: 1.5,
  high: 3,
  xhigh: 6,
  max: 12,
  auto: 1.5,
};

/** The 3:1 blend assumes output is 1/4 of the token mix; field-typical
 * input:output price ratio is 1:4, so the billed blend is (3ρ+1)/4·p_out and
 * thinking scales only the output share: factor = (3ρ+1+T)/(3ρ+1). */
const IO_PRICE_RATIO = 0.25;

/** Billed-blend multiplier for a role's thinking level (1 for `off`). */
export function thinkingPriceFactor(level: SuffixLevel): number {
  return (1 + 3 * IO_PRICE_RATIO + THINKING_TOKEN_OVERHEAD[level]) / (1 + 3 * IO_PRICE_RATIO);
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
    thinking: false,
    price: null,
    throughput: null,
    designElo: null,
    designEloAgents: null,
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
      price: null, // set by OpenRouter enrichment; the λ·$ penalty axis, never blended
      throughput: null,
      website: null, // set by applyDesignPercentiles (percentile + capability-consistent fill)
    },
  }));
}

export function rankRole(def: RoleDef, models: Model[]): Ranked[] {
  const wPrice = def.weights.price ?? 0;
  const qW = 1 - wPrice;
  const lambda = roleLambda(def);
  const levelFactor = def.thinking === undefined ? 1 : thinkingPriceFactor(def.thinking);
  const ranked: Ranked[] = [];
  for (const m of models) {
    if (def.required.some((k) => m.metrics[k] == null)) continue;
    if (def.filters?.image && !m.multimodal) continue;
    if (m.price == null) continue; // value needs a billed price

    // The factor assumes the model runs at the role's level. omp clamps
    // unsupported levels, so a model whose catalog thinking[] excludes the
    // level is priced bare — matching the updater, which appends no suffix in
    // that case. Catalog data wins when present; without it (standalone
    // ranking), the OR supports_reasoning flag gates.
    const levels = m.thinkingLevels;
    const runsAtLevel = levels
      ? levels.length > 0 && (def.thinking === undefined || META_LEVELS[def.thinking] === true || levels.includes(def.thinking))
      : m.thinking;
    const priceEff = levelFactor === 1 || !runsAtLevel ? m.price : m.price * levelFactor;

    let q = 0;
    const parts: Record<string, number> = {};
    for (const [metric, w] of Object.entries(def.weights)) {
      if (metric === "price") continue; // cost enters as the λ·$ penalty, not the blend
      const raw = m.metrics[metric];
      if (raw == null) {
        // Sparse capability metrics are capability-filled (below-median, not 0)
        // so absence is not a coverage penalty; every other metric contributes
        // nothing when missing.
        const fill = CAPABILITY_FILL[metric];
        if (fill === undefined) continue;
        const contrib = (w / qW) * fill;
        parts[metric] = contrib;
        q += contrib;
        continue;
      }
      const contrib = (w / qW) * cardinalMetric(metric, raw);
      parts[metric] = contrib;
      q += contrib;
    }
    ranked.push({ model: m, value: q - lambda * priceEff, q, priceEff, parts });
  }
  ranked.sort((a, b) => b.value - a.value);
  return ranked;
}

/** Ids of undominated models: no other ranked model is both cheaper and at least
 * as good (quality q), on the thinking-adjusted effective price. Equal
 * price+quality ties leave both on the frontier. */
export function paretoFrontier(ranked: Ranked[]): Set<string> {
  const frontier = new Set<string>();
  for (const a of ranked) {
    const dominated = ranked.some(
      (b) =>
        b.model.id !== a.model.id &&
        b.priceEff <= a.priceEff &&
        b.q >= a.q &&
        (b.priceEff < a.priceEff || b.q > a.q),
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

type DesignArenaEntry = { modelId: string; elo: number; battles: number; btStdErr: number | null; winRate: number | null };
type DesignArenaCacheFile = { fetchedAt: string; source: string; categories: Record<string, DesignArenaEntry[]> };

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

type EndpointsCacheFile = { fetchedAt: string; source: string; slugCount: number; slugs: OpenRouterEndpointPages };

/** Daily cache: current when fetchedAt is the current UTC day; requireFresh=false accepts stale. */
function readEndpointsCache(path: string, requireFresh: boolean): EndpointsCacheFile | null {
  let parsed: EndpointsCacheFile;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8")) as EndpointsCacheFile;
  } catch {
    return null;
  }
  if (typeof parsed?.slugs !== "object" || parsed.slugs === null || Object.keys(parsed.slugs).length === 0) return null;
  if (requireFresh && parsed.fetchedAt?.slice(0, 10) !== new Date().toISOString().slice(0, 10)) return null;
  return parsed;
}

/** Pretty-printed with sorted keys for scannable diffs, mirroring the other caches. */
function writeEndpointsCache(path: string, fetchedAt: string, slugs: OpenRouterEndpointPages): void {
  const cache: EndpointsCacheFile = {
    fetchedAt,
    source: "https://openrouter.ai/<slug> model pages (RSC flight)",
    slugCount: Object.keys(slugs).length,
    slugs,
  };
  writeFileSync(path, sortedStringify(cache));
  console.error(`wrote ${path}`);
}

/** Daily cache: current when fetchedAt is the current UTC day; requireFresh=false accepts stale. */
function readDesignArenaCache(path: string, requireFresh: boolean): DesignArenaCacheFile | null {
  let parsed: DesignArenaCacheFile;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8")) as DesignArenaCacheFile;
  } catch {
    return null;
  }
  if (typeof parsed?.categories !== "object" || parsed.categories === null) return null;
  if (requireFresh && parsed.fetchedAt?.slice(0, 10) !== new Date().toISOString().slice(0, 10)) return null;
  return parsed;
}

/** Pretty-printed with sorted keys for scannable diffs, mirroring the OpenRouter cache. */
function writeDesignArenaCache(path: string, fetchedAt: string, categories: Record<string, DesignArenaEntry[]>): void {
  const cache: DesignArenaCacheFile = { fetchedAt, source: DESIGN_ARENA_URL, categories };
  writeFileSync(path, sortedStringify(cache));
  console.error(`wrote ${path}`);
}

/** Join key for Design Arena ids: case-folded, separators stripped, trailing dated
 * snapshot removed — the endpoint's `gpt-4o` and llm-stats' `gpt-4o-2024-08-06`
 * both normalize to `gpt4o`. */
export function normalizeDesignId(id: string): string {
  return id.toLowerCase().replace(/[-_.]/g, "").replace(/(20\d{6}|\d{4})$/, "");
}

/** One leaderboard board from the keyless endpoint (no Authorization header —
 * verified 200 across categories); null on non-200, a thrown fetch, or an
 * unusable payload shape. Only rows with a string modelId and a number elo are
 * kept; battles coerces to 0 when absent. */
async function fetchDesignArenaBoard(arenaType: string, category: string): Promise<DesignArenaEntry[] | null> {
  try {
    const res = await fetch(DESIGN_ARENA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "user-agent": UA },
      body: JSON.stringify({ arenaType, category }),
    });
    if (!res.ok) {
      console.error(`design arena fetch failed: HTTP ${res.status} (${arenaType}/${category})`);
      return null;
    }
    const parsed: unknown = await res.json();
    if (typeof parsed !== "object" || parsed === null || !("data" in parsed)) return null;
    const rows: unknown = parsed.data;
    if (!Array.isArray(rows)) return null;
    const out: DesignArenaEntry[] = [];
    for (const row of rows) {
      if (typeof row !== "object" || row === null) continue;
      const modelId: unknown = "modelId" in row ? row.modelId : null;
      const elo: unknown = "elo" in row ? row.elo : null;
      if (typeof modelId !== "string" || typeof elo !== "number") continue;
      const battles: unknown = "battles" in row ? row.battles : 0;
      const btStdErr: unknown = "btStdErr" in row ? row.btStdErr : null;
      const winRate: unknown = "winRate" in row ? row.winRate : null;
      out.push({
        modelId,
        elo,
        battles: typeof battles === "number" ? battles : 0,
        btStdErr: typeof btStdErr === "number" ? btStdErr : null,
        winRate: typeof winRate === "number" ? winRate : null,
      });
    }
    return out;
  } catch {
    console.error(`design arena fetch failed (${arenaType}/${category})`);
    return null;
  }
}

/** Board rows -> llm-stats-id-keyed entries. Endpoint ids are undated and
 * separator-inconsistent (`claude-fable-5-1` vs `claude-fable-5.1`), so both
 * sides go through normalizeDesignId; duplicate llm-stats ids (dated
 * snapshots) keep the first row in leaderboard order and warn. */
function buildDesignArenaIndex(models: Model[], entries: DesignArenaEntry[]): Record<string, DesignArenaEntry> {
  const idByNorm: Record<string, string> = {};
  for (const m of models) {
    const key = normalizeDesignId(m.id);
    if (idByNorm[key] !== undefined) {
      console.error(`design arena: id collision ${idByNorm[key]}/${m.id} -> ${key}; keeping ${idByNorm[key]}`);
    } else {
      idByNorm[key] = m.id;
    }
  }
  const out: Record<string, DesignArenaEntry> = {};
  for (const e of entries) {
    const id = idByNorm[normalizeDesignId(e.modelId)];
    if (id !== undefined) out[id] = e;
  }
  return out;
}

/** The two Design Arena routes merged: start from the OR mirror
 * (`benchmarks[permaslug].da` — no battle counts, a snapshot of unknown sample
 * age) and let the endpoint override where its sample clears
 * DESIGN_MIN_BATTLES. Never average the two — same Elo family, mean diff
 * −1.0 (website) … −5.1 (svg), maxAbs 87; the endpoint wins only on sample
 * size, the OR mirror stays the fallback snapshot. */
function mergeDesignElo(orElo: Record<string, number>, da: Record<string, DesignArenaEntry> | null): Record<string, number> {
  const out: Record<string, number> = { ...orElo };
  if (da === null) return out;
  for (const [id, entry] of Object.entries(da)) {
    if (entry.battles >= DESIGN_MIN_BATTLES) out[id] = entry.elo;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Data load + ranking (shared by the CLI and the plugin)
// ---------------------------------------------------------------------------

/**
 * Design Arena keyless leaderboard endpoint (POST designarena.ai/api/leaderboard):
 * a fresher `models-website` board with battle counts — merged over the OR mirror
 * with a battles floor — plus the `agents/agon_webapps` Elo for the report. Same
 * cache -> fetch -> stale-cache chain as OpenRouter, non-fatal throughout: on
 * total failure the caller falls back to the OR mirror alone. Only called when a
 * ranked role weights `website` (see `loadRankData`).
 */
async function loadDesignArenaBoards(refresh: boolean): Promise<{ website: DesignArenaEntry[] | null; agon: DesignArenaEntry[] | null }> {
  const daBoards = [
    { key: "models/website", arenaType: "models", category: "website" },
    { key: "agents/agon_webapps", arenaType: "agents", category: "agon_webapps" },
  ];
  const boards: Record<string, DesignArenaEntry[]> = {};
  const cachedDa = refresh ? null : readDesignArenaCache(DESIGN_ARENA_CACHE_PATH, true);
  if (cachedDa) {
    for (const b of daBoards) {
      const entries = cachedDa.categories[b.key];
      if (entries && entries.length > 0) boards[b.key] = entries;
    }
    if (Object.keys(boards).length === daBoards.length) {
      console.error(`using cache ${DESIGN_ARENA_CACHE_PATH} (fetched ${cachedDa.fetchedAt})`);
    }
  }
  if (Object.keys(boards).length !== daBoards.length) {
    for (const b of daBoards) {
      const entries = await fetchDesignArenaBoard(b.arenaType, b.category);
      // An empty board is never cached (the next run retries) — the OR rule.
      if (entries !== null && entries.length > 0) boards[b.key] = entries;
    }
    if (Object.keys(boards).length > 0) {
      writeDesignArenaCache(DESIGN_ARENA_CACHE_PATH, new Date().toISOString(), boards);
    } else {
      const stale = readDesignArenaCache(DESIGN_ARENA_CACHE_PATH, false);
      for (const b of daBoards) {
        const entries = stale?.categories[b.key];
        if (entries && entries.length > 0) boards[b.key] = entries;
      }
      if (Object.keys(boards).length > 0) {
        console.error(`using stale cache ${DESIGN_ARENA_CACHE_PATH} (fetched ${stale?.fetchedAt})`);
      }
    }
  }
  return { website: boards["models/website"] ?? null, agon: boards["agents/agon_webapps"] ?? null };
}

/**
 * The cache -> fetch -> stale-cache chain from the original main(): a fresh
 * same-day llm-stats cache wins; otherwise the leaderboard is fetched live and
 * cached; OpenRouter enrichment reuses its own fresh cache, else fetches, else
 * falls back to a stale cache (non-fatal — affected models just go unranked).
 * Throws only when llm-stats has neither fresh cache nor a usable fetch (§9 abort).
 */
export async function loadRankData(opts?: { refresh?: boolean; url?: string; roles?: Record<string, RoleDef> }): Promise<RankData> {
  const refresh = opts?.refresh ?? false;
  const url = opts?.url ?? DEFAULT_URL;
  // Design Arena is the only source a role can depend on exclusively (`website`).
  // When the caller names the roles it will rank and none weights `website`, skip
  // the endpoint fetch entirely — the OpenRouter mirror (part of the find payload
  // fetched anyway) still populates `designElo`. Undefined roles = fetch (the
  // standalone default, e.g. a caller that ranks every shipped role).
  const needsDesignArena = opts?.roles === undefined || Object.values(opts.roles).some((r) => r.weights.website !== undefined);

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

  // OpenRouter per-provider routes — the sole throughput and price sources. The find
  // payload (one traffic-getting route per model) is cached daily in
  // OPENROUTER_CACHE_PATH, the model pages (every provider route) in
  // OPENROUTER_ENDPOINTS_CACHE_PATH; the enrichment map is re-derived from both.
  // Non-fatal on failure: affected models simply lack throughput/price and are not
  // ranked; stale caches as last resort.
  let orMatched = 0;
  let orPriced = 0;
  let orData: Record<string, OrEnrichment> | null = null;
  let designElo: Record<string, number> = {};
  let findParsed: ParsedFindData = null;
  const cachedOr = refresh ? null : readOrCache(OPENROUTER_CACHE_PATH, true);
  if (cachedOr) {
    findParsed = parseFindData(cachedOr);
    if (findParsed) {
      designElo = findParsed.designElo;
      console.error(`using cache ${OPENROUTER_CACHE_PATH} (fetched ${cachedOr.fetchedAt})`);
    } else {
      console.error(`${OPENROUTER_CACHE_PATH}: unexpected payload shape; refetching`);
    }
  }
  if (!findParsed) {
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
          // An empty map would poison the whole day; leave uncached so the next run retries.
          if (Object.keys(buildOpenRouterEnrichment(parsed.find)).length === 0) {
            console.error("openrouter: no enrichment data extracted; not caching");
          } else {
            findParsed = parsed;
            designElo = parsed.designElo;
            cacheData = parsed.data;
            cacheCount = parsed.find.models.length;
          }
        }
      }
    } catch {
      console.error("openrouter fetch failed");
    }
    if (findParsed && cacheData) {
      writeOrCache(OPENROUTER_CACHE_PATH, new Date().toISOString(), cacheData, cacheCount);
    }
    if (!findParsed) {
      // Fetch failed: a stale cache still beats losing ~100 models of coverage.
      const stale = readOrCache(OPENROUTER_CACHE_PATH, false);
      const staleParsed = stale ? parseFindData(stale) : null;
      if (staleParsed) {
        findParsed = staleParsed;
        designElo = staleParsed.designElo;
        console.error(`using stale cache ${OPENROUTER_CACHE_PATH} (fetched ${stale?.fetchedAt})`);
      }
    }
  }
  if (findParsed) {
    // Model pages are fetched only for slugs that match a leaderboard model
    // (~150 of ~540) — the others can't be ranked either way.
    const ids = new Set(models.map((m) => m.id));
    const wanted = new Set<string>();
    for (const row of findParsed.find.models) {
      const suffix = row.slug.split("/")[1] ?? row.slug;
      if (ids.has(suffix)) wanted.add(row.slug);
    }
    const pages = await loadEndpointPages([...wanted], refresh);
    orData = buildOpenRouterEnrichment(findParsed.find, pages);
  }
  if (orData) {
    ({ matched: orMatched, priced: orPriced } = applyOpenRouterData(models, orData));
    console.error(`openrouter: matched ${orMatched}/${models.length} models (throughput), ${orPriced} priced`);
  }

  // Design Arena endpoint boards — fetched only when a ranked role weights
  // `website` (the sole role-exclusive source). Skipped, the OR mirror in
  // `designElo` still stands and `website` is simply unused.
  let daWebsite: Record<string, DesignArenaEntry> | null = null;
  let daAgon: Record<string, DesignArenaEntry> | null = null;
  if (needsDesignArena) {
    try {
      const boards = await loadDesignArenaBoards(refresh);
      if (boards.website) daWebsite = buildDesignArenaIndex(models, boards.website);
      if (boards.agon) daAgon = buildDesignArenaIndex(models, boards.agon);
    } catch (e) {
      console.error(`design arena: ${e instanceof Error ? e.message : String(e)}; continuing on the OpenRouter mirror alone`);
    }
  }
  const mergedElo = mergeDesignElo(designElo, daWebsite);
  for (const m of models) m.designEloAgents = daAgon?.[m.id]?.elo ?? null;

  const design = applyDesignPercentiles(models, mergedElo);
  if (design.covered > 0) {
    console.error(`design arena: ${design.covered} models with a models-website Elo, ${design.imputed} imputed`);
  }

  return { models, fetchedAt, source, orMatched, orPriced };
}

/** Rank each role over the models. `roles` comes from resolved settings (shipped
 * defaults and/or user-defined role weight sets), not a hardcoded table.
 */
export function computeRankings(models: Model[], roles: Record<string, RoleDef>): Record<string, Ranked[]> {
  const rankings: Record<string, Ranked[]> = {};
  for (const [role, def] of Object.entries(roles)) rankings[role] = rankRole(def, models);
  return rankings;
}
