# Scoring

Maintainer reference for the ranking math: the exact transforms, the invariants
a weight change must preserve, and the measured findings behind the shipped
weights. All math is in
`src/engine.ts`; the shipped role defs are `DEFAULT_ROLES` in `src/settings.ts`;
the archetype sets are `src/role-archetypes.ts`.

## Cardinal transforms

`cardinalMetric(metric, v)` (`src/engine.ts`) is the single forward transform.
It uses no field statistics — the scale is sample-independent, so adding a model
never reshuffles the others. This is what kills the two percentile artifacts:
rank compression (real magnitude gaps now count) and field-dependent scales.

| Class | Metrics | Transform | Anchors |
|---|---|---|---|
| index | `general`, `reasoning`, `math`, `code`, `agents`, `search`, `vision`, `tool_calling`, `long_context`, `index_communication`, `index_finance`, `index_healthcare`, `index_legal` | `(v+20)/80` | −20→0, +60→1; extrapolates outside (no clamp) |
| benchmark, chance-anchored | `gpqa` | `(v−0.25)/0.75` | 4-way multiple choice, chance 0.25 |
| benchmark, raw | `mrcr`, `aime`, `swe_bench`, `arc_agi`, `terminal_bench`, `tau_bench`, `simpleqa_score`, `hle_score`, `mmmu_score`, `mmmu_pro_score`, `mmmlu_score`, `browsecomp_score`, `swe_bench_pro_score`, `mcp_atlas_score`, `apex_agents_score`, `osworld_score`, `scicode_score`, `screenspot_pro_score`, `charxiv_r_score`, `frontiermath_score`, `toolathlon_score` | identity | pass rate 0–1, chance ≈ 0 |
| throughput | `throughput` | `ln(v/10)/ln(30)` | 10→0, 300→1; clamped to [0,1] |
| percentile / score | `website`, `writing` | identity | already 0–1 |
| external benchmark | `bench:<id>`, `<ns>:<local>` | identity | normalized to 0–1 at parse time (`score / scoreMax`), so no new transform class |

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
weightable metric. It handles `index` (`t·80−20`), `throughput` (`10·30^t`,
null outside [0,1]), and a chance-anchored metric (`t·(1−chance)+chance`, reading
`BENCHMARK_CHANCE` from the engine so the two can never drift); everything else
is identity. Forward and inverse therefore agree for every weightable metric —
`gpqa`'s `t = 0.5` maps to raw 0.625, not 0.5. Before adding a metric to
`KNOWN_METRICS`, check that both `cardinalMetric` and `inverseCardinal` handle
its transform; a chance-anchored metric needs a matching inverse (read
`BENCHMARK_CHANCE`).

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
  (determinism).

### Cache-read pricing (cache-hit rate)

A role may declare an assumed **cache-hit rate** for its input tokens
(`roles.<role>.cacheHitRate`, 0–1; `0`/absent = off). Agent loops resend the
same system prompt every turn, so a cache-heavy role's invoice is dominated by
cache reads; the knob prices that, opt-in, without touching any shipped role.

- the route's billed price is `price = (3·input + output)/4` on the **listed**
  input price; a hit rate `h` blends the endpoint's cache-read price into the
  input term, `effInput = h·cacheRead + (1−h)·input`, giving
  `billed = price + 3·(effInput − input)/4` (the output term is unchanged);
- `blendRoutePool(routes, cacheHitRate)` weights by **`1/listedInput²`** — the
  router's sort key — so the hit rate changes the per-route billed price, not the
  routing probability: a cheap cache on a lightly-weighted route does not
  dominate (user story 9);
- a route with **no cache-read price** keeps its full input price
  (`cacheReadPrice = null` → `effInput = input`), so missing data is not a silent
  discount;
- `endpointFilteredModel(model, filters, cacheHitRate)` recomputes the blend when
  the role declares endpoint filters **or** a non-zero hit rate; the hit rate
  composes with the filters (filter the pool first, then cache-price it);
- `roleEffectivePrice`/`routeEffectivePrice` is the single per-route accessor the
  blend, the pinned-route path and `roleMetricValue` share; a pinned role prices
  its route's cache-adjusted billed price, and `maxPriceUsdPerM` caps the
  thinking-adjusted `priceEff` (the same cap as the blend path);
- `explainModel` mirrors all of it, carries `role.cacheHitRate`, and reports the
  cache-adjusted `cost.billedPrice`; the SPA cost line appends `· cache <rate>`
  when the rate is set;
