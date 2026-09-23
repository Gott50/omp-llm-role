# omp-llm-role

Ranks today's LLM leaderboard into best-fit picks for each omp model role
(`default, smol, slow, vision, plan, commit, tiny, task, advisor`), and ships
an omp plugin that applies those picks to `~/.omp/agent/config.yml` daily.
`SPEC.md` is the normative spec for the plugin.

## Files

| File | Purpose |
|---|---|
| `llm-role-rank.ts` | CLI report (Node 26, type-stripping — no bun/deno/tsx, no build step) |
| `src/engine.ts` | Ranking engine shared by CLI and plugin: fetch/caches, percentile norms, `loadRankData`, `computeRankings` |
| `src/settings.ts` | Shipped role defaults (`DEFAULT_ROLES`), plugin-settings deep-merge + validation |
| `src/availability.ts` | OpenRouter key tier gate, catalog filter, variant resolution (`resolveVariant`), provider-allowlist probe (`probeModel`) |
| `src/config-edit.ts` | Surgical line-oriented YAML patch for `modelRoles` + `retry.fallbackChains`, atomic write |
| `src/state.ts` | State/history/lock files under the agent dir; agent-dir resolution |
| `src/updater.ts` | Orchestration: rank → tier gate → hysteresis → chains → config write |
| `src/extension.ts` | omp extension entry: day-gated `session_start` run + `/refresh-roles` |
| `update-roles.ts` | Headless shim: `node update-roles.ts [--dry-run] [--json]` (always forces) |
| `package.json` | Plugin manifest (`omp.extensions`) + the single dependency (`yaml`) |
| `tests/` | `node --test tests/` fixtures: tier gate, variant resolution, config edit, hysteresis, chain pruning |
| `llm-stats-fetched-rankings.json` | Daily cache of the raw llm-stats leaderboard (script-owned, gitignored) |
| `openrouter-fetched-data.json` | Daily cache of the full OpenRouter `find` response (gitignored) |
| `llm-role-rankings.md` | Generated report: per-role tables with per-metric weighted contributions (regenerate with `--out`) |
| `SPEC.md` | Normative spec for the plugin |

## Plugin: daily model-role updater

Install (dev): `omp plugin link ~/Documents/omp-llm-role`. From then on:

- **Trigger**: the first omp session of each UTC day rewrites `modelRoles`
  (and `retry.fallbackChains`) to that day's best key-eligible models;
  later same-day sessions no-op. `/refresh-roles` forces a run anytime.
  Headless: `node update-roles.ts` (forces), `--dry-run` computes without
  writing, `--json` emits the decisions payload.
- **Availability**: keeps only models the OpenRouter key can run — tier/budget
  gate (`is_free_tier`, `limit_remaining`, `/api/v1/credits`). Paid keys with
  budget get billed variants, free/exhausted keys get `:free` variants,
  `:batch` never. Every candidate must resolve in omp's catalog; ranking rows
  map to selectors exact id → newest dated (`-MMDD`/`-YYYYMMDD`) → bare →
  `~org/…-latest` alias, ties lexicographic.
  On top of the tier gate, every candidate is verified with a one-token
  completion probe: the account's OpenRouter **allowed-providers privacy
  whitelist** is invisible to `/api/v1/key` and the catalog endpoints, and a
  real request's 404 ("No allowed providers are available …") is the only
  reliable signal. The probe walk verifies the current selector's candidate
  first, then rank order, and stops only when `1 + fallbackChainDepth` clean
  candidates exist and — for a clean current selector — `fallbackChainDepth`
  clean candidates lie beyond it, so every written chain entry is
  probe-verified (budget-capped at 12 probes per role, verdicts cached per
  run); blocked candidates are excluded from selection and chains, recorded
  on the decision (`blocked[]`), and a role with no clean candidate is left
  untouched.
