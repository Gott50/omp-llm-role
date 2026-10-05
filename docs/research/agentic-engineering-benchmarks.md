# Agentic-engineering benchmarks — external learnings

Source: **IndyDevDan, "Agentic Engineering Benchmarks: How I RANK Astra, Fable 5.1,
and Open-Weights"** (2026-09-14, 39:23, https://youtu.be/9weiIHy9T_0). No transcript
was available; this note is built from the video's full description + chapter list
and cross-checked against this repo's own measured benchmark data.

This is a **research note**, not a contract. It records what an external
practitioner argues about model selection and how it maps onto (or contradicts)
`omp-llm-role`'s design. The normative decisions stay in
[`../dev/spec.md`](../dev/spec.md); the measured numbers stay in
[`../dev/scoring.md`](../dev/scoring.md).

## The thesis

> "The Artificial Analysis Index is lying to you. Not on purpose, but an index is
> a proxy of a proxy, and by the time ten benchmarks get mashed into one number,
> the only thing that actually matters (which model to run for YOUR work) is gone."

Three claims, all of which this project already implements or should:

1. **A single mashed index destroys the decision.** Ten benchmarks averaged into
   one number cannot answer "which model for *my* work". → This is exactly why
   `omp-llm-role` ranks **per role** with per-role weights instead of one global
   score.
2. **Model selection is three-dimensional: performance, cost, speed — as one
   unit.** The video's worked example: on Terminal-Bench v4.0 Astra and Fable 5.1
   look close on score, but Astra is ~4× cheaper per task — same benchmark,
   different decision. → This is `value = q − λ·priceEff` with `throughput`
   weighted in every role (scoring.md rule 3).
3. **Hunt variance, not saturation.** "I throw out benchmarks that look like a
   flat line… Saturation means zero information gain." → This is the project's
   collinearity + coverage rules (scoring.md rules 4–5): a metric that is
   collinear with an existing index (r ≥ 0.9) or covers too little of the field
   adds no axis.

## The five benchmarks the video picks

| # | Benchmark | What it measures (video) | Catalog id | Models | Coverage of 400-field |
|---|---|---|---|---|---|
| 1 | Terminal-Bench v4.0 | "Cleanest pure agentic coding": real container, real harness loop, verifier checks final state | `terminal-bench-4.0` | 20 | 5.0% |
| 2 | APEX Agents | Investment banking / management consulting / corporate law; expert-authored knowledge-worker tasks — the non-SWE proxy | `apex-agents` | 10 | 2.5% |
| 3 | AutomationBench | 600+ tasks across finance/HR/marketing/ops/sales/support; must complete the objective **without tripping guardrails** — alignment at the floor | `automationbench` | 22 | 5.5% |
| 4 | AA-Omniscience | The hallucination benchmark: correct / incorrect / partial / **not attempted**, zero penalty for "I don't know" | `aa-omniscience-index` | 3 | 0.75% |
| 5 | DeepSWE v1.1 | Long-horizon SWE from short, realistic prompts | `deepswe-1.1` | 40 | 10.0% |

Counts measured from `cache/benchmark-catalog-fetched-data.json` (2026-10-05);
coverage is against the 400-model ranking field used in scoring.md.

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

- **Alignment / guardrails** (AutomationBench): the video stresses the ranking
  *flips hard* when guardrail violations are counted. `omp-llm-role` has no
  guardrail/safety metric. The catalog carries `siren-agentdojo-attack-success`
  and `siren-agentdojo-utility` (safety), but at 1 model each — unusable.
- **Hallucination / truthfulness** (AA-Omniscience): "one hallucination upstream
  poisons every agent downstream in a long-running pipeline." The project has no
  truthfulness metric; `omniscience-non-hallucination-rate` covers 1 model.

These are the genuine gaps the video surfaces. Neither is actionable today
(coverage ≈ 0), but they are the axes to watch if a source ever covers the field.

### 4. "Cost per task" ≠ "$/M blended"

The video's 4× claim is **per task**, which folds in token usage. `omp-llm-role`
prices on the OpenRouter blended **$/M** (3:1 in:out) scaled by the role's
thinking factor. The two agree only when per-task token counts are equal across
models. This is a known modelling limit, not a defect — but it is the reason a
"cheaper per token" model can still lose on a real workload.

### 5. "A model stack, not a model" — already the architecture

> "Combine compute, don't select compute."

`omp-llm-role` writes a per-role selector **plus** `retry.fallbackChains`, so a
session runs a stack (primary + fallbacks) rather than a single model. The video's
"keep one eye on the index and one eye on your OWN index — the three or four
benchmarks that map to the work you actually do" is the per-role weight design.

## Actionable takeaways

- **No new benchmark sources.** The video's five are low-coverage and (where
  reachable) collinear — do not add them as weighted metrics. This matches the
  existing "none added" finding.
- **Watch two axes:** guardrail/alignment and hallucination/truthfulness. If a
  source ever covers ≥35% of the field, they are the first genuinely independent
  axes since throughput/price.
- **Keep the 3-D posture.** Performance + cost + speed as one unit is the
  project's core; the video is independent confirmation, not a change.
- **Per-task cost is the open modelling gap.** If per-task token profiles ever
  become available, they would sharpen the price axis beyond $/M.