- with `cacheHitRate = 0` (absent) every path is **byte-identical** to the
  uncached ranking. `resolveSettings` validates the rate to `[0, 1]` (a typo
  cannot silently halve or double the price).

### Route-aware pricing (provider pin)

A role may pin its requests to one OpenRouter provider route
(`roles.<role>.providerPin`). When it does, the role is priced by that
route instead of the `1/price²` blend:

- `pinnedRoute(model, pin)` (`src/engine.ts`) resolves the model's route by
  **exact, tiered-verbatim** `providerSlug` — `deepinfra` and `deepinfra/fp8`
  are different routes, with no normalization — and returns `null` on no match.
- `priceEff` is the route's billed 3:1 price (cache-adjusted by the role's
  `cacheHitRate` when set, see *Cache-read pricing*), scaled by the same
  thinking factor and gated by the same `runsAtLevel` rule as an unpinned role:
  the pin changes the base price, not the thinking math.
- the `throughput` weight reads the route's p50, falling back to the model's
  blended throughput when the route carries no p50 — a sparse route must not
  zero the metric (an absent p50 is unknown, not slow).
- `maxPriceUsdPerM` caps the pinned route price (the thinking-adjusted price the
  role actually pays), like the blend cap.
- `roleMetricValue(model, metric, route, cacheHitRate)` is the accessor `rankRole`
  and `explainModel` share: for a pinned role it returns the route's cache-adjusted
  billed price (`routeEffectivePrice`) and `throughput`, and the model's own value
  for every other metric.
- a model with **no matching route** is ineligible for that role
  (`providerPinDrops` → `Decision.pinBlocked`, rendered `; pin-blocked: …`);
  `explainModel` reports "no route matches the role's provider pin".
- an **unpinned** role ignores `routes` entirely — the blend path is unchanged.

The pin is a cost-and-throughput posture, not a quality edit: it moves the price
axis to the route's billed price and the throughput axis to the route's p50,
while every other weighted metric stays the model's own.

## Eligibility

A model ranks for a role only when:

- every metric in `required` is non-null (`required` is the eligibility gate,
  **independent of weights** — the shipped defaults require `throughput`
  without weighting it, so validation checks `required ⊆ KNOWN_METRICS`, not
  `required ⊆ weights`);
- it has a billed price (`m.price != null`; a pinned role uses its matching
  route's price — see *Route-aware pricing*);
- `filters.image` (if set) is satisfied (`m.multimodal`);
- the role's **endpoint filters** (if any) are satisfied (below);
- for a **pinned** role, the model has a route matching `providerPin`
  (`pinnedRoute != null`) — a route-less model is ineligible.

### Endpoint filters

`RoleDef.filters` carries four endpoint filters beyond `image`:
`tools` (boolean), `minContextTokens`, `minOutputTokens` and `maxPriceUsdPerM`
(numbers; `0`/`false` = off). They gate the **eligible standard-tier route pool**
— the same pool the `1/price²` blend uses — before the blend:

- `routePassesEndpointFilters` drops a route failing any declared filter; a
  `null` capability field is **kept** (missing data is not a capability failure);
- `modelPassesEndpointFilters` requires at least one surviving route — a model
  whose every standard-tier route fails (or that has no route data) is
  ineligible, and the single-find-route fallback does not resurrect it;
- `minContextTokens` filters the **endpoint** `context_length`, not the
  model-level `context`;
- `maxPriceUsdPerM` caps the thinking-adjusted `priceEff` (the price the role
  actually pays), not the bare billed blend;
- a role that declares `tools`/`minContextTokens`/`minOutputTokens` is **priced**
  on the surviving pool: `endpointFilteredModel` recomputes `price`/`throughput`
  as the `1/price²` blend over the routes that clear the filters
  (`blendRoutePool`), so the role is priced on the routes the router would
  actually choose from — not the model's full-route blend. No endpoint filter
  leaves the model's own blend unchanged.

`endpointFilterDrops(def, models)` lists the ranking ids the gate removed (they
pass every other eligibility gate but have no capable route) for the decision
log. `resolveSettings` validates all four; no shipped role sets an endpoint
filter. Filters apply before ranking eligibility so percentile norms stay on the
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

### The 0-fill posture

`code`, `agents`, `tool_calling`, `math` and `vision` are deliberately
**0-filled** — a missing value scores 0, not the capability fill. This is a
cost-conservative choice, not an oversight: capability-filling them at 0.195
promotes expensive models, because the fill lifts every uncovered model's `q`
and the expensive models are the ones the source tends to cover. Measured on the
2026-10-03 caches, filling these metrics flips `slow` #1 muse-spark-1.3 →
gpt-6-astra and `plan` #1 hy4-preview → gpt-5.6-sol. The 0-fill keeps the
ranking on the models the source actually measured; the cost is that a model
missing a weighted metric is penalized for a coverage gap (see rule 4), which is
why the defaults weight these metrics at reduced share and never add them to
`required`.

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

## External metrics and the focus-share fit

A role may weight a metric the plugin does not ship. The key is
`<namespace>:<local>` (dot-free — the flat dotted settings path splits on `.`),
resolved by the benchmark-source registry (`src/benchmark-sources.ts`). The
source normalizes its scores to 0–1 at parse time, so the cardinal transform is
identity and no new transform class is needed. `isKnownMetric`
(`src/settings.ts`) is the pure name check the validator uses; the registry is
the engine-side resolver.

`/create-agent` folds a named benchmark into the weights as a **decisive focus
share** (`applyFocusBenchmarks`, `src/agent-create.ts`):

- `backbone = { general, reasoning, price, throughput }`.
- `specialistShare` = the archetype's weights outside the backbone;
  `focusShare = clamp(specialistShare, 0.25, 0.40)`.
- Each focus metric takes `focusShare / |focus|`; a metric already in the
  archetype's weights is not double-counted (it takes the focus share and leaves
  the rescaled pool).
