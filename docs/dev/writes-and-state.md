# Writes and state

Maintainer reference for the plugin's write path and the files it owns.
Implementation: `src/config-edit.ts` (the edit), `src/state.ts` (the files),
`src/updater.ts` (orchestration), `src/agent-pins.ts` (the pin-derived sync).

## The surgical config edit

`patchConfig(configText, patch)` (`src/config-edit.ts`) rewrites
`~/.omp/agent/config.yml` as **text**, line-oriented — no runtime YAML
dependency (required for marketplace installs). omp hot-reloads `config.yml`
(task/eval preflight re-reads the settings) and writes it under its own
`config.yml.lock`, so the plugin's mtime guard and refresh lock are what keep a
concurrent omp write from being clobbered. It touches exactly three surfaces:

- `modelRoles.<role>` values (upsert missing roles at the block end, two-space
  indent; delete the line for a role that left the managed set);
- the managed keys inside `retry.fallbackChains` (replace-in-place, never
  duplicate a YAML key; prune keys the plugin wrote on a previous run and no
  longer references). A pinned role's chain key is the level-free form of its
  selector and carries the `@<slug>` pin (`openrouter/<id>@<slug>`); the pin
  rides before the thinking suffix on the values;
- the plugin-managed names in `task.disabledAgents` (add/remove, other entries
  and their order preserved).

Everything else — comments, blank lines, unknown keys — stays byte-identical.

Rules the algorithm enforces:

- **Managed lines only.** `parseConfig` reads back only the surfaces the plugin
  owns; `patchModelRoles` / `patchFallbackChains` / `patchDisabledAgents` edit
  only those lines.
- **Double-quoted values.** Every emitted value is `"…"` (`quote`).
- **Semantic no-op detection.** A role line whose parsed value already equals
  the new selector (any quoting/comment style) is left byte-identical; a chain
  whose item run already equals the new values is left untouched. A no-change
  run therefore produces a zero-byte diff and never touches the config mtime.
