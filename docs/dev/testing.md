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
   rejected; the patched output parses as real YAML.
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
11. **Endpoint ceilings** (`endpoint-ceilings.test.ts`) — the narrower reads
    context/output/tools, a missing field is null; a failing route drops, a null
    field is kept; a model with no capable route is ineligible; a filtered role
    is priced on the surviving pool; `maxPriceUsdPerM` caps the thinking-adjusted
    price.
12. **Route pricing (provider pin)** (`route-pricing.test.ts`) — a pinned role
    prices the matching route, not the blend; a tiered pin matches verbatim;
    `maxPriceUsdPerM` caps the route price; throughput is the route p50 with a
    blend fallback; no matching route → ineligible; the `@<slug>` selector and
    chain carry the pin; a pin matching no route leaves the role unchanged.
13. **Thinking price** (`thinking-price.test.ts`) — bare/off unadjusted; a level
    scales only thinking-capable models; the frontier uses the effective price;
    `resolveSettings` validates thinking and rejects the legacy `suffixes` map;
    catalog `thinking[]` wins over the OR flag; meta levels never gate.
14. **OpenRouter blend** (`openrouter-blend.test.ts`) — price/throughput are the
    `1/price²`-weighted means over the page routes; flex/priority/degraded/free/
    `:batch` stay out; throughput renormalizes; the find-row fallback; the weight
    follows the input price.
15. **Writing metric** (`writing.test.ts`) — `parseWritingEvidence` keys finite
    scores and rejects junk; `applyWritingScores` fills uncovered models; a
    covered model ranks above an uncovered one.
16. **Benchmark sources** (`benchmark-sources.test.ts`) — `resolveBenchmarkSource`
    maps an llm-stats benchmark page, a bare id, the writing leaderboard and a
    Design Arena link, `null` for an unknown host; `normalizeMetricKey` is
    dot-free; `parseBenchmarkPayload` reads the llm-stats `entries[]` and writing
    evidence shapes and rejects junk; `applyBenchmarkScores` fills uncovered
    models; `loadBenchmarkScores` follows fresh → live → stale with a temp cache
    dir and an injected fetch; a declaration executes (payload path, id/score
    fields, `scoreMax`, join) and a metric colliding with a shipped key is
    rejected; `dryRunDeclaration` reports coverage/leader and rejects a zero-join;
    `extractBenchmarkLinks` pulls URLs from prose.
17. **Agent creation** (`create-agent.test.ts`) — a purpose fits the expected
    archetype; a `--weights` set violating Σ(non-price) = 1 − w_price is refused;
    an existing agent file without `--force` is refused and writes no role;
    `--dry-run` writes neither file; an architect `spec` replaces the
    description/body; `applyFocusBenchmarks` gives a named benchmark a decisive
    share, is a no-op for the archetype's own specialist set, and keeps both
    invariants; the four-axis gate.
18. **Agent removal** (`remove-agent.test.ts`) — the role's lock-file keys and the
    agent file are deleted (backup written); a shipped default role, a reserved
    name and an invalid name are refused; nothing-to-remove errors; `--dry-run`
    writes nothing; the updater drops `modelRoles.<n>` and the plugin-managed
    `task.disabledAgents` entry.
19. **Agent pins / disable** (`agent-pins.test.ts`, `agent-disable.test.ts`) —
    `parseAgentPin` takes the first `@role`; `discoverAgentPins` scans the three
    scopes, most specific wins; the sync is not day-gated; an unrelated entry
    keeps its position; an unknown role is never added.
20. **Role enable / lock** (`role-enable.test.ts`, `role-lock.test.ts`) —
    disabling drops the role from the resolved set and its `modelRoles` line; a
    locked role is not switched and its chain survives the prune; unlocking
    restores the switch.
21. **Settings** (`settings.test.ts`, `settings-schema.test.ts`) — opt-in roles;
    `priceSwitchFraction` range; flat/nested merge; `required` as string or
    array; an external metric key is weightable, a dotted one rejected;
    `package.json` `omp.settings` deep-equals `deriveSettingsSchema()`.
22. **Explorer** (`explorer.test.ts`, `explorer-scopes.test.ts`) — rank deltas;
    contributions sum to `q`; `inverseCardinal` round-trips; Export preserves
    siblings and normalizes nested roles; the scope switcher; the availability
    overlay.
23. **Project scope** (`project-updater.test.ts`, `project-setup.test.ts`,
    `project-roles-command.test.ts`) — project mode scopes config/state/history/
    lock to `<cwd>/.omp`; the day gate is per scope; the registry write;
    `setupProject` add/drop/keep, `--dry-run`, `--force`; the command is
    registered.
24. **Session model** (`session-model.test.ts`) — the hook fires only after a real
    write on a real `default` change; a dry run and a kept default skip it; a
    throwing hook is contained.
25. **Docs** (`docs.test.ts`) — every relative markdown link resolves; no
    reference to a moved doc; the CHANGELOG shape; `package.json` `files` entries
    exist; the README has no dev-only headings.
26. **Architect provenance** (`architect-provenance.test.ts`) — the vendored
    prompt header matches `ARCHITECT_PROMPT_VERSION` and the version named in
    [`agent-authoring.md`](agent-authoring.md).

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
