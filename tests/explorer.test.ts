import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parse as parseYaml } from "yaml";
import { type KeyAvailability, type ProbeVerdict } from "../src/availability.ts";
import { cardinalMetric, rankedRoutes, rankRole, SUFFIX_LEVELS, thinkingPriceFactor, type Model, type OpenRouterEndpointRecord, type RankData } from "../src/engine.ts";
import { startExplorer } from "../src/explorer/boot.ts";
import { explainModel, inverseCardinal, METRIC_META, perTaskPrice, rankRows } from "../src/explorer/explain.ts";
import { createExplorerServer, type ExplorerOpts } from "../src/explorer/server.ts";
import { readScopeRoles, type Scope } from "../src/explorer/scopes.ts";
import { isRecord } from "../src/guards.ts";
import { providerPinOfSelector } from "../src/provider-display.ts";
import { mergeExport, removeRoleSettings, validateRole, writeRoleSettings } from "../src/role-settings.ts";
import { DEFAULT_ROLES, KNOWN_METRICS, readPluginSettingsMap, resolveSettings } from "../src/settings.ts";
import { runUpdater } from "../src/updater.ts";
import { type TokenProfile, type UsageRow } from "../src/usage-ledger.ts";
import { fakeDeps, makeCatalog, makeModel, runInTempDir, setupAgentDir } from "./helpers.ts";

/** A single-scope (user-level) explorer server over a temp lock file. `extra`
 * overrides any opt (the pool inputs, the usage rows, the token profile). */
function userScopeOpts(lockPath: string, getState: ExplorerOpts["getState"], extra: Partial<ExplorerOpts> = {}): ExplorerOpts {
  const scope: Scope = { id: "user", label: "user-level", kind: "user", lockPath, present: true };
  return {
    webDir: join(process.cwd(), "web"),
    listScopes: () => [scope],
    resolveScope: () => scope,
    getState,
    refresh: async () => {},
    // The default pool: nothing gated, nothing pruned — i.e. the raw dataset.
    getPoolInputs: () => ({ catalog: [], tier: "billed", allowed: null, availability: NO_AVAILABILITY }),
    ...extra,
  };
}

// premium dominates budget on quality but is far more expensive and slower, so a
// quality-heavy role ranks premium first and a price/throughput-heavy role flips it.
const MODELS = [makeModel("premium", 90, 20, 50), makeModel("budget", 60, 0.5, 200)];
const TINY = { description: "", weights: { price: 0.4, throughput: 0.35, general: 0.25 }, required: ["general", "price", "throughput"] };

// Keyed-catalog availability fixtures. `NO_AVAILABILITY` is the
// inactive default the existing fakes/opts thread through; `ACTIVE_AVAILABILITY`
// marks `premium` usable and `budget` blocked.
const NO_AVAILABILITY: KeyAvailability = {
  active: false,
  reason: "unavailable",
  allowed: new Set(),
  blocked: new Set(),
  publicCount: 0,
  keyedCount: 0,
  fetchedAt: "2026-10-03T00:00:00.000Z",
};
const ACTIVE_AVAILABILITY: KeyAvailability = {
  active: true,
  reason: "active",
  allowed: new Set(["premium"]),
  blocked: new Set(["budget"]),
  publicCount: 2,
  keyedCount: 1,
  fetchedAt: "2026-10-03T00:00:00.000Z",
};

// The shipped selection rule: the scope-global default every getState literal
// below carries unless a test overrides it.
const NO_SELECTION = { mode: "value", qualityFloor: 0.9 };

test("rankRows: deltas measure movement against the baseline ranking", () => {
  const baseline = rankRole(DEFAULT_ROLES.slow, MODELS);
  assert.deepEqual(baseline.map((r) => r.model.id), ["premium", "budget"]);

  const rows = rankRows(TINY, MODELS, baseline);
  assert.deepEqual(rows.map((r) => r.id), ["budget", "premium"]);

  const budget = rows.find((r) => r.id === "budget");
  assert.ok(budget);
  assert.equal(budget.rank, 1);
  assert.equal(budget.baselineRank, 2);
  assert.equal(budget.delta, 1);

  const premium = rows.find((r) => r.id === "premium");
  assert.ok(premium);
  assert.equal(premium.rank, 2);
  assert.equal(premium.baselineRank, 1);
  assert.equal(premium.delta, -1);
});

test("rankRows: missing lists weighted metrics with a null raw value", () => {
  // makeModel leaves `math` null; the role weights it, so every row reports it missing.
  // A fixture role, not a shipped one: no shipped role weights `math` any more.
  const def = { description: "", weights: { math: 0.3, general: 0.5, price: 0.2 }, required: ["general", "price", "throughput"] };
  const rows = rankRows(def, MODELS, []);
  assert.deepEqual(rows[0].missing, ["math"]);
  assert.equal(rows[0].baselineRank, null);
  assert.equal(rows[0].delta, null);
});

test("explainModel: contributions sum to q, capability fill included", () => {
  // `long_context` is null on every fixture model, so the role's 0.3 weight exercises
  // the CAPABILITY_FILL branch rankRole takes — the panel must not report it as 0.
  const def = { description: "", weights: { general: 0.5, long_context: 0.3, price: 0.2 }, required: ["general", "price"] };
  const ex = explainModel(def, [makeModel("top", 60, 1, 50), makeModel("m", 30, 1, 50)], "m");
  if (!ex.eligible) throw new Error(`unexpected ineligible: ${ex.reasons.join(", ")}`);

  const sum = ex.contributions.reduce((a, c) => a + c.contribution, 0);
  assert.ok(Math.abs(sum - ex.q) < 1e-12, `parts ${sum} != q ${ex.q}`);

  const lc = ex.contributions.find((c) => c.metric === "long_context");
  assert.ok(lc);
  assert.equal(lc.t, 0.195); // the fill is already cardinal — no index transform
  assert.equal(lc.contribution, (0.3 / 0.8) * 0.195);
  assert.equal(lc.fillNote, "long_context not measured → capability fill 0.195");
  // A filled score is not a measurable target, so it never enters the tuning list.
  assert.deepEqual(ex.closing.map((c) => c.metric).sort(), ["general", "price"]);
});

test("inverseCardinal round-trips cardinalMetric for every weightable metric", () => {
  // Property: for every KNOWN_METRICS key, the explorer's inverse must undo the
  // engine's forward transform. Raw values are chosen inside each transform's
  // in-range region (throughput clamps outside [10,300]).
  const rawsFor = (metric: string): number[] => {
    const kind = METRIC_META[metric]?.kind;
    if (kind === "throughput") return [10, 50, 300];
    if (kind === "index") return [-20, 0, 20, 60];
    if (kind === "price") return [0.5, 5, 50];
    return [0, 0.4, 1]; // benchmark / percentile: 0-1
  };
  for (const metric of Object.keys(KNOWN_METRICS)) {
    for (const raw of rawsFor(metric)) {
      const t = cardinalMetric(metric, raw);
      const back = inverseCardinal(metric, t);
      assert.ok(back !== null, `${metric}@${raw} should be reachable`);
      assert.ok(Math.abs(back - raw) < 1e-9, `${metric}: inverse(${t}) = ${back}, want ${raw}`);
    }
  }
  // gpqa's chance anchor: t = 0.5 is the raw pass rate 0.625, not 0.5.
  assert.equal(inverseCardinal("gpqa", 0.5), 0.625);
  assert.equal(inverseCardinal("gpqa", cardinalMetric("gpqa", 0.8)), 0.8);
  assert.equal(inverseCardinal("throughput", 1.4), null);
});

test("validateRole surfaces the plugin's own validation errors", () => {
  const badSum = validateRole("custom", { description: "", weights: { general: 0.7, price: 0.6 }, required: [] });
  assert.ok(badSum.some((e) => e.includes("weights sum")));

  const unknown = validateRole("custom", { description: "", weights: { nope: 0.5, price: 0.5 }, required: [] });
  assert.ok(unknown.some((e) => e.includes("unknown metric")));

  assert.deepEqual(validateRole("custom", { description: "", weights: { general: 0.5, price: 0.5 }, required: [] }), []);
});

test("mergeExport preserves plugins and sibling settings, adds only dirty roles", () => {
  const existing = {
    plugins: { "omp-llm-role": { enabled: true } },
    settings: { "omp-llm-role": { switchMargin: 0.5 } },
  };
  const merged = mergeExport(existing, { slow: DEFAULT_ROLES.slow });
  assert.ok("lock" in merged);
  const lock = merged.lock as {
    plugins: unknown;
    settings: { "omp-llm-role": Record<string, unknown> };
  };
  const plugin = lock.settings["omp-llm-role"];
  assert.deepEqual(lock.plugins, existing.plugins);
  assert.equal(plugin.switchMargin, 0.5);
  // Flat dotted keys, one per weight — no nested `roles` object.
  assert.equal(plugin.roles, undefined);
  assert.equal(plugin["roles.slow.description"], DEFAULT_ROLES.slow.description);
  assert.deepEqual(plugin["roles.slow.required"], DEFAULT_ROLES.slow.required);
  for (const [metric, weight] of Object.entries(DEFAULT_ROLES.slow.weights)) {
    assert.equal(plugin[`roles.slow.weights.${metric}`], weight);
  }
  // The input is cloned, never mutated.
  assert.equal((existing.settings["omp-llm-role"] as Record<string, unknown>).roles, undefined);
});

test("mergeExport normalizes a pre-existing nested role to flat keys", () => {
  const existing = {
    plugins: { "omp-llm-role": { enabled: true } },
    settings: {
      "omp-llm-role": {
        switchMargin: 0.5,
        roles: { slow: { description: "old", weights: { general: 1 }, required: [] }, other: { description: "keep" } },
      },
    },
  };
  const merged = mergeExport(existing, { slow: DEFAULT_ROLES.slow });
  assert.ok("lock" in merged);
  const lock = merged.lock as { settings: { "omp-llm-role": Record<string, unknown> } };
  const plugin = lock.settings["omp-llm-role"];
  // The dirty role's nested entry is gone; the untouched sibling nested role stays.
  assert.deepEqual(plugin.roles, { other: { description: "keep" } });
  assert.equal(plugin["roles.slow.description"], DEFAULT_ROLES.slow.description);
  assert.equal(plugin["roles.slow.weights.general"], DEFAULT_ROLES.slow.weights.general);
  // The input is cloned, never mutated.
  const original = existing.settings["omp-llm-role"] as { roles: unknown };
  assert.deepEqual(original.roles, {
    slow: { description: "old", weights: { general: 1 }, required: [] },
    other: { description: "keep" },
  });
});

