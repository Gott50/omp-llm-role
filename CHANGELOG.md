# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Entry and version-bump policy: [`docs/dev/releasing.md`](docs/dev/releasing.md).

## [Unreleased]

### Added

- **Opt-in error reporting: an unexpected plugin error becomes a GitHub issue**
  — a new `errorReporting` setting (`off` — the default — `ask`, `auto`) turns a
  genuinely unexpected failure into one structured report (plugin version,
  runtime, platform, the command that failed, error name/message/stack and a
  timestamp) filed on `Gott50/omp-llm-role`. `ask` shows the exact payload and
  files on confirmation, degrading to a notified prefilled `…/issues/new` URL in
  a session with no UI so it never uploads without asking; `auto` files without
  asking; `off` never files and is byte-identical to today's behaviour. A token
  (`GITHUB_TOKEN` → `GH_TOKEN` → `gh auth token`, never stored) uses the API,
  while no token — or a token that cannot write issues here — falls through to
  the prefilled-URL path. The payload is redacted (home directory → `~`,
  token-shaped strings → `<redacted>`) and never contains config contents, model
  selectors, prompts or history rows. A repeat occurrence comments on the
  existing **open** issue (a fingerprint marker dedupes it), a reappearance
  after the issue was closed opens a fresh one that links the old, and the path
  is capped (one open issue per fingerprint, one creation per fingerprint per
  UTC day, 3 creations per UTC day) so a crash loop cannot spam the tracker. The
  whole path is best-effort — wrapped, bounded by a timeout, and unable to
  affect the run it reports on. Only *exception* aborts are reported:
  `RunResult` now carries `defect`, set by the `ConfigEditError`/catch-all throw
  sites and left unset by the enumerated environment aborts (invalid settings,
  ranking data unavailable, tier `none`, lock, conflict, key-fetch failure), so
  those expected conditions stay notify-only. The ledger of what was filed,
  offered or suppressed lives in `llm-role-error-reports.json` under the agent
  dir. (issue #48)
- **Capability presets: one opt-in flag per capability** — a role can now turn on
  a whole capability with one named flag instead of hand-tuning its knobs. Four
  flags ship: `endpointCeilings` (`filters.tools: true`,
  `filters.minOutputTokens: 16384`), `cachePricing` (`cacheHitRate: 0.5`),
  `providerPinning` (`preferOwnProvider: true`) and `costCap`
  (`filters.maxPriceUsdPerM: 10`). The registry (`FEATURES` in
  `src/features.ts`) is the single source of truth for every surface, and
  `expandFeatures` is the single implementation of the precedence rule
  (`effective def = shipped default ⊕ preset(enabled flags) ⊕ explicit user
  keys`): a flag is on when `roles.<role>.features.<id>` is present (it wins
  either way) and otherwise when the global `features.<id>` is `true`, so a
  per-role `false` beats a global `true`; the preset fills only knobs the role
  does not already set, and an explicit key is merged last, so it always wins.
  The flags are settable from every role-authoring surface — `--feature <id,...>`
  on `create-role.ts`, `/create-agent` and `/project-roles`, with
  `--list-features` on the first two, and the explorer's new Features panel
  (tri-state per
  capability, recommended vs effective values, derived values marked; Export
  writes the flag, never the expanded knobs) — and the explorer's
  `/api/rank`/`/api/explain` expand the posted def with the scope's global flags
  before ranking, so the preview matches the baseline Δ. **Every flag ships off**
  and no shipped role sets one, so installing this change changes nothing until a
  user opts in (the resolved roles are byte-identical to `DEFAULT_ROLES`).
  `providerPinning`'s recommended setting is a **soft per-model policy**
  (`preferOwnProvider`), not a hard `providerPin`: it re-prices a model on its
  own lab's route where one exists (a slug-prefix match on the model's `orgId`,
  with the display `org` as a second try) — the route's billed price **and** its
  p50 throughput, the same basis a hard pin uses, so `q` moves as well as
  `priceEff` — and falls back to the `1/price²` blend
  otherwise, so it never makes a model ineligible — an org whose lab slug differs
  (`zai-org` → `z-ai`) keeps the blend rather than being mis-pinned. The hard
  `providerPin` (an explicit slug) is untouched. `minContextTokens` is
  deliberately not part of `endpointCeilings` (an absolute floor cannot express
  the video's fraction-of-the-model's-own-window complaint). (issue #40)
- **Cross-source axis on the focus-metric gate** — the ninth focus-metric axis
  cross-checks the plugin's own price/context against the zeroeval per-benchmark
  payload's **second, independent** set of the same quantities.
  `parseBenchmarkPayloadMeta` now reads each entry's `input_cost_per_million`/
  `output_cost_per_million`/`speed_rps`/`context_window` (each a finite number,
  else `null`) onto `BenchmarkPayloadMeta.crossSource`, keyed by the entry's
  `model_id` (`null` when no entry carried any of the four). The axis joins a
  pool model to its row **directly on the bare id** (the generic llm-stats
  benchmark's `entries[].model_id` is the llm-stats id, the same space as
  `Model.id`), compares zeroeval's 3:1 blend `(3·input + output)/4` against
  `m.price` and `row.context` against `m.context`, and reports the median
  relative divergence per axis against `PRICE_AGREEMENT_TOLERANCE` (0.5 — a
  **chosen, tunable heuristic**). `speedAgreement` is **informational only** and
  excluded from `status`: the units differ (zeroeval `speed_rps` is requests/s,
  the plugin's `throughput` is output tok/s) and re-deriving throughput from
  `speed_rps` is explicitly out of scope. The axis is an **annotation, never a
  gate** — `belowBarReason` has no cross-source branch, and it never feeds
  `price`/`weightPrice` or any ranking input (the `1/price²` blend is unchanged;
  a test pins `rankRole` byte-identical with the annotation on). The create
  report, the explorer focus table and the CLI report print the axis. (issue #38)
- **Provenance axis on the focus-metric gate** — the eighth focus-metric axis
  carries the benchmark's provenance: the owner (the catalog row's
  `dataset_org_id`, falling back to `dataset_slug`) and the source's own
  per-entry org mix (the dominant lab and its share, read from each row's
  `organization_id`, falling back to `provider_id`). `parseBenchmarkCatalog`
  reads the row's `dataset_id`/`dataset_org_id`/`dataset_slug` onto
  `BenchmarkCatalogEntry` (each `null` when absent, non-string or empty),
  `parseBenchmarkPayloadMeta` reads the per-entry org distribution onto
  `BenchmarkPayloadMeta.provenance`, and the catalog-cache shape guard now also
  requires all three dataset fields (a pre-#37 cache is refetched). The axis is
  the **source's own claim** about who publishes the benchmark and whose scores
  it carries — an independent cross-check on the pool-derived `composition` axis
  (whose rule is unchanged), with `compositionAgreement` recording whether the
  two concur (`disagree` when exactly one flags `below-bar`, `agree` when both or
  neither, `unknown` when the payload carries no org mix). It is an
  **annotation, never a gate** — `belowBarReason` has no provenance branch, so a
  vendor-populated source is warned but never drops a discovered candidate; it is
  `unknown` when there is neither an owner nor a payload org mix. The create
  report, the explorer focus table and the CLI report print the axis. (issue #37)
- **Maintenance axis on the focus-metric gate** — the seventh focus-metric axis
  carries the benchmark's own maintenance: the catalog row's `updated_at` age in
  months against `FOCUS_DATASET_STALENESS_MONTHS` (12), with `version_count` and
  `star_count` as supporting detail. `parseBenchmarkCatalog` reads the row's
  `updated_at`/`version_count`/`latest_version_row_count`/`star_count` onto
  `BenchmarkCatalogEntry` (each `null` when absent, non-string or non-finite),
  and the catalog-cache shape guard now also requires all four (a pre-#36 cache
  is refetched). This is the **dataset-date** axis, distinct from the model-date
  `freshness` axis: a benchmark whose dataset was last touched years ago but
  whose rows include one recent model passes freshness and is caught here. The
  axis is an **annotation, never a gate** — `belowBarReason` has no maintenance
  branch, so a stale dataset is warned but never drops a discovered candidate;
  it is `unknown` when the catalog row is absent or its `updated_at` is
  missing/unparseable. The create report, the explorer focus table and the CLI
  report print the axis. (issue #36)
- **Modality axis on the focus-metric gate** — the sixth focus-metric axis
  carries the benchmark's modality: the catalog row's `modality` (text/image/
  audio/video/multimodal) and the payload's per-entry `multimodal` share.
  `parseBenchmarkCatalog` reads the row's `modality` onto `BenchmarkCatalogEntry`
  (an open string, so an unknown value survives), `parseBenchmarkPayloadMeta`
  reads the per-entry `multimodal` flag onto `BenchmarkPayloadMeta.modality`, and
  the catalog-cache shape guard now also requires the field (a pre-#35 cache is
  refetched). The axis is an **annotation, never a gate**: there is no role
  modality field, so it is never `below-bar` and never a drop reason; it is
  `unknown` only when neither the catalog row nor the payload carries a modality
  signal. The create report, the explorer focus table and the CLI report print
  the axis. (issue #35)
- **Trust axis on the focus-metric gate** — the fifth focus-metric axis reads the
  benchmark payload's per-entry `self_reported` flag: a source whose covered
  entries are mostly self-reported (above `FOCUS_SELF_REPORTED_MAX_SHARE`, 0.5) is
  flagged, so a role author does not rank on vendor-submitted scores. The
  per-entry `verified` flag is carried but not gated (uniformly `false` upstream
  today). `parseBenchmarkPayloadMeta` reads the flags independently of the
  source's parser, `BenchmarkPayload`/`BenchmarkScores` carry the summary as
  `meta`, and the scores cache persists it. The catalog row's `is_community` now
  rides `BenchmarkCatalogEntry`, guarded by a catalog-cache shape check (a cache
  written before the field is refetched). A discovered candidate below-bar on
  trust is dropped non-fatally with a reason; a user-named metric is warned, never
  dropped; a payload with no entry flags (a declared/writing source) or an
  unloaded metric reports `trust: unknown`, never a silent `ok`. The create
  report, the explorer focus table and the CLI report print the axis. (issue #34)
- **Cache-read pricing in the cost axis** — a role may now declare an assumed
  cache-hit rate (`roles.<role>.cacheHitRate`, 0–1; `0`/absent = off) and its
  effective input price blends the endpoint's cache-read price with its full
  input price before the 3:1 billed blend and the thinking factor. The
  `OpenRouterEndpointRecord` gains `cacheReadPrice` (the endpoint's
  `pricing.input_cache_read`, read by the find payload and the model pages), and a
  new `routeEffectivePrice` accessor is shared by the blend, the pinned-route
  path and `roleMetricValue`. The `1/price²` weight basis stays the **listed**
  input price (the router's sort key), so a cheap cache on a lightly-weighted
  route cannot dominate; a route with no cache-read price keeps its full input
  price (missing data is not a silent discount); `maxPriceUsdPerM` caps the
  cache-adjusted `priceEff`; `explainModel` mirrors it and the SPA cost line
  marks `· cache <rate>`. With no rate set the ranking is byte-identical — the
  knob is opt-in and no shipped role sets it. Validation range is `[0, 1]`.
  (issue #30)
- **Explorer scope switcher** — the explorer is no longer user-level only. A
  **scope** is a role-config source: the user-level scope, or one project where
  `/project-roles` was used. The header lists every known scope — the user-level
  scope, the projects in a new global registry (`llm-role-projects.json` in the
  agent dir, written by the project-aware updater on any project-scoped run,
  before the day-gate early return, so a day-stamped no-op still registers), and
  the current session's project when its cwd has a project role config — and
  opens on the session's project when present, else user-level. Switching
  re-reads that scope's roles and universe from disk (a project scope resolves
  as the project lock merged over the user-level lock — the updater's own read)
  and points Export at that scope's lock file, with the same validate → backup →
  atomic write path; a project whose lock file is gone is shown disabled and
  cannot be selected. The ranking dataset is loaded once as the union of every
  known scope's resolved roles, so a metric only one scope weights (e.g. a
  project-only declared `bench:<id>`) is fetched and switching is free. New
  `POST /api/scope` endpoint; `GET /api/bootstrap` gains `scopes`/`activeScope`
  and its `lockPath` is the active scope's. (issue #28)
- **Endpoint capability ceilings as role filters** — a role may now gate its pool
  on the per-endpoint capability ceilings the model pages already carry:
  `filters.tools` (require a tool-capable route), `filters.minContextTokens` and
  `filters.minOutputTokens` (drop routes below the endpoint's `context_length` /
  `max_completion_tokens`), and `filters.maxPriceUsdPerM` (drop a model whose
  thinking-adjusted blend exceeds the cap). The gate runs on the eligible
  standard-tier route pool **before** the `1/price²` blend: a route failing any
  declared filter drops, a `null` capability field is kept (missing data is not a
  failure), and a model whose every route fails is ineligible — the single
  find-route fallback does not resurrect it. `minContextTokens` now filters the
  **endpoint** context, not the model-level `context`. A dropped model is
  recorded on the decision (`endpoint-blocked: …`) and explained by
  `explainModel`. No shipped role sets an endpoint filter. (issue #18)
- **Four-axis benchmark-quality gate** — `/create-agent` discovery now assesses
  each focus metric on four axes, not coverage alone: **coverage** (share of the
  pool carrying the metric), **dispersion** (IQR/median of the cardinal-normalized
  covered values — a saturated metric cannot separate models), **composition**
  (a pool org above 10% share absent from the covered set) and **freshness** (the
  newest covered model's release date against the pool's newest). A discovered
  candidate below-bar on any axis is dropped non-fatally with a reason naming the
  axis; a user-named metric is never dropped — it is annotated and warned. The
  gate probe-fetches each candidate's source and assesses the joined pool; an
  empty pool or an unloaded metric reports every axis `unknown`, never a silent
  `ok`. The create report prints the four signals, the explorer renders them in a
  focus table, and the CLI report annotates a role's focus metrics. (issue #17)
- **`/project-roles` command and a project-scoped updater** — a new command
  discovers the project's usecase from its own artifacts (README, package.json,
  AGENTS.md, docs listing, git log, file tree) through an in-process profile
  architect, proposes a project-scoped role set, authors the new roles' agents,
  and applies the project's `modelRoles` to `<cwd>/.omp/config.yml`. When the
  project carries its own `omp-llm-role` settings entry, the updater scopes the
  config, the settings read, and the state/history/lock to `<cwd>/.omp` — the
  global `~/.omp/agent/config.yml` is never written in project mode, and the day
  gate is per scope. `--dry-run` writes nothing; without `--force` an existing
  project role config is refused. The explorer stays user-level only. (issue #27)
- **Explorer key-availability marking** — the explorer now overlays every ranked
  model with a **usable** / **key-blocked** / **unknown** badge derived from the
  key-authenticated `GET /api/v1/models` (the account setting "Filter the model
  catalog for API keys" makes it a per-key allowlist; set membership is the only
  signal). A **hide key-blocked** toggle drops blocked rows, the header shows the
  allowlist size, and the explain panel names the reason. When the setting is off
  every badge reads *unknown* with a hint naming the OpenRouter setting. The mark
  is a read-only overlay — it never edits roles, reorders ranks or changes an
  Export. The shared `KeyAvailability` primitive (`computeKeyAvailability` /
  `fetchKeyAvailability` in `src/availability.ts`) is the same one the updater's
  fast path consumes.
- **Coverage-safe benchmark discovery in `/create-agent`** — discovery now
  refuses a benchmark that would turn the role's quality score into a coverage
  score: a fill-0 metric whose catalog coverage is below 35% of the ranking field
  is dropped (non-fatal, with a reason), while a capability-filled metric
  (`writing`/`website`/`bench:<id>`, fill 0.195) stays weightable at any coverage.
  The focus set is capped at 3 (priority order preserved) so one benchmark keeps
  a decisive share. The create report prints each focus metric's coverage and
  warns below the bar; `--dry-run` and `--json` carry the same signal (issue #11).
- **Differentiation warning** — the create report warns when the new role's top
  pick equals the `default` role's top pick, so a role that adds nothing is
  visible before it is wired.
- **Mapped the remaining llm-stats leaderboard fields** — `buildModels` now maps
  four more `index_*` scores (communication, finance, healthcare, legal; affine
  transform) and fifteen more 0–1 benchmark scores (`simpleqa_score`,
  `hle_score`, `mmmu_score`, `mmmu_pro_score`, `mmmlu_score`, `browsecomp_score`,
  `swe_bench_pro_score`, `mcp_atlas_score`, `apex_agents_score`, `osworld_score`,
  `scicode_score`, `screenspot_pro_score`, `charxiv_r_score`, `frontiermath_score`,
  `toolathlon_score`), all registered in `KNOWN_METRICS` and `METRIC_META` and
  keyed by their raw leaderboard field names. They are 0-filled by default and no
  shipped role weights them, so `DEFAULT_ROLES` is unchanged; `coding_arena_score`,
  `latency` and `context` stay unmapped. (issue #22)
- **Provider pinning (`roles.<role>.providerPin`)** — a role may pin its requests
  to one OpenRouter provider route; the plugin emits the pin as a trailing
  `@<slug>` on the selector (`openrouter/<id>@<slug>[:<level>]`, the thinking
  suffix after the slug), and every fallback-chain value carries it (the chain
  key stays level-free). Hysteresis strips the pin for identity, so a pinned
  current selector still resolves to its base ranking id. A pin that matches no
  route leaves the role **unchanged** — no selector or chain upsert, the existing
  chain preserved — with a notify naming the role and the pin. The explorer's
  Export round-trips `roles.<n>.providerPin` and the `/settings` schema exposes
  it. OpenRouter's `only` routing is exclusive, so a pinned request opts out of
  auto-Exacto tool routing — pinning is opt-in for that reason. (issue #19)
- **Route-aware pricing for pinned roles** — when `providerPin` is set, `rankRole`
  prices the model's matching route (exact, tiered-verbatim `providerSlug`)
  instead of the `1/price²` blend: the route's billed 3:1 price × the role's
  thinking factor, the route's p50 throughput (falling back to the blended
  throughput when the route has no p50, so a sparse route never zeroes it), and
  `maxPriceUsdPerM` capping the route price. A model with no matching route is
  ineligible for that role and is recorded (`providerPinDrops` →
  `Decision.pinBlocked`, rendered `; pin-blocked: …`); `explainModel` mirrors the
  gate and pricing. An unpinned role ignores `routes` and is unchanged.
  (issue #20)
- **Community flag on the trust axis** — the focus-metric trust axis now carries
  the catalog row's `is_community` flag as `community`, so a community-submitted
  benchmark is visible even when the payload half is absent (no per-entry flags).
  It is an annotation, never a gate: it never changes `status` and
  `belowBarReason` has no community branch. The create report, the CLI report and
  the explorer's trust cell render it. (issue #43)
- **`/project-roles` plan prints the authored capability flags** — the plan
  report now prints a `features: <id>=<on>,…` line under each new role whose def
  carries features, so a `--feature` run shows what it will author before the
  write. (issue #45)

### Changed

- **`providerPinning` coverage numbers corrected** — the measured lab-match
  coverage is 51 of the 149 routed models (33 exact `orgId`, 17 `orgId` prefix, 1
  display-`org` fallback), and 10 of 25 orgs match for no model; one org
  previously listed as unresolved resolves via the display-`org` fallback (org
  `Inception` → slug `inception`). Docs only. (issue #44)

- **Guardrail/alignment axis evaluated and not landed** — the catalog's
  guardrail/alignment entries were measured as a "completes the objective without
  tripping guardrails" axis and left unweighted: the semantically-relevant
  entries (`siren-agentdojo-*`, `automationbench-aa`) sit at one model, the
  best-covered candidate covers 5.0% of the field (7× below the 35% floor), and
  the safety/security entries that do carry data are collinear with `general`
  (r 0.89–1.00) — the 0-fill is a cost-promotion lottery that lands on models
  3–10× pricier. Numbers and verdict in `docs/dev/scoring.md`. (issue #31)
- **Per-task cost composite evaluated and deferred** — no per-task (or per-role)
  token profile exists: the published sources carry no per-task metric, omp's
  per-role usage is auxiliary-only (2 roles, 2 models), and the one per-model
  profile the plugin already has (OpenRouter analytics) is platform-wide
  aggregate traffic whose prompt/req is ~10–14× the plugin's own measured
  input/req, so landing it would price OpenRouter's workload mix, not the role's.
  The $/M price stays the price axis. Numbers and verdict in
  `docs/dev/scoring.md`. (issue #32)
- **Agentic multi-agent axes evaluated and not landed** — no source measures
  delegation, teams, handoffs, swarms, recovery or a2a: the catalog sweep returns
  zero hits, the one multi-agent eval (`acebench`) is below the 3-model floor,
  the per-benchmark endpoint's 20-entry cap makes the 35% coverage bar
  unreachable for any generic benchmark, and the agentic-adjacent candidates are
  collinear with the shipped `agents`/`tool_calling` indices. Numbers and verdict
  in `docs/dev/scoring.md`. (issue #33)
- **Truthfulness axis evaluated and not landed** — the llm-stats
  `simpleqa_score` was measured as a truthfulness axis and left unweighted: it
  covers 11.8% of the field (0/3 on the probe-walk-reachable pool), correlates
  0.68–0.89 with `general`, and the 0-fill flips the `default` leader to a model
  1.9× more expensive — a pure coverage lottery for exactly the models the
  selector chooses from. Numbers and verdict in `docs/dev/scoring.md`. (issue #24)
- **Blend weight basis aligned with the router's sort key** — the `1/price²`
  blend now weights routes by the **input (prompt) price** (the router's sort
  key) while reporting the **billed 3:1 in:out blend** under that distribution;
  previously both used the billed blend. Each route carries `weightPrice`
  (input-only $/M) alongside `price`, `parseFindData` emits a parallel
  `endpoint_weight_price` map, and a route with no input price drops from the
  pool. The endpoints cache rejects records lacking `weightPrice` and refetches.
  Basis verified against Tarun Chitra's *Caching Cheaters on OpenRouter*
  (2026-08-14): 64/64 informative splits picked the cheapest-input provider and
  the recovered inverse-square exponent is r = 1.968. (issue #21)
- **Domain-knowledge axis evaluated and not landed** — the llm-stats
  `index_finance`/`index_legal`/`index_healthcare` scores were measured as a
  domain-knowledge axis and left unweighted: they correlate 0.66–0.84 with
  `general`, the 0-fill flips the `default` leader on a coverage lottery, and the
  capability fill still flips it on the reachable pool. Numbers and verdict in
  `docs/dev/scoring.md`. (issue #23)
- **Updater keyed-catalog fast path** — the updater now consumes the shared
  `KeyAvailability` primitive: when the account's OpenRouter "Filter the model catalog
  for API keys" setting is on, allowed candidates skip the probe and key-blocked
  candidates are pruned from the probe walk (the budget counts candidates examined, so
  pre-seeding a blocked verdict would not save it); candidates in neither catalog are
  still probed. With the setting off or the fetch failing, the probe walk remains the
  sole gate — no abort path. Cheaper refreshes on accounts with provider restrictions.
- **Designer agent + role reconciled with the repo's contracts** — the shipped
  `designer` agent body now renders and inspects its own output (dev server →
  `browser.open` → `screenshot` at the project's real breakpoints, both themes,
  focus states), its `tools:` allowlist is trimmed to the design-relevant set
  (dropping `ida`/`security_scan`/`debug`/`github` and the memory/context tools),
  its font rule is scoped to projects with no type system, and its description
  reads as a routing rule. The `designer` role trims the collinear `code` weight
  (0.10 → 0.06, r = 0.890 with `website`) and moves the freed share to the
  independent `price`/`throughput` axes, and the `design` archetype now derives
  its weights from the shipped role by reference. Docs corrected: the engine
  comment points at `docs/dev/quirks.md`, which now documents the capability-fill
  inversion, the README caveat no longer claims absence is never a penalty, and
  the scoring doc's rule 7 carries the new numbers. (issue #12)
- **Role weight rebalance** — `plan`/`slow` drop the collinear, sparse `math`
  metric and move its share to the consolidated `general` axis
  (capability-preserving, so `slow`'s speed weight stays a tiebreaker);
  `default`/`slow`/`plan`/`advisor` merge the near-duplicate `general`+`reasoning`
  pair (r 0.984) into a single `general` weight as a pure relabel; and
  `smol`/`commit` raise their price weight to 0.45 so it actually binds (the
  value leader is no longer the quality leader). `plan`'s description drops
  `math` to match. (issue #13)
- **`plan` cost posture now binds on the reachable pool** — `plan`'s `price`
  weight is raised 0.12 → 0.25 (λ 0.00682 → 0.01667), rescaling the non-price
  weights (so `q` is unchanged), because the leader-flip threshold measured on
  the pool the account can actually run is w_price 0.2175 — below the old
  weight. The `plan` pick among reachable models becomes DeepSeek-V4.1-Flash
  (5.4× cheaper than Hy4 preview), while the full-pool #1 (Muse Spark 1.3) is
  unchanged; the flip rides on `long_context` imputation (DeepSeek has no
  llm-stats long-context evidence, so it scores the capability fill, not a
  measured weakness). The scoring doc's rule 6 now says which pool to measure
  the threshold on and documents the value-leader == quality-leader degenerate
  case. (issue #16)
- **`/create-agent` writes the agent file before the role** — an agent with no
  role is harmless (its `@<name>, @default` chain falls back to `@default`),
  while a role with no agent is a ranked-but-dead entry. A failed role write now
  rolls the agent file back — restoring the prior file on a `--force` re-create,
  else removing the new one — so a partial failure never leaves a dangling role,
  a retry needs no `--force`, and the user's prior agent is never destroyed.
- The `/create-agent` benchmark prompt now marks the metrics the role already
  weights (the "already in this role's weights" marker), so you do not re-add
  one.
- **Free-text benchmark extraction ignores the always-weighted backbone** —
  `general`/`price`/`throughput` are weighted by every archetype, so ordinary
  prose naming one no longer folds it in as a focus metric; `reasoning` stays
  extractable (not every archetype weights it).
- The vendored agent-creation architect prompt carries a source-version marker
  (`ARCHITECT_PROMPT_VERSION`), asserted by a test against the prompt header and
  the docs, so an omp upgrade surfaces as a failure rather than silent drift.
- **Maintainer docs: `docs/dev/spec.md` retired.** Its still-relevant content
  moved into the topic docs — the verification plan into a new
  `docs/dev/testing.md`, the non-goals into `architecture.md`, the
  key-metadata/tier-gate and variant-resolution contracts into
  `data-sources.md`/`architecture.md`, and the settings validation rules into the
  README. The docs index and `AGENTS.md` now point at `testing.md`.

### Fixed

- **The ranking report states the λ formula correctly** — the CLI banner (and the
  `docs/llm-role-rankings.md` header it generates) read `λ = price-weight share ÷
  $20`, which is wrong by a factor `1/(1−w_price)`: `roleLambda` derives
  `w_price/(1−w_price)/P_REF_USD` (`P_REF_USD = 20`, `src/engine.ts:888`), so the
  `default` role's `w_price` 0.1 gives λ 0.00556, not 0.005. The header now reads
  `λ = w/(1−w) ÷ $20 (w = price weight)`. Prose-only: no ranking number moves.
- **The benchmark-scores cache shape guard now covers the payload meta** — a
  `cache/bench-<id>-fetched-data.json` written before the payload-meta fields
  (#34/#35/#37/#38) lacks the `meta` key, and `readScoresCache` accepted it, so
  the four payload-derived focus axes (trust, modality, provenance, cross-source)
  went silently inert until the next daily refetch. The guard now rejects a cache
  lacking the `meta` key and refetches; `meta: null` (a declared/writing payload)
  is still accepted. (issue #41)
- **Explorer focus table: the unassessed row now says how to assess it** — the
  row read "not assessed — reload to assess the edited definition", but a plain
  reload discards the editor's in-memory edit, so the message was wrong. It now
  reads "not assessed — Export, then reload to assess the edited definition".
  (issue #42)
- **`/create-agent` retries a malformed architect response once** — a parse
  failure now retries the architect once (a `run()` failure propagates
  immediately, since a second session would fail the same way), and the final
  error carries the raw architect output so the failure surfaces what the
  architect actually said. (issue #46)
- **Export now removes a role's stale keys** — `mergeExport` wrote the def's keys
  but never deleted the role's existing `roles.<name>.*` flat dotted keys, so a
  capability flag set back to inherit (or a cleared knob) stayed in the lock and
  the flag stayed on after a reload. `mergeExport` now deletes the role's
  existing keys first, so an Export means "make this role's keys match this def".
  (issue #47)
- **The endpoints cache shape guard now covers the cache-read price** — a
  `cache/openrouter-endpoints-fetched-data.json` written before #30 lacks
  `cacheReadPrice`, and `readEndpointsCache` accepted it, so every route's
  cache-read price read as `undefined` and a role's `cacheHitRate` was silently
  inert until the next daily refetch. The guard now rejects a cache whose
  records lack `cacheReadPrice` (alongside `weightPrice`/`contextLength`) and
  refetches, so the knob takes effect on the first run after the upgrade.
  (issue #30)
- **Explorer: `gpqa`'s "what would it take" target ignored the chance anchor** —
  `inverseCardinal` returned the normalized target unchanged for `gpqa`, but the
  forward transform is chance-anchored (`(v−0.25)/0.75`), so a role author was
  told to reach a 0.50 pass rate when the model actually needs 0.625. The
  inverse now reads the engine's `BENCHMARK_CHANCE` table (now exported) and
  returns `t·(1−chance)+chance` for a chance-anchored metric, so forward and
  inverse agree for every weightable metric; a round-trip property test over
  every `KNOWN_METRICS` key guards it. (issue #29)
- **Endpoint filters now gate the priced route pool, not just eligibility** —
  `rankRole` narrowed a model's eligibility to "has at least one route clearing
  the role's filters", but still priced it on the `1/price²` blend over the
  **unfiltered** pool, so a `filters.tools` (or `minContextTokens`/
  `minOutputTokens`) role ranked a model on its cheap incapable routes. The role
  is now priced on the blend over the routes that survive the filters — the pool
  the router would actually choose from (`blendRoutePool` /
  `endpointFilteredModel`, issue #18) — and `explainModel`/the explorer rows
  carry the same effective price. No shipped role declares an endpoint filter,
  so the default ranking is unchanged.
- **`/project-roles` failed on a project with no `.omp` yet** — the atomic
  writer wrote its `<path>.llm-role-tmp` sibling without creating the target's
  directory, so the first project-scoped write into `<cwd>/.omp/plugins/` (which
  omp does not create until something writes there) died with
  `ENOENT: ... omp-plugins.lock.json.llm-role-tmp`. `writeConfigAtomic` now
  `mkdir -p`s the target's directory, which also covers the project `config.yml`
  and the project agents dir.
- **Explorer dataset now carries role-weighted benchmarks** — the explorer
  loaded its ranking data with `loadRankData({})`, which fetches declared
  benchmark sources only. A role weighting a generic llm-stats benchmark
  (`bench:<id>`, e.g. `bench:alignbench`) therefore ranked on a dataset missing
  that metric, so the explorer disagreed with the updater (and `/refresh-roles`)
  for that role. The explorer now loads with the resolved roles plus the shipped
  keys (`loadRankData({ roles, extraMetrics: Object.keys(KNOWN_METRICS) })`), so
  its dataset is a superset of any def the UI can rank; `extraMetrics` also
  forces the `website`/`writing` fetches even when no role weights them.
- **Generic llm-stats benchmarks: dotted ids and the 20-entry cap** — a dotted
  catalog id (`deepswe-1.1`) normalizes to the metric key `bench:deepswe-1_1`,
  which the updater's metric-key fallback could not turn back into the raw
  (200-returning) fetch URL, so the metric was dead weight; the new
  `catalogBenchmarkDeclaration` builds a declaration carrying the raw id in
  `fetch.url`, persisted at discovery/authoring time. The per-benchmark
  endpoint's hard 20-entry cap (`BENCHMARK_ENTRY_CAP`) is now surfaced as
  `loaded` vs `total_models` (`BenchmarkPayload = { scores, loaded, total }`,
  `annotateCappedLoad`), and `loadBenchmarkScores` returns the loadable count so
  the post-fetch coverage annotation uses it instead of the catalog's
  `model_count`. No pagination — the API caps at 20. (issue #25)

## [1.0.0] - 2026-10-01

First release. The plugin ranks today's LLM leaderboard into best-fit picks for
each omp model role and applies them to `~/.omp/agent/config.yml` daily.
Published to git + marketplace on 2026-10-01 and to npm on 2026-10-03 (all three
install routes verified end-to-end).

### Added

- Ranking engine (`src/engine.ts`) shared by the CLI report and the plugin:
  llm-stats + OpenRouter ingestion, cardinal transforms, value scoring
  (`q − λ·$/M`), the Pareto frontier, and hysteresis.
- omp plugin (`src/extension.ts`): a day-gated `session_start` refresh plus the
  `/refresh-roles`, `/explore-roles` and `/create-agent` commands.
- Surgical `config.yml` patch for `modelRoles` + `retry.fallbackChains`, with
  atomic write and stale-chain pruning.
- OpenRouter key tier gate and catalog filter; variant resolution
  (exact → dated → bare → `-latest`).
- Interactive explorer (`/explore-roles`, `node explore.ts`): per-role ranking
  tables, per-model decomposition, weight/required/thinking tuning, Export.
- `create-role.ts` / `create-agent.ts` and the shipped
  `omp-llm-role-create-agent` skill: add a role, or an agent + role + wiring.
- Shipped `designer` role and agent (opt-in), the Design Arena `website`
  metric, and the writing leaderboard `writing` metric.
- npm / git / marketplace install routes and the self-hosted
  `.omp-plugin/marketplace.json` catalog.
- **Benchmark discovery in `/create-agent`** — when you give a purpose, the
  command now finds the llm-stats catalog benchmarks relevant to it and ranks
  the new role on them, instead of only the benchmarks you name. The relevance
  decision is a typed judgment through omp's configured `judge` role (TypeSafe
  jev or its fallback chain): the catalog is filtered by coverage, ranked by
  lexical overlap with the purpose, and the judge picks the direct measures. A
  discovered benchmark that maps to a shipped metric uses it (`WritingBench` →
  `writing`); any other becomes a generic `bench:<id>` metric. Discovery is
  non-fatal (a catalog or judge failure just skips it) and skippable with
  `--no-discover`; an explicit `--benchmarks` list wins over it (issue #10).
- **Benchmark links in `/create-agent`** — the command now resolves a benchmark
  link to a metric and ranks the new role on it. A link to any llm-stats
  benchmark page (`llm-stats.com/benchmarks/<id>`) resolves to that benchmark; a
  link to the writing leaderboard resolves to the existing `writing` metric; a
  link to a provider the plugin has never seen is authored into a declarative
  source spec (fetch → in-process architect → dry-run coverage/leader → confirm
  → save), so nothing is added to your config without your say-so. A named
  benchmark takes a decisive share of the weights (the focus-share fit) instead
  of being diluted, and the generated agent body names the benchmark its model
  was chosen on. New `--yes` flag accepts a proposed source without prompting.
- **Benchmark-source registry** (`src/benchmark-sources.ts`) — the single source
  of truth for which benchmark sources exist, what metric each feeds, and how to
  fetch/parse/join each. External metrics are namespaced `<namespace>:<local>`
  (dot-free, so they never mis-nest in the flat dotted settings path), fetched
  through the same daily cache chain as every other source, and rendered in the
  explorer and the report without a second hand-maintained table. A user-level
  `benchmark-sources.json` declares a provider as data, not code.
- **`/create-agent` free-text form** — the command now accepts a plain-language
  request (`/create-agent i want an agent for writing. use the writing related
  Benchmarks in the Leaderboard <url>`) as well as the flag form. The architect's
  identifier becomes the agent/role name, and any benchmark the request names
  (whole-word, `_`/`-`/space interchangeable) is folded into the weights.
  Trailing flags still apply, so `/create-agent <request> --dry-run` previews.
- **Role universe in the explorer** — the explorer now lists every role the
  plugin knows (built-in + shipped + user-defined), not just the ranked ones,
  and each role has an enable/disable toggle that writes `roles.<name>.enabled`
  through the validated role write path (issues #1–#2).
- **Locked roles** — a role can be locked so the updater ranks it but never
  rewrites its selector or fallback chain; the lock lives in the plugin
  settings and is honoured by the hysteresis step (issue #3).
- **Pin-derived `task.disabledAgents`** — the plugin derives the disabled-agent
  set from the agents' `model:` pins: an agent whose pinned role is disabled is
  added to `task.disabledAgents`, and removed when the role is enabled. The
  shipped `designer` agent is therefore opt-in (issue #4).
- **`/settings` schema + flat dotted keys** — `package.json` → `omp.settings`
  exposes the plugin's settings to omp's `/settings` → Plugins tab, and the
  plugin's write path emits flat dotted keys so the UI shows real values
  (issue #5).
- **`/remove-agent`** — the inverse of `/create-agent`: deletes an agent `.md`
  and its model role in one command. It removes the role's lock-file keys
  (backup + atomic write), deletes the agent file from the user and/or project
  scope, then runs the updater in-process so `modelRoles.<name>` and the
  plugin-managed `task.disabledAgents` entry are dropped. Shipped default roles
  are refused (use the explorer's "Reset to shipped default"). The plugin now
  tracks the `task.disabledAgents` names it added (`managedDisabledAgents` in
  state) so a removed agent leaves no stale entry.

### Changed

- **Cleaner role descriptions + cost-aware fallback chains** — `/create-agent`
  now writes the architect's `whenToUse` as the role's `description` (the
  one-line purpose when no architect ran), so the explorer and the report show a
  clean label instead of the raw prompt; benchmark links are stripped from the
  purpose before the archetype fit, so a pasted URL path cannot bias the
  archetype. The fallback chain now prefers candidates priced at or below the
  chosen model (filling any remaining depth with the next-best by value), so an
  availability fallback no longer raises the bill (issue #9).
- **Repository is public, all install routes live.** `Gott50/omp-llm-role` was
  flipped from private to public (2026-10-02), so the git
  (`omp plugin install github:Gott50/omp-llm-role`) and marketplace
  (`omp plugin marketplace add Gott50/omp-llm-role` +
  `omp plugin install omp-llm-role@gott50-plugins`) install routes work against
  the real URLs, and `omp-llm-role` was published to npm (2026-10-03) so
  `omp plugin install omp-llm-role` works too. All three were verified
  end-to-end against the real URLs (omp 18.4.12, throwaway HOMEs).
- The normative spec moved to `docs/dev/spec.md`; maintainer docs split into
  `docs/dev/` and the README is now user-only (issue #6).
- **Project root cleanup.** The generated report moved to
  `docs/llm-role-rankings.md` (linked from the README as a worked example); the
  two CLI entry points moved to `src/cli/` (`llm-role-rank.ts`,
  `create-role.ts`); the daily caches moved into the gitignored `cache/` dir.

### Removed

- The `update-roles.ts`, `explore.ts` and `create-agent.ts` CLI shims — they
  duplicated the `/refresh-roles`, `/explore-roles` and `/create-agent`
  commands. Use the commands instead.

### Fixed

- **Explorer reload after Export** — the explorer served the role universe it
  read at boot, so enabling a role (e.g. `designer`) and reloading the page
  showed it disabled again until the server restarted. Every request now
  re-reads the lock file (`getState()`), so a reload reflects the Export.

[Unreleased]: https://github.com/Gott50/omp-llm-role/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Gott50/omp-llm-role/releases/tag/v1.0.0
