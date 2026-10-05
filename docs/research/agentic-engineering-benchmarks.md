# Agentic-engineering benchmarks — external learnings

Source: **IndyDevDan, "Agentic Engineering Benchmarks: How I RANK Astra, Fable 5.1,
and Open-Weights"** (2026-09-14, 39:23, https://youtu.be/9weiIHy9T_0).

Grounded in the video's **full auto-caption transcript**
([`agentic-engineering-benchmarks.transcript.txt`](agentic-engineering-benchmarks.transcript.txt),
fetched with `yt-dlp --write-auto-subs`, `en-orig`) plus its description, and
cross-checked against this repo's own measured benchmark data. Auto-captions, so
expect minor transcription artifacts.

This is a **research note**, not a contract. It records what an external
practitioner argues about model selection and how it maps onto (or contradicts)
`omp-llm-role`'s design. The normative decisions stay in
[`../dev/spec.md`](../dev/spec.md); the measured numbers stay in
[`../dev/scoring.md`](../dev/scoring.md).

## The thesis

> "The Artificial Analysis Index is lying to you. Not on purpose, but an index is
> a proxy of a proxy, and by the time ten benchmarks get mashed into one number,
> the only thing that actually matters (which model to run for YOUR work) is gone."

The transcript restates it: *"The index is a quick proxy of a proxy. You're
getting pretty far away from what you're really looking at."* Four claims, all of
which this project already implements or should:

1. **A single mashed index destroys the decision.** Ten benchmarks averaged into
   one number cannot answer "which model for *my* work". → This is exactly why
   `omp-llm-role` ranks **per role** with per-role weights instead of one global
   score.
2. **Model selection is three-dimensional: performance, cost, speed — as one
   unit.** *"Choosing a model is a three-dimensional problem… the tradeoff
   triangle."* Worked example: on Terminal-Bench v4.0 Astra and Fable 5.1 look
   close on score, but on the **cost** chart — *"about four times cheaper to run
   Astra than it is Fable, and about 2.4 times better than running Claude Fable
   5.1"* (verbatim; "better" here is the cost axis) → This is
   `value = q − λ·priceEff` with `throughput` weighted in every role (scoring.md
   rule 3).
3. **Hunt variance, not saturation.** *"If you see a benchmark that has a flat
   line, just don't spend your time… The information isn't valuable."* The video
   names the saturation threshold at ~85–90%. → This is the project's collinearity
   + coverage rules (scoring.md rules 4–5): a metric collinear with an existing
   index (r ≥ 0.9) or covering too little of the field adds no axis.
4. **The unit of value is useful work per hour.** *"The big equation I like to use
   now is not tokens versus result… it's useful agent output per hour."* → This is
   the `q − λ·$/M` objective with `throughput` in it; see the cost caveat below.

## The five benchmarks the video picks

Each video link resolves to a concrete id in the project's catalog
(`cache/benchmark-catalog-fetched-data.json`, 2026-10-05). The mapping uses the
**exact** variant the video links:

| # | Benchmark | What it measures (video) | Catalog id | Catalog models | Loadable coverage of 400-field |
|---|---|---|---|---|---|
| 1 | Terminal-Bench v4.0 | "Cleanest pure agentic coding": real container, harness loop, verifier checks final state; 60+ tasks (SWE, ML, science, ops, security, hardware, media) | `terminal-bench-4.0` | 20 | 5.0% |
| 2 | APEX Agents | Investment-banking analysis / management consulting / corporate law; tasks vetted by experts (McKinsey, BCG, Deloitte, Goldman, Morgan Stanley, JPM) — the non-SWE proxy | `apex-agents` | 10 | 2.5% |
| 3 | AutomationBench | 600+ tasks across finance/HR/marketing/ops/sales/support; must complete the objective **without tripping guardrails** — "alignment at a low level". Video links Artificial Analysis's independent run (657 tasks, 40 simulated apps) | `automationbench-aa` | 1 | 0.25% |
| 4 | AA-Omniscience | The hallucination benchmark: correct / incorrect / partial / **not attempted**, zero penalty for "I don't know". Scores −100…100; 0 = 50/50 on a factual answer | `aa-omniscience-index` | 3 | 0.75% |
| 5 | DeepSWE v1.1 | Long-horizon SWE from short, realistic prompts; Astra ran 30K output tokens in 29 steps | `deepswe-1.1` | 40 | 5.0% (20 loadable) |

Notes on the mapping:

- All five ids **already exist in the catalog** — none needs to be added. The
  learning is coverage + weighting, not discovery.
- The video's AutomationBench link (`artificialanalysis.ai/evaluations/automationbench-aa`)
  is the AA-run variant, `automationbench-aa` (1 model). The base
  `automationbench` (22 models) and `automationbench-1.0.6` (5) are separate
  catalog entries.
- **No shipped role weights any of the five** (or any catalog benchmark). The
  weighted metric set is `general`, `code`, `agents`, `tool_calling`,
  `throughput`, `price`, `vision`, `reasoning`, `long_context`, `website`. The
  `terminal_bench` name that appears in `KNOWN_METRICS` is a *different* thing —
  the older llm-stats raw pass rate, and it is shipped-but-**unweighted** (as are
  the other five raw pass rates).
