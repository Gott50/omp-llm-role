# Quirks

Debugging-only oddities and gotchas that are **not** contracts. If a fact is a
contract the implementation MUST satisfy, it belongs in [spec.md](spec.md); if it
is user-facing, it belongs in [`../../README.md`](../../README.md). This file is
the home for the things that only bite someone changing or debugging the code.

## Data sources and joins

- **llm-stats has no public API.** The leaderboard page server-renders its
  dataset into the Next.js RSC flight payload (`self.__next_f.push([1,"..."])`
  chunks ending in an `initialData: [...]` array); the script extracts that
  array. The extraction depends on the page's `initialData` key — do not include
  `[` in the search key.
- **OpenRouter p50 values are rolling routed-traffic windows** (30 minutes for
  the `find` table, longer and per-provider for the model pages): tok/s numbers
  and close score orderings shift between runs. A captured payload is not ground
  truth — re-fetch before debugging join logic.
- **The OpenRouter join is by slug suffix only** (llm-stats `model_id` (bare) ==
  `slug.split("/")[1]`). Models whose llm-stats id has no OpenRouter counterpart
  — or no route with throughput data on the model page or in the find table's
  30-minute window — are unranked.
- **The find table's route and the page's record for the same endpoint id can
  disagree** by a few percent (price revisions, status flips, p50 windows) — the
  page copy wins the pool merge; the find row joins only when the page does not
  list its endpoint id at all.
- **`index_*` scores are interval-scale** (observed −16..+60, can be negative);
  the fixed affine anchors (−20→0, +60→1) handle it.

## Capability fill

- **The fill can invert against the covered field.** The capability fill
  (`CAPABILITY_FILL`, 0.195) is the percentile implied by the *uncovered*
  cohort's mean general index, which sits above the bottom of the covered
  field — so a covered model in the bottom ~8% of the field scores *below* a
  model with no Design Arena data at all. Measured 2026-10-03: 4 of the 51
  covered in-pool models (24 of 121 across all models). This is a
  debugging-only oddity, not a contract; the fill is deliberately conservative
  and a regression fill was rejected (see the `applyDesignPercentiles` comment).

## The 1/price² blend

- **The blend renormalizes throughput over the routes that have p50 data**,
  which biases toward providers currently getting traffic; a stable route with
  no recent requests contributes price weight but no throughput. A degraded
  cheapest route (status ≠ 0) drops out of the blend entirely until it recovers
  — its traffic shifts to the next-cheapest providers, exactly what the router
  does, but the price can jump (e.g. `deepseek-v4-flash`'s $0.044/M
  `open-inference` route sat at status −5 on 2026-09-30, leaving the $0.13 blend
  of the remaining routes).
- **The blend weights routes by the documented default-strategy formula (1/p²),
  not by the page's observed request counts**: the counts aggregate ALL
  OpenRouter traffic (`:nitro`/`:floor` and `sort` users included), so they
  estimate a random request's experience, not this account's default routing.
  The two estimators diverge where capacity binds — on a live deepseek-v4-flash
  probe, `gmicloud/fp8` ($0.1137) carried 37% of observed requests vs 12% at
  1/p², making the traffic-weighted blend $0.138 / 55 tok/s vs the shipped
  $0.133 / 46. Revisit if live cost/throughput diverges from the ranking.

## Caches

- **Freshness is the UTC day, not a TTL.** Every cache is fresh while its
  `fetchedAt` is the current UTC day; the chain is fresh cache → live fetch
  (writes cache) → stale cache → no enrichment. An empty/unusable OpenRouter
  payload is never cached, so the next run retries. llm-stats fetch failure is
  fatal (no data at all); OpenRouter, Design Arena and writing failures are
  non-fatal.
- **`loadRankData` refetches on a stale UTC day.** Offline analysis that must
  reuse a captured payload has to bypass `loadRankData` (or pin the cache's
  `fetchedAt` to today) — otherwise a run after midnight silently hits the
  network and the numbers move under you.

## Settings deep-merge

