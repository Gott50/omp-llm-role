# Explorer

Maintainer view of the interactive ranking UI. The user-facing description
(what the panels do, how to launch it) is in
[`../../README.md`](../../README.md); this file is the internals: the HTTP
surface, the explanation layer, the shared boot path, the export write, and the
SPA's data flow. All ranking math is the engine's (`src/engine.ts`) — the
explorer never reimplements `value = q − λ·$/M`.

## Module map

| File | Role |
|---|---|
| `src/explorer/server.ts` | Zero-dependency `node:http` surface: static SPA + JSON API. Exports `createExplorerServer`, `ExplorerOpts`. |
| `src/explorer/explain.ts` | Pure explanation layer (no I/O): rank rows with baseline deltas, per-model decomposition, inverse-cardinal targets, and the keyed-catalog availability overlay. Exports `rankRows`, `explainModel`, `inverseCardinal`, `METRIC_META`, `WEIGHTABLE_METRICS`. |
| `src/explorer/scopes.ts` | Scope resolution (no HTTP): the user-level scope, the registry's projects, and the session's project; the per-scope read; the dataset union. Exports `Scope`, `resolveScopes`, `defaultScopeId`, `resolveScope`, `readScopeRoles`, `unionRoles`. |
| `src/explorer/boot.ts` | Shared launcher: bind/port fallback, scope resolution, browser open, close. Exports `startExplorer`, `EXPLORER_DEFAULT_PORT`, `ExplorerHandle`, `ExplorerBootOpts`. |
| `src/project-registry.ts` | The global project registry (`llm-role-projects.json` in the agent dir): read/register/prune, atomic write. Exports `PROJECT_REGISTRY_FILE`, `readProjectRegistry`, `registerProject`. |
| `src/role-settings.ts` | The one validated role write path (validate → merge → backup → atomic write). Exports `validateRole`, `mergeExport`, `writeRoleSettings`, `timestamp`. |
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
  };
  refresh(): Promise<void>;                   // re-runs loadRankData({ refresh: true, roles, extraMetrics }) and swaps rank
};
```

The server holds the active scope id as mutable state (alongside the mutable
`rank`/`availability`); `activeScope` resolves it per request, persisting the
fallback when the active scope became unavailable.

Endpoints:

| Method + path | Body | Response |
|---|---|---|
| `GET /` | — | `web/index.html` |
| `GET /app.js`, `/style.css` | — | static asset (traversal-guarded) |
| `GET /api/bootstrap` | — | `bootstrapPayload(opts, activeScope)` |
| `POST /api/scope` | `{scope}` | switch the active scope, then the bootstrap payload (404 unknown id, 409 non-present) |
| `POST /api/rank` | `{role, def}` | `{eligible, lambda, derivedLambda, rows, errors}` |
| `POST /api/explain` | `{role, def, modelId}` | `explainModel(...)` spread + `errors` |
| `POST /api/export` | `{roles}` | `{ok:true, backupPath, roles, lockPath}` or `{ok:false, errors}` |
| `POST /api/refresh` | — | `await opts.refresh()` (re-ranks and re-derives the availability overlay) then the bootstrap payload |

- `bootstrapPayload` ships `roles` (resolved), `defaults` (`DEFAULT_ROLES`),
  `universe` (kind/enabled/locked + effective def per known role), `metrics`
  (`weightableMetrics`: the shipped keys plus any external metric a resolved role
  weights), `metricMeta` (`metricMetaFor`: `METRIC_META` plus a derived entry per
  external metric), `focusAssessments` (per role, the five-axis assessment of its
  focus metrics over the resolved dataset), `levels` (`Object.keys(SUFFIX_LEVELS)`), `thinkingFactors`
  (per-level billed-blend multiplier from the engine's own `thinkingPriceFactor`,
  so the UI readout cannot drift), `fetchedAt`, `modelCount`, `orMatched`,
  `orPriced`, `lockPath` (the **active scope's** lock file), `scopes` (id, label,
  kind, present per known scope), `activeScope` (the active scope id), and
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
  no extra call.
- `handleExport` calls `writeRoleSettings(activeScope.lockPath, body.roles)` and
  returns its result verbatim plus the written `lockPath`.
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
- **`rankRows(def, models, baseline, availability?)`** — `rankRole(def, models)` +
  `paretoFrontier`, annotating each row with `baselineRank`/`delta`
  (`baselineRank − rank`; positive = moved up) against the effective role's
  ranking. Rows carry `priceEff` (the thinking-adjusted price the ranking
  penalized), `parts`, `missing` (weighted non-price metrics whose raw value is
  null), `frontier`, and `key` — the availability overlay verdict
  (`usable`/`blocked`/`unknown`), orthogonal to `missing` and to the eligibility
  gates. `availability` is optional and pure (no I/O); omitted or inactive ⇒
  every row reads `unknown`.
- **`inverseCardinal(metric, t)`** — inverse of `cardinalMetric` for the "what
  would it take" targets: `index` → `t*80 − 20`; `throughput` → `10 * 30**t`
  (null outside `[0,1]`, because the forward transform clamps); everything else
  (benchmark, percentile, price) → identity. See *Open defect* below for the
  `gpqa` exception.
- **`explainModel(def, models, modelId, roleName, availability?)`** — the full
  decomposition, or the eligibility gates it failed (same gates `rankRole`
  applies, same order: missing required, image filter, no billed price). On
  success: `contributions`
  (raw → cardinal `t` → renormalized weight → contribution → share of `q`, with
  a `fillNote` when the value is a capability fill), `cost` (`priceEff`, the
  cache-adjusted billed price, λ, penalty, `q`, `value`), `role.cacheHitRate`,
  `gapAbove`/`gapToTop`/`above`, `closing` (the
  per-metric raw target that would close the gap, via `inverseCardinal`, with
  unreachable/extrapolated notes), `dominators` (models both cheaper and at
  least as good on `q`, top 3), and the availability overlay `key`/`keyReason`
  (the same verdict as `rankRows`, plus the reason it reads that way). It mirrors
  `rankRole`'s capability fill so the contributions sum exactly to `q`.

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
  roles it knows but does not rank (shipped opt-ins, lock-file-only roles).
  `getState(scope)` re-runs this read on **every** request, so a page reload
  after Export reflects the write instead of the state at boot.
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

The one validated role write path, shared by the explorer's Export,
`src/cli/create-role.ts` and `/create-agent`.

- `validateRole(name, def)` → `resolveSettings({ roles: { [name]: def } }).errors`
  (`resolveSettings` clones its input, so it is safe per call).
- `mergeExport(existing, dirty)` → `{lock}` or `{error}`. Preserves `plugins` and
  every sibling settings key. Writes each dirty role as **flat dotted keys**
  (`roles.<name>.weights.<metric>`, `.description`, `.enabled`, `.locked`,
  `.required`, `.thinking`, `.providerPin`, `.cacheHitRate`, `.lambda`,
  `.filters.image`) because omp's
  `/settings` Plugins tab shallow-merges the settings object and does not
  flatten nested objects — a nested `roles` object would render as schema
  defaults. A pre-existing nested entry for a dirty role is deleted, so an older
  lock file normalizes on the next write.
- `writeRoleSettings(lockPath, dirty, { dryRun })` → `{ok, backupPath, roles}` or
  `{ok:false, errors}`. Validates every dirty role first (never writes on a
  validation error), reads the lock file (missing → `{}`; invalid JSON →
  refuse), merges, and — unless `dryRun` — writes a `.bak-<timestamp>` sibling
  (`timestamp()` = local `YYYYMMDD-HHMMSS`) then `writeConfigAtomic` with the
  pre-read mtime. A concurrent change returns `conflict` ("lock file changed
  since load — reload and retry").

## SPA data flow (`web/app.js`)

No framework, no build step, no external requests. All ranking math is
server-side; the client only renders and edits role defs. Model names come from
a scraped third-party site, so the DOM is built with
`textContent`/`createElement` only (the `el()` helper).

- **Boot**: `boot()` → `GET /api/bootstrap` → `applyBootstrap(data)`, which fills
  `state` (`scopes`, `activeScope`, `universe`, `effective` = each entry's `def`,
  `defs` = a structuredClone of it, `defaults`, `metrics`, `metricMeta`,
  `focusAssessments`, `levels`, `thinkingFactors`, `lockPath`, `availability`),
  renders the header/roles/table, and selects the previously selected role when
  the new scope has it, else the first role. `boot()` then wires the
  filter/topn/hide-key-blocked/export/copy/download controls.
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
  five signals from `focusAssessments[role]` (coverage, dispersion, composition,
  freshness, trust). A below-bar cell is warned (tint + glyph), `unknown` is muted —
  never green. A metric the editor just added reads "not assessed" until the next
  reload (the payload is computed over the resolved definition).
- **Recompute**: `selectRole` → `renderRoles`/`renderEditor`/`renderExplain` +
  `recompute()`. `recompute()` → `POST /api/rank {role, def}` → `state.rows`,
  `lambda`, `derivedLambda`, `errors`; re-renders the table and readouts, and
  reloads the explain panel if the selected model is still present. Editor
  changes call `scheduleRecompute()` (120 ms debounce).
- **Explain**: `selectModel(id)` → `POST /api/explain {role, def, modelId}` →
  `renderExplain()` (composition table, cost line, "why not higher",
  dominators, and the availability line).
- **Availability overlay**: each row's `key` renders as a three-state badge in
  the `key` column; the **hide key-blocked** checkbox beside the filter/top-n
  controls drops `blocked` rows from the table (a client-side filter — the
  ranking and Export are untouched); the header shows the allowlist size
  (`keyedCount`/`publicCount`). The explain panel repeats the verdict and its
  reason. When `availability.reason !== "active"` every badge reads `unknown`
  and the tooltip/hint names OpenRouter → Settings → **"Filter the model catalog
  for API keys"** — the explorer never guesses.
- **Dirty tracking**: `dirtyRoles()` compares `JSON.stringify(defs[role])` to
  `effective[role]`; only dirty roles are sent to `POST /api/export`. On success
  the client updates `effective` for the written roles and the status names the
  written lock file. The state is rebuilt from the payload on a scope switch, so
  dirty tracking is per scope.
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
