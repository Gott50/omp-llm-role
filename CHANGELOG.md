# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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

## [1.0.0] - 2026-10-01

First release. The plugin ranks today's LLM leaderboard into best-fit picks for
each omp model role and applies them to `~/.omp/agent/config.yml` daily.

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

[Unreleased]: https://github.com/Gott50/omp-llm-role/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Gott50/omp-llm-role/releases/tag/v1.0.0
