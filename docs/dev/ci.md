# CI/CD

The GitHub Actions pipeline that gates every change and delivers every release.
The release *policy* — when to bump, SemVer over the public surface, the
CHANGELOG rules, the three channels — lives in [`releasing.md`](releasing.md);
this doc owns the machinery.

## The workflow

`.github/workflows/ci.yml` — one file, two jobs. One file because the npm
trusted-publisher registration names the workflow **filename**, so a second file
would need a second registration.

| Job | Runs on | Does |
|---|---|---|
| `test` | every `pull_request`, every push to `main`, every `v*` tag push, and `workflow_dispatch` | `npm ci`, then `node --test tests/` |
| `release` | `v*` tag pushes (and a `workflow_dispatch` against a tag ref) | verifies the tag, publishes to npm over OIDC, creates the GitHub Release |

`release` declares `needs: test`, so a red tree cannot be published: the same
ref must be green first. `test` runs **exactly** the command the local
pre-commit hook runs (`.githooks/pre-commit`), and `tests/ci.test.ts` fails when
the two drift apart — "green locally" and "green in CI" cannot diverge.

The Node version comes from `.node-version` at the repo root (the exact local
toolchain; bumping it is a normal commit). `engines` is deliberately not in
`package.json`: the plugin executes inside omp's runtime, so an `engines` field
would only produce install warnings for users.

`test` is the whole gate — no lint, no format, no typecheck, no coverage. The
repo runs Node type-stripping without a typecheck (see [`quirks.md`](quirks.md)).

## The tag → publish contract

Pushing a `v<version>` tag is the delivery trigger. The `release` job:

1. checks out the tag;
2. runs `node scripts/release.ts notes "$GITHUB_REF_NAME"` as the **guard** —
   tag ↔ package version ↔ lockstep ↔ CHANGELOG section — and writes the release
   notes to a file. A mistyped tag, a half-applied lockstep bump or a missing
   CHANGELOG section fails here, *before* anything is published;
3. ensures npm ≥ 11.5.1 (the trusted-publishing floor);
4. `npm publish` — authenticated by GitHub OIDC, with a provenance attestation
   generated automatically. No `NPM_TOKEN`, no `.npmrc` step, no third-party
   publish action;
5. `gh release create <tag> --notes-file <notes>` — the GitHub Release body is
   the CHANGELOG section, never retyped.

Because the publish runs from the tagged commit, npm's `gitHead` equals the tag.

### One-time setup: register the trusted publisher

Required before the first CD run, and it cannot be done from the repo. On
npmjs.com → the package → Settings → Trusted publishing → GitHub Actions:

- **Organization or user**: `Gott50`
- **Repository**: `omp-llm-role`
- **Workflow filename**: `ci.yml` (the filename only, with the extension)
- **Allowed actions**: tick **direct publishing (`npm publish`)**.

That last tick is the trap. `npm stage publish` is always allowed, and a
configuration created after 2026-09-03 is automatically set to allow *only*
staged publishing — so a publisher registered today rejects the job's
`npm publish` **after** the guard has already passed, the worst possible failure
point. Staged publishing is not a substitute: it needs a separate
`npm stage approve` with 2FA, which breaks unattended CD. Do **not** tick
`npm dist-tag`; CD never moves a dist-tag.