- **The "Catalog models" column is the catalog count, not the loadable count.** The
  zeroeval per-benchmark endpoint returns at most 20 `entries` (verified
  2026-10-05: `deepswe-1.1` `total_models` 40 → 20 entries; `browsecomp` 67 → 20;
  `mmlu-pro` 142 → 20; no `limit`/`offset`/`page`/`per_page` parameter changes
  it), and the plugin's generic source reads `entries` with no pagination. So
  `deepswe-1.1` is 5% loadable, not 10%, and no `bench:<id>` metric can exceed
  20/400 = 5%.

Loadable coverage is against the 400-model ranking field used in scoring.md; the
catalog count can exceed it (the endpoint caps at 20 entries).

## The unifying frame

The video states its own criterion explicitly — every pick is a proxy for
**out-loop agentic engineering**: *"long horizon, no human in the loop, honest
agents we can trust shipping on our behalf."* The five map to five axes:
alignment (guardrails), cross-domain knowledge work, truthfulness, raw
engineering skill, and a cost curve you can actually afford.

Two selection criteria beyond score:

- **Provider bias is disqualifying.** *"I immediately just disregard benchmarks
  that are not including specific models on purpose."* Active maintenance (fresh
  model coverage) is part of the trust signal. The five picks fail this test
  themselves: every sampled zeroeval benchmark is `verified: 0` (all
  self-reported), and the five are provider-concentrated — `terminal-bench-4.0`
  is Anthropic 8/20 + OpenAI 4/20 (60%), `deepswe-1.1` is OpenAI 8/20 (40%),
  `apex-agents` is 10/10 self-reported.
- **Domain proxies over SWE tunnel vision.** *"It's not good enough to just have
  your agents do software work."* High-stakes knowledge-work domains are the
  proxy for your own domain.

## What this means for `omp-llm-role`

### 1. The video's five benchmarks are all below the project's coverage floor

Every one is far under `FOCUS_COVERAGE_FLOOR` (0.35): the best is 5% of the
400-model field (Terminal-Bench 4.0 and DeepSWE 1.1, the latter capped — see the
mapping notes). This is consistent with the project's existing finding —
*"Zeroeval catalog benchmarks — none added"* (scoring.md): no catalog benchmark
adds an independent axis at usable coverage. The video's picks do not change that
verdict; they reinforce it.

