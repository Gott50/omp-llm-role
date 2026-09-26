# omp-llm-role

Ranks today's LLM leaderboard into best-fit picks for each omp model role
(`default, smol, slow, vision, plan, commit, tiny, task, advisor`), and ships
an omp plugin that applies those picks to `~/.omp/agent/config.yml` daily.
`SPEC.md` is the normative spec for the plugin.

## Files

| File | Purpose |
|---|---|
| `llm-role-rank.ts` | CLI report (Node 26, type-stripping — no bun/deno/tsx, no build step) |
| `src/engine.ts` | Ranking engine shared by CLI and plugin: fetch/caches, cardinal transforms, value scoring, `loadRankData`, `computeRankings` |
| `src/settings.ts` | Shipped role defaults (`DEFAULT_ROLES`), plugin-settings deep-merge + validation |
| `src/availability.ts` | OpenRouter key tier gate, catalog filter, variant resolution (`resolveVariant`), provider-allowlist probe (`probeModel`) |
| `src/config-edit.ts` | Surgical line-oriented YAML patch for `modelRoles` + `retry.fallbackChains`, atomic write |
| `src/state.ts` | State/history/lock files under the agent dir; agent-dir resolution |
| `src/updater.ts` | Orchestration: rank → tier gate → hysteresis → chains → config write |
| `src/extension.ts` | omp extension entry: day-gated `session_start` run + `/refresh-roles` |
| `update-roles.ts` | Headless shim: `node update-roles.ts [--dry-run] [--json]` (always forces) |
| `explore.ts` | Interactive ranking explorer: loopback web UI for why-this-rank, live weight tuning, and lock-file export |
| `src/explorer/explain.ts` | Pure explanation layer: rank rows with baseline deltas, per-model decomposition, inverse-cardinal targets, export merge |
| `src/explorer/server.ts` | Zero-dependency HTTP surface for the explorer (static SPA + JSON API) |
| `web/` | Explorer SPA (`index.html`, `app.js`, `style.css`) — no framework, no build step, no external requests |
| `package.json` | Plugin manifest (`omp.extensions`) + the single dependency (`yaml`) |
| `tests/` | `node --test tests/` fixtures: tier gate, variant resolution, config edit, hysteresis, chain pruning, chain suffixes, explorer |
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
  Fallback-chain entries carry the same suffix when their own target supports
  thinking, so a fallback runs at the role's effort rather than the session
  `defaultThinkingLevel`; a key shared by several managed roles (one
  model-scoped chain, two role levels) stays level-free.
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

Per role, each metric is cardinal-normalized with **fixed anchors** (no ranks —
the scale is sample-independent): llm-stats `index_*` scores are interval-scale
with arbitrary zero (observed −16..+60), mapped affinely `(v+20)/80`; benchmarks
are chance-anchored pass rates (gpqa 0.25 four-way guessing baseline, others
chance ≈ 0); throughput is log-anchored 10..300 tok/s (equal log-ratios count
equally, saturated outside the anchors). The quality composite
`q = Σ (weight / (1 − w_price)) × metric` excludes price; the sort key is
`value = q − λ·$/M` with `λ = (w_price/(1−w_price)) / $20` — the price weight's
share, overridable per role via plugin settings `roles.<role>.lambda`. Report
tables show each metric's weighted contribution after a `|` (they sum to `q`;
`—` = missing optional metric, contributes 0) plus the `q` and `value` columns.
Price is OpenRouter's standard-route $/M (3:1 input:output blend) — the penalty
axis, never blended. Every role weights price AND throughput. A model is
eligible for a role only when all `required` metrics are non-null (`required`
is the eligibility gate, independent of weights — e.g. every role requires
throughput without weighting it) and it has a billed price. **★** marks the
Pareto frontier (no eligible model is both cheaper and better on `q`). Cardinal
scoring kills two percentile artifacts: rank compression (real magnitude gaps
now count — e.g. @default flipped DeepSeek-V4.1-Flash → GPT-6 Astra) and
field-dependent scales (adding a model no longer reshuffles everyone).

Roles and weights (see `DEFAULT_ROLES` in `src/settings.ts`, overridable via
plugin settings): `default` (quality-heavy workhorse), `smol` (cheap+fast),
`slow` (capability-heavy), `vision` (requires image input), `plan`
(reasoning/long-context), `commit`, `tiny` (price+throughput dominated),
`task` (agentic), `advisor` (deep reasoning).

## Usage

```
node llm-role-rank.ts [--top N] [--json] [--out FILE] [--refresh] [--url URL]
node update-roles.ts [--dry-run] [--json]
node explore.ts [--port N] [--lock PATH] [--refresh] [--no-open]
npm run explore [-- --port N --lock PATH --refresh --no-open]
node --test tests/
```

- `llm-role-rank.ts` default: markdown report to stdout (per-role tables with
  per-metric weighted-contribution columns + suggested `settings.modelRoles`).
- `--top N`: rows per role (default 10). `--json`: machine payload
  (`fetchedAt, source, modelCount, roles{role:[{rank, modelId, name,
  organization, value, q, lambda, paretoFrontier, priceBlendedUsdPerM,
  throughputTokS, contextTokens}]}`). `--out FILE`:
  write instead of stdout. `--refresh`: bypass both caches. `--url`: override
  the llm-stats page URL.
- `update-roles.ts` runs the plugin pipeline headlessly (key + catalog via the
  `omp` CLI); `--dry-run` prints decisions without writing, `--json` emits
  `{wrote, aborted, decisions[]}` only.
