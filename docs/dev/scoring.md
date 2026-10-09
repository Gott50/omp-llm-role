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
- an **unpinned** role ignores `routes` entirely — the blend path is unchanged —
  **unless** it sets the soft `preferOwnProvider` policy (the `providerPinning`
  capability), which prices it on its **best route** (the value-max candidate
  route; see *Capability presets*).

The pin is a cost-and-throughput posture, not a quality edit: it moves the price
axis to the route's billed price and the throughput axis to the route's p50,
while every other weighted metric stays the model's own.

## Capability presets (feature flags)

One named flag per opt-in capability (`features.<id>` global,
`roles.<role>.features.<id>` per role) applies the plugin's recommended settings
to a role. The registry (`FEATURES` in `src/features.ts`) is the single source of
truth; `expandFeatures(authored, globalFlags)` is the single implementation of
the precedence rule, called by `resolveSettings` (per role) and by the explorer's
`/api/rank`/`/api/explain` on the posted def. The rule:

```
effective def = shipped default  ⊕  preset(enabled flags)  ⊕  explicit user keys
```

A flag is on when `roles.<role>.features.<id>` is present (it wins either way)
and otherwise when the global `features.<id>` is `true`; the preset fills only
knobs the authored def does not already set, and an explicit key is merged last,
so it always wins. Every flag ships **off** and no shipped role sets one, so with
no flags the resolved roles are byte-identical to `DEFAULT_ROLES`. The effective
def is what `rankRole`/`explainModel` see; the authored def (flags + explicit
keys) is what the explorer edits and exports.

What each recommendation does to the ranking math (grounded on the 2026-10-09
cache, `default` role, 146 eligible):

- **`endpointCeilings`** (`filters.tools: true`, `filters.minOutputTokens:
  16384`) drops tool-incapable routes and routes whose output ceiling is below
  16 384 tokens from the priced pool (see *Endpoint filters*): 146 → 135
  eligible, leader unchanged (`deepseek-v4.1-flash`, 0.37 $/M). 16 384 is the
  video's own threshold (19 endpoints cap output at or below it).
- **`cachePricing`** (`cacheHitRate: 0.5`) reprices the role on a cache-heavy
  loop's invoice (see *Cache-read pricing*): 146 eligible, leader unchanged, its
  `priceEff` 0.3732 → 0.3522 (−5.6 %). 0.5 is the low end of the measured
  third-party range (51–69 %), so the preset never over-credits a cache.
- **`providerPinning`** (`preferOwnProvider: true`) prices a model on its
  **best route** — the route maximizing the role's own value (`q_route −
  λ·priceEff_route`, with the route's p50 throughput and cache-adjusted billed
  price) among the routes that pass the role's endpoint filters — falling back to
  the default `1/price²` blend only when the model has no candidate route. It is
  a **per-model policy, not a scalar** — the sensible pin differs per model, so
  the bundle carries a policy field evaluated against the model's own routes at
  rank time, not a slug baked into the lock file. `bestRoute` (`src/engine.ts`)
  is `rankedRoutes(model, def)[0]`: the candidates are the model's routes that
  are non-degraded (`status === 0`), pass `routePassesEndpointFilters`, carry a
  usable billed price, and (when `filters.maxPriceUsdPerM > 0`) a
  thinking-adjusted price at or below the cap; ties break by `providerSlug` then
  `id`, so a re-run is deterministic. The basis is **soft**: a model with no
  candidate route keeps the blend and is never dropped, so the capability
  **never changes eligibility** (unlike the hard `providerPin`, which drops a
  model with no matching route). Measured coverage on the 2026-10-09 cache: all
  151 routed models have a candidate route (the old own-lab slug-prefix rule
  matched only 51 of 149), so the capability covers the whole routed field. The
  resolved route is the same basis a hard pin uses, so the preference moves the
  **throughput** axis as well as the billed price — a role that routes to the
  best endpoint gets that endpoint's p50 tok/s, not the blend's. Measured on the
  2026-10-09 cache, the `default` leader's `priceEff` rises 0.3732 → 1.4625 while
  its `value` *rises* 0.8100 → 0.8150, because its best route's p50 throughput is
  higher than the blend's, so `q` moves too. That is deliberate (the pin path has
  always priced and measured on the pinned route); a role that wants the blend's
  throughput should leave the flag off.
- **`costCap`** (`filters.maxPriceUsdPerM: 10`) drops the priciest tail of the
  eligible pool: 146 → 137 (the top ≈6 %), leader unchanged. The pool's p90 is
  7.8 and p95 11.1 $/M, and every role leader sits at 0.20–3.71 $/M, so the
  preset never excludes today's leader.

**Interaction with the switch hysteresis.** `switchMargin`/`priceSwitchFraction`
compare a challenger against the incumbent on `value` and `priceEff`. A flag that
reprices the **whole field** (`cachePricing`, `providerPinning`) moves **both
sides** of that comparison, so it can hold a switch that would otherwise happen
(or vice versa). Flip such a flag **between runs**, not mid-day: the day gate
stamps one run per UTC day, and a mid-day flag change would compare a
half-repriced field against a stale incumbent.

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

**The nine-axis focus-metric gate.** A focus metric that is fill-0 and covers too
little of the field turns `q` into a coverage score (a missing weighted metric
contributes 0 while occupying its denominator share). `assessFocusMetric(models,
metric, declared, source?)` (`src/agent-create.ts`) is the one rule, returning a
`FocusMetricAssessment` with nine axes, each `{ …, status: "ok" | "below-bar" |
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
- **trust** — the self-reported share of the payload's covered entries (the
  per-entry `self_reported` flag, read by `parseBenchmarkPayloadMeta`), below-bar
  above `FOCUS_SELF_REPORTED_MAX_SHARE` (0.5). A mostly vendor-submitted source
  cannot be trusted to rank on. The `source` argument carries the cached trust
  inputs (`cachedSourceInfo`: the source's scores cache for the payload meta, the
  catalog cache for the row); a payload with no entry flags (a declared or
  writing source) or no covered entries is `unknown` — never a silent `ok`.
  `verified` is uniformly `false` upstream today, so it is carried but not gated.
  The axis also carries the catalog row's `is_community` flag as `community` — a
  community-submitted benchmark is visible even when the payload half is absent
  (no per-entry flags); it is an annotation, never a gate (it never changes
  `status` and `belowBarReason` has no community branch).
