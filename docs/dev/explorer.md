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
| `src/explorer/explain.ts` | Pure explanation layer (no I/O): rank rows with baseline deltas, per-model decomposition, inverse-cardinal targets. Exports `rankRows`, `explainModel`, `inverseCardinal`, `METRIC_META`, `WEIGHTABLE_METRICS`. |
| `src/explorer/boot.ts` | Shared launcher: bind/port fallback, lock-file roles, browser open, close. Exports `startExplorer`, `EXPLORER_DEFAULT_PORT`, `ExplorerHandle`, `ExplorerBootOpts`. |
| `src/role-settings.ts` | The one validated role write path (validate → merge → backup → atomic write). Exports `validateRole`, `mergeExport`, `writeRoleSettings`, `timestamp`. |
| `web/app.js` | The SPA: renders and edits role defs, calls the API. No framework, no build step, no external requests. |
| `explore.ts` | CLI shim over `startExplorer` (catalog via `omp models ls`). |
| `src/extension.ts` | `/explore-roles`: in-process `startExplorer` (catalog from the live model registry), closed on `session_shutdown`. |

## HTTP surface (`src/explorer/server.ts`)

`createExplorerServer(opts: ExplorerOpts): Server`. Bound to loopback by the
caller; no auth. Every handler is wrapped so a throw becomes a 500 JSON error
(`HttpError` carries a status; `res.headersSent` short-circuits).

`ExplorerOpts` is the DI seam:

```ts
type ExplorerOpts = {
  webDir: string;
  lockPath: string;
  // Fresh per call: rank (swapped by refresh) plus roles/universe re-read from
  // the lock file, so a page reload after Export reflects the write.
  getState(): {
    rank: RankData;
    roles: Record<string, RoleDef>;
    universe: Record<string, UniverseEntry>;  // every known role, disabled included
    defaults: Record<string, RoleDef>;
  };
  refresh(): Promise<void>;                   // re-runs loadRankData({ refresh: true }) and swaps rank
};
```

Endpoints:

| Method + path | Body | Response |
|---|---|---|
| `GET /` | — | `web/index.html` |
| `GET /app.js`, `/style.css` | — | static asset (traversal-guarded) |
| `GET /api/bootstrap` | — | `bootstrapPayload(opts)` |
| `POST /api/rank` | `{role, def}` | `{eligible, lambda, derivedLambda, rows, errors}` |
| `POST /api/explain` | `{role, def, modelId}` | `explainModel(...)` spread + `errors` |
| `POST /api/export` | `{roles}` | `{ok:true, backupPath, roles}` or `{ok:false, errors}` |
| `POST /api/refresh` | — | `await opts.refresh()` then the bootstrap payload |

- `bootstrapPayload` ships `roles` (resolved), `defaults` (`DEFAULT_ROLES`),
  `universe` (kind/enabled/locked + effective def per known role), `metrics`
  (`Object.keys(KNOWN_METRICS)`), `metricMeta` (`METRIC_META`), `levels`
  (`Object.keys(SUFFIX_LEVELS)`), `thinkingFactors` (per-level billed-blend
  multiplier from the engine's own `thinkingPriceFactor`, so the UI readout
  cannot drift), `fetchedAt`, `modelCount`, `orMatched`, `orPriced`, `lockPath`.
  Every request calls `getState()`, which re-reads the lock file — so a page
  reload after Export shows the new roles, not the boot-time snapshot.
- `handleRank` baselines against `state.roles[role] ?? state.universe[role]?.def ??
  state.defaults[role]`: an enabled role against its resolved def, a disabled or
  lock-file-only role against its effective def, so selecting it still shows
  deltas rather than an empty baseline.
- `handleExport` calls `writeRoleSettings(opts.lockPath, body.roles)` and
  returns its result verbatim.
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
- **`rankRows(def, models, baseline)`** — `rankRole(def, models)` +
  `paretoFrontier`, annotating each row with `baselineRank`/`delta`
  (`baselineRank − rank`; positive = moved up) against the effective role's
  ranking. Rows carry `priceEff` (the thinking-adjusted price the ranking
  penalized), `parts`, `missing` (weighted non-price metrics whose raw value is
  null), and `frontier`.
- **`inverseCardinal(metric, t)`** — inverse of `cardinalMetric` for the "what
  would it take" targets: `index` → `t*80 − 20`; `throughput` → `10 * 30**t`
  (null outside `[0,1]`, because the forward transform clamps); everything else
  (benchmark, percentile, price) → identity. See *Open defect* below for the
  `gpqa` exception.
