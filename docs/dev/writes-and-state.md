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

**`tokenProfile` (spec #81).** A global setting (`tokenProfile.inputTokens` /
`tokenProfile.outputTokens`, flat dotted keys like the rest) — the per-task
token profile the explorer's `$/task` column falls back to when a role has no
recorded usage. `null` (the default) = unset, and the column reads `—`. It is
validated to `null` or a record whose two fields are finite numbers ≥ 0
(`tokenProfile: must be null or an object with inputTokens/outputTokens` /
`tokenProfile.<key>: must be a number >= 0`). It is **display-only**: it never
feeds the ranking, the reported `$/M` price, or any write. The recorded usage
takes precedence over it (`resolveTokenProfile`), so once a role has ledger rows
the setting is ignored for that role.

## The provider-pin auto-configuration (spec #58, routability-verified by #90)

When a role's **expanded** def sets `preferOwnProvider: true` (the
`providerPinning` capability's recommended bundle) and carries **no** manual
`providerPin`, the updater binds the role's requests to one provider route by
writing that route's slug as the selector's `@<slug>` suffix:

```
openrouter/<id>@<slug>:<level>
```

omp's `splitUpstreamRouting` parses the trailing `@<slug>` and applies
`compat.openRouterRouting = { only: [slug] }`. The pin is the best route **the
probe accepts**, which is the route the role was priced on — the route the walk
tries first — so the price the ranking assumed is the price the request pays
*only while the walk does not skip that candidate*; a skipped candidate means the
route that replaced it pays, at its own price. The pin is re-derived on every
run, so it follows the ranking when the chosen model changes.

**The walk — the pin is probed before it is written.** The slug is **not** the
score-max route unconditionally: the updater walks the role's route order
(`rankedRoutes(chosenModel, def)` — the `vfm` order the chain also uses; see
scoring.md, *Route ordering*) and probes each candidate with `probeRoute`: a
one-token completion carrying `provider: { only: [slug] }`, the same request
skeleton and the same narrow no-allowed-providers pattern as `probeModel`. The
verdict vocabulary is `probeModel`'s:

- `blocked` — the narrow no-allowed-providers 404 — skips the route and the walk
  continues to the next candidate;
- `ok` and **`unknown` are both usable**. A non-404 status (a 429, a 5xx), a 404
  whose body does not carry the pattern, and a transport throw (a timeout, a
  connection reset) are all `unknown`: a transient blip must never silently unpin
  a role, and a rate limit is omp's runtime-fallback domain, not this plugin's.

Verdicts are cached per run by `catalogId@slug`, so a route shared by several
roles is probed once, and the walk is capped per role at **`ROUTE_PROBE_BUDGET =
12`** *new* probes (cached verdicts are free) — a pathological pool must not turn
the daily update into a long probe walk.

