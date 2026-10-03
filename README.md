# omp-llm-role

Ranks today's LLM leaderboard into best-fit picks for each omp model role
(`default, smol, slow, vision, plan, commit, tiny, task, advisor`, plus the
opt-in `designer`) and ships an omp plugin that applies those picks to
`~/.omp/agent/config.yml` daily. Every role weights price and throughput, so
the pick is the cheapest model that can do the job, not the strongest one.

## Example output

The report is a full worked example — per-role top-10 tables (value, q, $/M,
tok/s, ctx, weighted metric contributions, ★ Pareto marker) plus the suggested
`modelRoles` block. See
[docs/llm-role-rankings.md](docs/llm-role-rankings.md).

## Install

Any one of three routes:

```sh
omp plugin install omp-llm-role                          # npm
omp plugin install github:Gott50/omp-llm-role            # git (public repo)
omp plugin marketplace add Gott50/omp-llm-role           # marketplace
omp plugin install omp-llm-role@gott50-plugins
```

- npm and git installs shell out to `bun install`, so **bun must be on PATH**;
  marketplace installs need no package manager.
- No runtime dependencies.
- **Restart the session after install** so the extension module loads.
- Upgrades: `omp plugin upgrade omp-llm-role` (npm/git); for the marketplace,
  `omp plugin marketplace update gott50-plugins` then
  `omp plugin upgrade omp-llm-role@gott50-plugins`.
- Dev: `omp plugin link ~/Documents/omp-llm-role`.

## Daily behaviour

- **UTC-day trigger.** The first omp session of each UTC day rewrites
  `modelRoles` (and `retry.fallbackChains`) to that day's best key-eligible
  models; later same-day sessions no-op. `/refresh-roles` forces a run anytime.
- **Awaited session-start run.** The session-start run is awaited before the
  session's first prompt is dispatched, so the day's write lands even in a
  short-lived session (`omp -p`, a subagent).
- **Session model activation.** When the day's run switches `default` and the
  triggering session still has an empty conversation, the plugin also switches
  the live session model to the new selector — the first prompt then runs on
  the freshly ranked pick. Guards: main sessions only, empty conversation, the
  session actually booted on the previous `default` selector (an explicit
  `omp --model X` is never clobbered), and only on a real change. Disable with
  `activateDefaultOnEmptySession=false`.
- **Surgical writes.** Only managed role lines, managed chain keys, and the
  plugin-managed `task.disabledAgents` names change; comments, blank lines and
  unknown keys stay byte-identical, and a no-change run writes nothing.
  `~/.omp/agent/llm-role-state.json` snapshots the previous `modelRoles` block
  on every write as a rollback aid.

## Roles

| Role | Purpose |
|---|---|
| `default` | Main workhorse: strong general coding-agent quality, sane cost |
| `smol` | Fast lightweight model: cheap and quick, still competent |
| `slow` | Most capable model for hard problems; cost and speed as tiebreakers |
| `vision` | Image understanding: vision index dominates |
| `plan` | Planning: reasoning, math, long-context coherence |
| `commit` | Commit messages: cheap and fast with decent general quality |
| `tiny` | Background tasks (titles, memory): cheapest and fastest wins |
| `task` | Subagents: agentic + tool calling, moderate cost sensitivity |
| `advisor` | Advisor/watchdog: deep reasoning over long context |
| `designer` | Design work: visual/UX judgement on image-capable models — **opt-in** |

`designer` is the only non-built-in shipped role and ships **disabled**: a stock
run ranks the nine built-in roles and fetches only their sources. Enable it with

```sh
omp plugin config set omp-llm-role config '{"roles":{"designer":{"enabled":true}}}'
```

The plugin then ranks it and fetches Design Arena. The shipped `designer` agent
is opt-in too: the plugin keeps it in `task.disabledAgents` until
`roles.designer.enabled=true`, so it is absent from the roster and refuses
spawns by default. Its `model: "@designer, @default"` chain only matters if a
user re-enables the agent by hand — with the role disabled the unresolved first
entry is skipped and the child runs on `@default`.

**Agent pins.** The plugin derives each agent's pinned role from the first
`@<role>` in its `model:` frontmatter, across the shipped `agents/` dir, the
user dir (`~/.omp/agent/agents/`) and the project dir (`<project>/.omp/agents/`).
Disabling a role disables the agents that pin it (they are kept in
`task.disabledAgents`); enabling re-enables them. This sync is **not**
day-gated — it runs on every session start, so enabling a role takes effect on
the next session. An agent pinning a role the plugin does not know is left
alone, and other `task.disabledAgents` entries and their order are preserved.