- **Switch policy**: hysteresis — a role switches only when its current model
  became ineligible (or left today's ranked pool) or the new best beats it by
  `switchMargin` (default 0.02; 0 = always take the best). Kept roles still
  get their fallback chain refreshed and their selector canonicalized.
- **Writes**: surgical in-place edit — only managed role lines and managed
  chain keys change; comments, blank lines and unknown keys stay
  byte-identical; values are emitted double-quoted; a line whose value already
  equals the new selector (any quoting) is left untouched, so a no-change run
  writes nothing and never touches the config mtime. Atomic tmp+rename with a
  3-attempt mtime-conflict retry; the patched text must re-parse as YAML or
  nothing is written. Thinking suffixes come from a canonical per-role table
  (`smol: off, slow: max, vision: auto, plan: high, commit: off`; others bare)
  and are only appended when the chosen catalog entry supports thinking.
- **Rollback aid**: `~/.omp/agent/llm-role-state.json` snapshots the previous
  `modelRoles` block on every write (`previousModelRoles`).
- **Settings**: `omp plugin config omp-llm-role --set=<dotted.key>=<value>`
  (flat dotted keys are deep-merged by the plugin; `config=<json>` is a
  whole-object escape hatch). Knobs: `switchMargin`, `writeFallbackChains`,
  `fallbackChainDepth`, `suffixes.<role>`, `roles.<name>.{description,weights,
  required,filters}`. `weights: null` opts a role out; a new role with a full
  weight set gets managed too. Invalid settings abort the run with the
  offending role/key and no write.
- **State files** (next to the config): `llm-role-state.json` (day gate,
  managed roles, last selectors, plugin-owned chain keys, previous
  `modelRoles` snapshot), `llm-role-history.jsonl` (one row per completed
  run: trigger, key tier, decisions), `.llm-role-refresh.lock` (serializes
  concurrent session starts; stale after 60 s).
- **Agent dir resolution**: `OMP_LLM_ROLE_AGENT_DIR` (test hook) →
  `PI_CODING_AGENT_DIR` → non-default `OMP_PROFILE` → `~/.omp/agent`.

`llm-role-rank.ts` remains the report surface; its suggested `modelRoles`
block resolves through the same catalog/variant logic the plugin uses
(`openrouter/<id>` selectors).

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
a single provider; the two disagree wildly), and its per-endpoint pricing is
what a caller actually pays on the router. Models without OpenRouter
throughput or a billed route are not ranked — every role requires both.

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
eligible for a role only when all `required` metrics are non-null (`required`
is the eligibility gate, independent of weights — e.g. every role requires
throughput without weighting it). Two cost lenses accompany the score in the
report, both built on the **price-free score** — the weighted score with the
price metric stripped and the remaining weights renormalized (derived exactly
as `(score − w_price·price_percentile) / (1 − w_price)`, no second ranking
pass): **★** marks the Pareto frontier (no eligible model is both cheaper and
better), and **$/score** is blended $/M ÷ (price-free score − 0.5) — cost per
quality point above the median; models at or below the median get no value
entry. This kills the cheap-and-bad artifact of a raw price/score ratio.

Roles and weights (see `DEFAULT_ROLES` in `src/settings.ts`, overridable via
plugin settings): `default` (quality-heavy workhorse), `smol` (cheap+fast),
`slow` (capability-heavy), `vision` (requires image input), `plan`
(reasoning/long-context), `commit`, `tiny` (price+throughput dominated),
`task` (agentic), `advisor` (deep reasoning).

## Usage

```
node llm-role-rank.ts [--top N] [--json] [--out FILE] [--refresh] [--url URL]
node update-roles.ts [--dry-run] [--json]
node --test tests/
```

- `llm-role-rank.ts` default: markdown report to stdout (per-role tables with
  per-metric weighted-contribution columns + suggested `settings.modelRoles`).
- `--top N`: rows per role (default 10). `--json`: machine payload
  (`fetchedAt, source, modelCount, roles{role:[{rank, modelId, name,
  organization, score, priceFreeScore, valueUsdPerScore, paretoFrontier,
  priceBlendedUsdPerM, throughputTokS, contextTokens}]}`). `--out FILE`:
  write instead of stdout. `--refresh`: bypass both caches. `--url`: override
  the llm-stats page URL.
- `update-roles.ts` runs the plugin pipeline headlessly (key + catalog via the
  `omp` CLI); `--dry-run` prints decisions without writing, `--json` emits
  `{wrote, aborted, decisions[]}` only.

## Caching

Both caches are fresh while their `fetchedAt` is the current UTC day, and
resolve against the repo root (never the process cwd — the plugin runs with
arbitrary cwd inside omp).

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

## Current state (2026-09-23)

- 398 llm-stats models; OpenRouter matched 150/398 (throughput), 149 priced.
- Eligible per role: 141 (vision 74, image-input filter).
- Report leaders (pre-probe ranking): `default`/`task` DeepSeek-V4.1-Flash
  (0.965), `smol`/`commit` Laguna-S-2.1, `slow` GLM-5.3, `vision` GPT-6 Astra,
  `plan`/`advisor` GPT-5.6 Sol, `tiny` Ling 3.0 Flash Fin.
- Plugin verified live (2026-09-23) with the provider-allowlist probe: the
  account's allowed-providers whitelist excludes first-party openai/azure/
  anthropic endpoints, so the probe gate rewrote `slow` → GLM-5.3 (`:max`),
  `vision` → Kimi-K3 (`:auto`), `plan` → Hy3 (`:high`), `advisor` →
  Hy4-Preview and refilled their chains with probe-clean entries; all 16
  configured roles then served on their configured selector in headless
  sessions (transcript-verified, no fallbacks). 49/49 unit tests green.

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
- omp's extension registry differs from its CLI JSON in two spots (adapted in
  `src/extension.ts` only): the key comes from
  `modelRegistry.getApiKeyForProvider("openrouter")` (`getApiKey` returns
  undefined there), and registry rows carry `thinking` as an effort object
  (`{mode, efforts[], …}`) which `extDeps` normalizes to the CLI's string
  array. In print/headless mode `ctx.ui.notify` is a no-op, so the extension
  mirrors decisions and aborts to stderr.
- `required` is the eligibility gate, not a weight: the shipped defaults
  require `throughput` without weighting it, so settings validation checks
  `required` against the known-metric set, not against `weights`.
- The OpenRouter account's allowed-providers privacy whitelist excludes
  first-party `openai`/`azure`/`anthropic` endpoints on this account, so
  first-party-hosted models rank well but fail at request time with a 404
  naming the permitted providers. The probe gate (§5.5) filters them before
  writing; without it, fallback chains silently mask three of four affected
  roles and `vision` hard-fails. Org prefixes are not a valid filter —
  `deepseek/*`, `z-ai/*`, `inclusionai/*` work via whitelisted third-party
  endpoints.