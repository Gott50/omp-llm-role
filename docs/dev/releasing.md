# Releasing

`version` in `package.json` is the release switch — bump it, commit, then
publish through any channel (same tree, no build step). The repo is public
(flipped 2026-10-02) and 1.0.0 is published to npm (2026-10-03), so all three
channel URLs below resolve — see Status.

## When to bump, and to what

The version is a **release switch, not a per-commit counter**: bump it once per
published batch, at release cut. The trigger is the scope of `CHANGELOG.md`'s
`## [Unreleased]` section — what actually landed. An empty `## [Unreleased]`
owes no release; a non-empty one owes exactly one bump. Unimplemented open
issues (the GitHub tracker) never decide the number.

Pick the number with SemVer over the plugin's **public surface**: the plugin
settings (`roles.*`, `filters.*`, …), the commands (`/refresh-roles`,
`/explore-roles`, `/create-agent`, `/remove-agent`), the `config.yml` write
contract (`modelRoles`, `retry.fallbackChains`, `task.disabledAgents`), the CLI
flags, the shipped roles/agents, and the three install channels.

- **PATCH** (`1.0.x`) — a fix with no public-interface and no shipped-role
  behavior change (crash fix, cache parse fix, doc-only correction).
- **MINOR** (`1.x.0`) — any additive, backward-compatible change: a new optional
  setting, metric, role, agent, command or flag. **Ranking-output changes are
  minor too** (weights, price basis, sources): a ranking is data-dependent
  output, not a versioned interface, so a reweight or re-basis is minor even
  though every pick may move.
- **MAJOR** (`x.0.0`) — anything that invalidates an existing config or breaks
  an existing caller: removing or renaming a public setting; changing an
  existing setting's meaning so a previously valid config behaves differently;
  changing the `config.yml` patch shape, selector or chain format
  incompatibly; dropping an install channel or renaming the package; requiring
  a manual migration.
- **Corner case.** Making a declared-but-inert setting start enforcing its
  documented capability is a MINOR fix, not a MAJOR break — provided the key is
  not renamed and no shipped role sets it.

## How to cut a release

The cut is one command, `scripts/release.ts` — its subcommands, the lockstep
set, the refusals and the tag→publish contract are in [`ci.md`](ci.md). The
policy above decides the number; the script applies it:

```sh
node scripts/release.ts due                 # is a release owed? (exit 1 = no)
node scripts/release.ts cut minor --dry-run # review the target version + changelog diff
node scripts/release.ts cut minor           # bump, cut, commit, push, tag
```

`cut` bumps the four lockstep version fields, renames `## [Unreleased]` and
inserts a fresh one, rewrites the footer link refs, regenerates the committed
report, commits, pushes `main` and pushes the tag. The tag push publishes to npm
over OIDC and creates the GitHub Release — there is no local `npm publish` step
and no token. Verify the channels per "Install-route verification".

## Channels

- **npm**: `npm publish` (unscoped name). Users install with
  `omp plugin install omp-llm-role`; upgrades via
  `omp plugin upgrade omp-llm-role`.
- **git**: push (repo public). `omp plugin install github:Gott50/omp-llm-role`
  follows the default branch — tag `v<version>` for pinned refs.
- **marketplace**: `.omp-plugin/marketplace.json` lists the repo itself
  (`source: "./"`); bump its `plugins[0].version` together with
  `package.json` (install cache paths key on it, and `upgrade --all` only
  considers entries that declare a version). Users refresh with
  `omp plugin marketplace update gott50-plugins` and
  `omp plugin upgrade omp-llm-role@gott50-plugins`.

## Package-manager requirement

npm and git installs shell out to `bun install`, so **bun must be on PATH** for
those two channels. Marketplace installs need no package manager — the plugin
has no runtime dependencies (`yaml` is dev-only, used by tests to validate patch
output with the real parser).

## Tarball contents

The npm tarball ships exactly the `files` whitelist in `package.json`:

```
src, web, agents, skills,
docs/dev, docs/llm-role-rankings.md
```

Caches, tests and `.githooks` stay out. Gate: `node --test tests/` (the
pre-commit hook and CI both run it — see [`ci.md`](ci.md)).

## Changelog rules

`CHANGELOG.md` follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and is the source of truth for the release scope.

- Every **user-visible** change gets a line under `## [Unreleased]`, in the
  section that fits (`Added` / `Changed` / `Fixed` / `Removed`; add
  `Deprecated` / `Security` only when needed).
- **User-visible** = a user or maintainer would notice: ranking or config
  output, the settings surface, shipped roles/agents, commands, install routes,
  a contract or prompt version marker, or a doc fact that changed with the
  behavior. Internal-only work (refactors, tests, formatting, a
  `docs/dev`-only policy or research note) gets no entry.
- One entry per change: bold lead phrase, then what changed and why; end with
  `(issue #N)` / `(PR #N)` when one exists.