// Issue #18: the four normative endpoint filters must serialize as flat dotted
// keys like `filters.image` (omp's /settings Plugins tab shallow-merges), and a
// `0`/`false` value is a real setting that must survive the round-trip.
test("mergeExport emits every endpoint filter as a flat dotted key", () => {
  const def = {
    ...DEFAULT_ROLES.slow,
    filters: { image: true, tools: false, minContextTokens: 0, minOutputTokens: 4096, maxPriceUsdPerM: 2.5 },
  };
  const merged = mergeExport({ settings: {} }, { slow: def });
  assert.ok("lock" in merged);
  const lock = merged.lock as { settings: { "omp-llm-role": Record<string, unknown> } };
  const plugin = lock.settings["omp-llm-role"];
  assert.equal(plugin["roles.slow.filters.image"], true);
  assert.equal(plugin["roles.slow.filters.tools"], false);
  assert.equal(plugin["roles.slow.filters.minContextTokens"], 0);
  assert.equal(plugin["roles.slow.filters.minOutputTokens"], 4096);
  assert.equal(plugin["roles.slow.filters.maxPriceUsdPerM"], 2.5);
});

test("endpoint filters round-trip through writeRoleSettings/resolveSettings, and removal deletes them", () => {
  const dir = mkdtempSync(join(tmpdir(), "role-filters-"));
  const lockPath = join(dir, "omp-plugins.lock.json");
  writeFileSync(lockPath, JSON.stringify({ plugins: { "omp-llm-role": { enabled: true } }, settings: {} }, null, 2));

  const filters = { image: true, tools: false, minContextTokens: 0, minOutputTokens: 4096, maxPriceUsdPerM: 2.5 };
  const result = writeRoleSettings(lockPath, { slow: { ...DEFAULT_ROLES.slow, filters } });
  assert.equal(result.ok, true);

  const { settings, errors } = resolveSettings(readPluginSettingsMap({ global: lockPath, project: null }));
  assert.deepEqual(errors, []);
  assert.deepEqual(settings.roles.slow.filters, filters);

  const removed = removeRoleSettings(lockPath, ["slow"]);
  assert.equal(removed.ok, true);
  const after = JSON.parse(readFileSync(lockPath, "utf8")) as { settings: { "omp-llm-role": Record<string, unknown> } };
  const plugin = after.settings["omp-llm-role"];
  for (const key of ["image", "tools", "minContextTokens", "minOutputTokens", "maxPriceUsdPerM"]) {
    assert.equal(plugin[`roles.slow.filters.${key}`], undefined);
  }
});

// Issue #19: the per-role provider pin must serialize as a flat dotted key and
// round-trip through the explorer's Export, and removal must delete it.
test("providerPin round-trips through writeRoleSettings/resolveSettings, and removal deletes it", () => {
  const dir = mkdtempSync(join(tmpdir(), "role-pin-"));
  const lockPath = join(dir, "omp-plugins.lock.json");
  writeFileSync(lockPath, JSON.stringify({ plugins: { "omp-llm-role": { enabled: true } }, settings: {} }, null, 2));

  const result = writeRoleSettings(lockPath, { slow: { ...DEFAULT_ROLES.slow, providerPin: "deepinfra/fp8" } });
  assert.equal(result.ok, true);

  const written = JSON.parse(readFileSync(lockPath, "utf8")) as { settings: { "omp-llm-role": Record<string, unknown> } };
  assert.equal(written.settings["omp-llm-role"]["roles.slow.providerPin"], "deepinfra/fp8");

  const { settings, errors } = resolveSettings(readPluginSettingsMap({ global: lockPath, project: null }));
  assert.deepEqual(errors, []);
  assert.equal(settings.roles.slow.providerPin, "deepinfra/fp8");

  const removed = removeRoleSettings(lockPath, ["slow"]);
  assert.equal(removed.ok, true);
  const after = JSON.parse(readFileSync(lockPath, "utf8")) as { settings: { "omp-llm-role": Record<string, unknown> } };
  assert.equal(after.settings["omp-llm-role"]["roles.slow.providerPin"], undefined);
});

test("export writes the lock file with a backup and stays valid", async () => {
  const dir = mkdtempSync(join(tmpdir(), "explorer-test-"));
  const lockPath = join(dir, "omp-plugins.lock.json");
  const seed = { plugins: { "omp-llm-role": { enabled: true } }, settings: {} };
  writeFileSync(lockPath, JSON.stringify(seed, null, 2));

  const rank: RankData = { models: MODELS, fetchedAt: "2026-09-26T00:00:00.000Z", source: "test", orMatched: 2, orPriced: 2 };
  const server = createExplorerServer(userScopeOpts(lockPath, () => ({ rank, roles: DEFAULT_ROLES, universe: {}, defaults: DEFAULT_ROLES, availability: NO_AVAILABILITY, features: {}, selection: NO_SELECTION })));
  const { promise, resolve } = Promise.withResolvers<void>();
  server.listen(0, "127.0.0.1", resolve);
  await promise;
  const port = (server.address() as { port: number }).port;

  try {
    // Sum-preserving edit of the shipped slow role: shift 0.02 from code to general.
    const base = DEFAULT_ROLES.slow.weights;
    const edited = { ...DEFAULT_ROLES.slow, weights: { ...base, general: base.general + 0.02, code: base.code - 0.02 } };
    const res = await fetch(`http://127.0.0.1:${port}/api/export`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roles: { slow: edited } }),
    });
    const body = (await res.json()) as { ok: boolean; backupPath: string | null; roles: string[] };
    assert.equal(body.ok, true);
    assert.deepEqual(body.roles, ["slow"]);

    const written = JSON.parse(readFileSync(lockPath, "utf8")) as {
      plugins: unknown;
      settings: { "omp-llm-role": Record<string, unknown> };
    };
    const plugin = written.settings["omp-llm-role"];
    assert.deepEqual(written.plugins, seed.plugins);
    assert.equal(plugin.roles, undefined);
    assert.equal(plugin["roles.slow.weights.general"], base.general + 0.02);
    assert.equal(plugin["roles.slow.weights.code"], base.code - 0.02);

    const backups = readdirSync(dir).filter((f) => f.includes(".bak-"));
    assert.equal(backups.length, 1);

    const { errors } = resolveSettings(readPluginSettingsMap({ global: lockPath, project: null }));
    assert.deepEqual(errors, []);
  } finally {
    server.close();
  }
});

test("a role absent from the shipped defaults ranks and exports", async () => {
  const dir = mkdtempSync(join(tmpdir(), "explorer-new-role-"));
  const lockPath = join(dir, "omp-plugins.lock.json");
  const seed = { plugins: { "omp-llm-role": { enabled: true } }, settings: {} };
  writeFileSync(lockPath, JSON.stringify(seed, null, 2));

  const rank: RankData = { models: MODELS, fetchedAt: "2026-10-01T00:00:00.000Z", source: "test", orMatched: 2, orPriced: 2 };
  const server = createExplorerServer(userScopeOpts(lockPath, () => ({ rank, roles: DEFAULT_ROLES, universe: {}, defaults: DEFAULT_ROLES, availability: NO_AVAILABILITY, features: {}, selection: NO_SELECTION })));
  const { promise, resolve } = Promise.withResolvers<void>();
  server.listen(0, "127.0.0.1", resolve);
  await promise;
  const port = (server.address() as { port: number }).port;

  try {
    // A role the explorer created from its template: not in roles or defaults, so
    // the baseline ranking is empty and every row reports a null baseline rank.
    const review = { description: "Code review", weights: { general: 0.5, price: 0.5 }, required: ["general", "price"] };
    const rankRes = await fetch(`http://127.0.0.1:${port}/api/rank`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "review", def: review }),
    });
    const rankBody: unknown = await rankRes.json();
    assert.ok(isRecord(rankBody));
    assert.deepEqual(rankBody.errors, []);
    assert.ok(Array.isArray(rankBody.rows));
    assert.equal(rankBody.rows.length, 2);
    const firstRow: unknown = rankBody.rows[0];
    assert.ok(isRecord(firstRow));
    assert.equal(firstRow.baselineRank, null);

    const expRes = await fetch(`http://127.0.0.1:${port}/api/export`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roles: { review } }),
    });
    const expBody: unknown = await expRes.json();
    assert.ok(isRecord(expBody));
    assert.equal(expBody.ok, true);
    assert.deepEqual(expBody.roles, ["review"]);

    const written: unknown = JSON.parse(readFileSync(lockPath, "utf8"));
    assert.ok(isRecord(written));
    assert.deepEqual(written.plugins, seed.plugins);

    const { settings, errors } = resolveSettings(readPluginSettingsMap({ global: lockPath, project: null }));
    assert.deepEqual(errors, []);
    assert.deepEqual(settings.roles.review.weights, review.weights);
  } finally {
    server.close();
  }
});

// The shared launcher behind the omp `/explore-roles` command: the roles it
// serves come from the lock file (not
// the shipped defaults), a busy preferred port falls back to a free one, and
// close() releases the port.
test("startExplorer serves lock-file roles and releases its port on close", async () => {
  const dir = mkdtempSync(join(tmpdir(), "explorer-boot-"));
  const lockPath = join(dir, "omp-plugins.lock.json");
  const review = { description: "Code review", weights: { general: 0.5, price: 0.5 }, required: ["general", "price"] };
  writeFileSync(lockPath, JSON.stringify({ plugins: { "omp-llm-role": { enabled: true } }, settings: { "omp-llm-role": { roles: { review } } } }, null, 2));

  // One image-capable model so the shipped `designer` role (filters.image) has a pool.
  const bootModels = [...MODELS, { ...makeModel("img", 70, 2, 80), multimodal: true }];
  const rank: RankData = { models: bootModels, fetchedAt: "2026-10-01T00:00:00.000Z", source: "test", orMatched: 3, orPriced: 3 };
  const handle = await startExplorer({
    webDir: join(process.cwd(), "web"),
    lockPath,
    registryDir: dir,
    // Hermetic: a booted explorer must never read the developer's real ledger.
    usageDir: dir,
    rank,
    catalog: [],
    availability: NO_AVAILABILITY,
    reload: async () => rank,
    port: 0,
    open: false,
    onLog: () => {},
  });

  try {
    assert.ok(handle.port > 0);
    const res = await fetch(`${handle.url}/api/bootstrap`);
    const body: unknown = await res.json();
    assert.ok(isRecord(body));
    assert.ok(isRecord(body.roles));
    assert.ok(isRecord(body.roles.review));
    assert.deepEqual(body.roles.review.weights, review.weights);
    assert.deepEqual(body.roles.review.required, review.required);
    assert.ok("slow" in body.roles);
    assert.ok(isRecord(body.defaults));
    assert.ok("slow" in body.defaults);

    // Universe: every known role (disabled included) with kind/enabled/locked + def.
    assert.ok(isRecord(body.universe));
    const universe = body.universe as Record<
      string,
      { kind: string; enabled: boolean; locked: boolean; def: { weights: Record<string, number> } }
    >;
    assert.equal(universe.designer.kind, "plugin");
    assert.equal(universe.designer.enabled, false);
    assert.equal(universe.designer.locked, false);
    assert.deepEqual(universe.designer.def.weights, DEFAULT_ROLES.designer.weights);
    assert.equal(universe.slow.kind, "default");
    assert.equal(universe.slow.enabled, true);
    assert.equal(universe.review.kind, "user");
    assert.equal(universe.review.enabled, true);
    // The resolved set stays pruned: the disabled designer is absent from it.
    assert.equal("designer" in body.roles, false);

    // A disabled role and a lock-file-only role rank with a live baseline: posting
    // each role's own effective def yields delta 0 against a non-empty baseline.
    for (const role of ["designer", "review"] as const) {
      const rankRes = await fetch(`${handle.url}/api/rank`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role, def: universe[role].def }),
      });
      const rankBody: unknown = await rankRes.json();
      assert.ok(isRecord(rankBody));
      const rows = rankBody.rows as Array<{ rank: number; baselineRank: number | null; delta: number | null }>;
      assert.ok(rows.length > 0, `${role} should have a non-empty pool`);
      for (const row of rows) {
        assert.equal(row.baselineRank, row.rank);
        assert.equal(row.delta, 0);
      }
    }
  } finally {
    await handle.close();
  }

  // The port is free again: binding it must succeed.
  const reuse = createServer();
  await new Promise<void>((resolve) => reuse.listen(handle.port, "127.0.0.1", resolve));
  await new Promise<void>((resolve) => reuse.close(() => resolve()));
});

