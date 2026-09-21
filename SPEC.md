# SPEC — omp-llm-role: daily model-role updater plugin

Status: spec (implementation not started). Every decision below was confirmed with the
product owner in a three-round interview (2026-09-21). Ground-truth facts were verified
live against OpenRouter's API and the local omp install the same day.

---

## 1. Goal

A omp plugin in this repo that keeps `~/.omp/agent/config.yml` → `modelRoles` on today's
best models: it ranks models per role (existing scoring), keeps only models the user's
OpenRouter key can actually run, and surgically rewrites the role selectors — with
thinking suffixes, fallback chains, and a session-start daily trigger.

Existing `llm-role-rank.ts` stays the scoring engine; the plugin is the actuator on top.

## 2. Verified ground truth (2026-09-21)

These facts constrain the design; they were probed live, not assumed.

| Fact | Evidence |
|---|---|
| OpenRouter has **no per-key model allowlist** | `GET /api/v1/key` response fields: `label, limit, limit_reset, limit_remaining, usage, byok_usage, is_free_tier, expires_at, allowed_data_regions, free_model_daily_requests{used,limit,remaining}, rate_limit` — no model/provider restriction field |
| Key tier + budget is the availability signal | `is_free_tier: false`, `limit: 10` (daily), `limit_remaining`, `/api/v1/credits` → `{total_credits, total_usage}` |
| `omp token openrouter` prints omp's resolved OpenRouter key | verified, non-empty `sk-or-…` |
| omp catalog exposes concrete ids incl. `~org/…-latest` aliases and `:batch`/`:free` variants | `omp models find deepseek-v4-flash`: `~deepseek/deepseek-v4-flash-latest`, `deepseek/deepseek-v4-flash`, `deepseek/deepseek-v4-flash-0731`, `…:batch`, `…:free` |
| `omp models ls --json` is the selector universe | rows: `{provider, id, selector, name, contextWindow, maxTokens, reasoning, thinking[], input[], cost{}}` |
| `modelRoles` values are `provider/modelId[:thinkingLevel]` | `omp://models.md`; levels `off|minimal|low|medium|high|xhigh|max|auto` |
| `retry.fallbackChains` keys are selectors **without** thinking suffix | user's config.yml: role values carry `:off/:high/:max`, chain keys don't |
| omp plugins load via package manifest; `omp plugin link <dir>` for dev | `omp://plugin-manager-installer-plumbing.md`; settings map in `omp-plugins.lock.json`, `omp plugin config <pkg> --set=k=v` |
| Extensions run in-process under Bun; `ctx.modelRegistry`, `ctx.ui.notify`, `registerCommand` available; `ctx.setTimeout` for contained background work | `omp://extensions.md` |
| config.yml hot-reloads (task/eval preflight re-reads settings); omp writes it under `config.yml.lock` | `omp://config-usage.md`, `omp://task-agent-discovery.md` |

**Interpretation note.** The owner's phrase *"fetch the available providers for that key"*
maps to reality as: OpenRouter exposes no provider list per key; availability is derived
from key tier + budget (§5). This interpretation was presented and accepted in round 1.

## 3. Decision record

