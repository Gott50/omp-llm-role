# Data sources

Where every number in a ranking comes from, how each source joins to the
llm-stats id, and where it is cached. All fetching lives in `src/engine.ts`
(plus `src/availability.ts` for the key/catalog/probe surfaces).

- Module map and pipeline: [`architecture.md`](architecture.md).

## llm-stats.com — quality

The leaderboard page server-renders its dataset into the Next.js RSC flight
payload; there is no public JSON API.

- **URL**: `https://llm-stats.com/leaderboards/llm-leaderboard`
  (`DEFAULT_URL` in `src/engine.ts`; overridable with `--url`).
- **Extraction**: `extractFlight(html)` concatenates every
  `self.__next_f.push([1,"…"])` string chunk; `extractJsonArray(flight,
  '"initialData":')` returns the balanced array that follows the `initialData`
  key. Do **not** include `[` in the search key.
- **Rows**: `LlmStatsRow` — `model_id` (bare id), `name`, `organization`,
  `context`, `release_date`, `multimodal`, `license`, `input_price`/`output_price`
  (unused), `throughput`/`latency` (unused), the `index_*` scores (0–100:
  general, reasoning, math, code, agents, search, vision, tool_calling,
  long_context, communication, finance, healthcare, legal) and the benchmark
  scores (0–1: `gpqa_score`, `aime_2025_score`, `swe_bench_verified_score`,
  `arc_agi_v2_score`, `mrcr_v2_score`, `terminal_bench_score`,
  `tau_bench_retail_score`, plus `hle_score`, `simpleqa_score`, `mmmu_score`,
  `mmmu_pro_score`, `mmmlu_score`, `browsecomp_score`, `swe_bench_pro_score`,
  `mcp_atlas_score`, `apex_agents_score`, `osworld_score`, `scicode_score`,
  `screenspot_pro_score`, `charxiv_r_score`, `frontiermath_score`,
  `toolathlon_score`, `coding_arena_score`). `buildModels` maps the nine
  short-key indices plus the four new `index_*` fields (communication, finance,
  healthcare, legal) and the seven short-key benchmark scores plus the fifteen
  new `*_score` benchmarks — 13 indices and 22 benchmarks in all. The new
  metrics keep the **raw leaderboard field name as the metric key**
  (`index_communication`, `simpleqa_score`, …), unlike the original nine/seven
  short keys. `coding_arena_score`, `latency` and `context` are fetched but
  discarded (see the research note on the agentic-engineering benchmarks for the
  coverage/collinearity of the unmapped ones).
- **Build**: `buildModels(rows)` maps each row to a `Model`; `metrics` carries
  the index/benchmark values, with `price`/`throughput`/`website`/`writing`
  left `null` for later enrichment. The row's `release_date` is carried onto
  `Model.releaseDate` (null when absent) and used by the focus-metric freshness
  axis (scoring.md, the seven-axis gate).
- **Cache**: `cache/llm-stats-fetched-rankings.json` —
  `{ fetchedAt, source, modelCount, rankings[] }` (pretty-printed; each row
  gains a `rank` = array position). Fresh while `fetchedAt` is the current UTC
  day. **Fatal** on failure: no fresh cache and no usable fetch aborts the run.

llm-stats throughput and prices are **not used** — OpenRouter is the sole
throughput/price source (see below).

## OpenRouter — throughput + price

Two payloads, both joined to llm-stats by slug suffix: the llm-stats `model_id`
(bare) equals `slug.split("/")[1]`.

### `find` payload

- **URL**: `GET https://openrouter.ai/api/frontend/v1/models/find?active=true&fmt=cards&order=top-weekly`
  (`OPENROUTER_FIND_URL`; public, no auth).
- **Shape**: `data.endpoint_perf[endpointId]` → `{ p50_throughput (output tok/s),
  p50_latency (ms) }` over the last **30 minutes** of routed traffic;
  `data.models[]` rows link a slug to one endpoint id — the route currently
  getting the traffic — each carrying `pricing.prompt`/`pricing.completion` and
  `pricing.input_cache_read` (USD/token strings, discounts already applied). The
  payload also carries `analytics`, `benchmarks`, `benchmark_ranges`, `categories`,
  `modality_counts`.