// A page reload after Export must reflect the write: the bootstrap payload is
// re-read from the lock file on every request, not frozen at boot. Regression:
// enabling a role in the explorer and reloading showed it disabled until the
// server was restarted.
test("a bootstrap after Export reflects the new lock state", async () => {
  const dir = mkdtempSync(join(tmpdir(), "explorer-reload-"));
  const lockPath = join(dir, "omp-plugins.lock.json");
  writeFileSync(lockPath, JSON.stringify({ plugins: { "omp-llm-role": { enabled: true } }, settings: {} }, null, 2));

  const rank: RankData = { models: MODELS, fetchedAt: "2026-10-01T00:00:00.000Z", source: "test", orMatched: 2, orPriced: 2 };
  const handle = await startExplorer({
    webDir: join(process.cwd(), "web"),
    lockPath,
    registryDir: dir,
    // Hermetic: a booted explorer must never read the developer's real ledger.
    usageDir: dir,
    rank,
    catalog: [],
    availability: NO_AVAILABILITY,
    reload: async () => rank,
    port: 0,
    open: false,
    onLog: () => {},
  });

  try {
    const before: unknown = await (await fetch(`${handle.url}/api/bootstrap`)).json();
    assert.ok(isRecord(before));
    assert.ok(isRecord(before.universe));
    assert.ok(isRecord(before.universe.designer));
    assert.equal(before.universe.designer.enabled, false);

    const res = await fetch(`${handle.url}/api/export`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roles: { designer: { ...DEFAULT_ROLES.designer, enabled: true } } }),
    });
    const exported: unknown = await res.json();
    assert.ok(isRecord(exported));
    assert.equal(exported.ok, true);

    const after: unknown = await (await fetch(`${handle.url}/api/bootstrap`)).json();
    assert.ok(isRecord(after));
    assert.ok(isRecord(after.universe));
    assert.ok(isRecord(after.universe.designer));
    assert.equal(after.universe.designer.enabled, true);
    assert.ok(isRecord(after.roles));
    assert.ok("designer" in after.roles);
  } finally {
    await handle.close();
  }
});

test("startExplorer falls back to an ephemeral port when the preferred one is busy", async () => {
  const dir = mkdtempSync(join(tmpdir(), "explorer-boot-busy-"));
  const lockPath = join(dir, "omp-plugins.lock.json");
  writeFileSync(lockPath, JSON.stringify({ plugins: {}, settings: {} }, null, 2));

  const blocker = createServer();
  await new Promise<void>((resolve) => blocker.listen(0, "127.0.0.1", resolve));
  const addr = blocker.address();
  if (addr === null || typeof addr === "string") throw new Error("expected a TCP address");
  const busy = addr.port;

  const rank: RankData = { models: MODELS, fetchedAt: "2026-10-01T00:00:00.000Z", source: "test", orMatched: 2, orPriced: 2 };
  const handle = await startExplorer({
    webDir: join(process.cwd(), "web"),
    lockPath,
    registryDir: dir,
    // Hermetic: a booted explorer must never read the developer's real ledger.
    usageDir: dir,
    rank,
    catalog: [],
    availability: NO_AVAILABILITY,
    reload: async () => rank,
    port: busy,
    open: false,
    onLog: () => {},
  });

  try {
    assert.notEqual(handle.port, busy);
    const res = await fetch(`${handle.url}/api/bootstrap`);
    assert.equal(res.status, 200);
  } finally {
    await handle.close();
    await new Promise<void>((resolve) => blocker.close(() => resolve()));
  }
});

// ---------------------------------------------------------------------------
// Keyed-catalog availability overlay
// ---------------------------------------------------------------------------

test("rankRows: availability annotates key without reordering", () => {
  const baseline = rankRole(DEFAULT_ROLES.slow, MODELS);
  const plain = rankRows(TINY, MODELS, baseline);
  const marked = rankRows(TINY, MODELS, baseline, ACTIVE_AVAILABILITY);

  // The overlay is read-only: same ids in the same order as the unannotated call.
  assert.deepEqual(marked.map((r) => r.id), plain.map((r) => r.id));

  const byId = new Map(marked.map((r) => [r.id, r.key]));
  assert.equal(byId.get("premium"), "usable");
  assert.equal(byId.get("budget"), "blocked");

  // A model in neither catalog is unknown, not blocked.
  const partial: KeyAvailability = { ...ACTIVE_AVAILABILITY, blocked: new Set() };
  const rows = rankRows(TINY, MODELS, baseline, partial);
  assert.equal(rows.find((r) => r.id === "budget")?.key, "unknown");
});

test("rankRows: no availability, no-filter, and unavailable all read unknown", () => {
  const baseline = rankRole(DEFAULT_ROLES.slow, MODELS);
  const noFilter: KeyAvailability = { ...NO_AVAILABILITY, reason: "no-filter" };
  for (const availability of [undefined, noFilter, NO_AVAILABILITY]) {
    const rows = rankRows(TINY, MODELS, baseline, availability);
    assert.deepEqual(rows.map((r) => r.key), ["unknown", "unknown"]);
  }
});

test("explainModel: the eligible branch carries the availability overlay", () => {
  const usable = explainModel(TINY, MODELS, "premium", "tiny", ACTIVE_AVAILABILITY);
  if (!usable.eligible) throw new Error(`unexpected ineligible: ${usable.reasons.join(", ")}`);
  assert.equal(usable.key, "usable");
  assert.equal(usable.keyReason, "active");

  const blocked = explainModel(TINY, MODELS, "budget", "tiny", ACTIVE_AVAILABILITY);
  if (!blocked.eligible) throw new Error(`unexpected ineligible: ${blocked.reasons.join(", ")}`);
  assert.equal(blocked.key, "blocked");
  assert.equal(blocked.keyReason, "active");

  // No availability value supplied: the overlay degrades to unknown/unavailable.
  const unknown = explainModel(TINY, MODELS, "premium", "tiny");
  if (!unknown.eligible) throw new Error(`unexpected ineligible: ${unknown.reasons.join(", ")}`);
  assert.equal(unknown.key, "unknown");
  assert.equal(unknown.keyReason, "unavailable");
});

/** Boot a `createExplorerServer` with a fixed availability overlay and a temp lock file. */
async function bootExplorer(availability: KeyAvailability): Promise<{ url: string; close: () => Promise<void> }> {
  const dir = mkdtempSync(join(tmpdir(), "explorer-avail-"));
  const lockPath = join(dir, "omp-plugins.lock.json");
  writeFileSync(lockPath, JSON.stringify({ plugins: { "omp-llm-role": { enabled: true } }, settings: {} }, null, 2));
  const rank: RankData = { models: MODELS, fetchedAt: "2026-10-03T00:00:00.000Z", source: "test", orMatched: 2, orPriced: 2 };
  const server = createExplorerServer(userScopeOpts(lockPath, () => ({ rank, roles: DEFAULT_ROLES, universe: {}, defaults: DEFAULT_ROLES, availability, features: {}, selection: NO_SELECTION })));
  const { promise, resolve } = Promise.withResolvers<void>();
  server.listen(0, "127.0.0.1", resolve);
  await promise;
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("expected a TCP address");
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

test("bootstrap and rank carry the active availability overlay", async () => {
  const handle = await bootExplorer(ACTIVE_AVAILABILITY);
  try {
    const boot: unknown = await (await fetch(`${handle.url}/api/bootstrap`)).json();
    assert.ok(isRecord(boot));
    assert.ok(isRecord(boot.availability));
    assert.equal(boot.availability.active, true);
    assert.equal(boot.availability.blockedCount, 1);

    const res = await fetch(`${handle.url}/api/rank`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "tiny", def: TINY }),
    });
    const body: unknown = await res.json();
    assert.ok(isRecord(body));
    assert.ok(Array.isArray(body.rows));
    const keys = new Map<string, unknown>();
    for (const row of body.rows) {
      assert.ok(isRecord(row));
      if (typeof row.id === "string") keys.set(row.id, row.key);
    }
    assert.equal(keys.get("premium"), "usable");
    assert.equal(keys.get("budget"), "blocked");
  } finally {
    await handle.close();
  }
});

test("a non-active availability reads unknown everywhere", async () => {
  const handle = await bootExplorer(NO_AVAILABILITY);
  try {
    const boot: unknown = await (await fetch(`${handle.url}/api/bootstrap`)).json();
    assert.ok(isRecord(boot));
    assert.ok(isRecord(boot.availability));
    assert.equal(boot.availability.active, false);

    const res = await fetch(`${handle.url}/api/rank`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "tiny", def: TINY }),
    });
    const body: unknown = await res.json();
    assert.ok(isRecord(body));
    assert.ok(Array.isArray(body.rows));
    assert.ok(body.rows.length > 0);
    for (const row of body.rows) {
      assert.ok(isRecord(row));
      assert.equal(row.key, "unknown");
    }
  } finally {
    await handle.close();
  }
});

// ---------------------------------------------------------------------------
// Capability flags (issue #40)
// ---------------------------------------------------------------------------

/** One standard-tier route with a cache-read price, so a role's `cacheHitRate`
 * actually moves the model's effective price (a route-less model is dropped by
 * the cache-priced path). */