- **modality** — the catalog row's `modality` (e.g. `text`/`image`/`audio`/
  `video`/`multimodal`) and the payload's per-entry `multimodal` share, read by
  `parseBenchmarkPayloadMeta` and carried on `BenchmarkCatalogEntry`. This axis
  is an **annotation, never a gate**: there is no role modality field, so it is
  never `below-bar` and never a drop reason (`belowBarReason` has no modality
  branch). It is `unknown` only when neither the catalog row nor the payload
  carries a modality signal.
- **maintenance** — the catalog row's `updated_at` age in months against
  `FOCUS_DATASET_STALENESS_MONTHS` (12), with `version_count`/`star_count`
  carried as supporting detail. This is the **dataset-date** axis, distinct from
  `freshness` (the **model-date** axis): freshness asks whether the benchmark
  tracks the model field, maintenance asks whether the benchmark *project* is
  alive. A benchmark whose dataset was last touched years ago but whose rows
  happen to include one recent model passes freshness and is caught here. Like
  modality it is an **annotation, never a gate**: `belowBarReason` has no
  maintenance branch, so a stale dataset is warned but never drops a discovered
  candidate. It is `unknown` when the catalog row is absent or its `updated_at`
  is missing/unparseable.
- **provenance** — the benchmark's owner (the catalog row's `dataset_org_id`,
  falling back to `dataset_slug`) and the source's own per-entry org mix (the
  dominant lab and its share, read by `parseBenchmarkPayloadMeta` from each row's
  `organization_id`, falling back to `provider_id`), below-bar above
  `FOCUS_PROVENANCE_DOMINANT_SHARE` (0.5 — a **chosen, tunable heuristic**, not a
  measured value). This is the **source's own claim** about who publishes the
  benchmark and whose scores it carries: an independent cross-check on the
  pool-derived `composition` axis, **not a replacement for it** (the composition
  rule is unchanged). `compositionAgreement` records whether the two concur:
  `"disagree"` when exactly one of the two flags `below-bar`, `"agree"` when both
  or neither do, `"unknown"` when the payload carries no org mix. Like modality
  and maintenance it is an **annotation, never a gate**: `belowBarReason` has no
  provenance branch, so a vendor-populated source is warned but never drops a
  discovered candidate. It is `unknown` when there is neither an owner nor a
  payload org mix.