**Why a real request.** OpenRouter's endpoints API and its routing table
disagree: an endpoint can list `status: 0` with a full `supported_parameters`
list and 100 % uptime, pass the whitelist gate and carry a usable billed price,
and still 404 for `provider.only` — and the exclusion is dynamic (the same
request can succeed minutes later). The routing table is visible only in the 404
body of a request that failed, so a request is the only reliable signal. This is
exactly the failure the endpoint gates cannot see (spec #90: the live config held
`deepseek/deepseek-v4.1-flash@relace`, which 404'd on every revert).

**No routable candidate → no pin.** If every candidate is `blocked` (or the
budget runs out with no clean candidate), no pin is written: the selector stays
**bare** and OpenRouter routes the request itself, instead of omp failing on an
unroutable `@<slug>`. `Decision.pinDropped` is true in that case (see *State,
history, lock*), and the run notes it.

A manual `roles.<role>.providerPin` **wins** over the automatic choice and stays
a **hard** gate (a model with no matching route is ineligible). It is **never
probed and never replaced** — the probe applies only to the route the capability
itself chooses; clearing the manual pin resumes the automatic choice.

**Chain shape.** The primary's chain key is the selector minus the trailing
`:level` — so it **includes** the pin (`openrouter/<id>@<slug>`, or the bare
`openrouter/<id>` when the pin was dropped). Its values, in order:

1. the same model on **every** gate-passing route except the pinned route, in
   score order (the `vfm` route score desc — see scoring.md, *Route ordering*),
2. then, for each of the `fallbackChainDepth` fallback models, that model on
   **every** gate-passing route, in score order.

**Which models are chained (spec #95).** The `fallbackChainDepth` fallback
**models** come from the role's whole **ranked candidate list** — the
tier-eligible ranking rows, in value order — not from the probe window (which is
`1 + fallbackChainDepth` models, the same size as the chain, so a reorder of it
can never reach a cheaper model at rank 4 or deeper). Two classes of candidate
are excluded, with the same predicates the probe walk uses: **key-blocked**
models (the account's key cannot use them) and models whose probe verdict is
`blocked`. An **unprobed** candidate stays — the chain's deeper entries are
never probe-verified (they are not a new class: chain entries are already
route-level unprobed, and omp fails over on an unroutable entry). `after` is
that list **below the chosen model** — the value leader on a fresh pick in
`value` mode, the bar-clearing pick on a fresh pick in `cheapest` mode, the kept
current candidate on a kept role (`kept-eligible` / `kept-margin`) — so the
`after` set and the floor both key off the model the selector actually names —
the previous `pool.slice(chosenIdx + 1)` keyed off the same index in the
probe-clean pool — and candidates ranked above the chosen are never chained. The
set is then split:

```
cheaper = after where priceEff <= chosen.priceEff AND q >= chosen.q · fallbackQualityFloor
pricier = after where priceEff > chosen.priceEff            (never floor-filtered)
chain   = [...cheaper, ...pricier].slice(0, fallbackChainDepth)
```

so a cheaper-or-equal fallback keeps the role's quality (the floor is a fraction
of the chosen model's **own** `q`, so it reads the same on every role's quality
scale) and a cheap-but-weak candidate set cannot starve the chain (the pricier
bucket always fills any remaining depth with the next-best by value). Both
buckets keep value order, so a cheaper candidate deep in the ranking is reached
only when fewer than `fallbackChainDepth` cheaper-or-equal candidates clear the
floor — a bounded search, not a cheapest-first sort. A candidate priced exactly
at the chosen model's price whose `q` is below the floor is in **neither** bucket
and drops out. `fallbackQualityFloor` (a number in `[0, 1]`, default `0.9`; `0`
disables the floor, `1` requires an exact quality match — validated, never
silently clamped) is documented in the README's settings table. The floor gates
**chain membership only**: the primary choice, the hysteresis decision, the
ranking, the probe walk's stop condition and budget, the chain key, the route
expansion, the thinking levels, the dedup and the prune-on-pin-change are all
unchanged.

The exclusion is **by pinned slug, not by position**: the probe can pin a route
other than the score leader (so the leader rides as a fallback entry while the
pinned route does not), and with a **dropped pin** (the auto-pin applied, but no
candidate was routable) **no** route is excluded — the primary contributes every
gate-passing route. Length = `(R_primary − 1) + Σ R_fallback`, or `R_primary + Σ
R_fallback` with a dropped pin, where `R` is the number of distinct gate-passing
provider slugs for that model — data-driven, not a fixed cap. Entries dedup by
chain value, so two routes sharing a provider slug collapse to one. Every entry
carries the same `@<slug>` suffix (and the role's thinking level where the target
advertises it).
**Chain entries are not probed** — only the primary pin is: the chain carries
many routes and one unroutable entry is survivable (omp fails over), so probing
it would multiply the request cost for no benefit (out of scope, spec #90). A
model with no gate-passing route contributes nothing. The gates are the engine's
`rankedRoutes` set: non-degraded
(`status === 0`), the endpoint capability filters (`tools` / `minContextTokens` /
`minOutputTokens`), a usable billed price, and the `maxPriceUsdPerM` cap
(thinking-adjusted). The soft `filters.preferredMinThroughput` floor is a
**preference, not a gate** — it sorts below-floor routes last but never drops
them, so a below-floor route still appears in the chain. The allowed-providers
whitelist is not a `rankedRoutes` filter: the updater prunes each model's route
pool to allowed providers before ranking, which is what makes `rankedRoutes`
whitelist-aware. The probe walk target is unchanged (`1 + fallbackChainDepth` —
it counts models, not routes).

**Outside the auto-pin.** The chosen model contributes nothing when the auto-pin
does not apply: with a manual `providerPin` (`autoPinApplies` is false, so the
route probe does not run either) or with the capability off, the chain carries
**one entry per `fallbackChainDepth` fallback model** —
`openrouter/<fallbackId>@<manualSlug>` with a manual pin, the bare
`openrouter/<fallbackId>` with none — each with the role's thinking level where
the target advertises it, and no route of the chosen model at all.

**Prune on a pin change.** Because the chain key includes the pin, a pin change
changes the key; the updater's chain prune (`state.pluginWrittenChainKeys`) drops
the old key so a stale pinned chain does not linger.

**No-ops.** The auto-pin writes nothing — and **the route probe is never
consulted** — when: the capability is off (`preferOwnProvider` not `true`); a
manual `providerPin` is set; the role is locked or disabled; the selector is not
an OpenRouter selector; the model has no route data; no route passes the role's
endpoint filters; or no candidate has a usable billed price (the last three leave
`rankedRoutes` empty, so there is no candidate to probe, and `pinDropped` stays
false — the pin is simply absent). The case where the model *has* candidates but
none is routable is different: that is the **dropped pin** above — still no pin,
but recorded (`pinDropped`). With the capability off the written config is
byte-identical to before.

## The selection decision (spec #103)

The per-role selection step (`src/updater.ts`) names the model the selector
writes. Two settings choose the rule: `selection` (`"value"` default, or
`"cheapest"`) and `qualityFloor` (a number in `[0, 1]`, default `0.9`, inert in
`"value"` mode); a role's own `roles.<role>.selection` / `roles.<role>.qualityFloor`
overrides the global. The rule and its math are in scoring.md, *Selection rule —
the cheapest model above the bar*; this section is the write path's view.

`"value"` mode (the default) is unchanged: the pool leader is the value leader
and the hysteresis ladder is `switchMargin`-first. `"cheapest"` mode replaces the
objective with the cheapest candidate at or above `qualityFloor × anchor.q`
(anchor = the pool's highest-`q` candidate). The decision table itself lives
there (a fact has one home); the write-path-specific facts are:

- the reason vocabulary is unchanged — no new `DecisionReason` — but `switched`
  now also means "the incumbent fell below the bar" (dropped with no margin), and
  the kept branch re-checks the bar;
- the primary hysteresis is **cost-side only** in this mode: `switchMargin` is
  **not consulted**; `priceSwitchFraction` (default `0.5`) is the only margin,
  and `0` disables the cost-side switch;
- the value ranking is still computed and still reported in the decision's
  `value` / `bestValue` / `currentValue` fields, so history rows stay comparable
  across modes.

The rule's pool is the role's **usable candidate set** (catalog/tier gate +
allowed-providers prune + keyed-catalog prune) — not the probe window; the pick
is probe-verified on demand (a blocked pick falls through to the next-cheapest
bar-clearing candidate). The fallback chain, the auto-pin, the route expansion,
the thinking levels and the prune-on-pin-change are unchanged; a locked role and
a disabled role are untouched, and a manual `providerPin` keeps its **hard-gate**
meaning — the rule picks within the pin-eligible pool (never the value leader),
and a model with no matching route is ineligible. An empty or all-key-blocked
pool leaves the role untouched. The two floors are **not merged**:
`fallbackQualityFloor` (below) gates chain membership only; `qualityFloor` gates
the primary choice only.

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
| `llm-role-history.jsonl` | one JSON row per completed run: `{ ts, trigger, keyMeta{isFreeTier, limitRemaining, creditsRemaining}, decisions[], switchMargin? }` | append-only decision log |
| `llm-role-usage.jsonl` | one JSON row per assistant turn: `{ ts, role, model, provider, input, output, cacheRead, cacheWrite, cost }` | the per-role usage ledger (spec #81) the explorer's per-task price resolves its token profile from |
| `llm-role-projects.json` | `{ projects: [{ root, lastUsed }] }` | the plugin's memory of the projects where `/project-roles` was used (the explorer's scope list) |
| `.llm-role-refresh.lock` | `O_EXCL` create, holds `"<pid> <iso>"` | serializes concurrent session starts; stale (> 60 s) locks are unlinked and retried once |
| `llm-role-error-reports.json` | `{ reports: [{ fingerprint, label, title, firstSeen, lastSeen, createdDay?, offeredDay?, count, action, issueNumber?, issueUrl? }], dayCount: { day, count } }` | what the opt-in `errorReporting` path filed, offered or suppressed |

- `switchMargin` is present on a history row **only** when a per-run override was
  active — today that is `/refresh-roles --no-margin` (spec #99), which passes
  `0`; the field records the effective margin the run's hysteresis used, so a
  margin-free run is distinguishable from a normal one in the append-only log.
  The same fact shows in the run's notification as a note line
  (`switchMargin ignored for this run (--no-margin)`). The override never reaches
  the lock file or `llm-role-state.json`: it is per-run, so the next run records
  no field and uses the configured value.

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

- `llm-role-usage.jsonl` is the per-role usage ledger (spec #81,
  `src/usage-ledger.ts`). Unlike the two ledgers above it is **not** global: it
  follows the plugin's state location — `<cwd>/.omp` in project mode,
  `agentDir()` otherwise — so a project's usage stays separate from the
  user-level profile. The extension records one row per assistant turn on
  `turn_end` and `session_shutdown` (the backstop for a headless one-turn run),
  read from `sessionManager.getBranch()` — the same entries the session jsonl
  persists — into `resolveProjectDir() ?? agentDir()`, deduped by `ts|model` so
  the two hooks cannot double-record. The file is **append-only** (a crash never
  corrupts it) and **bounded**: `appendUsageRow` compacts to the newest
  `USAGE_LEDGER_CAP = 2000` rows via a temp file + atomic rename, so a crash
  mid-compaction leaves the original intact. Recording is **best-effort** — a
  failure never breaks a session, and `appendUsageRow` never throws. Reading is
  tolerant: a missing, unreadable or malformed file degrades to `[]`, and an
  unparseable or wrongly-shaped line is skipped. The explorer reads the active
  scope's ledger (a project scope its own `<root>/.omp`), so the per-task column
  follows the scope.

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
  `; pin-blocked: …`. `routeBlockedSlugs[]` records the provider slugs the auto-pin's
  route probe rejected on the chosen model, in walk order and deduped by slug
  (two routes of one model can share a slug), rendered `; route-blocked: …`;
  `pinDropped` is `true` when the auto-pin applies and the model has gate-passing
  routes but no candidate survived the probe (or the `ROUTE_PROBE_BUDGET` ran
  out), rendered `; pin dropped (no routable route)` — the selector is bare in
  that case. Both are empty/false when no probe ran.
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