- **Parse**: `parseFindData(v)` narrows `find` (models, `endpoint_perf`,
  `endpoint_price` blended to $/M at 3:1 in:out, the parallel
  `endpoint_weight_price` input-only $/M map — the router's sort key — and the
  `endpoint_cache_read_price` cache-read input-only $/M map; see "The
  1/price² blend") and keeps the full `data` object verbatim for the cache; it
  also extracts the Design Arena mirror (`extractDesignElo`, see below).
- **Cache**: `cache/openrouter-fetched-data.json` —
  `{ fetchedAt, source, modelCount, data }` where `data` is the verbatim
  `find?fmt=cards` response data (sorted keys). Throughput/price maps are
  re-derived from it on every run. An empty/unusable payload is never cached.

### Model pages

- **URL**: `https://openrouter.ai/<slug>` (RSC flight payload), fetched only for
  slugs that match a leaderboard model (~150 of ~540).
- **Shape**: every provider route of a model — pricing, service tier, status,
  routed-traffic p50 stats and the per-endpoint capability ceilings — dehydrated
  as React-Query state (sometimes twice, one copy without stats; records merge by
  endpoint id, the stats-carrying copy winning). `parseModelPage(html)` narrows
  each row to `OpenRouterEndpointRecord` (`id`, `providerSlug`, `serviceTier`,
  `status`, `free`, `variant`, `price`, `weightPrice`, `cacheReadPrice`
  (endpoint `pricing.input_cache_read`; `null` when absent), `tput`, `latency`,
  `contextLength` (endpoint `context_length`), `maxCompletionTokens` (endpoint
  `max_completion_tokens`) and `supportsTools` (`supported_parameters` contains
  `tools`)). The three capability fields are `null` when the field is absent —
  the role endpoint filters keep a `null` (missing data is not a capability
  failure).
- **Fetch**: `fetchEndpointPages(slugs)` with an 8-worker pool
  (`OPENROUTER_PAGE_CONCURRENCY`), one retry per page, permanent 404/410 gives
  up. A page that fails is absent and that model keeps the single-route
  fallback.
- **Cache**: `cache/openrouter-endpoints-fetched-data.json` —
  `{ fetchedAt, source, slugCount, slugs }` where `slugs` maps each fetched
  model slug to its narrowed per-provider route records. `readEndpointsCache`
  rejects a cache whose records lack `weightPrice` (the pre-#21 shape),
  `contextLength` (the pre-#18 shape) **or** `cacheReadPrice` (the pre-#30
  shape) and refetches, rather than silently dropping every route from the
  blend, treating every ceiling as unstated, or leaving a role's `cacheHitRate`
  inert (a missing cache-read price reads as the full input price).
- **Per-model routes**: `buildOpenRouterEnrichment` carries the eligible
  standard-tier pool on `OrEnrichment.routes`, and `applyOpenRouterData` sets it
  on `Model.routes` — the pool the role endpoint filters gate. The
  find-route fallback carries the same field (its capability fields are `null`,
  since the find payload has no ceilings).

### The 1/price² blend

`buildOpenRouterEnrichment(data, pages)` computes the expected price/throughput
of one request under OpenRouter's default price-based load balancing (a request
goes to ONE provider, picked among the stable standard-tier routes with
probability proportional to `1/price²`). The weight basis is the **input
(prompt) price** — the router's sort key — while the reported price is the
**billed 3:1 in:out blend** under that distribution.

- **Pool**: the page's per-provider routes, plus any find-row endpoint the page
  does not list (the page is normally a superset).
- **Eligible**: standard tier (`serviceTier === null`), `status === 0`, not
  `:free`, `price > 0`, `weightPrice > 0`, not `:batch`. flex/priority tiers are
  excluded (only the `:floor`/`:nitro` variants make them eligible); degraded
  routes (`status ≠ 0`) are fallbacks and drop out.
- **Weight basis**: the input-only $/M (`pricing.prompt * 1e6`, carried as
  `weightPrice` on each route and `endpoint_weight_price` in the find payload).
  OpenRouter's docs say only "weighted by inverse square of the price" and never
  define the basis; the input price is the measured one. Tarun Chitra (Robot
  Ventures), *Caching Cheaters on OpenRouter* (2026-08-14,
  https://robvc.com/research/caching-cheaters): 64/64 informative provider
  splits picked the cheapest-**input** provider (including menus where that
  provider quoted the most expensive output price), output price carries ≲6
  cents per dollar of input, and the inverse-square exponent recovered from
  1,648 choices is r = 1.968 (95% CI [1.856, 2.098]); cached-token price adds no
  measurable predictive power. The authors' caveat: behaviour-measured, not
  source-read.
- **Blend**: `price = Σ(1/p_in²)·p_billed / Σ(1/p_in²)` — the w-weighted mean of
  the billed 3:1 blend (what a caller pays), weighted by the input price;
  `throughput = Σ(1/p_in²)·t / Σ(1/p_in²)` renormalized over the routes that
  have p50 data; latency likewise. A route with no input price drops from the
  pool (`1/p²` blows up at 0, and the router cannot score a route without one).
- **Cache-read pricing**: a role may declare `cacheHitRate` (0–1, opt-in), and
  `blendRoutePool(routes, cacheHitRate)` then blends each route's
  `cacheReadPrice` (the endpoint's `pricing.input_cache_read`) into its billed
  price, `billed = price + 3·(h·cacheRead + (1−h)·input − input)/4`, **without**
  changing the `1/p_in²` weight basis (the router still sorts on the listed input
  price). A route with no cache-read price keeps its full input price; `h = 0`
  is byte-identical to the uncached blend. See scoring.md, *Cache-read pricing*.
- **Fallback** (no eligible route carries throughput): throughput = highest-p50
  variant (`:free` included — it rescues otherwise-unranked models), price =
  cheapest billed route (a $0 free tier never sets the price).
- **Apply**: `applyOpenRouterData(models, orData)` sets `m.price`,
  `m.throughput`, `m.metrics.price`/`throughput`, and `m.thinking`
  (`supports_reasoning`).

A role with a `providerPin` does **not** use this blend: it prices the
model's matching route directly — the route's billed 3:1 price and its p50
throughput (scoring.md, *Route-aware pricing*). The blend is the unpinned
default.

## OpenRouter — key metadata (tier gate)

Bearer-authenticated GETs with the omp-resolved key decide which variant tier the
run may use:

- `GET https://openrouter.ai/api/v1/key` → `is_free_tier`, `limit_remaining`,
  `limit`, `free_model_daily_requests.remaining`.
- `GET https://openrouter.ai/api/v1/credits` → `total_credits`, `total_usage`.

```
billedUsable = !is_free_tier && limit_remaining > 0 && (total_credits - total_usage) > 0
freeUsable   = free_model_daily_requests.remaining > 0
```

`tierGate` (`src/availability.ts`) maps these to `"billed" | "free" | "none"`:
billed → billed variants only (exclude `:free`, `:batch`); else free → `:free`
variants only (exclude `:batch`); else `"none"` aborts the run. The key endpoint
carries **no** model/provider restriction field — the account's allowed-providers
whitelist is invisible to it (see the keyed catalog below and the probe in
[`architecture.md`](architecture.md)).

## OpenRouter — keyed catalog (availability)

The account setting **"Filter the model catalog for API keys"** (openrouter.ai/settings)
makes the Bearer-authenticated catalog a per-key allowlist.

- **URLs**: `GET https://openrouter.ai/api/v1/models` twice — once unauthenticated
  (the public catalog) and once with `Authorization: Bearer <key>` (the keyed catalog).
  `fetchKeyAvailability` (`src/availability.ts`) issues both in parallel.
- **Signal**: set membership only — the response carries no per-model access flag. Both
  id lists are normalized with `rankingIdOf` (suffix after the last `/`, minus `:free`,
  minus a trailing `-latest`), the same identity space as the engine's `Model.id`, so
  aliases never produce a false "blocked". The keyed list being a non-empty **proper
  subset** of the public one means the setting is on (`active`); equality is `no-filter`;
  an empty list or any transport/status/shape failure is `unavailable`.
- **Consumers**: the updater fetches it **once per run** and shares it across roles; the
  explorer fetches it on boot and on `POST /api/refresh`. It is **not cached to disk** —
  every consumer re-fetches, and `fetchKeyAvailability` **never throws** (a failure
  degrades to `unavailable` with empty sets, so the probe walk / `unknown` marks stand).

## Design Arena — design quality

Two routes, never averaged (same Elo family; mean diff −1.0 website … −5.1 svg,
maxAbs 87).

### OpenRouter mirror (part of the `find` payload)

`data.benchmarks[permaslug].da.elo_by_category` carries Design Arena's
human-preference Elo per category (`models-website`, `models-uicomponent`,
`models-svg`, `models-dataviz`, `models-graphicdesign`, `models-logo`, …). Only
`models-website` is read — the deepest design category that overlaps the ranked
pool. `extractDesignElo` joins permaslug → `models[].slug` → the bare llm-stats
id (benchmark keys are dated permaslugs, `models[].slug` is bare). No battle
counts; a snapshot of unknown sample age.

### designarena.ai endpoint (second route)

- **URL**: `POST https://www.designarena.ai/api/leaderboard` (body
  `{ arenaType, category }`, **no Authorization header** — keyless).
- **Boards**: `models/website` feeds the `website` metric; `agents/agon_webapps`
  feeds the report's `agon` context column (never scored).
- **Shape**: `data[] = { modelId, elo, battles, winRate, btStdErr, … }`.
  `fetchDesignArenaBoard` keeps rows with a string `modelId` and a number `elo`;
  `battles` coerces to 0 when absent.
- **Join**: board ids are undated and separator-inconsistent
  (`claude-fable-5-1` vs llm-stats `claude-fable-5.1`), so both sides go through
  `normalizeDesignId` (case-folded, `[-_.]` stripped, trailing
  `(20\d{6}|\d{4})` dropped). `buildDesignArenaIndex` maps normalized board ids
  to llm-stats ids; duplicate llm-stats ids (dated-snapshot pairs) keep the first
  row in leaderboard order and warn.
- **Merge**: `mergeDesignElo(orElo, da)` starts from the OR mirror and lets the
  endpoint override only where `battles >= DESIGN_MIN_BATTLES` (300); otherwise
  the mirror snapshot stands.
- **Metric**: `applyDesignPercentiles(models, mergedElo)` sets `m.designElo` and
  `m.metrics.website` = percentile `(i + 0.5) / n` within the design-covered
  population (role-independent). Models without Design Arena data get
  `CAPABILITY_FILL.website` (0.195).
- **Cache**: `cache/designarena-fetched-data.json` —
  `{ fetchedAt, source, categories }` where `categories` maps the two board keys
  to their rows. An empty board is never cached.
- **Gating**: fetched only when a ranked role weights `website` (i.e. `designer`
  is enabled). Non-fatal: on failure the OR mirror alone stands.

## Writing leaderboard — writing quality

- **URL**: `https://llm-stats.com/research/best-ai-for-writing/evidence.json`
  (`WRITING_URL`) — a **CC BY 4.0**, hourly-refreshed export. The page's JSON-LD
  `#ranking` ItemList mirrors it.
- **Shape**: `records[]` carry `modelId` (the bare llm-stats id, so the join is
  **direct**), `writingBenchScore` (0–1), organization, and the secondary
  communication index. `parseWritingEvidence(v)` keeps rows with a string
  `modelId` and a finite numeric `writingBenchScore`.
- **Metric**: `applyWritingScores(models, scores)` sets `m.writingBench` and
  `m.metrics.writing` (identity transform — already 0–1); models outside the
  ranking get `CAPABILITY_FILL.writing` (0.195). Role-independent.
- **Cache**: `cache/writing-fetched-data.json` —
  `{ fetchedAt, source, scores }` where `scores` maps the bare llm-stats id to
  its WritingBench score. An unusable payload or an empty record set is never
  cached.
- **Gating**: fetched only when a ranked role weights `writing`. Non-fatal.
- **Caveat**: the page's table sorts by the *communication index*
  (`index_communication`, already in the find payload), not by WritingBench; the
  export — not the table — defines the metric. The ranking is narrow (15 models,
  all Qwen, all `self_reported`/`verified: false`), so `writing` is a sparse
  capability metric, never a `required` gate.

## The benchmark-source registry (`src/benchmark-sources.ts`)

The single source of truth for "which benchmark sources exist, what metric each
feeds, and how to fetch, parse and join each". `BENCHMARK_SOURCES` lists the
shipped static sources — the llm-stats index leaderboard, the writing evidence
export, Design Arena, and the six raw llm-stats benchmark pass rates — each
mapping to a `KNOWN_METRICS` key. A source whose data the engine already fetches
(the index, Design Arena, the raw benchmarks) carries no `fetch`.

- `resolveBenchmarkSource(link)` — pure: match a link against the static
  patterns (scheme/`www.`/query/trailing slash stripped; `*` is a wildcard), then
  fall back to the generic llm-stats benchmark for `llm-stats.com/benchmarks/<id>`
  or a bare benchmark id. `null` for an unknown host.
- `sourceForMetric(metric, declared)` — metric → source, for the engine's gating.
- `parseBenchmarkPayload(source, payload)` — pure: the source's parser.
- `loadBenchmarkScores(source, refresh)` — the shared cache → fetch → stale-cache
  chain (below).
- `applyBenchmarkScores(models, source, scores)` — join + set
  `metrics[source.metric]`, capability-filling uncovered models at `source.fill`
  (and mirroring the raw score into `source.rawField`, e.g. `writingBench`).

### The generic llm-stats benchmark

`GET https://api.zeroeval.com/leaderboard/benchmarks/<id>` returns
`{ benchmark_id, benchmark_name, max_score, total_models, entries[] }`; each
entry carries `model_id` (the bare llm-stats id, so the join is **direct**) and
`normalized_score` (0-1). Any `llm-stats.com/benchmarks/<id>` link (or a bare
benchmark id) resolves to a source whose metric is `bench:<normalized-id>`, cache
file `bench-<normalized-id>-fetched-data.json`, transform `identity`, and a
capability fill of 0.195. The raw id is preserved for the fetch URL (the real id
`alpacaeval-2.0` normalizes to the metric `bench:alpacaeval-2_0`), so the source
is persisted as a declaration (below) — the metric key alone cannot reconstruct
the raw id. `catalogBenchmarkDeclaration` builds that declaration for a dotted
catalog id at discovery/authoring time, carrying the raw id in `fetch.url`.

Each entry also carries the trust flags `self_reported` and `verified` (both
booleans) and the `multimodal` flag. `parseBenchmarkPayloadMeta(payload)` reads
them independently of `source.parse` (a declared/writing source reads no entry
flags) and returns `{ trust: { selfReported, verified, covered }, modality:
{ multimodal, covered } }` — the trust `covered` is the count of entries carrying
a boolean `self_reported` (the share denominator), `selfReported` the count of
those whose `self_reported` is `true`, and `verified` the count of those whose
`verified` is `true`; the modality `covered` is the count of entries carrying a
boolean `multimodal` and `multimodal` the count of those that are `true` (the two
summaries have independent denominators)
(measured 2026-10-07: `verified` is uniformly `false`; `self_reported` varies —
gpqa 19/20, deepswe-1.1 14/20, terminal-bench-4.0 10/20, automationbench-aa 0/1).
`trust`/`modality` are each `null` when no entry carried the respective flag, and
the whole meta is `null` when the payload has no llm-stats entries shape.
`BenchmarkPayload` carries it as `meta`, `BenchmarkScores` as `meta`, and the
scores cache persists it (an old cache without the field reads back `null`). The
focus-metric trust and modality axes (scoring.md) consume it via
`cachedSourceInfo`.

The endpoint caps `entries` at `BENCHMARK_ENTRY_CAP` (20) regardless of
`limit`/`offset`/`page`/`per_page`, so a generic metric can never load more and
no pagination loop helps. `total_models` still reports the full set, so
`loadBenchmarkScores` returns `loaded` (the entries actually read) alongside
`total`; `loaded < total` marks a capped load (annotated to stderr) and the
post-fetch coverage count is the loadable `loaded`, never the catalog's
`model_count`.

### The benchmark catalog (discovery)

`GET https://api.zeroeval.com/leaderboard/benchmarks` (the same backend, no
`/<id>`) returns the full catalog as a top-level JSON array of ~745 rows:
`{ benchmark_id, name, description, categories[], modality, max_score, verified,
model_count, is_community, updated_at, version_count, latest_version_row_count,
star_count }`. `parseBenchmarkCatalog` narrows it to
`{ id, name, description, categories, modelCount, isCommunity, modality,
updatedAt, versionCount, latestVersionRowCount, starCount }` (the
row's `is_community`, defaulting `false` when absent/non-boolean — the only
catalog-level trust signal, 20/745 true — the row's `modality` as an open
string, `null` when absent/non-string, so an unknown value survives, and the
maintenance fields `updated_at`/`version_count`/`latest_version_row_count`/
`star_count`, each `null` when absent, non-string (for `updated_at`) or
non-finite (for the three counts));
`loadBenchmarkCatalog` follows the same
daily cache chain (cache file `benchmark-catalog-fetched-data.json`). The catalog
cache reader carries a shape guard mirroring `readEndpointsCache`: a cache whose
sampled entry lacks `isCommunity`, `modality` or any of the four maintenance
fields (written before the field landed) is rejected and refetched, so a stale
cache never reports `undefined`; an empty
catalog is still `null`. `/create-agent` uses it to discover the
benchmarks relevant to a purpose: `discoverBenchmarks` filters by coverage
(`modelCount >= 3`), ranks the survivors by IDF-weighted lexical overlap with the
purpose (a category that names the purpose's skill is the strongest signal), caps
the list at 40, and asks the configured `judge` role (one `noul` question per
candidate) which are direct measures. A selected benchmark resolves to its
shipped metric when one exists (`writingbench` → `writing`), else `bench:<id>`.

### Declarative sources (data, not code)

A user-level file `benchmark-sources.json` under the agent dir (`agentDir()`)
declares a provider the plugin has never seen:

```json
{
  "sources": [
    {
      "id": "my-provider",
      "label": "My Provider Writing Board",
      "metric": "my-provider:writing",
      "urlPatterns": ["myprovider.example/leaderboard/*"],
      "fetch": { "url": "https://myprovider.example/api/leaderboard", "method": "GET" },
      "payloadPath": "data.entries",
      "idField": "model_id",
      "scoreField": "score",
      "scoreMax": 100,
      "join": "direct",
      "fill": 0.195
    }
  ]
}
```

The plugin executes the declaration deterministically: fetch `fetch.url`, walk
`payloadPath`, read `idField`/`scoreField`, normalize `score / scoreMax` to 0-1
(clamped), join via `join`, apply with `fill`. No code execution. A declaration
whose `metric` is not `<namespace>:<local>` (dot-free) is rejected — a shipped
`KNOWN_METRICS` key is colon-free, so the external form can never collide with
one. The declaration's cache file is `<id>-fetched-data.json`.

`/create-agent` writes this file: a link the registry cannot resolve goes through
the authoring step (`src/benchmark-author.ts`: fetch the link, run an in-process
architect, validate, dry-run the coverage/leader, confirm), and a link that
resolves to the generic llm-stats benchmark persists its declaration so the
updater can re-fetch it from the metric key alone.

## Joins to the llm-stats id

| Source | Join key | Rule |
|---|---|---|
| OpenRouter `find` + model pages | slug suffix | llm-stats `model_id` == `slug.split("/")[1]` |
| Design Arena (OR mirror) | permaslug → slug → bare id | `extractDesignElo` |
| Design Arena (endpoint) | normalized id | `normalizeDesignId` both sides; first row wins on collision |
| Writing leaderboard | direct | `records[].modelId` is the bare llm-stats id |
| Generic llm-stats benchmark | direct | `entries[].model_id` is the bare llm-stats id |
| Declared source | `join` | `direct`, `slug-suffix` (`org/model` → `model`) or `normalized` |

## Daily UTC caches

All caches resolve against the repo's **`cache/` dir** (`CACHE_DIR` in
`src/engine.ts` and `src/benchmark-sources.ts`), never the process cwd — the
plugin runs with arbitrary cwd inside omp. Each is fresh while its `fetchedAt` is
the current UTC day, and each follows the same chain: **fresh cache → live fetch
(writes cache) → stale cache → no enrichment**. An empty/unusable payload is
never cached, so the next run retries. The writers `mkdirSync` the dir, so a
fresh checkout needs no setup.

| Cache file | Shape | Failure mode |
|---|---|---|
| `cache/llm-stats-fetched-rankings.json` | `{ fetchedAt, source, modelCount, rankings[] }` | **fatal** (no data at all) |
| `cache/openrouter-fetched-data.json` | `{ fetchedAt, source, modelCount, data }` | non-fatal (affected models unranked) |
| `cache/openrouter-endpoints-fetched-data.json` | `{ fetchedAt, source, slugCount, slugs }` | non-fatal (single-route fallback) |
| `cache/designarena-fetched-data.json` | `{ fetchedAt, source, categories }` | non-fatal (OR mirror alone) |
| `cache/writing-fetched-data.json` | `{ fetchedAt, source, scores, total, meta }` | non-fatal (`writing` unfilled) |
| `cache/bench-<id>-fetched-data.json` | `{ fetchedAt, source, scores, total, meta }` | non-fatal (the external metric is unfilled) |
| `cache/benchmark-catalog-fetched-data.json` | `{ fetchedAt, source, entries }` (each entry carries `isCommunity`, `modality` and the maintenance fields `updatedAt`/`versionCount`/`latestVersionRowCount`/`starCount`) | non-fatal (discovery skipped) |
| `cache/<declared-id>-fetched-data.json` | `{ fetchedAt, source, scores, total, meta }` | non-fatal (the external metric is unfilled) |

The last two are the registry's generic scores cache (`loadBenchmarkScores`),
shared by the generic llm-stats benchmark and every declared source.

`cache/` is gitignored (`.gitignore`). `--refresh` bypasses the fresh-cache
check; the explorer's `POST /api/refresh` does the same.

## `CAPABILITY_FILL`

`CAPABILITY_FILL` in `src/engine.ts` is `{ website: 0.195, long_context: 0.195,
writing: 0.195 }`. A model missing one of these metrics is scored at the fill
instead of 0, so absence is not a coverage penalty. `rankRole` applies it
**untransformed** (the fill is already a cardinal value) and `explainModel`
mirrors that branch, so the explorer's contributions sum exactly to `q`.

The scalar is the percentile implied by the *capability* cohort's uncovered-mean
general index (29.8 vs covered 38.2) — a **stated assumption, not a per-metric
calibration**. The `writing` cohort is stronger, not weaker (19.8 covered vs 22.2
uncovered ⇒ ≈0.513 on the same construction), so the shared constant
deliberately understates an unmeasured model's writing. It stays conservative
because 15 self-reported, unverified rows cannot calibrate a per-metric fill.
None of the three may be a `required` gate — that would disqualify every model
the source does not cover.

## Debugging-only caveats

- **RSC extraction is fragile.** llm-stats has no public API; the extraction
  depends on the page's `initialData` key (do not include `[` in the search key)
  and on the `self.__next_f.push([1,"…"])` chunk format. A page redesign breaks
  it silently.
- **p50 values are rolling windows.** 30 minutes for the find table, longer and
  per-provider for the model pages: tok/s numbers and close score orderings
  shift between runs. A captured payload is not ground truth — re-fetch before
  debugging join logic.
- **The blend biases toward routes with traffic.** Throughput renormalizes over
  the routes that have p50 data, so a stable route with no recent requests
  contributes price weight but no throughput. A degraded cheapest route
  (`status ≠ 0`) drops out entirely until it recovers, and the price can jump.
  The blend weights by the `1/p_in²` formula (input price, see "The 1/price²
  blend"), not by the page's observed request counts (which aggregate ALL
  OpenRouter traffic, `:nitro`/`:floor` and `sort` users included).
- **The find route and the page record for the same endpoint id can disagree**
  by a few percent (price revisions, status flips, p50 windows); the page copy
  wins the pool merge, the find row joins only when the page does not list its
  endpoint id.
- **Join caveats.** The OpenRouter join is by slug suffix only; a model whose
  llm-stats id has no OpenRouter counterpart — or no route with throughput data
  — is unranked. Design Arena normalization collides on dated-snapshot pairs
  (first row kept). The writing join is direct (15/15).
- **`designarena.ai/robots.txt` disallows `/api/`** for `User-Agent: *`; the
  daily fetch targets a disallowed path by explicit owner decision (robots.txt
  read as advisory for crawlers, not API clients). If the route starts failing
  (401/403/404), the non-fatal fallback leaves the ranking on the OpenRouter
  mirror alone.
- **`index_*` scores are interval-scale** (observed −16..+60, can be negative);
  the fixed affine anchors (−20→0, +60→1) handle it.