- **cross-source** — the zeroeval per-entry price/throughput/context
  (`BenchmarkPayloadMeta.crossSource`, keyed by the entry's `model_id`) compared
  against the plugin's own `price`/`throughput`/`context`. The join is **direct
  on the bare id** (the generic llm-stats benchmark's `entries[].model_id` is the
  llm-stats id, the same space as `Model.id`); only models present in the map AND
  carrying the metric count toward `compared`. price compares zeroeval's 3:1
  blend `(3·input + output)/4` against `m.price` ($/M), context compares
  `row.context` against `m.context`, and the relative divergence is
  `|a − b| / max(a, b, 1e-9)`; `priceDivergence`/`contextDivergence` are the
  median over the models compared on that axis (`null` when none). An axis is
  `unknown` when nothing was compared on it, else `ok` within
  `PRICE_AGREEMENT_TOLERANCE` (0.5 — a **chosen, tunable heuristic**), else
  `below-bar`. `speedAgreement` is **informational only** and excluded from
  `status`: the units differ (zeroeval `speed_rps` is requests/s, the plugin's
  `throughput` is output tok/s) and re-deriving throughput from `speed_rps` is
  explicitly out of scope. `status` is `unknown` when `compared === 0`, else
  `below-bar` when `priceAgreement` or `contextAgreement` is `below-bar`, else
  `ok`. Like modality, maintenance and provenance it is an **annotation, never a
  gate**: `belowBarReason` has no cross-source branch, and the axis never feeds
  `price`/`weightPrice` or any ranking input — the `1/price²` blend is unchanged.
  (A future option, recorded here only: use zeroeval's list price as a fallback
  fill for a model with no OpenRouter route.)

An empty pool (unknown field size) or `covered === 0` (the metric's scores were
not loaded) reports **all nine axes `unknown`**, coverage included — never a
silent `ok`. `belowBarReason(assessment)` names the failed axis.

**Enforcement.** The pre-fetch catalog gate is count-only (`modelCount >= 3`); the
create-agent gate then probe-fetches each selected candidate's source
(`loadBenchmarkScores`), joins it onto the ranking universe, and assesses the
joined pool. A **discovered** candidate below-bar on any gating axis is dropped
non-fatally with a reason naming the axis; a **user-named** metric is never
dropped — it is annotated and warned. The report prints the nine signals and
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
   0-filled. The nine-axis focus-metric gate (above) is the automated check for
   this rule: it drops a discovered candidate that is below-bar on coverage,
   dispersion, composition, freshness or trust (modality, maintenance,
   provenance and cross-source are annotations, never a drop).
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

## Guardrail/alignment axis: measured, not landed (2026-10-06, issue #31)

The catalog's guardrail/alignment entries were evaluated as a "completes the
objective without tripping guardrails" axis and **not landed** — no role weights
one. Measured over the 2026-10-06 400-model field (clean HEAD `01fd7f2`,
throwaway worktree, `loadRankData({ roles: {} })` + `loadBenchmarkCatalog(false)`):
the catalog carries 745 entries; 57 match a guardrail/alignment keyword
(`guardrail`, `alignment`, `safety`, `attack`, `jailbreak`, `harm`, `refusal`,
`automationbench`, `agentdojo`, `siren`, `trust`, `toxicity`, `bias`) in
id/name/description/categories; 30 of those clear the pre-fetch count gate
(`modelCount >= 3`).

- **The semantically-relevant entries are at one model.** The pair the issue
  names — `siren-agentdojo-attack-success` and `siren-agentdojo-utility` — and
  `automationbench-aa` each carry `modelCount = 1`, below the count gate, so none
  is even probe-fetchable. The rest of the `safety` category is the same:
  `air-bench`, `wmdp`, `wmdp-bio`, `wmdp-chem`, `wmdp-cyber`, `cyberseceval-4`,
  `cve-bench`, `cwe-bench`, `cathedralbench`, `gray-swan-ipi`, `mask`,
  `miabench`, `biolp-bench`, `cloningscenarios`, `protocolqa`,
  `protocolqa-open-ended`, `google-real-world-vulnerability-discovery`,
  `ci-memories-coverage`, `ci-memories-violation` are all 1 model; `cybench`,
  `mimo-cyber-bench`, `vct` are 2. Nothing in the catalog measures
  guardrail-compliance at usable coverage.
- **Coverage**: the best-covered candidate is 20/400 = **5.0%**
  (`automationbench`, `cybergym`, `winogrande`; the llm-stats per-benchmark
  endpoint caps `entries` at 20, so `automationbench` 22 and `winogrande` 23 load
  only 20). Every other candidate is 0.7–4.0%. The 35% `FOCUS_COVERAGE_FLOOR` is
  7× away from the best candidate and ~50× from the median. `general` covers
  377/400 (94.3%) for scale. (The generic `bench:<id>` source is
  capability-filled at 0.195, so `assessFocusMetric`'s coverage axis reads `ok`
  for all of them — the raw share is the binding number here.)
- **Correlation with `general`** (covered pool): the safety/security entries are
  collinear — `capture-the-flag-challenges` 1.00, `figqa` 1.00, `exploitbench`
  0.97, `sec-bench-pro` 0.97, `cybersecurity-ctfs` 0.97, `alignbench` 0.97,
  `attaq` 0.93, `internal-research-debugging-evaluation` 0.92, `xstest` 0.91,
  `exploitgym` 0.89. The only low-correlation candidate is `automationbench`
  (r 0.24 with `general`, 0.30 with `agents`, 0.61 with `tool_calling`) — but it
  is an agentic-automation benchmark (categories `reasoning|agents|tool_calling`),
  not a guardrail axis, and it covers 5.0%.
- **0-fill leader flip** (`default`, share taken from the collinear `code`+`agents`
  block = 0.2842; baseline leader `deepseek-v4.1-flash` $0.599/M): most of the
  flips that happen go to **pricier** models — `capture-the-flag-challenges` 0.04 →
  `gpt-5.6-sol` ($6.13/M, 10.2×), `exploitbench` 0.04 → `glm-5.3` ($2.47/M,
  4.1×), `internal-research-debugging-evaluation` 0.06 → `gpt-5.6-sol` (10.2×),
  `cybersecurity-ctfs` 0.21 → `gpt-5.3-codex` ($4.81/M, 8.0×), `exploitgym` 0.22
  → `gpt-5.6-sol` (10.2×), `cybergym` 0.30 → `mimo-v2.6-pro` ($0.543/M, cheaper),
  `alignbench` 0.32 → `qwen3-14b` ($0.165/M, cheaper), `voicebench-avg` 0.14 →
  `inkling-small` ($0.638/M, ≈same), `winogrande` 0.20 → `mimo-v2.5-pro`
  ($0.622/M, ≈same). The capability-fill posture (the real posture for
  `bench:<id>`) moves the thresholds only slightly (`exploitgym` 0.16,
  `cybersecurity-ctfs` 0.26, `alignbench` 0.37) and never changes the direction.
  `automationbench`, `attaq`, `xstest`, `pope`, `figqa`, `sec-bench-pro`,
  `crag`, `big-bench`, `vqav2` do not flip the leader at any share up to 0.40 —
  they are the least-covered entries.

**Verdict: do not land.** No candidate clears the coverage bar (best 5.0% vs the
35% floor), the semantically-relevant guardrail entries are at one model, and the
safety/security entries that do carry data are collinear with `general`
(r 0.89–1.00). The one low-correlation candidate (`automationbench`, r 0.24) is
an agentic-automation benchmark, not a guardrail axis, and still covers only 5.0%.
The 0-fill is a cost-promotion lottery: most of the flips that happen land on
models 3–10× more expensive than the leader. No declarative source is authored —
the catalog is the only fetchable guardrail-adjacent data and it is too sparse.

### Candidate table (modelCount ≥ 3, 2026-10-06 field)

`flip0` = 0-fill leader-flip share; `flipCap` = capability-fill (0.195) share;
`none` = no flip up to 0.40. `rAgents` is `n/a` when fewer than 3 covered models
carry `agents`.

| catalog id | metric | modelCount | covered/400 | r(general) | r(agents) | dispersion | flip0 | flipCap |
|---|---|---|---|---|---|---|---|---|
| automationbench | bench:automationbench | 22 (20 loaded) | 20 (5.0%) | 0.24 | 0.30 | 0.62 | none | none |
| cybergym | bench:cybergym | 20 | 20 (5.0%) | 0.48 | 0.75 | 0.14 | 0.30 → mimo-v2.6-pro | 0.30 → mimo-v2.6-pro |
| winogrande | bench:winogrande | 23 (20 loaded) | 20 (5.0%) | 0.60 | n/a | 0.13 | 0.20 → mimo-v2.5-pro | 0.24 → mimo-v2.5-pro |
| global-mmlu-lite | bench:global-mmlu-lite | 16 | 16 (4.0%) | 0.88 | n/a | 0.33 | 0.15 → inkling-small | 0.18 → inkling-small |
| healthbench-professional | bench:healthbench-professional | 14 | 14 (3.5%) | 0.95 | 0.93 | 0.14 | 0.06 → gpt-5.6-sol | 0.09 → gpt-5.6-sol |
| healthbench | bench:healthbench | 13 | 13 (3.3%) | 0.70 | 0.84 | 0.08 | 0.07 → gpt-5.6-sol | 0.10 → gpt-5.6-sol |
| healthbench-hard | bench:healthbench-hard | 11 | 11 (2.8%) | 0.66 | 0.61 | 0.46 | 0.12 → gpt-5.6-sol | 0.30 → gpt-6.1-sol |
| exploitbench | bench:exploitbench | 8 | 8 (2.0%) | 0.97 | 0.95 | 0.57 | 0.04 → glm-5.3 | 0.06 → glm-5.3 |
| exploitgym | bench:exploitgym | 8 | 8 (2.0%) | 0.89 | 0.84 | 0.69 | 0.22 → gpt-5.6-sol | 0.16 → muse-spark-1.3 |
| sec-bench-pro | bench:sec-bench-pro | 7 | 7 (1.8%) | 0.97 | 0.96 | 0.25 | none | none |
| global-mmlu | bench:global-mmlu | 7 | 7 (1.8%) | 0.98 | 1.00 | 0.50 | 0.20 → mimo-v2.5-pro | 0.25 → mimo-v2.5-pro |
| alignbench | bench:alignbench | 5 | 5 (1.3%) | 0.97 | n/a | 0.10 | 0.32 → qwen3-14b | 0.37 → qwen3-14b |
| bfcl-v2 | bench:bfcl-v2 | 5 | 5 (1.3%) | 0.74 | n/a | 0.10 | 0.34 → llama-3.3-70b-instruct | 0.40 → llama-3.3-70b-instruct |
| healthbench-consensus | bench:healthbench-consensus | 5 | 5 (1.3%) | 0.79 | 0.55 | 0.004 | 0.04 → gpt-5.6-sol | 0.05 → gpt-5.6-sol |
| xstest | bench:xstest | 4 | 4 (1.0%) | 0.91 | n/a | 0.035 | none | none |
| tempcompass | bench:tempcompass | 4 | 4 (1.0%) | 1.00 | 0.74 | 0.13 | 0.28 → seed-2.0-mini | 0.34 → seed-2.0-mini |
| vlmsarebiased | bench:vlmsarebiased | 4 | 4 (1.0%) | 0.89 | 0.84 | 0.17 | 0.36 → seed-2.0-mini | none |
| attaq | bench:attaq | 3 | 3 (0.7%) | 0.93 | n/a | 0.014 | none | none |
| pope | bench:pope | 3 | 3 (0.7%) | 0.42 | n/a | 0.018 | none | none |
| capture-the-flag-challenges | bench:capture-the-flag-challenges | 3 | 3 (0.7%) | 1.00 | 1.00 | 0.06 | 0.04 → gpt-5.6-sol | 0.05 → gpt-5.6-sol |
| cybersecurity-ctfs | bench:cybersecurity-ctfs | 3 | 3 (0.7%) | 0.97 | n/a | 0.52 | 0.21 → gpt-5.3-codex | 0.26 → gpt-5.3-codex |
| figqa | bench:figqa | 3 | 3 (0.7%) | 1.00 | n/a | 0.35 | none | none |
| internal-research-debugging-evaluation | bench:internal-research-debugging-evaluation | 3 | 3 (0.7%) | 0.92 | 0.95 | 0.13 | 0.06 → gpt-5.6-sol | 0.08 → gpt-5.6-sol |
| voicebench-avg | bench:voicebench-avg | 3 | 3 (0.7%) | 1.00 | n/a | 0.10 | 0.14 → inkling-small | 0.18 → inkling-small |
| vqav2 | bench:vqav2 | 3 | 3 (0.7%) | 0.76 | n/a | 0.018 | none | none |
| big-bench | bench:big-bench | 3 | 3 (0.7%) | 0.39 | n/a | 0.045 | none | none |
| crag | bench:crag | 3 | 3 (0.7%) | 0.90 | n/a | 0.08 | none | none |

Not loadable (404 on the per-benchmark endpoint): `alpacaeval-2.0` (4),
`automationbench-1.0.6` (5), `vqav2-(val)` (3). Below the count gate (1–2 models):
the `siren-agentdojo-*` pair, `automationbench-aa`, and the rest of the `safety`
category listed above.

## Per-task cost composite: measured, not landed (2026-10-06, issue #32)

Issue #32 asked to rank on a per-task cost/throughput composite **when a per-task
token profile is available**, keeping the current $/M price as the fallback, and
to quantify the gap and defer when no profile source exists. **Verdict: defer.**
No per-task (or per-role) token profile exists, so the $/M price stays the price
axis. The closest available source — OpenRouter's per-model analytics, which the
plugin already downloads and ignores — is a *platform-wide, per-request* profile,
not the role's workload; using it would price OpenRouter's traffic mix, not the
plugin's.

### What the $/M proxy assumes

`priceEff` is the billed 3:1 blend `(3·p_in + p_out)/4` scaled by the role's
thinking factor. A per-task price is `tokens_per_task × priceEff`, so the proxy
makes two assumptions the composite would relax:

1. **A fixed 3:1 input:output token mix** (output = 25% of the mix). Measured on
   6,813 real assistant turns in this repo's sessions: **5.74:1** (output =
   14.8%). The blend over-weights the output price by ~1.7×. Per-model
   `p_out/p_in` spans 0.8–800 (median 4.19) over the 448 OpenRouter models with
   both prices, so the correction is a per-model price rescale of up to 1.72×.