- The archetype's remaining non-price weights are rescaled to fill
  `1 − w_price − focusShare`; `price` keeps the archetype's value.
- Rounded to 4 decimals with the residual absorbed in the largest non-price
  weight, so Σ = 1 and Σ(non-price) = 1 − w_price hold exactly.

Naming the archetype's own specialist set is a no-op (the focus share equals its
archetype share). A named metric already in the weights is reported as a
duplicate; a name outside the known-metric set is unknown.

**The four-axis focus-metric gate.** A focus metric that is fill-0 and covers too
little of the field turns `q` into a coverage score (a missing weighted metric
contributes 0 while occupying its denominator share). `assessFocusMetric(models,
metric, declared)` (`src/agent-create.ts`) is the one rule, returning a
`FocusMetricAssessment` with four axes, each `{ …, status: "ok" | "below-bar" |
"unknown" }`:

- **coverage** (`FocusCoverageEntry`) — the share of the pool carrying the metric
  (not the imputed fill). Safe when the source is capability-filled (`fill > 0`,
  so absence is a known non-penalty) **or** the share clears
  `FOCUS_COVERAGE_FLOOR` (0.35). This is `focusCoverageOk`, the coverage branch.
- **dispersion** — IQR/median of the cardinal-normalized covered values (the
  engine's `cardinalMetric` first, so index and 0–1 metrics are comparable),
  below-bar under `FOCUS_DISPERSION_FLOOR` (0.05). A saturated metric cannot
  separate models. Fewer than two covered values, or a zero median, is `unknown`.
- **composition** — an org whose pool share is ≥ `FOCUS_ORG_MIN_SHARE` (0.1) but
  which carries no covered model is flagged (`omittedOrgs`); a smaller provider's
  absence is not a false positive.
- **freshness** — the newest covered model's `releaseDate` against the pool's
  newest, below-bar beyond `FOCUS_STALENESS_MONTHS` (1). A missing date on either
  side degrades to `unknown`.

An empty pool (unknown field size) or `covered === 0` (the metric's scores were
not loaded) reports **all four axes `unknown`**, coverage included — never a
silent `ok`. `belowBarReason(assessment)` names the failed axis.

**Enforcement.** The pre-fetch catalog gate is count-only (`modelCount >= 3`); the
create-agent gate then probe-fetches each selected candidate's source
(`loadBenchmarkScores`), joins it onto the ranking universe, and assesses the
joined pool. A **discovered** candidate below-bar on any axis is dropped
non-fatally with a reason naming the axis; a **user-named** metric is never
dropped — it is annotated and warned. The report prints the four signals and
warns per below-bar axis; the explorer's `/api/bootstrap` carries
`focusAssessments` and the SPA renders a `table.focus` (below-bar warned,
`unknown` muted, never green); the CLI report annotates a role's focus metrics
(`focusLine`). The genuine hazard is the six raw pass-rate metrics (`gpqa`,
`aime`, `swe_bench`, `arc_agi`, `terminal_bench`, `tau_bench`), which are fill-0
and reachable from discovery via the catalog→shipped mapping;
`writing`/`website`/`bench:<id>` are capability-filled at 0.195 and stay
weightable at any coverage.

**Focus cap.** The focus set is capped at `FOCUS_METRIC_CAP` (3) in priority
order (named/linked first, then discovery order), so one benchmark keeps a
decisive share instead of five sharing the budget; the metrics beyond the cap are
reported as dropped. The cap is applied before the share math, so the kept set
still receives `clamp(specialistShare, 0.25, 0.40)` split evenly and both
invariants hold exactly.

### Zeroeval catalog benchmarks — none added

No zeroeval catalog benchmark adds an independent axis at usable coverage, so
none is weighted in a shipped role. Measured over the 400-model ranking field
(2026-10-03): `mmlu-pro` is the only catalog benchmark that clears the 35%
`FOCUS_COVERAGE_FLOOR` (142/400 = 35.5%), but it correlates r 0.90–0.92 with
`general`/`reasoning`; `HLE` is the next best at 26% and does not clear the bar.
The role-relevant benchmarks are 17–30% coverage and collinear with an existing
index (`toolathlon` 0.89 with `tool_calling`, `swe-bench-pro` 0.91 with `code`,
`terminal-bench-2.1` 0.94 with `code`, `mcp-atlas` 0.80 with `agents`,
`browsecomp` 0.97 with `search`, `deepswe-1.1` 0.80 with `agents`, `lvbench`
0.95 with `vision`). The six shipped-but-unweighted raw benchmarks (`gpqa`,
`aime`, `swe_bench`, `arc_agi`, `terminal_bench`, `tau_bench`) are all redundant
with an index or 5–6% coverage — do not weight them.

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
   0-filled. The four-axis focus-metric gate (above) is the automated check for
   this rule: it drops a discovered candidate that is below-bar on coverage,
   dispersion, composition or freshness.
5. **Non-collinear differentiation.** The capability indices are one latent
   factor (Pearson r over the pool: general↔reasoning 0.984, code↔agents 0.95,
   general↔code 0.94), so re-weighting them barely separates roles.
   Differentiate on the independent axes instead — throughput (r 0.13 with
   general), price (r ≈ 0), and the specialist metrics. The `general`+`reasoning`
   pair is the extreme case: at r 0.984 they are ~one latent factor, so
   `default`/`slow`/`plan`/`advisor` merge them into a single `general` weight —
   a pure relabel (the combined capability share is unchanged, so no share is
   freed and none is reallocated; the ranking is ≈ unchanged, near-tie
   reorderings only).
6. **λ from the intended posture.** `λ = (w_price/(1−w_price))/20` is the
   quality-per-dollar exchange rate; a price weight whose leader-flip threshold
   is 10–30× away is decoration. `advisor` carries price 0.20 (λ 0.0125),
   `plan` 0.25 (λ 0.01667); `tiny` stays at 0.40.
   - **Measure the leader-flip threshold on the *reachable* pool** — the pool
     the selector is actually chosen from (candidates the probe walk marks `ok`
     or `unknown`). The full-pool threshold is a stability check only. Measured
     2026-10-03 (issue #16): `plan`'s reachable threshold was w_price 0.2175
     (Hy4 preview → DeepSeek-V4.1-Flash) against a full-pool 0.311 (Muse Spark
     1.3 → Qwen3.8 Flash), so price 0.25 flips the actionable pick while the
     full-pool #1 is unchanged.
   - **Degenerate case.** When the value leader is also the quality leader the
     formula `(q_QL − q_VL)/(p_QL − p_VL)` is 0/0 — *undefined*, not zero, and
     it does **not** mean "no price weight dethrones the leader". The leader
     still flips at `min` over the cheaper challengers X of
     `(q_leader − q_X)/(pEff_leader − pEff_X)`.
   - **Coverage caveat.** A reachable flip can land on a model whose weighted
     metric is *imputed*, not measured. `long_context` covers 39% of the `plan`
     pool (56/142), and DeepSeek-V4.1-Flash's `index_long_context` is null —
     llm-stats reads that as insufficient evidence, not zero — so it scores the
     0.195 capability fill against Hy4 preview's measured 18.9. Read the flip as
     partly a data-coverage artefact.
7. **`website` vs `code` collinearity.** They correlate at r = 0.890 over the
   covered pool, so `designer` weights `website` 0.18 with `code` trimmed to
   0.06 (the old 0.10/0.18 pair double-counted one capability axis). The freed
   0.04 goes to the independent axes (`price` +0.02, `throughput` +0.02) per
   rule 5, giving `general` 0.26, `vision` 0.18, `throughput` 0.15, `price`
   0.17, `website` 0.18, `code` 0.06.

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

## Value-review findings (2026-10-03)

Three measured defects in the shipped weights, each fixed in issue #13 (all
numbers from the 2026-10-03 caches: 400 models, 151 throughput-matched, 150
priced):

- **`math` is collinear and sparse in `plan`/`slow`.** Over the eligible pool
  `math` correlates with `reasoning` at r 0.919 and is missing for 18% of the
  pool, so a model without `math` data loses up to 0.090 `q` for `plan` (share
  0.156) and 0.049 for `slow` (share 0.084) — a coverage penalty, not a quality
  signal. `advisor` had already dropped `math` for this reason (2026-09-30);
  `plan`/`slow` were left behind. Fix: drop `math` from both and move its share
  to the consolidated `general` axis (capability-preserving, 100% coverage) —
  not `throughput`, which would contradict `slow`'s "speed as tiebreakers"
  description and flip both leaders to a cheap/fast model. `plan`'s description
  drops `math` in the same change.
- **`smol`/`commit` price weight does not bind.** Both are described as
  "cheap", but the value leader is also the quality leader, so the price term is
  not what picks #1. The leader-flip threshold is λ* 0.0367 (`smol`, w_price*
  0.423) and 0.0402 (`commit`, w_price* 0.446) against the current λ 0.0214
  (w_price 0.30) and 0.0286 (w_price 0.35). Fix: raise both `w_price` to 0.45
  (the measured binding threshold), rescaling the non-price weights
  proportionally — a posture change, not a capability change.