## Settings

Settings live in `~/.omp/plugins/omp-plugins.lock.json` →
`settings["omp-llm-role"]`, deep-merged over the shipped defaults. The plugin
also exposes the whole shipped surface in omp's **`/settings` → Plugins →
*omp-llm-role*** tab (booleans as toggles, `thinking` as a picker, `required` as
a comma-separated string); an edit there takes effect on the next
`/refresh-roles` (or the next day-gated session start).

Global knobs:

| Knob | Default | Meaning |
|---|---|---|
| `switchMargin` | `0.02` | Value margin a challenger must beat the incumbent by before switching; `0` = always take the best |
| `priceSwitchFraction` | `0.5` | Inside the margin, adopt a challenger at least this fraction cheaper (0.5 = half the $/M); `0` disables |
| `writeFallbackChains` | `true` | Write per-role fallback chains into `config.yml` |
| `fallbackChainDepth` | `2` | Fallback models per role chain |
| `activateDefaultOnEmptySession` | `true` | Reapply the new `default` selector to an empty session's active model |

Per-role knobs (`roles.<name>.*`):

| Knob | Default | Meaning |
|---|---|---|
| `enabled` | `true` (`designer`: `false`) | Opt a role in/out; `false` drops it from the resolved set and deletes its `modelRoles.<role>` line |
| `description` | shipped one-liner | Role description |
| `weights` | shipped set | Metric weights; must sum to 1.0 ± 0.01 |
| `required` | shipped set | Eligibility gate (metrics a model must have); independent of weights |
| `filters.image` | `false` (`vision`/`designer`: `true`) | Restrict the pool to image-capable models |
| `thinking` | shipped level | Thinking level appended to the selector (`off`…`max`, `auto`) |
| `lambda` | derived | Explicit λ ($ per quality point) override |
| `locked` | `false` | Leave the role alone: rank it but never rewrite its selector or chain (explorer toggle) |

**Typed writes.** `omp plugin config set <plugin> <key> <value>` stores every
value as a **string**, which the validator rejects for numbers/arrays/booleans,
so it is only usable for string-valued keys. Write typed role defs with
`node src/cli/create-role.ts` or the explorer's **Export** (both validate →
merge → backup → atomic write); for a whole-object override use the `config` escape
hatch, `omp plugin config set omp-llm-role config '<json>'` (JSON-parsed by the
plugin). The lock file stores **flat dotted keys** (`roles.slow.weights.code`);
the reader also accepts nested objects, so an existing nested lock file keeps
working and normalizes on the next role write. Invalid settings abort the run
with the offending role/key and no write.

## Commands

```sh
# in-session (omp)
/refresh-roles                          # force a run now
/explore-roles [--port N] [--no-open]   # interactive ranking UI
/create-agent <request> [options]       # agent + role + wiring (free text or flags)
/create-agent --name <n> --purpose <text> [options]   # agent + role + wiring
/remove-agent --name <n> [--scope user|project] [--lock PATH] [--yes] [--dry-run]   # delete an agent and its role

# CLI
node src/cli/llm-role-rank.ts [--top N] [--json] [--out FILE] [--refresh] [--all] [--url URL]
node src/cli/create-role.ts --name <role> --weights m=w,... [--required m,...] [--thinking <level>] [--description <text>] [--image] [--lambda N] [--lock PATH] [--dry-run] [--json]
node --test tests/
```

- `/refresh-roles` — force the daily pipeline now (same path as the session-start
  run).
- `/explore-roles` — boot the explorer in-process (see below); `--port` picks a
  preferred port (default 5177, a busy port falls back to a free one) and
  `--no-open` skips the browser.
- `/create-agent` — create an agent **and** its role and wire them in one
  command (see *Add a specialist agent*).
- `/remove-agent` — the inverse of `/create-agent`: deletes the agent `.md` and
  its role, then runs the updater in-process so `modelRoles.<n>` is dropped;
  refuses shipped default roles (see *Remove a specialist agent*).
- `src/cli/llm-role-rank.ts` — markdown report to stdout (per-role tables + suggested
  `modelRoles`). `--top N` rows per role (default 10); `--json` machine payload;
  `--out FILE` write instead of stdout; `--refresh` bypass both caches; `--all`
  include opt-in roles (`designer`) — the default ranks the nine built-in roles
  only; `--url` override the llm-stats page URL.
