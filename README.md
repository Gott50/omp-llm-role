# omp-llm-role

Ranks today's LLM leaderboard into best-fit picks for each omp model role
(`default, smol, slow, vision, plan, commit, tiny, task, advisor`).
`SPEC.md` specifies the follow-up omp plugin that applies these picks to
`~/.omp/agent/config.yml` automatically.

## Files

| File | Purpose |
|---|---|
| `llm-role-rank.ts` | The script (Node 26, type-stripping — no bun/deno/tsx, no build step) |
| `llm-stats-fetched-rankings.json` | Daily cache of the raw llm-stats leaderboard (392 rows, script-owned) |
| `openrouter-fetched-data.json` | Daily cache of the full OpenRouter `find` response, pretty-printed with sorted keys (~8MB) |
| `llm-role-rankings.md` | Generated report: per-role tables with per-metric weighted contributions (regenerate with `--out`) |
| `SPEC.md` | Spec for the omp plugin that applies rankings to `config.yml` (implementation pending) |

## Next: model-role updater plugin (spec'd, not implemented)

`SPEC.md` specifies an omp plugin living in this repo (`omp plugin link`) that
turns today's rankings into live config:

- **Availability**: keeps only models the OpenRouter key can run — tier/budget
  gate (`is_free_tier`, `limit_remaining`, credits); the key API has no model
  allowlist. Paid keys get billed variants, free/exhausted keys get `:free`
  variants, `:batch` never. Every candidate must resolve in omp's authenticated
  catalog (`omp models ls --json`).
- **Selectors**: `openrouter/*` only, exact dated slug (exact id → newest dated
  → bare → `-latest` alias), thinking suffixes from a canonical per-role table.
- **Switch policy**: hysteresis — a role switches only when its current model
  became ineligible or the new best beats it by `switchMargin` (default 0.02).