Floors and constraints (npm's trusted-publishing docs): npm CLI ≥ 11.5.1, Node
≥ 22.14.0 (the pinned `.node-version` clears both), and GitHub-**hosted** runners
only — hence `ubuntu-latest`.

## The release script

`scripts/release.ts` — Node builtins only, no dependencies, outside the `files`
whitelist so it never ships in the tarball. Three subcommands, each with a
documented exit code:

| Command | Exit 0 | Exit 1 |
|---|---|---|
| `due` | `## [Unreleased]` has at least one entry under an allowed section | it is empty (message on stdout) |
| `notes <tag>` | prints **only** the CHANGELOG section body, ready for `--notes-file` | the tag is not `v<semver>`, disagrees with the package version, the lockstep fields disagree, the CHANGELOG has no `## [<version>] - <date>` heading, or that section has no entries (message on stderr) |
| `cut <patch\|minor\|major> [--dry-run]` | the cut ran | a refusal (message on stderr) |

`due` is the agent's branch point: "not owed" is not an error, so a script can
branch on the code without parsing markdown.

### The lockstep set

Exactly four fields, bumped together:

- `package.json` `version`
- `.omp-plugin/marketplace.json` `plugins[0].version`
- `package-lock.json` `version`
- `package-lock.json` `packages[""].version`

The marketplace catalog's own `metadata.version` is **deliberately excluded** —
`releasing.md` locks the plugin entry, not the catalog. The two numbers look
like they should agree; they do not.

### What `cut` does, in order

1. refuse a dirty tree;
2. refuse an existing tag;
3. refuse an empty `## [Unreleased]`;
4. refuse when HEAD is not `origin/main` (so the tag always points at a pushed
   commit and npm's `gitHead` resolves);
5. compute the new version from the bump argument;
6. write the four version fields;
7. rename `## [Unreleased]` to `## [<version>] - <YYYY-MM-DD>` (UTC) and insert
   a fresh empty `## [Unreleased]` above it;
8. rewrite `[Unreleased]: …/compare/v<version>...HEAD` and prepend
   `[<version>]: …/releases/tag/v<version>` to the footer link block;
9. regenerate `docs/llm-role-rankings.md`
   (`node src/cli/llm-role-rank.ts --all --out docs/llm-role-rankings.md`);
10. commit `Release <version>`, staging only the touched paths (never `.`);
11. push `main`, create the annotated tag `v<version>`, push the tag.

The tag push is the CD trigger. `--dry-run` writes nothing: it prints the target
version, the file plan and the changelog diff, and skips the network-dependent
report regeneration with a note.

`cut` does not run the suite itself. The commit it makes goes through
`.githooks/pre-commit` when `core.hooksPath` is wired, and the `release` job
re-verifies with `needs: test` on the tag — a second definition of the gate
inside the script would be a second thing to keep in sync.

There is no `--force` and no interactive prompt: every refusal is a message plus
exit 1, so the command is safe to run unattended.

## Verifying the pipeline

- **The gate:** push a branch and open a PR, or push to `main`; `gh run watch`
  the `test` job green.
- **The guard (negative control):** push a tag that disagrees with the package
  version (e.g. `v0.0.1` against `1.1.0`); the `release` job must fail in the
  `notes` guard *before* any publish and leave the registry untouched. Delete
  the tag afterwards.
- **The publish:** run the release job against an already-cut tag —
  `gh workflow run ci.yml --ref v<version>` — then confirm npm's `gitHead`
  equals the tag commit, `dist-tags.latest` moved, and the GitHub Release body
  is that version's CHANGELOG section. This is also the recovery path for a
  failed publish: the tag exists, so no new version is needed.

  A successful `npm publish` is **not** immediately visible: npm prints "Your
  package is being processed and may take a few minutes to become available",
  and registry reads can serve the pre-publish packument for several minutes
  (third-party mirrors such as jsDelivr lag longer). The step's log is the
  discriminator — a direct publish prints `publishing to
  https://registry.npmjs.org/ with tag latest`, `Signed provenance statement`
  and `+ <pkg>@<version>`; a staged publish is a separate `npm stage publish`
  and prints none of those.

  The dispatch resolves the workflow **from the ref**, so the tag's commit must
  contain `.github/workflows/ci.yml`. A tag cut before this workflow existed
  cannot be dispatched (`HTTP 422: Workflow does not have 'workflow_dispatch'
  trigger`) — the recovery path only works for tags cut after it landed. The
  workaround is to repoint the tag at a commit that contains the workflow (done
  once, for `v1.1.0` → `4f78ce2`).

`tests/ci.test.ts` asserts the offline half: the workflow's structure (jobs,
triggers, permissions, the command it runs), the hook/workflow command parity,
the tag-trigger ↔ CHANGELOG-link agreement, the lockstep fields, and the
script's exit codes and refusals against fixture repositories.
