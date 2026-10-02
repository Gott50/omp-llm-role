# Architecture

Maintainer map of the `omp-llm-role` plugin: how the modules fit together, the
runtime contract they must satisfy, and the invariants a change must not break.

- User-facing install/usage: [`../../README.md`](../../README.md).
- Normative behavior contract: [`spec.md`](spec.md).
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
| `src/engine.ts` | Ranking engine shared by CLI and plugin. Fetch/cache chain per source, cardinal transforms, value scoring. Exports `loadRankData`, `computeRankings`, `buildModels`, `rankRole`, `paretoFrontier`, `cardinalMetric`, `roleLambda`, `thinkingPriceFactor`, `CAPABILITY_FILL`, `SUFFIX_LEVELS`, `META_LEVELS`, `THINKING_TOKEN_OVERHEAD`, `normalizeDesignId`, `parseFindData`, `parseModelPage`, `buildOpenRouterEnrichment`, `applyOpenRouterData`, `applyDesignPercentiles`, `parseWritingEvidence`, `applyWritingScores`, `extractFlight`, `extractJsonArray`, the cache readers/writers, and the `Model`/`RoleDef`/`Ranked`/`RankData` types. |
| `src/settings.ts` | Shipped defaults and the settings merge/validate path. Exports `DEFAULT_ROLES`, `DEFAULT_SETTINGS`, `SHIPPED_AGENTS`, `KNOWN_METRICS`, `PLUGIN_SETTINGS_PATH`, `ACTIVATE_DEFAULT_KEY`, `deriveSettingsSchema`, `readPluginSettingsMap`, `resolveSettings`, `roleUniverse`, `deepMergeInto`, and the `ResolvedSettings`/`PluginSettingSchema`/`UniverseEntry`/`RoleKind` types. |
| `src/agent-pins.ts` | Agent → pinned-role derivation. Exports `parseAgentPin` (first `@<role>` in the `model:` frontmatter) and `discoverAgentPins` (scans the shipped, user and project agent dirs; project > user > plugin). Drives the `task.disabledAgents` sync. |
| `src/availability.ts` | Key tier gate, catalog filter, variant resolution, provider-allowlist probe. Exports `fetchKeyMeta`, `tierGate`, `filterCatalog`, `rankingIdOf`, `currentRankingId`, `resolveVariant`, `enrichThinkingLevels`, `probeModel`, `catalogFromOmpModelsJson`, `THINKING_LEVELS`, and the `CatalogEntry`/`KeyMeta`/`Tier`/`ProbeVerdict` types. |
| `src/config-edit.ts` | Surgical line-oriented YAML patch for `modelRoles` + `retry.fallbackChains` + `task.disabledAgents`, plus the atomic writer. Exports `parseConfig`, `patchConfig`, `writeConfigAtomic`, `ConfigEditError`, and the `ConfigPatch` type. No runtime YAML dependency. |
| `src/state.ts` | State/history/lock files under the agent dir, and agent-dir resolution. Exports `agentDir`, `loadState`, `saveState`, `appendHistory`, `acquireLock`, `releaseLock`, `freshState`, and the `PluginState` type (which carries `managedDisabledAgents` — the `task.disabledAgents` names the plugin added). |
| `src/updater.ts` | Orchestration: rank → tier gate → probe → hysteresis → chains → agent-disable sync → config write. Exports `runUpdater`, the `Deps`/`Decision`/`RunResult`/`Trigger`/`DecisionReason` types. `agentDisablePatch` also removes a previously-managed `task.disabledAgents` name whose agent file is gone. |
| `src/extension.ts` | omp extension entry (default export). Registers `session_start` (awaited day-gated run), `/refresh-roles`, `/explore-roles` (in-process explorer), `/create-agent`, `/remove-agent`, and `session_shutdown`. Owns `extDeps` (the extension's `Deps`) and the live-session model hook. |
| `src/guards.ts` | The package's one type guard: `isRecord`. |
| `src/role-settings.ts` | The one validated role write path (validate → merge → backup → atomic write) and its removal half. Exports `validateRole`, `mergeExport`, `writeRoleSettings`, `mergeRemove`, `removeRoleSettings`, `timestamp`. Shared by the explorer's Export, `src/cli/create-role.ts`, `/create-agent` and `/remove-agent`. |
| `src/role-archetypes.ts` | Purpose → weight archetype table (10 sets) + keyword fitting. Exports `ARCHETYPES`, `FALLBACK_ARCHETYPE`, `fitArchetype`, `archetypeById`, and the `Archetype`/`ArchetypeMatch` types. |
| `src/agent-file.ts` | Agent `.md` rendering/placement. Exports `renderAgentFile`, `writeAgentFile`, `removeAgentFile`, `isReadOnlyTools`, `userAgentsDir`, `projectAgentsDir`, `READ_ONLY_TOOLS`, `RESERVED_AGENT_NAMES`, `AGENT_NAME_RE`, and the `AgentFileSpec`/`AgentWriteResult`/`AgentRemoveResult` types. |
| `src/agent-architect.ts` | omp's agent-creation architect, run in-process (extension-only). Exports `generateAgentSpec`, `parseAgentSpec`, and the `ArchitectOptions` type. Imports `@oh-my-pi/pi-coding-agent` at the package root. |
| `src/agent-create.ts` | `/create-agent` core: purpose → archetype → validated role → agent `.md`, plus the shared input parser and report formatter both hosts use. Exports `createAgent`, `parseCreateAgentInput` (flag form or free text), `parseCreateAgentArgs`, `tokenizeArgs`, `extractBenchmarks`, `applyExtraBenchmarks`, `formatBenchmarks`, `formatArchetypes`, `formatCreateAgentReport`, `CREATE_AGENT_USAGE`, and the request/result types. |
| `src/agent-remove.ts` | `/remove-agent` core: delete an agent `.md` and its role, plus the shared flag parser and report formatter. Exports `removeAgent`, `parseRemoveAgentArgs`, `formatRemoveAgentReport`, `REMOVE_AGENT_USAGE`, and the request/result types. Refuses shipped default roles. |

### `src/explorer/`

| File | Role / key exports |
|---|---|
| `src/explorer/boot.ts` | Shared explorer launcher: bind/port fallback, lock-file roles, browser open, close. Exports `startExplorer`, `EXPLORER_DEFAULT_PORT`, and the `ExplorerHandle`/`ExplorerBootOpts` types. Used by `/explore-roles`. |
| `src/explorer/server.ts` | Zero-dependency HTTP surface (static SPA + JSON API). Exports `createExplorerServer` and the `ExplorerOpts` type. Endpoints: `GET /api/bootstrap`, `POST /api/rank`, `POST /api/explain`, `POST /api/export`, `POST /api/refresh`. |
| `src/explorer/explain.ts` | Pure explanation layer: rank rows with baseline deltas, per-model decomposition, inverse-cardinal targets. Exports `rankRows`, `explainModel`, `inverseCardinal`, `METRIC_META`, `WEIGHTABLE_METRICS`, and the `RankRow`/`Explanation`/`Contribution`/`Closing`/`MetricMeta` types. |

### Assets and non-code

| Path | Role |
|---|---|
| `src/prompts/agent-creation-architect.md`, `src/prompts/agent-creation-user.md` | omp's architect prompts, shipped verbatim; read by `src/agent-architect.ts` via `new URL("./prompts/…", import.meta.url)`. |
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
| `docs/dev/spec.md` | Normative spec (moved from the repo root). |
| `docs/dev/architecture.md`, `docs/dev/data-sources.md` | This file and the data-source map. |
| `tests/` | `node --test tests/` fixtures (tier gate, variant resolution, config edit, hysteresis, chain pruning, chain suffixes, explorer, role creation, writing metric, thinking-price, openrouter-blend, agent disable, agent pins, settings schema, session model, role lock, role enable, probe gate, create-agent, create-role, **remove-agent**). |
| `docs/llm-role-rankings.md` | Generated report (regenerate with `--out`); the README's worked example. |
| `cache/*.json` | Daily UTC caches (gitignored; see [`data-sources.md`](data-sources.md)). |

## Data flow

One pipeline, driven by `runUpdater(trigger, deps, opts)` in `src/updater.ts`.
The omp extension injects the production `Deps`; tests inject fakes.

1. **Trigger.** `session_start` (awaited, day-gated) or `/refresh-roles`
   (forced). `runUpdater` loads `loadState()` and the raw
   settings (`deps.getSettings?.() ?? readPluginSettingsMap()`), then
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
   cached per run). Blocked candidates are excluded and recorded on the decision.
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
`applyDesignPercentiles`) → writing (`loadWritingScores` → `applyWritingScores`).
`computeRankings` then calls `rankRole` per role, which uses `cardinalMetric`,
`roleLambda`, `thinkingPriceFactor` and `CAPABILITY_FILL`; `paretoFrontier`
marks the report's `★` rows.

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