2. **A model-independent token count per task.** If `tokens_per_task` is constant
   across models, the per-task price is a constant × `priceEff` — a pure λ
   rescale with no ranking change. The composite only bites when
   `tokens_per_task` varies by model (a verbose/retrying model costs more per
   task).

### Source 1 — a published per-task metric: none

- **llm-stats leaderboard** (`LlmStatsRow`, 56 fields in the 2026-10-06 cache):
  `input_price`/`output_price` ($/M), `throughput` (output tok/s), `latency`
  (TTFT), the index/benchmark scores, `params`, `training_tokens`. No
  token-usage, cost-per-task or output-tokens-per-task field. `training_tokens`
  is a pretraining count, not per-task usage.
- **Benchmark catalog** (`loadBenchmarkCatalog`, 745 entries): every entry is
  `{id, name, description, categories, modelCount}`. No token/cost field; the
  descriptions mention "token" only as context length.

### Source 2 — omp's recorded per-role usage: auxiliary-only

omp's session jsonl carries a dedicated `model_usage` event with a `role` tag
(`{type:"model_usage", purpose, role, api, provider, model, usage:{input, output,
cacheRead, cacheWrite, totalTokens, cost}}`). Across all 433 session files it
holds **2,833 records, 2 roles, 2 models** — `typesafe` (2,832; the judge role)
and `tiny` (1) — and every record is an *auxiliary* call: `judge_batch` 2,235,
`unexpected-stop` 255, `auto-thinking` 218, `find` 122, `judge` 3. The main
assistant turn's usage sits on the `message` record with `model` but **no role
tag** (6,813 turns, 7 models, 36.9M input / 6.4M output). So omp records per-role
usage only for harness-internal calls, never for the role's own work, and never
per task. The plugin's own `llm-role-history.jsonl` records per-role *decisions*
(`role, from, to, reason, score, bestScore, currentScore`) with no token fields.