- **Structural validation.** `assertTopLevelBlockStyle` rejects flow-style/JSON
  documents; `findTopLevel` rejects inline values, indented-only blocks and
  duplicates; `chainEntries` rejects odd indents, duplicate chain keys and
  unexpected lines. Any surprise throws `ConfigEditError` and the caller aborts
  without writing. **Exception — an empty managed collection is not a
  surprise.** omp re-serializes `config.yml` through its own writer (Bun's
  `YAML.stringify` via `stringifyYamlConfig`), which spells an empty collection
  either as a null token on the key line (`task.disabledAgents: null`) or as a
  flow collection on its own indented line (`fallbackChains:` then `    {}`,
  `task.disabledAgents:` then `    []`). Both read as the empty collection, and
  the patch path rewrites that placeholder line into the block form
  (`disabledAgents:` + `- "designer"`) instead of refusing the run — a user's
  `disabledAgents: null` used to abort every session start with `config edit
  refused` (issue #54). Any *other* inline value on a managed key line
  (`disabledAgents: ["x"]`) still throws. The rule applies at both levels: a
  managed key's own placeholder (`task.disabledAgents:` + `    []`) **and** an
  empty **parent** block (`task:` + `  {}`, `retry:` + `  {}`), where the new
  child key replaces the `{}` line — inserting *after* it emits YAML no parser
  accepts, while the read-back self-check still passes, so that corruption was
  silent. A prune-only patch creates no key at all.
- **Blocks are bounded by their own indent.** `blockEnd(lines, key, indent)`
  stops at the first line at or above the key's indent, so `chainEntries` sees
  only the `fallbackChains` block. A sibling `retry.<other>` key — omp ships ten
  (`retry.maxRetries`, `retry.enabled`, `retry.baseDelayMs`, …) and writes them
  into the same `retry:` block — therefore ends the block instead of throwing
  `unexpected line in fallbackChains block`, and a new chain key is appended
  inside the block rather than after it.
- **Read-back self-check.** After patching, `patchConfig` re-reads the patched
  text through the same line-oriented reader and asserts it equals the intended
  state (every upserted role, every removal, the exact chain-key set, every
  disabled-agent add/remove). On any mismatch it throws — never corrupt.
- **Atomic write.** `writeConfigAtomic(path, patchedText, mtimeBefore)` re-stats
  the mtime first; a changed mtime means the config moved underneath and returns
  `"conflict"` (the caller re-reads and recomputes). Otherwise it `mkdir -p`s the
  target's directory, writes `<path>.llm-role-tmp` and `rename`s over the target.
  A file absent at read time (`mtimeBefore === 0`) is writable only while still
  absent. The `mkdir -p` is what lets the project scope write into
  `<cwd>/.omp/plugins/`, which omp does not create until something writes there.
- **3-attempt mtime retry.** `writePatch` (`src/updater.ts`) loops up to
  `CONFLICT_RETRIES = 3`: read → patch → atomic write; a `"conflict"` retries,
  three conflicts abort with `CONFLICT_ABORT`.
- **Lock.** The whole read-patch-write runs under the advisory refresh lock
  (below); a lock it cannot acquire returns `"locked"` and the caller aborts
  (or no-ops, for the day-gated sync).

## The settings lock file and the feature flags

The plugin's settings live in `~/.omp/plugins/omp-plugins.lock.json` →
`settings["omp-llm-role"]` (or the project lock in project mode). The write path
(`src/role-settings.ts`) stores every role key as a **flat dotted key** because
omp's `/settings` Plugins tab shallow-merges the settings object and does not
flatten nested objects. The capability flags join that set:

- `features.<id>` — the global flag for capability `<id>`;
- `roles.<role>.features.<id>` — the per-role flag (wins over the global in
  either direction);
- `roles.<role>.preferOwnProvider` — the `providerPinning` policy field.

`mergeExport` writes these as flat dotted keys alongside the existing role keys
(`roles.<name>.weights.<metric>`, `.description`, `.enabled`, `.locked`,
`.required`, `.thinking`, `.providerPin`, `.cacheHitRate`, `.lambda`,
`.filters.image`). `mergeExport` first deletes the role's existing
`roles.<name>.*` flat dotted keys, so an Export means "make this role's keys
match this def" — a capability flag set back to inherit (or a cleared knob) is
removed rather than left stale. `mergeRemove` needs no change: its existing
`roles.<name>.` prefix already covers the new keys, so `/remove-agent` deletes
them.

**Validation aborts** (notify, no write), in the existing one-error-string-per-
violation style (`resolveSettings` in `src/settings.ts`):

- `features.<id> is not a known capability` / `role <name>: features.<id> is not
  a known capability` — an unknown id, global or per-role;
- `features.<id>: must be a boolean, got <json>` / `role <name>: features.<id>
  must be a boolean, got <json>` — a non-boolean flag value;
- `features: must be an object, got <json>` / `role <name>: features must be an
  object` — a non-record `features`;
- `role <name>: preferOwnProvider must be a boolean, got <json>` — a non-boolean
  policy field.

**`mergeRawSettings` does NOT expand.** `resolveSettings` calls
`expandFeatures` per role, so its `roles` map is the **effective** def (the
authored def with the enabled flags' recommended knobs filled in, `features`
stripped). `mergeRawSettings` — and therefore `roleUniverse(...).def` — keeps the
**authored** def (shipped ⊕ raw overrides, no preset, `features` retained),
because that is the def the explorer edits and exports. Expanding inside
`mergeRawSettings` would make a role whose only authored change is a flag read as
dirty against its own baseline, and `mergeExport` (which writes every key of a
dirty def) would persist the expanded knobs as explicit values — silently
converting the flag into hard values and defeating both "adjust by hand" and
re-applying a changed recommendation. Export writes the **flag**, never the
expanded values.

**Near-collision warning.** omp's plugin-level `enabledFeatures` (present in the
lock file, `null` by default) is a **different gate** — omp's own feature
gating — that this plugin never reads (zero occurrences in `src/`, `web/`,
`tests/`). The plugin's `features.<id>` keys are plugin settings, not omp
feature flags; do not merge the two.

## The provider-pin auto-configuration (spec #58)

When a role's **expanded** def sets `preferOwnProvider: true` (the
`providerPinning` capability's recommended bundle) and carries **no** manual
`providerPin`, the updater binds the role's requests to the chosen model's best
route by writing that route's provider slug as the selector's `@<slug>` suffix:

```
openrouter/<id>@<slug>:<level>
```