- Land the entry in the same commit as the change (see `AGENTS.md`).
- Never write a `## [<version>]` heading outside a release cut; never reword or
  move entries when cutting — rename the heading and keep them verbatim.

## Install-route verification

Install routes verified 2026-10-01 (omp 18.4.8): npm (local-registry
simulation of the packed tarball), git (local git daemon), marketplace (local
path, plus `marketplace update` + `upgrade` to a bumped catalog version), and
`link` — every post-install session run wrote `modelRoles` +
`retry.fallbackChains` and appended a history row.

## Status

- **CI/CD landed 2026-10-08** (`fa7e546`, docs follow-ups `4f78ce2`, `1d20ef9`,
  `9244fdc`, `3c0125a`): every pull request and every `main` push runs the suite
  on GitHub (verified green on PR #57 and on the `main` pushes), and a `v*` tag
  push publishes to npm over OIDC and creates the GitHub Release. The guard was
  verified with a negative control — tag `v0.0.1` against version `1.1.0` failed
  in `notes` before any publish.
- **1.1.0 published by CD 2026-10-09** (run 37897647817,
  `gh workflow run ci.yml --ref v1.1.0`): the guard and the npm floor passed,
  `npm publish` completed over OIDC trusted publishing with a provenance
  attestation (`npm audit signatures`: 0 invalid, 0 missing), and the GitHub
  Release was created with the 1.1.0 CHANGELOG section as its body. Verified:
  `dist-tags.latest` = `1.1.0`, npm's `gitHead` = `4f78ce2` (the tag's commit),
  `_npmUser` = `GitHub Actions` carrying the trusted-publisher OIDC config, and
  the tarball is 56 files / 308.4 kB. The `v1.1.0` tag was repointed to
  `4f78ce2` first — its original commit predates the workflow file, so the
  dispatch was rejected (see [`ci.md`](ci.md)).
- **npm route smoke-tested for 1.1.0** (2026-10-09, omp 18.8.6, throwaway
  `HOME`, cwd outside the real home tree): `omp plugin install omp-llm-role`
  installed 1.1.0 from the registry (`omp plugin doctor`: 4 ok, 0 warnings,
  0 errors) and the post-install session run (`omp -p "say ok"` with
  `OPENROUTER_API_KEY` from `omp token openrouter`) wrote `modelRoles`
  (9 roles), `retry.fallbackChains` and `task.disabledAgents: [designer]` into
  that HOME's `config.yml`, landed `llm-role-state.json` +
  `llm-role-history.jsonl`, and answered.
- **1.1.0 cut 2026-10-08** (`c013918`, tagged `v1.1.0` — repointed to `4f78ce2`,
  see the publish bullet). `package.json` and
  `.omp-plugin/marketplace.json` bumped in lockstep (plus `package-lock.json`
  via `npm install --package-lock-only` — the repo keeps it in lockstep, see
  `8811309`), `## [Unreleased]` renamed to `## [1.1.0] - 2026-10-08`, and the
  report regenerated (407 models, matched 155/407, priced 153;
  `docs/dev/current-state.md` refreshed to the same measurement).
- **git + marketplace channels live and verified** (2026-10-08, omp 18.4.12,
  throwaway `HOME`s, cwd outside the real home tree):
  `omp plugin install github:Gott50/omp-llm-role` installed 1.1.0
  (`omp plugin doctor`: 4 ok, 0 warnings, 0 errors), and
  `omp plugin marketplace add Gott50/omp-llm-role` +
  `omp plugin install omp-llm-role@gott50-plugins` installed 1.1.0 into
  `…/cache/plugins/gott50-plugins___omp-llm-role___1.1.0`. Both routes then
  passed the post-install session smoke (`omp -p "say ok"` with
  `OPENROUTER_API_KEY` from `omp token openrouter`): the installed 1.1.0 wrote
  `modelRoles` (9 roles), `retry.fallbackChains` and
  `task.disabledAgents: [designer]` into that HOME's `config.yml`, landed
  `llm-role-state.json` + `llm-role-history.jsonl`, and the session answered.
- **1.0.0 on all three channels** (2026-10-03): `omp-llm-role@1.0.0` on npm
  (`dist-tags.latest` = `1.0.0`), tagged `v1.0.0` at `fe98b76` (npm's
  `gitHead`); all three routes verified end-to-end against the real URLs
  (omp 18.4.12, throwaway `HOME`s) — each post-install session run wrote
  `modelRoles` + `retry.fallbackChains` into that HOME's `config.yml` and
  landed the three daily caches in the installed copy.
- **Stray registry placeholder.** The registry also carries a `0.0.0-stage`
  version ("Temporary package placeholder for staged publishing", 334 B,
  published 2026-10-03). It is not from this tree and does not affect installs
  (`latest` is `1.1.0`).
- **Next release: one owed.** `## [Unreleased]` carries the CI/CD entry; the
  number comes from the Unreleased scope, not from the open issues.
