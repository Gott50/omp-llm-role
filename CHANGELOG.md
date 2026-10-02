# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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
- **Repository is public.** `Gott50/omp-llm-role` was flipped from private to
  public, so the git (`omp plugin install github:Gott50/omp-llm-role`) and
  marketplace (`omp plugin marketplace add Gott50/omp-llm-role` +
  `omp plugin install omp-llm-role@gott50-plugins`) install routes now work
  against the real URLs; both were re-verified end-to-end (omp 18.4.10,
  throwaway HOMEs). The npm channel is not published yet.
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
