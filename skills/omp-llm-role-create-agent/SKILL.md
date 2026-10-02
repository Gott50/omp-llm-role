---
name: omp-llm-role-create-agent
description: "Use when a user wants a new omp subagent for a specific purpose wired to an omp-llm-role model role: author the agent .md with omp's agent-creation feature, add the role with purpose-fit weights, verify routing, tune in the explorer."
---

# Create an agent + model role for a specific purpose

Produces three things, in order:

1. an agent `.md` (the routing unit) authored by **omp's agent-creation feature** —
   the `/agents` hub's LLM architect, or `/create-agent`, which runs the same
   architect in-process (`src/agent-architect.ts`);
2. a `roles.<name>` entry in the plugin settings lock file, with weights fitted to the purpose;
3. a role that is visible and tunable in the explorer.

This skill ships inside the plugin at `<plugin>/skills/omp-llm-role-create-agent/SKILL.md`;
the plugin root is two levels up. Resolve it from the skill directory the harness
reports, or fall back to `~/.omp/plugins/node_modules/omp-llm-role`.

**Check `/create-agent` first.** The plugin registers an omp command that does all
three steps in one shot:

```
/create-agent --name <n> --purpose "<one sentence>"
```

or, in plain language (the architect names it, any benchmark you mention is
folded in, and any benchmark link you point at is resolved):

```
/create-agent i want an agent for writing. use the writing related Benchmarks in the Leaderboard <url>
```

A link to any llm-stats benchmark page (`llm-stats.com/benchmarks/<id>`) resolves
to that benchmark; a link to a provider the plugin has never seen is authored
into a declarative source spec (fetch → in-process architect → dry-run
coverage/leader → confirm → save). A named benchmark takes a decisive share of
the weights (the focus-share fit), so it drives the ranking instead of being
diluted.

It runs **omp's agent-creation architect** in-process to author the routing rule and
the body (the same architect the `/agents` hub runs), then adds the `model: "@<n>,
@default"` and `tools:` frontmatter omp's own writer omits. It fits the weights from the
archetype table (§2), asks for any extra benchmarks to fold in (listing every weightable
metric so you can avoid duplicates), writes the validated role, and runs the updater
in-process so `modelRoles.<n>` lands in `config.yml` — no second step. `--list-archetypes`
and `--list-benchmarks` print the tables; `--archetype`/`--weights`/`--required`/
`--thinking`/`--tools`/`--benchmarks`/`--scope`/`--body-file`/`--force`/`--yes` override
each piece. There is no out-of-session CLI for this path — run `/create-agent` in an omp
session.

Use this skill instead when the artifact needs authoring the command cannot infer: a
structured `output:` schema, a read-only `<critical>` contract with the tools to match,
a real `<procedure>`, or weights shaped beyond the table. The command and this skill
write through the same validated path, so the results are interchangeable.

## 0. Pin the purpose

Ask (or infer) and write down:

