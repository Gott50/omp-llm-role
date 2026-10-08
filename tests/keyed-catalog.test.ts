import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { KeyAvailability } from "../src/availability.ts";
import { runUpdater, type Deps } from "../src/updater.ts";
import { fakeDeps, makeModel, NO_FILTER_AVAILABILITY, runInTempDir, setupAgentDir } from "./helpers.ts";

/** KeyAvailability fixture: `active` with the given ranking-id sets unless overridden. */
function availability(overrides: Partial<KeyAvailability> = {}): KeyAvailability {
  return {
    active: true,
    reason: "active",
    allowed: new Set<string>(),
    blocked: new Set<string>(),
    publicCount: 0,
    keyedCount: 0,
    fetchedAt: "2026-09-22T00:00:00.000Z",
    ...overrides,
  };
}

/** N models with strictly descending value (general/throughput down, price up),
 * so every role ranks them model-01 … model-N in order. */
function ladder(n: number) {
  return Array.from({ length: n }, (_, i) =>
    makeModel(`model-${String(i + 1).padStart(2, "0")}`, 100 - i * 4, i + 1, 100 - i * 3),
  );
}

// Uniform quality metrics -> q = (v+20)/80: A 1.375, B 1.25, C 1.125; margin(A,B) ≈ 0.1355.
const MODELS3 = [makeModel("model-a", 90, 1, 100), makeModel("model-b", 80, 5, 60), makeModel("model-c", 70, 10, 30)];

/** Probe spy recording the catalog ids it was asked about. */
function probeSpy(calls: string[], verdict: "ok" | "blocked" = "ok") {
  return async (_token: string, catalogId: string) => {
    calls.push(catalogId);
    return verdict;
  };
}

test("keyed catalog: key-blocked candidates are pruned from the walk, best allowed adopted", async () => {
  const models = ladder(13);
  const blocked = models.slice(0, 12).map((m) => m.id);
  const allowed = new Set([models[12].id]);
  const dir = setupAgentDir("other: 1\n");
  const probed: string[] = [];
  const notified: string[] = [];
  const deps = fakeDeps(models, {}, {
    getKeyAvailability: async () => availability({ allowed, blocked: new Set(blocked), publicCount: 13, keyedCount: 1 }),
    probeModel: probeSpy(probed),
    notify: (lines) => notified.push(...lines),
  });
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true, dryRun: true }));
  const d = result.decisions.find((x) => x.role === "default");
  assert.ok(d);
  // The 13th-ranked (only allowed) model is adopted; the 12 blocked ones never
  // consume the probe budget, so the walk reaches it.
  assert.equal(d.to, "openrouter/org/model-13:auto");
  assert.equal(d.availabilitySource, "keyed-catalog");
  assert.equal(d.keyBlockedCount, 12);
  assert.deepEqual(probed, []);
  assert.ok(notified.some((l) => l.includes("keyed catalog active")));
});

test("keyed catalog: only candidates in neither catalog are probed", async () => {
  const dir = setupAgentDir("other: 1\n");
  const probed: string[] = [];
  const deps = fakeDeps(MODELS3, {}, {
    // model-a allowed (no request), model-b key-blocked (pruned), model-c a stale
    // omp-catalog alias OpenRouter does not know -> the only probe.
    getKeyAvailability: async () => availability({ allowed: new Set(["model-a"]), blocked: new Set(["model-b"]) }),
    probeModel: probeSpy(probed),
  });
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true, dryRun: true }));
  assert.deepEqual(probed, ["org/model-c"]);
  const d = result.decisions.find((x) => x.role === "default");
  assert.ok(d);
  assert.equal(d.to, "openrouter/org/model-a:auto");
  assert.equal(d.availabilitySource, "keyed-catalog");
  assert.equal(d.keyBlockedCount, 1);
});

test("keyed catalog: key-blocked candidates never appear in a written fallback chain", async () => {
  const models = ladder(15);
  const blocked = models.slice(0, 12).map((m) => m.id);
  const allowed = new Set(models.slice(12).map((m) => m.id));
  const dir = setupAgentDir("other: 1\n");
  const deps = fakeDeps(models, { fallbackChainDepth: 2 }, {
    getKeyAvailability: async () => availability({ allowed, blocked: new Set(blocked) }),
    probeModel: async () => "ok",
  });
  await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  const text = readFileSync(join(dir, "config.yml"), "utf8");
  // Every managed role lands on model-13, so the shared chain key is level-free.
  assert.match(text, /openrouter\/org\/model-13:\n\s+- "openrouter\/org\/model-14"\n\s+- "openrouter\/org\/model-15"/);
  for (const id of blocked) assert.doesNotMatch(text, new RegExp(id));
});

test("no-filter and unavailable degrade to the probe walk unchanged", async () => {
  const runs: Array<{ probed: string[]; decisions: unknown }> = [];
  const cases: Array<Partial<Deps>> = [
    {}, // fakeDeps default: no-filter
    { getKeyAvailability: async () => NO_FILTER_AVAILABILITY },
    { getKeyAvailability: async () => availability({ active: false, reason: "unavailable", allowed: new Set(), blocked: new Set() }) },
  ];
  for (const overrides of cases) {
    const dir = setupAgentDir("other: 1\n");
    const probed: string[] = [];
    const notified: string[] = [];
    const deps = fakeDeps(MODELS3, {}, { probeModel: probeSpy(probed), notify: (lines) => notified.push(...lines), ...overrides });
    const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true, dryRun: true }));
    const d = result.decisions.find((x) => x.role === "default");
    assert.ok(d);
    assert.equal(d.to, "openrouter/org/model-a:auto");
    assert.equal(d.availabilitySource, "probe");
    assert.equal(d.keyBlockedCount, 0);
    // The full candidate list is probed, exactly as before the keyed catalog.
    assert.deepEqual(probed, ["org/model-a", "org/model-b", "org/model-c"]);
    assert.ok(notified.some((l) => l.includes("Filter the model catalog for API keys")));
    runs.push({ probed, decisions: result.decisions });
  }
  assert.deepEqual(runs[0].decisions, runs[1].decisions);
  assert.deepEqual(runs[1].decisions, runs[2].decisions);
});

test("unavailable availability is non-fatal: the run completes", async () => {
  const dir = setupAgentDir("other: 1\n");
  const deps = fakeDeps(MODELS3, {}, {
    getKeyAvailability: async () => availability({ active: false, reason: "unavailable", allowed: new Set(), blocked: new Set() }),
  });
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true, dryRun: true }));
  assert.equal(result.aborted, undefined);
  assert.ok(result.decisions.length > 0);
});

test("a rejecting getKeyAvailability never throws out of the run", async () => {
  const dir = setupAgentDir("other: 1\n");
  const deps = fakeDeps(MODELS3, {}, {
    getKeyAvailability: async () => {
      throw new Error("boom");
    },
  });
  // The default fetchKeyAvailability never throws; a rejecting injected dep is
  // the caller's contract. runUpdater must still return a result, not throw —
  // the rejection reaches the outer catch and aborts the run cleanly.
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true, dryRun: true }));
  assert.ok(result.aborted);
  assert.deepEqual(result.decisions, []);
  // A throw escaping the run is a defect, not an enumerated environment abort.
  assert.equal(result.defect, "boom");
});