omp's `splitUpstreamRouting` parses the trailing `@<slug>` and applies
`compat.openRouterRouting = { only: [slug] }`, so the price the ranking assumed
is the price the request pays. The slug is `bestRoute(chosenModel, def)`'s
`providerSlug` — the value-max candidate route (see scoring.md, *Capability
presets*). The pin is re-derived on every run, so it follows the ranking when the
chosen model changes. A manual `roles.<role>.providerPin` **wins** over the
automatic choice and stays a **hard** gate (a model with no matching route is
ineligible); clearing it resumes the automatic choice.

**Chain shape.** The primary's chain key is the selector minus the trailing
`:level` — so it **includes** the pin (`openrouter/<id>@<slug>`). Its values, in
order:

1. the same model on **every** gate-passing route except the pinned best, in
   route-value order,
2. then, for each of the `fallbackChainDepth` fallback models, that model on
   **every** gate-passing route, in route-value order.

Length = `(R_primary − 1) + Σ R_fallback`, where `R` is the number of distinct
gate-passing provider slugs for that model — data-driven, not a fixed cap.
Entries dedup by chain value, so two routes sharing a provider slug collapse to
one. Every entry carries the same `@<slug>` suffix (and the role's thinking level
where the target advertises it). A model with no gate-passing route contributes
nothing. The gates are the engine's `rankedRoutes` set: non-degraded
(`status === 0`), the endpoint capability filters (`tools` / `minContextTokens` /
`minOutputTokens`), a usable billed price, and the `maxPriceUsdPerM` cap
(thinking-adjusted). The allowed-providers whitelist is not a `rankedRoutes`
filter: the updater prunes each model's route pool to allowed providers before
ranking, which is what makes `rankedRoutes` whitelist-aware. The probe walk
target is unchanged (`1 + fallbackChainDepth` — it counts models, not routes).

**Prune on a pin change.** Because the chain key includes the pin, a pin change
changes the key; the updater's chain prune (`state.pluginWrittenChainKeys`) drops
the old key so a stale pinned chain does not linger.

**No-ops.** The auto-pin writes nothing when: the capability is off
(`preferOwnProvider` not `true`); a manual `providerPin` is set; the role is
locked or disabled; the selector is not an OpenRouter selector; the model has no
route data; no route passes the role's endpoint filters; or the best route has no
usable billed price. With the capability off the written config is byte-identical
to before.

## State, history, lock

All under the agent dir (`agentDir()` in `src/state.ts`), next to the config
they describe. Agent-dir resolution: `OMP_LLM_ROLE_AGENT_DIR` (test hook) →
`PI_CODING_AGENT_DIR` → non-default `OMP_PROFILE` → `~/.omp/agent`.