- **name** — `[A-Za-z0-9_-]+`, not `main`/`sub`, not an existing role or agent.
- **purpose** — one sentence; this becomes the delegation hint the main model reads.
- **tools** — the smallest set that does the job (omp's builtin tool names).
- **read-only?** — if yes, every tool must be in the read-only set.
- **output** — a structured yield schema, or free text.
- **thinking** — the effort level the role should run at.

## 1. Author the agent

Let **omp's agent-creation feature** write the routing rule and the body: run
`/create-agent` (which runs the architect in-process), or use the `/agents` hub's
**New agent** flow and then add the frontmatter below. Non-negotiables:

- `description` is a routing rule: "MUST be used for …", what it returns, when to skip.
- `model: "@<name>, @default"` — the chain keeps the agent spawnable while the role is
  disabled or unranked (a bare `@<name>` hard-fails when the role is absent).
- Do NOT pin `thinking-level` — the role's `thinking` field already sets the effort.
- Write to `<project>/.omp/agents/<name>.md` (project-scoped) or
  `~/.omp/agent/agents/<name>.md` (global). Project wins.
- Keep the body pure role; the wrapper supplies yield/validation/peer mechanics.

## 2. Fit the weights

Two invariants — the validator enforces the first, the engine's math needs the second:

- Σ(all weights) = 1.0 (±0.01).
- Σ(non-price weights) = 1 − w_price exactly: `q = Σ (wᵢ/(1−w_price))·tᵢ`, so any other
  split silently rescales q against λ.
- `price` and `throughput` MUST both be weighted and both in `required`.
- `required` is the eligibility gate, not a weight: a model missing a required metric is
  not ranked at all.

Start from the archetype closest to the purpose, then tune in the explorer (§4).
These are the same sets `/create-agent` fits automatically — the executable copy is
`src/role-archetypes.ts` (`--list-archetypes` prints it); keep the two in step.

| purpose | weights (Σ = 1) | required |
|---|---|---|
| general / coding (fallback) | general .3221, reasoning .1705, code .1705, agents .1137, tool_calling .0947, price .10, throughput .0285 | general, price, throughput |
| review / audit | reasoning .30, general .24, code .20, agents .10, price .10, throughput .06 | general, price, throughput |
| docs / writing | general .34, reasoning .20, code .10, long_context .10, price .16, throughput .10 | general, price, throughput |
| prose / writing (WritingBench-weighted) | general .24, reasoning .16, long_context .10, writing .26, price .14, throughput .10 | general, price, throughput |
| data / analysis | math .28, reasoning .26, general .20, code .10, price .10, throughput .06 | general, price, throughput |
| research / search | search .28, general .24, reasoning .20, long_context .10, price .10, throughput .08 | general, price, throughput |
| design / UI | vision .30, website .20, general .20, code .10, price .12, throughput .08 (+ `filters.image`) | general, price, throughput |
| refactor / migration | code .30, agents .20, general .20, long_context .10, price .12, throughput .08 | general, price, throughput |
| test / QA | code .28, agents .20, tool_calling .14, general .18, price .12, throughput .08 | general, price, throughput |
| ops / infra | agents .24, tool_calling .20, general .20, code .14, price .12, throughput .10 | general, price, throughput |

Rules of thumb:

- A named benchmark (via `--benchmarks` or a link) takes a decisive focus share
  (`clamp(specialistShare, 0.25, 0.40)` of the non-price budget), so it drives
  the ranking. An external metric key is `<namespace>:<local>` and MUST be
  dot-free (the flat dotted settings path splits on `.`); the registry resolves
  it and the explorer/report render it without a hand-maintained table.
- A weighted metric with low coverage turns q into a coverage score — prefer a `filters`
  gate over requiring a sparse metric. `website`, `long_context` and `writing` are
  capability-filled (0.195), so they are safe to weight. `writing` (WritingBench, the
  writing leaderboard's export) covers only 15/400 models, all Qwen — weight it as a
  differentiator for prose roles, never as a `required` gate, and expect a Qwen-leaning
  leader at high weights — the source measures only Qwen. The 0.195 fill is a stated
  assumption, not a calibration: on the writing cohort's own general index the
  consistent value would be ≈0.51, so the shared constant is deliberately conservative
  (it can only understate an unmeasured model's writing).
- Check differentiation: if the role's leader equals `default`'s, the role adds nothing —
  raise the distinctive metric or drop the role.
- `thinking` must be a level the pool actually supports; `off`/`auto` are meta levels
  (always appended).

## 3. Write the role

`omp plugin config set` stores every value as a string, and the plugin's validator rejects
a string weight/required/boolean — do NOT use it for role settings. Write the typed role
def with the plugin's own validated path:

```sh
node <plugin>/src/cli/create-role.ts --name <name> \
  --weights general=0.30,code=0.20,price=0.25,throughput=0.25 \
  --required general,price,throughput --thinking auto \
  --description "<one-line purpose>"
```

It validates through `resolveSettings`, backs up the lock file, and writes atomically.
`--dry-run` validates and prints without touching the file; `--json` prints the payload.
(If you went through `/create-agent`, the role and the agent file are already
written — go straight to §4.)

## 4. Verify

1. **Role ranked**: `/refresh-roles` in an omp session → a `kept`/`switched` line
   for the role (or `no changes`).
2. **Routing**: spawn the agent headlessly and read the spawn record — it MUST carry
   `"agent":"<name>"` and `"modelRole":"<name>"`, with `resolvedModel` = the role's
   selector, not the parent's.
3. **Explorer**: `/explore-roles` in an omp session → the role is a tab; tune
   weights/required/thinking/description and Export (writes the lock file, backup
   first). The explorer's numbers are the plugin's own.

## Pitfalls

- A role merely *named* after an agent routes nothing; the agent's `model:` pin is the routing.
- `@<name>` is a role alias only when `<name>` is a built-in id or a key in `modelRoles`;
  otherwise it is a literal model pattern and hard-fails.
- The plugin only rewrites `modelRoles` keys for roles in its resolved settings, so a
  hand-added key survives — but a role that leaves the set has its key deleted.
- Never put non-agent `.md` files in an `agents/` dir.
- Restart the session after the plugin writes `modelRoles` so the new alias resolves.