The one deliberate exception is `src/agent-architect.ts`: it imports
`@oh-my-pi/pi-coding-agent` (the **package root** only — subpath imports do not
resolve in the compiled binary) and is therefore **extension-only**. The tests
import `src/agent-create.ts`, which never imports the architect.

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
  `session_shutdown` (closes the explorer handle).
- **CLI**: `src/cli/llm-role-rank.ts` (report), `src/cli/create-role.ts`
  (authoring). The updater and explorer have no CLI shim — they run through
  `/refresh-roles` and `/explore-roles`.

## Engine refactor contract

`src/engine.ts` is the shared engine; `src/cli/llm-role-rank.ts` is a thin CLI over it.

- `loadRankData(opts?: { refresh?; url?; roles? }): Promise<RankData>` — the
  per-source cache → fetch → stale-cache chain. `opts.roles` names the roles the
  caller will rank: a role-exclusive source is fetched only when some role
  weights its metric — Design Arena (`website`) and the writing leaderboard
  (`writing`). `undefined` = fetch all (what the explorer passes).
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
  `src/agent-architect.ts`; they are not importable from omp.
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
  against `KNOWN_METRICS`, not against `weights`.
- **`model:` is always the chain `@<role>, @default`** — a bare `@<role>` is a
  literal pattern when the role is absent and hard-fails.
- **`thinking` is not written into agent frontmatter** — the role's `thinking`
  field already sets and prices the effort.
- **The engine is the only ranking math.** The explorer never reimplements
  `value = q − λ·$/M`; it calls `rankRole`/`explainModel`.
