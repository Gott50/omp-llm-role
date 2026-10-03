# Releasing

`version` in `package.json` is the release switch — bump it, commit, then
publish through any channel (same tree, no build step). The repo is public
(flipped 2026-10-02) and 1.0.0 is published to npm (2026-10-03), so all three
channel URLs below resolve — see Status.

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

- **Released 1.0.0 on all three channels.** Repo public since 2026-10-02;
  `omp-llm-role@1.0.0` published to npm 2026-10-03
  (`npm view omp-llm-role version` → `1.0.0`, `dist-tags.latest` = `1.0.0`);
  `main` is pushed and the git + marketplace URLs resolve. Tagged `v1.0.0` at
  `fe98b76` (the published commit — npm's `gitHead`), so the changelog link and
  pinned git refs (`omp plugin install github:Gott50/omp-llm-role#v1.0.0`)
  resolve.
- **All three routes verified against the real URLs** (2026-10-03, omp
  18.4.12, throwaway `HOME`s, cwd outside the real home tree): npm
  (`omp plugin install omp-llm-role`), git
  (`omp plugin install github:Gott50/omp-llm-role`) and marketplace
  (`omp plugin marketplace add Gott50/omp-llm-role` +
  `omp plugin install omp-llm-role@gott50-plugins`) each installed 1.0.0, and
  each post-install session run wrote `modelRoles` + `retry.fallbackChains`
  into that HOME's `config.yml` and landed the three daily caches in the
  installed copy.
- **Stray registry placeholder.** The registry also carries a `0.0.0-stage`
  version ("Temporary package placeholder for staged publishing", 334 B,
  published 2026-10-03). It is not from this tree; `latest` still points at
  `1.0.0`, so it does not affect installs.
- **Next release.** Bump `version` in `package.json` and
  `.omp-plugin/marketplace.json`, regenerate the report, move the changelog
  entries out of `## [Unreleased]`, then push and `npm publish`.
