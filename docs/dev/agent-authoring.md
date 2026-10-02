# Agent authoring: the `.md` contract

An omp subagent is a Markdown file with YAML frontmatter: the frontmatter is the
routing unit (what the main model dispatches on, and which model role the child
runs), the body is the system prompt. This document is the **contract** the plugin
writes and reads; the step-by-step authoring workflow lives in the shipped skill
[`skills/omp-llm-role-create-agent/SKILL.md`](../../skills/omp-llm-role-create-agent/SKILL.md)
and in `/create-agent`.

Source of truth: [`src/agent-file.ts`](../../src/agent-file.ts) (rendering,
placement, read-only classification), [`src/agent-pins.ts`](../../src/agent-pins.ts)
(pin derivation), [`src/agent-create.ts`](../../src/agent-create.ts) (`/create-agent`
core), [`src/agent-architect.ts`](../../src/agent-architect.ts) (the in-process
architect).

## Frontmatter

| Field | Required | Rule |
|---|---|---|
| `name` | yes | `[A-Za-z0-9_-]+` (`AGENT_NAME_RE`); `main` and `sub` are reserved (`RESERVED_AGENT_NAMES` — omp's session sentinels). The file name is `<name>.md`; omp derives the agent id from it. |
| `description` | yes | The routing rule the main model dispatches on: "MUST be used for …", what it returns, when to skip. `/create-agent` uses the architect's `whenToUse` (which must start with "Use this agent when"); without an architect it derives `MUST be used to/for <purpose>.` |
| `model` | yes | The ordered fallback chain `@<role>, @default` — never a bare `@<role>` (below). |
| `tools` | no | Builtin tool allowlist, comma-separated. Absent/empty = full session access. |
| `thinking-level` | **never** | The role's `thinking` field already sets the effort and prices it; a second pin would silently disagree with the ranking. |

### `model:` is a chain, not an alias

`@<role>` is a role alias only when `<role>` is a built-in id (`default, smol,
slow, vision, plan, commit, tiny, task, advisor`) or a key in `modelRoles`.
Otherwise omp treats it as a **literal model pattern** and hard-fails
`Model "@x" not found`. A role is absent whenever it is disabled
(`roles.<role>.enabled=false`), unranked, or not yet written to `config.yml` — so a
bare `model: "@designer"` hard-fails in exactly the state a fresh install is in.

The chain `model: "@<role>, @default"` keeps the agent spawnable: omp skips the
unresolved first entry and the child runs on `@default`. The plugin always writes
the chain (`renderAgentFile`), and the shipped
[`agents/designer.md`](../../agents/designer.md) pins it.

### `tools:` and the read-only classification

`isReadOnlyTools` (`src/agent-file.ts`) classifies an agent as read-only iff its
tools list is **non-empty and every entry is in `READ_ONLY_TOOLS`**:

```
read, wait, grep, glob, find, web_search, ast_grep, yield, ask, todo,
recall, reflect, retain, memory_edit, checkpoint, rewind
```

Any other name — including an unknown one, which omp silently drops — makes the
agent a writer. An empty list is full session access, not read-only. The
`/create-agent` archetypes default to a writer set except `review`/`audit`
(`read, grep, glob, find`) and `research`/`search` (`read, grep, glob, find,
web_search`).

`renderAgentFile` emits `tools: <comma-joined names>`; the shipped
`agents/designer.md` uses the equivalent YAML flow form `tools: [a, b, c]`. Both
are comma-separated lists omp parses.

## Rendering and writing

`renderAgentFile` emits exactly, in order: `---`, `name: <name>`,
`description: "<double-quoted>"`, `model: "<double-quoted>"`, an optional
`tools:` line, `---`, a blank line, then the trimmed body. `description` and
`model` are YAML double-quoted (backslashes and quotes escaped, newlines folded).

`writeAgentFile` refuses to clobber an existing file unless `--force`, creates the
target dir if missing, and writes through the same tmp+rename, mtime-guarded
writer as the settings lock file — a half-written file can never be read as an
agent.

## Placement and discovery

| Scope | Directory | Notes |
|---|---|---|
| plugin (shipped) | `agents/` in the plugin repo | discovered from the plugin's extension root — linking/installing the plugin ships it, no install step |
| user (global) | `~/.omp/agent/agents/` | profile- and env-aware (`agentDir()`: `OMP_LLM_ROLE_AGENT_DIR` → `PI_CODING_AGENT_DIR` → non-default `OMP_PROFILE` → `~/.omp/agent`) |
| project | `<project>/.omp/agents/` | under the project anchor |

Override order is **first-wins, most specific first: project > user > plugin**,
matching omp's own agent lookup. omp's full discovery order is nearest project
`.omp/agents/` → `~/.omp/agent/agents/` → extension roots → Claude marketplace
plugins → bundled.

`discoverAgentPins` (`src/agent-pins.ts`) scans the three dirs, skips reserved
names and files that pin no role, and maps each agent to the role its `model:`
chain pins (`parseAgentPin`: the first `@<role>` in the `model:` frontmatter
value; `null` when there is no `model:` line or the value names no `@role`). A
name present in several scopes resolves to the most specific one.

## The pin-derived disable

omp has no per-agent frontmatter gate (`parseAgentFields` has no `enabled`;
`discoverAgents` scans `<ext>/agents/*.md` unconditionally), so the plugin manages
the core `task.disabledAgents` key in `config.yml` — the same key the `/agents`
hub writes. The updater keeps an agent in `task.disabledAgents` **exactly while
the role its `model:` chain pins is disabled or absent from the resolved set**;
an agent that pins no role, or a role the settings do not define, is left alone.
So a shipped agent pinned to a disabled role (the shipped `designer`) is off the
roster by default, and its `@role, @default` chain only matters if a user
re-enables the agent by hand. The sync is not day-gated — enabling the role takes
effect on the next session.

## Authoring paths

- **`/create-agent`** (in-session) runs omp's agent-creation architect in-process
  (`src/agent-architect.ts`: the `/agents` hub's prompt shipped verbatim in
  `src/prompts/`, run through `createAgentSession` with no tools) to author the
  routing rule and the body, then `src/agent-file.ts` adds the `model:`/`tools:`
  frontmatter omp's own writer omits. The architect supplies
  `{identifier, whenToUse, systemPrompt}`; the plugin uses the user's `--name` for
  the file, `whenToUse` as the description, and `systemPrompt` as the body.
- **The shipped skill** — the hand-driven workflow, for bodies that need real
  authoring rather than the archetype scaffold.

## Removal

The `/remove-agent` command deletes an agent **and** its role definition:

```sh
/remove-agent --name review
```

It deletes the agent `.md` file (user and/or project scope) and the role's
lock-file keys (`removeRoleSettings`), then runs the updater in-process so
`modelRoles.review` is dropped from `config.yml` and the plugin-managed
`task.disabledAgents` entry is cleaned up. Shipped default roles (e.g.
`designer`) cannot be deleted — the message points at the explorer's "Reset to
shipped default". `--scope user|project` restricts the agent-file removal
(default: both); `--yes` skips the in-session confirmation; `--dry-run`
validates without writing.

By hand, the same two artifacts:

1. Delete the role from the settings lock file (the explorer's Export, or edit
   the lock file directly).
2. Delete the agent file: `rm ~/.omp/agent/agents/review.md`.
3. Wire it: `/refresh-roles` in a session.

## Pitfalls

- A role merely *named* after an agent routes nothing; the agent's `model:` pin is
  the routing.
- Never put non-agent `.md` files in an `agents/` dir.
- Restart the session after the plugin writes `modelRoles` so the new alias
  resolves.
