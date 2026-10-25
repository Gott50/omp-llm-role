# Explorer

Maintainer view of the interactive ranking UI. The user-facing description
(what the panels do, how to launch it) is in
[`../../README.md`](../../README.md); this file is the internals: the HTTP
surface, the explanation layer, the shared boot path, the settings editor and
the decision preview, the export write, and the SPA's data flow. All ranking
math is the engine's (`src/engine.ts`) — the explorer never reimplements
`value = q − λ·$/M` — and the preview reuses the updater's own decision core
(`src/selection.ts`), so the decision it shows is the decision the run makes.

## Module map

| File | Role |
|---|---|
| `src/explorer/server.ts` | Zero-dependency `node:http` surface: static SPA + JSON API. Exports `createExplorerServer`, `ExplorerOpts`. |
| `src/explorer/explain.ts` | Pure explanation layer (no I/O): rank rows with baseline deltas, per-model decomposition, inverse-cardinal targets, the keyed-catalog availability overlay, and the display-only per-task price. Exports `rankRows`, `explainModel`, `perTaskPrice`, `inverseCardinal`, `METRIC_META`, `WEIGHTABLE_METRICS`. |
| `src/explorer/levers.ts` | Pure price-lever readouts (no I/O): the leader-flip threshold and the thinking level's effect on the leader, computed on the pool they are handed. Exports `leaderFlip`, `thinkingLevelEffect`, `LeaderFlip`, `ThinkingLevelRow`. |
| `src/explorer/pool.ts` | The as-written pool (no I/O): the dataset filtered exactly as the updater filters it before ranking (catalog/tier gate + allowed-providers prune + keyed-catalog prune). Exports `asWrittenPool`, `PoolMode`, `PoolInputs`. |
| `src/explorer/scopes.ts` | Scope resolution (no HTTP): the user-level scope, the registry's projects, and the session's project; the per-scope read; the dataset union; the scope's `config.yml` read. Exports `Scope`, `ScopeSelection`, `ScopeGlobalSettings`, `resolveScopes`, `defaultScopeId`, `resolveScope`, `readScopeRoles`, `scopeDir`, `readScopeConfig`, `unionRoles`. |
| `src/explorer/boot.ts` | Shared launcher: bind/port fallback, scope resolution, browser open, close. Exports `startExplorer`, `EXPLORER_DEFAULT_PORT`, `ExplorerHandle`, `ExplorerBootOpts`. |
| `src/project-registry.ts` | The global project registry (`llm-role-projects.json` in the agent dir): read/register/prune, atomic write. Exports `PROJECT_REGISTRY_FILE`, `readProjectRegistry`, `registerProject`. |
| `src/selection.ts` | The pure decision core the preview shares with the updater (spec #109): the six-arm hysteresis ladder, the chain builder, the `task.disabledAgents` sync, and `previewSelection`. Exports `decide`, `buildChains`, `agentDisablePatch`, `cheaperInsideMargin`, `previewSelection`, and the `Decision`/`DecisionReason`/`Candidate`/`ChainPlan`/`SelectionPreview` types. |
| `src/role-settings.ts` | The one validated settings write path (validate → merge → backup → atomic write). Exports `validateRole`, `mergeSettings`, `mergeExport`, `writeRoleSettings`, `mergeRemove`, `removeRoleSettings`, `GLOBAL_SETTING_KEYS`, `timestamp`. |
| `web/app.js` | The SPA: renders and edits role defs, switches scopes, calls the API. No framework, no build step, no external requests. |
| `src/extension.ts` | `/explore-roles`: in-process `startExplorer` (catalog from the live model registry), closed on `session_shutdown`. |

## HTTP surface (`src/explorer/server.ts`)

`createExplorerServer(opts: ExplorerOpts): Server`. Bound to loopback by the
caller; no auth. Every handler is wrapped so a throw becomes a 500 JSON error
(`HttpError` carries a status; `res.headersSent` short-circuits).

`ExplorerOpts` is the DI seam:

```ts
type ExplorerOpts = {
  webDir: string;
  // All known scopes, re-resolved per call so a project registered by another
  // session appears without a restart.
  listScopes(): Scope[];
  // The scope a request should use: the requested id when known and present,
  // else the default (session project when present, else user-level).
  resolveScope(requestedId: string | null): Scope;
  // Fresh per call: rank (swapped by refresh) plus the scope's roles/universe
  // re-read from its lock file, so a page reload after Export reflects the write.
  getState(scope: Scope): {
    rank: RankData;
    roles: Record<string, RoleDef>;
    universe: Record<string, UniverseEntry>;  // every known role, disabled included
    defaults: Record<string, RoleDef>;
    availability: KeyAvailability;            // keyed-catalog overlay (re-derived on refresh)
    selection: ScopeSelection;                // the scope's global selection rule (mode + qualityFloor)
    settings: ScopeGlobalSettings;            // the scope's global settings (authored / resolved / defaults)
    raw: Record<string, unknown>;             // the scope's merged raw settings map (the preview's base)
  };
  // The preview's scope-side inputs, re-read per call: the scope's config.yml
  // current selectors (the hysteresis incumbent), the plugin state the preview
  // reads (managed roles, plugin-written chain keys, managed disabled agents),
  // and the discovered agent pins (a filesystem scan the caller harvests, so the
  // preview stays pure and the agreement test sees the same pins as the run).
  getPreviewInputs(scope: Scope): {
    currentSelectors: Record<string, string>;
    pluginState: { managedRoles: string[]; pluginWrittenChainKeys: string[]; managedDisabledAgents: string[] };
    agentPins: AgentPin[];
  };
  refresh(): Promise<void>;                   // re-runs loadRankData({ refresh: true, roles, extraMetrics }) and swaps rank
  // The as-written pool's inputs: the omp catalog, the key's tier, the account's
  // allowed-providers whitelist (null = no whitelist / harvest failed, which
  // leaves every route in place), and the keyed-catalog availability (the
  // blocked set the keyed prune reads). Re-derived per call, so a project's
  // whitelist cannot leak into another scope's view.
  getPoolInputs(): PoolInputs;
  // The recorded usage rows the per-task price resolves its token profile from,
  // for the request's active scope (a project scope reads its own `<root>/.omp`
  // ledger). Optional: a host without a ledger supplies none.
  getUsageRows?(scope: Scope): readonly UsageRow[];
  // The user-set token profile the per-task column falls back to (the
  // `tokenProfile` setting); null (the default) = unset.
  tokenProfile?: TokenProfile | null;
};
```

The server holds the active scope id **and the pool mode** as mutable state
(alongside the mutable `rank`/`availability`); `activeScope` resolves the scope
per request, persisting the fallback when the active scope became unavailable.
`poolRank` applies the session's pool mode to the dataset before ranking — the
`as-written` mode runs `asWrittenPool(rank, opts.getPoolInputs())`, the `raw`
mode (the default, the historical behaviour) passes the fetch through. The pool
mode is **never** applied to the export path, which validates a pin against the
raw dataset.

Endpoints:

| Method + path | Body | Response |
|---|---|---|
| `GET /` | — | `web/index.html` |
| `GET /app.js`, `/style.css` | — | static asset (traversal-guarded) |
| `GET /api/bootstrap` | — | `bootstrapPayload(opts, activeScope)` |
| `POST /api/scope` | `{scope}` | switch the active scope, then the bootstrap payload (404 unknown id, 409 non-present) |
| `POST /api/pool` | `{mode}` | switch the ranked pool (`"raw"` \| `"as-written"`), then the bootstrap payload (400 on any other mode) |
| `POST /api/rank` | `{role, def, settings?}` | `{eligible, lambda, derivedLambda, selection, rows, errors}` — each row carries the display-only `perTask` and the `excludedByBar` flag |
| `POST /api/explain` | `{role, def, modelId, settings?}` | `explainModel(...)` spread + `leaderFlip` + `thinkingLevels` + `errors` |
| `POST /api/preview` | `{settings?, roles}` | `{preview, errors}` — the `SelectionPreview` the updater would write (read-only, probe-optimistic) |
| `POST /api/export` | `{roles, settings?}` | `{ok:true, backupPath, roles, lockPath}` or `{ok:false, errors}` |
| `POST /api/refresh` | — | `await opts.refresh()` (re-ranks and re-derives the availability overlay) then the bootstrap payload |

- `settings` on `/api/rank`, `/api/explain`, `/api/preview` and `/api/export` is
  the **edited global settings as a flat dotted-key record** (the lock-file
  convention), carrying only the keys the user has authored. Absent = the
  scope's committed values (the pre-#109 behaviour). When it is present, the
  preview/export handler rebuilds the raw map as the scope's `raw` with every
  `GLOBAL_SETTING_KEYS` entry (and its nested parents — `tokenProfile`,
  `features`) deleted and the edited keys assigned (and the flat `roles.*` keys
  dropped, so a cleared pin cannot survive), then calls
  `resolveSettings({ ...raw, roles: editedRoles })` — the same
  `applyGlobalSettings` delete-then-write Export performs, so the preview cannot
  resolve a global Export would not write. `/api/rank` and
  `/api/explain` derive the global `features.<id>` flags from `settings` when
  present (`settings[`features.${id}`] === true` for each `FEATURES` row), else
  from `state.features` — so an edited-but-unexported flag re-ranks the table.

- `bootstrapPayload` ships `roles` (resolved), `defaults` (`DEFAULT_ROLES`),
  `universe` (kind/enabled/locked + effective def per known role), `metrics`
  (`weightableMetrics`: the shipped keys plus any external metric a resolved role
  weights), `metricMeta` (`metricMetaFor`: `METRIC_META` plus a derived entry per
  external metric), `focusAssessments` (per role, the nine-axis assessment of its
  focus metrics over the resolved dataset), `levels` (`Object.keys(SUFFIX_LEVELS)`), `thinkingFactors`
  (per-level billed-blend multiplier from the engine's own `thinkingPriceFactor`,
  so the UI readout cannot drift), `fetchedAt`, `modelCount`, `orMatched`,
  `orPriced`, `poolMode` (the ranked pool the counts describe — `"raw"` or
  `"as-written"`), `selection` (the scope's global selection rule —
  `{mode, qualityFloor}`; a role's own `selection`/`qualityFloor` overrides it),
  `tokenProfile` (the user-set per-task token profile, or
  `null`), `settings` (the scope's global settings in the three shapes the
  Settings panel needs — `authored` (the raw lock-file keys), `resolved` (the
  effective values) and `defaults` (the shipped defaults to reset to)),
  `lockPath` (the **active scope's** lock file), `scopes` (id, label,
  kind, present per known scope), `activeScope` (the active scope id),
  the active scope's global capability flags and the feature registry (the
  `FEATURES` rows: id, label, description, recommended bundle, buys), so the SPA
  can expand a posted def the same way the server does, and
  `availability` (the keyed-catalog summary:
  `{active, reason, publicCount, keyedCount, blockedCount, fetchedAt}`). Every
  request calls `getState(scope)`, which re-reads that scope's lock file — so a
  page reload after Export shows the new roles, not the boot-time snapshot.
- `handleScope` validates the requested id against `listScopes()`: an unknown id
  is a 404, a known-but-not-present one a 409; a valid switch sets the active
  scope and returns the new payload.
- `handleRank` baselines against `state.roles[role] ?? state.universe[role]?.def ??
  state.defaults[role]`: an enabled role against its resolved def, a disabled or
  lock-file-only role against its effective def, so selecting it still shows
  deltas rather than an empty baseline. It passes `state.availability` to
  `rankRows`, so every row carries its `key` badge (usable/blocked/unknown) with
  no extra call. **`handleRank`/`handleExplain` expand the posted def** with the
  active scope's global flags (`expandFeatures(def, …)`) *before*
  `rankRows`/`explainModel`: the handlers rank the client's def verbatim, while
  the Δ baseline is the resolved def (`state.roles[role]`), so without the
  expansion the preview would omit the preset the baseline includes and every
  row's Δ would be a lie. The posted def is the **authored** def (flags + explicit
  keys); the expansion is applied only for the ranking call, never persisted.
