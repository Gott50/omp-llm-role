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

| # | Benchmark | What it measures (video) | Catalog id | Models | Coverage of 400-field |
|---|---|---|---|---|---|
| 1 | Terminal-Bench v4.0 | "Cleanest pure agentic coding": real container, harness loop, verifier checks final state; 60+ tasks (SWE, ML, science, ops, security, hardware, media) | `terminal-bench-4.0` | 20 | 5.0% |
| 2 | APEX Agents | Investment-banking analysis / management consulting / corporate law; tasks vetted by experts (McKinsey, BCG, Deloitte, Goldman, Morgan Stanley, JPM) — the non-SWE proxy | `apex-agents` | 10 | 2.5% |
| 3 | AutomationBench | 600+ tasks across finance/HR/marketing/ops/sales/support; must complete the objective **without tripping guardrails** — "alignment at a low level". Video links Artificial Analysis's independent run (657 tasks, 40 simulated apps) | `automationbench-aa` | 1 | 0.25% |
| 4 | AA-Omniscience | The hallucination benchmark: correct / incorrect / partial / **not attempted**, zero penalty for "I don't know". Scores −100…100; 0 = 50/50 on a factual answer | `aa-omniscience-index` | 3 | 0.75% |
| 5 | DeepSWE v1.1 | Long-horizon SWE from short, realistic prompts; Astra ran 30K output tokens in 29 steps | `deepswe-1.1` | 40 | 10.0% |

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

Coverage is against the 400-model ranking field used in scoring.md.

## The unifying frame

The video states its own criterion explicitly — every pick is a proxy for
**out-loop agentic engineering**: *"long horizon, no human in the loop, honest
agents we can trust shipping on our behalf."* The five map to five axes:
alignment (guardrails), cross-domain knowledge work, truthfulness, raw
engineering skill, and a cost curve you can actually afford.

Two selection criteria beyond score:

- **Provider bias is disqualifying.** *"I immediately just disregard benchmarks
  that are not including specific models on purpose."* Active maintenance (fresh
  model coverage) is part of the trust signal.
- **Domain proxies over SWE tunnel vision.** *"It's not good enough to just have
  your agents do software work."* High-stakes knowledge-work domains are the
  proxy for your own domain.

## What this means for `omp-llm-role`

### 1. The video's five benchmarks are all below the project's coverage floor

Every one is far under `FOCUS_COVERAGE_FLOOR` (0.35): the best is DeepSWE 1.1 at
10%. This is consistent with the project's existing finding — *"Zeroeval catalog
benchmarks — none added"* (scoring.md): no catalog benchmark adds an independent
axis at usable coverage. The video's picks do not change that verdict; they
reinforce it. Weighting any of them as a focus metric would turn `q` into a
coverage score (a missing weighted metric contributes 0 while occupying its
denominator share).

### 2. The two that are reachable are already known-collinear

- `deepswe-1.1` — measured **r 0.80 with `agents`** (scoring.md).
- `terminal-bench-4.0` — same family as `terminal-bench-2.1`, measured **r 0.94
  with `code`**.

So even where coverage were adequate, they would not separate roles. The video's
"variance is where the alpha lives" is the same rule the project already applies.

### 3. Two axes the project does not have — and the video argues they matter

- **Alignment / guardrails** (AutomationBench): *"the model has to complete
  objectives without triggering guardrail violations… if you bump against a
  guardrail, you also fail."* The video stresses the ranking *flips hard* when
  violations are turned off (Opus and Fable jump up). `omp-llm-role` has no
  guardrail/safety metric. The catalog carries `siren-agentdojo-attack-success`
  and `siren-agentdojo-utility` (safety) and `automationbench-aa` (the
  guardrail-scored variant), but at 1 model each — unusable.
- **Hallucination / truthfulness** (AA-Omniscience): *"one hallucination is going
  to cause… every subsequent agent gets a messed up result."* The project has no
  truthfulness metric; `omniscience-non-hallucination-rate` covers 1 model.

These are the genuine gaps the video surfaces. Neither is actionable today
(coverage ≈ 0), but they are the axes to watch if a source ever covers the field.

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
  low-coverage (best: DeepSWE 1.1 at 10%) and, where reachable, collinear with an
  existing index — do not weight any as a focus metric. This matches the existing
  "none added" finding.
- **Watch two axes:** guardrail/alignment and hallucination/truthfulness. If a
  source ever covers ≥35% of the field, they are the first genuinely independent
  axes since throughput/price.
- **Keep the 3-D posture.** Performance + cost + speed as one unit is the
  project's core; the video is independent confirmation, not a change.
- **Per-task cost is the open modelling gap.** The video's "useful agent output
  per hour" would require per-task token profiles; if those ever become
  available, they would sharpen the price axis beyond $/M.
- **Selection criteria worth borrowing:** prefer actively-maintained sources
  (fresh model coverage) and treat provider-biased benchmarks as unusable — both
  are already implicit in the registry's "coverage over the field" rule.
- **Missing benchmark categories (video's wishlist, none exist as usable
  sources):** delegation, small agent teams (SATs), agent handoffs, agent swarms,
  failure recovery / self-healing, and agent-to-agent communication. These are
  the agentic axes the project has no proxy for at all.
