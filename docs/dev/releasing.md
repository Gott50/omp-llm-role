# Releasing

`version` in `package.json` is the release switch — bump it, commit, then
publish through any channel (same tree, no build step). The repo is private
until the visibility flip, so the public GitHub URLs below fail (404 / auth
error) until then.

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
`retry.fallbackChains` and appended a history row. The public GitHub URLs
(`github:Gott50/…`, `marketplace add Gott50/…`) fail until the repo is
public (404 / auth error).
