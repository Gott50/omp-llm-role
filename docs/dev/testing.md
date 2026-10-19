# Testing

How the plugin is verified: the unit suite (`node --test tests/`, run by the
pre-commit hook) and the live checks that need a real omp session and a real
OpenRouter key. Node type-stripping does not typecheck, so a green suite plus a
real run is the gate — see [`quirks.md`](quirks.md).

## Unit seams

Each seam names the test file that covers it and the scenarios it must keep
passing.

1. **Engine metrics** (`engine-metrics.test.ts`) — `buildModels` maps every
   leaderboard field into `metrics`; an absent field stays null (0-filled, not
   imputed); every metric has a `METRIC_META` entry with the right kind; the
   affine/identity transforms; a role weighting a new metric ranks it.
2. **Tier gate** (`tier-gate.test.ts`) — paid+credit → billed-only; free-tier
   key → `:free`-only; zero budget both branches → abort; non-openrouter
   providers filtered.
3. **Variant resolution** (`variant-resolution.test.ts`) — exact/dated/bare/alias
   ordering; `:batch` never emitted; `:free` only on the free branch; org
   prefixes (incl. `~`) ignored; ties lexicographic.
4. **Surgical edit** (`config-edit.test.ts`) — commented config, unknown keys,
   missing roles upsert, chain-key replace-in-place (no duplicate YAML keys),
   unchanged file → zero-byte diff and no mtime change; structural surprises
   rejected; the empty-collection spellings omp's own writer emits (a null token
   on the key line, a flow `[]`/`{}` on its own indented line — and an empty
   *parent* block, `task:`/`retry:` + `  {}`) read as empty and are normalized
   into the block form on write, with a prune-only patch creating nothing (issue
   #54); a sibling `retry.*` key neither aborts the chain scan nor swallows an
   appended chain key (issue #55); the patched output parses as real YAML.
5. **Hysteresis** (`hysteresis.test.ts`) — no-current adopt; ineligible current
   switch; margin-below keep; margin-above switch; `switchMargin: 0` always takes
   best; cost override (`switched-cost`); `priceSwitchFraction: 0` keeps the
   margin in charge; an inside-margin challenger short of the fraction stays
   kept; the day gate.
6. **Chain pruning** (`chain-pruning.test.ts`) — plugin-written stale keys
   removed; owner-written keys preserved; `writeFallbackChains: false`; a role
   that left the managed set is pruned; the chain prefers candidates at or below
   the chosen price.
7. **Chain suffixes** (`chain-suffix.test.ts`) — chain values carry the role's
   suffix, the key stays bare; an entry without thinking support gets no suffix;
   two roles on one model share a level-free chain.
8. **Probe gate** (`probe-gate.test.ts`) — 200 → ok; the no-allowed-providers 404
   → blocked; any other failure → usable; blocked best → next adopted; blocked
   current → replaced; chains contain only probe-clean candidates; verdicts
   cached across roles; all-blocked → role untouched.
9. **Keyed catalog** (`keyed-catalog.test.ts`) — key-blocked candidates pruned
   from the walk; only candidates in neither catalog are probed; key-blocked
   never in a chain; no-filter/unavailable degrade to the probe walk.
10. **Key availability** (`key-availability.test.ts`) — proper subset → active;
    equal sets → no-filter; empty → unavailable; a keyed id absent from public →
    no-filter; aliases collapse; two parallel GETs, one authenticated; never
    throws.
11. **Allowed-providers whitelist** (`allowed-providers.test.ts`,
    `whitelist.test.ts`) — `fetchAllowedProviders` parses the 404 body's
    "permits only:" list into a set and returns `null` for a 200, a 404 without
    the clause, or a transport throw, with the canary request shape (POST,
    bearer, `provider.only`, `max_tokens: 1`); the updater prunes every model's
    route pool to allowed providers before ranking, so a blocked best route
    falls to the next-best allowed route as the auto-pin, the chain carries only
    allowed routes, a bare entry matches a tiered slug by prefix, the notify line
    reports the active whitelist and the pruned count (or "no whitelist"), and a
    `null` whitelist reproduces today's output byte-for-byte.
12. **Endpoint ceilings** (`endpoint-ceilings.test.ts`) — the narrower reads
    context/output/tools, a missing field is null; a failing route drops, a null
    field is kept; a model with no capable route is ineligible; a filtered role
    is priced on the surviving pool; `maxPriceUsdPerM` caps the thinking-adjusted
    price.
13. **Route pricing (provider pin)** (`route-pricing.test.ts`) — a pinned role
    prices the matching route, not the blend; a tiered pin matches verbatim;
    `maxPriceUsdPerM` caps the route price; throughput is the route p50 with a
    blend fallback; no matching route → ineligible; the `@<slug>` selector and
    chain carry the pin; a pin matching no route leaves the role unchanged. The
    route-ordering score (spec #71): `rankedRoutes` orders by the value-for-money
    score `vfm = wT·tNorm − wP·pNorm` (a throughput-heavy role picks a faster
    route than a price-heavy role); the soft `filters.preferredMinThroughput`
    floor sorts a below-floor route last **without dropping it**; a route with no
    p50 uses the model's blended throughput (for both the score and the floor
    check); equal scores break by `providerSlug` then `id`; `explainModel`'s
    `autoPin` is the score-max route — the auto-pin's first **candidate**, which
    the updater probes before writing it (spec #90).
14. **Thinking price** (`thinking-price.test.ts`) — bare/off unadjusted; a level
    scales only thinking-capable models; the frontier uses the effective price;
    `resolveSettings` validates thinking and rejects the legacy `suffixes` map;
    catalog `thinking[]` wins over the OR flag; meta levels never gate.
15. **OpenRouter blend** (`openrouter-blend.test.ts`) — price/throughput are the
    `1/price²`-weighted means over the page routes; flex/priority/degraded/free/
    `:batch` stay out; throughput renormalizes; the find-row fallback; the weight
    follows the input price.
16. **Writing metric** (`writing.test.ts`) — `parseWritingEvidence` keys finite
    scores and rejects junk; `applyWritingScores` fills uncovered models; a
    covered model ranks above an uncovered one.
17. **Benchmark sources** (`benchmark-sources.test.ts`) — `resolveBenchmarkSource`
    maps an llm-stats benchmark page, a bare id, the writing leaderboard and a
    Design Arena link, `null` for an unknown host; `normalizeMetricKey` is
    dot-free; `parseBenchmarkPayload` reads the llm-stats `entries[]` and writing
    evidence shapes and rejects junk; `parseBenchmarkPayloadMeta` reads the
    per-entry `self_reported`/`verified` flags (19/20 → `trust`, no flag → `null`,
    no entries shape → `null`); `parseBenchmarkCatalog` carries `isCommunity`,
    `modality` and the maintenance fields (`updatedAt`/`versionCount`/
    `latestVersionRowCount`/`starCount`, each `null` when missing or non-finite);
    the catalog cache rejects a pre-`isCommunity`/`modality`/maintenance cache
    (and an empty one); the scores cache rejects a cache lacking the `meta` key
    (and accepts `meta: null`);
    `applyBenchmarkScores` fills uncovered
    models; `loadBenchmarkScores` follows fresh → live → stale with a temp cache
    dir and an injected fetch; a declaration executes (payload path, id/score
    fields, `scoreMax`, join) and a metric colliding with a shipped key is
    rejected; `dryRunDeclaration` reports coverage/leader and rejects a zero-join;
    `extractBenchmarkLinks` pulls URLs from prose.
18. **Agent creation** (`create-agent.test.ts`) — a purpose fits the expected
    archetype; a `--weights` set violating Σ(non-price) = 1 − w_price is refused;
    an existing agent file without `--force` is refused and writes no role;
    `--dry-run` writes neither file; an architect `spec` replaces the
    description/body; `applyFocusBenchmarks` gives a named benchmark a decisive
    share, is a no-op for the archetype's own specialist set, and keeps both
    invariants; the nine-axis gate (the maintenance, provenance and cross-source
    axes are annotations, never a drop).
19. **Agent removal** (`remove-agent.test.ts`) — the role's lock-file keys and the
    agent file are deleted (backup written); a shipped default role, a reserved
    name and an invalid name are refused; nothing-to-remove errors; `--dry-run`
    writes nothing; the updater drops `modelRoles.<n>` and the plugin-managed
    `task.disabledAgents` entry.
20. **Agent pins / disable** (`agent-pins.test.ts`, `agent-disable.test.ts`) —
    `parseAgentPin` takes the first `@role`; `discoverAgentPins` scans the three
    scopes, most specific wins; the sync is not day-gated; an unrelated entry
    keeps its position; an unknown role is never added.
21. **Role enable / lock** (`role-enable.test.ts`, `role-lock.test.ts`) —
    disabling drops the role from the resolved set and its `modelRoles` line; a
    locked role is not switched and its chain survives the prune; unlocking
    restores the switch.
22. **Settings** (`settings.test.ts`, `settings-schema.test.ts`) — opt-in roles;
    `priceSwitchFraction` range; flat/nested merge; `required` as string or
    array; an external metric key is weightable, a dotted one rejected;
    `package.json` `omp.settings` deep-equals `deriveSettingsSchema()`. The
    `providerPinning` preset sets `preferOwnProvider: true` +
    `filters.preferredMinThroughput: 50` (the registry row and the expanded def
    agree), an explicit `filters.preferredMinThroughput` beats the preset, and
    the schema carries the `roles.<role>.filters.preferredMinThroughput` row
    (number, min 0, default 0). The `tokenProfile` setting (spec #81) defaults to
    `null`, accepts a record with finite `inputTokens`/`outputTokens` ≥ 0, and
    rejects a non-record or a negative/non-finite field; the schema carries the
    `tokenProfile.inputTokens`/`tokenProfile.outputTokens` rows (number, min 0).
23. **Explorer** (`explorer.test.ts`, `explorer-scopes.test.ts`) — rank deltas;
    contributions sum to `q`; `inverseCardinal` round-trips; Export preserves
    siblings and normalizes nested roles; the scope switcher; the availability
    overlay. The per-task price (spec #81): `rankRows`/`explainModel` fill
    `perTask` from a supplied profile and leave it `null` without one; the
    `POST /api/pool` toggle returns the gated/pruned dataset in `as-written` mode
    and the full one in `raw`; the bootstrap payload carries `poolMode` and
    `tokenProfile`; the explain response carries `leaderFlip`/`thinkingLevels`.
    The auto-pin indicator (spec #90): `explainModel`'s `autoPin` is the route the
    updater's walk pins when every route probes clean, and it deliberately differs
    from the written pin when the walk skips a blocked leader — the panel names
    the *candidate*.
24. **Project scope** (`project-updater.test.ts`, `project-setup.test.ts`,
    `project-roles-command.test.ts`) — project mode scopes config/state/history/
    lock to `<cwd>/.omp`; the day gate is per scope; the registry write;
    `setupProject` add/drop/keep, `--dry-run`, `--force`; the command is
    registered.
25. **Session model** (`session-model.test.ts`) — the hook fires only after a real
    write on a real `default` change; a dry run and a kept default skip it; a
    throwing hook is contained.
26. **Docs** (`docs.test.ts`) — every relative markdown link resolves; no
    reference to a moved doc; the CHANGELOG shape; `package.json` `files` entries
    exist; the README has no dev-only headings.
27. **Architect provenance** (`architect-provenance.test.ts`) — the vendored
    prompt header matches `ARCHITECT_PROMPT_VERSION` and the version named in
    [`agent-authoring.md`](agent-authoring.md).
28. **Architect retry** (`agent-architect.test.ts`) — a malformed architect
    response is retried once and the parsed spec returned; an always-malformed
    run throws carrying the raw output; a `run()` failure propagates with no
    retry.
29. **Error reporting** (`error-report.test.ts`) — `reportUnexpectedError`
    through its one entry point with fully injected deps: `off` → no fetch, no
    ledger write, `action: "off"`; `auto` + token → exactly one create whose body
    carries the fingerprint marker, plugin version, runtime, platform, label and
    stack, with the `bug`/`needs-triage` labels; redaction (home dir → `~`,
    `node_modules` prefix → `<pkg>/`, `sk-…`/`ghp_…`/`Bearer …` → `<redacted>`)
    leaves nothing token-shaped in the title, body or URL; dedupe (an open match
    is commented on, never a second create; a closed match on a later day
    creates a fresh issue linking the old one); caps (the 4th distinct
    fingerprint in one UTC day, and a fingerprint already created earlier the
    same day even when its issue is closed, are both `suppressed` with no
    request; a later UTC day re-creates the regression); permission fall-through
    (`401`/`403`/`404` from the search or the create → `offered`, the creation
    counters untouched); no token → no HTTP at all, an `issues/new` URL whose
    query carries the title, body and labels opened exactly once; token
    resolution (`GITHUB_TOKEN` → `GH_TOKEN` → the injected `gh` executor, with a
    throwing or empty `gh` falling through to the URL path); containment (a
    rejected fetch, a 500, a timeout and a malformed JSON body each → `failed`,
    one notify line, no throw); fingerprint stability (a varying id inside the
    message with the same first stack frame dedupes, a different label does not);
    `ask` (a `confirm(true)` surfaces the payload and files exactly once, a
    `confirm(false)` or a headless session sends nothing and offers the URL — it
    never silently falls back to `auto`); an unrecognized `errorReporting` value
    fails closed (no fetch, no ledger, `action: "off"`); a defect **string** (as
    `reportDefect` passes it) is fingerprinted by its message, so two distinct
    aborts under one label differ; the in-process guard; and a ledger that
    tolerates junk and truncates a pathological stack — including a multi-byte
    one — to the 64 KB **byte** budget.
30. **CI/CD** (`ci.test.ts`) — the workflow parses and declares both jobs with
    `release` needing `test`; the `test` job's command is identical to the
    pre-commit hook's; the tag trigger covers every CHANGELOG tag link and the
    package version; `.node-version` is the file the workflow reads; the release
    job declares `id-token: write` and references no npm token; the release job
    runs the `notes` guard before `npm publish` and both steps name the same
    notes file; the four lockstep version fields agree; no tracked file lives
    under `cache/`; and
    `scripts/release.ts` against fixture repos — `due`'s exit codes, `notes`'s
    five refusals and its exact section body, `cut --dry-run` writing nothing,
    and `cut` bumping the four fields, cutting the changelog, committing and
    tagging while refusing a dirty tree, an existing tag, an empty
    `## [Unreleased]` and a HEAD that is not `origin/main`.
31. **Auto-pin** (`auto-pin.test.ts`) — the selector gains the `@<slug>` of the
    first route in the role's `vfm` order that the route probe does not reject
    (spec #90): a `blocked` leader pins the next route and records the skipped
    slug (`routeBlocked`); `unknown` is usable and stays pinned; every route
    blocked writes a bare selector and sets `pinDropped`; the notify lines carry
    `; route-blocked: …` and `; pin dropped (no routable route)`; an all-blocked
    pool issues at most `ROUTE_PROBE_BUDGET` probes; a verdict cached for one role
    is reused by another; two blocked routes sharing a provider slug are recorded
    once; and the capability off, a manual pin, a locked role, a disabled role and
    a model with no gate-passing route never consult the probe (a throwing stub
    proves it) and leave the config byte-identical. The chain carries every
    gate-passing route of the primary except the pinned **slug** (not the pinned
    position) then of each fallback model, in score order (the `vfm` route
    score desc, spec #71), deduped by
    provider slug; a degraded / over-`maxPriceUsdPerM` / endpoint-filter-failing /
    whitelist-blocked route is excluded; the manual pin wins (its chain is the
    fallback models only, every value carrying the manual slug) and the no-pin
    path is bare (fallback models only); a re-run is idempotent and a pin change
    prunes the old key.
32. **Provider display** (`provider-display.test.ts`,
    `provider-display-wiring.test.ts`) — `providerPinOf` reads the single
    `openRouterRouting.only[0]` (else `vercelGatewayRouting`), preferring
    OpenRouter, and returns null for a missing/empty/multi-entry block or a
    non-string entry; `providerPinOfSelector` parses the trailing `@<slug>` with
    and without a thinking suffix and returns null without one;
    `withProviderSuffix` appends, strips a previous suffix, is idempotent, and
    returns the base name for a null pin; `applyProviderDisplay` mutates a
    record's `name` and no-ops on a non-record or a non-string name. The wiring
    (a fake `pi`/`ctx` recording handlers) suffixes the live model on
    `session_start`, applies the pin parsed from `event.to` on
    `retry_fallback_applied` (falling back to the live model's routing block),
    applies the pin from `event.model` on `retry_fallback_succeeded`, re-derives
    from the live model on `turn_start` (the silent-restore case), strips when
    neither source carries a pin, never calls `pi.setModel`, and contains a
    throwing live-model read.
33. **Usage ledger** (`usage-ledger.test.ts`, `usage-ledger-wiring.test.ts`) —
    `appendUsageRow` writes one row with the expected fields; `readUsageRows`
    degrades to `[]` on a missing/malformed file and skips an unparseable or
    wrongly-shaped line; the cap holds (the newest `USAGE_LEDGER_CAP` rows
    survive a compaction); `roleTokenProfile` is the role's median per-turn
    counts (or `null` with no rows) and `resolveTokenProfile` prefers the
    recorded usage over the setting. The wiring (a fake `pi`/`ctx` with a
    `sessionManager.getBranch()`) records one row per assistant turn on
    `turn_end` and `session_shutdown`, dedupes by `ts|model` so the two hooks
    cannot double-record, writes into `resolveProjectDir() ?? agentDir()`, and
    contains a throwing branch read.
34. **Explorer price levers** (`explorer-levers.test.ts`) — `leaderFlip` returns
    the min-λ threshold over the strictly cheaper challengers, the current
    `wPrice`, the distance and the challenger; `null` when no cheaper challenger
    exists; the degenerate case (value leader = quality leader) is handled by the
    same min formula, not `0/0`. `thinkingLevelEffect` returns one row per level
    with the engine's own factor and the leader at that level, and `null` for a
    bare role.
35. **As-written pool** (`explorer-pool.test.ts`) — `asWrittenPool` applies the
    catalog/tier gate (`resolveVariant`) and the allowed-providers prune
    (`providerAllowed`), leaves the routes untouched on a `null` whitelist,
    yields an empty pool on `tier: "none"`, and never mutates its input.
36. **Route probe** (`route-probe.test.ts`) — `probeRoute` sends the exact
    one-token completion shape (POST, bearer, `max_tokens: 1`, `provider: { only:
    [slug] }`): 200 → `ok`; the no-allowed-providers 404 → `blocked`; a 404 with
    any other body, a 5xx, a 429 and a transport throw → `unknown` (usable). The
    walk that consumes it (skip a `blocked` route, accept `unknown`, drop the pin
    when nothing is clean, the per-role budget, the cross-role verdict cache) is
    covered by the auto-pin cases above.

## Live checks

- **E2E refresh** — `omp plugin link .` → new omp session → observe the day-gated
  run; `/refresh-roles` → verify the `config.yml` diff + notification; a second
  same-day session → no-op; a forced `/refresh-roles` matches the in-session
  decisions; `/explore-roles --no-open` → `curl` the notified port for
  `/api/bootstrap`, a repeat invocation keeps the same port, and the port is
  released when the session ends.
- **Agent creation** — `/create-agent` in a session (RPC mode dispatches slash
  commands) → the architect authors the body, the updater line
  `@<n>: (unset) -> <selector>` + `modelRoles.<n>` land in `config.yml`, then a
  headless spawn whose record reads
  `{"agent":"<n>","agentSource":"user","modelRole":"<n>"}` with `resolvedModel`
  equal to the role's selector.
- **Benchmark sources** — a role weighting `bench:<id>` fetches the source and
  ranks on it; the explorer's `/api/bootstrap` lists the external metric with its
  derived metadata.
- **Agent removal** — `/remove-agent --name <n>` in a session deletes both
  artifacts and the updater pass removes the config entries.
- **Explorer pool / per-task / levers** — `/explore-roles` in a session with a
  recorded usage ledger: confirm the header's pool toggle switches the table
  between the raw and as-written pools (the model count and the leader change),
  the `$/task` column renders a value (or `—` with no profile), and the explain
  panel shows the per-task breakdown and the **Price levers** section (the
  leader-flip line and the per-level leader table). Verify in headless Chromium
  (the SPA is not unit-tested).
- **Usage ledger** — run a real omp turn, then confirm `llm-role-usage.jsonl`
  gained one row per assistant turn (the model, the role, the provider, the
  token counts, the cost) in the plugin's state dir (`<project>/.omp` in project
  mode, `agentDir()` otherwise), and that the explorer's `$/task` column then
  fills for that role. A session with no completed turn writes no rows.
- **CI/CD** — push a branch and open a PR (or push to `main`) and `gh run watch`
  the `test` job green; push a tag that disagrees with the package version and
  confirm the `release` job fails in the `notes` guard *before* any publish;
  run the release job against an already-cut tag
  (`gh workflow run ci.yml --ref v<version>`) and confirm npm's `gitHead` equals
  the tag commit, `dist-tags.latest` moved, and the GitHub Release body is that
  version's CHANGELOG section. See [`ci.md`](ci.md).