| # | Question | Decision |
|---|---|---|
| 1 | Form factor | **omp plugin** living in this repo, installed via `omp plugin link` (dev) / install (later) |
| 2 | Role coverage | **Config-driven weights.** Shipped defaults cover only the 9 official roles; the settings schema is flexible enough to define full weight sets for custom agent roles |
| 3 | Key-scoped availability | **Tier gate + catalog check** (§5) |
| 4 | Config write | **Surgical in-place edit** of `~/.omp/agent/config.yml` (only managed lines change; atomic tmp+rename) |
| 5 | Thinking suffixes | **Canonical per-role table** shipped as defaults, overridable in settings |
| 6 | Trigger | **session_start, UTC-day gated** (first omp session of the day refreshes; later sessions no-op) + manual `/refresh-roles` |
| 7 | Switch policy | **Hysteresis**: switch only if current model ineligible or new best beats current score by `switchMargin` (default `0.02`; `0` = always take today's best) |
| 8 | Settings home | **omp plugin settings** (`omp-plugins.lock.json` via `omp plugin config omp-llm-role --set=k=v`); plugin deep-merges dotted keys itself |
| 9 | Variant pick | **Exact dated slug**: resolution order exact id → newest dated → bare → `-latest` alias (last resort); never `:batch`; `:free` only on free-tier keys |
| 10 | Deliverable | **This spec**; implementation in a later session on owner go |
| 11 | `retry.fallbackChains` | **Auto-populate** #2/#3 per managed role; prune stale keys the plugin wrote |
| 12 | Provider scope | **`openrouter/*` selectors only** (ranking price/throughput is OpenRouter-derived; the key is an OpenRouter key) |
| 13 | Naming | Plugin `omp-llm-role`, slash command `/refresh-roles` |

## 4. Architecture

```
~/Documents/omp-llm-role/
  package.json              # name: omp-llm-role, omp.extensions: ["./src/extension.ts"]
  llm-role-rank.ts          # existing CLI (report) — refactored to export the engine
  src/
    engine.ts               # extracted from llm-role-rank.ts: fetch/caches, percentile norm,
                            # computeRankings(models, rolesConfig) → Record<role, Ranked[]>
    settings.ts             # defaults + dotted-key deep-merge of plugin settings map
    availability.ts         # key fetch, tier gate, catalog check, variant resolution
    config-edit.ts          # surgical YAML edit for modelRoles + retry.fallbackChains
    state.ts                # state + history files
    updater.ts              # orchestration: run(trigger, deps) → decisions
    extension.ts            # Bun/omp entry: session_start day gate + /refresh-roles
    cli.ts                  # node entry: update-roles.ts shim → headless run
  update-roles.ts           # `node update-roles.ts [--dry-run] [--json]` (thin shim)
  llm-role-rankings.md      # existing report output (unchanged format)
  *.json caches             # unchanged (daily UTC freshness)
```

Runtimes: extension runs **inside omp (Bun)**; CLI entry runs under **Node ≥ 23.6 (type
stripping)** — this machine has Node 26, no bun. Code must be dual-runtime safe: only
`node:` builtins + global `fetch`; relative imports with explicit `.ts` extensions.

### 4.1 Refactor contract (`llm-role-rank.ts` → `engine.ts`)

- `loadRankData(deps?)` — existing fetch/cache chain (fresh cache → live fetch → stale
  cache → none), returns models + match counts. Unchanged behavior.
- `computeRankings(models, roles)` — existing percentile normalization (`(i+j)/(2*(n-1))`,
  midrank) + weighted score + eligibility (`required` non-null). `roles` comes from
  resolved settings (§7), not the hardcoded `ROLES`.
- `llm-role-rank.ts` keeps its CLI, flags, report format, and suggested-YAML output; its
  suggested `modelRoles` block switches from `PROVIDER_BY_ORG` first-party guesses to the
  same catalog-resolved `openrouter/*` selectors the plugin emits (`PROVIDER_BY_ORG`
  retires from that path).
- Verification after refactor (existing convention): `node llm-role-rank.ts --top 5`,
  check stderr `openrouter: matched N/392 models (throughput + price)` and per-role
  eligible counts unchanged.

### 4.2 Dependency injection

Core modules take injected adapters so both entries share one code path:

```ts
type Deps = {
  getToken(): Promise<string>;          // extension: ModelRegistry.getApiKey("openrouter")
                                        // CLI: `omp token openrouter` (honors OMP_PROFILE)
  getCatalog(): Promise<CatalogEntry[]>;// extension: ctx.modelRegistry.getAvailable()
                                        // CLI: `omp models ls --json`
  notify(lines: string[]): void;        // extension: ctx.ui.notify; CLI: stdout
  nowUtcDay(): string;
};
```

## 5. Availability model (tier gate + catalog check)

### 5.1 Key metadata

Bearer-authenticated GETs with the omp-resolved key:

- `GET https://openrouter.ai/api/v1/key` → `is_free_tier`, `limit_remaining`, `limit`
- `GET https://openrouter.ai/api/v1/credits` → `total_credits`, `total_usage`

### 5.2 Gate

```
billedUsable  = !is_free_tier && limit_remaining > 0 && (total_credits - total_usage) > 0
freeUsable    = free_model_daily_requests.remaining > 0        (from key response)

tierFilter(model):
  billedUsable  → billed variants only   (exclude `:free`, `:batch`)
  else freeUsable → `:free` variants only (exclude `:batch`)
  else            → no candidates (run aborts, §9)
```

### 5.3 Catalog check

Every candidate must resolve to a concrete entry in the **authenticated** omp catalog
(`provider === "openrouter"`), i.e. a selector omp can actually dispatch. Catalog entries
also supply `thinking[]` (for suffix clamping sanity) and `input[]` (role filters, §6.3).

### 5.4 Variant resolution (per ranked model → selector)

Matching ranking row (llm-stats bare id) → openrouter-provider catalog ids: a catalog id
matches when its suffix after the last `/` equals the ranking id, or equals it after
stripping a trailing `-latest` (org prefix — including `~`-prefixed — is ignored for
matching). Among matched candidates, emit in this order:

1. **exact id match** (bare or dated, whatever equals the ranking id)
2. **newest dated id** (max trailing `-MMDD`/date suffix)
3. **bare id**
4. `~org/…-latest` alias (last resort — a valid selector beats no update)

Never emit `:batch`. `:free` only when the free-tier branch of §5.2 is active. Ties break
lexicographically. The emitted selector is always `openrouter/<catalogId>` (decision #12).

## 6. Selection pipeline

Per run, per role in the **resolved role set** (shipped defaults ∪ user-defined roles
that declare weights):

1. **Rank** — `computeRankings` with that role's weights/required (existing math; a
   0.5-weight dominant metric correctly beats combined 0.05 tiebreakers).
2. **Filter** — tier gate (§5.2) → catalog resolution (§5.4); unresolvable models drop.
3. **Choose** with hysteresis (decision #7):

```
best        = candidates[0]                       // highest score
current     = today's config.yml value for role   // suffix stripped for identity
if no current entry            → adopt best
else if current fails tier or catalog gate
  (incl. not in today's ranked pool) → adopt best
else if best.score - current.score >= switchMargin → adopt best
else                             → keep current (chain still refreshed, §6.4)
```

4. **Suffix** — append `suffixes[role]` (§7) unless the chosen model's catalog
   `thinking[]` is empty; suffixes pass through unchanged (omp clamps unsupported levels).
5. **Diff** — a role with unchanged final selector produces no write and no notify line.

Roles in `config.yml` that have **no** weights in resolved settings are never touched
(e.g. custom agent roles until the owner adds weights for them).

### 6.1 Determinism

Same inputs → same output. Ranking ties break by: score desc → blended $/M asc → id asc.

### 6.2 Shipped default role set

Exactly the current `ROLES` from `llm-role-rank.ts` (weights/required verbatim, see
`llm-role-rankings.md` legend for metric meanings): `default, smol, slow, vision, plan,
commit, tiny, task, advisor`. No custom roles ship by default (decision #2).

### 6.3 Role filters (schema capability)

Role definitions may declare `filters: { image: true }` (require image input) and
`filters: { maxPriceUsdPerM, minContextTokens }`. Shipped defaults: only `vision` sets
`image: true` (matching the existing multimodal eligibility filter). Filters apply
before ranking eligibility so percentile norms stay on the unfiltered pool (existing
behavior — vision already filters this way).

### 6.4 Fallback chains (decision #11)

After decisions, for **every managed role** (switched, adopted, or kept):

- key = chosen selector **without thinking suffix**
- value = next `fallbackChainDepth` (default 2) tier-eligible candidates after the chosen
  one, as bare selectors without suffix, deduped

Maintenance rules:

- Write only roles the plugin manages.
- Replace-in-place when a chain key already exists in the file (YAML duplicate keys are
  forbidden); never duplicate.
- Prune keys that (a) the plugin wrote on a previous run (tracked in state, §8) and
  (b) are no longer referenced by any managed role's selector. Unwritten, unreferenced
  keys (e.g. the owner's hand-maintained `openrouter/~deepseek/deepseek-v4-flash-latest`
  entry) are left alone unless the plugin needs to write that exact key (then replace).

## 7. Plugin settings schema

Stored in the omp plugin settings map (`omp-plugins.lock.json` → `settings["omp-llm-role"]`),
edited via `omp plugin config omp-llm-role --set=<key>=<value>`. The plugin receives the
raw map and **deep-merges flat dotted keys itself** (`roles.slow.weights.code=0.2` nests
correctly regardless of omp's value typing); a single `config=<json>` key is accepted as
a power-user escape hatch for whole-object overrides.

```jsonc
// logical shape (defaults shown for knobs; role weights default to §6.2)
{
  "switchMargin": 0.02,          // hysteresis margin on the 0–1 score; 0 = always switch
  "writeFallbackChains": true,
  "fallbackChainDepth": 2,
  "suffixes": {                  // canonical thinking suffix per role (decision #5)
    "smol": "off", "slow": "max", "vision": "auto", "plan": "high", "commit": "off"
    // default, task, tiny, advisor: bare (absent = no suffix)
  },
  "roles": {
    "slow": {
      "description": "…",
      "weights": { "general": 0.25, "reasoning": 0.25, "code": 0.2, "agents": 0.15,
                   "math": 0.1, "price": 0.03, "throughput": 0.02 },
      "required": ["general", "price", "throughput"],
      "filters": { "image": false }
    }
    // add "my-custom-role": { weights: {...}, required: [...], filters: {...} }
    // → that config.yml role gets updated too (decision #2)
  }
}
```

Validation (fail the run, notify, no write): weights > 0, each role's weights sum to
1.0 ± 0.01, `required ⊆ weights`, metric names ∈ {general, reasoning, math, code, agents,
search, vision, tool_calling, long_context, mrcr, price, throughput}, suffix ∈
{off, minimal, low, medium, high, xhigh, max, auto}. A role entry with `weights: null`
explicitly opts that role out.

## 8. State, history, and the write

Files (all under `~/.omp/agent/`, next to the config they describe):

- `llm-role-state.json` — `{ lastRunDay, managedRoles, role→lastSelector,
  pluginWrittenChainKeys[], previousModelRoles }`. `previousModelRoles` is the full
  snapshot of the last `modelRoles` block before the plugin changed it (manual rollback
  aid; no rollback command in scope).
- `llm-role-history.jsonl` — append-only per run: `{ts, trigger, keyMeta{isFreeTier,
  limitRemaining, creditsRemaining}, decisions[{role, from, to, reason: adopted|switched|
  kept-margin|kept-eligible|no-current, scores}]}`.

### 8.1 Surgical edit algorithm (decision #4)

1. Acquire advisory lock `~/.omp/agent/.llm-role-refresh.lock` (serializes concurrent
   session starts).
2. Read `~/.omp/agent/config.yml`; parse (YAML); validate structure.
3. Build the patched document as **text**, line-oriented: rewrite only value tokens of
   managed roles inside the top-level `modelRoles:` block (upsert missing roles at the
   block end, two-space indent) and the managed keys inside `retry.fallbackChains:`.
   All other bytes identical — comments, blank lines, unknown keys untouched.
4. Values always emitted YAML-quoted (`"openrouter/z-ai/glm-5.3-flash:high"`).
5. mtime re-check before write; if config.yml changed underneath, re-read + recompute
   (max 3 attempts). Atomic: temp file + `rename`.
6. Re-parse the patched text; on any YAML failure abort without writing. Never corrupt.

## 9. Error handling

| Failure | Behavior |
|---|---|
| Ranking data: fetch fails, no fresh cache | Existing chain: fresh cache → live fetch → stale cache → **abort, notify** (no write) |
| Key fetch (`omp token`/registry) or `/api/v1/key`,`/api/v1/credits` fails | **Abort, notify** — without tier info no selector is trustworthy |
| Catalog fetch fails | Abort, notify |
| Settings validation fails (§7) | Abort, notify the offending role/key |
| Both tier branches false (no budget, no free quota) | Abort, notify |
| Write conflict after 3 retries | Abort, notify; state file untouched |
| Zero decisions changed | No write at all (config mtime untouched), history row appended |

Session-start runs are **non-blocking**: executed via `ctx.setTimeout` so launch latency
is unaffected; the day gate (`state.lastRunDay !== today(UTC)`) makes it at most once/day;
a concurrent second starter loses the lock and finds the day already stamped → no-op.

## 10. Plugin surfaces

- **Manifest**: `package.json` → `"omp": { "extensions": ["./src/extension.ts"] }`;
  dev install `omp plugin link ~/Documents/omp-llm-role` (repo stays the source of truth).
- **session_start**: day-gated refresh (§9), notify only on switches/errors.
- **`/refresh-roles`**: synchronous forced run in-session; notification summarizes every
  decision (kept lines included when verbose).
- **Headless**: `node update-roles.ts [--dry-run] [--json]` — always runs (no day gate;
  explicit invocation is consent), `--dry-run` prints decisions without writing, `--json`
  emits the decisions payload for scripting.

## 11. Verification plan (implementation gate)

1. **Refactor sanity** — `node llm-role-rank.ts --top 5`: stderr match/eligible counts
   identical to pre-refactor run; report diff empty.
2. **Tier gate fixtures** — unit: paid+credit → billed-only; free-tier key → `:free`-only;
   zero budget both branches → abort.
3. **Variant resolution fixtures** — exact/dated/bare/alias ordering; `:batch` never
   emitted; `:free` only on free branch.
4. **Surgical edit fixtures** — commented config, unknown keys, missing roles upsert,
   chain-key replace-in-place (no duplicate YAML keys), unchanged file → zero-byte diff
   and no mtime change.
5. **Hysteresis fixtures** — no-current adopt; ineligible current switch; margin-below
   keep; margin-above switch; `switchMargin: 0` always takes best.
6. **Chain pruning fixtures** — plugin-written stale keys removed; owner-written keys
   preserved.
7. **Live E2E** — `omp plugin link .` → new omp session → observe day-gated run;
   `/refresh-roles` → verify config.yml diff + notification; second same-day session →
   no-op; `node update-roles.ts --dry-run` matches in-session decisions.

## 12. Out of scope

First-party provider selectors (decision #12), non-OpenRouter scoring sources, a UI for
weight editing (`omp plugin config` is the surface), a `/rollback` command (state snapshot
only), marketplace publishing (link/install is the path), and auto-tuning `switchMargin`.