- `src/cli/create-role.ts` — add/update one role in the settings lock file (validated,
  backup + atomic write); `--dry-run` validates without writing, `--json` prints
  the payload.
- `node --test tests/` — the unit suite.

## Add a specialist agent

One command does all of it. Describe the agent in plain language — the architect
names it, any benchmark you mention is folded into the weights, and any
benchmark link you point at is resolved:

```sh
/create-agent i want an agent for writing. use the writing related Benchmarks in the Leaderboard https://llm-stats.com/leaderboards/best-ai-for-writing
```

A link to any llm-stats benchmark page (`llm-stats.com/benchmarks/<id>`) resolves
to that benchmark; a link to a provider the plugin has never seen is authored
into a source declaration — the plugin fetches it, proposes a declaration, shows
the coverage and leader, and asks you to confirm before it is saved. A named
benchmark takes a decisive share of the weights, so it actually drives the
ranking. You do not have to name every benchmark: when you give a purpose, the
command also discovers the llm-stats catalog benchmarks relevant to it (a typed
judgment through your configured `judge` role) and folds them in — so a writing
agent is ranked on WritingBench, Creative Writing v3, COLLIE and the other
writing benchmarks, not just the one you named. Discovery is non-fatal and
skippable with `--no-discover`; an explicit `--benchmarks` list wins over it.

Discovery is **coverage-safe**: a benchmark that covers too little of the field
to rank on (a sparse pass-rate metric, below 35% of the models) is dropped rather
than folded in, and the focus set is capped at three benchmarks so one keeps a
decisive share. The report prints each focus metric's coverage and warns when one
is below the bar, and warns when the new role's top pick is the same as the
`default` role's (the role adds nothing). The agent file is written before the
role, so a partial failure never leaves a dangling role.

The flag form is equivalent and gives you the name explicitly:

```sh
/create-agent --name review --purpose "review pull requests for correctness and security"
```

It fits the weights to the purpose from the archetype table
(`--list-archetypes` prints the ten sets), authors
`~/.omp/agent/agents/review.md` with `model: "@review, @default"`, writes the
validated role into the settings lock file, and runs the updater in-process so
`modelRoles.review` lands in `config.yml` — nothing to remember. Options:
`--archetype <id>`, `--weights m=w,...`, `--required`, `--thinking`, `--tools`,
`--benchmarks m,...` (extra metrics to fold in; `--list-benchmarks` prints the
weightable set, including any external benchmark in use), `--scope user|project`,
`--body`/`--body-file`, `--force` (overwrite an existing agent file), `--yes`
(accept a proposed benchmark source without prompting), `--no-discover` (skip
catalog discovery), `--dry-run`, `--json`. In
the free-text form the flags still apply after the request, e.g.
`/create-agent i want an agent for writing --dry-run`. There is no
out-of-session CLI for this path — run `/create-agent` in an omp session.

By hand, the same three artifacts:

1. Define the role with the plugin's validated write path:
   ```sh
   node ~/.omp/plugins/node_modules/omp-llm-role/src/cli/create-role.ts --name review \
     --weights reasoning=0.30,general=0.24,code=0.20,agents=0.10,price=0.10,throughput=0.06 \
     --required general,price,throughput --thinking high \
     --description "Code review: agentic depth with cost awareness"
   ```
2. Author the agent that pins `model: "@review, @default"` (the routing), or pin
   an existing agent through `task: { agentModelOverrides: { <agent>: "@review" } }`.
3. Wire it: `/refresh-roles` in a session.

The shipped skill `omp-llm-role-create-agent` is the hand-driven equivalent, for
when the body needs real authoring rather than the archetype scaffold.

## Remove a specialist agent

One command deletes an agent **and** its role:

```sh
/remove-agent --name review
```

It deletes the agent `.md` (user and/or project scope) and the role's lock-file
keys, then runs the updater in-process so `modelRoles.review` is dropped from
`config.yml` — nothing to remember. Options: `--scope user|project`,
`--lock PATH`, `--yes` (skip the in-session confirmation), `--dry-run`. Shipped
default roles (e.g. `designer`) cannot be deleted — the message points at the
explorer's "Reset to shipped default". A role created any way (the explorer's
"+ new role", `create-role.ts`, or `/create-agent`) is removable.