- `explore.ts` boots the interactive explorer (below); `--port` (default 5177),
  `--lock` (default `~/.omp/plugins/omp-plugins.lock.json`), `--refresh` (force
  a refetch before serving), `--no-open` (skip the browser launch). `npm run
  explore` is the same command (pass flags after `--`).

## Explorer (interactive ranking UI)

`node explore.ts` boots a loopback-only web UI (`http://127.0.0.1:5177`) that
answers "why is model X at rank 7 for `@slow`?" and "what happens if I care
more about price than agents?" without editing `src/settings.ts` and re-running
the CLI.

- **Rank table** — every eligible model for the selected role, with `value`,
  `q`, `$/M`, `tok/s`, `ctx`, a `★` Pareto marker, and a `Δ` column showing the
  rank delta against the role's **effective** def (what the plugin does today).
- **Explain panel** — click a row for the full decomposition: each weighted
  metric's raw value → cardinal transform → renormalized weight → contribution
  (bars show share of `q`), the cost block (`λ`, `penalty = λ·price`,
  `value = q − penalty`), "why not higher" (the value gap to the model above
  plus the per-metric target that would close it, with unreachable/extrapolated
  notes), and the models that dominate it on (price, q).
- **Weight editor** — edit the role's weights, `required` set, `filters.image`,
  and `λ` override live; the table re-ranks on every change (120 ms debounce).
  Weights are edited freely (no implicit rescaling): the `Σ` readout turns red
  until `|Σ − 1| ≤ 0.01`, and `Normalize` rescales in one click. Changing the
  price weight visibly changes `λ`.
- **Export** — writes the edited roles into the plugin's settings lock file
  (`~/.omp/plugins/omp-plugins.lock.json` → `settings["omp-llm-role"].roles`),
  atomically and with a `.bak-<timestamp>` sibling, touching only the roles you
  edited (the `plugins` block and sibling settings keys are preserved). The
  change takes effect on the next `/refresh-roles` in a **freshly started** omp
  session — a session started before the write already loaded the old settings.
  `Copy JSON` / `Download JSON` emit the same dirty-roles payload for manual use.
- **Hover explanations** — every column header, metric name, role tab, and
  control carries a tooltip: the rank table's `#`/`Δ`/`★`/`value`/`q`/`$/M`/
  `tok/s`/`ctx` columns explain what they hold, metric names show their cardinal
  transform and anchors (built from `METRIC_META`, so they cannot drift from the
  engine), role tabs show the role's description, and `λ`, `Σ`, `required`, the
  `×` remove button, and the export buttons explain their semantics. One
  delegated listener drives a single floating `#tip` element, so re-rendered
  tables and editors need no per-node wiring.

All ranking math is the plugin's own (`src/engine.ts`): the UI never
reimplements `value = q − λ·$/M`, so the numbers on screen are exactly the
numbers the plugin would use. The server binds `127.0.0.1` only (no auth) and
serves the SPA from `web/` with no build step and no external requests.

Because the plugin's settings are **overrides deep-merged over `DEFAULT_ROLES`**,
a role's weight keys are additive: you can adjust values and add metrics, but a
metric the shipped default weights cannot be dropped from the key set (the
default's weight survives the merge and the sum check fails). The editor's `×`
therefore parks an inherited metric at a negligible weight (`0.001`) instead of
deleting the key — click `Normalize` to redistribute (it rescales the ε too) and
the export validates; metrics you added yourself are deleted outright.

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

## Current state (2026-09-26)

- 398 llm-stats models; OpenRouter matched 152/398 (throughput), 151 priced.
- Eligible per role: 143 (vision 74, image-input filter).
- Value-ranking leaders (committed 2026-09-24 report; today's 09-26 cache shifts
  `smol`/`commit` → Gemini 3.8 Flash and `tiny` → Ling 3.0 Flash Fin):
  `default` GPT-6 Astra (0.835), `smol`/`commit`/`tiny` Muse Spark 1.1, `slow`
  GPT-6 Astra (0.857), `vision` GPT-6 Astra (0.809), `plan`/`advisor` GPT-5.6
  Sol, `task` Muse Spark 1.3.
- Plugin verified live (2026-09-23) with the provider-allowlist probe: the
  account's allowed-providers whitelist excludes first-party openai/azure/
  anthropic endpoints, so the probe gate rewrote `slow` → GLM-5.3 (`:max`),
  `vision` → Kimi-K3 (`:auto`), `plan` → Hy3 (`:high`), `advisor` →
  Hy4-Preview and refilled their chains with probe-clean entries; all 16
  configured roles then served on their configured selector in headless
  sessions (transcript-verified, no fallbacks).
- Plugin run re-verified live (2026-09-26) into a throwaway agent dir
  (`OMP_LLM_ROLE_AGENT_DIR` + a copy of the real config): all 9 roles kept
  their current probe-clean selectors (`commit`/`task` by margin), and the
  written chains showed the new suffix rule — solo keys suffixed
  (`ling-3.0-flash` → `:off`, `kimi-k3` → `:auto`), shared keys level-free
  (plan+advisor on `tencent/hy4-preview`, smol+slow on `z-ai/glm-5.3`).
  60/60 unit tests green.

## Known quirks

- OpenRouter p50 values are a rolling 30-minute window: tok/s numbers and close
  score orderings shift between runs. A captured payload is not ground truth —
  re-fetch before debugging join logic.
- llm-stats has no public API; the RSC flight extraction depends on the page's
  `initialData` key (do not include `[` in the search key).
- `index_*` scores are interval-scale (observed −16..+60, can be negative); the
  fixed affine anchors (−20→0, +60→1) handle it.
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