function cacheRoute(id: string, price: number, weightPrice: number, cacheReadPrice: number, tput: number): OpenRouterEndpointRecord {
  return { id, providerSlug: "org", serviceTier: null, status: 0, free: false, variant: "standard", price, weightPrice, cacheReadPrice, tput, latency: null, contextLength: 200000, maxCompletionTokens: 100000, supportsTools: true };
}

const CACHE_MODELS: Model[] = [
  { ...makeModel("premium", 90, 20, 50), routes: [cacheRoute("premium-r", 20, 20, 2, 50)] },
  { ...makeModel("budget", 60, 0.5, 200), routes: [cacheRoute("budget-r", 0.5, 0.5, 0.05, 200)] },
];

/** Boot a single-scope explorer over a temp lock file with a fixed getState. */
async function bootWithState(getState: ExplorerOpts["getState"], extra: Partial<ExplorerOpts> = {}): Promise<{ url: string; close: () => Promise<void> }> {
  const dir = mkdtempSync(join(tmpdir(), "explorer-features-"));
  const lockPath = join(dir, "omp-plugins.lock.json");
  writeFileSync(lockPath, JSON.stringify({ plugins: { "omp-llm-role": { enabled: true } }, settings: {} }, null, 2));
  const server = createExplorerServer(userScopeOpts(lockPath, getState, extra));
  const { promise, resolve } = Promise.withResolvers<void>();
  server.listen(0, "127.0.0.1", resolve);
  await promise;
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("expected a TCP address");
  return { url: `http://127.0.0.1:${address.port}`, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

// The Δ baseline is the role's RESOLVED def (`state.roles[role]`), so a posted
// AUTHORED def carrying a flag must be expanded with the scope's global flags
// before ranking — otherwise every row's Δ would be a lie.
test("a posted def carrying a capability flag ranks identically to the resolved def", async () => {
  const rank: RankData = { models: CACHE_MODELS, fetchedAt: "2026-10-07T00:00:00.000Z", source: "test", orMatched: 2, orPriced: 2 };
  // The baseline is the role's resolved def (no flag), so the flag's effect shows
  // up as a real Δ rather than a null baseline.
  const handle = await bootWithState(() => ({ rank, roles: { ...DEFAULT_ROLES, tiny: TINY }, universe: {}, defaults: DEFAULT_ROLES, availability: NO_AVAILABILITY, features: {}, selection: NO_SELECTION }));
  try {
    const post = async (def: unknown): Promise<{ rows: unknown; lambda: number; derivedLambda: number; errors: unknown }> => {
      const res = await fetch(`${handle.url}/api/rank`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: "tiny", def }),
      });
      return (await res.json()) as { rows: unknown; lambda: number; derivedLambda: number; errors: unknown };
    };
    const authored = await post({ ...TINY, features: { cachePricing: true } });
    const resolved = await post({ ...TINY, cacheHitRate: 0.5 });
    assert.ok(Array.isArray(authored.rows));
    assert.equal(authored.rows.length, 2);
    assert.deepEqual(authored.rows, resolved.rows);
    assert.equal(authored.lambda, resolved.lambda);
    assert.equal(authored.derivedLambda, resolved.derivedLambda);
    assert.deepEqual(authored.errors, []);
    // The flag is not inert: the cache-priced ranking differs from the uncached one.
    const plain = await post(TINY);
    assert.notDeepEqual(authored.rows, plain.rows);
  } finally {
    await handle.close();
  }
});

test("bootstrap carries the scope's global flags and the feature registry", async () => {
  const rank: RankData = { models: MODELS, fetchedAt: "2026-10-07T00:00:00.000Z", source: "test", orMatched: 2, orPriced: 2 };
  const handle = await bootWithState(() => ({ rank, roles: DEFAULT_ROLES, universe: {}, defaults: DEFAULT_ROLES, availability: NO_AVAILABILITY, features: { cachePricing: true }, selection: NO_SELECTION }));
  try {
    const boot: unknown = await (await fetch(`${handle.url}/api/bootstrap`)).json();
    assert.ok(isRecord(boot));
    assert.ok(isRecord(boot.features));
    assert.equal(boot.features.cachePricing, true);
    assert.ok(Array.isArray(boot.featureRegistry));
    const registry = boot.featureRegistry as Array<{ id: string; label: string; description: string; buys: string; recommended: Record<string, unknown> }>;
    assert.deepEqual(registry.map((f) => f.id), ["endpointCeilings", "cachePricing", "providerPinning", "costCap"]);
    for (const f of registry) {
      assert.equal(typeof f.label, "string");
      assert.equal(typeof f.description, "string");
      assert.equal(typeof f.buys, "string");
      assert.ok(isRecord(f.recommended));
    }
    assert.deepEqual(registry.find((f) => f.id === "cachePricing")?.recommended, { cacheHitRate: 0.5 });
    assert.deepEqual(registry.find((f) => f.id === "providerPinning")?.recommended, { preferOwnProvider: true, filters: { preferredMinThroughput: 50 } });
  } finally {
    await handle.close();
  }
});

test("readScopeRoles carries the scope's global capability flags", () => {
  const dir = mkdtempSync(join(tmpdir(), "explorer-scope-features-"));
  const lockPath = join(dir, "omp-plugins.lock.json");
  writeFileSync(
    lockPath,
    JSON.stringify(
      {
        plugins: { "omp-llm-role": { enabled: true } },
        settings: {
          "omp-llm-role": {
            "features.cachePricing": true,
            roles: { tiny: { description: "", weights: { general: 0.25, price: 0.4, throughput: 0.35 }, required: ["general", "price", "throughput"], features: { costCap: true } } },
          },
        },
      },
      null,
      2,
    ),
  );
  const scope: Scope = { id: "user", label: "user-level", kind: "user", lockPath, present: true };
  const { features, roles, errors } = readScopeRoles(scope, lockPath);
  assert.deepEqual(errors, []);
  assert.deepEqual(features, { cachePricing: true });
  // The global flag reaches every role; the per-role flag is the role's own.
  assert.equal(roles.tiny.cacheHitRate, 0.5);
  assert.equal(roles.tiny.filters?.maxPriceUsdPerM, 10);
});

// Export must write the FLAG, never the expanded knobs: a future change to the
// recommendation then keeps reaching the role (user story 11).
test("export writes the capability flag, never the expanded knobs", () => {
  const dir = mkdtempSync(join(tmpdir(), "explorer-feature-export-"));
  const lockPath = join(dir, "omp-plugins.lock.json");
  writeFileSync(lockPath, JSON.stringify({ plugins: { "omp-llm-role": { enabled: true } }, settings: {} }, null, 2));
  const authored = { ...TINY, features: { cachePricing: true, costCap: true } };
  const result = writeRoleSettings(lockPath, { tiny: authored });
  assert.equal(result.ok, true);
  const written = JSON.parse(readFileSync(lockPath, "utf8")) as { settings: { "omp-llm-role": Record<string, unknown> } };
  const plugin = written.settings["omp-llm-role"];
  assert.equal(plugin["roles.tiny.features.cachePricing"], true);
  assert.equal(plugin["roles.tiny.features.costCap"], true);
  assert.equal(plugin["roles.tiny.cacheHitRate"], undefined);
  assert.equal(plugin["roles.tiny.filters.maxPriceUsdPerM"], undefined);
  assert.equal(plugin["roles.tiny.filters.tools"], undefined);
  assert.equal(plugin["roles.tiny.filters.minOutputTokens"], undefined);
  assert.equal(plugin["roles.tiny.preferOwnProvider"], undefined);
  // Round-trip: the written lock resolves to the expanded def.
  const { settings, errors } = resolveSettings(readPluginSettingsMap({ global: lockPath, project: null }));
  assert.deepEqual(errors, []);
  assert.equal(settings.roles.tiny.cacheHitRate, 0.5);
  assert.equal(settings.roles.tiny.filters?.maxPriceUsdPerM, 10);
});

// Issue #42: the focus table's unassessed row must tell the user the edit has to
// be Exported before a reload can assess it — the payload is computed over the
// resolved definition, so an in-memory edit is discarded by a plain reload.
test("the focus table's unassessed row points at Export before reload", () => {
  const src = readFileSync(join(process.cwd(), "web", "app.js"), "utf8");
  assert.match(src, /not assessed — Export, then reload to assess the edited definition/);
  assert.doesNotMatch(src, /not assessed — reload to assess the edited definition/);
});

// ---------------------------------------------------------------------------
// Manual provider pin (issue #62)
// ---------------------------------------------------------------------------

/** The bound port of a listening server (the tests bind to an ephemeral port). */
function listenPort(server: Server): number {
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("expected a TCP address");
  return address.port;
}

/** One standard-tier route with a distinct provider slug, for the pin tests. */
function endpoint(id: string, providerSlug: string, price: number, tput: number): OpenRouterEndpointRecord {
  return { id, providerSlug, serviceTier: null, status: 0, free: false, variant: "standard", price, weightPrice: price, cacheReadPrice: price, tput, latency: null, contextLength: 200000, maxCompletionTokens: 100000, supportsTools: true };
}

// `alpha` carries a cheap and a pricey route; `beta` only the cheap one. A role
// pinned to the pricey slug prices alpha there and drops beta (no such route).
const PIN_MODELS: Model[] = [
  { ...makeModel("alpha", 80, 5, 100), routes: [endpoint("alpha-cheap", "cheapco/fp8", 1, 100), endpoint("alpha-pricey", "priceyco/fp8", 9, 100)] },
  { ...makeModel("beta", 60, 3, 100), routes: [endpoint("beta-cheap", "cheapco/fp8", 1, 100)] },
];
const PIN_RANK: RankData = { models: PIN_MODELS, fetchedAt: "2026-10-09T00:00:00.000Z", source: "test", orMatched: 2, orPriced: 2 };
const PIN_DEF = { description: "", weights: { general: 0.5, price: 0.5 }, required: ["general", "price"] };

test("a manual providerPin prices the pinned route in the preview", async () => {
  const handle = await bootWithState(() => ({ rank: PIN_RANK, roles: DEFAULT_ROLES, universe: {}, defaults: DEFAULT_ROLES, availability: NO_AVAILABILITY, features: {}, selection: NO_SELECTION }));
  try {
    const res = await fetch(`${handle.url}/api/rank`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "pinned", def: { ...PIN_DEF, providerPin: "priceyco/fp8" } }),
    });
    const body: unknown = await res.json();
    assert.ok(isRecord(body));
    assert.deepEqual(body.errors, []);
    const rows = body.rows;
    assert.ok(Array.isArray(rows));
    const alpha = rows.find((r) => isRecord(r) && r.id === "alpha");
    assert.ok(alpha);
    assert.equal(alpha.priceEff, 9); // the pinned route's price, not the blend
    // beta has no priceyco route, so the pin drops it.
    assert.equal(rows.some((r) => isRecord(r) && r.id === "beta"), false);
  } finally {
    await handle.close();
  }
});