- **A shipped weight cannot be deleted, only parked.** Plugin settings are
  overrides deep-merged over `DEFAULT_ROLES`, so a metric the shipped default
  weights survives the merge even if the override omits it — and the sum check
  then fails. The explorer's `×` therefore parks an inherited metric at
  `EPSILON = 0.001` (`web/app.js`) instead of deleting the key; `Normalize`
  rescales the ε too. Metrics the user added are deleted outright. The same
  merge applies to `thinking`: a role whose shipped default (or lock file) sets
  a level cannot be returned to bare by omitting the key, so the editor disables
  `— (bare)` for those roles.

## Benchmark sources

- **An external metric key must be dot-free.** The flat dotted settings path
  splits on `.` (`setNested(patchObj, key.split("."), value)`), so a metric key
  containing `.` mis-nests on read-back — the real llm-stats id
  `alpacaeval-2.0` would become `...weights.bench:alpacaeval-2: {0: w}` and
  silently vanish. `normalizeMetricKey` maps `.` to `_`, so the metric is
  `bench:alpacaeval-2_0` while the source keeps the raw id for the fetch URL.
- **The raw id cannot be reconstructed from the metric key**, so a generic
  llm-stats benchmark is persisted as a declaration in
  `benchmark-sources.json`; the engine's `sourceForMetric` falls back to the
  local part as the raw id only when no declaration exists (correct for a
  dot-free id, wrong for a dotted one).
- **`api.zeroeval.com/leaderboard/benchmarks/<id>` is case- and
  separator-sensitive**: `alpacaeval-2.0` returns 200, `alpacaeval-2_0` and
  `ALPACAEVAL-2.0` return 404. The declaration's `fetch.url` must carry the raw
  id exactly as the site spells it.

## Runtime

- **Node type-stripping does not typecheck**: property-name typos surface as
  `undefined` at runtime, not compile errors. Always run the script after edits
  and sanity-check stderr match counts and eligible counts.
- **omp's extension registry differs from its CLI JSON in two spots** (adapted
  in `src/extension.ts` only): the key comes from
  `modelRegistry.getApiKeyForProvider("openrouter")` (`getApiKey` returns
  `undefined` there), and registry rows carry `thinking` as an effort object
  (`{mode, efforts[], …}`) which `extDeps` normalizes to the CLI's string array.
  In print/headless mode `ctx.ui.notify` is a no-op, so the extension mirrors
  decisions and aborts to stderr.
- **A running omp session keeps the old in-process plugin code.** After a plugin
  update (or a `link` to a changed tree), a session that was already running
  still executes the module it loaded at start; a write from that stale code can
  revert a newer write. Restart the session after updating the plugin.
- **Testing a registered slash command needs `--mode rpc` or a TUI** — `omp -p`
  (print mode) sends a leading `/name` as a *prompt* to the model, so the handler
  never runs and `ctx.ui.notify` is a no-op anyway. RPC mode does dispatch them:
  pipe `{"id":1,"type":"prompt","message":"/create-agent …"}` on stdin and the
  handler's `console.error` output (the `!hasUI` mirror in `notifyLines`) lands on
  stderr; `get_available_commands` confirms registration. Verified this way for
  `/create-agent` and `/explore-roles` (omp 18.4.8).

## Historical

- **Bare roles were priced as if thinking were free** (fixed 2026-09-30).
  `rankRole` charges the level factor only when the model will run the role's
  level, so a bare role was priced at the billed blend ×1 while the session
  `defaultThinkingLevel` (here `auto`) billed ~1.86× at run time — the ranking
  under-stated its cost, and a model whose catalog supports the level was
  priced differently from one that does not. `default`/`task`/`advisor` now
  pin `auto` and `tiny` pins `off`, so every shipped role carries a level and
  the ranking prices what runs. A model whose catalog lacks the pinned level
  is still priced bare (omp clamps it), which is the intended asymmetry.
- **`designarena.ai/robots.txt` disallows `/api/`** for `User-Agent: *` and the
  leaderboard route is `/api/leaderboard` — the daily fetch targets a
  disallowed path by explicit owner decision (robots.txt read as advisory
  for crawlers, not API clients). If the route starts failing
  (401/403/404), the non-fatal fallback leaves the ranking on the OpenRouter
  mirror alone; the designer-pool design count then reverts to the mirror-only
  42/87.