- **`explainModel(def, models, modelId, roleName)`** — the full decomposition, or
  the eligibility gates it failed (same gates `rankRole` applies, same order:
  missing required, image filter, no billed price). On success: `contributions`
  (raw → cardinal `t` → renormalized weight → contribution → share of `q`, with
  a `fillNote` when the value is a capability fill), `cost` (`priceEff`, billed
  price, λ, penalty, `q`, `value`), `gapAbove`/`gapToTop`/`above`, `closing` (the
  per-metric raw target that would close the gap, via `inverseCardinal`, with
  unreachable/extrapolated notes), and `dominators` (models both cheaper and at
  least as good on `q`, top 3). It mirrors `rankRole`'s capability fill so the
  contributions sum exactly to `q`.
- **`WEIGHTABLE_METRICS = Object.keys(KNOWN_METRICS)`** — exactly what the
  validator accepts.

## Shared boot path (`src/explorer/boot.ts`)

`startExplorer(opts: ExplorerBootOpts): Promise<ExplorerHandle>` — the one
launcher both hosts use, so `explore.ts` and `/explore-roles` cannot drift.

- `EXPLORER_DEFAULT_PORT = 5177`; `listen` binds `127.0.0.1` and resolves the
  actual port. A permanent `error` listener is attached before `listen`, so a
  post-listen socket error is logged instead of becoming an uncaughtException
  (which would tear down the whole omp session). `EADDRINUSE` → retry on port 0
  (OS-assigned).
- Roles come from the **user-level** lock file only:
  `readPluginSettingsMap({ global: lockPath, project: null })` keeps any
  project-anchor file out of the merge. `resolveSettings` → `settings.roles`
  (the resolved set = what the plugin does today); `roleUniverse(raw, roles)`
  adds the roles it knows but does not rank (shipped opt-ins, lock-file-only
  roles). `getState()` re-runs this read on **every** request, so a page reload
  after Export reflects the write instead of the state at boot.
- `enrichThinkingLevels(rank.models, opts.catalog)` gates the thinking price
  factor on the omp catalog; `refresh()` re-runs `opts.reload(true)` and
  re-enriches.
- `unref` (extension only) detaches the server from the event loop so a
  short-lived `omp -p` run cannot hang; the CLI must NOT set it (the listening
  handle is what keeps `node explore.ts` alive).
- `open` launches the default browser on macOS (`execFile("open", [url])`).
- `close()` calls `closeAllConnections()` then `server.close()`.

## Export path (`src/role-settings.ts`)

The one validated role write path, shared by the explorer's Export,
`create-role.ts` and `/create-agent`.

- `validateRole(name, def)` → `resolveSettings({ roles: { [name]: def } }).errors`
  (`resolveSettings` clones its input, so it is safe per call).
- `mergeExport(existing, dirty)` → `{lock}` or `{error}`. Preserves `plugins` and
  every sibling settings key. Writes each dirty role as **flat dotted keys**
  (`roles.<name>.weights.<metric>`, `.description`, `.enabled`, `.locked`,
  `.required`, `.thinking`, `.lambda`, `.filters.image`) because omp's
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

- **Boot**: `boot()` → `GET /api/bootstrap` → fills `state` (`universe`,
  `effective` = each entry's `def`, `defs` = a structuredClone of it, `defaults`,
  `metrics`, `metricMeta`, `levels`, `thinkingFactors`, `lockPath`), wires the
  filter/topn/export/copy/download controls, and selects the first role.
- **Recompute**: `selectRole` → `renderRoles`/`renderEditor`/`renderExplain` +
  `recompute()`. `recompute()` → `POST /api/rank {role, def}` → `state.rows`,
  `lambda`, `derivedLambda`, `errors`; re-renders the table and readouts, and
  reloads the explain panel if the selected model is still present. Editor
  changes call `scheduleRecompute()` (120 ms debounce).
- **Explain**: `selectModel(id)` → `POST /api/explain {role, def, modelId}` →
  `renderExplain()` (composition table, cost line, "why not higher",
  dominators).
- **Dirty tracking**: `dirtyRoles()` compares `JSON.stringify(defs[role])` to
  `effective[role]`; only dirty roles are sent to `POST /api/export`. On success
  the client updates `effective` for the written roles.
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
- **Refresh**: `onRefresh()` confirms, then `POST /api/refresh` → re-renders the
  header meta and recomputes.

## Open defect

`inverseCardinal` returns identity for `kind: "benchmark"`, but `gpqa` is
chance-anchored forward — `cardinalMetric` uses `BENCHMARK_CHANCE = { gpqa: 0.25 }`
(`src/engine.ts`) and returns `(v − 0.25) / 0.75`. The explorer's "what would it
take to move up" target for `gpqa` is therefore wrong (t = 0.5 should map to raw
0.625, not 0.5). The other five raw benchmarks
(`aime`/`swe_bench`/`arc_agi`/`terminal_bench`/`tau_bench`) are 0-1, so identity
is correct for them. Fix: invert the 0.25 chance in `inverseCardinal` (export
`BENCHMARK_CHANCE` from `src/engine.ts`), or drop `gpqa` from `KNOWN_METRICS`.
