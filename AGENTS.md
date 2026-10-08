# AGENTS.md

## Workflow mandate

After your work is done — every time, no exceptions:

1. **Update the docs.** A fact has exactly one home. Update the file that owns
   the kind of change you made:

   | Change | Update |
   |---|---|
   | a module, an entry point, or the data flow between them | `docs/dev/architecture.md` |
   | a data source, its fetch/cache, or a join between sources | `docs/dev/data-sources.md` |
   | a metric, a cardinal transform, or a role's weights | `docs/dev/scoring.md` |
   | a config write, the state/history/lock files, or the write gate | `docs/dev/writes-and-state.md` |
   | the explorer surface (server, explain layer, SPA) | `docs/dev/explorer.md` |
   | the dated numbers (matched/priced/eligible counts, per-role leaders) | `docs/dev/current-state.md` |
   | a release (version bump, npm/git/marketplace channels) | `docs/dev/releasing.md` |
   | the CI workflow, the release script, or the tag→publish contract | `docs/dev/ci.md` |
   | the agent `.md` contract (frontmatter, routing, read-only rules) | `docs/dev/agent-authoring.md` |
   | the test suite or a verification scenario | `docs/dev/testing.md` |
   | a debugging-only oddity (a quirk, not a contract) | `docs/dev/quirks.md` |
   | anything a *user* of the plugin sees | `README.md` |

   `docs/dev/README.md` is the index. Refresh `docs/dev/current-state.md` with
   the new numbers (matched/priced counts, eligible counts, per-role leaders)
   and today's date. If you added a flag, file, or behavior, document it.
2. **Add a `CHANGELOG.md` entry.** Every user-visible change gets a line under
   `## [Unreleased]` in the Keep a Changelog section that fits (`Added`,
   `Changed`, `Fixed`, `Removed`). On release, move the entries under the new
   `## [<version>] - <date>` heading. **Never bump the version per change** —
   the bump is a release-time act, and the number comes from the `## [Unreleased]`
   scope, not the open issues. Rules: `docs/dev/releasing.md`.
3. **Commit your work.** Stage the code change, the updated docs, the changelog
   entry, and — when the ranking CLI changed — the regenerated
   `docs/llm-role-rankings.md` (command in `docs/dev/releasing.md`), as one
   commit. Short imperative message (e.g. `Use OpenRouter pricing instead of
   llm-stats`).

## Agent skills

### Issue tracker

Issues live in GitHub Issues (`Gott50/omp-llm-role`), via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