test("export writes a valid tiered providerPin and the preview reflects it", async () => {
  const dir = mkdtempSync(join(tmpdir(), "explorer-pin-"));
  const lockPath = join(dir, "omp-plugins.lock.json");
  writeFileSync(lockPath, JSON.stringify({ plugins: { "omp-llm-role": { enabled: true } }, settings: {} }, null, 2));
  const server = createExplorerServer(userScopeOpts(lockPath, () => ({ rank: PIN_RANK, roles: DEFAULT_ROLES, universe: {}, defaults: DEFAULT_ROLES, availability: NO_AVAILABILITY, features: {}, selection: NO_SELECTION })));
  const { promise, resolve } = Promise.withResolvers<void>();
  server.listen(0, "127.0.0.1", resolve);
  await promise;
  const port = listenPort(server);
  try {
    const def = { ...PIN_DEF, providerPin: "priceyco/fp8" };
    const expRes = await fetch(`http://127.0.0.1:${port}/api/export`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roles: { pinned: def } }),
    });
    const expBody: unknown = await expRes.json();
    assert.ok(isRecord(expBody));
    assert.equal(expBody.ok, true);

    const written = JSON.parse(readFileSync(lockPath, "utf8")) as { settings: { "omp-llm-role": Record<string, unknown> } };
    assert.equal(written.settings["omp-llm-role"]["roles.pinned.providerPin"], "priceyco/fp8");

    const rankRes = await fetch(`http://127.0.0.1:${port}/api/rank`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "pinned", def }),
    });
    const rankBody: unknown = await rankRes.json();
    assert.ok(isRecord(rankBody));
    const rows = rankBody.rows;
    assert.ok(Array.isArray(rows));
    const alpha = rows.find((r) => isRecord(r) && r.id === "alpha");
    assert.ok(alpha);
    assert.equal(alpha.priceEff, 9);
  } finally {
    server.close();
  }
});