By hand, the same two artifacts:

1. Delete the role from the settings lock file (the explorer's Export, or edit
   the lock file directly).
2. Delete the agent file: `rm ~/.omp/agent/agents/review.md`.
3. Wire it: `/refresh-roles` in a session.

## Explorer

`/explore-roles` in omp boots a loopback-only web UI
(`http://127.0.0.1:5177`) that answers "why is model X at rank 7 for
`@slow`?" and "what happens if I care more about price than agents?" without
editing source and re-running the CLI.

- **Role tabs** — every role the plugin knows: the nine omp built-in roles, the
  shipped opt-in `designer`, and any role present only in the lock file. Each
  tab is tinted by provenance — `default` (omp built-in), `plugin` (shipped but
  opt-in), `user` (lock-file only) — and a disabled role is muted and dashed.
  Selecting a disabled role still ranks its models.
- **Rank table** — every eligible model for the selected role, with `value`,
  `q`, `$/M` (effective, thinking-adjusted), `tok/s`, `ctx`, a `★` Pareto
  marker, and a `Δ` column showing the rank delta against the role's effective
  def (what the plugin does today).
- **Explain panel** — click a row for the full decomposition: each weighted
  metric's raw value → cardinal transform → renormalized weight → contribution,
  the cost block (`λ`, effective vs billed price, `penalty = λ·price`,
  `value = q − penalty`), "why not higher" (the value gap to the model above
  plus the per-metric target that would close it), and the models that dominate
  it on (price, q).
- **Weight editor** — edit the role's description, weights, `required` set,
  `filters.image`, `thinking` level, and `λ` override live; the table re-ranks
  on every change. Weights are edited freely (no implicit rescaling): the `Σ`
  readout turns red until `|Σ − 1| ≤ 0.01`, and `Normalize` rescales in one
  click.
- **Enabled toggle** — opts a role in or out. Exporting writes `enabled` into
  the lock file; the next updater run drops a disabled role from the resolved
  set and deletes its `modelRoles.<role>` line, and re-enabling restores it.
- **Locked toggle** — tells the plugin to leave the role alone: it is still
  ranked and shown, but the updater never rewrites its selector or fallback
  chain and never removes it. Enable/disable still applies.
- **+ new role** — creates a role from a template
  (`general/code/price/throughput`, Σ 1.0) that you then tune and Export.
- **Export** — writes the edited roles into the settings lock file atomically
  and with a `.bak-<timestamp>` sibling, touching only the roles you edited. The
  change takes effect on the next `/refresh-roles` **in any running session**
  (the lock file is re-read from disk on every run). `Copy JSON` / `Download
  JSON` emit the same payload for manual use.
- **Hover explanations** — every column header, metric name, role tab, and
  control carries a tooltip explaining its semantics.

The UI never reimplements the ranking math: the numbers on screen are exactly
the numbers the plugin would use. The server binds `127.0.0.1` only (no auth)
and serves the SPA with no build step and no external requests.

## Availability

The plugin keeps only models the OpenRouter key can actually run:

- **Tier/budget gate** — paid keys with budget get billed variants, free or
  exhausted keys get `:free` variants, `:batch` never. Every candidate must
  resolve in omp's catalog.
- **Probe verification** — on top of the gate, every candidate is verified with
  a one-token completion probe, because the account's OpenRouter
  **allowed-providers privacy whitelist** is invisible to the key and catalog
  endpoints and a real request's 404 is the only reliable signal. Blocked
  candidates are excluded from selection and chains; a role with no clean
  candidate is left untouched.

## Caveats

- **Sparse metrics.** A missing weighted metric contributes 0 while still
  occupying its share of the denominator, so weight sparse metrics as
  differentiators, never as `required` gates. `website`, `writing` and
  `long_context` are capability-filled (0.195) instead, so absence is not a
  penalty for them.
- **Provider whitelist.** The account's allowed-providers whitelist blocks many
  models, so the report's #1 and the written selector can differ — judge weights
  on the reachable pool.
- **Model concentration.** The cheapest pick concentrates on one vendor; the
  fallback chains mitigate it.

## Licence

MIT — see [LICENSE](LICENSE).

## Documentation

Maintainer docs (architecture, data sources, scoring, writes/state, explorer
internals, releasing, agent authoring, the normative spec) live in
[docs/dev/README.md](docs/dev/README.md); release history is in
[CHANGELOG.md](CHANGELOG.md).
