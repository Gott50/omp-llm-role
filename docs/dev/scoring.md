# Scoring

Maintainer reference for the ranking math. The normative decisions live in
[`spec.md`](spec.md) §4.1, §6 and §7; this page is the implementation-level
companion: the exact transforms, the invariants a weight change must preserve,
and the measured findings behind the shipped weights. All math is in
`src/engine.ts`; the shipped role defs are `DEFAULT_ROLES` in `src/settings.ts`;
the archetype sets are `src/role-archetypes.ts`.

## Cardinal transforms

`cardinalMetric(metric, v)` (`src/engine.ts`) is the single forward transform.
It uses no field statistics — the scale is sample-independent, so adding a model
never reshuffles the others. This is what kills the two percentile artifacts:
rank compression (real magnitude gaps now count) and field-dependent scales.

| Class | Metrics | Transform | Anchors |
|---|---|---|---|
| index | `general`, `reasoning`, `math`, `code`, `agents`, `search`, `vision`, `tool_calling`, `long_context` | `(v+20)/80` | −20→0, +60→1; extrapolates outside (no clamp) |
| benchmark, chance-anchored | `gpqa` | `(v−0.25)/0.75` | 4-way multiple choice, chance 0.25 |
| benchmark, raw | `mrcr`, `aime`, `swe_bench`, `arc_agi`, `terminal_bench`, `tau_bench` | identity | pass rate 0–1, chance ≈ 0 |
| throughput | `throughput` | `ln(v/10)/ln(30)` | 10→0, 300→1; clamped to [0,1] |
| percentile / score | `website`, `writing` | identity | already 0–1 |

- `INDEX_METRICS` and `BENCHMARK_CHANCE` are the class tables; a metric in
  neither falls through to identity. `BENCHMARK_CHANCE` currently holds only
  `gpqa`.
- The index anchors are fixed because `index_*` is interval-scale with an
  arbitrary zero (observed −16..+60); clamping would destroy cardinality at the
  edges, so values outside the anchors extrapolate.
- Throughput is log-anchored so equal log-ratios count equally; it is the only
  clamped transform.

**Invariant — forward and inverse must agree.** The explorer's "what would it
take to move up" targets come from `inverseCardinal(metric, t)`
(`src/explorer/explain.ts`), which must invert `cardinalMetric` for every
weightable metric. It handles `index` (`t·80−20`) and `throughput` (`10·30^t`,
null outside [0,1]) and returns identity for everything else. That identity is
correct for the raw benchmarks and the percentiles but **wrong for `gpqa`**,
whose forward transform is chance-anchored: `t = 0.5` should map to raw 0.625,
not 0.5. Before adding a metric to `KNOWN_METRICS`, check that both
`cardinalMetric` and `inverseCardinal` handle its transform; a chance-anchored
metric needs a matching inverse (read `BENCHMARK_CHANCE`).

## Quality composite `q`

`rankRole(def, models)` (`src/engine.ts`) computes, per eligible model:

```
q = Σ_{m ≠ price} (w_m / (1 − w_price)) · cardinalMetric(m, raw_m)
```

- Price is excluded from the blend; it enters only as the `λ·priceEff` penalty.
- `parts[metric]` holds each weighted contribution; the parts sum exactly to
  `q` (the report's `|`-separated columns and the explorer's composition panel
  rely on this).
- A missing weighted metric contributes **0** and still occupies its share of
  the `(1 − w_price)` denominator — so weight on a sparse metric is a
  data-coverage lottery, not a quality signal. The exception is the capability
  fill (below).
- `q` is a weighted *mean* of the cardinal metrics: raising `w_price` while
  rescaling the other weights to keep Σ = 1 leaves `q` bit-identical (verified:
  DeepSeek-V4.1-Flash `q = 0.810` at every `w_price` from 0.02 to 0.40). The
  capability weights set the shape; `w_price` alone sets the exchange rate.

## `λ` and `value`

```
λ = roleLambda(def)
  = def.lambda ?? (w_price ≤ 0 ? 0 : w_price ≥ 1 ? 1/20 : (w_price/(1−w_price))/20)
value = q − λ · priceEff
```

- `P_REF_USD = 20`: a price weight share `w` means $20 buys `w/(1−w)` quality
  points. `roles.<role>.lambda` overrides the derivation.
- `priceEff` is the billed blend scaled by the role's thinking factor when the
  model will actually run the role's level (see below); otherwise it is the bare
  billed price.