- **The capability weights are ~one latent factor.** `general`~`reasoning` r
  0.984 over the eligible pool; `default`/`slow`/`plan`/`advisor` each spend
  55–74% of their non-price budget on that pair. The split buys almost nothing —
  merging leaves `default`'s top-3 identical and only swaps #4/#5. Fix: merge
  `general`+`reasoning` into `general` in those four roles as a pure relabel (no
  reallocation).

Measured effect: `slow` #1 glm-5.3 → muse-spark-1.3, `plan` #1 hy4-preview →
muse-spark-1.3, `smol`/`commit` #1 muse-spark-1.1 → deepseek-v4.1-flash;
`default`/`advisor` keep their #1 (near-tie reorderings only).

## Value-review findings (2026-10-03, issue #16 — `plan` cost posture)

`plan` did not honour the stated "cheapest model that can do the task" stance:
its price weight (0.12, λ 0.00682) was decoration on the pool the selector is
actually chosen from.

- **The reachable pool, not the full pool, is the decision pool.** The shipped
  `plan` pick was Hy4 preview ($2.32/M); DeepSeek-V4.1-Flash ($0.43/M, 5.4×
  cheaper) is reachable on this account and lost by 0.013 value. Hy4's whole
  edge is `long_context` (measured 18.9 vs DeepSeek's null → capability fill
  0.195); DeepSeek leads the measured axes (`general` 51.2 vs 50.4, 81 vs 36
  tok/s). Fix: raise `plan`'s `price` 0.12 → 0.25 (λ 0.01667), rescaling the
  non-price weights by 0.852273 — `general` 0.6, `long_context` 0.116676,
  `throughput` 0.033324 (Σ(non-price) = 0.75 = 1 − price; `q` unchanged).
  Measured reachable flip 0.2175, full-pool 0.311, so 0.25 flips the actionable
  pick (Hy4 → DeepSeek-V4.1-Flash) and leaves the full-pool #1 (Muse Spark 1.3)
  in place. `long_context` stays weighted — it is the only non-collinear
  capability axis in `plan`; dropping it would collapse the role onto `general`.
