# Architecture

Maintainer map of the `omp-llm-role` plugin: how the modules fit together, the
runtime contract they must satisfy, and the invariants a change must not break.

- User-facing install/usage: [`../../README.md`](../../README.md).
- How it is verified: [`testing.md`](testing.md).
- Where the numbers come from: [`data-sources.md`](data-sources.md).

## Module map

Every tracked source file, with its role and the symbols a caller depends on.

### CLI entry points (`src/cli/`, Node, type-stripping)

The two surfaces that have no omp command. Everything else is reached through
the extension's `/refresh-roles`, `/explore-roles` and `/create-agent`.

| File | Role |
|---|---|
| `src/cli/llm-role-rank.ts` | Report surface. Thin CLI over `src/engine.ts`: parses `--top/--json/--out/--refresh/--all/--url`, calls `loadRankData` + `computeRankings`, renders the per-role markdown tables and the suggested `modelRoles` YAML (resolved through `resolveVariant`). No exports; `main()` runs at import. |
| `src/cli/create-role.ts` | `node src/cli/create-role.ts --name <role> --weights m=w,...` — writes one validated role into the settings lock file through `writeRoleSettings`. |

### `src/` core

| File | Role / key exports |
|---|---|
| `src/engine.ts` | Ranking engine shared by CLI and plugin. Fetch/cache chain per source, cardinal transforms, value scoring. Exports `loadRankData`, `computeRankings`, `buildModels`, `rankRole`, `paretoFrontier`, `cardinalMetric`, `roleLambda`, `thinkingPriceFactor`, `CAPABILITY_FILL`, `SUFFIX_LEVELS`, `META_LEVELS`, `THINKING_TOKEN_OVERHEAD`, `parseFindData`, `parseModelPage`, `narrowEndpointRecord`, `buildOpenRouterEnrichment`, `applyOpenRouterData`, `hasEndpointFilters`, `routePassesEndpointFilters`, `modelPassesEndpointFilters`, `endpointFilterDrops`, `applyDesignPercentiles`, `applyWritingScores`, `extractFlight`, `extractJsonArray`, the cache readers/writers, and the `Model`/`RoleDef`/`Ranked`/`RankData`/`OpenRouterEndpointRecord` types. Re-exports `normalizeDesignId` and `parseWritingEvidence` from the benchmark-source registry. |
| `src/benchmark-sources.ts` | The benchmark-source registry: the single source of truth for which sources exist, what metric each feeds, and how to fetch/parse/join each. Exports `BENCHMARK_SOURCES` (the shipped static sources), `resolveBenchmarkSource`, `declaredSourceForLink`, `sourceForMetric`, `parseBenchmarkPayload`, `parseBenchmarkPayloadMeta`, `loadBenchmarkScores`, `applyBenchmarkScores`, `joinBenchmarkScores`, `normalizeMetricKey`, `externalMetricKey`, `normalizeDesignId`, `parseWritingEvidence`, `parseLlmStatsBenchmark`, `parseBenchmarkCatalog`, `loadBenchmarkCatalog`, `cachedSourceInfo`, `catalogMetric`, `SHIPPED_CATALOG_METRICS`, the declarative-source surface (`SourceDeclaration`, `validateDeclaration`, `parseSourceDeclaration`, `loadDeclaredSources`, `saveDeclaredSource`, `declaredSourcesPath`, `declarationToSource`, `executeDeclaration`, `llmStatsBenchmarkDeclaration`, `genericBenchmarkSource`, `dryRunDeclaration`), the fetch helpers (`fetchJson`, `fetchText`), and the `BenchmarkSource`/`JoinRule`/`BenchmarkScores`/`BenchmarkPayloadMeta`/`FocusSourceInfo`/`BenchmarkCatalogEntry`/`DeclarationDryRun` types. Imports `engine.ts` for types only, so there is no runtime cycle. |
| `src/settings.ts` | Shipped defaults and the settings merge/validate path. Exports `DEFAULT_ROLES`, `DEFAULT_SETTINGS`, `SHIPPED_AGENTS`, `KNOWN_METRICS`, `isKnownMetric` (a shipped key or an external `<ns>:<local>`), `PLUGIN_SETTINGS_PATH`, `ACTIVATE_DEFAULT_KEY`, `deriveSettingsSchema`, `readPluginSettingsMap`, `resolveSettings`, `roleUniverse`, `deepMergeInto`, `findProjectAnchor`, `projectLockPath`, and the `ResolvedSettings`/`PluginSettingSchema`/`UniverseEntry`/`RoleKind` types. `readPluginSettingsMap` merges the project lock file (`projectLockPath(cwd)` = `<cwd>/.omp/plugins/omp-plugins.lock.json`, omp's project dir with **no walk-up**) over the user-level one; `findProjectAnchor` (the walk-up `.omp`/`.git` anchor) is kept only for the `/project-roles` divergence warning. |
| `src/agent-pins.ts` | Agent → pinned-role derivation. Exports `parseAgentPin` (first `@<role>` in the `model:` frontmatter) and `discoverAgentPins` (scans the shipped, user and project agent dirs; project > user > plugin). Drives the `task.disabledAgents` sync. |
| `src/availability.ts` | Key tier gate, catalog filter, variant resolution, provider-allowlist probe, and the keyed-catalog availability primitive. The keyed source is the Bearer-authenticated `GET /api/v1/models` (the account setting "Filter the model catalog for API keys" makes it a per-key allowlist; set membership is the only signal), shared by the explorer and the updater's companion fast path. Exports `fetchKeyMeta`, `tierGate`, `filterCatalog`, `rankingIdOf`, `currentRankingId`, `resolveVariant`, `enrichThinkingLevels`, `probeModel`, `computeKeyAvailability`, `fetchKeyAvailability`, `catalogFromOmpModelsJson`, `THINKING_LEVELS`, and the `CatalogEntry`/`KeyMeta`/`Tier`/`ProbeVerdict`/`KeyAvailability` types. |
| `src/config-edit.ts` | Surgical line-oriented YAML patch for `modelRoles` + `retry.fallbackChains` + `task.disabledAgents`, plus the atomic writer. Exports `parseConfig`, `patchConfig`, `writeConfigAtomic`, `ConfigEditError`, and the `ConfigPatch` type. No runtime YAML dependency. |
| `src/state.ts` | State/history/lock files under the agent dir, and agent-dir resolution. Exports `agentDir`, `loadState`, `saveState`, `appendHistory`, `acquireLock`, `releaseLock`, `freshState`, and the `PluginState` type (which carries `managedDisabledAgents` — the `task.disabledAgents` names the plugin added). |
| `src/updater.ts` | Orchestration: rank → tier gate → probe → hysteresis → chains → agent-disable sync → config write. Exports `runUpdater`, the `Deps`/`Decision`/`RunResult`/`Trigger`/`DecisionReason` types. Resolves the project scope (`<cwd>/.omp` when it carries an `omp-llm-role` settings entry) and scopes the config/state/history/lock to it. `agentDisablePatch` also removes a previously-managed `task.disabledAgents` name whose agent file is gone. |
| `src/extension.ts` | omp extension entry (default export). Registers `session_start` (awaited day-gated run), `/refresh-roles`, `/explore-roles` (in-process explorer), `/create-agent` (architect + benchmark-link resolution + catalog discovery), `/remove-agent`, `/project-roles` (profile architect + `setupProject` + in-process updater), and `session_shutdown`. Owns `extDeps` (the extension's `Deps`) and the live-session model hook. |
| `src/guards.ts` | The package's one type guard: `isRecord`. |
| `src/role-settings.ts` | The one validated role write path (validate → merge → backup → atomic write) and its removal half. Exports `validateRole`, `mergeExport`, `writeRoleSettings`, `mergeRemove`, `removeRoleSettings`, `timestamp`. Shared by the explorer's Export, `src/cli/create-role.ts`, `/create-agent` and `/remove-agent`. |
| `src/role-archetypes.ts` | Purpose → weight archetype table (10 sets) + keyword fitting. Exports `ARCHETYPES`, `FALLBACK_ARCHETYPE`, `fitArchetype`, `archetypeById`, and the `Archetype`/`ArchetypeMatch` types. |
| `src/agent-file.ts` | Agent `.md` rendering/placement. Exports `renderAgentFile`, `writeAgentFile`, `removeAgentFile`, `isReadOnlyTools`, `userAgentsDir`, `projectAgentsDir`, `READ_ONLY_TOOLS`, `RESERVED_AGENT_NAMES`, `AGENT_NAME_RE`, and the `AgentFileSpec`/`AgentWriteResult`/`AgentRemoveResult` types. |
| `src/agent-architect.ts` | omp's in-process architects: the agent-creation architect (`/create-agent`, `/agents` hub) and the project-profile architect (`/project-roles`). Exports `generateAgentSpec`, `generateProjectProfile`, `parseAgentSpec`, `parseProjectProfile`, `extractJsonObject`, `extractAssistantText`, and the `ArchitectOptions`/`ProjectArchitectOptions` types. Imports `@oh-my-pi/pi-coding-agent` **dynamically** (inside the runner), so the module is importable under plain Node. |
| `src/benchmark-author.ts` | Benchmark-source authoring for an unknown link: fetch the link, run an in-process architect (`src/prompts/benchmark-source-architect.md`) to propose a declarative source spec, and validate it. Imports `@oh-my-pi/pi-coding-agent` **dynamically** (inside the function). Exports `authorBenchmarkSource`, `parseSourceDeclarationJson`, and the `BenchmarkAuthorOptions` type. |
| `src/benchmark-discovery.ts` | Judge-backed benchmark relevance for `/create-agent` discovery: one `noul` (yes/no probability) question per catalog candidate, batched into a single judgment through omp's configured `judge` role (TypeSafe jev or its fallback chain). Extension-only (imports `@oh-my-pi/pi-coding-agent` and its `./judgment` subpath — the deeper `./judgment/standalone` path does not resolve under omp's SDK injection). The SDK is imported dynamically so a resolution failure degrades to "no discovery" instead of failing the whole extension load. Exports `judgeBenchmarkRelevance`. |
| `src/agent-create.ts` | `/create-agent` core: purpose → archetype → validated role → agent `.md`, plus the shared input parser and report formatter both hosts use. Exports `createAgent`, `resolveRole`, `parseCreateAgentInput` (flag form or free text), `parseCreateAgentArgs`, `tokenizeArgs`, `extractBenchmarks`, `extractBenchmarkLinks`, `applyFocusBenchmarks`, `assessFocusMetric`, `belowBarReason`, `focusCoverageOk`, `countMetricCoverage`, `discoverBenchmarks`, `checkWeightMath`, `formatBenchmarks`, `formatArchetypes`, `formatCreateAgentReport`, `CREATE_AGENT_USAGE`, and the request/result types (incl. `FocusMetricAssessment`/`FocusCoverageEntry`/`FocusAssessor`). |
| `src/agent-remove.ts` | `/remove-agent` core: delete an agent `.md` and its role, plus the shared flag parser and report formatter. Exports `removeAgent`, `parseRemoveAgentArgs`, `formatRemoveAgentReport`, `REMOVE_AGENT_USAGE`, and the request/result types. Refuses shipped default roles. |
| `src/project-setup.ts` | `/project-roles` core: a discovered `ProjectProfile` → a project-scoped role set (kept shipped roles, dropped ones, new fitted roles) written to the project plugin settings lock file, plus the project agents for the new roles. All-or-nothing (every check — names, metrics, weight math, the `--force` gate, agent-file collisions — before any write), `--dry-run`. Exports `setupProject`, `parseProjectRolesArgs`, `parseRolesSpec`, `applyProfileOverrides`, `formatProjectRolesReport`, `PROJECT_ROLES_USAGE`, and the `ProjectProfile`/`ProposedRole`/`SetupProjectOpts`/`SetupProjectResult` types (the result carries an `archetypes` map). Dual-runtime safe (no SDK import); the extension command does the LLM work and calls it. |

### `src/explorer/`

| File | Role / key exports |
|---|---|
| `src/explorer/boot.ts` | Shared explorer launcher: bind/port fallback, lock-file roles, browser open, close. Exports `startExplorer`, `EXPLORER_DEFAULT_PORT`, and the `ExplorerHandle`/`ExplorerBootOpts` types. Used by `/explore-roles`. |
| `src/explorer/server.ts` | Zero-dependency HTTP surface (static SPA + JSON API). Exports `createExplorerServer` and the `ExplorerOpts` type. Endpoints: `GET /api/bootstrap` (carries `focusAssessments`), `POST /api/rank`, `POST /api/explain`, `POST /api/export`, `POST /api/refresh`. |
| `src/explorer/explain.ts` | Pure explanation layer: rank rows with baseline deltas, per-model decomposition, inverse-cardinal targets, and the seven-axis focus assessment. Exports `rankRows`, `explainModel`, `inverseCardinal`, `focusMetricsOf`, `focusAssessments`, `METRIC_META`, `metricMeta`, `metricMetaFor`, `weightableMetrics`, and the `RankRow`/`Explanation`/`Contribution`/`Closing`/`MetricMeta` types. |

### Assets and non-code

| Path | Role |
|---|---|
| `src/prompts/agent-creation-architect.md`, `src/prompts/agent-creation-user.md` | omp's architect prompts, shipped verbatim; read by `src/agent-architect.ts` via `new URL("./prompts/…", import.meta.url)`. |
| `src/prompts/benchmark-source-architect.md`, `src/prompts/benchmark-source-user.md` | The benchmark-source architect prompts; read by `src/benchmark-author.ts`. |
| `src/prompts/project-profile-architect.md`, `src/prompts/project-profile-user.md` | The `/project-roles` profile-discovery architect prompts; read by `src/agent-architect.ts`. |
| `web/index.html`, `web/app.js`, `web/style.css` | Explorer SPA — no framework, no build step, no external requests. Served by `src/explorer/server.ts`. |
| `agents/designer.md` | The shipped `designer` subagent, discovered from the plugin's extension root (`<ext>/agents/*.md`). Opt-in: kept in `task.disabledAgents` until `roles.designer.enabled=true`. |
| `skills/omp-llm-role-create-agent/SKILL.md` | Shipped skill, discovered from the plugin's `skills/` root. Hand-driven equivalent of `/create-agent`. |
| `package.json` | Plugin manifest: `omp.extensions`, `omp.settings` (the flat schema `deriveSettingsSchema` produces), the npm `files` whitelist. No runtime dependencies (`yaml` is dev-only). |
| `.omp-plugin/marketplace.json` | Self-hosted omp marketplace catalog (`gott50-plugins`). Its `plugins[0].version` must be bumped with `package.json`. |
| `LICENSE` | MIT. |
| `package-lock.json` | Lockfile for the dev-only `yaml` dependency. |
| `.gitignore` | Excludes `cache/`, `node_modules/` and `.DS_Store`. |
| `AGENTS.md` | Repo working agreement (update README/SPEC and commit after work). |
| `skills-lock.json` | Lock for the local `.agents/skills/` collection. |
| `.agents/skills/` | Local dev-skill collection (Matt Pocock skills); not part of the plugin's shipped surface. |
| `docs/agents/domain.md`, `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md` | Repo process docs (domain glossary, issue tracker, triage labels). |
| `docs/dev/testing.md` | The test-suite seam map and the live checks. |
| `docs/dev/architecture.md`, `docs/dev/data-sources.md` | This file and the data-source map. |
| `tests/` | `node --test tests/` fixtures — the seam map is in [`testing.md`](testing.md). |
| `docs/llm-role-rankings.md` | Generated report (regenerate with `--out`); the README's worked example. |
| `cache/*.json` | Daily UTC caches (gitignored; see [`data-sources.md`](data-sources.md)). |

## Variant resolution (ranking id → selector)

A ranking row (an llm-stats bare id) resolves to an `openrouter/*` catalog id by
matching the id after the last `/` (org prefix — including `~`-prefixed —
ignored), or after stripping a trailing `-latest`. Among the matches,
`resolveVariant` emits in order: **exact id** (bare or dated, whatever equals the
ranking id) → **newest dated id** (max trailing `-MMDD`/date suffix) → **bare
id** → `~org/…-latest` alias (last resort — a valid selector beats no update).
Never `:batch`; `:free` only on the free-tier branch of the tier gate. Ties
break lexicographically. The emitted selector is always `openrouter/<catalogId>`.

## Data flow

One pipeline, driven by `runUpdater(trigger, deps, opts)` in `src/updater.ts`.
The omp extension injects the production `Deps`; tests inject fakes.

1. **Trigger.** `session_start` (awaited, day-gated) or `/refresh-roles`
   (forced). `runUpdater` resolves the **project scope** first: when
   `<cwd>/.omp/plugins/omp-plugins.lock.json` carries an `omp-llm-role` settings
   entry, the config, the settings read, and the state/history/lock are scoped to
   `<cwd>/.omp` (the global `~/.omp/agent/config.yml` is never written in project
   mode); otherwise the global agent dir is used. It then loads `loadState()` and
   the raw settings (`deps.getSettings?.() ?? readPluginSettingsMap()`), then
   `resolveSettings(raw)`; any validation error aborts with no write.
2. **Agent-disable sync.** `agentDisablePatch` computes the
   `task.disabledAgents` adds/removes from `roleUniverse` + `discoverAgentPins`,
   plus a removal for any name in `state.managedDisabledAgents` whose agent file
   is gone (e.g. `/remove-agent`) or whose role is no longer disabled. This sync
   is **not** day-gated: on a same-day session it is the only write.
3. **Rank.** `deps.getRankData?.() ?? loadRankData({ roles: settings.roles })`.
   `loadRankData` runs the per-source cache → fetch → stale-cache chain and
   returns `RankData` (models + match counts). A throw aborts (llm-stats is
   fatal; OpenRouter/Design Arena/writing are non-fatal).
4. **Tier gate.** `deps.getToken()` → `deps.getKeyMeta?.(token) ??
   fetchKeyMeta(token)` → `tierGate` → `"billed" | "free" | "none"`; `"none"`
   aborts.
5. **Catalog + probe.** `deps.getCatalog()` → `filterCatalog(catalog, tier)`;
   `enrichThinkingLevels(rank.models, catalog)`. Per role, candidates are
   `resolveVariant`-resolved and then verified by a bounded `probeModel` walk
   (current selector first, then rank order; budget `PROBE_BUDGET = 12`; verdicts
   cached per run). Only the narrow no-allowed-providers 404 disqualifies; every
   other failure (5xx, timeout, unknown model) counts as usable and stays in
   omp's runtime-fallback domain. Blocked candidates are excluded and recorded on
   the decision.
6. **Hysteresis.** `no-current` → adopt; ineligible current → `adopted`; best
   beats current by `switchMargin` → `switched`; inside the margin but
   `cheaperInsideMargin` → `switched-cost`; else `kept-margin` / `kept-eligible`.
7. **Suffix.** Append `roles.<role>.thinking` only when the chosen catalog row's
   `thinking[]` includes the level (meta levels `off`/`auto` need only a
   non-empty list).
8. **Chains.** For every managed role, `chainUpserts` (bare key → next
   `fallbackChainDepth` probe-clean candidates, suffixed per target) and
   `chainPrunes` (plugin-written keys no longer referenced). A key claimed by
   more than one role stays level-free.
9. **Config patch.** `writePatch` acquires the refresh lock, reads `config.yml`,
   `patchConfig` (surgical, self-checked), `writeConfigAtomic` (mtime-guarded
   tmp+rename, 3 conflict retries). Zero changes → no write, no mtime change.
10. **State + history.** `saveState` (day gate, managed roles, last selectors,
    plugin-written chain keys, managed `task.disabledAgents` names, previous
    `modelRoles` snapshot) and `appendHistory` (one row per completed run).
11. **Live-session coupling.** When `default` actually changed and
    `activateDefaultOnEmptySession` is set, `deps.applySessionModel?.(selector,
    previous)` hands the new selector to the host (extension only).

Inside `loadRankData` the engine runs: `buildModels` (llm-stats rows) →
OpenRouter enrichment (`parseFindData` → `loadEndpointPages` →
`buildOpenRouterEnrichment` → `applyOpenRouterData`) → Design Arena
(`loadDesignArenaBoards` → `buildDesignArenaIndex` → `mergeDesignElo` →
`applyDesignPercentiles`) → writing (`loadBenchmarkScores` → `applyWritingScores`,
both from the registry) → the external-metric loop (every metric a ranked role
weights that the plugin does not ship: `sourceForMetric` → `loadBenchmarkScores`
→ `applyBenchmarkScores`; `opts.roles === undefined` fetches every declared
source). `computeRankings` then calls `rankRole` per role, which uses
`cardinalMetric`, `roleLambda`, `thinkingPriceFactor` and `CAPABILITY_FILL`;
`paretoFrontier` marks the report's `★` rows.

## Dual-runtime contract

The same modules run in two hosts:

- **omp extension** — in-process under **Bun**, inside omp. Entry:
  `package.json` → `omp.extensions` → `./src/extension.ts`.
- **CLI** — under **Node ≥ 23.6 type-stripping** (this machine: Node 26). No
  bun/deno/tsx, no build step.

Rules every module must satisfy:

- Only `node:` builtins and the global `fetch`. No third-party runtime imports.
- Relative imports carry an explicit `.ts` extension (`./engine.ts`), because
  Node type-stripping does not resolve extensionless specifiers.
- No build step and no runtime dependencies (`yaml` is dev-only, used by tests
  to validate patch output with the real parser).
- Node type-stripping does **not** typecheck: a property-name typo surfaces as
  `undefined` at runtime, not a compile error. Run the script after edits and
  sanity-check stderr match/eligible counts.

The one deliberate exception is the SDK import in `src/agent-architect.ts` and
`src/benchmark-author.ts`: they import `@oh-my-pi/pi-coding-agent` (the
**package root** only — subpath imports do not resolve in the compiled binary)
**dynamically, inside the runner function**. A static import would be fatal to
the whole `extension.ts` load (it would kill every plugin command, not just the
architect); dynamic, the modules — and `src/extension.ts` — stay importable
under plain Node (the command registration is testable) and a resolution failure
degrades to the caller's error path. The architect is still **extension-only in
practice**: it is only called from the extension. The tests import
`src/agent-create.ts`, which never imports the architect.

## Injected `Deps`

`src/updater.ts` defines the adapter both hosts implement, so the orchestration
has no host coupling:

```ts
type Deps = {
  getToken(): Promise<string>;          // extension: modelRegistry.getApiKeyForProvider("openrouter")
  getCatalog(): Promise<CatalogEntry[]>;// extension: ctx.modelRegistry.getAvailable()
  notify(lines: string[]): void;        // extension: ctx.ui.notify (+ stderr when !hasUI)
  nowUtcDay(): string;
  // DI seams for tests; production defaults to the engine and the lock-file settings.
  getRankData?(): Promise<RankData>;
  getSettings?(): Promise<Record<string, unknown>>;
  getKeyMeta?(token: string): Promise<KeyMeta>;
  probeModel?(token: string, catalogId: string): Promise<ProbeVerdict>;
  // Host coupling (extension only): apply a concrete selector to the live session model.
  applySessionModel?(selector: string, previous: string | null): Promise<void>;
};
```

The extension's `extDeps` normalizes two omp registry differences: the key comes
from `getApiKeyForProvider("openrouter")` (`getApiKey` returns `undefined`
there), and registry rows carry `thinking` as an effort object
(`{ mode, efforts[], … }`) which `extDeps` flattens to the CLI's `string[]`
before `catalogFromOmpModelsJson`.

## Entry points

- **Extension** (`src/extension.ts`, default export): `session_start` (awaited
  `runUpdater("session-start", extDeps(pi, ctx))`), `/refresh-roles`
  (`runUpdater("manual", …, { force: true })`), `/explore-roles` (in-process
  `startExplorer`), `/create-agent` (architect → `createAgent` → in-process
  `runUpdater`), `/remove-agent` (`removeAgent` → in-process `runUpdater`),
  `/project-roles` (profile architect → `setupProject` → in-process
  `runUpdater`), `session_shutdown` (closes the explorer handle).
- **CLI**: `src/cli/llm-role-rank.ts` (report), `src/cli/create-role.ts`
  (authoring). The updater and explorer have no CLI shim — they run through
  `/refresh-roles` and `/explore-roles`.

## Engine refactor contract

`src/engine.ts` is the shared engine; `src/cli/llm-role-rank.ts` is a thin CLI over it.

- `loadRankData(opts?: { refresh?; url?; roles?; extraMetrics? }): Promise<RankData>`
  — the per-source cache → fetch → stale-cache chain. `opts.roles` names the roles
  the caller will rank: a role-exclusive source is fetched only when some role
  weights its metric — Design Arena (`website`), the writing leaderboard
  (`writing`), and every external metric (a declared source or the generic
  llm-stats benchmark). `opts.extraMetrics` adds metrics no role weights and also
  forces the `website`/`writing` fetches. `undefined` roles = fetch every declared
  source. The explorer passes the resolved roles **plus** the shipped keys
  (`Object.keys(KNOWN_METRICS)`), so its dataset is a superset of any def the UI
  can rank — without it a role weighting an undeclared generic benchmark
  (`bench:<id>`) would rank on a dataset missing that metric and disagree with the
  updater.
- `src/benchmark-sources.ts` is the registry: `resolveBenchmarkSource(link)` maps
  a link to a source, `sourceForMetric(metric)` maps a metric back, and
  `loadBenchmarkScores`/`applyBenchmarkScores` are the shared cache chain and
  join. A new source is one registry entry (or one declaration), not a new branch
  in the engine.
- `computeRankings(models, roles): Record<string, Ranked[]>` — cardinal
  fixed-anchor transforms + quality composite `q` + value `q − λ·priceEff` +
  eligibility (`required` non-null, billed price). `roles` comes from resolved
  settings, not a hardcoded table.
- `src/cli/llm-role-rank.ts` keeps its CLI, flags, report format and suggested-YAML
  output; its suggested `modelRoles` block resolves through the same
  catalog/variant logic the plugin uses (`openrouter/<id>` selectors).

Verification after any engine change: `node src/cli/llm-role-rank.ts --top 5`, then check
stderr `openrouter: matched N/<pool> models (throughput), M priced`, the
`openrouter endpoints: K/L model pages` line, and the per-role eligible counts.

## Shipped layout (do not break)

- **Extension discovery**: `package.json` → `omp.extensions: ["./src/extension.ts"]`.
- **Settings schema**: `package.json` → `omp.settings` is the flat, dotted key
  set `deriveSettingsSchema()` produces; a test asserts the two match. omp's
  `/settings` → Plugins tab renders and writes these keys directly.
- **npm tarball**: ships exactly the `files` whitelist in `package.json`
  (`src`, `web`, `agents`, `skills`, `docs/dev`, `docs/llm-role-rankings.md`).
  Caches and tests stay out.
- **Agent discovery**: `agents/designer.md` is found from the plugin's extension
  root (`<ext>/agents/*.md`); a user/project copy overrides it.
- **Skill discovery**: `skills/omp-llm-role-create-agent/SKILL.md` is found from
  the plugin's `skills/` root.
- **Architect prompts**: `src/prompts/*.md` are plugin assets read relative to
  `src/agent-architect.ts` / `src/benchmark-author.ts`; they are not importable
  from omp.
- **Declared benchmark sources**: `benchmark-sources.json` under the agent dir
  (`agentDir()`), written by the `/create-agent` authoring step and read by the
  engine's external-metric loop. Data, not code.
- **Explorer SPA**: `web/` is served by `src/explorer/server.ts`; the extension
  resolves it as `new URL("../web", import.meta.url)`.
- **Marketplace**: `.omp-plugin/marketplace.json` lists the repo itself
  (`source: "./"`); bump its `plugins[0].version` together with `package.json`.
- **No runtime dependencies**: `config-edit.ts` reads and self-checks the config
  line-oriented, so marketplace installs (which never install package
  dependencies) work.

## Invariants a maintainer must not break

- **One write path per artifact.** Roles go through `writeRoleSettings` (and
  `removeRoleSettings` for deletion); the config through `patchConfig` +
  `writeConfigAtomic`; agent files through `writeAgentFile` (and
  `removeAgentFile` for deletion). Nothing else writes those files.
- **Surgical config edits.** Only managed role lines, managed chain keys and the
  plugin-managed `task.disabledAgents` names change; comments, blank lines and
  unknown keys stay byte-identical. A no-change run writes nothing.
- **Flat dotted keys are canonical** in the settings lock file (omp's
  `/settings` shallow-merges and does not flatten nested objects). The reader
  accepts both flat and nested; the writer emits flat.
- **`required` is the eligibility gate, not a weight** — validation checks it
  against `isKnownMetric`, not against `weights`.
- **An external metric key is dot-free** (`<namespace>:<local>`) — the flat
  dotted settings path splits on `.`, so a dotted key mis-nests on read-back.
  `isKnownMetric` (`src/settings.ts`) is the pure name check; the registry is the
  engine-side resolver (`sourceForMetric`), and `settings.ts` never imports it.
- **`model:` is always the chain `@<role>, @default`** — a bare `@<role>` is a
  literal pattern when the role is absent and hard-fails.
- **`thinking` is not written into agent frontmatter** — the role's `thinking`
  field already sets and prices the effort.
- **The engine is the only ranking math.** The explorer never reimplements
  `value = q − λ·$/M`; it calls `rankRole`/`explainModel`.

## Non-goals

- **First-party provider selectors.** The plugin emits `openrouter/*` selectors
  only — the ranking's price/throughput are OpenRouter-derived and the key is an
  OpenRouter key.
- **Non-OpenRouter scoring sources.**
- **A `/rollback` command.** `llm-role-state.json` snapshots the previous
  `modelRoles` block as a manual rollback aid; there is no command.
- **Auto-tuning `switchMargin`.**
- **A generic benchmark scraper** that auto-detects a payload with no user
  review — the declarative source + authoring step is the mechanism.
- **A UI for browsing/editing benchmark sources** — the source file is edited by
  hand or by the authoring step; the explorer's role editor gains the external
  metrics already in use.
- **Changing the cardinal transform classes** — external metrics are normalized
  to 0–1 at parse time.
- **Re-ranking or re-fetching beyond the daily UTC cache chain.**

Weight editing is the explorer's Export, `src/cli/create-role.ts` or
`/create-agent` (all validate through `resolveSettings`); role/agent removal is
`/remove-agent` (through `removeRoleSettings`).