**Project scope (issue #27).** `runUpdater` resolves the project dir as
`<cwd>/.omp` (omp's project dir, no walk-up). When
`<cwd>/.omp/plugins/omp-plugins.lock.json` carries a non-empty `omp-llm-role`
settings entry, the whole run is scoped to the project: the config
(`<cwd>/.omp/config.yml`), the settings read (project lock over the user-level
one), and the state/history/lock files all live under `<cwd>/.omp`. The global
`~/.omp/agent/config.yml` is **never** written in project mode. Without a project
settings entry the global behavior is unchanged.

| File | Shape | Purpose |
|---|---|---|
| `llm-role-state.json` | `{ lastRunDay, managedRoles, roleLastSelector, pluginWrittenChainKeys, previousModelRoles, managedDisabledAgents }` | day gate, managed-role set, last selectors, plugin-owned chain keys, pre-write `modelRoles` snapshot, **managed `task.disabledAgents` names** |
| `llm-role-history.jsonl` | one JSON row per completed run: `{ ts, trigger, keyMeta{isFreeTier, limitRemaining, creditsRemaining}, decisions[] }` | append-only decision log |
| `llm-role-projects.json` | `{ projects: [{ root, lastUsed }] }` | the plugin's memory of the projects where `/project-roles` was used (the explorer's scope list) |
| `.llm-role-refresh.lock` | `O_EXCL` create, holds `"<pid> <iso>"` | serializes concurrent session starts; stale (> 60 s) locks are unlinked and retried once |
| `llm-role-error-reports.json` | `{ reports: [{ fingerprint, label, title, firstSeen, lastSeen, createdDay?, offeredDay?, count, action, issueNumber?, issueUrl? }], dayCount: { day, count } }` | what the opt-in `errorReporting` path filed, offered or suppressed |

- `llm-role-projects.json` (issue #28) is **global knowledge** and lives in the
  agent dir, never a project's `.omp`. `registerProject(root)` (`src/project-registry.ts`)
  upserts the root (stamped now) and prunes entries whose project lock file is
  gone, then replaces the file atomically (temp + rename) so two sessions in
  different repos cannot interleave into a corrupt file. Reading is pure and
  tolerant: a missing or unparseable file yields `[]`. The write point is the
  project-aware `runUpdater`, **immediately after `resolveProjectDir()` and
  before any early return**, guarded only by `dryRun` — so a day-stamped no-op
  session start still registers the project (the whole point of "projects
  configured before this feature appear on their next session start"), while a
  `--dry-run`/cancelled `/project-roles` registers nothing. A write failure is
  logged, never thrown: the registry is a convenience index, not a run
  prerequisite.

- `llm-role-error-reports.json` is the ledger of the opt-in error-reporting path
  (`src/error-report.ts`, `ERROR_REPORT_LEDGER_FILE`) — the plugin's memory of
  what it filed, offered or suppressed. Like `llm-role-projects.json` it is
  **global knowledge** and lives in the agent dir, never a project's `.omp`; the
  write point is `writeLedger` (temp file + `rename`, so two sessions cannot
  interleave into a corrupt file) and reading is pure and tolerant — missing,
  unparseable or unexpected-shape content yields an empty ledger, so a corrupt
  ledger never blocks reporting or the run. Each `reports[]` row remembers one
  fingerprint's `action` (`created`/`commented`/`offered`/`suppressed`), its
  `issueNumber`/`issueUrl`, the `createdDay`/`offeredDay` that gate re-creation
  and re-offering, and a `count`; `dayCount` tracks the UTC-day creation total
  that feeds the 3-creations-per-day cap. Nothing is written when
  `errorReporting` is `off`.

- `previousModelRoles` is the full snapshot of the last `modelRoles` block
  **before** the plugin changed it — a manual rollback aid; there is no rollback
  command.
- `pluginWrittenChainKeys` is what makes chain pruning safe: only keys the
  plugin wrote on a previous run are candidates for pruning; an owner-written,
  unreferenced key is left alone.
- `managedRoles` drives `roleRemovals`: a role the plugin managed on a previous
  run but no longer does (disabled via `enabled: false` / `weights: null`, or
  removed from settings) has its `modelRoles.<role>` line deleted, so a stale
  pin cannot keep routing `@<role>`. A role whose provider pin matched no route
  joins `managedRoles` without a rewrite, so its current chain survives the
  prune.
- `managedDisabledAgents` is the set of agent names the plugin added to
  `task.disabledAgents`; a later run removes a name whose agent file is gone
  (e.g. `/remove-agent`) or whose role is no longer disabled.
- Each `decisions[]` entry carries `availabilitySource` (`"keyed-catalog"` when the
  keyed catalog was active for that role, else `"probe"`) and `keyBlockedCount` (the
  candidates pruned as key-blocked). The keyed-blocked set itself is deliberately
  **not** enumerated — it can be hundreds of ids; `blocked[]` keeps its old meaning,
  the probe-blocked ids examined in the walk. `endpointBlocked[]` records the ranking
  ids the role's endpoint filters dropped (no capable standard-tier route), rendered
  `; endpoint-blocked: …` on the decision line; `pinBlocked[]` records the ranking ids
  the role's provider pin dropped (no route matching the pin), rendered
  `; pin-blocked: …`.
- Role removal (`/remove-agent`) goes through `removeRoleSettings` in
  `src/role-settings.ts` — the same validate/backup/atomic-write path as
  `writeRoleSettings`, deleting the role's flat dotted keys and any nested entry.
- `loadState` starts fresh (and logs) on an unreadable or unexpected-shape state
  file; `saveState` / `appendHistory` `mkdir -p` the dir first.

## The day gate

`runUpdater` (`src/updater.ts`) is day-gated on `state.lastRunDay === today(UTC)`:
the first session of each UTC day ranks and writes; later same-day sessions
no-op. `/refresh-roles` passes `force` and always runs.
A concurrent second starter loses the lock and finds the day already stamped →
no-op. Session-start runs are **awaited** before the first prompt is dispatched
(a deferred timer would be cleared when a short-lived session exits before it
fires). The gate is **per scope**: a project run loads the project's own
`llm-role-state.json`, so a project and the global config each refresh once a day.

## `task.disabledAgents` sync (pin-derived, not day-gated)

`agentDisablePatch` (`src/updater.ts`) + `discoverAgentPins`
(`src/agent-pins.ts`) keep each discovered agent in `task.disabledAgents`
exactly while the role its `model:` frontmatter chain pins is disabled:

- `parseAgentPin` takes the first `@<role>` in the `model:` value
  (`model: "@designer, @default"` → `designer`); a file with no `model:` line or
  a literal model id pins nothing and is left alone.
- `discoverAgentPins` scans the shipped `agents/` dir, the user dir
  (`~/.omp/agent/agents/`) and the project dir (`<project>/.omp/agents/`); a
  name in several scopes resolves to the most specific (project > user >
  plugin), matching omp's own lookup. Reserved names are skipped.
- An agent pinning a role the plugin does not know (its `@role, @default` chain
  falls back) is left alone; other `task.disabledAgents` entries and their order
  are preserved.
- **A previously-managed name whose agent file is gone (e.g. `/remove-agent`) or whose role is no longer disabled is removed** from `task.disabledAgents`.

**This sync is not day-gated.** It runs on every session start (and on every
forced run), so enabling/disabling a shipped role takes effect on the next
session, not the next day. Two consequences a maintainer must know:

- **A zero-decision run can still rewrite `task.disabledAgents`.** When the day
  is already stamped, `runUpdater` still calls `writePatch` with only the
  agent-disable patch — so the config mtime can move even when no role changed.
  (A truly no-op sync — nothing to add or remove — still produces a zero-byte
  diff and no mtime change.)
- **The non-day-gated sync appends no history row.** The day-gated branch
  returns before the history append; only a full ranking run writes
  `llm-role-history.jsonl`.
## Error handling

`runUpdater` wraps the whole run; `ConfigEditError` and any other throw become
`omp-llm-role: aborted, no write: <message>`. The aborts split into two classes,
and the `defect` column below marks which ones `RunResult` flags: an **exception
abort** (a bug this plugin should fix) carries `defect` and, when the opt-in
`errorReporting` setting is on, is reported through `src/error-report.ts`; an
**enumerated environment abort** (an expected condition) leaves `defect` unset
and is notify-only. Abort paths and what each leaves untouched:

| Failure | Behavior | State / config | `defect` |
|---|---|---|---|
| Settings validation fails | abort, notify the offending role/key | no write, no state change | — |
| Ranking data unavailable (fetch fails, no fresh cache) | abort, notify | no write, no state change | — |
| Key fetch (`omp token`/registry) or `/api/v1/key`, `/api/v1/credits` fails | abort, notify | no write, no state change | — |
| Catalog fetch fails | abort, notify | no write, no state change | yes |
| Both tier branches false (no budget, no free quota) | abort, notify | no write, no state change | — |
| Lock not acquired | abort (`LOCK_ABORT`) | no write, no state change | — |
| Write conflict after 3 retries | abort (`CONFLICT_ABORT`) | no write, state file untouched | — |
| `patchConfig` structural surprise / self-check mismatch | abort (`config edit refused: …`) | no write, no state change | yes |
| Any other throw inside the run (the catch-all) | abort, notify | no write, no state change | yes |
| Zero decisions changed | no write at all (config mtime untouched) | history row appended (full run) | — |
| Dry run | decisions reported, nothing written | no day-gate stamp, no history row | — |

- **`defect` vs the enumerated aborts.** The enumerated environment aborts —
  settings invalid, ranking data unavailable, tier `none`, lock, write conflict
  and the key-fetch failure — are conditions of the user's machine or account,
  not plugin defects, so `runUpdater` returns them without `defect` and the
  extension does not report them. Only the exception aborts carry `defect` (the
  message), and the extension's `reportDefect` helper routes it to
  `reportUnexpectedError`. A command handler that throws *outside* `runUpdater`
  (the six catch sites) is reported the same way via `reportCommandError`.

- The day-gated agent sync's lock/conflict failures are handled separately: a
  lock it cannot acquire is benign (`{ decisions: [], wrote: false }`); a
  conflict aborts with `CONFLICT_ABORT`.
- A role whose probed candidates are all blocked is left untouched with a notify
  note (not an abort). A role whose provider pin matches no route is likewise
  left untouched — no selector or chain upsert — with a notify note naming the
  role and the pin.
- The live-session model hook (`applySessionModel`) runs only after a real write
  and only on a real `default` change; a hook failure is notified but never
  fails the run (the config write already succeeded).