- **The flip rides on imputed data.** 5 of the 7 reachable `plan` models are
  `long_context`-imputed; the metric covers 39% of the pool. If the account's
  provider whitelist changes, `qwen3.8-flash` (same $0.43/M, higher q) strictly
  dominates DeepSeek and takes the reachable #1 with no weight edit.

## Domain-knowledge axis: measured, not landed (2026-10-05, issue #23)

The llm-stats `index_finance`/`index_legal`/`index_healthcare` scores were
evaluated as a domain-knowledge axis and **not landed** — no role weights them.
Measured over the 2026-10-05 400-model field (clean HEAD `a201a3b`, throwaway
worktree):

- **Coverage**: `index_finance` 228/400 (57.0%), `index_legal` 213/400 (53.3%),
  `index_healthcare` 248/400 (62.0%), `general` 377/400 (94.3%).
- **Correlation with `general`** (full covered pool): finance 0.6981, legal
  0.6632, healthcare 0.8449. Among the domains: finance↔legal 0.9529,
  finance↔healthcare 0.9417, legal↔healthcare 0.9464 — one latent factor.
- **On the eligible covered pool** (domain + `general` + price + throughput):
  finance 0.408, legal 0.388, healthcare 0.797.
- **0-fill leader flip** (`default`, share taken from `code`+`agents`): full pool
  flips at 0.03–0.06 (DeepSeek-V4.1-Flash $0.24 → Muse Spark 1.3 $2.00 /
  GPT-5.6 Sol $6.13); reachable pool (73 models) at 0.04–0.17; covered pool at
  0.17–0.20.