- **Writes**: surgical in-place edit of `modelRoles` + `retry.fallbackChains`
  (#2/#3 per managed role) in `~/.omp/agent/config.yml`; atomic, comments and
  unknown keys untouched, previous mapping snapshotted.
- **Trigger**: day-gated on `session_start` (first omp session of the UTC day)
  plus `/refresh-roles`; headless `node update-roles.ts --dry-run`.
- **Config**: role weights move into plugin settings (`omp plugin config
  omp-llm-role --set=…`); defaults ship for the 9 official roles, custom agent
  roles add their own weight sets.

`llm-role-rank.ts` remains the scoring engine — the plugin refactors it into a
shared `engine.ts` (see SPEC.md §4.1) without changing its CLI or report format.

## Data sources

**Quality — llm-stats.com.** The leaderboard page server-renders its
dataset into the Next.js RSC flight payload (`self.__next_f.push([1,"..."])`
chunks ending in an `initialData: [...]` array). There is no public JSON API,
so the script extracts that array. Provides: index scores (general, reasoning,
math, code, agents, search, vision, tool_calling, long_context), benchmark
scores, context length, multimodality.

**Throughput + price — OpenRouter only.** `GET
https://openrouter.ai/api/frontend/v1/models/find?active=true&fmt=cards&order=top-weekly`
(public, no auth) returns `data.endpoint_perf[endpointId]` with `p50_throughput`
(output tok/s) and `p50_latency` (ms) over the last 30 minutes of routed
traffic, plus `data.models[]` rows linking slugs to endpoint ids — each
endpoint carrying `pricing.prompt`/`pricing.completion` (USD/token strings,
discounts already applied). llm-stats throughput and prices are **not used**:
OpenRouter reflects real routed traffic across providers (llm-stats measures
a single provider; the two disagree wildly, e.g. Claude Opus 5: 4.6 vs ~76
tok/s), and its per-endpoint pricing is what a caller actually pays on the
router. Models without OpenRouter throughput or a billed route are not
ranked — every role requires both.

The join is by slug suffix: llm-stats `model_id` (bare) == OpenRouter slug
suffix (`slug.split("/")[1]`). `:batch` variants are skipped (no perf data,
half-price async tier). Throughput takes the highest-p50 variant, `:free`
tiers included (they carry real routed traffic). Price is the standard
(non-`:free`) route's blended $/M at 3:1 input:output, cheapest billed route
as fallback — a $0 free tier never sets the price.

## Scoring

Per role, each metric is percentile-normalized across all models (midrank
`(i+j)/(2*(n-1))`, null-safe), then a weighted score is computed. Report
tables show each metric's contribution (`weight × percentile`) after a `|`;
they sum to the score (`—` = missing optional metric, contributes 0). Price
is OpenRouter's standard-route $/M (3:1 input:output blend), inverted so
cheaper is better. Every role weights price AND throughput. A model is
eligible for a role only when all `required` metrics are non-null (all roles
require throughput and price, so OpenRouter coverage bounds eligibility).
Two cost lenses accompany the score in the report, both built on the
**price-free score** — the weighted score with the price metric stripped and
the remaining weights renormalized (derived exactly as
`(score − w_price·price_percentile) / (1 − w_price)`, no second ranking pass):
**★** marks the Pareto frontier (no eligible model is both cheaper and
better), and **$/score** is blended $/M ÷ (price-free score − 0.5) — cost per
quality point above the median; models at or below the median get no value
entry. This kills the cheap-and-bad artifact of a raw price/score ratio: a
near-free weak model is either dominated (no ★) or below the bar (no $/score).

Roles and weights (see `ROLES` in the script): `default` (quality-heavy
workhorse), `smol` (cheap+fast), `slow` (capability-heavy), `vision`,
`plan` (reasoning/long-context), `commit`, `tiny` (price+throughput dominated),
`task` (agentic), `advisor` (deep reasoning).

## Usage

```
node llm-role-rank.ts [--top N] [--json] [--out FILE] [--refresh] [--url URL]
```

- Default: markdown report to stdout (per-role tables with per-metric
  weighted-contribution columns + suggested `settings.modelRoles` YAML).
- `--top N`: rows per role (default 10).
- `--json`: machine payload (`fetchedAt, source, modelCount, roles{role:[{rank,
  modelId, name, organization, score, priceFreeScore, valueUsdPerScore,
  paretoFrontier, priceBlendedUsdPerM, throughputTokS, contextTokens}]}`).
- `--out FILE`: write report to file instead of stdout.
- `--refresh`: bypass both caches and refetch.
- `--url`: override the llm-stats page URL.

## Caching

Both caches are fresh while their `fetchedAt` is the current UTC day.

- llm-stats cache: `{fetchedAt, source, modelCount, rankings[]}` (pretty-printed).
- OpenRouter cache: `{fetchedAt, source, modelCount, data}` where `data` is the
  verbatim `find?fmt=cards` response data (all sections: models, endpoint_perf,
  analytics, benchmarks, benchmark_ranges, categories, modality_counts). The
  throughput and price maps are re-derived from it on every run — the file is
  the single source of truth for anything OpenRouter returned.

Fallback chain: fresh cache → live fetch (writes cache) → stale cache →
no enrichment (affected models unranked). An empty/unusable OpenRouter payload
is never cached, so the next run retries. llm-stats fetch failure is fatal
(no data at all); OpenRouter failure is non-fatal.

## Current state (2026-09-21)

- 392 llm-stats models; OpenRouter matched 145/392 (throughput), 144 priced.
- Eligible per role: 136 (vision 70, multimodal filter).
- `default` #1: DeepSeek-V4.1-Flash; `slow` #1: GLM-5.3; `tiny` #1:
  Ling 3.0 Flash Fin (see `llm-role-rankings.md` for the full report).
- Value lens: `default` has 8/136 models on the Pareto frontier; best $/score
  Ling 3.0 Flash ($0.13 per point above median), then DeepSeek-V4-Flash-0731
  ($0.19). Frontier sizes: vision 11/70, advisor 5/136, plan 6/136.
- Verified: cache create/hit/refresh cycles, `--json` validity, report output
  (contribution columns sum to scores across all 906 report rows).

## Known quirks

- OpenRouter p50 values are a rolling 30-minute window: tok/s numbers and close
  score orderings shift between runs. A captured payload is not ground truth —
  re-fetch before debugging join logic.
- llm-stats has no public API; the RSC flight extraction depends on the page's
  `initialData` key (do not include `[` in the search key).
- `index_general` can be negative; percentile normalization handles it.
- Node type-stripping does not typecheck: property-name typos surface as
  `undefined` at runtime, not compile errors. Always run the script after edits
  and sanity-check stderr match counts and eligible counts.
- The OpenRouter join is by slug suffix only; models whose llm-stats id has no
  OpenRouter counterpart (or no routed traffic in the last 30m) are unranked.