- `value` is the sort key; ties break score desc → blended $/M asc → id asc
  (determinism, spec §6.1).

## Eligibility

A model ranks for a role only when:

- every metric in `required` is non-null (`required` is the eligibility gate,
  **independent of weights** — the shipped defaults require `throughput`
  without weighting it, so validation checks `required ⊆ KNOWN_METRICS`, not
  `required ⊆ weights`);
- it has a billed price (`m.price != null`);
- `filters.image` (if set) is satisfied (`m.multimodal`).

`filters.image` is the only filter the engine implements; spec §6.3 also names
`filters.maxPriceUsdPerM` / `filters.minContextTokens` as schema capability, but
`rankRole` does not enforce them and `resolveSettings` does not validate them.
Filters apply before ranking eligibility so percentile norms stay on the
unfiltered pool.

## Pareto frontier (★)

`paretoFrontier(ranked)` marks a model undominated when no other ranked model is
both cheaper and at least as good on `q`, on the thinking-adjusted `priceEff`:

```
a is dominated iff ∃ b ≠ a:
  b.priceEff ≤ a.priceEff ∧ b.q ≥ a.q ∧ (b.priceEff < a.priceEff ∨ b.q > a.q)
```

Exact `(priceEff, q)` ties leave **both** on the frontier (standard Pareto:
neither dominates). A running-max sweep would arbitrarily drop tie partners; the
pairwise form is the contract.

## Capability fill

`CAPABILITY_FILL` (`src/engine.ts`) = `{ website: 0.195, long_context: 0.195,
writing: 0.195 }`. A model missing one of these metrics is scored at the fill
instead of 0, so absence is not a coverage penalty. None of the three may be a
`required` gate — that would disqualify every model the source does not cover.

- `website` and `writing` are computed once per run, role-independent
  (`applyDesignPercentiles`, `applyWritingScores`), so they are identical for
  every role that weights them.
- `long_context` is never written into `metrics`: `rankRole` applies its fill at
  rank time and `explainModel` mirrors that branch (same untransformed fill, no
  `cardinalMetric` pass) so the explorer's contributions sum exactly to `q`.
- The 0.195 scalar is a **stated assumption, not a calibration**: it is the
  percentile implied by the *capability* cohort's uncovered-mean general index
  (29.8 vs covered 38.2). It is deliberately conservative (it can never inflate
  a model the source did not measure). For `writing` the cohort is stronger, not
  weaker (19.8 covered vs 22.2 uncovered → ≈0.513 on the same construction), so
  the shared constant understates an unmeasured model's writing; it stays at
  0.195 because 15 self-reported, unverified rows cannot calibrate a per-metric
  fill. Making it per-metric is a one-line change (`CAPABILITY_FILL`).
- The report marks a filled value `~` in the model column.

## Thinking price factor

Roles with a `thinking` level rank on the thinking-adjusted price.
`thinkingPriceFactor(level)` = `(3ρ+1+T)/(3ρ+1)` with
`ρ = IO_PRICE_RATIO = 0.25` (field-typical input:output price ratio 1:4) and
`T = THINKING_TOKEN_OVERHEAD[level]`:

| level | off | minimal | low | medium | high | xhigh | max | auto |
|---|---|---|---|---|---|---|---|---|
| T | 0 | 0.25 | 0.75 | 1.5 | 3 | 6 | 12 | 1.5 |
| factor | 1.00 | 1.14 | 1.43 | 1.86 | 2.71 | 4.43 | 7.86 | 1.86 |

Thinking tokens bill as output, so the factor scales only the output share of the
3:1 blend. The factor is gated per model on what it will actually run:

- the omp catalog's per-model `thinking[]` wins when available — a model whose
  level list excludes the role's level is priced bare (omp clamps unsupported
  levels, and the written selector stays bare, so ranking and write agree);
- meta levels (`off`, `auto`, `META_LEVELS`) need only a non-empty list;
- without the catalog (standalone ranking), the OpenRouter `supports_reasoning`
  flag gates;
- bare roles (`thinking` undefined) are not adjusted — the session
  `defaultThinkingLevel` is user-controlled.

**`thinking` is a second, hidden λ.** The factor multiplies the price axis and
never `q` — `rankRole` has no term that rewards deliberation, so a level is pure
cost and silently scales λ by the same factor (`slow` at `:max` ran λ_eff
0.0207, 7.9× its nominal 0.00263). This is why the 2026-09-30 review lowered
`slow` max → high and `plan`/`designer` high → `auto`, and why `auto` (not
`medium`) is the pin: no reachable model lists `medium` in its catalog
`thinking[]`, so a `medium` pin writes bare at a bare price while the session
default (`auto`) bills 1.86×.

