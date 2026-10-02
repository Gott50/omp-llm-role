# Writes and state

Maintainer reference for the plugin's write path and the files it owns.
Normative decisions: [`spec.md`](spec.md) §6.2, §6.4, §8 and §9. Implementation:
`src/config-edit.ts` (the edit), `src/state.ts` (the files), `src/updater.ts`
(orchestration), `src/agent-pins.ts` (the pin-derived sync).

## The surgical config edit

`patchConfig(configText, patch)` (`src/config-edit.ts`) rewrites
`~/.omp/agent/config.yml` as **text**, line-oriented — no runtime YAML
dependency (required for marketplace installs). It touches exactly three
surfaces:

- `modelRoles.<role>` values (upsert missing roles at the block end, two-space
  indent; delete the line for a role that left the managed set);
- the managed keys inside `retry.fallbackChains` (replace-in-place, never
  duplicate a YAML key; prune keys the plugin wrote on a previous run and no
  longer references);
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
  without writing.
- **Read-back self-check.** After patching, `patchConfig` re-reads the patched
  text through the same line-oriented reader and asserts it equals the intended
  state (every upserted role, every removal, the exact chain-key set, every
  disabled-agent add/remove). On any mismatch it throws — never corrupt.
- **Atomic write.** `writeConfigAtomic(path, patchedText, mtimeBefore)` re-stats
  the mtime first; a changed mtime means the config moved underneath and returns
  `"conflict"` (the caller re-reads and recomputes). Otherwise it writes
  `<path>.llm-role-tmp` and `rename`s over the target. A file absent at read
  time (`mtimeBefore === 0`) is writable only while still absent.
- **3-attempt mtime retry.** `writePatch` (`src/updater.ts`) loops up to
  `CONFLICT_RETRIES = 3`: read → patch → atomic write; a `"conflict"` retries,
  three conflicts abort with `CONFLICT_ABORT`.
- **Lock.** The whole read-patch-write runs under the advisory refresh lock
  (below); a lock it cannot acquire returns `"locked"` and the caller aborts
  (or no-ops, for the day-gated sync).

## State, history, lock

All under the agent dir (`agentDir()` in `src/state.ts`), next to the config
they describe. Agent-dir resolution: `OMP_LLM_ROLE_AGENT_DIR` (test hook) →
`PI_CODING_AGENT_DIR` → non-default `OMP_PROFILE` → `~/.omp/agent`.

| File | Shape | Purpose |
|---|---|---|
| `llm-role-state.json` | `{ lastRunDay, managedRoles, roleLastSelector, pluginWrittenChainKeys, previousModelRoles, managedDisabledAgents }` | day gate, managed-role set, last selectors, plugin-owned chain keys, pre-write `modelRoles` snapshot, **managed `task.disabledAgents` names** |
| `llm-role-history.jsonl` | one JSON row per completed run: `{ ts, trigger, keyMeta{isFreeTier, limitRemaining, creditsRemaining}, decisions[] }` | append-only decision log |
| `.llm-role-refresh.lock` | `O_EXCL` create, holds `"<pid> <iso>"` | serializes concurrent session starts; stale (> 60 s) locks are unlinked and retried once |

- `previousModelRoles` is the full snapshot of the last `modelRoles` block
  **before** the plugin changed it — a manual rollback aid; there is no rollback
  command (spec §12).
- `pluginWrittenChainKeys` is what makes chain pruning safe: only keys the
  plugin wrote on a previous run are candidates for pruning; an owner-written,
  unreferenced key is left alone.
- `managedRoles` drives `roleRemovals`: a role the plugin managed on a previous
  run but no longer does (disabled via `enabled: false` / `weights: null`, or
  removed from settings) has its `modelRoles.<role>` line deleted, so a stale
  pin cannot keep routing `@<role>`.
- `managedDisabledAgents` is the set of agent names the plugin added to
  `task.disabledAgents`; a later run removes a name whose agent file is gone
  (e.g. `/remove-agent`) or whose role is no longer disabled.
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
fires).

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
`omp-llm-role: aborted, no write: <message>`. Abort paths and what each leaves
untouched:

| Failure | Behavior | State / config |
|---|---|---|
| Settings validation fails (spec §7) | abort, notify the offending role/key | no write, no state change |
| Ranking data unavailable (fetch fails, no fresh cache) | abort, notify | no write, no state change |
| Key fetch (`omp token`/registry) or `/api/v1/key`, `/api/v1/credits` fails | abort, notify | no write, no state change |
| Catalog fetch fails | abort, notify | no write, no state change |
| Both tier branches false (no budget, no free quota) | abort, notify | no write, no state change |
| Lock not acquired | abort (`LOCK_ABORT`) | no write, no state change |
| Write conflict after 3 retries | abort (`CONFLICT_ABORT`) | no write, state file untouched |
| `patchConfig` structural surprise / self-check mismatch | abort (`config edit refused: …`) | no write, no state change |
| Zero decisions changed | no write at all (config mtime untouched) | history row appended (full run) |
| Dry run | decisions reported, nothing written | no day-gate stamp, no history row |

- The day-gated agent sync's lock/conflict failures are handled separately: a
  lock it cannot acquire is benign (`{ decisions: [], wrote: false }`); a
  conflict aborts with `CONFLICT_ABORT`.
- A role whose probed candidates are all blocked is left untouched with a notify
  note (not an abort).
- The live-session model hook (`applySessionModel`) runs only after a real write
  and only on a real `default` change; a hook failure is notified but never
  fails the run (the config write already succeeded).