- The **selection surface** (spec #103): `POST /api/rank` returns
  `selection: {mode, pick, anchor, anchorQ, floor, bar}` — the **effective** rule
  (the posted def's own `selection`/`qualityFloor` wins over the scope's
  **committed** global), the prospective pick's model id, the anchor and its `q`
  (the highest-`q` model in either mode — the bar's anchor in `"cheapest"` mode,
  the max-`q` model in `"value"` mode, where the pick is the value leader), the
  floor value, and the threshold `q` (`bar` is `null` in `"value"` mode, which
  has no bar). Each row carries `excludedByBar` (its `q` is under the bar; always
  `false` in `"value"` mode). The bar is computed with the engine's own
  `barSelection` over the same ranking the rows show, so the panel and the
  updater cannot drift.
  **Deliberately narrow (spec #109):** the edited `settings` record re-ranks the
  table's `features.<id>` expansion only — it does not move this block. So
  editing the *global* `selection`/`qualityFloor` in the Settings panel moves the
  **preview's** bar and pick but not the table's; the table shows the ranking on
  the pool the toggle selects, the preview shows the decision on the updater's
  candidate set, and the two answer different questions (the spec's Further
  Notes). A role's own `selection`/`qualityFloor` moves the table's block.
- `handleExport` validates every dirty role first — `validateRole` plus a
  **provider-pin check**: a `providerPin` that matches no route in the loaded
  dataset is rejected (`role "<name>": provider pin "<slug>" matches no route in
  the loaded dataset`) before any write, so an exported role cannot carry an
  unroutable pin. It then calls `writeRoleSettings(activeScope.lockPath,
  body.roles, body.settings === undefined ? undefined : { settings: body.settings })`
  — both halves in one validated, backed-up, atomic write; an absent `settings`
  leaves the global half of the lock file untouched (the pre-#109 behaviour) —
  and returns its result verbatim plus the written `lockPath`.
- `handlePreview` (spec #109) resolves the edited settings and defs into a raw
  map (`previewRaw`), calls `previewSelection` with the scope's own inputs
  (`getPreviewInputs`), and returns `{preview, errors}`. Its dataset is the
  updater's own pre-walk set **regardless of the table's pool toggle**: the raw
  fetch with the allowed-providers prune (`previewRank`), never `poolRank` (which
  respects the toggle) and never `asWrittenPool` (which would pre-apply the keyed
  prune the candidate set must apply itself, so `keyBlockedCount` and the "no
  usable candidate" skip stay meaningful). The catalog/tier gate is applied
  inside `previewSelection` via `eligible`. The handler is **read-only**: it
  never writes `config.yml` and never writes the lock file.
- Unknown `/api/*` → 404; wrong method → 405; non-API non-GET → 405.
- `readBody` caps at `MAX_BODY = 1 MiB` (413); `readJson` → 400 on invalid JSON.
- `serveStatic` resolves against `webDir` and rejects traversal (`full` must be
  `root` or start with `root + sep`), 404 on a missing file, MIME by extension.

## Explanation layer (`src/explorer/explain.ts`)

Pure, no I/O; all ranking math is delegated to `src/engine.ts`.

- **`METRIC_META`** — one entry per `KNOWN_METRICS` key: `{label, kind, unit,
  formula, anchors}`, `kind ∈ index | benchmark | throughput | price |
  percentile`. The UI's picklists and formula legends are built from it, so they
  cannot drift from the engine.
- **`metricMeta(metric, declared?)`** — the shipped entry, or a derived entry for
  an external metric (label from the registry's source, `kind: "percentile"`,
  identity formula, the source's fill in the anchors). **`metricMetaFor(metrics,
  declared?)`** merges the shipped table with a derived entry per external metric.
- **`weightableMetrics(extra?)`** — the shipped keys plus any external metric in
  `extra`; exactly what the validator accepts.
- **`rankRows(def, models, baseline, availability?, profile?, bar?)`** — `rankRole(def, models)` +
  `paretoFrontier`, annotating each row with `baselineRank`/`delta`
  (`baselineRank − rank`; positive = moved up) against the effective role's
  ranking. Rows carry `priceEff` (the thinking-adjusted price the ranking
  penalized), `parts`, `missing` (weighted non-price metrics whose raw value is
  null), `frontier`, `key` — the availability overlay verdict
  (`usable`/`blocked`/`unknown`), orthogonal to `missing` and to the eligibility
  gates — `perTask` (the display-only dollars-per-task, or `null`), and
  `excludedByBar` (the `cheapest` selection's bar excludes the row; always
  `false` in `value` mode, which has no bar). `availability`, `profile` and `bar`
  are optional and pure (no I/O); omitted or inactive ⇒ every row reads
  `unknown` / `perTask: null` / `excludedByBar: false`. None affects the ranking
  order or the deltas.
- **`inverseCardinal(metric, t)`** — inverse of `cardinalMetric` for the "what
  would it take" targets: `index` → `t*80 − 20`; `throughput` → `10 * 30**t`
  (null outside `[0,1]`, because the forward transform clamps); everything else
  (benchmark, percentile, price) → identity. See *Open defect* below for the
  `gpqa` exception.
- **`perTaskPrice(model, def, profile)`** — the display-only dollars-per-task:
  `p_in` is the role's priced route's input price (cache-adjusted by the role's
  `cacheHitRate`, `routeInputPrice`) and `p_out` that same route's output price —
  the inverse 3:1 blend of it (`routeOutputPrice`), never re-derived here — and
  the output term is scaled by the role's thinking factor
  (`thinkingAdjustedPrice(model, def, 1)`, so the per-task price and the row's
  `priceEff` cannot disagree). When the role prices on the `1/price²` blend
  (`roleRoute` returns `null`) the model's billed blend and the input blend over
  the routes that survive the role's endpoint filters stand in — the same pool the
  ranking prices on, so `p_in` and the billed blend never mix two route pools.
  `null` when there is no usable route price — **absent, never a silent
  zero**. The SPA renders `—` in both cases: no token profile resolves (no
  recorded usage and no `tokenProfile` set), **or** the model has no usable
  route price (e.g. every route pruned by the as-written whitelist — the model
  still ranks on its blend price, but the per-task column has no route to
  price). It never feeds the ranking's sort key, `value`, or the explanation's
  `cost` block.
- **`explainModel(def, models, modelId, roleName, availability?, profile?)`** — the full
  decomposition, or the eligibility gates it failed (same gates `rankRole`
  applies, same order: missing required, image filter, no billed price). On
  success: `contributions`
  (raw → cardinal `t` → renormalized weight → contribution → share of `q`, with
  a `fillNote` when the value is a capability fill), `cost` (`priceEff`, the
  cache-adjusted billed price, λ, penalty, `q`, `value`), `role.cacheHitRate`,
  `perTask` (the `PerTaskPrice` breakdown, or `null` when no profile was
  supplied or the model has no usable route price), `gapAbove`/`gapToTop`/`above`, `closing` (the
  per-metric raw target that would close the gap, via `inverseCardinal`, with
  unreachable/extrapolated notes), `dominators` (models both cheaper and at
  least as good on `q`, top 3), `ownProvider` (true when the model was priced on
  the soft best route rather than the blend), `autoPin` (the **candidate** route's
  provider slug — `bestRoute(model, def)?.providerSlug`, the max-`vfm`
  route (scoring.md, *Route ordering*), when the role sets
  `preferOwnProvider` and carries no manual `providerPin`, else `null` — the
  first route the updater's daily walk tries, **not** a promise of the written
  pin: the updater probes it and skips to the next route when OpenRouter does not
  serve it, or drops the pin entirely when none is routable; writes-and-state.md,
  *The provider-pin auto-configuration*), and the
  availability overlay `key`/`keyReason`
  (the same verdict as `rankRows`, plus the reason it reads that way). It mirrors
  `rankRole`'s capability fill so the contributions sum exactly to `q`.
- **`leaderFlip(def, models)`** / **`thinkingLevelEffect(def, models)`**
  (`src/explorer/levers.ts`) — the two price-lever readouts, computed on the pool
  they are handed (so the readout and the ranking above it agree). `leaderFlip`
  returns the price weight at which a cheaper challenger overtakes the value
  leader (`{ wPrice, flipW, distance, challenger }`), or `null` when no cheaper
  challenger exists. `thinkingLevelEffect` returns one `{ level, factor, leader }`
  row per thinking level, or `null` for a bare role. Both reuse the engine's own
  `roleLambda`/`rankRole`/`SUFFIX_LEVELS`/`thinkingPriceFactor`; the formulas are
  in [`scoring.md`](scoring.md).

## Shared boot path (`src/explorer/boot.ts`)

`startExplorer(opts: ExplorerBootOpts): Promise<ExplorerHandle>` — the one
launcher `/explore-roles` uses.

- `EXPLORER_DEFAULT_PORT = 5177`; `listen` binds the loopback address and resolves the
  actual port. A permanent `error` listener is attached before `listen`, so a
  post-listen socket error is logged instead of becoming an uncaughtException
  (which would tear down the whole omp session). `EADDRINUSE` → retry on port 0
  (OS-assigned).
- **Scopes** (`src/explorer/scopes.ts`). A scope is a role-config source: the
  user-level scope (`lockPath`, default `PLUGIN_SETTINGS_PATH`), or one project
  where `/project-roles` was used. `resolveScopes({ userLockPath, cwd, registryDir })`
  returns the user-level scope, the registry's projects (most recently used
  first), and the session's project when `cwd` has a project role config (a
  project lock with a non-empty `omp-llm-role` settings entry — the updater's own
  `resolveProjectDir` test) — included immediately, before the registry records
  it. A scope id is `user` or `project:<root>`; `present` is whether the lock
  file exists (the user scope is always available — Export creates it). The
  default active scope is the session's project when present, else user-level.
  `listScopes()` re-resolves on **every** request, so a project registered by
  another session appears without a restart.
- **Per-scope read.** `readScopeRoles(scope, userLockPath)` reads the user-level
  lock file for the user scope, and the project lock merged **over** the
  user-level lock for a project scope — the exact read the updater performs, so
  the explorer and the plugin agree. `resolveSettings` → `settings.roles` (the
  resolved set = what the plugin does today); `roleUniverse(raw, roles)` adds the
  roles it knows but does not rank (shipped opt-ins, lock-file-only roles). It
  also returns the scope's global settings in the three shapes the Settings panel
  needs (`settings.authored` = the raw lock-file keys, `settings.resolved` =
  `globalSettingsOf(settings)`, `settings.defaults` = the shipped defaults) and
  the merged `raw` map the preview rebuilds its edited map from.
  `getState(scope)` re-runs this read on **every** request, so a page reload
  after Export reflects the write instead of the state at boot.
- **Scope dir and config.** `scopeDir(scope, userAgentDir)` is the agent dir a
  scope's `config.yml`, state and history live in — the project's `<root>/.omp`,
  or the user-level agent dir (the same resolution `runUpdater` performs).
  `readScopeConfig(scope, userAgentDir)` reads that `config.yml`'s `modelRoles`
  (the hysteresis incumbent the preview needs); a missing or unparseable config
  yields an empty map, so every role reads `no-current` rather than the read
  throwing.
- **Dataset union.** The host loads the ranking data through `unionRoles(scopes,
  userLockPath)` — the union of every known scope's resolved roles — plus the
  shipped keys (`loadRankData({ roles, extraMetrics: Object.keys(KNOWN_METRICS) })`),
  so the dataset carries every metric any scope weights — including a generic
  llm-stats benchmark (`bench:<id>`) that only a project role pulls in. Loading
  with no roles (`loadRankData({})`) fetches declared sources only, so a role
  weighting an undeclared benchmark would rank on a dataset missing that metric
  and the explorer would disagree with the updater. `extraMetrics` also forces
  the `website`/`writing` fetches even when no role weights them. The union is
  what keeps a scope switch free (one fetch) and is asserted as a pure call over
  temp lock files, not through the injected `rank` fixture.
- `enrichThinkingLevels(rank.models, opts.catalog)` gates the thinking price
  factor on the omp catalog; `refresh()` re-runs `opts.reload(true)`,
  re-enriches, and — when `opts.reloadAvailability` is supplied — re-derives the
  availability overlay.
- **As-written pool inputs.** `ExplorerBootOpts` carries `tier` (default
  `"billed"`), `allowedProviders` (`null` = no pruning), and
  `reloadAllowedProviders` (re-derived on `refresh()`). `getPoolInputs()` returns
  `{ catalog: opts.catalog, tier, allowed }` per call, so a project's whitelist
  cannot leak into another scope's view. Both are **best-effort**: an absent tier
  reads as `billed`, and a failed re-harvest (`reloadAllowedProviders` throwing
  or returning `null`) degrades the as-written pool to no route pruning rather
  than failing the refresh. `/explore-roles` builds them in-process from the
  session's OpenRouter key (the canary must be a **catalog** slug, not a ranking
  id).
- **Usage ledger.** `getUsageRows(scope)` reads the active scope's ledger: a
  project scope reads its own `<root>/.omp` ledger, the user scope reads
  `usageDir` (default `agentDir()`), so a project's usage never mixes with the
  user-level profile. Re-read per call, so a turn recorded while the explorer is
  open shows up without a restart. `tokenProfile` is the user-set fallback the
  per-task column uses when a role has no recorded usage.
- `opts.availability` is the boot-time keyed-catalog overlay; `getState(scope)`
  returns it on every request, so `/api/rank` and `/api/explain` annotate rows
  without a second fetch. It is scope-independent and carried across switches
  unchanged. `/explore-roles` builds it in-process from the session's OpenRouter
  key (`ctx.modelRegistry.getApiKeyForProvider("openrouter")`) via
  `fetchKeyAvailability`; a missing key or a failed fetch is `unavailable`
  (best-effort — the explorer still boots).
- `unref` (extension only) detaches the server from the event loop so a
  short-lived `omp -p` run cannot hang.
- `open` launches the default browser on macOS (`execFile("open", [url])`).
- `close()` calls `closeAllConnections()` then `server.close()`.

## Export path (`src/role-settings.ts`)

The one validated settings write path, shared by the explorer's Export,
`src/cli/create-role.ts` and `/create-agent`.

- `validateRole(name, def)` → `resolveSettings({ roles: { [name]: def } }).errors`
  (`resolveSettings` clones its input, so it is safe per call).
- `GLOBAL_SETTING_KEYS` — every global (non-`roles.`) key of the plugin's
  settings schema, derived from `deriveSettingsSchema()`, so a new global setting
  is covered automatically. It is the delete-then-write key set for the global
  half of an Export.
- `mergeSettings(existing, { roles, settings })` → `{lock}` or `{error}`.
  Preserves `plugins`, the `config` escape hatch and every sibling settings key.
  Writes each dirty role as **flat dotted keys**
  (`roles.<name>.weights.<metric>`, `.description`, `.enabled`, `.locked`,
  `.required`, `.thinking`, `.providerPin`, `.cacheHitRate`, `.lambda`,
  `.filters.image`) because omp's
  `/settings` Plugins tab shallow-merges the settings object and does not
  flatten nested objects — a nested `roles` object would render as schema
  defaults. A pre-existing nested entry for a dirty role is deleted, so an older
  lock file normalizes on the next write. The `settings` half writes the global
  keys as flat dotted keys too (`switchMargin`, `priceSwitchFraction`,
  `writeFallbackChains`, `fallbackChainDepth`, `fallbackQualityFloor`,
  `selection`, `qualityFloor`, `activateDefaultOnEmptySession`,
  `errorReporting`, `tokenProfile.inputTokens`, `tokenProfile.outputTokens`,
  `features.<id>`) with the same "make this match" semantics: every
  `GLOBAL_SETTING_KEYS` entry — and the nested `tokenProfile` / `features`
  parents — is deleted first, then the edited keys are assigned, so a cleared
  setting falls back to the shipped default rather than leaving a stale value.
  An absent `settings` leaves the global half untouched (the pre-#109
  behaviour).
- `mergeExport(existing, dirty)` is a thin wrapper over
  `mergeSettings(existing, { roles: dirty })` (existing tests import it).
- `writeRoleSettings(lockPath, dirty, { dryRun, settings })` → `{ok, backupPath,
  roles}` or `{ok:false, errors}`. Validates first — with `opts.settings` present
  it runs `resolveSettings({ ...settings, roles: dirty }).errors`, so an
  out-of-range global setting aborts with the offending key and no write — reads
  the lock file (missing → `{}`; invalid JSON → refuse), merges, and — unless
  `dryRun` — writes a `.bak-<timestamp>` sibling (`timestamp()` = local
  `YYYYMMDD-HHMMSS`) then `writeConfigAtomic` with the pre-read mtime. A
  concurrent change returns `conflict` ("lock file changed since load — reload
  and retry").

## The Settings panel and the Preview panel (spec #109)

The explorer is a settings editor, not only a role editor, and it previews the
**decision** the updater would make, not only the ranking.

- **The Settings panel** renders one control per global setting (number /
  boolean / enum / the two `tokenProfile` fields) plus a toggle per capability
  flag, each with the effective value, the shipped default, a dirty marker and a
  reset. It is reachable with no role selected. `activateDefaultOnEmptySession`
  and `errorReporting` are labelled **no visual impact** — they change a session
  behaviour and a side channel, not the ranking or the preview. The panel renders
  the scope's **authored** values (the raw lock-file keys) and shows the
  **effective** ones; Export writes the authored values only, never the
  `expandFeatures` output.
- **The per-role editor** renders the five endpoint filters (`filters.tools`,
  `filters.minContextTokens`, `filters.minOutputTokens`,
  `filters.maxPriceUsdPerM`, `filters.preferredMinThroughput`) as first-class
  fields, and `bundleKnobs` **skips** the four keys a capability bundle also
  recommends, so one def key has exactly one input. `cacheHitRate` and
  `preferOwnProvider` stay bundle-only.
- **The Preview panel** lists every managed role's decision (from → to, reason,
  value / bestValue), its chain, the config side effects (`roleRemovals`, the
  `task.disabledAgents` adds/removes), the per-role `endpointBlocked` /
  `pinBlocked` / `keyBlockedCount` counts, and the `skipped` roles with their
  reasons. It is labelled **probe-optimistic**.
- **The preview's candidate set** is the updater's pre-walk set:
  `computeRankings(rank.models, { [role]: def })[role]` → `resolveVariant(...)`
  (the catalog/tier gate), on a dataset whose `m.routes` already carry the
  allowed-providers prune, **minus** the key-blocked
  (`availability.active && availability.blocked.has(ranked.model.id)`). The
  preview's dataset (`previewRank`) pre-applies only the allowed-providers
  prune, so the keyed prune inside `previewSelection` drops a candidate the
  dataset keeps — the pick can differ from the dataset's leader and
  `keyBlockedCount` stays meaningful (the issue #104 case).
- **The probe-optimistic boundary.** `previewSelection` never issues a request:
  every candidate in the pre-walk set is treated as clean, so the walk's window
  is the prefix of the walk order its stop condition admits (`probeWindow` — the
  incumbent first, then rank order, stopping at `1 + fallbackChainDepth` clean
  candidates and capped at `PROBE_BUDGET`), no candidate is ever probe-blocked,
  and the auto-pin takes the route leader. The written pin can therefore differ
  (a later route, or none) and a probe-blocked candidate can leave the pool —
  both are labelled, not simulated. The agreement test
  (`tests/selection-preview.test.ts`) pins the probe-clean case against a real
  dry run.
- **`skipped` reasons** (one entry per role the preview could not decide): a
  locked role; a role whose `providerPin` matches no route; a role with no
  eligible candidate; a role with no usable (non-key-blocked) candidate.
- **Read-only.** The preview never writes `config.yml` and never writes the lock
  file; the updater still owns `config.yml`, and Export writes the lock file
  only.

## SPA data flow (`web/app.js`)

No framework, no build step, no external requests. All ranking math is
server-side; the client only renders and edits role defs. Model names come from
a scraped third-party site, so the DOM is built with
`textContent`/`createElement` only (the `el()` helper).

- **Boot**: `boot()` → `GET /api/bootstrap` → `applyBootstrap(data)`, which fills
  `state` (`scopes`, `activeScope`, `poolMode`, `tokenProfile`, `universe`,
  `effective` = each entry's `def`,
  `defs` = a structuredClone of it, `defaults`, `metrics`, `metricMeta`,
  `focusAssessments`, `levels`, `thinkingFactors`, `lockPath`, `availability`,
  and the settings triple `settingsAuthored` / `settingsResolved` /
  `settingsDefaults` plus the working copy `settingsEdited`),
  renders the header/roles/table, and selects the previously selected role when
  the new scope has it, else the first role. `boot()` then wires the
  filter/topn/hide-key-blocked/export/copy/download controls.
- **Pool toggle**: the header renders a `#pool` `<select>` (`raw` / `as-written`)
  from `state.poolMode`. Changing it confirms first when there are unsaved edits
  (mirroring the scope switcher), then `POST /api/pool {mode}` and
  `applyBootstrap` on the returned payload — so the header's model count, the
  table, the focus assessments and the two readouts all describe the pool the
  user is now looking at. The toggle is **session-level** state — the server
  holds one pool mode, kept across scope switches (not persisted) — while the
  pool *inputs* are re-derived per call, so a project's whitelist never leaks
  into another scope's view. Export is unaffected: it always
  writes the authored def, never the pool.
  The **as-written** pool applies the same three filters the updater applies
  before ranking — the catalog/tier gate, the allowed-providers prune, and the
  **keyed-catalog prune** (spec #103) — so its leader is the model the updater
  would pick. Key-blocked rows are **pruned, not kept-and-marked**: in
  as-written mode the `key` column therefore reads `usable` (or `unknown`) for
  every row, and the key diagnostic ("`gemini-4-argon` is #1 but your key cannot
  run it") moves to **raw** mode, which keeps every row and its verdict. The
  `#pool` tooltip says the same: `as-written` is the pool the updater ranks on
  (key-blocked models dropped — switch to `raw` to see them and their verdicts),
  and it is **not** the written selector (hysteresis can keep a different model;
  Export always writes the authored role).
- **Settings panel**: `renderSettings()` renders one row per key of
  `state.settingsDefaults` (excluding `features`) — `tokenProfile` as two number
  fields, `selection` and `errorReporting` as enum pickers, the rest number or
  boolean by their default's type — plus one toggle per capability flag
  (`features.<id>`). Each row shows the effective value (authored, else the
  shipped default), the shipped default, an `authored`/`default` badge, a dirty
  marker and a reset; `activateDefaultOnEmptySession` and `errorReporting` carry
  a **no visual impact** note. `setGlobal(key, value)` deletes a key whose value
  equals the shipped default (or an empty field), so Export never accumulates a
  redundant key. The panel is reachable with no role selected and is rebuilt per
  scope on a scope switch. `settingsErrors()` mirrors the server's validation
  (the `GLOBAL_RANGES` bounds, and the `tokenProfile` pair — a lone half is an
  error) so the error shows as you type.
- **Endpoint filters**: the per-role editor renders the five endpoint filters
  (`ENDPOINT_FILTERS`) as first-class fields, and `bundleKnobs` skips the four
  keys a capability bundle also recommends (`BUNDLE_SKIPPED_KEYS`), so one def
  key has exactly one input; `cacheHitRate` and `preferOwnProvider` stay
  bundle-only.
- **Scope switcher**: the header renders a `#scope` `<select>` from
  `state.scopes` (the user-level scope plus every known project); a scope whose
  lock file is gone is `disabled` with a reason `title`. Changing the selection
  confirms first when there are unsaved edits (mirroring Refresh), then
  `POST /api/scope {scope}` and `applyBootstrap` on the returned payload — so
  every panel (universe, per-scope effective/edited defs, role tabs, editor,
  table, meta, lock path) reflects the new scope, and dirty tracking is per
  scope. The header names the active scope and its lock file path.
- **Focus table**: the editor renders a `table.focus` for the role's weighted
  benchmark/percentile metrics (`focusMetricsOf`), one row per metric with the
  nine signals from `focusAssessments[role]` (coverage, dispersion, composition,
  freshness, trust, modality, maintenance, provenance, cross-source). A below-bar cell is warned (tint + glyph), `unknown` is muted —
  never green. A metric the editor just added reads "not assessed" until the edit
  is **Exported and the page reloaded** (the payload is computed over the resolved
  definition, and the editor's in-memory edit is discarded by a plain reload).
- **Features panel**: the editor renders one **tri-state** control per capability
  (inherit / on / off) from the bootstrap payload's feature registry, showing the
  recommended bundle and the effective values. A value the preset filled (rather
  than an explicit key) is marked as **derived**, so authored and derived are
  distinguishable. Toggling a control edits the role's `features.<id>` (the
  tri-state's *inherit* leaves the key absent, so the global flag applies) and
  re-ranks; the individual
  per-knob fields the preset fills stay editable, and an explicit value wins over
  the flag. **Export writes the flag**, never the expanded knobs — `dirtyRoles()`
  is unchanged (it already compares the authored def against the authored
  baseline), so a role whose only change is a flag exports just
  `roles.<name>.features.<id>`.
- **Recompute**: `selectRole` → `renderRoles`/`renderEditor`/`renderExplain` +
  `recompute()`. `recompute()` → `POST /api/rank {role, def, settings:
  state.settingsEdited}` → `state.rows`, `lambda`, `derivedLambda`, `selection`,
  `errors`; re-renders the table and readouts, and reloads the explain panel if
  the selected model is still present. The table gains a **`$/task`** column
  (`r.perTask`, rendered `—` when `null`), beside the `$/M` column. Editor
  changes call `scheduleRecompute()` (120 ms debounce).
- **Preview panel** (spec #109): `runPreview()` → `POST /api/preview {settings:
  state.settingsEdited, roles: state.defs}` → `state.preview` +
  `state.previewErrors`; `renderPreview()` lists the decisions (from → to,
  reason, value / bestValue), the chain, the config side effects, the per-role
  `endpointBlocked` / `pinBlocked` / `keyBlockedCount` counts, and the `skipped`
  roles, under a **probe-optimistic** label. Any edit re-runs it through
  `schedulePreview()` (150 ms debounce, like `scheduleRecompute`), so the panel
  follows the edited settings and defs without applying them. The preview is
  read-only: it never writes `config.yml` or the lock file.
- **Selection readout** (spec #103): `recompute()` stores the rank payload's
  `selection` in `state.selection`; the table marks the **prospective pick** row
  (`pick`) and flags each row the bar excluded (`excludedByBar` → `excluded`). A
  readout beside the table draws the bar (the threshold `q` as a share of the
  anchor's `q`, with the floor named) and lists the excluded candidates with the
  weighted metrics their `q` is missing. The pick is the **prospective** pick — a
  pure function of the pool and the role def, never re-derived from the written
  selector: the plugin's hysteresis can still keep a different model, and Export
  always writes the authored role. Both the bar and the excluded list are absent
  in `"value"` mode, which has no bar.
- **Explain**: `selectModel(id)` → `POST /api/explain {role, def, modelId,
  settings: state.settingsEdited}` →
  `renderExplain()` (composition table, cost line, **per-task price** line, "why
  not higher", dominators, the **Price levers** section, and the availability
  line). The cost line appends `· best route`
  when the model was priced on the soft best route (`ownProvider`), and a
  **pin line** shows the pin in force: `pin: <slug> (manual)` when the edited def
  carries a `providerPin`, else `auto pin (candidate): <slug>` from the
  explanation's `autoPin` (read-only — the manual field is the only way to set
  one). The label says *candidate* on purpose: the value is the first route the
  updater's value-ordered walk *tries*, not a promise of the written pin — the
  updater probes that route and skips to the next when OpenRouter does not serve
  it, or drops the pin entirely (bare selector) when none is routable, so the
  written pin can be a later route or absent altogether (spec #90;
  writes-and-state.md, *The provider-pin auto-configuration*). The explorer is
  read-only and offline and cannot probe, so it names the candidate and says so
  in the tooltip. The candidate equals the written pin when every route probes
  clean; with the account's allowed-providers whitelist active, the panel and the
  written pin agree only on the **as-written** pool, which applies the same prune
  the updater applies before walking (in the raw pool the panel can name a route
  the prune removes). The
  per-task line shows the breakdown (`<in> in × $<p_in>/M + <out> out ×
  $<p_out>/M × <factor> = $<total>`), or `— (no token profile — record usage or
  set tokenProfile)` when `perTask` is `null`. The **Price levers** section
  renders the leader-flip line (`w* = <flipW> · now <wPrice> · distance
  <±distance> (<ratio>)`) and a per-level table of the thinking level's effect on
  the leader; each is omitted when the server sends `null` (no cheaper
  challenger, or a bare role).
- **Provider pin field**: the editor renders a text input for
  `roles.<role>.providerPin` (a tiered slug like `deepinfra/fp8` is kept
  verbatim; empty clears the key, resuming the automatic choice). It is the
  manual override of the auto-pin; Export rejects a slug that matches no route in
  the loaded dataset (see *Export path*).
- **Availability overlay**: each row's `key` renders as a three-state badge in
  the `key` column; the **hide key-blocked** checkbox beside the filter/top-n
  controls drops `blocked` rows from the table (a client-side filter — the
  ranking and Export are untouched); the header shows the allowlist size
  (`keyedCount`/`publicCount`). The explain panel repeats the verdict and its
  reason. When `availability.reason !== "active"` every badge reads `unknown`
  and the tooltip/hint names OpenRouter → Settings → **"Filter the model catalog
  for API keys"** — the explorer never guesses.
- **Dirty tracking**: `dirtyRoles()` compares `JSON.stringify(defs[role])` to
  `effective[role]`, and `settingsDirty()` compares `settingsEdited` to
  `settingsAuthored`; Export is enabled when either half is dirty and posts
  `{roles, settings}`. On success the client updates `effective` for the written
  roles, re-derives the committed globals (`resolvedFromFlat`), and the status
  names the written lock file. The state is rebuilt from the payload on a scope
  switch, so dirty tracking is per scope.
- **Deep-merge parking**: `dropWeight(metric)` parks an inherited metric (one
  the shipped default weights) at `EPSILON = 0.001` instead of deleting the key
  — the plugin deep-merges over `DEFAULT_ROLES`, so the default's weight would
  survive and break the sum. A user-added metric is deleted outright.
  `normalizeWeights` rescales (the ε too).
- **Tooltips**: one delegated `mouseover`/`mousemove`/`mouseout`/`scroll` pair
  drives a single floating `#tip` element for any `[data-tip]` node, so
  re-rendered tables and editors need no per-node wiring. Metric and role
  tooltips are built from the bootstrap payload (`METRIC_META` / role
  descriptions), not duplicated in the client.
- **Refresh**: `onRefresh()` confirms, then `POST /api/refresh` →
  `applyBootstrap` on the returned payload (the scope list is re-resolved, so a
  project registered by another session appears).

## Open defect

`inverseCardinal` returns identity for `kind: "benchmark"`, but `gpqa` is
chance-anchored forward — `cardinalMetric` uses `BENCHMARK_CHANCE = { gpqa: 0.25 }`
(`src/engine.ts`) and returns `(v − 0.25) / 0.75`. The explorer's "what would it
take to move up" target for `gpqa` is therefore wrong (t = 0.5 should map to raw
0.625, not 0.5). The other five raw benchmarks
(`aime`/`swe_bench`/`arc_agi`/`terminal_bench`/`tau_bench`) are 0-1, so identity
is correct for them. Fix: invert the 0.25 chance in `inverseCardinal` (export
`BENCHMARK_CHANCE` from `src/engine.ts`), or drop `gpqa` from `KNOWN_METRICS`.