### Source 3 — OpenRouter analytics: a per-model profile, but not per-task/per-role

The OpenRouter find payload the plugin already fetches
(`openrouter.ai/api/frontend/v1/models/find`, cached as
`openrouter-fetched-data.json`) carries `data.analytics`: per permaslug+variant,
`count` (requests), `total_prompt_tokens`, `total_completion_tokens`,
`total_native_tokens_reasoning`, `total_native_tokens_cached`, `total_usage` ($),
`total_tool_calls`, `date`. `src/` reads none of it (`grep analytics src/` → no
hits). It is a real per-model token+cost profile, but it does not satisfy the
issue's requirement:

- **Platform-wide, not the role's workload.** The plugin's own measured
  input/req is **~10–14× lower** than the platform's prompt/req for the same
  models (deepseek-v4.1-flash 4,451 vs 57,018; glm-5.3 4,533 vs 63,434;
  mimo-v2.6-pro 7,556 vs 80,780; hy4-preview 9,302 vs 113,793). The platform's
  prompt/req reflects long-context agentic traffic, not omp's turns. Output/req
  is closer (deepseek 955 vs 926; glm-5.3-flash 906 vs 931), so the *verbosity*
  signal is usable but the *workload* signal is not.
- **Per-request, not per-task.** `count` is API calls; an agent task spans many.
- **Single-day snapshot** (576/625 entries dated 2026-09-29), so it is
  stale-prone.