test("export rejects a providerPin that matches no route without writing", async () => {
  const dir = mkdtempSync(join(tmpdir(), "explorer-pin-bad-"));
  const lockPath = join(dir, "omp-plugins.lock.json");
  writeFileSync(lockPath, JSON.stringify({ plugins: { "omp-llm-role": { enabled: true } }, settings: {} }, null, 2));
  const before = readFileSync(lockPath, "utf8");
  const server = createExplorerServer(userScopeOpts(lockPath, () => ({ rank: PIN_RANK, roles: DEFAULT_ROLES, universe: {}, defaults: DEFAULT_ROLES, availability: NO_AVAILABILITY, features: {}, selection: NO_SELECTION })));
  const { promise, resolve } = Promise.withResolvers<void>();
  server.listen(0, "127.0.0.1", resolve);
  await promise;
  const port = listenPort(server);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/export`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roles: { pinned: { ...PIN_DEF, providerPin: "ghostco/fp8" } } }),
    });
    const body: unknown = await res.json();
    assert.ok(isRecord(body));
    assert.equal(body.ok, false);
    const errors = body.errors;
    assert.ok(Array.isArray(errors));
    assert.ok(errors.some((e) => typeof e === "string" && e.includes("ghostco/fp8")));
    // No write: the lock file is byte-identical.
    assert.equal(readFileSync(lockPath, "utf8"), before);
  } finally {
    server.close();
  }
});

test("explain returns the automatic pin only when preferOwnProvider is on and no manual pin", async () => {
  const handle = await bootWithState(() => ({ rank: PIN_RANK, roles: DEFAULT_ROLES, universe: {}, defaults: DEFAULT_ROLES, availability: NO_AVAILABILITY, features: {}, selection: NO_SELECTION }));
  try {
    const explain = async (def: unknown): Promise<Record<string, unknown>> => {
      const res = await fetch(`${handle.url}/api/explain`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: "auto", def, modelId: "alpha" }),
      });
      const body: unknown = await res.json();
      assert.ok(isRecord(body));
      return body;
    };
    // preferOwnProvider on, no manual pin: the best route (cheapest by value) is the auto pin.
    const auto = await explain({ ...PIN_DEF, preferOwnProvider: true });
    assert.equal(auto.eligible, true);
    assert.equal(auto.autoPin, "cheapco/fp8");
    // A manual pin overrides the automatic one.
    const manual = await explain({ ...PIN_DEF, preferOwnProvider: true, providerPin: "priceyco/fp8" });
    assert.equal(manual.autoPin, null);
    // The preference off: no automatic pin.
    const off = await explain({ ...PIN_DEF, preferOwnProvider: false });
    assert.equal(off.autoPin, null);
  } finally {
    await handle.close();
  }
});

// ---------------------------------------------------------------------------
// The candidate route (spec #90, ticket #93)
// ---------------------------------------------------------------------------
//
// The explain panel's auto-pin line names the CANDIDATE route — the first route
// the updater's walk tries — not a promise of the written pin: the updater now
// probes that route and may skip to the next one. The panel reads the same route
// order the walk does (`rankedRoutes(model, def)[0]`, surfaced as `autoPin`), and
// these tests pin that cross-module invariant.

/** The value-ordered leader is not the price leader: `fastco` costs 3× `slowco`
 * but is 10× its throughput, so the shipped `default` weights rank it first. The
 * candidate is therefore a specific route, not "the cheapest" — which is what
 * makes the cross-module equality below bite. */
const WALK_MODELS: Model[] = [
  {
    ...makeModel("alpha", 80, 5, 100),
    routes: [endpoint("alpha-fast", "fastco", 3, 200), endpoint("alpha-slow", "slowco", 1, 20), endpoint("alpha-pricey", "priceyco", 9, 100)],
  },
];

/** Opt every shipped role but `default` out, so the run writes one selector. */
const WALK_SETTINGS: Record<string, unknown> = {
  roles: {
    ...Object.fromEntries(["smol", "slow", "vision", "plan", "commit", "tiny", "task", "advisor", "designer"].map((r) => [r, { enabled: false }])),
    default: { preferOwnProvider: true },
  },
};

test("the explorer's autoPin is the route the updater's walk pins when every route probes clean", async () => {
  const dir = setupAgentDir("other: 1\n");
  const deps = fakeDeps(WALK_MODELS, WALK_SETTINGS);
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  assert.equal(result.aborted, undefined);
  // The def the updater resolves and walks with, so both sides read the engine's
  // own definition rather than a re-derived one that could drift.
  const { settings, errors } = resolveSettings(WALK_SETTINGS);
  assert.deepEqual(errors, []);
  const def = settings.roles.default;
  // Parsed config: the updater's written modelRoles, the observable result.
  const written = parseYaml(readFileSync(join(dir, "config.yml"), "utf8")) as { modelRoles: Record<string, string> };
  const selector = written.modelRoles.default;
  // The pin comes from the module that owns the trailing `@<slug>` parse; the
  // catalog id is the selector between `openrouter/` and that `@`.
  const slug = providerPinOfSelector(selector);
  assert.equal(slug, "fastco"); // the value leader, not the cheapest route
  const catalogId = selector.slice("openrouter/".length, selector.indexOf("@"));
  const ex = explainModel(def, WALK_MODELS, catalogId.slice(catalogId.lastIndexOf("/") + 1));
  assert.ok(ex.eligible);
  // The cross-module invariant (spec #90): probe clean everywhere, so the walk
  // pins its first candidate — exactly the route the panel names.
  assert.equal(ex.autoPin, slug);

  // Sensitivity: the fixture's candidate is not the price leader, so an
  // implementation reading any other ordering fails the equality above instead
  // of passing by coincidence.
  const ranked = rankedRoutes(WALK_MODELS[0], def);
  assert.equal(ranked[0].providerSlug, slug);
  assert.notEqual(slug, "slowco");
});

test("the explorer's autoPin stays the candidate when the walk skips a blocked route", async () => {
  const dir = setupAgentDir("other: 1\n");
  const deps = fakeDeps(WALK_MODELS, WALK_SETTINGS, {
    probeRoute: async (_token: string, _catalogId: string, routeSlug: string): Promise<ProbeVerdict> => (routeSlug === "fastco" ? "blocked" : "ok"),
  });
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  assert.equal(result.aborted, undefined);
  const decision = result.decisions.find((d) => d.role === "default");
  assert.ok(decision);
  assert.deepEqual(decision.routeBlockedSlugs, ["fastco"]);
  assert.equal(decision.pinDropped, false);
  // The walk skipped the blocked candidate and pinned the next route ...
  const written = parseYaml(readFileSync(join(dir, "config.yml"), "utf8")) as { modelRoles: Record<string, string> };
  const slug = providerPinOfSelector(written.modelRoles.default);
  assert.equal(slug, "slowco");
  // ... while the panel keeps naming the candidate: the indicator is not the
  // written pin, which is why it reads as a candidate.
  const { settings } = resolveSettings(WALK_SETTINGS);
  const ex = explainModel(settings.roles.default, WALK_MODELS, "alpha");
  assert.ok(ex.eligible);
  assert.equal(ex.autoPin, "fastco");
  assert.notEqual(ex.autoPin, slug);
});

// ---------------------------------------------------------------------------
// Per-task price (issue #81, ticket #85)
// ---------------------------------------------------------------------------

/** A standard-tier route whose billed price (3:1 blend) and input price differ,
 * so the derived output price `4·price − 3·weightPrice` is a distinct number. */
function pricedRoute(id: string, price: number, weightPrice: number, over: Partial<OpenRouterEndpointRecord> = {}): OpenRouterEndpointRecord {
  return { id, providerSlug: "org", serviceTier: null, status: 0, free: false, variant: "standard", price, weightPrice, cacheReadPrice: null, tput: 100, latency: null, contextLength: 200000, maxCompletionTokens: 100000, supportsTools: true, ...over };
}

// A role that prices on its soft best route (preferOwnProvider), so `roleRoute`
// returns the model's route rather than the 1/price² blend.
const TASK_DEF = { description: "", weights: { general: 0.5, price: 0.5 }, required: ["general", "price"], preferOwnProvider: true };
// Billed $1.75/M, input $1/M → output $4/M (4·1.75 − 3·1).
const TASK_MODEL: Model = { ...makeModel("m", 80, 1.75, 100), routes: [pricedRoute("m-r", 1.75, 1)] };
const PROFILE: TokenProfile = { inputTokens: 1000, outputTokens: 1000 };

test("perTaskPrice: the priced route's input and output prices drive the total", () => {
  const p = perTaskPrice(TASK_MODEL, TASK_DEF, PROFILE);
  assert.ok(p);
  assert.equal(p.inputPrice, 1); // route.weightPrice
  assert.equal(p.outputPrice, 4); // 4·1.75 − 3·1
  assert.equal(p.thinkingFactor, 1); // bare role
  assert.equal(p.total, (1000 * 1 + 1000 * 4) / 1e6); // dollars per task
});

test("perTaskPrice: the output term is scaled by the role's thinking factor", () => {
  // A model that runs at the role's level (supports_reasoning) carries the factor.
  const thinkingModel: Model = { ...makeModel("tm", 80, 1.75, 100, true), routes: [pricedRoute("tm-r", 1.75, 1)] };
  const bare = perTaskPrice(thinkingModel, TASK_DEF, PROFILE);
  const high = perTaskPrice(thinkingModel, { ...TASK_DEF, thinking: "high" }, PROFILE);
  assert.ok(bare && high);
  assert.equal(bare.thinkingFactor, 1);
  assert.equal(high.thinkingFactor, thinkingPriceFactor("high"));
  // Only the output term carries the factor; the input term is untouched.
  assert.equal(high.inputPrice, bare.inputPrice);
  // Worked by hand from the route prices ($1 in, $4 out) and the level's factor
  // 19/7 ((1 + 3·0.25 + 3)/(1 + 3·0.25) for `high`): (1000·1 + 1000·4·19/7)/1e6.
  assert.ok(Math.abs(high.total - 83000 / 7 / 1e6) < 1e-12);
});

test("perTaskPrice: the thinking factor is gated on the model running at the level", () => {
  // TASK_MODEL does not support reasoning, so the role's level is inert for it —
  // the same gating the ranking applies (thinkingAdjustedPrice).
  const gated = perTaskPrice(TASK_MODEL, { ...TASK_DEF, thinking: "high" }, PROFILE);
  const bare = perTaskPrice(TASK_MODEL, TASK_DEF, PROFILE);
  assert.ok(gated && bare);
  assert.equal(gated.thinkingFactor, 1);
  assert.equal(gated.total, bare.total);
  // A model that runs at the level gets the factor.
  const thinkingModel: Model = { ...makeModel("tm", 80, 1.75, 100, true), routes: [pricedRoute("tm-r", 1.75, 1)] };
  const scaled = perTaskPrice(thinkingModel, { ...TASK_DEF, thinking: "high" }, PROFILE);
  assert.ok(scaled);
  assert.equal(scaled.thinkingFactor, thinkingPriceFactor("high"));
});

test("perTaskPrice: the total reflects the role's token profile", () => {
  const small = perTaskPrice(TASK_MODEL, TASK_DEF, { inputTokens: 1000, outputTokens: 1000 });
  const big = perTaskPrice(TASK_MODEL, TASK_DEF, { inputTokens: 10000, outputTokens: 2000 });
  assert.ok(small && big);
  assert.equal(big.total, (10000 * 1 + 2000 * 4) / 1e6);
  assert.ok(big.total > small.total);
});

test("perTaskPrice: the role's cache-hit rate blends the cache-read price into the input term", () => {
  const model: Model = { ...makeModel("c", 80, 1.75, 100), routes: [pricedRoute("c-r", 1.75, 1, { cacheReadPrice: 0.1 })] };
  const p = perTaskPrice(model, { ...TASK_DEF, cacheHitRate: 0.5 }, PROFILE);
  assert.ok(p);
  // effInput = 0.5·0.1 + 0.5·1 = 0.55; blend = 1.75 + 3·(0.55 − 1)/4 = 1.4125.
  assert.ok(Math.abs(p.inputPrice - 0.55) < 1e-9);
  assert.ok(Math.abs(p.outputPrice - 4) < 1e-9); // the route's own output price
});

test("perTaskPrice: the 1/price² blend case uses the model's blended input and billed prices", () => {
  // No pin, no preferOwnProvider: `roleRoute` is null, so the blend stands in.
  const def = { description: "", weights: { general: 0.5, price: 0.5 }, required: ["general", "price"] };
  const model: Model = { ...makeModel("blend", 80, 2, 100), routes: [pricedRoute("a", 1.75, 1), pricedRoute("b", 3.5, 2)] };
  const p = perTaskPrice(model, def, PROFILE);
  assert.ok(p);
  // 1/weightPrice² weights 1 and 0.25 → input blend (1·1 + 0.25·2)/1.25 = 1.2.
  assert.ok(Math.abs(p.inputPrice - 1.2) < 1e-9);
  // The billed blend is the model's own price (2), so output = 4·2 − 3·1.2 = 4.4.
  assert.ok(Math.abs(p.outputPrice - 4.4) < 1e-9);
});

test("perTaskPrice: the blend case uses the role's endpoint-filtered blend", () => {
  // A role with an endpoint filter but no pin/preference prices on the filtered
  // blend; the per-task price must use the same basis in the table and the panel.
  const def = { description: "", weights: { general: 0.5, price: 0.5 }, required: ["general", "price"], filters: { tools: true } };
  const model: Model = { ...makeModel("f", 80, 2, 100), routes: [pricedRoute("a", 1.75, 1, { supportsTools: true }), pricedRoute("b", 3.5, 2, { supportsTools: false })] };
  const p = perTaskPrice(model, def, PROFILE);
  assert.ok(p);
  // Only route a survives the tools filter, so both terms come from it: billed
  // $1.75, input $1 → output $4 (4·1.75 − 3·1). The unfiltered pool's input blend
  // ((1·1 + 0.25·2)/1.25 = $1.2) belongs to no route's output price.
  assert.equal(p.inputPrice, 1);
  assert.equal(p.outputPrice, 4);
  const rows = rankRows(def, [model], rankRole(def, [model]), undefined, PROFILE);
  const ex = explainModel(def, [model], "f", "f", undefined, PROFILE);
  if (!ex.eligible) throw new Error("unexpected ineligible");
  assert.equal(rows[0].perTask, ex.perTask?.total);
});

test("perTaskPrice: the blend case takes p_in from the routes that survive the filters", () => {
  // The filter drops the CHEAP route, so the surviving pool is route b alone:
  // p_in is its $2 input price and p_out its $8 output price (4·3.5 − 3·2), not
  // the unfiltered 1/price² input blend (1.2) the buggy basis mixed in.
  const def = { description: "", weights: { general: 0.5, price: 0.5 }, required: ["general", "price"], filters: { tools: true } };
  const model: Model = { ...makeModel("fc", 80, 3.5, 100), routes: [pricedRoute("a", 1.75, 1, { supportsTools: false }), pricedRoute("b", 3.5, 2, { supportsTools: true })] };
  const p = perTaskPrice(model, def, PROFILE);
  assert.ok(p);
  assert.equal(p.inputPrice, 2);
  assert.equal(p.outputPrice, 8);
  assert.equal(p.total, 0.01); // (1000·$2 + 1000·$8) per 1e6
});

test("perTaskPrice: a model whose every route fails the role's filters is absent", () => {
  const def = { description: "", weights: { general: 0.5, price: 0.5 }, required: ["general", "price"], filters: { tools: true } };
  const model: Model = { ...makeModel("nf", 80, 2, 100), routes: [pricedRoute("a", 1.75, 1, { supportsTools: false })] };
  assert.equal(perTaskPrice(model, def, PROFILE), null);
});

test("perTaskPrice: the blend case cache-adjusts the input term too", () => {
  // A blend-case role with a cache-hit rate: the billed blend and the input blend
  // must both carry the cache adjustment, so p_out is the routes' output price.
  const def = { description: "", weights: { general: 0.5, price: 0.5 }, required: ["general", "price"], cacheHitRate: 0.5 };
  const model: Model = { ...makeModel("bc", 80, 1.4125, 100), routes: [pricedRoute("a", 1.75, 1, { cacheReadPrice: 0.1 })] };
  const p = perTaskPrice(model, def, PROFILE);
  assert.ok(p);
  // effInput = 0.5·0.1 + 0.5·1 = 0.55; blend = 1.75 + 3·(0.55 − 1)/4 = 1.4125.
  assert.ok(Math.abs(p.inputPrice - 0.55) < 1e-9);
  assert.ok(Math.abs(p.outputPrice - 4) < 1e-9); // the route's output price
});

test("perTaskPrice: no usable route price is absent, never zero", () => {
  // No routes at all: the blend case has no input price to derive from.
  assert.equal(perTaskPrice(makeModel("bare", 80, 1, 100), TASK_DEF, PROFILE), null);
  // A pinned route with no billed price: the route case has no blend.
  const noPrice: Model = { ...makeModel("np", 80, 1, 100), routes: [pricedRoute("np-r", 1, 1, { price: null })] };
  assert.equal(perTaskPrice(noPrice, { ...TASK_DEF, providerPin: "org" }, PROFILE), null);
  // A pinned route with no input price.
  const noInput: Model = { ...makeModel("ni", 80, 1, 100), routes: [pricedRoute("ni-r", 1, 1, { weightPrice: null })] };
  assert.equal(perTaskPrice(noInput, { ...TASK_DEF, providerPin: "org" }, PROFILE), null);
});

test("rankRows and explainModel carry the per-task price when a profile is given", () => {
  const models: Model[] = [TASK_MODEL, { ...makeModel("cheap", 60, 0.5, 200), routes: [pricedRoute("cheap-r", 0.5, 0.5)] }];
  const baseline = rankRole(TASK_DEF, models);
  const rows = rankRows(TASK_DEF, models, baseline, undefined, PROFILE);
  for (const row of rows) assert.equal(typeof row.perTask, "number");
  const m = rows.find((r) => r.id === "m");
  assert.ok(m);
  assert.equal(m.perTask, (1000 * 1 + 1000 * 4) / 1e6);

  const ex = explainModel(TASK_DEF, models, "m", "task", undefined, PROFILE);
  if (!ex.eligible) throw new Error(`unexpected ineligible: ${ex.reasons.join(", ")}`);
  assert.ok(ex.perTask);
  assert.equal(ex.perTask.total, m.perTask);
  assert.equal(ex.perTask.inputPrice, 1);
  assert.equal(ex.perTask.outputPrice, 4);
});

test("rankRows and explainModel omit the per-task price without a profile", () => {
  const baseline = rankRole(TASK_DEF, [TASK_MODEL]);
  assert.equal(rankRows(TASK_DEF, [TASK_MODEL], baseline)[0].perTask, null);
  assert.equal(rankRows(TASK_DEF, [TASK_MODEL], baseline, undefined, null)[0].perTask, null);
  const ex = explainModel(TASK_DEF, [TASK_MODEL], "m", "task");
  if (!ex.eligible) throw new Error("unexpected ineligible");
  assert.equal(ex.perTask, null);
});

test("the per-task price never changes the ranking", () => {
  const models: Model[] = [TASK_MODEL, { ...makeModel("cheap", 60, 0.5, 200), routes: [pricedRoute("cheap-r", 0.5, 0.5)] }];
  const baseline = rankRole(TASK_DEF, models);
  const plain = rankRows(TASK_DEF, models, baseline);
  const withProfile = rankRows(TASK_DEF, models, baseline, undefined, PROFILE);
  assert.deepEqual(withProfile.map((r) => r.id), plain.map((r) => r.id));
  for (let i = 0; i < plain.length; i++) {
    assert.equal(withProfile[i].value, plain[i].value);
    assert.equal(withProfile[i].q, plain[i].q);
    assert.equal(withProfile[i].priceEff, plain[i].priceEff);
    assert.equal(withProfile[i].rank, plain[i].rank);
  }
});

// ---------------------------------------------------------------------------
// The HTTP surface (spec #81): the pool toggle, the per-task price column, and
// the two price-lever readouts.
// ---------------------------------------------------------------------------

/** POST a JSON body to the explorer API and read the JSON reply. */
async function postJson(url: string, path: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${url}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed: unknown = await res.json();
  if (!isRecord(parsed)) throw new Error(`${path} did not return a JSON object`);
  return { status: res.status, body: parsed };
}

async function getJson(url: string, path: string): Promise<Record<string, unknown>> {
  const parsed: unknown = await (await fetch(`${url}${path}`)).json();
  if (!isRecord(parsed)) throw new Error(`${path} did not return a JSON object`);
  return parsed;
}

/** The rank rows' model ids, in ranking order. */
function rowIds(body: Record<string, unknown>): string[] {
  const rows = body.rows;
  if (!Array.isArray(rows)) throw new Error("no rows in the rank response");
  return rows.map((r) => {
    if (!isRecord(r) || typeof r.id !== "string") throw new Error("malformed rank row");
    return r.id;
  });
}

/** The rank row for `id`, or a thrown error naming the response. */
function rowOf(body: Record<string, unknown>, id: string): Record<string, unknown> {
  const rows = body.rows;
  if (!Array.isArray(rows)) throw new Error("no rows in the rank response");
  const row = rows.find((r) => isRecord(r) && r.id === id);
  if (!isRecord(row)) throw new Error(`no rank row for ${id}`);
  return row;
}

/** The state the pool tests serve: the pin fixtures, the same for every scope. */
const PIN_STATE = { rank: PIN_RANK, roles: DEFAULT_ROLES, universe: {}, defaults: DEFAULT_ROLES, availability: NO_AVAILABILITY, features: {}, selection: NO_SELECTION };

/** `value` as a number, or a thrown error naming the field. */
function numOf(value: unknown, label: string): number {
  if (typeof value !== "number") throw new Error(`${label} is not a number`);
  return value;
}

test("POST /api/pool switches the ranked pool and the bootstrap payload reports it", async () => {
  const handle = await bootWithState(
    () => PIN_STATE,
    // Only alpha is tier-eligible, so the as-written gate drops beta.
    { getPoolInputs: () => ({ catalog: makeCatalog(["alpha"]), tier: "billed", allowed: null, availability: NO_AVAILABILITY }) },
  );
  try {
    const before = await getJson(handle.url, "/api/bootstrap");
    assert.equal(before.poolMode, "raw");
    assert.equal(before.modelCount, 2);
    // On the raw pool beta is a cheaper challenger, so the flip readout exists.
    const rawFlip = (await postJson(handle.url, "/api/explain", { role: "tiny", def: TINY, modelId: "alpha" })).body.leaderFlip;
    assert.ok(isRecord(rawFlip));
    const rawChallenger = rawFlip.challenger;
    assert.ok(isRecord(rawChallenger));
    assert.equal(rawChallenger.id, "beta");

    const switched = await postJson(handle.url, "/api/pool", { mode: "as-written" });
    assert.equal(switched.status, 200);
    assert.equal(switched.body.poolMode, "as-written");
    assert.equal(switched.body.modelCount, 1);

    // Rank and explain both rank the gated dataset …
    assert.deepEqual(rowIds((await postJson(handle.url, "/api/rank", { role: "tiny", def: TINY })).body), ["alpha"]);
    assert.equal((await postJson(handle.url, "/api/explain", { role: "tiny", def: TINY, modelId: "beta" })).body.eligible, false);
    // … and the role-level readouts follow the same pool: with beta gone, alpha
    // has no cheaper challenger, so the flip is absent rather than invented.
    assert.equal((await postJson(handle.url, "/api/explain", { role: "tiny", def: TINY, modelId: "alpha" })).body.leaderFlip, null);

    // The mode survives a refresh.
    const refreshed = await postJson(handle.url, "/api/refresh", {});
    assert.equal(refreshed.body.poolMode, "as-written");
    assert.equal(refreshed.body.modelCount, 1);

    // A bad body is rejected and does not switch.
    const bad = await postJson(handle.url, "/api/pool", { mode: "gated" });
    assert.equal(bad.status, 400);
    assert.equal((await getJson(handle.url, "/api/bootstrap")).poolMode, "as-written");

    // Back to raw: the full dataset again.
    const back = await postJson(handle.url, "/api/pool", { mode: "raw" });
    assert.equal(back.body.modelCount, 2);
    assert.deepEqual(rowIds((await postJson(handle.url, "/api/rank", { role: "tiny", def: TINY })).body).sort(), ["alpha", "beta"]);
  } finally {
    await handle.close();
  }
});

test("the as-written pool prunes the routes the account cannot use", async () => {
  const def = { ...PIN_DEF, preferOwnProvider: true };
  const handle = await bootWithState(
    () => PIN_STATE,
    // The account may only use priceyco, so alpha's cheap route must not lower
    // the price the explorer shows.
    { getPoolInputs: () => ({ catalog: makeCatalog(["alpha", "beta"]), tier: "billed", allowed: new Set(["priceyco/fp8"]), availability: NO_AVAILABILITY }) },
  );
  const priceEffOf = async (id: string): Promise<unknown> => rowOf((await postJson(handle.url, "/api/rank", { role: "tiny", def })).body, id).priceEff;
  try {
    assert.equal(await priceEffOf("alpha"), 1);
    await postJson(handle.url, "/api/pool", { mode: "as-written" });
    assert.equal(await priceEffOf("alpha"), 9);
  } finally {
    await handle.close();
  }
});

test("a null whitelist degrades the as-written pool to the raw dataset", async () => {
  const def = { ...PIN_DEF, preferOwnProvider: true };
  const handle = await bootWithState(
    () => PIN_STATE,
    // The catalog covers both models (so the tier gate drops nothing) and the
    // whitelist harvest failed: no route is pruned.
    { getPoolInputs: () => ({ catalog: makeCatalog(["alpha", "beta"]), tier: "billed", allowed: null, availability: NO_AVAILABILITY }) },
  );
  try {
    await postJson(handle.url, "/api/pool", { mode: "as-written" });
    assert.equal((await getJson(handle.url, "/api/bootstrap")).modelCount, 2);
    const body = (await postJson(handle.url, "/api/rank", { role: "tiny", def })).body;
    assert.equal(rowOf(body, "alpha").priceEff, 1);
  } finally {
    await handle.close();
  }
});

test("Export is unaffected by the pool mode", async () => {
  // `beta`'s only route is outside the account's whitelist, so the as-written
  // pool holds no route matching the pin below — the raw dataset still does.
  const models: Model[] = [
    { ...makeModel("alpha", 80, 5, 100), routes: [endpoint("alpha-cheap", "cheapco/fp8", 1, 100)] },
    { ...makeModel("beta", 60, 3, 100), routes: [endpoint("beta-excl", "exclusiveco/fp8", 2, 100)] },
  ];
  const rank: RankData = { models, fetchedAt: "2026-10-09T00:00:00.000Z", source: "test", orMatched: 2, orPriced: 2 };
  const handle = await bootWithState(
    () => ({ rank, roles: DEFAULT_ROLES, universe: {}, defaults: DEFAULT_ROLES, availability: NO_AVAILABILITY, features: {}, selection: NO_SELECTION }),
    { getPoolInputs: () => ({ catalog: makeCatalog(["alpha", "beta"]), tier: "billed", allowed: new Set(["cheapco/fp8"]), availability: NO_AVAILABILITY }) },
  );
  try {
    await postJson(handle.url, "/api/pool", { mode: "as-written" });
    const exported = await postJson(handle.url, "/api/export", { roles: { pinned: { ...PIN_DEF, providerPin: "exclusiveco/fp8" } } });
    assert.equal(exported.body.ok, true);
    // The pool mode is untouched by the write.
    assert.equal((await getJson(handle.url, "/api/bootstrap")).poolMode, "as-written");
  } finally {
    await handle.close();
  }
});

// Two turns for role `tiny`: the median per-turn counts are 2000 in / 500 out.
const USAGE_ROWS: UsageRow[] = [
  { ts: "2026-10-18T10:00:00.000Z", role: "tiny", model: "m", provider: "openrouter", input: 1000, output: 100, cacheRead: 0, cacheWrite: 0, cost: 0.001 },
  { ts: "2026-10-18T11:00:00.000Z", role: "tiny", model: "m", provider: "openrouter", input: 3000, output: 900, cacheRead: 0, cacheWrite: 0, cost: 0.003 },
];
const TASK_RANK: RankData = { models: [TASK_MODEL], fetchedAt: "2026-10-09T00:00:00.000Z", source: "test", orMatched: 1, orPriced: 1 };

test("the rank and explain responses carry the per-task price from the recorded usage, then the setting", async () => {
  const handle = await bootWithState(
    () => ({ rank: TASK_RANK, roles: DEFAULT_ROLES, universe: {}, defaults: DEFAULT_ROLES, availability: NO_AVAILABILITY, features: {}, selection: NO_SELECTION }),
    { getUsageRows: () => USAGE_ROWS, tokenProfile: { inputTokens: 1000, outputTokens: 1000 } },
  );
  try {
    // TASK_MODEL's priced route: $1/M in, $1.75/M billed → $4/M out.
    // `tiny` has recorded usage, so its median per-turn counts win over the setting.
    const tiny = await postJson(handle.url, "/api/rank", { role: "tiny", def: TASK_DEF });
    assert.ok(Math.abs(numOf(rowOf(tiny.body, "m").perTask, "perTask") - (2000 * 1 + 500 * 4) / 1e6) < 1e-12);
    // A role with no recorded rows falls back to the setting (1000 in / 1000 out).
    const other = await postJson(handle.url, "/api/rank", { role: "other", def: TASK_DEF });
    assert.ok(Math.abs(numOf(rowOf(other.body, "m").perTask, "perTask") - (1000 * 1 + 1000 * 4) / 1e6) < 1e-12);

    // The explain panel carries the same total with its breakdown.
    const perTask = (await postJson(handle.url, "/api/explain", { role: "tiny", def: TASK_DEF, modelId: "m" })).body.perTask;
    assert.ok(isRecord(perTask));
    assert.equal(perTask.total, rowOf(tiny.body, "m").perTask);
    assert.equal(perTask.inputPrice, 1);
    assert.equal(perTask.outputPrice, 4);
    assert.equal(perTask.thinkingFactor, 1);
    // The bootstrap reports the setting the column falls back to.
    assert.deepEqual((await getJson(handle.url, "/api/bootstrap")).tokenProfile, { inputTokens: 1000, outputTokens: 1000 });
  } finally {
    await handle.close();
  }
});

test("the per-task price is absent when neither recorded usage nor a setting exists", async () => {
  const handle = await bootWithState(() => ({ rank: TASK_RANK, roles: DEFAULT_ROLES, universe: {}, defaults: DEFAULT_ROLES, availability: NO_AVAILABILITY, features: {}, selection: NO_SELECTION }));
  try {
    const ranked = await postJson(handle.url, "/api/rank", { role: "tiny", def: TASK_DEF });
    assert.equal(rowOf(ranked.body, "m").perTask, null);
    assert.equal((await postJson(handle.url, "/api/explain", { role: "tiny", def: TASK_DEF, modelId: "m" })).body.perTask, null);
    assert.equal((await getJson(handle.url, "/api/bootstrap")).tokenProfile, null);
  } finally {
    await handle.close();
  }
});

// `alpha` out-values `beta` on quality; `beta` is the cheaper challenger.
const FLIP_MODELS: Model[] = [makeModel("alpha", 90, 10, 100), makeModel("beta", 70, 1, 100)];
const FLIP_DEF = { description: "", weights: { general: 0.8, price: 0.2 }, required: ["general", "price"] };

test("the explain response carries the leader-flip and thinking-level readouts", async () => {
  const rank: RankData = { models: FLIP_MODELS, fetchedAt: "2026-10-09T00:00:00.000Z", source: "test", orMatched: 2, orPriced: 2 };
  const handle = await bootWithState(() => ({ rank, roles: DEFAULT_ROLES, universe: {}, defaults: DEFAULT_ROLES, availability: NO_AVAILABILITY, features: {}, selection: NO_SELECTION }));
  try {
    // λ = 0.2/0.8/20 = 0.0125; q(alpha) = (90+20)/80 = 1.375, q(beta) = 1.125.
    // The cheaper challenger flips at λ* = (1.375−1.125)/(10−1), i.e. w* = 5/14.
    const flip = (await postJson(handle.url, "/api/explain", { role: "flip", def: FLIP_DEF, modelId: "alpha" })).body.leaderFlip;
    assert.ok(isRecord(flip));
    assert.equal(flip.wPrice, 0.2);
    assert.ok(Math.abs(numOf(flip.flipW, "flipW") - 5 / 14) < 1e-12);
    assert.ok(Math.abs(numOf(flip.distance, "distance") - (5 / 14 - 0.2)) < 1e-12);
    const challenger = flip.challenger;
    assert.ok(isRecord(challenger));
    assert.equal(challenger.id, "beta");
    assert.equal(challenger.priceEff, 1);

    // A bare role has no thinking level: the readout is inert.
    assert.equal((await postJson(handle.url, "/api/explain", { role: "flip", def: FLIP_DEF, modelId: "alpha" })).body.thinkingLevels, null);

    // A role that runs at a level reports every level's factor and leader, and the
    // leader agrees with the ranking above it (same pool, same level).
    const def = { ...FLIP_DEF, thinking: "high" };
    const levels = (await postJson(handle.url, "/api/explain", { role: "flip", def, modelId: "alpha" })).body.thinkingLevels;
    assert.ok(Array.isArray(levels));
    assert.equal(levels.length, Object.keys(SUFFIX_LEVELS).length);
    const high = levels.find((l) => isRecord(l) && l.level === "high");
    assert.ok(isRecord(high));
    assert.equal(high.factor, thinkingPriceFactor("high"));
    assert.ok(isRecord(high.leader));
    assert.equal(high.leader.id, rowIds((await postJson(handle.url, "/api/rank", { role: "flip", def })).body)[0]);

    // No cheaper challenger: the readout is absent, never invented.
    const bestIsCheapest: Model[] = [makeModel("best", 90, 1, 100), makeModel("worse", 50, 10, 100)];
    const noFlip = await bootWithState(() => ({ rank: { ...rank, models: bestIsCheapest }, roles: DEFAULT_ROLES, universe: {}, defaults: DEFAULT_ROLES, availability: NO_AVAILABILITY, features: {}, selection: NO_SELECTION }));
    try {
      assert.equal((await postJson(noFlip.url, "/api/explain", { role: "flip", def: FLIP_DEF, modelId: "best" })).body.leaderFlip, null);
    } finally {
      await noFlip.close();
    }
  } finally {
    await handle.close();
  }
});

// ---------------------------------------------------------------------------
// Selection: the prospective pick, the bar, and the excluded rows (issue #107)
// ---------------------------------------------------------------------------

// `premium` is the quality anchor (q 1.375) and `budget` the cheap challenger
// (q 1.0). A half-price role makes `budget` the value leader while `premium`
// stays the anchor, so the two modes mark different rows.
const HALF_DEF = { description: "", weights: { general: 0.5, price: 0.5 }, required: ["general", "price"] };

/** Boot a single-scope explorer whose scope-global selection is `selection`. */
async function bootWithSelection(selection: { mode: string; qualityFloor: number }): Promise<{ url: string; close: () => Promise<void> }> {
  const rank: RankData = { models: MODELS, fetchedAt: "2026-10-20T00:00:00.000Z", source: "test", orMatched: 2, orPriced: 2 };
  return bootWithState(() => ({ rank, roles: DEFAULT_ROLES, universe: {}, defaults: DEFAULT_ROLES, availability: NO_AVAILABILITY, features: {}, selection }));
}

test("the role payload names the prospective pick and the bar in cheapest mode", async () => {
  const handle = await bootWithSelection({ mode: "cheapest", qualityFloor: 0.9 });
  try {
    const { body } = await postJson(handle.url, "/api/rank", { role: "tiny", def: HALF_DEF });
    const selection = body.selection;
    assert.ok(isRecord(selection));
    assert.equal(selection.mode, "cheapest");
    assert.equal(selection.floor, 0.9);
    // The anchor is the highest-q model, not the value leader.
    assert.equal(selection.anchor, "premium");
    assert.equal(selection.anchorQ, 1.375);
    assert.equal(selection.bar, 0.9 * 1.375);
    // Only the anchor clears the bar, so the pick is the anchor.
    assert.equal(selection.pick, "premium");
    // The rows carry the same verdict: `budget` (q 1.0) sits under the bar.
    assert.equal(rowOf(body, "premium").excludedByBar, false);
    assert.equal(rowOf(body, "budget").excludedByBar, true);
  } finally {
    await handle.close();
  }
});

test("a lower floor admits the cheap challenger and the pick follows it", async () => {
  const handle = await bootWithSelection({ mode: "cheapest", qualityFloor: 0.5 });
  try {
    const { body } = await postJson(handle.url, "/api/rank", { role: "tiny", def: HALF_DEF });
    const selection = body.selection;
    assert.ok(isRecord(selection));
    assert.equal(selection.bar, 0.5 * 1.375);
    // Both clear the bar, so the cheapest good candidate wins.
    assert.equal(selection.pick, "budget");
    assert.equal(rowOf(body, "budget").excludedByBar, false);
    assert.equal(rowOf(body, "premium").excludedByBar, false);
  } finally {
    await handle.close();
  }
});

test("value mode has no bar, flags no row, and marks the value leader", async () => {
  const handle = await bootWithSelection({ mode: "value", qualityFloor: 0.9 });
  try {
    const { body } = await postJson(handle.url, "/api/rank", { role: "tiny", def: HALF_DEF });
    const selection = body.selection;
    assert.ok(isRecord(selection));
    assert.equal(selection.mode, "value");
    assert.equal(selection.bar, null);
    // No bar, so the pick is the value leader: `budget` (value 0.975), not
    // `premium` (the highest-q model, q 1.375 vs 1.0).
    assert.equal(selection.pick, "budget");
    // The anchor is the highest-q model in either mode — a quality statement,
    // not a price one — so it is `premium`, not the value leader.
    assert.equal(selection.anchor, "premium");
    assert.equal(selection.anchorQ, 1.375);
    const rows = body.rows;
    assert.ok(Array.isArray(rows));
    for (const row of rows) {
      assert.ok(isRecord(row));
      assert.equal(row.excludedByBar, false);
    }
  } finally {
    await handle.close();
  }
});

test("a per-role selection and qualityFloor beat the scope's global", async () => {
  // Global value mode; the posted def asks for cheapest at a floor that admits
  // the cheap challenger.
  const handle = await bootWithSelection({ mode: "value", qualityFloor: 0.9 });
  try {
    const { body } = await postJson(handle.url, "/api/rank", { role: "tiny", def: { ...HALF_DEF, selection: "cheapest", qualityFloor: 0.5 } });
    const selection = body.selection;
    assert.ok(isRecord(selection));
    assert.equal(selection.mode, "cheapest");
    assert.equal(selection.floor, 0.5);
    assert.equal(selection.bar, 0.5 * 1.375);
    assert.equal(selection.pick, "budget");
  } finally {
    await handle.close();
  }
});

test("a per-role value selection beats a global cheapest mode", async () => {
  const handle = await bootWithSelection({ mode: "cheapest", qualityFloor: 0.9 });
  try {
    const { body } = await postJson(handle.url, "/api/rank", { role: "tiny", def: { ...HALF_DEF, selection: "value" } });
    const selection = body.selection;
    assert.ok(isRecord(selection));
    assert.equal(selection.mode, "value");
    assert.equal(selection.bar, null);
    assert.equal(selection.pick, "budget");
    // No per-role floor: the scope's global is the effective one.
    assert.equal(selection.floor, 0.9);
  } finally {
    await handle.close();
  }
});

test("an empty ranked pool has no pick, no anchor, and no bar", async () => {
  const handle = await bootWithSelection({ mode: "cheapest", qualityFloor: 0.9 });
  try {
    // The price cap drops every fixture model.
    const { body } = await postJson(handle.url, "/api/rank", { role: "tiny", def: { ...HALF_DEF, filters: { maxPriceUsdPerM: 0.1 } } });
    assert.deepEqual(rowIds(body), []);
    const selection = body.selection;
    assert.ok(isRecord(selection));
    assert.equal(selection.pick, "");
    assert.equal(selection.anchor, "");
    assert.equal(selection.anchorQ, 0);
    assert.equal(selection.bar, null);
  } finally {
    await handle.close();
  }
});

test("the bootstrap payload carries the scope's global selection", async () => {
  const handle = await bootWithSelection({ mode: "cheapest", qualityFloor: 0.75 });
  try {
    const boot = await getJson(handle.url, "/api/bootstrap");
    assert.deepEqual(boot.selection, { mode: "cheapest", qualityFloor: 0.75 });
  } finally {
    await handle.close();
  }
});
