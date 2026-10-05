# Developer documentation

Maintainer docs for the omp-llm-role plugin. `README.md` is for people *using*
the plugin; everything here is for people *changing* it. A fact has exactly one
home — if it is here, it is not in the README.

## Where to start

| If you are changing… | Read |
|---|---|
| a module, an entry point, or the data flow between them | [architecture.md](architecture.md) |
| a data source, its fetch/cache, or a join between sources | [data-sources.md](data-sources.md) |
| a metric, a cardinal transform, or a role's weights | [scoring.md](scoring.md) |
| a config write, the state/history/lock files, or the write gate | [writes-and-state.md](writes-and-state.md) |
| the explorer surface (server, explain layer, SPA) | [explorer.md](explorer.md) |
| the dated numbers (matched/priced/eligible counts, per-role leaders) | [current-state.md](current-state.md) |
| a release (version bump, npm/git/marketplace channels) | [releasing.md](releasing.md) |
| the agent `.md` contract (frontmatter, routing, read-only rules) | [agent-authoring.md](agent-authoring.md) |
| a normative decision (what the plugin MUST do) | [spec.md](spec.md) |
| a debugging-only oddity (a quirk, not a contract) | [quirks.md](quirks.md) |

## The docs

- **[architecture.md](architecture.md)** — the module map and entry points:
  `src/cli/llm-role-rank.ts` (CLI report), `src/engine.ts` (shared ranking engine),
  `src/updater.ts` (orchestration), `src/extension.ts` (omp extension), the
  explorer, and how a run flows from fetch to config write.
- **[data-sources.md](data-sources.md)** — every source the engine reads
  (llm-stats leaderboard, OpenRouter catalog + per-provider routes, Design
  Arena, the writing leaderboard), its cache file and freshness rule, and the
  id joins that stitch them into one model row.
- **[scoring.md](scoring.md)** — the cardinal transforms, the value formula
  `q − λ·$/M`, the Pareto frontier, hysteresis, and the per-role
  weight/`required` semantics.
- **[writes-and-state.md](writes-and-state.md)** — the surgical `config.yml`
  patch (`modelRoles`, `retry.fallbackChains`, `task.disabledAgents`), the
  atomic write, the state/history/lock files, and the day gate.
- **[explorer.md](explorer.md)** — the interactive ranking UI: the
  zero-dependency HTTP server, the pure explain layer (baseline deltas,
  per-model decomposition, inverse-cardinal targets), and the SPA.
- **[current-state.md](current-state.md)** — the dated snapshot:
  matched/priced/eligible counts, per-role leaders, and the open defects.
  Refresh it with each run.
- **[releasing.md](releasing.md)** — the release switch (`package.json`
  `version`), the npm/git/marketplace channels, the tarball `files` whitelist,
  and the install-route verification.
- **[agent-authoring.md](agent-authoring.md)** — the agent `.md` contract:
  frontmatter (`model: "@<role>, @default"`, `tools:`), the routing
  description, read-only classification, and where agents are discovered.
- **[spec.md](spec.md)** — the normative spec: the confirmed decisions, the
  verified ground truth, and the contracts the implementation MUST satisfy.
- **[quirks.md](quirks.md)** — debugging-only oddities and gotchas that are not
  contracts (e.g. Node type-stripping not typechecking, stale in-process plugin
  code).

## Research notes

External material that informs (but does not bind) the design. Not contracts.

- **[../research/agentic-engineering-benchmarks.md](../research/agentic-engineering-benchmarks.md)**
  — IndyDevDan's "top 5 agentic-engineering benchmarks" video, mapped onto the
  project's coverage/collinearity rules; records the two axes the project lacks
  (guardrails, hallucination) and the per-task-vs-$/M cost gap.
