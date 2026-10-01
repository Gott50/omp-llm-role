# omp-llm-role

Ranks today's LLM leaderboard into best-fit picks for each omp model role
(`default, smol, slow, vision, plan, commit, tiny, task, advisor`, plus the
opt-in `designer`), and ships an omp plugin that applies those picks to
`~/.omp/agent/config.yml` daily. `SPEC.md` is the normative spec for the plugin.

`designer` is the only non-built-in *shipped* role and ships **disabled**: a
stock run ranks the nine built-in roles and fetches only their sources. Enable
it with
`omp plugin config set omp-llm-role config '{"roles":{"designer":{"enabled":true}}}'`
— the plugin then ranks it and fetches Design Arena. The shipped `designer`
agent is opt-in too: the plugin keeps it in `task.disabledAgents` until the role
is enabled, so it is absent from the roster and refuses spawns by default.
Role-exclusive sources are fetched only when a ranked role weights their metric:
Design Arena (`website`, `designer`) and the writing leaderboard (`writing`,
e.g. the `writing` role the create-agent skill produces).

## Files

| File | Purpose |
|---|---|
| `llm-role-rank.ts` | CLI report (Node 26, type-stripping — no bun/deno/tsx, no build step) |
| `src/engine.ts` | Ranking engine shared by CLI and plugin: fetch/caches, cardinal transforms, value scoring, `loadRankData`, `computeRankings` |
| `src/settings.ts` | Shipped role defaults (`DEFAULT_ROLES`, incl. per-role `thinking` levels), `SHIPPED_AGENTS` (the opt-in agent names), plugin-settings deep-merge + validation |
| `src/availability.ts` | OpenRouter key tier gate, catalog filter, variant resolution (`resolveVariant`), provider-allowlist probe (`probeModel`) |
| `src/config-edit.ts` | Surgical line-oriented YAML patch for `modelRoles` + `retry.fallbackChains` + `task.disabledAgents`, atomic write |
| `src/state.ts` | State/history/lock files under the agent dir; agent-dir resolution |
| `src/updater.ts` | Orchestration: rank → tier gate → hysteresis → chains → agent-disable sync → config write |
| `src/extension.ts` | omp extension entry: day-gated `session_start` run + `/refresh-roles` + `/explore-roles` (in-process explorer) + `/create-agent` (agent + role + wiring in one command) |
| `update-roles.ts` | Headless shim: `node update-roles.ts [--dry-run] [--json]` (always forces) |
| `create-role.ts` | Add/update one role in the plugin settings lock file: `node create-role.ts --name <role> --weights m=w,... [--required ...] [--thinking ...] [--image] [--dry-run]` |
| `create-agent.ts` | Create an agent **and** its role together: `node create-agent.ts --name <n> --purpose "<text>" [--weights ...] [--tools ...] [--benchmarks m,...] [--scope user\|project] [--body-file PATH] [--force] [--dry-run] [--list-archetypes] [--list-benchmarks]` |
| `src/agent-create.ts` | `/create-agent` core: purpose → archetype → validated role → agent `.md`; folds the architect spec and the user's extra benchmarks in; also the shared flag parser + report formatter both hosts use |
| `src/agent-architect.ts` | omp's agent-creation architect, run in-process (extension-only): the `/agents` hub's prompt + `createAgentSession`, no tools |
| `src/prompts/` | omp's architect prompts, shipped verbatim (`agent-creation-architect.md`, `agent-creation-user.md`) |
| `src/role-archetypes.ts` | Purpose → weight archetype table (10 sets, each Σ = 1 and Σ(non-price) = 1 − w_price) + keyword fitting |
| `src/agent-file.ts` | Agent `.md` rendering/placement: frontmatter, routing description, read-only classification, atomic write (the body comes from omp's architect) |
| `explore.ts` | Explorer CLI shim (`node explore.ts`): headless/out-of-session launch of the same in-process server |
| `src/explorer/boot.ts` | Shared explorer launcher: bind/port fallback, lock-file roles, browser open, close — used by both `explore.ts` and `/explore-roles` |
| `src/explorer/explain.ts` | Pure explanation layer: rank rows with baseline deltas, per-model decomposition, inverse-cardinal targets |
| `src/explorer/server.ts` | Zero-dependency HTTP surface for the explorer (static SPA + JSON API) |
| `src/role-settings.ts` | The one validated role write path (validate → merge → backup → atomic write) shared by the explorer's Export, `create-role.ts` and `/create-agent` |
| `web/` | Explorer SPA (`index.html`, `app.js`, `style.css`) — no framework, no build step, no external requests |
| `agents/designer.md` | The `designer` subagent, shipped by the plugin (discovered from the plugin's extension root — no install step) but **opt-in**: the plugin keeps it in `task.disabledAgents` until `roles.designer.enabled=true`. The `writing` agent the create-agent skill produces lives at `~/.omp/agent/agents/writing.md`, a user artifact, not a repo file |
| `skills/omp-llm-role-create-agent/SKILL.md` | Shipped skill: the hand-driven version of `/create-agent` — author the `.md` with omp's agent-creation feature, fit weights, write the role, verify, tune in the explorer |
| `package.json` | Plugin manifest (`omp.extensions`) — no runtime dependencies (`yaml` is dev-only: tests validate patch output with the real parser) |
| `.omp-plugin/marketplace.json` | Self-hosted omp marketplace catalog (`gott50-plugins`): `omp plugin marketplace add Gott50/omp-llm-role` + `omp plugin install omp-llm-role@gott50-plugins` |
| `LICENSE` | MIT |
| `tests/` | `node --test tests/` fixtures: tier gate, variant resolution, config edit, hysteresis, chain pruning, chain suffixes, explorer, role creation, writing metric, thinking-price, openrouter-blend, agent disable |
| `llm-stats-fetched-rankings.json` | Daily cache of the raw llm-stats leaderboard (script-owned, gitignored) |
| `openrouter-fetched-data.json` | Daily cache of the full OpenRouter `find` response (gitignored) |
| `openrouter-endpoints-fetched-data.json` | Daily cache of the OpenRouter model pages' per-provider routes (gitignored) |
| `designarena-fetched-data.json` | Daily cache of the Design Arena leaderboard boards — `models/website` + `agents/agon_webapps` (gitignored) |
| `writing-fetched-data.json` | Daily cache of the writing leaderboard's WritingBench export, keyed by llm-stats id (gitignored) |
| `llm-role-rankings.md` | Generated report: per-role tables with per-metric weighted contributions (regenerate with `--out`) |
| `SPEC.md` | Normative spec for the plugin |

## Plugin: daily model-role updater

Install (users) — any one of: `omp plugin install omp-llm-role` (npm),
`omp plugin install github:Gott50/omp-llm-role` (git, public repo), or
`omp plugin marketplace add Gott50/omp-llm-role` +
`omp plugin install omp-llm-role@gott50-plugins` (marketplace). npm and git
installs shell out to `bun install` (bun must be on PATH); marketplace
installs need no package manager. No runtime dependencies; restart the
session after install so the extension module loads.

Install (dev): `omp plugin link ~/Documents/omp-llm-role`. From then on:

- **Trigger**: the first omp session of each UTC day rewrites `modelRoles`
  (and `retry.fallbackChains`) to that day's best key-eligible models;
  later same-day sessions no-op. `/refresh-roles` forces a run anytime.
  The session-start run is awaited before the session's first prompt is
  dispatched (a deferred timer would be cleared when a short-lived session —
  `omp -p`, subagents — exits before it fires).
- **Session model activation**: when the day's run switches `default` and the
  session that triggered it still has an empty conversation, the plugin also
  switches the live session model to the new selector (via
  `pi.setModel` + `pi.setThinkingLevel`) — the first prompt then runs on the
  freshly ranked pick instead of the pre-write one. Guards: main-session
  only (`ctx.agent.kind === "main"`), conversation empty (no `message`
  entries in the branch), the session actually booted on the previous
  `default` selector (an explicit `omp --model X` is never clobbered), and
  only on a real change (kept roles don't re-apply). Disable with
  `activateDefaultOnEmptySession=false`.
  Headless: `node update-roles.ts` (forces), `--dry-run` computes without
  writing, `--json` emits the decisions payload.
- **Explorer**: `/explore-roles` boots the interactive ranking UI in-process
  (see Explorer) — the supported way to tune weights and export them, replacing
  the standalone `node explore.ts` invocation (which remains as the headless
  shim).
- **Availability**: keeps only models the OpenRouter key can run — tier/budget
  gate (`is_free_tier`, `limit_remaining`, `/api/v1/credits`). Paid keys with
  budget get billed variants, free/exhausted keys get `:free` variants,
  `:batch` never. Every candidate must resolve in omp's catalog; ranking rows
  map to selectors exact id → newest dated (`-MMDD`/`-YYYYMMDD`) → bare →
  `~org/…-latest` alias, ties lexicographic.
  On top of the tier gate, every candidate is verified with a one-token
  completion probe: the account's OpenRouter **allowed-providers privacy
  whitelist** is invisible to `/api/v1/key` and the catalog endpoints, and a
  real request's 404 ("No allowed providers are available …") is the only
  reliable signal. The probe walk verifies the current selector's candidate
  first, then rank order, and stops only when `1 + fallbackChainDepth` clean
  candidates exist and — for a clean current selector — `fallbackChainDepth`
  clean candidates lie beyond it, so every written chain entry is
  probe-verified (budget-capped at 12 probes per role, verdicts cached per
  run); blocked candidates are excluded from selection and chains, recorded
  on the decision (`blocked[]`), and a role with no clean candidate is left
  untouched.
- **Switch policy**: hysteresis — a role switches only when its current model
  became ineligible (or left today's ranked pool) or the new best beats it by
  `switchMargin` (default 0.02; 0 = always take the best). The margin is a flat
  band on `value`, so it silently vetoes switches worth up to `switchMargin / λ`
  $/M — $7.60/M at `default`'s λ 0.00263 (2026-09-30). The cost override closes
  that: a challenger inside the band that undercuts the incumbent's *effective*
  price by `priceSwitchFraction` (default 0.5 = at least half the $/M) is
  adopted anyway, recorded as `switched-cost`; `priceSwitchFraction=0` restores
  the pure margin. Kept roles still get their fallback chain refreshed and
  their selector canonicalized.
- **Writes**: surgical in-place edit — only managed role lines, managed
  chain keys, and the plugin-managed `task.disabledAgents` names change;
  comments, blank lines and unknown keys stay
  byte-identical; values are emitted double-quoted; a line whose value already
  equals the new selector (any quoting) is left untouched, so a no-change run
  writes nothing and never touches the config mtime. Atomic tmp+rename with a
  3-attempt mtime-conflict retry; the patched text must read back through the
  line-oriented reader as exactly the intended state or nothing is written.
  Thinking suffixes come from each role's `thinking` field
  in `DEFAULT_ROLES` (`default`/`task`/`advisor`: `auto`; `smol`/`commit`/
  `tiny`: `off`; `slow`: `high`; `vision`/`plan`/`designer`: `auto` — every
  shipped role carries a level) and are only appended when the
  chosen catalog entry's `thinking[]` includes the level — meta levels
  (`off`, `auto`) need only a non-empty list, because omp clamps unsupported
  levels and an unsupported pin would run at a different effort than the role
  intends.
  Fallback-chain entries carry the same suffix when their own target's
  `thinking[]` includes the level, so a fallback runs at the role's effort
  rather than the session
  `defaultThinkingLevel`; a key shared by several managed roles (one
  model-scoped chain, two role levels) stays level-free.
- **Agent opt-in**: the shipped `designer` agent is kept in
  `task.disabledAgents` until `roles.designer.enabled=true` (see omp wiring).
  This sync is **not** day-gated — it runs on every session start, so enabling
  the role takes effect on the next session.
- **Rollback aid**: `~/.omp/agent/llm-role-state.json` snapshots the previous
  `modelRoles` block on every write (`previousModelRoles`).
- **Settings**: `~/.omp/plugins/omp-plugins.lock.json` →
  `settings["omp-llm-role"]`, deep-merged over the shipped defaults. Knobs:
  `switchMargin`, `priceSwitchFraction`, `writeFallbackChains`,
  `fallbackChainDepth`, `activateDefaultOnEmptySession`,
  `roles.<name>.{enabled,description,weights,required,filters,
  thinking,lambda}`. `weights: null` opts a role out; a new role with a full
  weight set gets managed too. `enabled: false` drops a shipped role from the
  resolved set (the shipped `designer` default) — set `roles.designer.enabled=true`
  to opt in. A role that leaves the resolved set (disabled or removed) has its
  `modelRoles.<role>` line deleted on the next run, so a stale pin cannot keep
  routing `@<role>`. A shipped agent whose same-named role is not in the
  resolved set is kept in `task.disabledAgents` (and removed from it when the
  role is enabled), so the `designer` agent is disabled by default; other
  `task.disabledAgents` entries and their order are preserved. This sync is not
  day-gated — enabling the role takes effect on the next session, not the next
  day. Invalid settings abort the run with the offending role/key and no write. Write typed values with `node create-role.ts` (roles) or the
  explorer's Export; `omp plugin config set <plugin> <key> <value>` stores every
  value as a **string**, which the validator rejects for numbers/arrays/booleans,
  so it is only usable for string-valued keys — for a whole-object override use
  `omp plugin config set omp-llm-role config '<json>'` (the `config` escape
  hatch, JSON-parsed by the plugin).
- **State files** (next to the config): `llm-role-state.json` (day gate,
  managed roles, last selectors, plugin-owned chain keys, previous
  `modelRoles` snapshot), `llm-role-history.jsonl` (one row per completed
  run: trigger, key tier, decisions), `.llm-role-refresh.lock` (serializes
  concurrent session starts; stale after 60 s).
- **Agent dir resolution**: `OMP_LLM_ROLE_AGENT_DIR` (test hook) →
  `PI_CODING_AGENT_DIR` → non-default `OMP_PROFILE` → `~/.omp/agent`.

`llm-role-rank.ts` remains the report surface; its suggested `modelRoles`
block resolves through the same catalog/variant logic the plugin uses
(`openrouter/<id>` selectors).

## omp wiring: a role only runs when an agent names it

`modelRoles` is a plain key→selector map and omp has **no task classifier**:
automatic selection iterates the built-in ids (`default, smol, slow, vision,
plan, commit, tiny, task, advisor`) only, so a ranked role — `designer`
included — is **inert until an explicit reference names it**. "The designer
model handles design tasks" is therefore two pieces:

| Piece | Where | Role |
|---|---|---|
| `modelRoles.designer` | `~/.omp/agent/config.yml` | the plugin's daily pick, written **only when the role is enabled** (`roles.designer.enabled=true`); suffix from `roles.designer.thinking` |
| `modelTags.designer` | same file | hub cosmetics only (`name: Designer`, `color: accent`) |
| `designer` agent | `agents/designer.md` in this repo — discovered from the plugin's extension root, so linking/installing the plugin ships it (a user/project copy at `~/.omp/agent/agents/designer.md` or `<project>/.omp/agents/designer.md` overrides it) | `model: "@designer, @default"` is the routing; its `description` is the delegation hint the main session reads. **Opt-in**: the plugin keeps `designer` in `task.disabledAgents` until the role is enabled, so the agent is off the roster and refuses spawns by default |

```md
---
name: designer
description: UI/UX specialist for design implementation, review, visual refinement
tools: [read, bash, edit, ast_grep, ast_edit, ask, debug, ida, eval, github, glob, grep, find, lsp, checkpoint, rewind, context_notes, new_context, security_scan, task, wait, todo, web_search, write, memory_edit, retain, recall, reflect, learn, manage_skill]
model: "@designer, @default"
---
```

Verified end-to-end (2026-09-27, headless `-p --mode json` with the parent
pinned to `openrouter/deepseek/deepseek-v4.1-flash`): a design prompt spawned
`{"agent":"designer","agentSource":"user","modelRole":"designer"}` and the
child ran on the role's selector, not the parent's model. The agent should not
pin `thinkingLevel`: the role's `:suffix` already sets the effort. Re-verified
2026-10-01 with the agent discovered from the plugin's extension root (the
user-level copy removed): with `modelRoles.designer` present the child resolves
`modelRole: "designer"`; with it absent the `@default` fallback resolves
`modelRole: "default"`. The opt-in gate was verified the same day: with
`task.disabledAgents: ["designer"]` a spawn fails preflight with *Agent
"designer" is disabled in settings* (the plugin's session-start write lands
before the first prompt, so the gate holds in the session that adds it); with
the entry removed the child spawns and replies.

Adding another task specialist — one command does all of it:

```sh
/create-agent --name review --purpose "review pull requests for correctness and security"
```

It fits the weights to the purpose from the archetype table
(`--list-archetypes` prints the ten sets), writes the validated role into
`~/.omp/plugins/omp-plugins.lock.json` → `settings["omp-llm-role"]`, authors
`~/.omp/agent/agents/review.md` with `model: "@review, @default"`, and then runs
the updater **in-process** so `modelRoles.review` lands in `config.yml` — one
command, nothing to remember. Also `--archetype <id>`, `--weights m=w,...`,
`--required`, `--thinking`, `--tools`, `--scope user|project`, `--body-file`,
`--force` (overwrite an existing agent file), `--dry-run`, `--json`. Outside a
session it is `node create-agent.ts --name … --purpose …` followed by
`node update-roles.ts`. The shipped skill `omp-llm-role-create-agent` is the
hand-driven equivalent, for when the body needs real authoring rather than the
archetype scaffold.

By hand, the same three artifacts:

1. Define the role in plugin settings — one full weight set, `required` ⊆
   weights, `thinking` for the effort level (the legacy `suffixes.<role>` knob
   is rejected by validation). `omp plugin config set` stores every value as a
   **string**, which the validator rejects for numbers/arrays/booleans, so write
   the typed def with the plugin's own validated path:
   ```sh
   node ~/.omp/plugins/node_modules/omp-llm-role/create-role.ts --name review \
     --weights reasoning=0.30,general=0.24,code=0.20,agents=0.10,price=0.10,throughput=0.06 \
     --required general,price,throughput --thinking high \
     --description "Code review: agentic depth with cost awareness"
   ```
   It validates through `resolveSettings`, backs up the lock file, and writes
   atomically (`--dry-run` validates without writing). From then on the plugin
   ranks, prices, probes, hysteresis-checks, chain-fills and writes
   `modelRoles.review` daily (it touches only roles it has weights for, so
   hand-added keys stay untouched). Settings live in
   `~/.omp/plugins/omp-plugins.lock.json` → `settings["omp-llm-role"]`, not in
   `config.yml`. The explorer's **+ new role** button and **Export** write the
   same shape.
2. Author the agent that pins `model: "@review, @default"` (the routing), or pin
   an existing agent through `task: { agentModelOverrides: { <agent>: "@review" } }`.
3. Non-agent entry points for a one-off run: `omp --model @review`, or add the
   role to `cycleOrder` for `Ctrl+P`.

Verify the wiring end-to-end, from a clean slate if you want the strongest
signal (delete `roles.<name>` from the lock file and let a run drop the key from
`config.yml`):

```sh
node ~/.omp/plugins/node_modules/omp-llm-role/update-roles.ts --dry-run   # a kept/switched line for the role, or "no changes"
cd /tmp && omp -p --mode json "Use the <name> agent (task tool) to <trivial task>"
```

The spawn record inside the JSON must read
`{"agent":"<name>","agentSource":"user","modelRole":"<name>"}` with
`resolvedModel` equal to the role's selector — not the parent's model. `agentSource`
is `user` when the agent lives in `~/.omp/agent/agents/` and `extension` when it
comes from a plugin's `agents/` dir. Verified this way for `writing`
(2026-10-01): `agentSource: "user"`, `modelRole: "writing"`,
`resolvedModel: "openrouter/qwen/qwen3-235b-a22b-thinking-2507:low"` against a
parent on `deepseek/deepseek-v4.1-flash`.

The shipped skill `omp-llm-role-create-agent` walks all three steps — agent
authoring with omp's agent-creation feature, purpose-fit weights, verification —
so a user can just ask their omp agent to "create an agent for <purpose>".

Caveats: `@<name>` is a role alias only when `<name>` is a built-in id or a key
in `modelRoles` — otherwise omp treats it as a literal model pattern and fails
hard (`Model "@x" not found`), and a role merely *named* after an agent routes
nothing. That applies to agent frontmatter too: a bare `model: "@designer"`
hard-fails when the role is disabled, so the shipped agent pins the chain
`model: "@designer, @default"` — the unresolved first entry is skipped and the
child runs on `@default` (verified: spawn record `modelRole: "default"` with
`modelRoles.designer` absent). Agent discovery is first-wins: nearest
project `.omp/agents/` → `~/.omp/agent/agents/` → extension roots → Claude
marketplace plugins → bundled (18.1.3 removed the bundled `designer` agent, so
this one is ours).

## Data sources

**Quality — llm-stats.com.** The leaderboard page server-renders its
dataset into the Next.js RSC flight payload (`self.__next_f.push([1,"..."])`
chunks ending in an `initialData: [...]` array). There is no public JSON API,
so the script extracts that array. Provides: index scores (general, reasoning,
math, code, agents, search, vision, tool_calling, long_context), benchmark
scores, context length, multimodality.

**Throughput + price — OpenRouter only.** Two payloads, joined to llm-stats by
slug suffix (llm-stats `model_id` (bare) == OpenRouter slug suffix,
`slug.split("/")[1]`):

- `GET https://openrouter.ai/api/frontend/v1/models/find?active=true&fmt=cards&order=top-weekly`
  (public, no auth): `data.endpoint_perf[endpointId]` with `p50_throughput`
  (output tok/s) and `p50_latency` (ms) over the last 30 minutes of routed
  traffic, plus `data.models[]` rows linking slugs to endpoint ids — ONE
  endpoint per model, the route currently getting the traffic, each carrying
  `pricing.prompt`/`pricing.completion` (USD/token strings, discounts already
  applied).
- The model pages (`https://openrouter.ai/<slug>`, RSC flight payload; ~150
  fetched daily, only for slugs matching a leaderboard model): EVERY provider
  route of a model — pricing, service tier, status and routed-traffic p50
  stats — dehydrated as React-Query state (sometimes twice, one copy without
  stats; records merge by endpoint id, stats-carrying copy winning).

OpenRouter's default routing is price-based load balancing: a request goes to
ONE provider, picked among the stable standard-tier routes with probability
proportional to 1/price² (docs: "select one weighted by inverse square of the
price"). The ranking uses the expected values under that distribution:
`price = Σ(1/p²)·p / Σ(1/p²)` and `throughput = Σ(1/p²)·t / Σ(1/p²)` over the
stable (status 0) standard-tier billed routes, throughput renormalized over
the routes that have data. flex/priority service tiers are excluded (only the
`:floor`/`:nitro` variants make them eligible), as are degraded routes
(status ≠ 0 — they are fallbacks), `:batch` variants and $0 `:free` tiers
(1/p² blows up at 0, and a `:free` slug is never requested by default routing).
Without page data the pool is the find route alone; only when no eligible
route carries throughput does the pre-blend behavior apply (highest-p50
variant, `:free` included — it rescues otherwise-unranked models; cheapest
billed price — a $0 free tier never sets the price).

llm-stats throughput and prices are **not used**: OpenRouter reflects real
routed traffic across providers (llm-stats measures a single provider; the
two disagree wildly), and OpenRouter pricing is what a caller actually pays
on the router. Models without OpenRouter throughput or a billed route are
not ranked — every role requires both.

**Design quality — OpenRouter's Design Arena Elo.** The same `find` payload
carries `data.benchmarks[permaslug].da.elo_by_category`: Design Arena's
human-preference Elo per category (`models-website`, `models-uicomponent`,
`models-svg`, `models-dataviz`, `models-graphicdesign`, `models-logo`, …).
Only `models-website` is read — the deepest design category that overlaps the
ranked pool (116/131 entries, and the same set as the category union among
eligible models), where `graphicdesign`/`logo` cover image generators only and
`uicomponent` (r = 0.98 with website) is redundant. The benchmark keys are
dated permaslugs (`anthropic/claude-opus-5-20260723`) while `models[].slug` is
bare, so the join goes permaslug → slug → the bare llm-stats id. llm-stats has
no comparable design metric: its design/UI benchmark pages (`design2code`,
`artifacts-bench`, `webdev-arena`, `svg-bench`, …) carry 1–5 rows each, all
self-reported with zero verified results.

**Design quality — designarena.ai endpoint (second route).** Fetched only when
a ranked role weights `website` (i.e. `designer` is enabled) — it is the sole
role-exclusive source, so a stock run skips it and the OpenRouter mirror above
stands alone. The keyless
`POST https://www.designarena.ai/api/leaderboard` (body `{arenaType, category}`,
no Authorization header) returns the same Elo family *with* battle counts:
`data[] = {modelId, elo, battles, winRate, btStdErr, …}`. Two boards are
fetched daily — `models/website` feeds the metric, `agents/agon_webapps` feeds
the report's `agon` context column — and cached in `designarena-fetched-data.json`.
Board ids are undated and separator-inconsistent (`claude-fable-5-1` vs
llm-stats `claude-fable-5.1`), so both sides join through `normalizeDesignId`
(case-folded, separators stripped, trailing dated snapshot dropped): the raw
join hits 82 of 399 llm-stats ids, the normalized join 106; the 7 collisions
are dated-snapshot pairs (`gpt-4o-2024-08-06`/`-05-13`, `deepseek-v4-flash-0731`/
`-0423`, …), first row kept. The two routes are never averaged (same Elo
family, mean diff −1.0 website … −5.1 svg, maxAbs 87): an endpoint Elo
overrides the OpenRouter mirror only at ≥ 300 battles (`DESIGN_MIN_BATTLES`),
otherwise the mirror snapshot stands. The union raises designer-pool design
coverage to 51/87 = 58.6% (mirror alone 42/87); the 9 endpoint-only pool
recoveries include `gpt-6-astra`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`,
`gpt-6-sol`, `gpt-6-luna`, `deepseek-v4.1-flash`, `mistral-medium-3-5` and
`gpt-4o-2024-08-06`.

**Writing quality — the writing leaderboard's canonical export.** Fetched only
when a ranked role weights `writing`. Unlike the leaderboard pages, this source
has a real machine-readable endpoint: the page's JSON-LD `#ranking` ItemList
(`https://llm-stats.com/leaderboards/best-ai-for-writing`) mirrors
`https://llm-stats.com/research/best-ai-for-writing/evidence.json` — a CC BY 4.0,
hourly-refreshed export whose `records[]` carry `modelId` (the bare llm-stats id,
so the join is direct, 15/15 hit), `writingBenchScore` (0–1), organization, and
the secondary communication index. WritingBench is the page's primary signal
(1,239 prompts, 6 domains); the table's "Rating (conservative)" column is the
*communication index* (`index_communication` in the main leaderboard, already in
the find payload) and the page states it "is not substituted for the writing
score", so the export — not the table — defines the metric. The ranking is
narrow: 15 models, all Qwen, all `self_reported`/`verified: false` in the
export, so `writing` is a sparse capability metric (see Scoring), never a
`required` gate. Cached daily in `writing-fetched-data.json`.

## Scoring

Per role, each metric is cardinal-normalized with **fixed anchors** (no ranks —
the scale is sample-independent): llm-stats `index_*` scores are interval-scale
with arbitrary zero (observed −16..+60), mapped affinely `(v+20)/80`; benchmarks
are chance-anchored pass rates (gpqa 0.25 four-way guessing baseline, others
chance ≈ 0); throughput is log-anchored 10..300 tok/s (equal log-ratios count
equally, saturated outside the anchors). The weightable benchmark set is `mrcr`,
`gpqa`, `aime`, `swe_bench`, `arc_agi`, `terminal_bench`, `tau_bench`; the last
six are sparse (gpqa 62.5%, aime 30.5%, swe_bench 29.0%, arc_agi/terminal_bench/
tau_bench ~5-6% of the field), so weight them as differentiators, never as
`required` gates. The quality composite
`q = Σ (weight / (1 − w_price)) × metric` excludes price; the sort key is
`value = q − λ·$/M` with `λ = (w_price/(1−w_price)) / $20` — the price weight's
share, overridable per role via plugin settings `roles.<role>.lambda`. Report
tables show each metric's weighted contribution after a `|` (they sum to `q`;
`—` = missing optional metric, contributes 0) plus the `q` and `value` columns.
Price is OpenRouter's standard-route $/M (3:1 input:output blend) — the penalty
axis, never blended. Every role weights price AND throughput. A model is
eligible for a role only when all `required` metrics are non-null (`required`
is the eligibility gate, independent of weights — e.g. every role requires
throughput without weighting it) and it has a billed price. **★** marks the
Pareto frontier (no eligible model is both cheaper and better on `q`). Cardinal
scoring kills two percentile artifacts: rank compression (real magnitude gaps
now count — e.g. @default flipped DeepSeek-V4.1-Flash → GPT-6 Astra) and
field-dependent scales (adding a model no longer reshuffles everyone).

`website` is the first of the two **derived** metrics: Design Arena `models-website` Elo
(the two routes merged, see Data sources) converted to a percentile within the
design-covered population (121 of 399 models), so it is role-independent and
identical for every role that weights it. Models without Design Arena data
get the capability-consistent fill **0.195** — the percentile implied by the
uncovered cohort's mean general index (29.8 vs covered 38.2) — not the
covered median: the covered set is self-selected (arena participation picks
stronger, cheaper models), so the covered median overstates an unmeasured
model. A regression fill was rejected (a least-squares fit saturates at 0 for
~19% of the uncovered eligible pool; a nearest-neighbour fill is
discontinuous, 0.49 jumps between models 0.06 index points apart), and both
would double-count capability that `general`/`code`/`vision` already carry.
The report marks a filled value `~` in the model column.

`writing` is the WritingBench score (0–1, already cardinal — identity
transform) from the writing leaderboard's export. Coverage is 15 of 400 models,
all Qwen, so it takes the capability fill **0.195** and is marked `~` in the
report; like `website`/`long_context` it MUST NOT be a `required` gate — that
would disqualify every model the source does not cover. Weight it as a
differentiator, not a coverage score: with the `writing` role profile the
create-agent skill produces, it moves the leader to the export's #1
(`qwen3-235b-a22b-thinking-2507`), and five of the explorer's top six are Qwen —
the source measures only Qwen, so a Qwen-leaning leader is what the metric
encodes, not an independent verdict.

**The 0.195 fill is a stated assumption, not a calibration.** The scalar is the
percentile implied by the *capability* cohort's uncovered-mean general index
(29.8 vs covered 38.2), and it is applied to every sparse capability metric
unchanged. For `writing` that cohort is **stronger, not weaker**: the 15 covered
models average general 19.8 against 22.2 for the uncovered 385, so the same
construction yields **0.513** — the shared constant therefore *understates* an
unmeasured model's writing. It stays at 0.195 because the constant is
deliberately conservative (it can never inflate a model the source did not
measure) and 15 self-reported, unverified rows cannot calibrate a per-metric
fill; the source's own methodology says "missing evidence is not proof of poor
writing ability". Making it per-metric (`CAPABILITY_FILL` in `src/engine.ts`,
`writing: 0.513`) is a one-line change that would lift every non-Qwen model's
`q` for this role.

Roles with a `thinking` level rank on the **thinking-adjusted price**: the
billed blend scales by the level's factor `(3ρ+1+T)/(3ρ+1)` (ρ = input:output
price ratio 1:4; T = thinking tokens per visible-output token: off 0, minimal
0.25, low 0.75, medium 1.5, high 3, xhigh 6, max 12, auto 1.5) — thinking
tokens bill as output, so a `:max` role pays ~8× the blend's assumed output
share. The factor is gated per model on what the model will actually run: the
omp catalog's per-model `thinking[]` wins when available — a model whose level
list excludes the role's level is priced bare, because omp clamps unsupported
levels and the written selector stays bare in that case (ranking and write
agree); meta levels (`off`, `auto`) need only a non-empty list. Without the
catalog (standalone ranking), the OR `supports_reasoning` flag gates. Bare
roles are not adjusted (the session `defaultThinkingLevel` is
user-controlled). The report's `$/M` column and the explorer show the
effective price.

Roles and weights (see `DEFAULT_ROLES` in `src/settings.ts`, overridable via
plugin settings): `default` (quality-heavy workhorse), `smol` (cheap+fast),
`slow` (capability-heavy), `vision` (requires image input), `plan`
(reasoning/long-context), `commit`, `tiny` (price+throughput dominated),
`task` (agentic), `advisor` (deep reasoning, cost-aware), and the opt-in
`designer` (visual/UX, image input; `enabled: false` by default — the plugin
skips it and its Design Arena source until `roles.designer.enabled=true`).

Weight design rules (2026-09-27 review):

- **Coverage-aware.** A missing weighted metric contributes 0 while still
  occupying its share of the `(1 − w_price)` denominator, so weight on a sparse
  metric is a data-coverage lottery, not a quality signal. Coverage over the
  eligible pool: `general`/`reasoning`/`price`/`throughput` 100%, `code` 84%,
  `math` 83%, `tool_calling` 78%, `agents` 76%, `long_context` 39%, `search`
  34%, `mrcr` 13%. The shipped defaults weight the 100%-coverage backbone plus
  the partial-coverage trio at reduced share; `mrcr` and `search` are not
  weighted at all and `long_context` is capped at 0.14. Two sparse metrics are
  capability-filled (0.195) rather than 0-filled, so a missing value is not a
  penalty: `website` (58.6% of the designer pool after the designarena.ai
  endpoint union) and, since the 2026-09-30 advisor rebalance, `long_context`
  (44.7% of the advisor pool). `website` is weighted at 0.18 in `designer` only
  (raised from 0.10 at introduction, with `code` cut 0.18 → 0.10: the two
  correlate at r = 0.876, so the old pair double-counted one capability axis).
- **Non-collinear differentiation.** The capability indices are one latent
  factor (Pearson r over the pool: general↔reasoning 0.99, code↔agents 0.95,
  general↔code 0.94), so re-weighting them barely separates roles. Roles are
  differentiated on the independent axes instead — throughput (r 0.13 with
  general), price (r ≈ 0), and the specialist metrics.
- **Price and throughput in every role.** Every role weights both; `default`
  was the exception until this review (throughput was required but unweighted).
- **λ from the intended posture.** `λ = (w_price/(1−w_price))/$20` is the
  quality-per-dollar exchange rate, so a price weight whose leader-flip
  threshold is 10–30× away is decoration. `plan`/`advisor` now carry price
  0.12/0.20 (λ 0.00682/0.0125) so cost is a real tiebreaker (advisor raised
  0.08 → 0.12 → 0.20 across the 2026-09-30 reviews); `tiny` stays at
  0.40 because it already returns a cheap top-5 on the actionable pool.

Value review (2026-09-30, owner stance: "the cheapest model that can do the
task, not the overpowered one"). Three findings, each measured on that day's
caches:

- **`w_price` is the only cost knob.** `q = Σ (w_m/(1−w_price))·m` is a weighted
  *mean* of the cardinal metrics, so raising `price` while rescaling the other
  weights to keep Σ = 1 leaves `q` bit-identical (verified: DeepSeek-V4.1-Flash
  q = 0.810 at every `w_price` from 0.02 to 0.40). The capability weights set
  the shape; `w_price` alone sets the exchange rate. Raised: `default` 0.05 →
  0.10, `vision` 0.04 → 0.12, `plan` 0.10 → 0.12, `advisor` 0.08 → 0.12 (each
  with the rest rescaled, so every `q` and every metric *share* is unchanged).
- **`thinking` is a second, hidden λ.** The level factor (off 1.00, low 1.43,
  medium/auto 1.86, high 2.71, xhigh 4.43, max 7.86) multiplies the price axis
  and never `q` — `rankRole` has no term that rewards deliberation, so a level
  is pure cost, and it silently scales λ by the same factor (`slow` at `:max`
  ran λ_eff 0.0207, 7.9× its nominal 0.00263 — stricter than `smol`). Lowered
  `slow` max → high (same GLM-5.3 pick, $8.34 → $2.88/M) and `plan`/`designer`
  high → `auto` ($3.39 → $2.32, $0.63 → $0.43). `auto`, not `medium`: no
  reachable model lists `medium` in its catalog `thinking[]`, so a `medium` pin
  writes **bare** at a bare price while the session default (`auto`) bills
  1.86× — `auto` is a meta level (always written, and `META_LEVELS`) at the
  same overhead, so the written selector and the priced selector agree.
- **The switch margin hides dollars.** `switchMargin` is a flat band on
  `value`, so it vetoes switches worth up to `switchMargin / λ` $/M — $7.60/M
  at `default`'s λ, $5.18 at `vision`'s, $4.60 at `advisor`'s. Measured
  consequence that day: `default`/`smol`/`commit` kept GLM-5.3 ($1.06) over
  DeepSeek-V4.1-Flash ($0.23) on value gaps of 0.002–0.003, and `task` kept a
  model that was both 4.6× pricier *and* 0.007 q worse. `priceSwitchFraction`
  (default 0.5) closes the hole: inside the margin, a challenger at ≥ half the
  effective $/M is adopted (`switched-cost`). Fleet effect after the pack
  (weights + levels + override), priced on the reachable pool: `default`,
  `smol`, `commit`, `task` → `deepseek-v4.1-flash` ($0.23), `vision` →
  `deepseek-v4.1-flash:auto` ($0.43 vs `kimi-k3:auto` $7.70), `tiny` →
  `ling-3.0-flash-fin` ($0.07), `designer` → `deepseek-v4.1-flash:auto`
  ($0.43 vs `kimi-k3:high` $11.25), `slow` keeps GLM-5.3 at `:high` ($2.88),
  `plan`/`advisor` keep Hy4 preview ($2.32 / $1.25).
  The quality given up is real but small: `default` GLM-5.3 → DeepSeek is
  −0.004 q for 4.6× less money (`vision` −0.041 for 18×, `designer` −0.010 for
  26×, `task` +0.007 for 4.6×); `slow`'s max → high moves no model and no q,
  only the billed factor. The
  ranking is still capability-first — the price weight decides where on the
  frontier each role stops, and concentration on one vendor is the price of
  the cheapest pick (fallback chains mitigate it).

## Usage

```
node llm-role-rank.ts [--top N] [--json] [--out FILE] [--refresh] [--all] [--url URL]
node update-roles.ts [--dry-run] [--json]
node create-role.ts --name <role> --weights m=w,... [--required m,...] [--thinking <level>] [--description <text>] [--image] [--lambda N] [--lock PATH] [--dry-run] [--json]
node create-agent.ts --name <name> --purpose <text> [--archetype ID] [--weights m=w,...] [--required m,...] [--thinking <level>] [--tools a,b] [--scope user|project] [--image] [--body TEXT|--body-file PATH] [--force] [--lock PATH] [--dry-run] [--json] [--list-archetypes]
node explore.ts [--port N] [--lock PATH] [--refresh] [--no-open]
npm run explore [-- --port N --lock PATH --refresh --no-open]
node --test tests/

/refresh-roles                       # in-session (omp)
/explore-roles [--port N] [--no-open]  # in-session explorer (omp)
/create-agent --name <n> --purpose <text> [--list-archetypes]  # agent + role + wiring (omp)
```

- `llm-role-rank.ts` default: markdown report to stdout (per-role tables with
  per-metric weighted-contribution columns + suggested `settings.modelRoles`).
- `--top N`: rows per role (default 10). `--json`: machine payload
  (`fetchedAt, source, modelCount, roles{role:[{rank, modelId, name,
  organization, value, q, lambda, paretoFrontier, priceBlendedUsdPerM,
  priceEffUsdPerM, throughputTokS, contextTokens}]}`). `--out FILE`:
  write instead of stdout. `--refresh`: bypass both caches. `--all`: include
  opt-in roles (designer) — the default ranks the nine built-in roles only and
  skips Design Arena. `--url`: override the llm-stats page URL.
- `update-roles.ts` runs the plugin pipeline headlessly (key + catalog via the
  `omp` CLI); `--dry-run` prints decisions without writing, `--json` emits
  `{wrote, aborted, decisions[]}` only.
- `create-role.ts` adds/updates one role in the plugin settings lock file
  (validated through `resolveSettings`, backup + atomic write); `--dry-run`
  validates without writing, `--json` prints the payload. The shipped skill
  `omp-llm-role-create-agent` drives it together with agent authoring.
- `/create-agent --name <n> --purpose "<one sentence>"` creates **both halves in
  one command**: it fits the weights to the purpose from the archetype table
  (`src/role-archetypes.ts`, printable with `--list-archetypes`), writes the
  validated role, authors `~/.omp/agent/agents/<n>.md` with
  `model: "@<n>, @default"` and the archetype's tool allowlist, then runs the
  updater in-process so `modelRoles.<n>` lands in `config.yml` — no second step.
  `--archetype` forces a set; `--weights` overrides it (both invariants are
  enforced: Σ = 1 and Σ(non-price) = 1 − w_price); `--tools` replaces the
  allowlist (the read-only set keeps the roster badge); `--scope project` writes
  into `<anchor>/.omp/agents/` instead of the user dir; `--body-file` supplies a
  hand-written body in place of the archetype scaffold; `--force` overwrites an
  existing agent file (without it, an existing file is refused and **no role is
  written** — the run is all-or-nothing). Outside a session the same code path is
  `node create-agent.ts …`, which stops after the two writes and points at
  `node update-roles.ts`.
- `/explore-roles` (in-session, the normal way): boots the same explorer server
  **in-process** inside omp — no `node explore.ts` subprocess, catalog from the
  live model registry — prints the URL, and opens the browser. `--port` picks a
  preferred port (default 5177; a busy port falls back to a free one, so two
  sessions never collide) and `--no-open` skips the browser. Invoking it again
  in the same session re-notifies the running URL instead of rebinding; the
  server is closed on session shutdown.
- `explore.ts` is the headless/out-of-session shim over the same launcher
  (`src/explorer/boot.ts`), for use without an omp session or in scripts;
  `--port` (default 5177), `--lock` (default
  `~/.omp/plugins/omp-plugins.lock.json`), `--refresh` (force a refetch before
  serving), `--no-open` (skip the browser launch). `npm run explore` is the
  same command (pass flags after `--`).

## Explorer (interactive ranking UI)

`/explore-roles` in omp (or `node explore.ts` outside it) boots a loopback-only
web UI (`http://127.0.0.1:5177`) that
answers "why is model X at rank 7 for `@slow`?" and "what happens if I care
more about price than agents?" without editing `src/settings.ts` and re-running
the CLI.

- **Rank table** — every eligible model for the selected role, with `value`,
  `q`, `$/M` (effective, thinking-adjusted), `tok/s`, `ctx`, a `★` Pareto
  marker, and a `Δ` column showing the
  rank delta against the role's **effective** def (what the plugin does today).
- **Explain panel** — click a row for the full decomposition: each weighted
  metric's raw value → cardinal transform → renormalized weight → contribution
  (bars show share of `q`), the cost block (`λ`, effective vs billed price,
  `penalty = λ·price`,
  `value = q − penalty`), "why not higher" (the value gap to the model above
  plus the per-metric target that would close it, with unreachable/extrapolated
  notes), and the models that dominate it on (price, q).
- **Weight editor** — edit the role's description, weights, `required` set,
  `filters.image`, `thinking` level, and `λ` override live; the table re-ranks on
  every change (120 ms debounce). Weights are edited freely (no implicit
  rescaling): the `Σ` readout turns red until `|Σ − 1| ≤ 0.01`, and `Normalize`
  rescales in one click. Changing the price weight visibly changes `λ`.
- **Role tabs** — the tab strip lists every role the plugin knows, not just the
  ones it ranks today: the nine omp built-in roles, the shipped opt-in
  `designer`, and any role present only in the lock file. Each tab is tinted by
  provenance — `default` (omp built-in), `plugin` (shipped but opt-in), `user`
  (lock-file only) — and a disabled role is muted and dashed. Selecting a
  disabled role still ranks its models; its `Δ` column measures against the
  role's effective def.
- **Enabled toggle** — the editor's `Enabled` checkbox opts a role in or out.
  Exporting writes `enabled` into the lock file; the next updater run drops a
  disabled role from the resolved set and deletes its `modelRoles.<role>` line,
  and re-enabling restores it. Disabling one role never touches the others.
- **Locked toggle** — the editor's `Locked` checkbox (persisted as
  `roles.<role>.locked`) tells the plugin to leave the role alone: it is still
  ranked and shown, but the updater never rewrites its `modelRoles` selector or
  its fallback chain and never removes it. Enable/disable still applies, so a
  locked role can also be switched off. Unchecking restores normal daily
  updates.
- **New role** — the `+ new role` tab creates a role from a template
  (`general/code/price/throughput`, Σ 1.0) that you then tune and Export. A role
  with no shipped default is fully editable: `Reset to shipped default` is
  hidden, and `×` deletes an added metric outright (the deep-merge parking at
  `0.001` only applies to metrics the shipped default weights).
- **Thinking level** — a per-role select over the eight `SUFFIX_LEVELS`
  (`off`…`max`, `auto`) plus `— (bare)`. The level is the role's `thinking`
  field: it is appended to the written selector (`:level`) and scales the price
  axis by `(3ρ+1+T)/(3ρ+1)` for models that will actually run it (omp catalog
  `thinking[]` membership; meta levels `off`/`auto` need only a non-empty list).
  The readout shows the factor (`price ×N on models that run :level`); the
  rank table's `$/M` and the explain panel's cost line are the thinking-adjusted
  effective price. `— (bare)` is disabled when the role's shipped default or the
  lock file already sets a level — the plugin deep-merges roles over
  `DEFAULT_ROLES`, so an omitted `thinking` key keeps the inherited value and
  bare is not restorable once a level is set.
- **Export** — writes the edited roles into the plugin's settings lock file
  (`~/.omp/plugins/omp-plugins.lock.json` → `settings["omp-llm-role"].roles`),
  atomically and with a `.bak-<timestamp>` sibling, touching only the roles you
  edited (the `plugins` block and sibling settings keys are preserved). The
  change takes effect on the next `/refresh-roles` **in any running session** —
  the lock file is re-read from disk on every run (`readPluginSettingsMap` does
  a fresh `readFileSync` per call), so a session started before the write picks
  the new settings up too. Day-gated session-start runs read it the same way
  on the day they fire.
  `Copy JSON` / `Download JSON` emit the same dirty-roles payload for manual use.
- **Hover explanations** — every column header, metric name, role tab, and
  control carries a tooltip: the rank table's `#`/`Δ`/`★`/`value`/`q`/`$/M`/
  `tok/s`/`ctx` columns explain what they hold, metric names show their cardinal
  transform and anchors (built from `METRIC_META`, so they cannot drift from the
  engine), role tabs show the role's description, and `λ`, `Σ`, `required`, the
  `thinking` select (level semantics + the bare deep-merge caveat), the `×`
  remove button, and the export buttons explain their semantics. One
  delegated listener drives a single floating `#tip` element, so re-rendered
  tables and editors need no per-node wiring.

All ranking math is the plugin's own (`src/engine.ts`): the UI never
reimplements `value = q − λ·$/M`, so the numbers on screen are exactly the
numbers the plugin would use. The server binds `127.0.0.1` only (no auth) and
serves the SPA from `web/` with no build step and no external requests.

Both launch paths share `src/explorer/boot.ts`, so the in-session command and
the CLI cannot drift: roles come from the user-level lock file (`project: null`
— no project-anchor merge), the omp catalog gates the thinking price factor,
and `POST /api/refresh` refetches the dataset. Launching via `/explore-roles`
runs the server inside the omp process (no subprocess, catalog straight from
the live model registry); a busy preferred port falls back to a free one, and
the handle is closed on session shutdown. The CLI shim keeps the process alive
on the listening handle so `node explore.ts` stays up until interrupted.

Because the plugin's settings are **overrides deep-merged over `DEFAULT_ROLES`**,
a role's weight keys are additive: you can adjust values and add metrics, but a
metric the shipped default weights cannot be dropped from the key set (the
default's weight survives the merge and the sum check fails). The editor's `×`
therefore parks an inherited metric at a negligible weight (`0.001`) instead of
deleting the key — click `Normalize` to redistribute (it rescales the ε too) and
the export validates; metrics you added yourself are deleted outright. The same
merge applies to `thinking`: a role whose shipped default (or lock file) sets a
level cannot be returned to bare by omitting the key, so the editor disables
`— (bare)` for those roles.

## Caching

All five caches are fresh while their `fetchedAt` is the current UTC day, and
resolve against the repo root (never the process cwd — the plugin runs with
arbitrary cwd inside omp).

- llm-stats cache: `{fetchedAt, source, modelCount, rankings[]}` (pretty-printed).
- OpenRouter cache: `{fetchedAt, source, modelCount, data}` where `data` is the
  verbatim `find?fmt=cards` response data (all sections: models, endpoint_perf,
  analytics, benchmarks, benchmark_ranges, categories, modality_counts). The
  throughput and price maps are re-derived from it on every run — the file is
  the single source of truth for anything OpenRouter returned.
- OpenRouter endpoints cache: `{fetchedAt, source, slugCount, slugs}` where
  `slugs` maps each fetched model slug to its narrowed per-provider route
  records (id, provider, tier, status, price, p50s). ~150 pages of 1–2 MB are
  fetched with an 8-worker pool on first run of the day (~5 s on a fast line);
  a page that fails is absent and that model keeps the single-route fallback.
- Design Arena cache: `{fetchedAt, source, categories}` where `categories`
  maps the two board keys (`models/website`, `agents/agon_webapps`) to their
  rows — same fresh → fetch → stale chain; an empty board is never cached.
- Writing cache: `{fetchedAt, source, scores}` where `scores` maps the bare
  llm-stats id to its WritingBench score — same fresh → fetch → stale chain; an
  unusable payload or an empty record set is never cached.

Fallback chain (every cache): fresh cache → live fetch (writes cache) → stale
cache → no enrichment (affected models unranked, or single-route for the
pages). An empty/unusable OpenRouter payload is never cached, so the next run
retries. llm-stats fetch failure is fatal (no data at all); OpenRouter and
Design Arena failures are non-fatal.

## Releasing

`version` in `package.json` is the release switch — bump it, commit, then
publish through any channel (same tree, no build step):

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

The npm tarball ships exactly the `files` whitelist in `package.json`
(`src/`, `web/`, `agents/`, `skills/`, the CLI scripts, `SPEC.md`) — caches and
tests stay out. Gate: `node --test tests/`.

Install routes verified 2026-10-01 (omp 18.4.8): npm (local-registry
simulation of the packed tarball), git (local git daemon), marketplace (local
path, plus `marketplace update` + `upgrade` to a bumped catalog version), and
`link` — every post-install session run wrote `modelRoles` +
`retry.fallbackChains` and appended a history row. The public GitHub URLs
(`github:Gott50/…`, `marketplace add Gott50/…`) fail until the repo is
public (404 / auth error).

## Current state (2026-10-01)

- Designer agent opt-in (2026-10-01): the shipped `designer` agent is now
  **disabled by default**, matching the opt-in role. omp has no per-agent
  frontmatter gate (`parseAgentFields` has no `enabled`; `discoverAgents` scans
  `<ext>/agents/*.md` unconditionally), so the plugin manages the core
  `task.disabledAgents` key in `config.yml` — the same key the `/agents` hub
  writes. `SHIPPED_AGENTS` (`src/settings.ts`) names the shipped agents; the
  updater keeps each in `task.disabledAgents` unless its same-named role is in
  the resolved set, so `designer` is disabled until
  `roles.designer.enabled=true`. `config-edit.ts` gained a surgical
  `task.disabledAgents` patch (add/remove names, other entries and order
  preserved, self-checked) and `parseConfig` reads it back. The sync is **not
  day-gated** (enabling the role takes effect on the next session, not the next
  day) and runs on every session start. Verified live (omp 18.4.8): a session
  whose config had no entry gained `task:` → `disabledAgents:` → `- "designer"`
  and a `designer` spawn in that same session failed preflight with *Agent
  "designer" is disabled in settings*; with the entry removed the child spawned
  and replied. Cost: the plugin owns the `designer` entry, so a manual `/agents`
  toggle is overridden on the next run.

- `/create-agent` (2026-10-01): one omp command creates an agent **and** its role and
  wires them. It runs **omp's agent-creation architect** in-process
  (`src/agent-architect.ts`: the `/agents` hub's prompt shipped verbatim in
  `src/prompts/`, run through `createAgentSession` with no tools) to author the routing
  rule and the body, then adds the `model: "@<n>, @default"` and `tools:` frontmatter
  omp's own writer omits. It fits the weights to `--purpose` from the archetype table
  (`src/role-archetypes.ts`, ten sets, printable with `--list-archetypes`), asks the user
  for any extra benchmarks to fold in (listing every weightable metric with
  `--list-benchmarks`, so duplicates are visible; `--benchmarks m,...` covers headless
  runs), writes the validated role, and runs the updater **in-process** so
  `modelRoles.<n>` lands in `config.yml` in the same command. All-or-nothing: a name
  outside `[A-Za-z0-9_-]+`, a reserved name, an existing agent file without `--force`, or
  weights violating Σ = 1 / Σ(non-price) = 1 − w_price abort before either write.
  `node create-agent.ts` is the same code path outside a session, except it has no omp
  session: it uses the archetype template instead of the architect and takes
  `--benchmarks` instead of prompting (it stops after the two writes and points at
  `update-roles.ts`). Verified live (omp 18.4.8, `--mode rpc` — print mode does not
  dispatch slash commands): `/create-agent --name sqlanalyst --purpose "analyze data and
  write SQL queries for the analytics warehouse"` fitted the `data` archetype (matched
  analy, data, sql), wrote the role and the agent file, and the same command's updater
  pass logged `@sqlanalyst: (unset) -> openrouter/z-ai/glm-5.3:high` and wrote
  `config.yml`; a headless spawn then returned
  `{"agent":"sqlanalyst","agentSource":"user","modelRole":"sqlanalyst"}` with
  `resolvedModel: "openrouter/z-ai/glm-5.3:high"` against a parent on
  `deepseek/deepseek-v4.1-flash` (pre-architect run). The architect path is verified
  live (omp 18.4.8, `--mode rpc`, temp lock + `OMP_LLM_ROLE_AGENT_DIR`): the architect
  ran in-process (~180-260 s), authored a full omp-style body, and the written
  `archtest2.md` carried the architect's `whenToUse` as `description` plus the plugin's
  `model: "@archtest2, @default"` and `tools:` frontmatter; `--benchmarks writing` folded
  `writing` in and rebalanced (Σ = 1, non-price = 0.84 = 1 − 0.16), and a duplicate
  (`--benchmarks long_context` on the `docs` archetype) was reported and skipped.
  The six raw llm-stats benchmark pass rates (`gpqa`, `aime`, `swe_bench`, `arc_agi`,
  `terminal_bench`, `tau_bench`) are now weightable too — they were already in
  `Model.metrics` and scored by `cardinalMetric`, but `resolveSettings` rejected them,
  so "another benchmark" had no referent. They are sparse (gpqa 62.5%, aime 30.5%,
  swe_bench 29.0%, arc_agi/terminal_bench/tau_bench ~5-6%), so they are differentiators,
  never `required` gates; no shipped role weights them, so the report is unchanged.

- Explorer in the plugin (2026-10-01): `/explore-roles` boots the ranking UI
  **in-process** inside omp — no `node explore.ts` subprocess, catalog from
  `ctx.modelRegistry.getAvailable()` — notifies the URL and opens the browser.
  A busy preferred port falls back to a free one; a second invocation in the
  same session re-notifies the running URL instead of rebinding; the handle is
  closed on `session_shutdown`. Both launch paths share the new
  `src/explorer/boot.ts` (plus `PLUGIN_SETTINGS_PATH` in `src/settings.ts`), and
  the extension sets `unref` so a short-lived `omp -p` run cannot hang on the
  server. Verified live (omp 18.4.8): `omp -p "/explore-roles --no-open --port N"`
  boots and exits in ~0.5 s; a TUI session answered `/api/bootstrap` on the bound
  port, refused to bind a second port on re-invocation, and released the port on
  exit.

- Agent + role creation (2026-10-01): the plugin ships the
  `omp-llm-role-create-agent` skill (discovered from the plugin's `skills/` root;
  verified via `read skill://omp-llm-role-create-agent`), `create-role.ts` (typed,
  validated role write into the settings lock file), the `/create-agent` command
  (agent + role + wiring in one shot), and an explorer `+ new role`
  button + description editor. Roles with no shipped default are fully editable
  (no `Reset to shipped default`). `resolveSettings` now deep-merges a nested
  `roles` object with flat dotted keys in either order (previously a nested
  `roles` key replaced the flat patch, dropping sibling role settings).
- Writing metric + user-created role (2026-10-01): the `writing` metric
  (WritingBench, from the writing leaderboard's canonical export) is plugin
  plumbing — fetch/cache/parse plus `applyWritingScores` in `src/engine.ts`,
  gated on a ranked role weighting `writing`. The role and its agent are **user
  artifacts**, produced through the plugin's own surfaces and verified as a
  user-flow e2e rather than committed as repo code: `node create-role.ts --name
  writing --weights general=0.24,reasoning=0.16,long_context=0.10,writing=0.26,
  price=0.14,throughput=0.10 --required general,price,throughput --thinking auto`
  wrote `roles.writing` into `~/.omp/plugins/omp-plugins.lock.json` (Σ 1.0,
  backup first), the agent was authored at the **user** path
  `~/.omp/agent/agents/writing.md` pinning `model: "@writing, @default"`, and
  `node update-roles.ts` logged `@writing: (unset) ->
  openrouter/qwen/qwen3-235b-a22b-thinking-2507:auto` and wrote the key into
  `config.yml`. Verified live from a clean slate (role deleted from the lock, key
  dropped from the config): the explorer ranks it (Qwen3-235B-A22B-Thinking-2507
  #1, value 0.621), a headless spawn returned
  `{"agent":"writing","agentSource":"user","modelRole":"writing"}` with
  `resolvedModel: "openrouter/qwen/qwen3-235b-a22b-thinking-2507:low"` instead of
  the parent's `deepseek/deepseek-v4.1-flash`, and the composition panel's
  contributions sum exactly to `q` (0.635161) after `explainModel` learned to
  mirror `rankRole`'s capability fill. `writing` is sparse (15/400, all Qwen) and
  capability-filled at 0.195 — a stated assumption, see Scoring.
- Not in the report (2026-10-01): `llm-role-rankings.md` is generated over
  `DEFAULT_ROLES` only, so the `writing` metric and the `writing` role cannot
  appear in it and AGENTS.md's report-refresh step is a no-op for them. The
  explorer is the surface for user-created roles; regenerate the report only for
  generator changes.
- Release-ready (2026-10-01): no runtime dependencies — `config-edit.ts` reads
  and self-checks the config line-oriented (`yaml` is dev-only, used by tests
  to validate patch output with the real parser). `package.json` carries npm
  metadata + a `files` whitelist; the repo ships an MIT `LICENSE` and is its
  own marketplace (`.omp-plugin/marketplace.json`, `gott50-plugins`) — install
  via `omp plugin install omp-llm-role`, `github:Gott50/omp-llm-role`, or
  `omp-llm-role@gott50-plugins`. See Releasing.
- Designer is opt-in (2026-10-01): `designer` ships `enabled: false`, so a stock
  run ranks the nine built-in roles and skips the Design Arena endpoint (the
  sole role-exclusive source). Enable with
  `omp plugin config set omp-llm-role config '{"roles":{"designer":{"enabled":true}}}'`. The
  `designer` agent moved from `~/.omp/agent/agents/designer.md` into the repo
  `agents/designer.md`), discovered from the plugin's extension root — linking
  the plugin ships it, no install step. It pins `model: "@designer, @default"`:
  with the role disabled the unresolved first entry is skipped and the child
  runs on `@default` (a bare `@designer` would hard-fail — an unresolved `@x`
  is a literal pattern, not a parent-model fallback; verified live, spawn
  record `modelRole: "default"` with `modelRoles.designer` absent). A role that
  leaves the managed set now has its `modelRoles.<role>` line deleted (new
  `roleRemovals` in `ConfigPatch`), so the stale pin is cleaned up on the next
  run. The CLI report keeps documenting all shipped roles via `--all` (the
  default now ranks the nine built-in roles and omits the Design Arena legend).
  The live config's `modelRoles.designer` and `modelTags.designer` were removed
  (2026-10-01); the agent now resolves `modelRole: "default"`.
- Advisor rebalance (2026-09-30): `advisor` weights now
  `{reasoning 0.3498, general 0.2449, long_context 0.1004, price 0.20,
  throughput 0.1049}` (Σ 1.0). `math` dropped (76.3% coverage, r 0.759 with
  reasoning — collinear *and* a lottery); `long_context` kept (the most
  independent capability axis, r 0.739/0.767 with reasoning/general) but now
  capability-filled at 0.195 like `website` (new `CAPABILITY_FILL` in
  `src/engine.ts`), so its 44.7% coverage no longer penalizes; `price`
  0.12 → 0.20 (λ 0.00682 → 0.0125, so the switch margin vetoes only up to
  $1.60/M instead of $2.93/M) and `throughput` 0.0382 → 0.1049 because the
  advisor fires on every primary *and* `task` subagent turn
  (`task.agentAdvisor.task: on`) and `syncBacklog: "1"` lets a slow advisor
  stall the primary up to 30s. The ranking leader moves Hy4 preview → Muse
  Spark 1.3 (0.775, $3.71; Hy4 falls to #8, 0.735), but the plugin dry-run
  keeps Hy4 (`kept-margin`: Muse Spark 1.3 is blocked by the account
  whitelist and the best eligible, GLM-5.3 at 0.7421, is inside the 0.02
  margin of Hy4's 0.7347). Models with no `long_context` score are no longer
  clustered at the bottom of the top-10.
- Suffix honesty pass (2026-09-30): `default`/`task`/`advisor` pinned to
  `auto` and `tiny` to `off` (previously bare), so the ranking prices the
  effort the session `defaultThinkingLevel: auto` already applies — bare roles
  were under-stated by 1.86×. No model changes: the plugin dry-run keeps all
  ten roles and only canonicalizes the selectors (`default`/`task`/`advisor`
  gain `:auto`, `tiny` gains `:off`). `slow` stays `:high`; `plan`/`vision`/
  `designer` stay `:auto`.
- Value review landed (2026-09-30, see Scoring): `default`/`vision`/`plan`/
  `advisor` price weights raised to 0.10/0.12/0.12/0.12 (capability weights
  rescaled, every `q` unchanged), `slow` max → `high` and `plan`/`designer`
  high → `auto`, and the switch margin gained the `priceSwitchFraction`
  cost override (default 0.5). Priced on the reachable pool with the key's
  provider whitelist applied (70 ok / 62 blocked / 4 unknown of 136 probed
  today), the plugin dry-run moves `default`, `smol`, `commit`, `task` to
  `deepseek-v4.1-flash` ($1.06 → $0.23/M), `vision` to
  `deepseek-v4.1-flash:auto` ($7.70 → $0.43), `designer` to
  `deepseek-v4.1-flash:auto` ($11.25 → $0.43) and keeps `slow` on GLM-5.3 at
  `:high` ($8.34 → $2.88); `plan`/`advisor` keep Hy4 preview (`:auto`/$2.32
  each); `tiny` keeps `ling-3.0-flash-fin` ($0.07). Sum of per-role
  effective $/M drops $25.6 → $9.8 in the simulation (the suffix pass
  repriced `default`/`task`/`advisor` from bare to `:auto`). Quality given up:
  `default` −0.004 q, `vision` −0.041, `designer` −0.010; `task` gains +0.007.
- Provider-route blend (2026-09-30): price and throughput are now the
  1/price²-weighted means over every stable standard-tier provider route —
  the expected values under OpenRouter's default price-based load balancing —
  instead of the single traffic-getting route the `find` table exposes (which
  paired one provider's price with that provider's 30-minute p50 and could be
  either optimistic or pessimistic). Per-provider routes come from the
  OpenRouter model pages (new daily cache, 149/151 pages fetched today).
  Measured shifts: `deepseek-v4.1-flash` throughput 5 → 62 tok/s (its find
  route was a congested instant) → now #1 @slow/@task/@designer and top-5
  @default/@smol/@commit; `kimi-k3` price $2.56 → $4.15 (22 routes, the cheap
  ones don't get all the traffic); `qwen3.8-27b` $1.11 → $0.76 (16 routes,
  cheaper than its traffic-getter); `glm-5.3` throughput 112 → 73 tok/s (39
  routes, cheapest `baidu/fp8` gets 18% of default-routing weight at 88
  tok/s). Matched models 146 → 151/399 (page stats recover models whose find
  route had no 30-minute traffic), 150 priced. The designer #1 changes
  `gemini-3.8-flash` → `deepseek-v4.1-flash`; @default keeps `gpt-6-astra`
  (now priced at the $20.90 blend instead of the $20 find route). Plugin
  dry-run against the blend: only `@designer` (`kimi-k3:high` →
  `deepseek-v4.1-flash:high`, 0.773 vs 0.690) and `@tiny` (`glm-5.3` →
  `ling-3.0-flash-fin`, 0.774 vs 0.680) switch; the other eight roles hold
  via hysteresis.
- Explorer thinking control (2026-09-30): the weight editor gained a per-role
  `thinking` select (the eight `SUFFIX_LEVELS` + `— (bare)`) with a live price
  factor readout; the rank table's `$/M` and the explain cost line already
  reflect the thinking-adjusted effective price, so changing the level re-ranks
  immediately. `— (bare)` is disabled when the role's shipped default or the
  lock file sets a level (deep-merge: an omitted key keeps the inherited
  value). Bootstrap now ships `levels` + `thinkingOverhead`; no engine change.
- Designer value rating reworked (2026-09-30): the keyless designarena.ai
  leaderboard endpoint (`POST /api/leaderboard`, an Elo trusted over the
  OpenRouter mirror only at ≥ 300 battles) raises designer-pool design
  coverage 42/87 → 51/87 (58.6%), recovering `gpt-5.6-sol` (elo 1318, 11.5k
  battles), `gpt-6-astra`, `deepseek-v4.1-flash` and six more. The fill moves
  0.5 → 0.195 (capability-consistent: uncovered-cohort mean general 29.8 vs
  covered 38.2), cutting the covered models scoring below the fill from 14 to
  4. Weights swap `code` 0.18 → 0.10 and `website` 0.10 → 0.18 (r = 0.876
  collinearity). The report gains the `agon` column (Design Arena
  `agents/agon_webapps` Elo, context only, 22/87 covered). The designer
  top-10 now carries zero imputed rows (was 3: `qwen3.8-flash`,
  `deepseek-v4-flash-vision-exp`, `qwen3.8-27b`, all dropped out — the first
  two still have no Design Arena data in either route). The #1 pick was
  invariant across every variant measured that day (fill, weights):
  `gemini-3.8-flash` (0.768 vs 0.751 before). The 2026-09-30 provider blend
  later moved #1 to `deepseek-v4.1-flash` (top bullet).
- Session model activation shipped (2026-09-30): when the day's session-start
  run switches `default` and the triggering session's conversation is still
  empty, the plugin now also switches the live session model to the new
  selector (main sessions only; never over an explicit `omp --model`; disabled
  with `activateDefaultOnEmptySession=false`). Verified E2E in a sandbox agent
  dir: transcript shows the session boot on `deepseek-v4.1-flash`, the plugin
  `model_change` to `z-ai/glm-5.3` before the user message, and the assistant
  reply served by `z-ai/glm-5.3`. This required the session-start run to be
  awaited (previously fire-and-forget via `ctx.setTimeout`, which a
  short-lived session could exit under — the deferred run silently never
  finished). Explorer-export stale claim fixed: the lock file is re-read on
  every run, so exported weights reach the next `/refresh-roles` in any
  running session, not only a freshly started one.
- Design Arena Elo wired into `designer` (2026-09-27): OpenRouter's
  `benchmarks[permaslug].da.elo_by_category["models-website"]` is ingested as
  the `website` metric (percentile within the 73 design-covered models;
  uncovered models get the neutral covered median 0.5) and weighted 0.10 in
  `designer` (its other weights rescaled to keep Σ = 1). The design term
  reorders the designer top-5 — `Muse Spark 1.3` (measured 0.99) rises to #2,
  `MiMo-V2.6-Pro` (measured 0.97 at $0.54/M) to #5 — and the leader is
  unchanged (`Gemini 3.8 Flash`, 0.754). It also flips the shipped selector:
  the dry run now switches `modelRoles.designer`
  `deepseek-v4-flash-vision-exp:high` → `xiaomi/mimo-v2.6-pro:high` (0.702 vs
  0.663, margin 0.039 > `switchMargin`), because the incumbent has no Design
  Arena data and takes the neutral fill while MiMo carries a measured 0.97.
  The other nine roles are untouched (only `designer` weights `website`).
- 400 llm-stats models; OpenRouter matched 152/400 (throughput), 151 priced.
- Eligible per role: 143 (vision 75, designer 88, image-input filter).
- Value-ranking leaders (this report, thinking-adjusted prices; the *ranking*
  leaders, before the account's provider whitelist drops the blocked ones):
  `default` DeepSeek-V4.1-Flash (0.809), `smol` Muse Spark 1.1 (0.793, blocked
  → DeepSeek), `slow` GLM-5.3 (0.818), `vision` Qwen3.8 Flash (0.732, blocked
  → DeepSeek), `plan` Hy4 preview (0.759), `commit` Muse Spark 1.1 (0.793,
  blocked → DeepSeek), `tiny` Muse Spark 1.1 (0.814, blocked → Ling Fin),
  `task` DeepSeek-V4.1-Flash (0.755), `advisor` Muse Spark 1.3 (0.775,
  blocked → Hy4), `designer`
  DeepSeek-V4.1-Flash (0.775). The suffix pass moved `default` and `advisor`
  onto their reachable leaders (Muse Spark 1.3 and GPT-5.6 Sol were blocked).
- Thinking-adjusted pricing landed (2026-09-27): the suffix table moved into
  `DEFAULT_ROLES` as a per-role `thinking` field, and the price axis scales by
  the level's factor for thinking-capable models — `slow` (`:max`, ×7.86)
  flipped its full-pool leader GPT-5.6 Sol → GLM-5.3, `vision` (`:auto`, ×1.86)
  flipped GPT-6 Astra → GPT-5.6 Sol; bare/off roles unchanged.
- The factor is gated per model on the omp catalog's `thinking[]` (2026-09-27):
  a model whose level list excludes the role's pin is priced bare and gets no
  suffix — `slow` (`:max`) had over-priced 95 of its 112 thinking-capable
  ranked models by the clamp ratio (Hy4 preview $9.83 → $1.25, Muse Spark
  $15.71 → $2.00); meta pins (`off`, `auto`) bypass the membership check, so
  the live `vision: auto` pick is untouched.
- Weights reviewed and rebalanced (2026-09-27): coverage-aware backbone,
  throughput weighted in every role, `mrcr`/`search` dropped, `plan`/`advisor`
  price raised, `tiny` left alone. Rules in Scoring; the per-role deltas are in
  the commit that landed them.
- Reachability probed per candidate (2026-09-27, `probeModel`, one 1-token
  completion each): 76 ok / 61 blocked / 1 unknown of the 138 eligible, so the
  actionable pool is 77 (vision 34). Actionable leaders under the shipped
  weights: `default`/`smol`/`slow`/`task` GLM-5.3, `vision` Kimi K3,
  `plan`/`advisor` Hy4 preview, `commit`/`designer`
  DeepSeek-V4-Flash-Vision-Exp, `tiny` Ling 3.0 Flash Fin.
- Plugin dry-run re-verified (2026-09-27, post-restructure): all 9 existing
  roles kept their probe-clean selectors with suffixes now read from
  `roles.<role>.thinking`; the new `designer` role got managed
  (DeepSeek-V4-Flash-Vision-Exp `:high`). 64/64 unit tests green.
- `designer` wired live (2026-09-27): the forced run switched
  `modelRoles.designer` `z-ai/glm-5.3-flash` →
  `"openrouter/deepseek/deepseek-v4-flash-vision-exp:high"` and filled its chain
  (`mimo-v2.6-pro:high`, `kimi-k3:high`) — the nine other managed roles were
  kept and every non-managed key in the block was left byte-identical (the
  plugin rewrites only lines it selects). A headless design prompt then routed
  through the `designer` agent onto that selector (see omp wiring).
- Inert agent-named role keys removed (2026-09-27): `modelRoles.scout`,
  `security-reviewer`, `librarian`, `research`, `sonic` and `reviewer` deleted
  from the live config. Nothing referenced `@<name>` for them, so they selected
  no model: the bundled `scout`/`sonic` pin `@smol` and `reviewer` pins `@slow`
  (`security-reviewer` has no pin at all), and the agents that carry those names
  route through built-in roles. Re-verified live after the deletion (parent
  pinned to `deepseek-v4.1-flash`, `--mode json` spawn records):
  `{"agent":"scout","agentSource":"bundled","modelRole":"smol"}` →
  `glm-5.3:off`, `{"agent":"reviewer","agentSource":"bundled","modelRole":"slow"}`
  → `glm-5.3:max`. `modelRoles` then held exactly the ten roles the plugin
  managed (nine since `designer` went opt-in, 2026-10-01), and a forced refresh
  afterwards reported `no changes` — the plugin
  cannot re-add keys outside `settings.roles` `patchModelRoles` selects. The
  owner-written `retry.fallbackChains` key
  `openrouter/~deepseek/deepseek-v4-flash-latest` is now unreferenced by any
  role; it is left in place deliberately (SPEC §6.4: unwritten, unreferenced
  keys are never pruned), so removing it is a manual call.
- Plugin verified live (2026-09-23) with the provider-allowlist probe: the
  account's allowed-providers whitelist excludes first-party openai/azure/
  anthropic endpoints, so the probe gate rewrote `slow` → GLM-5.3 (`:max`),
  `vision` → Kimi-K3 (`:auto`), `plan` → Hy3 (`:high`), `advisor` →
  Hy4-Preview and refilled their chains with probe-clean entries; all 16
  configured roles then served on their configured selector in headless
  sessions (transcript-verified, no fallbacks).
- Plugin run re-verified live (2026-09-26) into a throwaway agent dir
  (`OMP_LLM_ROLE_AGENT_DIR` + a copy of the real config): all 9 roles kept
  their current probe-clean selectors (`commit`/`task` by margin), and the
  written chains showed the new suffix rule — solo keys suffixed
  (`ling-3.0-flash` → `:off`, `kimi-k3` → `:auto`), shared keys level-free
  (plan+advisor on `tencent/hy4-preview`, smol+slow on `z-ai/glm-5.3`).
  60/60 unit tests green.

## Known quirks

- OpenRouter p50 values are rolling routed-traffic windows (30 minutes for the
  find table, longer and per-provider for the model pages): tok/s numbers and
  close score orderings shift between runs. A captured payload is not ground
  truth — re-fetch before debugging join logic.
- The blend renormalizes throughput over the routes that have p50 data, which
  biases toward providers currently getting traffic; a stable route with no
  recent requests contributes price weight but no throughput. A degraded
  cheapest route (status ≠ 0) drops out of the blend entirely until it
  recovers — its traffic shifts to the next-cheapest providers, exactly what
  the router does, but the price can jump (e.g. `deepseek-v4-flash`'s
  $0.044/M `open-inference` route sat at status −5 today, leaving the $0.13
  blend of the remaining routes).
- The find table's route and the page's record for the same endpoint id can
  disagree by a few percent (price revisions, status flips, p50 windows) —
  the page copy wins the pool merge; the find row joins only when the page
  doesn't list its endpoint id at all.
- The blend weights routes by the documented default-strategy formula (1/p²),
  not by the page's observed request counts: the counts aggregate ALL
  OpenRouter traffic (`:nitro`/`:floor` and `sort` users included), so they
  estimate a random request's experience, not this account's default routing.
  The two estimators diverge where capacity binds — on a live deepseek-v4-flash
  probe, `gmicloud/fp8` ($0.1137) carried 37% of observed requests vs 12% at
  1/p², making the traffic-weighted blend $0.138 / 55 tok/s vs the shipped
  $0.133 / 46. Revisit if live cost/throughput diverges from the ranking.
- llm-stats has no public API; the RSC flight extraction depends on the page's
  `initialData` key (do not include `[` in the search key).
- `index_*` scores are interval-scale (observed −16..+60, can be negative); the
  fixed affine anchors (−20→0, +60→1) handle it.
- Node type-stripping does not typecheck: property-name typos surface as
  `undefined` at runtime, not compile errors. Always run the script after edits
  and sanity-check stderr match counts and eligible counts.
- The OpenRouter join is by slug suffix only; models whose llm-stats id has no
  OpenRouter counterpart — or no route with throughput data on the model page
  or in the find table's 30-minute window — are unranked.
- omp's extension registry differs from its CLI JSON in two spots (adapted in
  `src/extension.ts` only): the key comes from
  `modelRegistry.getApiKeyForProvider("openrouter")` (`getApiKey` returns
  undefined there), and registry rows carry `thinking` as an effort object
  (`{mode, efforts[], …}`) which `extDeps` normalizes to the CLI's string
  array. In print/headless mode `ctx.ui.notify` is a no-op, so the extension
  mirrors decisions and aborts to stderr.
- `writing` is a 15-model, single-org (Qwen) ranking: the source cannot
  differentiate the other 385 models, so treat the fill as "unknown", never as
  a measured 0.195 (the writing cohort's own general index implies ≈0.51, so
  0.195 is a conservative floor), and expect the role's top-10 to be Qwen-heavy
  whenever the weight is high enough to matter. The page's table sorts by the
  *communication index* (`index_communication`, 114/400, already in the find
  payload), not by WritingBench — the two disagree (the table's #1
  `claude-opus-4-6` scores 31.97 on the communication index vs Qwen's 16.37,
  while WritingBench ranks Qwen first). Do not conflate them.
- `required` is the eligibility gate, not a weight: validation checks
  `required` against the known-metric set, not against `weights`, so a role may
  require a metric it does not weight (and vice versa).
- The OpenRouter account's allowed-providers privacy whitelist blocks more
  than first-party `openai`/`azure`/`anthropic`: probed per candidate
  (2026-09-27, one 1-token completion each) 61 of 138 eligible models are
  blocked; re-probed over the ranked pool 2026-09-30 it is 62 of 136 (70 ok,
  4 unknown), and every `openai/*`, `google/*`, `meta/*` and `qwen/*` id
  probed is blocked — the four role leaders the report shows (Muse Spark,
  Gemini, Qwen, GPT) are unreachable, so the report's #1 and the written
  selector differ, and weights should be judged on the reachable pool.
  Non-blocked families include
  `deepseek/*`, `z-ai/*`, `moonshotai/*`, `tencent/*`, `inclusionai/*` and the
  open-weight families inside blocked orgs (GPT OSS, Gemma, Llama/Muse
  Glimmer, Qwen3.5/3.6) pass. Blocked is a per-selector property, never an org
  class — OpenAI has 2 ok rows and 21 blocked, Qwen 19 ok and 12 blocked — so
  reachability must be probed per candidate. The probe gate (§5.5) filters
  them before writing; without it, fallback chains silently mask the affected
  roles and `vision` hard-fails.
- Metric coverage is uneven and shifts between fetches: `mrcr` (13% of the
  eligible pool), `search` (34%) and `long_context` (39%) are absent for most
  models, and a missing weighted metric scores 0 rather than being excluded.
  Weighting them makes `q` a coverage score — the shipped defaults avoid
  `mrcr`/`search` and cap `long_context` for that reason.
- Design Arena coverage is self-selected and lags the frontier: the merged
  two-route field covers 121 of 399 models, and the covered set is
  systematically stronger and cheaper than the uncovered one (probed
  2026-09-27 at the 73-model mirror era: designer-pool mean general index
  0.58 vs 0.47, $2.19 vs $3.19/M). The endpoint route recovered the newest
  flagships (`gpt-6-astra`, `gpt-5.6-sol`, `deepseek-v4.1-flash`), but
  `qwen3.8-flash` and `deepseek-v4-flash-vision-exp` remain uncovered, so
  `website` must never be a `required` gate — it would disqualify models the
  capability roles actually pick. The metric is also partly collinear with
  the capability block (r = 0.876 with `code`), which is why `designer`
  weights it at 0.18 with `code` trimmed to 0.10 — it reorders ranks 5+ but
  never the leader.
- Residual fill inversion: 4 of the 51 design-covered designer-pool models
  still score below the 0.195 fill (`llama-4-scout` pct 0.004,
  `gpt-4o-2024-08-06` 0.021, `llama-4-maverick` 0.037, `o4-mini` 0.095) —
  down from 14 at the 0.5 covered-median fill, but absence still beats
  measurement for a weak covered minority.
- The `designer` `image: true` filter excludes `glm-5.3` (llm-stats
  `multimodal=false`) whose website Elo 1309 outranks the shipped #1
  `gemini-3.8-flash` (1308) — kept deliberately: the shipped `agents/designer.md`
  requires screenshot grounding, so the model must accept image input.
- The designer ranking was insensitive to its `thinking` pin between medium and
  high (2026-09-27 probe: only #9/#10 swap), so `high` was pure multiplier
  there; the 2026-09-30 review moved it to `auto` (same overhead as medium,
  always written).
- **Bare roles were priced as if thinking were free** (fixed 2026-09-30).
  `rankRole` charges the level factor only when the model will run the role's
  level, so a bare role was priced at the billed blend ×1 while the session
  `defaultThinkingLevel` (here `auto`) billed ~1.86× at run time — the ranking
  under-stated its cost, and a model whose catalog supports the level was
  priced differently from one that does not. `default`/`task`/`advisor` now
  pin `auto` and `tiny` pins `off`, so every shipped role carries a level and
  the ranking prices what runs. A model whose catalog lacks the pinned level
  is still priced bare (omp clamps it), which is the intended asymmetry.
- `designarena.ai/robots.txt` disallows `/api/` for `User-Agent: *` and the
  leaderboard route is `/api/leaderboard` — the daily fetch targets a
  disallowed path by explicit owner decision (robots.txt read as advisory
  for crawlers, not API clients). If the route starts failing
  (401/403/404), the non-fatal fallback leaves the ranking on the OpenRouter
  mirror alone; the coverage figures above must then be corrected back to
  42/87.
- **Testing a registered slash command needs `--mode rpc` or a TUI** — `omp -p`
  (print mode) sends a leading `/name` as a *prompt* to the model, so the handler
  never runs and `ctx.ui.notify` is a no-op anyway. RPC mode does dispatch them:
  pipe `{"id":1,"type":"prompt","message":"/create-agent …"}` on stdin and the
  handler's `console.error` output (the `!hasUI` mirror in `notifyLines`) lands on
  stderr; `get_available_commands` confirms registration. Verified this way for
  `/create-agent` and `/explore-roles` (omp 18.4.8).