- **Capability-fill measurement** (real fill branch): no leader flip on the full
  pool at shares 0.05–0.20; on the reachable pool it flips at 0.05
  (finance/legal) and 0.20 (healthcare), always to the **cheaper** model.

**Verdict: do not land.** r with `general` is 0.66–0.84, the 0-fill is a coverage
lottery (the cheap leader has no domain data), and the capability fill still
flips the leader on the reachable pool — neither posture is stable.
Counter-evidence for the record: on the eligible covered pool finance/legal
correlate only 0.39–0.41 with `general`, so the metric does carry independent
signal mid-ranking; it just does not move the leader at a plausible share.

## Truthfulness axis: measured, not landed (2026-10-06, issue #24)

The llm-stats `simpleqa_score` was evaluated as a truthfulness axis and **not
landed** — no role weights it. Measured over the 2026-10-06 400-model field:

- **Coverage**: `simpleqa_score` 47/400 (11.8%); default-eligible 18/142 (12.7%);
  catalog-resolvable 16/137 (11.7%); allowed-keyed 7/65 (10.8%); probe-walk
  reachable **0/3**.
- **Correlation with `general`**: full pool 0.68, eligible 0.75, catalog 0.70,
  allowed 0.89. `hle_score` correlates 0.88 with `general` (collinear), and
  `simpleqa_score` vs `hle_score` is 0.35 — the two truthfulness metrics are not
  interchangeable.
- **0-fill leader flip** (`default`): the full pool flips at share 0.21 to
  `gemini-3-flash-preview` ($1.125/M vs the leader's $0.598/M — 1.9× more
  expensive); the capability fill flips to the pricier model too. The
  allowed-pool top-10 **all** have `simpleqa_score = null`.

**Verdict: do not land.** The 0-fill is a pure coverage lottery for exactly the
models the selector chooses from (the reachable pool has no covered model at
all), and the capability fill reproduces the cost-promotion failure mode the
0-fill posture exists to avoid.

## Changing a weight — checklist

1. Keep Σ = 1 and Σ(non-price) = 1 − w_price (rescale the others; do not touch
   `w_price` unless you mean to change λ).
2. Check the metric's coverage; if it is sparse, weight it as a differentiator
   and never add it to `required`.
3. If you add a shipped metric, add it to `KNOWN_METRICS` (`src/settings.ts`) and
   `METRIC_META` (`src/explorer/explain.ts`), and verify both `cardinalMetric`
   and `inverseCardinal` handle its transform. An external metric needs neither:
   it is `<namespace>:<local>` (dot-free), the registry supplies its metadata
   (`metricMeta`), and its transform is identity.
4. Re-run the report (`node src/cli/llm-role-rank.ts --top 5`) and check the stderr
   match/eligible counts; the explorer's `Δ` column measures against the role's
   effective def.
5. A price-weight change is a posture change: measure the leader-flip threshold
   on the **reachable** pool (rule 6), not the full pool, and record both
   numbers (reachable and full-pool) in the review. A threshold measured on the
   wrong pool reads as decoration when it is binding, or vice versa.
