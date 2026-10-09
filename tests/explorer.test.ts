import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { type KeyAvailability } from "../src/availability.ts";
import { cardinalMetric, rankRole, type Model, type OpenRouterEndpointRecord, type RankData } from "../src/engine.ts";
import { startExplorer } from "../src/explorer/boot.ts";
import { explainModel, inverseCardinal, METRIC_META, rankRows } from "../src/explorer/explain.ts";
import { createExplorerServer, type ExplorerOpts } from "../src/explorer/server.ts";
import { readScopeRoles, type Scope } from "../src/explorer/scopes.ts";
import { isRecord } from "../src/guards.ts";
import { mergeExport, removeRoleSettings, validateRole, writeRoleSettings } from "../src/role-settings.ts";
import { DEFAULT_ROLES, KNOWN_METRICS, readPluginSettingsMap, resolveSettings } from "../src/settings.ts";
import { makeModel } from "./helpers.ts";

/** A single-scope (user-level) explorer server over a temp lock file. */
function userScopeOpts(lockPath: string, getState: ExplorerOpts["getState"]): ExplorerOpts {
  const scope: Scope = { id: "user", label: "user-level", kind: "user", lockPath, present: true };
  return {
    webDir: join(process.cwd(), "web"),
    listScopes: () => [scope],
    resolveScope: () => scope,
    getState,
    refresh: async () => {},
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
  const server = createExplorerServer(userScopeOpts(lockPath, () => ({ rank, roles: DEFAULT_ROLES, universe: {}, defaults: DEFAULT_ROLES, availability: NO_AVAILABILITY, features: {} })));
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
  const server = createExplorerServer(userScopeOpts(lockPath, () => ({ rank, roles: DEFAULT_ROLES, universe: {}, defaults: DEFAULT_ROLES, availability: NO_AVAILABILITY, features: {} })));
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
  const server = createExplorerServer(userScopeOpts(lockPath, () => ({ rank, roles: DEFAULT_ROLES, universe: {}, defaults: DEFAULT_ROLES, availability, features: {} })));
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
async function bootWithState(getState: ExplorerOpts["getState"]): Promise<{ url: string; close: () => Promise<void> }> {
  const dir = mkdtempSync(join(tmpdir(), "explorer-features-"));
  const lockPath = join(dir, "omp-plugins.lock.json");
  writeFileSync(lockPath, JSON.stringify({ plugins: { "omp-llm-role": { enabled: true } }, settings: {} }, null, 2));
  const server = createExplorerServer(userScopeOpts(lockPath, getState));
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
  const handle = await bootWithState(() => ({ rank, roles: { ...DEFAULT_ROLES, tiny: TINY }, universe: {}, defaults: DEFAULT_ROLES, availability: NO_AVAILABILITY, features: {} }));
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
  const handle = await bootWithState(() => ({ rank, roles: DEFAULT_ROLES, universe: {}, defaults: DEFAULT_ROLES, availability: NO_AVAILABILITY, features: { cachePricing: true } }));
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
    assert.deepEqual(registry.find((f) => f.id === "providerPinning")?.recommended, { preferOwnProvider: true });
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
  const handle = await bootWithState(() => ({ rank: PIN_RANK, roles: DEFAULT_ROLES, universe: {}, defaults: DEFAULT_ROLES, availability: NO_AVAILABILITY, features: {} }));
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
  const server = createExplorerServer(userScopeOpts(lockPath, () => ({ rank: PIN_RANK, roles: DEFAULT_ROLES, universe: {}, defaults: DEFAULT_ROLES, availability: NO_AVAILABILITY, features: {} })));
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
  const server = createExplorerServer(userScopeOpts(lockPath, () => ({ rank: PIN_RANK, roles: DEFAULT_ROLES, universe: {}, defaults: DEFAULT_ROLES, availability: NO_AVAILABILITY, features: {} })));
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
  const handle = await bootWithState(() => ({ rank: PIN_RANK, roles: DEFAULT_ROLES, universe: {}, defaults: DEFAULT_ROLES, availability: NO_AVAILABILITY, features: {} }));
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
