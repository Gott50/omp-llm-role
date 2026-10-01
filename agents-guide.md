# Writing omp agent `.md` files

How to author custom omp subagents the way omp's own bundled agents are written — and what a file-based agent must declare that a bundled one gets from code.

Verified against omp **18.4.4** ([can1357/oh-my-pi](https://github.com/can1357/oh-my-pi/tree/v18.4.4)). Source links in §5 and §10 point at that exact tag on GitHub.

> Wiring an agent to a ranked model role (weights, plugin settings, explorer
> tuning) is the `omp-llm-role-create-agent` skill shipped by the omp-llm-role
> plugin; this guide covers the `.md` contract only.

## 1. What an agent file is

One markdown file = one subagent definition:

- **Frontmatter** (YAML between `---` markers) = the config omp parses: identity, tools, model, thinking, output contract.
- **Body** = the subagent's system prompt, verbatim. It becomes the `§ Role` section; omp wraps it with yield/peer/validation mechanics (§5), so the body stays pure role.

The main model never sees the file. It sees one roster line per agent in the `task` tool description:

```
- `name` (READ-ONLY; investigation only, no edits): description
```

and dispatches on `name` + `description`. The description is a **routing rule**, not documentation. Write it like [scout](https://github.com/can1357/oh-my-pi/blob/v18.4.4/packages/coding-agent/src/prompts/agents/scout.md) does:

> MUST be used for exploratory codebase research, rapid code analysis, and broad pattern searches. Fast read-only scout returning compressed context for handoff.

Say when the agent MUST be used, what it returns, and (optionally) when to skip it.

## 2. Where files live, and how they load

| Level | Directory |
|---|---|
| Project | `<repo>/.omp/agents/*.md` — nearest one walking up from cwd |
| User | `~/.omp/agent/agents/*.md` |
| Extensions | `<ext-package>/agents/*.md` |
| Plugins | Claude marketplace plugin `agents/` |
| Bundled | compiled in: scout, reviewer, security-reviewer, task, sonic |

Rules (`task/discovery.ts`):

- Every `*.md` in those dirs is parsed (symlinks too). **The agent name comes from frontmatter `name`, not the filename** — the convention is `<name>.md`, but the filename is otherwise arbitrary.
- **First name wins**: project > user > extensions > plugins > bundled. A user file with `name: designer` overrides anything bundled — that is how a removed bundled agent stays alive.
- Duplicate `name` within one directory: the alphabetically-first file wins, silently.
- Invalid frontmatter (bad YAML, or missing `name`/`description`) → the file is skipped with a log warning. The agent simply does not exist; nothing else breaks.
- Forbidden names: `main` and `sub` (case-insensitive) — reserved session sentinels. Keep names matching `[A-Za-z0-9_-]+`.
- Agent files are **re-read on every spawn** — edits apply to the next `task` call, no restart. The roster text already rendered into the main prompt can lag; restart if a stale description matters.
- Frontmatter keys are normalized kebab→camel recursively: `thinking-level:` and `thinkingLevel:` are the same key. Bundled files use kebab-case.
- `.claude/agents` is deliberately skipped: its frontmatter schema (e.g. `allowed-tools`) is not the omp contract.

**Never keep non-agent `.md` files in an agents dir** (READMEs, backups, notes). They are parsed as failed agents and warn on every spawn. Keep backups outside the directory.

## 3. Frontmatter reference

Parsed by `parseAgentFields` (`discovery/helpers.ts`). Required: `name`, `description`. Everything else is optional.

### `name`, `description`
Strings. `description` is the dispatch contract (§1). Quote it in YAML if it contains a colon.

### `tools`
CSV string or YAML list of builtin tool names. This is the field with the sharpest teeth — see §4.

- **Absent** → the agent gets the FULL session tool inventory, no restriction. Bundled `task`/`sonic` rely on this and say so in their body ("Tools: FULL access").
- **Present** → an allowlist. Every explicit list is auto-adjusted:
  - `yield` is always appended (subagents finish by yielding; the session enforces it).
  - `task` is appended when `spawns` is set (until `task.maxRecursionDepth`, default 2).
  - `wait` is appended when `task` or `bash` is present.
  - `checkpoint`/`rewind` are paired — listing one adds the other.
  - `grep` adds `ast_grep`, `edit` adds `ast_edit` (when enabled).
  - `exec` expands to `eval` + `bash`.
- MCP/extension/custom tools are session-level and ride along regardless of the list (mounted under `xd://` when `read`+`write` are active). `tools:` selects builtins only.

**Read-only classification** (`task/read-only-policy.ts`): an agent is READ-ONLY iff its tools list is non-empty and every entry is in:

```
read, wait, grep, glob, find, web_search, ast_grep, yield, ask, todo,
recall, reflect, retain, memory_edit, checkpoint, rewind
```

Any other name (`bash`, `edit`, `write`, `lsp`, `eval`, …) — or any *unknown* name — makes it not read-only (fail-safe). READ-ONLY agents get the roster badge and the main model is instructed to use them for investigation only.

### `model`
String, comma-separated string, or YAML list. Each entry is either:

- a **role alias** — `@default @smol @slow @task @vision @plan @commit @tiny @advisor @designer` — expanding to the model configured for that role in settings (`modelRoles`), including any `:thinking` suffix pinned there; or
- a **concrete selector** — `openrouter/moonshotai/kimi-k3:high` (provider/model, optional thinking-level suffix).

Multiple entries = an ordered fallback chain. Absent (or bare `@default`) → the child **inherits the parent session's active model**.

Resolution order at spawn: per-call request > `task.agentModelOverrides` (set via the `/agents` hub) > frontmatter `model` > parent model.

### `thinking-level`
`off | min | low | medium | high | xhigh | max | auto` (unambiguous abbreviations of ≥2 chars accepted). Absent → the session default (`defaultThinkingLevel`). Prefer `auto` or levels the pinned model actually supports — omp clamps unsupported levels.

### `spawns`
`*` or a list of agent names this agent may itself spawn. Listing `task` in `tools` implies `spawns: *`. Setting `spawns` without `task` in tools auto-adds `task`. Both are moot at max recursion depth.

### `output`
A structured-output schema; the child must terminate by `yield`ing `data` that matches it. Dialect (JSON-Schema-like — copy the shapes from bundled scout/reviewer):

- `properties` (required fields), `optionalProperties`
- `elements` = array items; `type: string | number | boolean`; `enum: [...]`
- `metadata.description` = per-field doc shown to the model

The caller's `outputSchema` on the task call overrides the agent's; `schemaMode: strict` on the call makes mismatches fail instead of warn-and-retry. When `output` is set, document the yield sections in the body (reviewer's `<output>` tag).

### `blocking`
`true` → the agent runs inline; the parent's turn waits for its result (roster badge "BLOCKING; inline result"). Default `false` → async; the id returns immediately.

### `read-summarize`
`false` → the agent's `read` returns verbatim file content instead of omp's structural summaries. Use when exact bytes matter (scout sets it).

### `prewalk`
`true` (hand the session to the default prewalk target, the smol role) or a model pattern: switches the child to that model at its first completed file edit, once todos exist. Off by default.

### `advisor`
`true` (advisor-role model) or a model pattern (optional `:level` suffix): a reviewer model passively injects nit/concern/blocker notes into the child session. Off by default for subagents.

### `autoloadSkills`
List of skill names; each is injected as a skill prompt before the first task message. Names must match discovered skills or they are dropped.

## 4. `tools:` — the field that bites md-file agents

The builtin list **drifts across omp releases** (18.1.4 shipped `browser`/`computer`/`hub`/`inspect_image` — all gone by 18.4.4, which added `find`/`wait`/`ida`/`context_notes`/`new_context`). An unknown name in `tools:` is **silently dropped** — no error, no warning; the agent just lacks the tool. So:

- Pin names from the **installed** version. omp 18.4.4 builtins:

  ```
  read, bash, edit, ast_grep, ast_edit, ask, debug, ida, eval, github, glob,
  grep, find, lsp, checkpoint, rewind, context_notes, new_context,
  security_scan, task, wait, todo, web_search, write, memory_edit, retain,
  recall, reflect, learn, manage_skill
  ```

  (Hidden, auto-managed: `yield`, `goal`, `think`. Legacy alias: `search` → `grep`.)
- After pinning, smoke the agent and confirm it can actually use the tools you intended (§8).
- Omit `tools:` only when you truly mean full access.
- Some tools are settings-gated and stay absent even when listed: `lsp`, `debug`, `ida`, `github`, `web_search`, `security_scan`, `eval` (needs a reachable backend), `wait` (needs async/IRC/launch enabled), memory tools (backend-dependent).

## 5. Body conventions from the bundled agents

The four bundled agent bodies are the reference implementations — browse them in [prompts/agents/](https://github.com/can1357/oh-my-pi/tree/v18.4.4/packages/coding-agent/src/prompts/agents) on GitHub (swap `v18.4.4` for your `omp --version` tag):

- [scout.md](https://github.com/can1357/oh-my-pi/blob/v18.4.4/packages/coding-agent/src/prompts/agents/scout.md) — read-only investigator; `output:` schema, `read-summarize: false`
- [reviewer.md](https://github.com/can1357/oh-my-pi/blob/v18.4.4/packages/coding-agent/src/prompts/agents/reviewer.md) — incremental-yield findings + verdict schema
- [security-reviewer.md](https://github.com/can1357/oh-my-pi/blob/v18.4.4/packages/coding-agent/src/prompts/agents/security-reviewer.md) — read-only, deepest output schema
- [task.md](https://github.com/can1357/oh-my-pi/blob/v18.4.4/packages/coding-agent/src/prompts/agents/task.md) — full-access worker. No frontmatter on disk: `task`/`sonic` get name/model/spawns/thinking-level injected at build time via [frontmatter.md](https://github.com/can1357/oh-my-pi/blob/v18.4.4/packages/coding-agent/src/prompts/agents/frontmatter.md) — an md-file copy must write them itself (§7).

(`init.md` and `model-mention.md` sit in the same directory but are not agent definitions — don't copy their structure.)

The wrapper ([subagent-system-prompt.md](https://github.com/can1357/oh-my-pi/blob/v18.4.4/packages/coding-agent/src/prompts/system/subagent-system-prompt.md)) already provides — do not duplicate:

- the yield protocol and output-schema rendering (§ Completion)
- "no formatters/linters/project-wide builds mid-flight" (§ Validation)
- worktree isolation text and peer/IRC mechanics
- the "keep going until done" persistence mandate

So the body is pure role. Bundled structure:

1. **One-line role statement** — what it is + scope:
   - "Investigate the codebase rapidly. Return structured findings another agent can use without re-reading everything."
   - "Find bugs author wants fixed before merge."
   - "Worker agent: delegated tasks."
2. **Tagged sections** — pick what fits; it is not a fixed schema. Tags seen in bundled agents: `<directives>`, `<thoroughness>`, `<procedure>`, `<criteria>`, `<cross-boundary>`, `<priority>`, `<findings>`, `<example>`, `<output>`, `<critical>`, `<strengths>`, `<design-system>`, `<avoid>`.
3. **House style**: RFC 2119 (MUST/SHOULD/NEVER/AVOID), terse imperatives, tables for scales, one concrete `<example>` for output shapes.
4. **Read-only agents** restate the contract in `<critical>`: "You MUST operate as read-only. You NEVER write, edit, or modify files, nor execute any state-changing commands…"
5. **Structured-output agents** document their yield sections in an `<output>` tag (see reviewer).
6. **Keep it short.** scout ≈ 25 body lines, security-reviewer ≈ 5, task ≈ 10. The description and the wrapper carry the mechanics.

## 6. Full example

```markdown
---
name: release-notes
description: MUST be used for drafting changelog entries from git history. Reads commits and diffs, returns structured entries. Skip for anything needing file edits.
tools: read, bash, grep, glob
model: "@smol"
thinking-level: low
output:
  properties:
    summary:
      metadata:
        description: One-paragraph overview of the release
      type: string
    entries:
      elements:
        properties:
          title:
            metadata:
              description: Imperative, ≤72 chars
            type: string
          kind:
            enum: [added, changed, fixed, removed]
          commit:
            type: string
        optionalProperties:
          detail:
            metadata:
              description: One paragraph; only when the title cannot carry it
            type: string
---

Draft changelog entries from git history since <ref>.

<procedure>
1. `git log --oneline <ref>..HEAD` for the commit list; `git show --stat` for scope.
2. Group related commits; one entry per user-visible change, not per commit.
3. Yield entries incrementally; summary last.
</procedure>

<criteria>
- User-visible changes only; internal refactors, test churn, and CI noise are omitted.
- Present tense, imperative; no commit-hash prefixes in titles.
- Unclear change: read the diff before writing the entry, never guess.
</criteria>

<critical>
Read-only: NEVER edit files, NEVER push, NEVER run state-changing git commands.
</critical>
```

Note what it demonstrates: routing-style description, pinned tools (with `bash`, so it is *not* classified read-only despite the body's read-only rule — the badge comes from the tools list, §3), a role-alias model, a low thinking pin, an output schema with required/optional/enum/array fields, and a body that stays off the wrapper's turf.

## 7. Bundled vs md-file: adjustment checklist

1. **`model:`** — bundled `task`/`sonic` get model + thinking level injected from code; an md agent without `model:` inherits the *parent's* model, which is usually not what a specialist wants. Pin a role alias.
2. **`thinking-level:`** — same: absent means the session default, not "off".
3. **`tools:`** — bundled full-access agents omit it on purpose; decide explicitly (§4).
4. **`omp agents unpack`** (default `~/.omp/agent/agents`, `--project` → `./.omp/agents`, `--dir <path>`) exports the bundled agents as editable md files — the fastest way to start from the house style. It skips existing files unless `--force`; never `--force` over your own edits.
5. Non-agent files stay out of the agents dir (§2).
6. Edits apply on the next spawn — files are re-read per spawn (§2).

## 8. Verifying an agent

- **Spawn it**: `task` with `agent: <name>`. An unknown name errors with the available agent names and the searched dirs — that error is itself a discovery check.
- **Watch the warnings**: "Failed to read agent file" / "Failed to parse YAML frontmatter" means a file was skipped.
- **Confirm the tools are real**: unknown names drop silently (§4); have the agent use one, or inspect it in the `/agents` hub.
- **`/agents` hub** (TUI): per-agent model / prewalk / advisor overrides at runtime, plus enable/disable.

## 9. YAML gotchas

- Quote descriptions containing `:` — `description: "Code review specialist for quality/security analysis"`.
- Quote model aliases — `model: "@smol"`; `@` cannot start a plain YAML scalar.
- kebab-case and camelCase keys are equivalent; kebab is the bundled convention.
- `tools:` accepts `read, grep` (CSV) or `[read, grep]` (list).

## 10. Source of truth (omp 18.4.4, can1357/oh-my-pi)

All links point at the exact tag this guide was verified against:

- [task/discovery.ts](https://github.com/can1357/oh-my-pi/blob/v18.4.4/packages/coding-agent/src/task/discovery.ts) — roots, precedence, per-spawn re-read
- [discovery/helpers.ts](https://github.com/can1357/oh-my-pi/blob/v18.4.4/packages/coding-agent/src/discovery/helpers.ts) — `parseAgentFields`, the frontmatter schema
- [task/executor.ts](https://github.com/can1357/oh-my-pi/blob/v18.4.4/packages/coding-agent/src/task/executor.ts) — tools/model/spawns/advisor wiring at spawn
- [tools/builtin-names.ts](https://github.com/can1357/oh-my-pi/blob/v18.4.4/packages/coding-agent/src/tools/builtin-names.ts) — `BUILTIN_TOOL_NAMES`, aliases
- [tools/index.ts](https://github.com/can1357/oh-my-pi/blob/v18.4.4/packages/coding-agent/src/tools/index.ts) — `resolveBuiltinToolPlan`: auto-includes, unknown-name drop, settings gates
- [task/read-only-policy.ts](https://github.com/can1357/oh-my-pi/blob/v18.4.4/packages/coding-agent/src/task/read-only-policy.ts) — `READ_ONLY_TOOL_NAMES`
- [prompts/agents/](https://github.com/can1357/oh-my-pi/tree/v18.4.4/packages/coding-agent/src/prompts/agents) — the bundled agents themselves (§5 links each file)
- [prompts/tools/task.md](https://github.com/can1357/oh-my-pi/blob/v18.4.4/packages/coding-agent/src/prompts/tools/task.md) — roster rendering
- [prompts/system/subagent-system-prompt.md](https://github.com/can1357/oh-my-pi/blob/v18.4.4/packages/coding-agent/src/prompts/system/subagent-system-prompt.md) — the wrapper around your body
- [cli/agents-cli.ts](https://github.com/can1357/oh-my-pi/blob/v18.4.4/packages/coding-agent/src/cli/agents-cli.ts) — `omp agents unpack`