## Weight design rules

The shipped weights (`DEFAULT_ROLES`) and the archetype sets
(`src/role-archetypes.ts`) obey these; a weight change must preserve them.

1. **Σ(weights) = 1.0 exactly.** The validator accepts ±0.01
   (`sum > 1.01 || sum < 0.99` fails); the math does not — `q` is a mean only
   when the non-price weights sum to `1 − w_price`.
2. **Σ(non-price weights) = 1 − w_price exactly.** Otherwise
   `q = Σ (wᵢ/(1−w_price))·tᵢ` silently rescales against the derived λ.
   `create-agent` / `create-role` / the explorer's Export enforce both
   invariants; the archetype table states them in its header.
3. **Every role weights price AND throughput.** `default` was the exception
   until the 2026-09-27 review (throughput was required but unweighted).
4. **Coverage-aware.** A missing weighted metric contributes 0 while occupying
   its denominator share, so weight on a sparse metric is a coverage lottery.
   Coverage over the eligible pool: `general`/`reasoning`/`price`/`throughput`
   100%, `code` 84%, `math` 83%, `tool_calling` 78%, `agents` 76%,
   `long_context` 39%, `search` 34%, `mrcr` 13%. The defaults weight the
   100%-coverage backbone plus the partial-coverage trio at reduced share;
   `mrcr`/`search` are unweighted and `long_context` is capped at 0.14.
   `website`/`long_context`/`writing` are capability-filled rather than
   0-filled.
5. **Non-collinear differentiation.** The capability indices are one latent
   factor (Pearson r over the pool: general↔reasoning 0.99, code↔agents 0.95,
   general↔code 0.94), so re-weighting them barely separates roles.
   Differentiate on the independent axes instead — throughput (r 0.13 with
   general), price (r ≈ 0), and the specialist metrics.
6. **λ from the intended posture.** `λ = (w_price/(1−w_price))/20` is the
   quality-per-dollar exchange rate; a price weight whose leader-flip threshold
   is 10–30× away is decoration. `plan`/`advisor` carry price 0.12/0.20
   (λ 0.00682/0.0125); `tiny` stays at 0.40.
7. **`website` vs `code` collinearity.** They correlate at r = 0.876, so
   `designer` weights `website` 0.18 with `code` trimmed to 0.10 (the old
   0.10/0.18 pair double-counted one capability axis).

## Value-review findings (2026-09-30)

Owner stance: "the cheapest model that can do the task, not the overpowered
one." Three findings, each measured on that day's caches:

- **`w_price` is the only cost knob.** See `q` above — raising `price` with the
  rest rescaled leaves `q` bit-identical. Raised: `default` 0.05 → 0.10,
  `vision` 0.04 → 0.12, `plan` 0.10 → 0.12, `advisor` 0.08 → 0.12 (each with
  the rest rescaled, so every `q` and every metric *share* is unchanged).
- **`thinking` is a second, hidden λ.** See above.
- **The switch margin hides dollars.** `switchMargin` is a flat band on `value`,
  so it vetoes switches worth up to `switchMargin / λ` $/M — $7.60/M at
  `default`'s λ, $5.18 at `vision`'s, $4.60 at `advisor`'s.
  `priceSwitchFraction` (default 0.5) closes the hole: inside the margin, a
  challenger at ≥ half the effective $/M is adopted (`switched-cost`); `0`
  restores the pure margin. The quality given up is real but small (`default`
  GLM-5.3 → DeepSeek −0.004 q for 4.6× less money; `vision` −0.041 for 18×;
  `designer` −0.010 for 26×; `task` +0.007 for 4.6×).

## Changing a weight — checklist

1. Keep Σ = 1 and Σ(non-price) = 1 − w_price (rescale the others; do not touch
   `w_price` unless you mean to change λ).
2. Check the metric's coverage; if it is sparse, weight it as a differentiator
   and never add it to `required`.
3. If you add a metric, add it to `KNOWN_METRICS` (`src/settings.ts`) and
   `METRIC_META` (`src/explorer/explain.ts`), and verify both `cardinalMetric`
   and `inverseCardinal` handle its transform.
4. Re-run the report (`node llm-role-rank.ts --top 5`) and check the stderr
   match/eligible counts; the explorer's `Δ` column measures against the role's
   effective def.
