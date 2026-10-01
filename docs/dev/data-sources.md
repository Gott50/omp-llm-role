# Data sources

Where every number in a ranking comes from, how each source joins to the
llm-stats id, and where it is cached. All fetching lives in `src/engine.ts`
(plus `src/availability.ts` for the key/catalog/probe surfaces).

- Module map and pipeline: [`architecture.md`](architecture.md).
- Normative behavior contract: [`spec.md`](spec.md).

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
  long_context) and the benchmark scores (0–1: `gpqa_score`,
  `aime_2025_score`, `swe_bench_verified_score`, `arc_agi_v2_score`,
  `mrcr_v2_score`, `terminal_bench_score`, `tau_bench_retail_score`).
- **Build**: `buildModels(rows)` maps each row to a `Model`; `metrics` carries
  the index/benchmark values, with `price`/`throughput`/`website`/`writing`
  left `null` for later enrichment.
- **Cache**: `llm-stats-fetched-rankings.json` —
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
  getting the traffic — each carrying `pricing.prompt`/`pricing.completion`
  (USD/token strings, discounts already applied). The payload also carries
  `analytics`, `benchmarks`, `benchmark_ranges`, `categories`,
  `modality_counts`.
- **Parse**: `parseFindData(v)` narrows `find` (models, `endpoint_perf`,
  `endpoint_price` blended to $/M at 3:1 in:out) and keeps the full `data`
  object verbatim for the cache; it also extracts the Design Arena mirror
  (`extractDesignElo`, see below).
- **Cache**: `openrouter-fetched-data.json` —
  `{ fetchedAt, source, modelCount, data }` where `data` is the verbatim
  `find?fmt=cards` response data (sorted keys). Throughput/price maps are
  re-derived from it on every run. An empty/unusable payload is never cached.

### Model pages

- **URL**: `https://openrouter.ai/<slug>` (RSC flight payload), fetched only for
  slugs that match a leaderboard model (~150 of ~540).
- **Shape**: every provider route of a model — pricing, service tier, status and
  routed-traffic p50 stats — dehydrated as React-Query state (sometimes twice,
  one copy without stats; records merge by endpoint id, the stats-carrying copy
  winning). `parseModelPage(html)` narrows each row to
  `OpenRouterEndpointRecord` (`id`, `providerSlug`, `serviceTier`, `status`,
  `free`, `variant`, `price`, `tput`, `latency`).
- **Fetch**: `fetchEndpointPages(slugs)` with an 8-worker pool
  (`OPENROUTER_PAGE_CONCURRENCY`), one retry per page, permanent 404/410 gives
  up. A page that fails is absent and that model keeps the single-route
  fallback.
- **Cache**: `openrouter-endpoints-fetched-data.json` —
  `{ fetchedAt, source, slugCount, slugs }` where `slugs` maps each fetched
  model slug to its narrowed per-provider route records.

### The 1/price² blend

`buildOpenRouterEnrichment(data, pages)` computes the expected price/throughput
of one request under OpenRouter's default price-based load balancing (a request
goes to ONE provider, picked among the stable standard-tier routes with
probability proportional to `1/price²`):

- **Pool**: the page's per-provider routes, plus any find-row endpoint the page
  does not list (the page is normally a superset).
- **Eligible**: standard tier (`serviceTier === null`), `status === 0`, not
  `:free`, `price > 0`, not `:batch`. flex/priority tiers are excluded (only the
  `:floor`/`:nitro` variants make them eligible); degraded routes (`status ≠ 0`)
  are fallbacks and drop out.
- **Blend**: `price = Σ(1/p²)·p / Σ(1/p²)`; `throughput = Σ(1/p²)·t / Σ(1/p²)`
  renormalized over the routes that have p50 data; latency likewise.
- **Fallback** (no eligible route carries throughput): throughput = highest-p50
  variant (`:free` included — it rescues otherwise-unranked models), price =
  cheapest billed route (a $0 free tier never sets the price).
- **Apply**: `applyOpenRouterData(models, orData)` sets `m.price`,
  `m.throughput`, `m.metrics.price`/`throughput`, and `m.thinking`
  (`supports_reasoning`).

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
- **Cache**: `designarena-fetched-data.json` —
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
- **Cache**: `writing-fetched-data.json` —
  `{ fetchedAt, source, scores }` where `scores` maps the bare llm-stats id to
  its WritingBench score. An unusable payload or an empty record set is never
  cached.
- **Gating**: fetched only when a ranked role weights `writing`. Non-fatal.
- **Caveat**: the page's table sorts by the *communication index*
  (`index_communication`, already in the find payload), not by WritingBench; the
  export — not the table — defines the metric. The ranking is narrow (15 models,
  all Qwen, all `self_reported`/`verified: false`), so `writing` is a sparse
  capability metric, never a `required` gate.

## Joins to the llm-stats id

| Source | Join key | Rule |
|---|---|---|
| OpenRouter `find` + model pages | slug suffix | llm-stats `model_id` == `slug.split("/")[1]` |
| Design Arena (OR mirror) | permaslug → slug → bare id | `extractDesignElo` |
| Design Arena (endpoint) | normalized id | `normalizeDesignId` both sides; first row wins on collision |
| Writing leaderboard | direct | `records[].modelId` is the bare llm-stats id |

## Daily UTC caches

All five caches resolve against the **repo root** (`REPO_ROOT` in
`src/engine.ts`), never the process cwd — the plugin runs with arbitrary cwd
inside omp. Each is fresh while its `fetchedAt` is the current UTC day, and each
follows the same chain: **fresh cache → live fetch (writes cache) → stale cache →
no enrichment**. An empty/unusable payload is never cached, so the next run
retries.

| Cache file | Shape | Failure mode |
|---|---|---|
| `llm-stats-fetched-rankings.json` | `{ fetchedAt, source, modelCount, rankings[] }` | **fatal** (no data at all) |
| `openrouter-fetched-data.json` | `{ fetchedAt, source, modelCount, data }` | non-fatal (affected models unranked) |
| `openrouter-endpoints-fetched-data.json` | `{ fetchedAt, source, slugCount, slugs }` | non-fatal (single-route fallback) |
| `designarena-fetched-data.json` | `{ fetchedAt, source, categories }` | non-fatal (OR mirror alone) |
| `writing-fetched-data.json` | `{ fetchedAt, source, scores }` | non-fatal (`writing` unfilled) |

All five are gitignored (`.gitignore`). `--refresh` bypasses the fresh-cache
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
  The blend weights by the documented `1/p²` formula, not by the page's observed
  request counts (which aggregate ALL OpenRouter traffic, `:nitro`/`:floor` and
  `sort` users included).
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
