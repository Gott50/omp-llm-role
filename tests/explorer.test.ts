import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { cardinalMetric, rankRole, type RankData } from "../src/engine.ts";
import { startExplorer } from "../src/explorer/boot.ts";
import { inverseCardinal, rankRows } from "../src/explorer/explain.ts";
import { createExplorerServer } from "../src/explorer/server.ts";
import { isRecord } from "../src/guards.ts";
import { mergeExport, validateRole } from "../src/role-settings.ts";
import { DEFAULT_ROLES, readPluginSettingsMap, resolveSettings } from "../src/settings.ts";
import { makeModel } from "./helpers.ts";

// premium dominates budget on quality but is far more expensive and slower, so a
// quality-heavy role ranks premium first and a price/throughput-heavy role flips it.
const MODELS = [makeModel("premium", 90, 20, 50), makeModel("budget", 60, 0.5, 200)];
const TINY = { description: "", weights: { price: 0.4, throughput: 0.35, general: 0.25 }, required: ["general", "price", "throughput"] };

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
  // makeModel leaves `math` null; slow weights it, so every row reports it missing.
  const rows = rankRows(DEFAULT_ROLES.slow, MODELS, []);
  assert.deepEqual(rows[0].missing, ["math"]);
  assert.equal(rows[0].baselineRank, null);
  assert.equal(rows[0].delta, null);
});

test("inverseCardinal round-trips cardinalMetric and rejects clamped targets", () => {
  const cases: Array<[string, number]> = [
    ["general", 0.3],
    ["general", 0.9],
    ["mrcr", 0.5],
    ["throughput", 0.25],
    ["throughput", 0.75],
  ];
  for (const [metric, t] of cases) {
    const raw = inverseCardinal(metric, t);
    assert.ok(raw !== null, `${metric}@${t} should be reachable`);
    assert.ok(Math.abs(cardinalMetric(metric, raw) - t) < 1e-12);
  }
  assert.equal(inverseCardinal("throughput", 1.4), null);
});

test("validateRole surfaces the plugin's own validation errors", () => {
  const badSum = validateRole("custom", { description: "", weights: { general: 0.7, price: 0.6 }, required: [] });
  assert.ok(badSum.some((e) => e.includes("weights sum")));

  const unknown = validateRole("custom", { description: "", weights: { gpqa: 0.5, price: 0.5 }, required: [] });
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
    settings: { "omp-llm-role": { switchMargin: number; roles: Record<string, { weights: Record<string, number> }> } };
  };
  assert.deepEqual(lock.plugins, existing.plugins);
  assert.equal(lock.settings["omp-llm-role"].switchMargin, 0.5);
  assert.deepEqual(lock.settings["omp-llm-role"].roles.slow.weights, DEFAULT_ROLES.slow.weights);
  // The input is cloned, never mutated.
  assert.equal((existing.settings["omp-llm-role"] as Record<string, unknown>).roles, undefined);
});

test("export writes the lock file with a backup and stays valid", async () => {
  const dir = mkdtempSync(join(tmpdir(), "explorer-test-"));
  const lockPath = join(dir, "omp-plugins.lock.json");
  const seed = { plugins: { "omp-llm-role": { enabled: true } }, settings: {} };
  writeFileSync(lockPath, JSON.stringify(seed, null, 2));

  const rank: RankData = { models: MODELS, fetchedAt: "2026-09-26T00:00:00.000Z", source: "test", orMatched: 2, orPriced: 2 };
  const server = createExplorerServer({
    webDir: join(process.cwd(), "web"),
    lockPath,
    getSnapshot: () => ({ rank, roles: DEFAULT_ROLES, defaults: DEFAULT_ROLES }),
    refresh: async () => {},
  });
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
      settings: { "omp-llm-role": { roles: { slow: { weights: Record<string, number> } } } };
    };
    assert.deepEqual(written.plugins, seed.plugins);
    assert.equal(written.settings["omp-llm-role"].roles.slow.weights.general, base.general + 0.02);
    assert.equal(written.settings["omp-llm-role"].roles.slow.weights.code, base.code - 0.02);

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
  const server = createExplorerServer({
    webDir: join(process.cwd(), "web"),
    lockPath,
    getSnapshot: () => ({ rank, roles: DEFAULT_ROLES, defaults: DEFAULT_ROLES }),
    refresh: async () => {},
  });
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

// The shared launcher behind both `node explore.ts` and the omp
// `/explore-roles` command: the roles it serves come from the lock file (not
// the shipped defaults), a busy preferred port falls back to a free one, and
// close() releases the port.
test("startExplorer serves lock-file roles and releases its port on close", async () => {
  const dir = mkdtempSync(join(tmpdir(), "explorer-boot-"));
  const lockPath = join(dir, "omp-plugins.lock.json");
  const review = { description: "Code review", weights: { general: 0.5, price: 0.5 }, required: ["general", "price"] };
  writeFileSync(lockPath, JSON.stringify({ plugins: { "omp-llm-role": { enabled: true } }, settings: { "omp-llm-role": { roles: { review } } } }, null, 2));

  const rank: RankData = { models: MODELS, fetchedAt: "2026-10-01T00:00:00.000Z", source: "test", orMatched: 2, orPriced: 2 };
  const handle = await startExplorer({
    webDir: join(process.cwd(), "web"),
    lockPath,
    rank,
    catalog: [],
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
  } finally {
    await handle.close();
  }

  // The port is free again: binding it must succeed.
  const reuse = createServer();
  await new Promise<void>((resolve) => reuse.listen(handle.port, "127.0.0.1", resolve));
  await new Promise<void>((resolve) => reuse.close(() => resolve()));
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
    rank,
    catalog: [],
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
