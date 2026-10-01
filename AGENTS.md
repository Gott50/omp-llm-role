# AGENTS.md

## Workflow mandate

After your work is done — every time, no exceptions:

1. **Update the docs.** `README.md` is the single source of documentation.
   Update every section your change touches: Files, Data sources, Scoring,
   Usage, Caching, Current state, Known quirks. Refresh "Current state" with
   the new numbers (matched/priced counts, eligible counts, per-role leaders)
   and today's date. If you added a flag, file, or behavior, document it.
2. **Commit your work.** Stage the code change, the updated docs, and the
   regenerated report together as one commit. Short imperative message
   (e.g. `Use OpenRouter pricing instead of llm-stats`).

## Before committing (when `llm-role-rank.ts` changed)

- Run `node llm-role-rank.ts --top 5` and sanity-check stderr: OpenRouter
  match/priced counts and eligible counts. Node type-stripping does not
  typecheck — typos surface as `undefined` at runtime, so a dropped count is
  your only signal.
- Regenerate the report: `node llm-role-rank.ts --all --out llm-role-rankings.md`
  (`--all` + the default `--top 10` matches the committed report's shape — it
  includes the opt-in `designer` role, which the default run excludes). It is a
  committed artifact — commit the refreshed version with your change.

## Never commit

- `llm-stats-fetched-rankings.json`, `openrouter-fetched-data.json`,
  `openrouter-endpoints-fetched-data.json` and `designarena-fetched-data.json`
  (daily caches, gitignored — regenerated on every run).

## Agent skills

### Issue tracker

Issues live in GitHub Issues (`Gott50/omp-llm-role`), via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
