# Releasing

`version` in `package.json` is the release switch — bump it, commit, then
publish through any channel (same tree, no build step). The repo is public
(flipped 2026-10-02), so the git and marketplace URLs below resolve; the npm
channel is not published yet — see Status.

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

Caches and tests stay out. Gate: `node --test tests/`.

## Install-route verification

Install routes verified 2026-10-01 (omp 18.4.8): npm (local-registry
simulation of the packed tarball), git (local git daemon), marketplace (local
path, plus `marketplace update` + `upgrade` to a bumped catalog version), and
`link` — every post-install session run wrote `modelRoles` +
`retry.fallbackChains` and appended a history row.

## Status

- **Repo public** (2026-10-02). `Gott50/omp-llm-role` was flipped from private
  to public; `main` is pushed (`cc120bb`).
- **git + marketplace verified against the real URLs** (2026-10-02, omp
  18.4.10, throwaway `HOME`s): `omp plugin install github:Gott50/omp-llm-role`
  and `omp plugin marketplace add Gott50/omp-llm-role` +
  `omp plugin install omp-llm-role@gott50-plugins` both installed 1.0.0, and
  each post-install session run wrote `modelRoles` + `retry.fallbackChains`
  into that HOME's `config.yml` and landed the three daily caches in the
  installed copy.
- **npm not published.** `omp-llm-role` is unclaimed on the registry
  (`npm view omp-llm-role version` → 404) and no npm credential exists on the
  workstation (`~/.npmrc` absent, keychain empty). Publish needs an
  interactive `npm login` (or an automation token) first; then
  `npm publish` from the repo root and `npm view omp-llm-role version` → `1.0.0`.