- **152/400 coverage** (standard variant, `count > 0`); the other 248 models
  would fall back to $/M, giving a mixed axis.
- **Not per-role.** The issue allows "per role, or per model × role"; this is
  per-model only.

### Measured effect (if the analytics were used as the profile)

Re-ranking the 2026-10-06 field with `priceEff × (tokens_per_task / median)`,
uncovered models at the $/M fallback (t = 1):

| role | current #1 | composite #1 | change |
|---|---|---|---|
| `default` | deepseek-v4.1-flash | deepseek-v4.1-flash | same |
| `plan` | muse-spark-1.3 | qwen3.8-flash | changed |
| `slow` | muse-spark-1.3 | deepseek-v4.1-flash | changed |
| `smol` | muse-spark-1.1 | mercury-2 | changed |

The output-only variant (completion+reasoning per request, the model-controlled
part) changes the same three roles. So the composite is not inert — but the
change is driven by the platform's workload mix (tokens/req spans 437–114,810,
262×), not by the role's task. The token-mix correction alone (3:1 → 5.74:1) does
**not** change any leader (only a #5 swap in `default`).

### Verdict

**Do not land.** No per-task token profile exists: the published sources carry no
per-task metric, omp's per-role usage is auxiliary-only (2 roles, 2 models), and
the one per-model profile the plugin already has (OpenRouter analytics) is
platform-wide aggregate traffic whose prompt/req is ~10–14× the plugin's own
measured input/req. Landing it would price OpenRouter's workload mix, not the
role's, and would change 3 of 4 leaders on that basis. The $/M proxy remains the
price axis.

**What would change the verdict:** a per-role (or per-model × role) token count
from the plugin's own recorded usage. The plugin already sees the main-turn usage
per model (session jsonl) and the role→model mapping (config.yml); recording the
role alongside the turn's usage would give a per-role profile the composite could
use without the platform-workload confound. Until then this is a measurement, not
a weight change.

## Agentic multi-agent axes: measured, not landed (2026-10-06, issue #33)

The named multi-agent behaviours — delegation, small agent teams (SATs), agent
handoffs, agent swarms, failure recovery / self-healing, agent-to-agent
communication — were searched for in the llm-stats benchmark catalog and
**not landed** — no role weights an axis for them, because no source measures
them.

**Sweep.** The catalog (745 entries) was swept on `id`/`name`/`description`/
`categories` for `delegat`, `swarm`, `handoff`, `recover`, `self-heal`, `a2a`,
`agent-to-agent`, `negotiat`, `multi-agent`, `team`, `coordination`,
`orchestrat`, `collaborat`, `subagent`. **Zero hits** for delegat / swarm /
handoff / recover / self-heal / a2a / agent-to-agent / negotiat / subagent. The
17 hits that did match are:

| catalog id | models | matched | what it actually measures |
|---|---|---|---|
| `supergpqa` | 37 | collaborat | graduate QA; "Human-LLM **collaborative** filtering" is annotation methodology |
| `mcp-atlas` | 36 | coordinat | **single-agent** tool use ("coordinate and utilize multiple tools") |
| `tau2-telecom` | 36 | coordination | dual-control **human↔agent** conversation (Dec-POMDP) |
| `hmmt-2025` | 33 | team | math competition **team rounds** |
| `multichallenge` | 32 | collaborat | multi-turn conversation (instruction retention, self-coherence) |
| `hmmt25` | 28 | team | math competition team rounds |
| `tau2-airline` | 24 | coordination | dual-control human↔agent conversation |
| `automationbench` | 22 | orchestrat | **single-agent** tool orchestration |
| `big-bench` | 3 | collaborat | "**collaborative** benchmark" = many contributors |
| `phibench` | 3 | team | Microsoft internal math/coding benchmark |
| `acebench` | 2 | multi-agent | the **only** multi-agent eval (an "Agent" sub-type); 2 models |
| `mcp-universe` | 1 | orchestrat | single-agent MCP tool orchestration |
| `cathedralbench` | 1 | team | red-team cyber |
| `groundui-1k` | 2 | coordinat | UI grounding |
| `swe-bench-verified-(agentic-coding)` | 2 | coordinat | single-agent coding |
| `swe-bench-verified-(agentless)` | 2 | coordinat | single-agent coding |
| `swe-bench-verified-(multiple-attempts)` | 1 | coordination | single-agent coding |

A broader sweep of the agentic vocabulary (`agent`, `tool`, `plan`, `memory`,
`workflow`, `long-horizon`, `computer-use`, `mcp`, `environment`, `simulat`,
`theory of mind`, `cooperat`, `adversar`, …) returns ~40 agentic benchmarks
(`toolathlon` 42, `terminal-bench-2` 53, `agents-last-exam` 21, `t2-bench` 23,
`nl2repo` 23, `osworld-2.0` 15, `claw-eval` 14, `tau3-banking` 12, `mcp-mark` 9,
`coworkbench` 6, `vending-bench-2` 4, …). **Every one is single-agent**
long-horizon / tool-use / computer-use; none scores delegation, teams, handoffs,
swarms, recovery or a2a. The nearest thing to a multi-agent axis in the whole
catalog is `acebench`'s "Agent (multi-agent interactions)" sub-type, at 2 models.

**Four-axis gate on the candidates with ≥ 3 models** (metric = `bench:<id>`,
generic llm-stats source, joined direct on `model_id`):

| candidate | catalog | loaded | covered | dispersion | composition | freshness | r(general) | r(agents) | gate |
|---|---|---|---|---|---|---|---|---|---|
| `supergpqa` | 37 | 20 | 20/400 (5.0%) | 0.062 | below-bar (Google, OpenAI) | 3.2 mo | 0.867 | 0.765 | reject |
| `mcp-atlas` | 36 | 20 | 20/400 (5.0%) | 0.092 | ok | 1.1 mo | 0.607 | 0.695 | reject |
| `tau2-telecom` | 36 | 20 | 20/400 (5.0%) | 0.061 | below-bar (Qwen, Google) | 4.3 mo | 0.735 | 0.429 | reject |
| `hmmt-2025` | 33 | 20 | 20/400 (5.0%) | 0.048 | below-bar (Google) | 3.4 mo | 0.615 | 0.199 | reject (dispersion) |
| `multichallenge` | 32 | 20 | 20/400 (5.0%) | 0.194 | below-bar (Google) | 3.8 mo | 0.355 | 0.326 | reject |
| `hmmt25` | 28 | 20 | 20/400 (5.0%) | 0.147 | below-bar (Google, OpenAI) | 1.1 mo | **0.909** | 0.712 | reject (collinear) |
| `tau2-airline` | 24 | 20 | 20/400 (5.0%) | 0.149 | below-bar (Google) | 5.7 mo | 0.694 | 0.439 | reject |
| `automationbench` | 22 | 20 | 20/400 (5.0%) | 0.622 | ok | 0.0 mo | 0.242 | 0.299 | **clears all axes** |
| `big-bench` | 3 | 3 | 3/400 (0.8%) | 0.045 | below-bar | 27.1 mo | 0.389 | — | reject |
| `phibench` | 3 | 3 | 3/400 (0.8%) | 0.128 | below-bar | 17.0 mo | 0.993 | — | reject |
| `acebench` | 2 | 2 | 2/400 (0.5%) | 0.000 | below-bar | 12.8 mo | — | — | reject (below 3-model floor) |
| `mcp-universe` | 1 | 1 | 1/400 (0.3%) | — | below-bar | 9.9 mo | — | — | reject (below 3-model floor) |

`automationbench` is the only candidate that clears the implemented nine-axis
gate (dispersion 0.62, composition ok, freshness ok, r(general) 0.24,
r(agents) 0.30) — but it measures **single-agent tool orchestration**, not
delegation / teams / handoffs / swarms / recovery / a2a, and it covers 5% of the
field. Landing it under an agentic-axis label would be mislabeling, and the
issue forbids a stub or synthetic axis.

**Coverage ceiling (structural).** The per-benchmark endpoint caps `entries` at
`BENCHMARK_ENTRY_CAP = 20` regardless of `limit`/`offset`/`page`/`per_page`, so
a generic `bench:<id>` metric can never cover more than 20 of the 400 models —
5.0%, against a `FOCUS_COVERAGE_FLOOR` of 0.35 (≥ 140 models). The best-covered
agentic candidate in the catalog (`toolathlon`, 42) would still load ≤ 20. The
top of the catalog by `model_count` is general-knowledge / coding (`gpqa` 250,
`mmlu-pro` 142, `aime-2025` 122, `swe-bench-verified` 116, `humanity's-last-exam`
104, `mmlu` 103); the highest-modelCount **agentic** entry is `toolathlon` at 42,
and the field already carries `toolathlon_score` (42 covered) from the index
payload.

**The general agentic axis is already covered; the multi-agent sub-axes are
not.** The field already carries agentic proxies, all in `KNOWN_METRICS`:
`agents` (index) 192/400 (48.0%, r(general) 0.918), `tool_calling` 202/400
(50.5%, r(general) 0.799, r(agents) 0.879), `mcp_atlas_score` 36 (9.0%),
`toolathlon_score` 42 (10.5%), `osworld_score` 21 (5.3%), `apex_agents_score` 10
(2.5%). The agentic-adjacent candidates that do have data are collinear with
them (`osworld` r(general) 0.927 / r(agents) 0.921; `browsecomp` 0.897 / 0.916;
`toolathlon` 0.828 / 0.858; `mcp_atlas` 0.772 / 0.805), so even a landed
tool-orchestration axis would add little independent signal.

**Verdict: do not land.** No catalog benchmark measures the named axes; the one
multi-agent eval is below the 3-model floor; the endpoint cap makes the coverage
bar unreachable for any generic benchmark; and the agentic-adjacent candidates
are either collinear with the shipped `agents`/`tool_calling` indices or measure
single-agent tool use. The honest outcome is the recorded evidence, mirroring
the domain-knowledge (#23) and truthfulness (#24) verdicts.

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
