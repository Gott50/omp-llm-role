# Current state (2026-10-25)

Dated snapshot of the ranking and the landed work as of the date in the heading —
matched/priced/eligible counts, per-role leaders, the open defects, and the
per-issue work log below. It is refreshed by
regenerating the report (`node src/cli/llm-role-rank.ts --out docs/llm-role-rankings.md`) and
copying the new numbers here; release prose belongs in
[`../../CHANGELOG.md`](../../CHANGELOG.md), not in this file. The model-level
ranking numbers below are the 2026-10-25 measurement (regenerated at the 1.6.0
cut). The pool moved 416 → 408 models and eight leaders moved (`default`,
`smol`, `slow`, `vision`, `commit`, `tiny`, `task`, `designer`; `plan` and
`advisor` held) because the daily caches moved, not the code: the ranking CLI
is unchanged since the 2026-10-19 measurement, which was itself byte-identical
to the 2026-10-18 one apart from the report's date line — the input-price blend
basis #21, the #17/#18/#19/#20 wave, the #34–#40 focus-axis/capability-flag
work, spec #81's explorer surfaces, and spec #103's opt-in selection rule (the
ranking CLI does not apply `selection`). The provider-pin numbers are the
2026-10-11 measurement (spec #71; see the top bullet). Neither is re-derived on
read.

- Release 1.6.0 (2026-10-25, cut `82b2a29`, tag `v1.6.0`): the spec #109 explorer
  settings editor and decision preview, and the spec #103 opt-in cheapest-model
  selection, ship. The report was regenerated at the cut and moved with the daily
  caches — 416 → 408 models, matched 151/416 → 144/408, priced 149 → 144,
  eligible 142 → 137 (vision 76 → 71, designer 89 → 84) — and eight leaders moved
  (`default`, `smol`, `slow`, `vision`, `commit`, `tiny`, `task`, `designer`;
  `plan` and `advisor` held), so the numbers below are the 2026-10-25
  measurement. Published by CD (run 40197223623, tag push): the guard and the npm
  floor passed, `npm publish` completed over OIDC trusted publishing with a
  provenance attestation (transparency log
  `https://search.sigstore.dev/?logIndex=3461736889`), and the GitHub Release was
  created with the 1.6.0 CHANGELOG section as its body
  (`https://github.com/Gott50/omp-llm-role/releases/tag/v1.6.0`). Verified:
  `dist-tags.latest` = `1.6.0`, npm's `gitHead` = `82b2a29` (the tag's commit),
  and the publish step's log carries the direct-publish signature (`Publishing to
  https://registry.npmjs.org/ with tag latest and default access`, `Signed
  provenance statement`, `+ omp-llm-role@1.6.0`, 61 files / 399.6 kB). All three
  install routes smoke-tested (omp 18.12.6, throwaway `HOME`s, cwd outside the
  real home tree): npm (`omp plugin install omp-llm-role`), git
  (`omp plugin install github:Gott50/omp-llm-role`) and marketplace
  (`omp plugin marketplace add Gott50/omp-llm-role` +
  `omp plugin install omp-llm-role@gott50-plugins`) each installed 1.6.0
  (`omp plugin doctor`: 4 ok / 0 warnings / 0 errors for npm and git; the
  marketplace install's one warning is the expected
  `package_manifest: Not created yet`), and each post-install session run
  (`omp -p "say ok"` with `OPENROUTER_API_KEY` from `omp token openrouter`) wrote
  `modelRoles` (9 roles), `retry.fallbackChains` (3 keys) and
  `task.disabledAgents: [designer]` into that HOME's `config.yml`, landed
  `llm-role-state.json` + `llm-role-history.jsonl` + `llm-role-usage.jsonl`, and
  answered `ok`. The three runs' picks differ (`default` →
  `deepseek-v4.1-flash` in the git run, `deepseek-v4.1-flash-1017` in the npm and
  marketplace runs) because the runs saw different live data — the keyed-catalog
  fetch returned 40 vs 41 blocked models — the documented live-data variance, not
  a route defect; a repeat of the npm and git smokes read 408 models and 40
  blocked in both and picked `deepseek-v4.1-flash` in both, so the variance is
  transient.

- Explorer settings editor and decision preview (2026-10-25, spec #109): the
  explorer becomes a full settings editor with a live "what the updater would
  write" preview. A **Settings panel** edits every global setting (the global
  knobs, plus the capability flags) with the effective value, the shipped
  default, a dirty marker and a reset; the per-role editor gains the five
  endpoint filters as first-class fields; a **Preview panel** shows, per managed
  role, the decision the updater would make (the model, the reason, the
  value/best value), the fallback chain and the config side effects, computed on
  the updater's own pre-walk candidate set (catalog/tier gate +
  allowed-providers prune + keyed-catalog prune) regardless of the table's pool
  toggle, and labelled **probe-optimistic** (it never issues a request, so the
  written pin can be a later route or absent). The decision core moved into a new
  pure module `src/selection.ts` (`decide`, `buildChains`, `agentDisablePatch`,
  `previewSelection`), shared by `runUpdater` and the preview, so the two cannot
  drift; `RunResult` gained `patch` so the agreement test can compare the chains
  a dry run would write. The one validated write path gained a global half:
  `mergeSettings` writes the global keys as flat dotted keys with the same
  delete-then-write semantics as the role half (`GLOBAL_SETTING_KEYS`), and
  `writeRoleSettings` validates both halves before any write. Export writes the
  global settings and the role defs in one validated, backed-up, atomic write.
  The ranking numbers are unchanged by this spec — the preview is read-only and
  the settings editor writes the lock file, not the ranking — but the report was
  regenerated at the 1.6.0 cut like every cut, and the dated numbers below moved
  because the daily caches moved, not the code; the suite grew
  738 → 792 (a two-axis review pass on this spec added five fixtures: the
  depth-0 agreement case, the user-scope agent pins, the agent-dir split, the
  nested global parent, and the absent-settings preview).

- Cheapest-model selection (2026-10-20, spec #103): a new opt-in rule replaces
  the primary choice's objective. `selection` (`"value"` default, or
  `"cheapest"`) and `qualityFloor` (a number in `[0, 1]`, default `0.9`, inert in
  `"value"` mode) — with per-role overrides `roles.<role>.selection` /
  `roles.<role>.qualityFloor` — let a role pick the **cheapest** candidate at or
  above `qualityFloor × anchor.q`, where the anchor is the pool's highest-`q`
  candidate. The decision table reuses the existing reason vocabulary: `adopted`
  (no incumbent in the pool), `switched` (the incumbent fell below the bar —
  dropped with no margin), `kept-eligible` (the pick is the incumbent),
  `switched-cost` (a bar-clearing incumbent undercut by `priceSwitchFraction`),
  `kept-margin` (otherwise). The primary hysteresis is cost-side only in this
  mode: `switchMargin` is not consulted, `priceSwitchFraction` (default `0.5`) is
  the only margin, and `0` disables the cost-side switch. The value ranking is
  still computed and still reported in the decision's `value`/`bestValue`/
  `currentValue` fields, so history rows stay comparable. The rule's pool is the
  role's usable candidate set (catalog/tier gate + allowed-providers prune +
  keyed-catalog prune) — not the probe window — and the pick is probe-verified on
  demand. The two floors are not merged: `fallbackQualityFloor` keeps its own
  meaning and gates chain membership only. **Measured blast radius** (2026-10-20
  cache, live resolved defs, as-written pool): with `selection: "cheapest"` and
  the bar at 0.9 the prospective pick differs from today's value leader for 6 of
  10 roles — `smol`, `slow`, `plan`, `commit`, `advisor` move to
  `deepseek-v4.1-flash-1017`, `tiny` to `glm-5.3-flash`; `default`, `vision`,
  `task` and `designer` are unchanged. The *written* change set is smaller (the
  cost-side margin holds a role whose challenger is not meaningfully cheaper —
  today's dry run shows `default` and `task` as `kept-margin`). The bar value is
  the differentiation knob: distinct picks across the 10 roles by bar value are
  0.80 → 1, 0.85 → 2, **0.90 → 2**, 0.95 → 3, 0.98 → 5, 1.00 → 6 — at the default
  0.9, 9 of 10 roles collapse onto one model. The explorer's as-written pool
  gained the keyed-catalog prune (key-blocked rows are pruned, not kept; the key
  diagnostic moves to raw mode), and the role payload gained the selection
  surface (the prospective pick, the bar, the per-row `excludedByBar` flag). The
  suite grew 688 → 738.

- `/refresh-roles --no-margin` (2026-10-19, spec #99): the command's args were
  ignored; they are now parsed by `parseRefreshRolesArgs` (an unrecognized token
  is reported as a usage line and **no run happens** — a deliberate change,
  `/refresh-roles <garbage>` used to run a normal refresh), and `--no-margin` runs
  the pipeline with `switchMargin` 0 **for that run only** — the README's own
  meaning of 0 ("always take the best"), so every role whose current model is in
  its candidate pool adopts that pool's leader. The override rides
  `runUpdater`'s `opts.switchMargin` and reaches the hysteresis ladder through a
  **copy** of the resolved settings, so every other consumer of `settings` keeps
  the configured value: `priceSwitchFraction`, `fallbackQualityFloor`,
  `fallbackChainDepth`, `writeFallbackChains`, the ranking, the value formula, the
  probe walk, the auto-pin, the chain's rules, the thinking levels and the
  prune-on-pin-change are all unchanged — the chain's **input** follows the new
  selector, so the written chain changes with it. Nothing is persisted: the
  override never reaches the lock file, the state or `resolveSettings` (which
  still validates the configured value), a **non-finite** value is ignored (fail
  closed — an applied `NaN` would make `>= NaN` false and silently degrade every
  role to `kept-margin`), and a later run in the same scope uses the configured
  margin again. It applies to a project-scoped run too, because the settings are
  resolved after the project lock is read. The run's notification gains
  `switchMargin ignored for this run (--no-margin)` and the history row gains a
  `switchMargin` field, both only when the override was active; the day gate is
  still stamped. No new setting, no settings-schema or explorer change, no CLI
  change and no new `DecisionReason`: with the margin at 0 the existing ladder
  yields `kept-eligible` (the incumbent *is* the pool leader), `switched` or
  `adopted`, and `kept-margin`/`switched-cost` become unreachable for that run. The
  margin is a hysteresis input, not a ranking input, so the ranking itself is
  unchanged — the report was regenerated at the 1.5.0 cut like every cut, and the
  numbers below moved because the daily caches moved, not because of this flag;
  the suite grew 666 → 688.

- Fallback chain quality floor (2026-10-19, spec #95): a role's fallback chain no
  longer only reorders the probe window — that window is `1 + fallbackChainDepth`
  models, the same size as the chain, so the reorder could never reach a cheaper
  model at rank 4 or deeper. The chain's fallback **models** now come from the
  role's whole ranked candidate list below the chosen model: the
  **cheaper-or-equal** ones first — a candidate qualifies only if it retains at
  least `fallbackQualityFloor` (a new setting, default `0.9`; `0` disables the
  floor, `1` requires an exact quality match) of the chosen model's own `q`, so a
  failover never silently drops the role onto a much weaker model — then the
  pricier ones, each bucket in value order, truncated to `fallbackChainDepth`.
  Key-blocked and probe-`blocked` candidates are excluded; an **unprobed**
  candidate stays eligible, so the chain can reach a cheaper-or-equal model ranked
  below the probe window (chain entries are never probe-verified — spec #90). A
  candidate priced exactly at the chosen model's price whose `q` is below the
  floor lands in neither bucket and is dropped. The floor gates **chain
  membership only**: the primary choice, the hysteresis decision, the ranking, the
  probe walk's stop condition and budget, the chain key, the route expansion, the
  thinking levels and the prune-on-pin-change are all unchanged, as are the
  manual-`providerPin` and no-pin paths. Measured on the 2026-10-19 caches with
  the live resolved defs (`fallbackQualityFloor` 0.9, depth 2): `slow`, `vision`
  and `task` gain cheaper fallbacks, the other seven roles are byte-identical, and
  no role is degraded. That is the **per-role** effect: in the written config only
  the `vision` key changes, because `deepseek-v4.1-flash@coreweave/fp8` is claimed
  by seven roles and carries the last claimer's chain (the shared-key behaviour
  spec #95 leaves out of scope). The ranking numbers are unchanged — the chain is a
  write-side shape, not a ranking input — so `docs/llm-role-rankings.md` is not
  regenerated and the dated numbers below stand as written; the suite grew
  652 → 666.

- Routability-verified auto-pin (2026-10-19, spec #90): the `providerPinning`
  auto-pin no longer writes the score-max route blind. The daily update walks the
  chosen model's `vfm` route order and probes each candidate with a one-token
  completion bound to it (`provider: { only: [slug] }`), because OpenRouter's
  endpoints API can list a route as healthy — non-degraded, a full
  `supported_parameters` list, 100 % uptime — while its routing table excludes it:
  the live config's `deepseek/deepseek-v4.1-flash@relace` passed every gate and
  then 404'd on every request, including every fallback revert. Only the narrow
  no-allowed-providers 404 skips a route; a timeout, a 5xx, a 429 and a 404 with
  any other body are `unknown` and count as usable, so a transient blip never
  unpins a role. Verdicts are cached per run by `catalogId@slug`, and the walk is
  capped at `ROUTE_PROBE_BUDGET = 12` probes per role. When no candidate is
  routable the pin is **dropped** — the selector stays bare and OpenRouter routes
  the request itself — and the run notes name the rejected slugs
  (`; route-blocked: …`), plus the dropped pin (`; pin dropped (no routable
  route)`) when none survived. The fallback chain keeps its shape
  (the primary contributes every gate-passing route except the pinned **slug** —
  see the chain bullet below), and **chain entries are not probed**: one
  unroutable entry is survivable, omp fails over. A manual
  `roles.<role>.providerPin` stays a hard gate: never probed, never replaced. The
  explorer's auto-pin line now reads as a **candidate** — the first route the walk
  tries, not a promise of the written pin. The ranking numbers are unchanged — the
  probe is a write-side gate, not a ranking input, and neither the ranking CLI nor
  `docs/llm-role-rankings.md` changed; the suite grew 631 → 652.

- Release 1.3.0 (2026-10-19, cut `55416d4`, tag `v1.3.0`): the spec #81 explorer
  surfaces ship. The report was regenerated at the cut and is **unchanged** from
  the 2026-10-18 measurement — matched 149/408, priced 148, eligible 140
  (vision 73, designer 87), the same ten leaders — so the numbers below stand as
  written. The cut also carried the #89 fix: the pre-commit hook and
  `tests/ci.test.ts` now scrub `GIT_*` from every child process, so the suite's
  temp-repo git calls can no longer target the real repository (suite 630 →
  631).

- Explorer as-written pool, per-task price, and price levers (2026-10-18, spec
  #81): the explorer gains a **pool toggle** (raw vs as-written), a **per-task
  price column**, and two **price-lever readouts**. The as-written pool applies
  the same two filters the updater applies before ranking — the catalog/tier gate
  and the allowed-providers whitelist prune — so the leader the user sees is the
  model the updater will write (the raw pool's leader differed from the config's
  for 6 of 10 roles). The per-task price is `inputTokens·p_in +
  outputTokens·p_out·thinkingFactor` over the role's priced route, using the
  plugin's own recorded per-role usage (the median per-turn counts) or the
  `tokenProfile` setting; it is **display-only** — the price axis stays `$/M`
  (issue #32's verdict stands) and the reported `$/M` keeps its billed 3:1 blend.
  The readouts are the leader-flip threshold (`λ* = min over cheaper challengers
  X of (q_L − q_X)/(pEff_L − pEff_X)`, `w* = 20λ*/(1+20λ*)`) and the thinking
  level's effect on the leader. A new append-only, capped, best-effort
  **usage ledger** (`llm-role-usage.jsonl`, one row per assistant turn) follows
  the plugin's state dir (`<project>/.omp` in project mode, `agentDir()`
  otherwise). The ranking numbers are unchanged — the ranking CLI does not apply
  the pool toggle, and the per-task price never feeds the sort key.
- Provider display (2026-10-12, spec #77): when the live session model carries a
  provider pin (a hand-set `providerPin`, or the automatic pin the
  `providerPinning` capability writes), the plugin keeps the model object's
  `name` suffixed with the route, so omp's status-line model segment renders
  e.g. `DeepSeek V4.1 Flash @coreweave/fp8`. The suffix is applied on session
  start, refreshed on the two fallback events, and re-derived at every
  `turn_start` — the re-derive is what heals the display after omp silently
  restores the primary model following a fallback cooldown (no session event is
  emitted), and it also covers a manual `/model` change with a one-turn lag. An
  event's selector is trusted only when it names the live session model, so an
  advisor fallback (the same events, the advisor's model) re-derives from the
  live model instead of stamping the advisor's pin onto the session.
  Display-only: the suffix rides the model object's `name`, so attribution,
  usage recording and model comparison are unaffected. The ranking numbers are
  unchanged.

- Provider ordering: value-for-money route score (2026-10-11, spec #71): the
  auto-pin route basis changed from the route's own value (`q_route −
  λ·priceEff_route`) to a min/max-normalized **value-for-money score** `vfm =
  wT·tNorm − wP·pNorm` (`wT = wTput/(wPrice+wTput)`, `wP =
  wPrice/(wPrice+wTput)`; `tNorm`/`pNorm` min/max over the candidate set), with a
  new **soft** `filters.preferredMinThroughput` floor (routes at or above sort
  first; below-floor routes are kept and sorted last) that the `providerPinning`
  preset sets to 50. `routeValue` is deleted. The model-level ranking is
  unchanged — the report is not regenerated (the ranking CLI does not apply
  capability features and no shipped role sets `preferOwnProvider`). Measured
  2026-10-11 on the current endpoints cache with the live lock's expanded defs
  (all four capabilities on, `cacheHitRate 0.9`; `deepseek/deepseek-v4.1-flash`,
  11 allowed providers, 12 allowed routes):
  `morph/fp8` ($0.0840,
  103 tok/s) wins `default`, `smol`, `commit`, `task`, `advisor`; `coreweave/fp8`
  ($0.1978, 185.5 tok/s) wins `slow`, `tiny`, `designer`; `decart/fp4` ($0.0639,
  72 tok/s) wins `vision`, `plan`.

- Auto-pin chain expansion (2026-10-10, issue #69): with `providerPinning` on,
  the fallback chain no longer stops at three providers per model — the primary
  model contributes every gate-passing route **except the pinned route** (the
  exclusion is by pinned slug, not by position: spec #90's probe can pin a route
  other than the score leader, so the leader rides as a chain entry, and a dropped
  pin excludes nothing), then each `fallbackChainDepth` fallback model contributes
  every gate-passing route, in score order (the `vfm` route score — spec #71
  replaced the original route-value order) and deduped by provider slug, so a down
  provider fails over to another provider of the same model before the chain
  switches models. Chain length is data-driven (`(R_primary − 1) + Σ R_fallback`,
  or `R_primary + Σ R_fallback` with a dropped pin) instead of the fixed
  `2 + 3·fallbackChainDepth`; the manual-`providerPin` and no-pin paths are
  unchanged. Which `fallbackChainDepth` **models** each chain falls back to was
  the probe window until spec #95, which draws them from the role's ranked
  candidate list below the chosen model with the quality floor (see the top
  bullet) — the route expansion above is unchanged. The ranking numbers are
  unchanged — the chain is a write-side shape, not a ranking input.
- Opt-in error reporting (2026-10-08, issue #48): a new `errorReporting` setting
  (`off` — the default — `ask`, `auto`) turns a genuinely unexpected failure — a
  command handler throwing, or a `runUpdater` abort whose `RunResult.defect` is
  set (a `ConfigEditError`/self-check mismatch or the catch-all throw; the
  enumerated environment aborts stay notify-only) — into one structured report
  (plugin version, runtime, platform, the failing command, error
  name/message/stack, timestamp) filed on `Gott50/omp-llm-role`. `ask` surfaces
  the exact payload and files on confirmation, degrading to a notified prefilled
  `…/issues/new` URL in a session with no UI; `auto` files without asking; `off`
  is byte-identical to the pre-#48 behaviour. A token (`GITHUB_TOKEN` → `GH_TOKEN`
  → `gh auth token`, never stored) uses the API; no token, or a 401/403/404 (a
  fine-grained PAT without Issues:write answers 404), falls through to the
  prefilled URL. The payload is redacted (home dir → `~`, token-shaped strings →
  `<redacted>`) and carries no config contents, model selectors, prompts or
  history rows. A fingerprint marker dedupes a repeat onto the existing open
  issue, and the path is capped (one open issue per fingerprint, one creation per
  fingerprint per UTC day, 3 per UTC day). The ledger of what was filed, offered
  or suppressed is `llm-role-error-reports.json` under the agent dir. The ranking
  numbers are unchanged — reporting is a side channel, not a ranking input.

- Empty-collection spellings accepted (2026-10-08, issues #54 + #55): a config
  whose `task.disabledAgents` is spelled `null` — or whose `retry.fallbackChains`
  / `modelRoles` body is the serializer's own indented `{}` / `[]` line — used to
  throw inside `parseConfig`, so **every session start aborted with `config edit
  refused: disabledAgents: inline value is not supported (block sequence
  expected)` and no role was ever refreshed**. omp re-serializes `config.yml`
  through Bun's `YAML.stringify` (`stringifyYamlConfig`), which spells an empty
  collection exactly that way, so those spellings now read as the empty
  collection and the patch path rewrites the placeholder line into the block
  form (`disabledAgents:` + `- "designer"`); any other inline value on a managed
  key line still throws. Verified against a copy of the real
  `~/.omp/agent/config.yml` (which carries `disabledAgents: null`): the run wrote
  and reported 8 decisions instead of aborting — and the real file carries its own
  production confirmation. Its 2026-10-08T16:34Z `session-start` run wrote the
  config while `disabledAgents: null` was present (config, `llm-role-state.json`
  and `llm-role-history.jsonl` are all stamped 18:34:17 local), which pre-fix was
  impossible: the read threw before any write. The write is recognizably the
  plugin's surgical one, not omp's serializer: a *changed* role line is re-quoted
  (`tiny: "…deepseek-v4.1-flash:off"`) while an unchanged one stays byte-identical
  (`smol: …deepseek-v4.1-flash:off`), the previously plugin-written
  `openrouter/inclusionai/ling-3.0-flash` chain key is pruned (a dumper never
  prunes), and the chain keys the plugin does not own (`web:`,
  `openrouter/~deepseek/…`) keep their unquoted items. The placeholder is left in
  place because the agent sync had nothing to add or remove — `patchDisabledAgents`
  early-returns then, by design. The same probe turned up two more defects, one of
  them tracked as its own issue (#55 — a different error-report fingerprint): the
  parent-block variant of this class — an empty `task:` + `  {}` / `retry:` + `  {}`
  used to take the new child key *after* the `{}` line, YAML no parser accepts,
  with the read-back self-check still passing, i.e. **silent corruption** — now
  has the child key replace the `{}` line, and a prune-only patch creates nothing;
  and #55's block-bound bug (`chainEntries` scanned to the end of `retry:`
  instead of to the end of `fallbackChains:`, so any sibling `retry.*` key
  aborted every run with `unexpected line in fallbackChains block`) is fixed by
  bounding the scan at the key's own indent. Ranking numbers unchanged.

- Capability presets (2026-10-07, issue #40): one opt-in flag per capability
  (`features.<id>` global, `roles.<role>.features.<id>` per role) applies the
  plugin's recommended settings to a role; every flag ships **off** and no
  shipped role sets one, so the resolved roles are byte-identical to
  `DEFAULT_ROLES` until a user opts in. The registry (`FEATURES` in
  `src/features.ts`) is the single source of truth and `expandFeatures` the
  single precedence implementation (`effective def = shipped default ⊕
  preset(enabled flags) ⊕ explicit user keys`; a per-role `false` beats a global
  `true`; an explicit knob always wins). Grounding on the 2026-10-09 cache
  (`default` role, 146 eligible; the `providerPinning` row is re-measured on the
  2026-10-11 cache):

  | Flag | Recommended settings | Measured effect |
  |---|---|---|
  | `endpointCeilings` | `filters.tools: true`, `filters.minOutputTokens: 16384` | 146 → 135 eligible, leader unchanged (`deepseek-v4.1-flash`, 0.37 $/M) |
  | `cachePricing` | `cacheHitRate: 0.5` | 146 eligible, leader unchanged, its `priceEff` 0.3732 → 0.3522 (−5.6 %) |
  | `providerPinning` | `preferOwnProvider: true`, `filters.preferredMinThroughput: 50` | per-model policy, never changes eligibility; prices each model on its **best route** (max `vfm` among the filter-passing, non-degraded, priced routes, cap-respecting; the soft 50 tok/s floor sorts below-floor routes last; ties by slug then id) — 144 of 144 routed models have a candidate route (2026-10-11), so the soft basis covers the whole routed field |
  | `costCap` | `filters.maxPriceUsdPerM: 10` | 146 → 137 eligible (the top ≈6 %), leader unchanged; pool p90 7.8, p95 11.1 $/M, every leader 0.20–3.71 $/M |

  `providerPinning`'s recommended setting is a **soft per-model policy**
  (`preferOwnProvider`), not a hard `providerPin`: a hard pin would make a model
  with no matching route ineligible and empty most of a role's pool, so the
  policy prices a model on its **best route** — the max-`vfm` route (the
  value-for-money score, with the soft 50 tok/s floor sorting below-floor routes
  last) among the filter-passing, non-degraded, priced routes (thinking-adjusted
  price ≤ `maxPriceUsdPerM`; ties by slug then id) — and falls back to the
  `1/price²` blend only when the model has no candidate route. The basis is soft:
  it never changes eligibility, and on the 2026-10-11 cache every one of the 144
  routed models has a candidate route, so the capability covers the whole routed
  field (the old own-lab slug-prefix rule matched only 51 of 149). `minContextTokens`
  is deliberately not in the `endpointCeilings` bundle (an absolute floor cannot
  express the video's fraction-of-the-model's-own-window complaint). The flags
  are settable from `create-role.ts`, `/create-agent`, `/project-roles`
  (`--feature`/`--list-features`) and the explorer's Features panel; the ranking
  numbers are unchanged until a flag is turned on.

- Cross-source axis (2026-10-07, issue #38): the focus-metric gate gained the
  cross-source axis — the zeroeval per-benchmark payload's **second, independent**
  set of the price/throughput/context quantities (`input_cost_per_million`/
  `output_cost_per_million`/`speed_rps`/`context_window`, read by
  `parseBenchmarkPayloadMeta` onto `BenchmarkPayloadMeta.crossSource`, keyed by
  the entry's `model_id`) compared against the plugin's own `price`/`context`.
  The join is **direct on the bare id** (the generic llm-stats benchmark's
  `entries[].model_id` is the llm-stats id, the same space as `Model.id`); the
  axis reports the median relative divergence per axis against
  `PRICE_AGREEMENT_TOLERANCE` (0.5, a **chosen, tunable heuristic**).
  `speedAgreement` is **informational only** and excluded from `status` (the
  units differ — rps vs tok/s — and re-deriving throughput from `speed_rps` is
  out of scope). It is an **annotation, never a gate** (`belowBarReason` has no
  cross-source branch) and it never feeds `price`/`weightPrice` or any ranking
  input — the `1/price²` blend is unchanged (a test pins `rankRole`
  byte-identical with the annotation on). It is `unknown` when no model joined or
  the payload carried none of the four fields. The ranking numbers are unchanged
  — the axis is a create-agent/explorer annotation, not a weight.

- Provenance axis (2026-10-07, issue #37): the focus-metric gate gained the
  provenance axis — the benchmark's owner (the catalog row's `dataset_org_id`,
  falling back to `dataset_slug`) and the source's own per-entry org mix (the
  dominant lab and its share, read from each row's `organization_id`, falling
  back to `provider_id`), below-bar above `FOCUS_PROVENANCE_DOMINANT_SHARE` (0.5,
  a **chosen, tunable heuristic** — the per-entry org mix is not measurable from
  the repo's caches at implementation time). It is the **source's own claim**
  about who publishes the benchmark and whose scores it carries: an independent
  cross-check on the pool-derived `composition` axis (whose rule is unchanged),
  with `compositionAgreement` recording whether the two concur (`disagree` when
  exactly one flags `below-bar`, `agree` when both or neither, `unknown` when the
  payload carries no org mix). It is an **annotation, never a gate**
  (`belowBarReason` has no provenance branch), so a vendor-populated source is
  warned but never drops a discovered candidate; it is `unknown` when there is
  neither an owner nor a payload org mix. The three catalog fields (`datasetId`/
  `datasetOrgId`/`datasetSlug`) ride `BenchmarkCatalogEntry` behind the cache
  shape guard (a pre-#37 cache is refetched); the per-entry org mix rides
  `BenchmarkPayloadMeta.provenance`. The ranking numbers are unchanged — the axis
  is a create-agent/explorer annotation, not a weight.

- Maintenance axis (2026-10-07, issue #36): the focus-metric gate gained the
  maintenance axis — the catalog row's `updated_at` age in months against
  `FOCUS_DATASET_STALENESS_MONTHS` (12), with `version_count`/`star_count`
  carried as supporting detail. This is the **dataset-date** axis, distinct from
  the model-date `freshness` axis: a benchmark whose dataset was last touched
  years ago but whose rows include one recent model passes freshness and is
  caught here. It is an **annotation, never a gate** (`belowBarReason` has no
  maintenance branch), so a stale dataset is warned but never drops a discovered
  candidate; it is `unknown` when the catalog row is absent or its `updated_at`
  is missing/unparseable. The four fields (`updatedAt`/`versionCount`/
  `latestVersionRowCount`/`starCount`) ride `BenchmarkCatalogEntry` behind the
  cache shape guard (a pre-#36 cache is refetched). The ranking numbers are
  unchanged — the axis is a create-agent/explorer annotation, not a weight.

- Modality axis (2026-10-07, issue #35): the focus-metric gate gained the
  modality axis — the catalog row's `modality` (text 514, multimodal 194, image 19,
  audio 9, video 2, null 7 of 745) and the payload's per-entry `multimodal`
  share. It is an **annotation, never a gate**: there is no role modality field,
  so the axis is never `below-bar` and never a drop reason; it is `unknown` only
  when neither the catalog row nor the payload carries a modality signal. The
  catalog row's `modality` rides `BenchmarkCatalogEntry` behind the cache shape
  guard (a pre-#35 cache is refetched); the per-entry `multimodal` rides
  `BenchmarkPayloadMeta.modality`. The ranking numbers are unchanged — the axis
  is a create-agent/explorer annotation, not a weight.

- Trust axis (2026-10-07, issue #34): the focus-metric gate gained a fifth axis —
  the per-entry `self_reported` share of a benchmark payload, below-bar above
  `FOCUS_SELF_REPORTED_MAX_SHARE` (0.5). Measured live: `verified` is uniformly
  `false`; `self_reported` varies (gpqa 19/20, deepswe-1.1 14/20,
  terminal-bench-4.0 10/20, aa-omniscience-index 2/3, automationbench-aa 0/1, the
  general benchmarks ~20/20), so a strict-majority bar flags the mostly
  vendor-submitted sources while passing an independently measured one. The
  catalog row's `is_community` (20/745 true) rides `BenchmarkCatalogEntry` behind
  a cache shape guard and is surfaced on the trust axis as `community` (issue
  #43), so a community-submitted benchmark is visible even before its scores are
  loaded. The ranking numbers are unchanged — the axis is a
  create-agent discovery gate, not a weight.

- Explorer scope switcher (2026-10-06, issue #28): the explorer is no longer
  user-level only. A **scope** is a role-config source — the user-level lock
  file, or one project where `/project-roles` was used. `startExplorer` resolves
  the scope list (the user-level scope, the projects in the new global registry
  `llm-role-projects.json`, and the session's project when its cwd has a project
  role config) and opens on the session's project when present, else user-level.
  A project scope reads the project lock merged over the user-level lock — the
  updater's own read — and Export writes that scope's lock file through the same
  validate → backup → atomic path. The ranking dataset is loaded once as the
  union of every known scope's resolved roles, so a metric only one scope
  weights (a project-only declared `bench:<id>`) is fetched and switching is
  free. The registry is written by the project-aware `runUpdater` immediately
  after `resolveProjectDir()` and before any early return (guarded only by
  `dryRun`), so a day-stamped no-op session start still registers; entries whose
  project lock file is gone are pruned on the next write. New `POST /api/scope`;
  `GET /api/bootstrap` gains `scopes`/`activeScope`. Verified live (headless
  Chromium): the header lists both scopes, the project is selected by default,
  switching to user drops the project role and repoints the lock path, and a
  registry entry with no lock file renders disabled with a reason tooltip.

- Measurement wave (2026-10-06, issues #31–#33): three candidate axes were
  measured and **not** landed — guardrail/alignment (#31: the semantically
  relevant catalog entries sit at one model, the best-covered candidate covers
  5.0% of the field vs the 35% floor, and the safety/security entries that carry
  data are collinear with `general`, r 0.89–1.00), per-task cost (#32: no
  per-task or per-role token profile exists — the only per-model profile the
  plugin already has is OpenRouter's platform-wide traffic, ~10–14× the plugin's
  own input/req, so the $/M price stays the price axis), and agentic multi-agent
  axes (#33: no catalog benchmark measures delegation/teams/handoffs/swarms/
  recovery/a2a, the one multi-agent eval is below the 3-model floor, and the
  20-entry endpoint cap makes the coverage bar unreachable). Numbers and verdicts
  in `scoring.md`.

- Endpoints cache shape guard (2026-10-06, issue #30): `readEndpointsCache` now
  also rejects a cache whose records lack `cacheReadPrice` (alongside
  `weightPrice`/`contextLength`), so a cache written before the cache-read
  pricing landed is refetched instead of leaving every route's cache-read price
  `undefined` and a role's `cacheHitRate` silently inert. The fix forces a
  refetch on the first run after the upgrade; the refreshed measurement is
  400 models, throughput-matched 152/400, priced 151.

- Wave (2026-10-06): the `1/price²` blend now weights routes by the **input
  (prompt) price** — the router's sort key — while reporting the billed 3:1 blend
  under that distribution (issue #21), so prices moved; endpoint capability
  filters (#18), the four-axis benchmark-quality gate (#17), provider pinning
  (#19) and route-aware pricing (#20) landed. The domain-knowledge (#23) and
  truthfulness (#24) axes were measured and **not** landed (`scoring.md`). Fresh
  measurement: 400 models, throughput-matched 152/400, priced 151. Eligible:
  `default`/`smol`/`slow`/`plan`/`commit`/`tiny`/`task`/`advisor` 143, `vision`
  75, `designer` 88. Leaders: `default`/`task`/`designer` DeepSeek-V4.1-Flash,
  `smol`/`commit` Muse Spark 1.1 (was DeepSeek-V4.1-Flash), `slow`/`plan`/
  `advisor` Muse Spark 1.3, `vision` Qwen3.8 Flash, `tiny` Muse Spark 1.1 (was
  Gemini 3.1 Flash-Lite).

- `plan` cost posture (2026-10-03, issue #16): `plan`'s `price` raised 0.12 → 0.25
  (λ 0.00682 → 0.01667) so the posture binds on the **reachable** pool — the pool
  the selector is chosen from. Measured reachable leader-flip w_price 0.2175 (Hy4
  preview → DeepSeek-V4.1-Flash) vs full-pool 0.311 (Muse Spark 1.3 → Qwen3.8
  Flash); 0.25 flips the actionable pick while the full-pool #1 is unchanged.
  Non-price weights rescaled by 0.852273: `general` 0.6, `long_context` 0.116676,
  `throughput` 0.033324 (Σ(non-price) = 0.75 = 1 − price; `q` unchanged). The
  reachable flip rides on `long_context` imputation (39% coverage; DeepSeek's
  index is null → capability fill 0.195, not a measured weakness). Full-pool
  `plan` #1 stays Muse Spark 1.3 (value 0.837 → 0.801); reachable #1 Hy4 preview →
  DeepSeek-V4.1-Flash. The other nine roles are untouched.

- Keyed-catalog availability fast path (2026-10-03, issue #15): the updater now consumes
  the shared `KeyAvailability` primitive — when the account's OpenRouter "Filter the
  model catalog for API keys" setting is on, allowed candidates skip the probe and
  key-blocked candidates are pruned from the walk order (the budget counts candidates
  examined, so pre-seeding a blocked verdict would not save it); candidates in neither
  catalog are still probed, and `no-filter`/`unavailable` degrade to the probe walk with
  no abort path. Measured on this account (setting on): keyed `GET /api/v1/models`
  returned 108 rows vs 466 public; after `rankingIdOf` normalization 107 keyed ranking
  ids ⊆ 454 public, 347 blocked. A 6-blocked/6-allowed probe cross-check agreed 6/6
  blocked and 5/6 allowed (the sixth probed `unknown`, which counts as usable).

- Role-weight rebalance (2026-10-03, issue #13): `math` dropped from `plan` and
  `slow` (collinear with `reasoning`, r 0.919, and missing for 18% of the pool —
  a coverage penalty, not a quality signal) and its share moved to the
  consolidated `general` axis (capability-preserving, 100% coverage), not
  `throughput` (which would have tripled `slow`'s speed weight and flipped both
  leaders to a cheap/fast model). `general`+`reasoning` merged into `general`
  in `default`/`slow`/`plan`/`advisor` (a pure relabel: `general`~`reasoning`
  r 0.984, so the combined capability share is unchanged). `smol`/`commit`
  `price` raised 0.30/0.35 → 0.45 (the measured binding threshold; non-price
  weights rescaled proportionally, so it is a posture change, not a capability
  change). `plan`'s description drops the now-unweighted `math`. New weights:
  `default` general 0.4926/code 0.1705/agents 0.1137/tool_calling 0.0947/
  throughput 0.0285/price 0.10; `slow` general 0.60/code 0.18/agents 0.13/
  throughput 0.04/price 0.05; `plan` general 0.704/long_context 0.1369/
  throughput 0.0391/price 0.12 (superseded by issue #16, above); `advisor`
  general 0.5947/long_context 0.1004/
  price 0.20/throughput 0.1049; `smol` price 0.45/throughput 0.22/general
  0.1571/code 0.0943/tool_calling 0.0786; `commit` price 0.45/throughput
  0.2285/general 0.2369/code 0.0846. Leaders: `default` DeepSeek-V4.1-Flash
  (unchanged), `slow`/`plan` → Muse Spark 1.3, `advisor` Muse Spark 1.3
  (unchanged), `smol`/`commit` → DeepSeek-V4.1-Flash. `required`, `thinking`,
  `filters`, `enabled` and the `vision`/`tiny`/`task`/`designer` weights are
  unchanged.

- Designer weight reconciliation (2026-10-03, issue #12): `designer` `code`
  0.10 → 0.06 (collinear with `website`, r 0.890, so it double-counted one
  capability axis) and the freed 0.04 moved to the independent axes (`price`
  +0.02, `throughput` +0.02), per Scoring rule 5. New weights: general 0.26/
  code 0.06/vision 0.18/throughput 0.15/price 0.17/website 0.18 (Σ = 1.00,
  Σ(non-price) = 0.83 = 1 − 0.17); λ 0.00882 → 0.010241. The `design` archetype
  now derives its `weights`/`required` from `DEFAULT_ROLES.designer` by
  reference (the `general` archetype's pattern), so the two design weightings
  cannot diverge. `required`, `thinking`, `filters.image`, `enabled` and the
  description are unchanged; the leader is unchanged (a refinement, not a
  re-ranking).

- Coverage-safe benchmark discovery + agent-write hardening in `/create-agent`
  (2026-10-03, issue #11): discovery now refuses a benchmark that would turn `q`
  into a coverage score — a fill-0 metric whose catalog coverage is below 35% of
  the ranking field is dropped (non-fatal, with a reason), while a capability-
  filled metric (`writing`/`website`/`bench:<id>`, fill 0.195) stays weightable at
  any coverage. The focus set is capped at 3 (priority order preserved) so one
  benchmark keeps a decisive share. The handler loads the ranking universe once
  (the same daily-cached chain the updater/explorer use) for the field size,
  per-metric coverage, and the differentiation comparison; a failed load skips
  the share rule (fill rule still applies, coverage annotated `unknown`). The
  report prints each focus metric's coverage and warns below the bar; `--dry-run`
  and `--json` carry the same signal. Free-text extraction no longer folds
  `general`/`price`/`throughput` (every archetype weights them) but keeps
  `reasoning`. The agent file is written **before** the role, and a failed role
  write rolls it back (restoring the prior file on a `--force` re-create, else
  removing the new one), so a partial failure never leaves a dangling role, a
  retry needs no `--force`, and the user's prior agent is never destroyed. The
  step-3 benchmark prompt previews the request's resolved weights (`resolveRole`),
  so the "already in this role's weights" marker appears live. The vendored
  architect prompt carries a source-version marker (`ARCHITECT_PROMPT_VERSION`)
  asserted by a test. Unit-tested in `tests/create-agent.test.ts` and
  `tests/architect-provenance.test.ts`.

- Benchmark discovery in `/create-agent` (2026-10-02, issue #10): when a purpose
  is given, the command fetches the llm-stats benchmark catalog (745 rows,
  daily-cached), filters by coverage (`modelCount >= 3`), ranks by IDF-weighted
  lexical overlap with the purpose, and asks omp's configured `judge` role (one
  `noul` question per candidate) which are direct measures. A discovered
  benchmark resolves to its shipped metric (`writingbench` → `writing`) or
  `bench:<id>`. Non-fatal and skippable (`--no-discover`); an explicit
  `--benchmarks` list wins. Verified live (omp 18.4.12, RPC): a writing purpose
  discovered `WritingBench (writing)`, `Creative Writing v3`, `COLLIE`,
  `AlignBench`, `AlpacaEval 2.0` and folded them into the role weights in a
  `--dry-run`. Unit-tested in `tests/benchmark-sources.test.ts` and
  `tests/create-agent.test.ts`.

- Cleaner role descriptions + cost-aware fallback chains (2026-10-02, issue #9):
  `/create-agent` writes the architect's `whenToUse` as the role's `description`
  (the one-line purpose when no architect ran), and strips benchmark links from
  the purpose before the archetype fit, so a pasted URL path cannot bias the
  archetype. The fallback chain prefers candidates priced at or below the chosen
  model (by `priceEff`), filling any remaining depth with the next-best by value.
  Unit-tested in `tests/create-agent.test.ts` and `tests/chain-pruning.test.ts`.

- Benchmark-source registry (2026-10-02): `/create-agent` now resolves a
  benchmark link to a metric and ranks the new role on it. A link to any
  llm-stats benchmark page (`llm-stats.com/benchmarks/<id>`) resolves to that
  benchmark; a link to the writing leaderboard resolves to the existing
  `writing` metric; a link to a provider the plugin has never seen is authored
  into a declarative source spec (fetch → in-process architect → dry-run
  coverage/leader → confirm → save). External metrics are namespaced
  `<namespace>:<local>` (dot-free, so they never mis-nest in the flat dotted
  settings path), fetched through the same daily cache chain, and rendered in
  the explorer and the report without a second hand-maintained table. A named
  benchmark takes a decisive focus share (`clamp(specialistShare, 0.25, 0.40)`)
  instead of being diluted. Verified: a role weighting `bench:alpacaeval-2_0`
  fetched the source (4 models covered, 396 imputed) and ranked on it; the
  explorer's `/api/bootstrap` listed the external metric with its derived
  metadata. Unit-tested in `tests/benchmark-sources.test.ts`.

- Release (2026-10-03): `Gott50/omp-llm-role` is public, `main` is pushed, and
  `omp-llm-role@1.0.0` is published to npm (`npm view omp-llm-role version` →
  `1.0.0`). All three install routes were verified against the real URLs in
  throwaway HOMEs (omp 18.4.12): npm (`omp plugin install omp-llm-role`), git
  (`github:Gott50/omp-llm-role`) and marketplace
  (`omp-llm-role@gott50-plugins`) each installed 1.0.0, and each post-install
  session run wrote `modelRoles` + `retry.fallbackChains` into that HOME's
  `config.yml` and landed the three daily caches in the installed copy. See
  Releasing.

- `/create-agent` free-text form (2026-10-02): the command now accepts a
  plain-language request as well as flags. `parseCreateAgentInput` splits the
  text at the first `--flag`; the text before it is the purpose, the flags after
  it still apply (`--dry-run`, `--force`, `--scope`, `--lock`, …). The name is
  left empty for the architect's `identifier` to fill (the extension sets it
  after `generateAgentSpec`); `extractBenchmarks` folds any benchmark the request
  names into the weights (whole-word, case-insensitive, `_`/`-`/space
  interchangeable; `price`/`throughput` excluded). Verified: the user's request
  `i want an agent for writing. use the writing related Benchmarks in the
  Leaderboard <url>` parses as free text, extracts `writing`, fits the `prose`
  archetype, and creates the agent under the architect's identifier; live RPC
  dispatch (omp 18.4.10) reached the architect with no "unknown flag" error.

- `/remove-agent` command (2026-10-02): the inverse of `/create-agent`. It deletes
  the role's lock-file keys (`removeRoleSettings`: flat dotted keys + any nested
  entry, backup + atomic write) and the agent `.md` from the user and/or project
  scope, then runs the updater in-process so `modelRoles.<n>` is dropped. It
  refuses a shipped default role (`DEFAULT_ROLES`), a reserved name and an invalid
  name, and errors when there is nothing to remove; `--dry-run` writes nothing.
  The plugin now tracks the `task.disabledAgents` names it added
  (`managedDisabledAgents` in state) so a removed agent leaves no stale entry.
  Verified live (omp 18.4.10, temp lock + `OMP_LLM_ROLE_AGENT_DIR`): a dry run
  reported the role and agent file and wrote nothing; a real run deleted both
  (backup written) and the in-process updater wrote `config.yml`. The
  `task.disabledAgents` cleanup is unit-tested (`tests/remove-agent.test.ts`).

- Designer agent opt-in (2026-10-01): the shipped `designer` agent is now
  **disabled by default**, matching the opt-in role. omp has no per-agent
  frontmatter gate (`parseAgentFields` has no `enabled`; `discoverAgents` scans
  `<ext>/agents/*.md` unconditionally), so the plugin manages the core
  `task.disabledAgents` key in `config.yml` — the same key the `/agents` hub
  writes. `SHIPPED_AGENTS` (`src/settings.ts`) names the shipped agents; the
  updater keeps each in `task.disabledAgents` unless its same-named role is in
  the resolved set, so `designer` is disabled until
  `roles.designer.enabled=true`. `config-edit.ts` gained a surgical
  `task.disabledAgents` patch (add/remove names, other entries and order
  preserved, self-checked) and `parseConfig` reads it back. The sync is **not
  day-gated** (enabling the role takes effect on the next session, not the next
  day) and runs on every session start. Verified live (omp 18.4.8): a session
  whose config had no entry gained `task:` → `disabledAgents:` → `- "designer"`
  and a `designer` spawn in that same session failed preflight with *Agent
  "designer" is disabled in settings*; with the entry removed the child spawned
  and replied. Cost: the plugin owns the `designer` entry, so a manual `/agents`
  toggle is overridden on the next run.

- `/create-agent` (2026-10-01): one omp command creates an agent **and** its role and
  wires them. It runs **omp's agent-creation architect** in-process
  (`src/agent-architect.ts`: the `/agents` hub's prompt shipped verbatim in
  `src/prompts/`, run through `createAgentSession` with no tools) to author the routing
  rule and the body, then adds the `model: "@<n>, @default"` and `tools:` frontmatter
  omp's own writer omits. It fits the weights to `--purpose` from the archetype table
  (`src/role-archetypes.ts`, ten sets, printable with `--list-archetypes`), asks the user
  for any extra benchmarks to fold in (listing every weightable metric with
  `--list-benchmarks`, so duplicates are visible; `--benchmarks m,...` covers headless
  runs), writes the validated role, and runs the updater **in-process** so
  `modelRoles.<n>` lands in `config.yml` in the same command. All-or-nothing: a name
  outside `[A-Za-z0-9_-]+`, a reserved name, an existing agent file without `--force`, or
  weights violating Σ = 1 / Σ(non-price) = 1 − w_price abort before either write.
  Verified live (omp 18.4.8, `--mode rpc` — print mode does not
  dispatch slash commands): `/create-agent --name sqlanalyst --purpose "analyze data and
  write SQL queries for the analytics warehouse"` fitted the `data` archetype (matched
  analy, data, sql), wrote the role and the agent file, and the same command's updater
  pass logged `@sqlanalyst: (unset) -> openrouter/z-ai/glm-5.3:high` and wrote
  `config.yml`; a headless spawn then returned
  `{"agent":"sqlanalyst","agentSource":"user","modelRole":"sqlanalyst"}` with
  `resolvedModel: "openrouter/z-ai/glm-5.3:high"` against a parent on
  `deepseek/deepseek-v4.1-flash` (pre-architect run). The architect path is verified
  live (omp 18.4.8, `--mode rpc`, temp lock + `OMP_LLM_ROLE_AGENT_DIR`): the architect
  ran in-process (~180-260 s), authored a full omp-style body, and the written
  `archtest2.md` carried the architect's `whenToUse` as `description` plus the plugin's
  `model: "@archtest2, @default"` and `tools:` frontmatter; `--benchmarks writing` folded
  `writing` in and rebalanced (Σ = 1, non-price = 0.84 = 1 − 0.16), and a duplicate
  (`--benchmarks long_context` on the `docs` archetype) was reported and skipped.
  The six raw llm-stats benchmark pass rates (`gpqa`, `aime`, `swe_bench`, `arc_agi`,
  `terminal_bench`, `tau_bench`) are now weightable too — they were already in
  `Model.metrics` and scored by `cardinalMetric`, but `resolveSettings` rejected them,
  so "another benchmark" had no referent. They are sparse (gpqa 62.5%, aime 30.5%,
  swe_bench 29.0%, arc_agi/terminal_bench/tau_bench ~5-6%), so they are differentiators,
  never `required` gates; no shipped role weights them, so the report is unchanged.

- Explorer in the plugin (2026-10-01): `/explore-roles` boots the ranking UI
  **in-process** inside omp — catalog from
  `ctx.modelRegistry.getAvailable()` — notifies the URL and opens the browser.
  A busy preferred port falls back to a free one; a second invocation in the
  same session re-notifies the running URL instead of rebinding; the handle is
  closed on `session_shutdown`. Both launch paths share the new
  `src/explorer/boot.ts` (plus `PLUGIN_SETTINGS_PATH` in `src/settings.ts`), and
  the extension sets `unref` so a short-lived `omp -p` run cannot hang on the
  server. Verified live (omp 18.4.8): `omp -p "/explore-roles --no-open --port N"`
  boots and exits in ~0.5 s; a TUI session answered `/api/bootstrap` on the bound
  port, refused to bind a second port on re-invocation, and released the port on
  exit.

- Agent + role creation (2026-10-01): the plugin ships the
  `omp-llm-role-create-agent` skill (discovered from the plugin's `skills/` root;
  verified via `read skill://omp-llm-role-create-agent`), `src/cli/create-role.ts` (typed,
  validated role write into the settings lock file), the `/create-agent` command
  (agent + role + wiring in one shot), and an explorer `+ new role`
  button + description editor. Roles with no shipped default are fully editable
  (no `Reset to shipped default`). `resolveSettings` now deep-merges a nested
  `roles` object with flat dotted keys in either order (previously a nested
  `roles` key replaced the flat patch, dropping sibling role settings).
- Writing metric + user-created role (2026-10-01): the `writing` metric
  (WritingBench, from the writing leaderboard's canonical export) is plugin
  plumbing — fetch/cache/parse plus `applyWritingScores` in `src/engine.ts`,
  gated on a ranked role weighting `writing`. The role and its agent are **user
  artifacts**, produced through the plugin's own surfaces and verified as a
  user-flow e2e rather than committed as repo code: `node src/cli/create-role.ts --name
  writing --weights general=0.24,reasoning=0.16,long_context=0.10,writing=0.26,
  price=0.14,throughput=0.10 --required general,price,throughput --thinking auto`
  wrote `roles.writing` into `~/.omp/plugins/omp-plugins.lock.json` (Σ 1.0,
  backup first), the agent was authored at the **user** path
  `~/.omp/agent/agents/writing.md` pinning `model: "@writing, @default"`, and
  `/refresh-roles` logged `@writing: (unset) ->
  openrouter/qwen/qwen3-235b-a22b-thinking-2507:auto` and wrote the key into
  `config.yml`. Verified live from a clean slate (role deleted from the lock, key
  dropped from the config): the explorer ranks it (Qwen3-235B-A22B-Thinking-2507
  #1, value 0.621), a headless spawn returned
  `{"agent":"writing","agentSource":"user","modelRole":"writing"}` with
  `resolvedModel: "openrouter/qwen/qwen3-235b-a22b-thinking-2507:low"` instead of
  the parent's `deepseek/deepseek-v4.1-flash`, and the composition panel's
  contributions sum exactly to `q` (0.635161) after `explainModel` learned to
  mirror `rankRole`'s capability fill. `writing` is sparse (15/400, all Qwen) and
  capability-filled at 0.195 — a stated assumption, see Scoring.
- Not in the report (2026-10-01): `docs/llm-role-rankings.md` is generated over
  `DEFAULT_ROLES` only, so the `writing` metric and the `writing` role cannot
  appear in it and AGENTS.md's report-refresh step is a no-op for them. The
  explorer is the surface for user-created roles; regenerate the report only for
  generator changes.
- Release-ready (2026-10-01): no runtime dependencies — `config-edit.ts` reads
  and self-checks the config line-oriented (`yaml` is dev-only, used by tests
  to validate patch output with the real parser). `package.json` carries npm
  metadata + a `files` whitelist; the repo ships an MIT `LICENSE` and is its
  own marketplace (`.omp-plugin/marketplace.json`, `gott50-plugins`) — install
  via `omp plugin install omp-llm-role`, `github:Gott50/omp-llm-role`, or
  `omp-llm-role@gott50-plugins`. See Releasing.
- Designer is opt-in (2026-10-01): `designer` ships `enabled: false`, so a stock
  run ranks the nine built-in roles and skips the Design Arena endpoint (the
  sole role-exclusive source). Enable with
  `omp plugin config set omp-llm-role config '{"roles":{"designer":{"enabled":true}}}'`. The
  `designer` agent moved from `~/.omp/agent/agents/designer.md` into the repo
  `agents/designer.md`), discovered from the plugin's extension root — linking
  the plugin ships it, no install step. It pins `model: "@designer, @default"`:
  with the role disabled the unresolved first entry is skipped and the child
  runs on `@default` (a bare `@designer` would hard-fail — an unresolved `@x`
  is a literal pattern, not a parent-model fallback; verified live, spawn
  record `modelRole: "default"` with `modelRoles.designer` absent). A role that
  leaves the managed set now has its `modelRoles.<role>` line deleted (new
  `roleRemovals` in `ConfigPatch`), so the stale pin is cleaned up on the next
  run. The CLI report keeps documenting all shipped roles via `--all` (the
  default now ranks the nine built-in roles and omits the Design Arena legend).
  The live config's `modelRoles.designer` and `modelTags.designer` were removed
  (2026-10-01); the agent now resolves `modelRole: "default"`.
- Advisor rebalance (2026-09-30): `advisor` weights now
  `{reasoning 0.3498, general 0.2449, long_context 0.1004, price 0.20,
  throughput 0.1049}` (Σ 1.0). `math` dropped (76.3% coverage, r 0.759 with
  reasoning — collinear *and* a lottery); `long_context` kept (the most
  independent capability axis, r 0.739/0.767 with reasoning/general) but now
  capability-filled at 0.195 like `website` (new `CAPABILITY_FILL` in
  `src/engine.ts`), so its 44.7% coverage no longer penalizes; `price`
  0.12 → 0.20 (λ 0.00682 → 0.0125, so the switch margin vetoes only up to
  $1.60/M instead of $2.93/M) and `throughput` 0.0382 → 0.1049 because the
  advisor fires on every primary *and* `task` subagent turn
  (`task.agentAdvisor.task: on`) and `syncBacklog: "1"` lets a slow advisor
  stall the primary up to 30s. The ranking leader moves Hy4 preview → Muse
  Spark 1.3 (0.775, $3.71; Hy4 falls to #8, 0.735), but the plugin dry-run
  keeps Hy4 (`kept-margin`: Muse Spark 1.3 is blocked by the account
  whitelist and the best eligible, GLM-5.3 at 0.7421, is inside the 0.02
  margin of Hy4's 0.7347). Models with no `long_context` score are no longer
  clustered at the bottom of the top-10.
- Suffix honesty pass (2026-09-30): `default`/`task`/`advisor` pinned to
  `auto` and `tiny` to `off` (previously bare), so the ranking prices the
  effort the session `defaultThinkingLevel: auto` already applies — bare roles
  were under-stated by 1.86×. No model changes: the plugin dry-run keeps all
  ten roles and only canonicalizes the selectors (`default`/`task`/`advisor`
  gain `:auto`, `tiny` gains `:off`). `slow` stays `:high`; `plan`/`vision`/
  `designer` stay `:auto`.
- Value review landed (2026-09-30, see Scoring): `default`/`vision`/`plan`/
  `advisor` price weights raised to 0.10/0.12/0.12/0.12 (capability weights
  rescaled, every `q` unchanged), `slow` max → `high` and `plan`/`designer`
  high → `auto`, and the switch margin gained the `priceSwitchFraction`
  cost override (default 0.5). Priced on the reachable pool with the key's
  provider whitelist applied (70 ok / 62 blocked / 4 unknown of 136 probed
  today), the plugin dry-run moves `default`, `smol`, `commit`, `task` to
  `deepseek-v4.1-flash` ($1.06 → $0.23/M), `vision` to
  `deepseek-v4.1-flash:auto` ($7.70 → $0.43), `designer` to
  `deepseek-v4.1-flash:auto` ($11.25 → $0.43) and keeps `slow` on GLM-5.3 at
  `:high` ($8.34 → $2.88); `plan`/`advisor` keep Hy4 preview (`:auto`/$2.32
  each); `tiny` keeps `ling-3.0-flash-fin` ($0.07). Sum of per-role
  effective $/M drops $25.6 → $9.8 in the simulation (the suffix pass
  repriced `default`/`task`/`advisor` from bare to `:auto`). Quality given up:
  `default` −0.004 q, `vision` −0.041, `designer` −0.010; `task` gains +0.007.
- Provider-route blend (2026-09-30): price and throughput are now the
  1/price²-weighted means over every stable standard-tier provider route —
  the expected values under OpenRouter's default price-based load balancing —
  instead of the single traffic-getting route the `find` table exposes (which
  paired one provider's price with that provider's 30-minute p50 and could be
  either optimistic or pessimistic). Per-provider routes come from the
  OpenRouter model pages (new daily cache, 149/151 pages fetched today).
  Measured shifts: `deepseek-v4.1-flash` throughput 5 → 62 tok/s (its find
  route was a congested instant) → now #1 @slow/@task/@designer and top-5
  @default/@smol/@commit; `kimi-k3` price $2.56 → $4.15 (22 routes, the cheap
  ones don't get all the traffic); `qwen3.8-27b` $1.11 → $0.76 (16 routes,
  cheaper than its traffic-getter); `glm-5.3` throughput 112 → 73 tok/s (39
  routes, cheapest `baidu/fp8` gets 18% of default-routing weight at 88
  tok/s). Matched models 146 → 151/399 (page stats recover models whose find
  route had no 30-minute traffic), 150 priced. The designer #1 changes
  `gemini-3.8-flash` → `deepseek-v4.1-flash`; @default keeps `gpt-6-astra`
  (now priced at the $20.90 blend instead of the $20 find route). Plugin
  dry-run against the blend: only `@designer` (`kimi-k3:high` →
  `deepseek-v4.1-flash:high`, 0.773 vs 0.690) and `@tiny` (`glm-5.3` →
  `ling-3.0-flash-fin`, 0.774 vs 0.680) switch; the other eight roles hold
  via hysteresis.
- Explorer thinking control (2026-09-30): the weight editor gained a per-role
  `thinking` select (the eight `SUFFIX_LEVELS` + `— (bare)`) with a live price
  factor readout; the rank table's `$/M` and the explain cost line already
  reflect the thinking-adjusted effective price, so changing the level re-ranks
  immediately. `— (bare)` is disabled when the role's shipped default or the
  lock file sets a level (deep-merge: an omitted key keeps the inherited
  value). Bootstrap now ships `levels` + `thinkingOverhead`; no engine change.
- Designer value rating reworked (2026-09-30): the keyless designarena.ai
  leaderboard endpoint (`POST /api/leaderboard`, an Elo trusted over the
  OpenRouter mirror only at ≥ 300 battles) raises designer-pool design
  coverage 42/87 → 51/87 (58.6%), recovering `gpt-5.6-sol` (elo 1318, 11.5k
  battles), `gpt-6-astra`, `deepseek-v4.1-flash` and six more. The fill moves
  0.5 → 0.195 (capability-consistent: uncovered-cohort mean general 29.8 vs
  covered 38.2), cutting the covered models scoring below the fill from 14 to
  4. Weights swap `code` 0.18 → 0.10 and `website` 0.10 → 0.18 (r = 0.876
  collinearity). The report gains the `agon` column (Design Arena
  `agents/agon_webapps` Elo, context only, 22/87 covered). The designer
  top-10 now carries zero imputed rows (was 3: `qwen3.8-flash`,
  `deepseek-v4-flash-vision-exp`, `qwen3.8-27b`, all dropped out — the first
  two still have no Design Arena data in either route). The #1 pick was
  invariant across every variant measured that day (fill, weights):
  `gemini-3.8-flash` (0.768 vs 0.751 before). The 2026-09-30 provider blend
  later moved #1 to `deepseek-v4.1-flash` (top bullet).
- Session model activation shipped (2026-09-30): when the day's session-start
  run switches `default` and the triggering session's conversation is still
  empty, the plugin now also switches the live session model to the new
  selector (main sessions only; never over an explicit `omp --model`; disabled
  with `activateDefaultOnEmptySession=false`). Verified E2E in a sandbox agent
  dir: transcript shows the session boot on `deepseek-v4.1-flash`, the plugin
  `model_change` to `z-ai/glm-5.3` before the user message, and the assistant
  reply served by `z-ai/glm-5.3`. This required the session-start run to be
  awaited (previously fire-and-forget via `ctx.setTimeout`, which a
  short-lived session could exit under — the deferred run silently never
  finished). Explorer-export stale claim fixed: the lock file is re-read on
  every run, so exported weights reach the next `/refresh-roles` in any
  running session, not only a freshly started one.
- Design Arena Elo wired into `designer` (2026-09-27): OpenRouter's
  `benchmarks[permaslug].da.elo_by_category["models-website"]` is ingested as
  the `website` metric (percentile within the 73 design-covered models;
  uncovered models get the neutral covered median 0.5) and weighted 0.10 in
  `designer` (its other weights rescaled to keep Σ = 1). The design term
  reorders the designer top-5 — `Muse Spark 1.3` (measured 0.99) rises to #2,
  `MiMo-V2.6-Pro` (measured 0.97 at $0.54/M) to #5 — and the leader is
  unchanged (`Gemini 3.8 Flash`, 0.754). It also flips the shipped selector:
  the dry run now switches `modelRoles.designer`
  `deepseek-v4-flash-vision-exp:high` → `xiaomi/mimo-v2.6-pro:high` (0.702 vs
  0.663, margin 0.039 > `switchMargin`), because the incumbent has no Design
  Arena data and takes the neutral fill while MiMo carries a measured 0.97.
  The other nine roles are untouched (only `designer` weights `website`).
- 408 llm-stats models; OpenRouter matched 144/408 (throughput), 144 priced (the
  2026-10-20 snapshot read 151/416 — the daily cache moved, not the code; the
  #34–#40 axes and flags leave every ranking byte-identical until a flag is
  turned on).
- Eligible per role: 137 (vision 71, designer 84, image-input filter).
- Value-ranking leaders (this report, thinking-adjusted prices; the *ranking*
  leaders, before the account's provider whitelist drops the blocked ones):
  `default` DeepSeek-V4.1-Flash (0.811), `smol` Muse Spark 1.3 (0.767),
  `slow` Muse Spark 1.3 (0.842), `vision` Kimi K3 (0.731), `plan` Muse Spark 1.3
  (0.809), `commit` Muse Spark 1.3 (0.811), `tiny` Muse Spark 1.3 (0.853),
  `task` DeepSeek-V4.1-Flash (0.757), `advisor` Muse Spark 1.3 (0.834),
  `designer` Muse Spark 1.3 (0.810).
- Thinking-adjusted pricing landed (2026-09-27): the suffix table moved into
  `DEFAULT_ROLES` as a per-role `thinking` field, and the price axis scales by
  the level's factor for thinking-capable models — `slow` (`:max`, ×7.86)
  flipped its full-pool leader GPT-5.6 Sol → GLM-5.3, `vision` (`:auto`, ×1.86)
  flipped GPT-6 Astra → GPT-5.6 Sol; bare/off roles unchanged.
- The factor is gated per model on the omp catalog's `thinking[]` (2026-09-27):
  a model whose level list excludes the role's pin is priced bare and gets no
  suffix — `slow` (`:max`) had over-priced 95 of its 112 thinking-capable
  ranked models by the clamp ratio (Hy4 preview $9.83 → $1.25, Muse Spark
  $15.71 → $2.00); meta pins (`off`, `auto`) bypass the membership check, so
  the live `vision: auto` pick is untouched.
- Weights reviewed and rebalanced (2026-09-27): coverage-aware backbone,
  throughput weighted in every role, `mrcr`/`search` dropped, `plan`/`advisor`
  price raised, `tiny` left alone. Rules in Scoring; the per-role deltas are in
  the commit that landed them.
- Reachability probed per candidate (2026-09-27, `probeModel`, one 1-token
  completion each): 76 ok / 61 blocked / 1 unknown of the 138 eligible, so the
  actionable pool is 77 (vision 34). Actionable leaders under the shipped
  weights: `default`/`smol`/`slow`/`task` GLM-5.3, `vision` Kimi K3,
  `plan`/`advisor` Hy4 preview, `commit`/`designer`
  DeepSeek-V4-Flash-Vision-Exp, `tiny` Ling 3.0 Flash Fin.
- Plugin dry-run re-verified (2026-09-27, post-restructure): all 9 existing
  roles kept their probe-clean selectors with suffixes now read from
  `roles.<role>.thinking`; the new `designer` role got managed
  (DeepSeek-V4-Flash-Vision-Exp `:high`). 64/64 unit tests green.
- `designer` wired live (2026-09-27): the forced run switched
  `modelRoles.designer` `z-ai/glm-5.3-flash` →
  `"openrouter/deepseek/deepseek-v4-flash-vision-exp:high"` and filled its chain
  (`mimo-v2.6-pro:high`, `kimi-k3:high`) — the nine other managed roles were
  kept and every non-managed key in the block was left byte-identical (the
  plugin rewrites only lines it selects). A headless design prompt then routed
  through the `designer` agent onto that selector (see omp wiring).
- Inert agent-named role keys removed (2026-09-27): `modelRoles.scout`,
  `security-reviewer`, `librarian`, `research`, `sonic` and `reviewer` deleted
  from the live config. Nothing referenced `@<name>` for them, so they selected
  no model: the bundled `scout`/`sonic` pin `@smol` and `reviewer` pins `@slow`
  (`security-reviewer` has no pin at all), and the agents that carry those names
  route through built-in roles. Re-verified live after the deletion (parent
  pinned to `deepseek-v4.1-flash`, `--mode json` spawn records):
  `{"agent":"scout","agentSource":"bundled","modelRole":"smol"}` →
  `glm-5.3:off`, `{"agent":"reviewer","agentSource":"bundled","modelRole":"slow"}`
  → `glm-5.3:max`. `modelRoles` then held exactly the ten roles the plugin
  managed (nine since `designer` went opt-in, 2026-10-01), and a forced refresh
  afterwards reported `no changes` — the plugin
  cannot re-add keys outside `settings.roles` `patchModelRoles` selects. The
  owner-written `retry.fallbackChains` key
  `openrouter/~deepseek/deepseek-v4-flash-latest` is now unreferenced by any
  role; it is left in place deliberately (unwritten, unreferenced keys are never
  pruned — see [`writes-and-state.md`](writes-and-state.md)), so removing it is a
  manual call.
- Plugin verified live (2026-09-23) with the provider-allowlist probe: the
  account's allowed-providers whitelist excludes first-party openai/azure/
  anthropic endpoints, so the probe gate rewrote `slow` → GLM-5.3 (`:max`),
  `vision` → Kimi-K3 (`:auto`), `plan` → Hy3 (`:high`), `advisor` →
  Hy4-Preview and refilled their chains with probe-clean entries; all 16
  configured roles then served on their configured selector in headless
  sessions (transcript-verified, no fallbacks).
- Plugin run re-verified live (2026-09-26) into a throwaway agent dir
  (`OMP_LLM_ROLE_AGENT_DIR` + a copy of the real config): all 9 roles kept
  their current probe-clean selectors (`commit`/`task` by margin), and the
  written chains showed the new suffix rule — solo keys suffixed
  (`ling-3.0-flash` → `:off`, `kimi-k3` → `:auto`), shared keys level-free
  (plan+advisor on `tencent/hy4-preview`, smol+slow on `z-ai/glm-5.3`).
  60/60 unit tests green.