The reason is **not** the coverage floor, though. A `bench:<id>` metric that
loads is capability-filled at 0.195 (`llmStatsBenchmarkDeclaration` →
`applyBenchmarkScores` fills every uncovered model), so weighting one does **not**
turn `q` into a 0-penalty coverage score — absence is a known non-penalty, and
the metric is never gated by `FOCUS_COVERAGE_FLOOR` (scoring.md, "External
metrics"). The real objections are:

- **Collinearity.** Where reachable, each is r 0.80–0.94 with an existing index
  (§2), so it adds no axis.
- **Fill-dominated variance.** At 0.25–5% coverage, ≥95% of the pool scores the
  constant 0.195, so the metric carries almost no information — and the fill can
  *reward* absence: an uncovered model scores 0.195 while a measured weak model
  scores lower.
- **The two dotted ids do not even load.** `catalogMetric` normalizes the id
  (`.`→`_`), so `deepswe-1.1` becomes `bench:deepswe-1_1` and the generic source
  fetches `.../benchmarks/deepswe-1_1` — HTTP 404 (verified 2026-10-05; same for
  `terminal-bench-4.0` → `terminal-bench-4_0`). The source fails, the metric
  stays null for every model, and it contributes 0 to all — ordering-neutral dead
  weight, not the 0.195 fill. Only a declared source (raw dotted id in its fetch
  URL) reaches them.
- **Loadable coverage is capped at 20 models.** The zeroeval per-benchmark
  endpoint returns at most 20 `entries`, and the plugin's generic source reads
  `entries` with no pagination, so **no `bench:<id>` metric can ever clear the
  35% bar** (max 20/400 = 5%). A future high-coverage axis must arrive as a
  shipped metric or a declared source with its own fetch.

### 2. The two that are reachable are already known-collinear

- `deepswe-1.1` — measured **r 0.80 with `agents`** (scoring.md).
- `terminal-bench-4.0` — same family as `terminal-bench-2.1`, measured **r 0.94
  with `code`**.

So even where coverage were adequate, they would not separate roles. The video's
"variance is where the alpha lives" is the same rule the project already applies.

### 3. Two axes the project does not weight — but the data is already fetched

- **Alignment / guardrails** (AutomationBench): *"the model has to complete
  objectives without triggering guardrail violations… if you bump against a
  guardrail, you also fail."* The video stresses the ranking *flips hard* when
  violations are turned off (Opus and Fable jump up). `omp-llm-role` has no
  guardrail/safety metric. The catalog carries `siren-agentdojo-attack-success`
  and `siren-agentdojo-utility` (safety) and `automationbench-aa` (the
  guardrail-scored variant), but at 1 model each — unusable. This is the one
  genuine gap: no source at usable coverage.
- **Hallucination / truthfulness** (AA-Omniscience): *"one hallucination is going
  to cause… every subsequent agent gets a messed up result."* The project does
  not weight a truthfulness metric — but the llm-stats leaderboard it already
  fetches carries `simpleqa_score` (47/400 = 11.8%, r 0.68 with `general`) and
  `hle_score` (104/400 = 26%, r 0.88 with `general`). `buildModels` maps neither.
  So this axis is a mapping + coverage question, not a missing source.

The same holds for the video's "domain proxies over SWE tunnel vision" point: the
fetched leaderboard carries `index_finance` (228/400 = 57%), `index_legal`
(213/400 = 53.3%) and `index_healthcare` (248/400 = 62%) — all clear the 35% bar
— plus `index_communication` (114/400 = 28.5%; llm-stats' communication index,
the WritingBench table's sort key — verbal quality, *not* the video's
agent-to-agent axis). None is mapped. The three domain indices are not three
axes, though: finance↔healthcare r 0.942, finance↔legal r 0.953,
healthcare↔legal r 0.946 — one latent "domain knowledge" factor, 0.70–0.85
correlated with `general`. And they are `index_*`, so they are **0-filled**: a
missing value scores 0, not the 0.195 capability fill, so weighting one at 57%
coverage penalizes the other 43% of the pool. Adding one needs a `CAPABILITY_FILL`
entry (as `long_context`/`website` got) or it is the same coverage lottery §1
objects to.

So guardrail/alignment is the only true gap; truthfulness and domain knowledge
are already in hand at marginal-to-usable coverage, and the work is mapping +
weighting, not waiting for a source.

### 4. "Cost per task" ≠ "$/M blended"

The video's 4× claim is **per task** (token usage folded in): *"cost per task is a
cliff compared to Opus and Fable."* `omp-llm-role` prices on the OpenRouter
blended **$/M** (3:1 in:out) scaled by the role's thinking factor. The two agree
only when per-task token counts are equal across models. This is a known
modelling limit, not a defect — but it is the reason a "cheaper per token" model
can still lose on a real workload. The video's own preferred unit — *"useful agent
output per hour"* — is a per-task-cost × throughput composite the project does not
model directly.

### 5. "A model stack, not a model" — already the architecture

> "Combine compute, don't select compute."

`omp-llm-role` writes a per-role selector **plus** `retry.fallbackChains`, so a
session runs a stack (primary + fallbacks) rather than a single model. The video's
*"keep one eye on the index, but then always keep an eye on your own personal
index"* is the per-role weight design.

## Actionable takeaways

- **Weight none of them.** All five already exist in the catalog, but each is
  low-coverage (best: 5% loadable) and, where reachable, collinear with an
  existing index — do not weight any as a focus metric. This matches the existing
  "none added" finding. The reason is collinearity + fill-dominated variance, not
  the coverage floor (a `bench:<id>` metric is capability-filled, or — for a
  dotted id — dead weight, §1).
- **Watch one true gap and two in-hand axes.** Guardrail/alignment has no source
  at usable coverage (the catalog's safety entries are 1 model each).
  Truthfulness (`simpleqa_score` 11.8%) and domain knowledge
  (`index_finance`/`index_legal`/`index_healthcare` 53–62%, one latent factor)
  are already in the fetched leaderboard and need a `buildModels` mapping + a
  `KNOWN_METRICS` entry + a weight — and, for any sparse one, a `CAPABILITY_FILL`
  entry (every unmapped leaderboard metric is 0-filled, so a 57%-coverage weight
  penalizes the other 43%). If a domain axis is added, weight **one** metric
  (they are r 0.94–0.95 with each other) and take the share from the collinear
  capability block (`code`+`agents` in `default`/`slow`/`task`, r 0.947), not
  from `throughput`/`price`.
- **Keep the 3-D posture.** Performance + cost + speed as one unit is the
  project's core; the video is independent confirmation, not a change.
- **Per-task cost is the open modelling gap.** The video's "useful agent output
  per hour" would require per-task token profiles; if those ever become
  available, they would sharpen the price axis beyond $/M.
- **Selection criteria worth borrowing:** prefer actively-maintained sources
  (fresh model coverage) and treat provider-biased benchmarks as unusable. The
  registry's "coverage over the field" rule captures the first; it does **not**
  capture trust — the catalog carries no `verified` signal the plugin reads, and
  every sampled benchmark is `verified: 0` (self-reported). A `self_reported`/
  `verified` field is the missing trust input.
- **Missing benchmark categories (video's wishlist, none exist at all):**
  delegation, small agent teams (SATs), agent handoffs, agent swarms, failure
  recovery / self-healing, and agent-to-agent communication. Verified against the
  745-row catalog (2026-10-05): 0 hits for delegat/swarm/handoff/recover/a2a/
  negotiat; "multi-agent" matches only ACEBench (2 models); the "team" hits are
  HMMT math. These are the agentic axes the project has no proxy for at all.
