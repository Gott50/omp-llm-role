import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { test } from "node:test";
import { join } from "node:path";
import { runUpdater } from "../src/updater.ts";
import { fakeDeps, makeModel, runInTempDir, setupAgentDir } from "./helpers.ts";

// Same uniform-metric fixture convention as hysteresis.test.ts.
const MODELS = [makeModel("model-a", 90, 1, 100), makeModel("model-b", 80, 5, 60)];

/** Deps whose applySessionModel records (selector, previous) pairs it receives. */
function depsApplying(applied: [string, string | null][], settings: Record<string, unknown> = {}) {
  return fakeDeps(MODELS, settings, {
    applySessionModel: async (selector, previous) => {
      applied.push([selector, previous]);
    },
  });
}

test("manual force run reports the default selector on RunResult", async () => {
  const dir = setupAgentDir("other: 1\n");
  const applied: [string, string | null][] = [];
  const result = await runInTempDir(dir, () =>
    runUpdater("manual", depsApplying(applied), { force: true, dryRun: true }),
  );
  const d = result.decisions.find((x) => x.role === "default");
  assert.ok(d);
  assert.equal(result.defaultSelector, d.to);
});

test("applySessionModel is not called on a dry run", async () => {
  const dir = setupAgentDir("other: 1\n");
  const applied: [string, string | null][] = [];
  await runInTempDir(dir, () => runUpdater("manual", depsApplying(applied), { force: true, dryRun: true }));
  assert.deepEqual(applied, []);
});

test("applySessionModel is called after a real write with the new selector and the previous one", async () => {
  const dir = setupAgentDir("other: 1\n");
  const applied: [string, string | null][] = [];
  const result = await runInTempDir(dir, () => runUpdater("manual", depsApplying(applied), { force: true }));
  const d = result.decisions.find((x) => x.role === "default");
  assert.ok(d);
  assert.ok(result.wrote);
  assert.deepEqual(applied, [[d.to, d.from]]);
});

test("applySessionModel is skipped when the default role is kept (from === to), even though the run wrote", async () => {
  const current = "openrouter/org/model-a:auto";
  const dir = setupAgentDir(`modelRoles:\n  default: ${current}\n`);
  const state = {
    lastRunDay: "2026-09-21",
    managedRoles: ["default"],
    roleLastSelector: { default: current },
    pluginWrittenChainKeys: [],
    previousModelRoles: null,
  };
  writeFileSync(join(dir, "llm-role-state.json"), JSON.stringify(state, null, 2));
  const applied: [string, string | null][] = [];
  const result = await runInTempDir(dir, () =>
    runUpdater("manual", depsApplying(applied, { writeFallbackChains: false }), { force: true }),
  );
  const d = result.decisions.find((x) => x.role === "default");
  assert.ok(d);
  assert.equal(d.reason, "kept-eligible");
  assert.equal(d.from, d.to);
  assert.ok(result.wrote); // chain/state maintenance still writes; the hook must still not fire
  assert.deepEqual(applied, []);
});

test("applySessionModel throwing is contained: run completes with a notify line", async () => {
  const dir = setupAgentDir("other: 1\n");
  const notified: string[] = [];
  const deps = fakeDeps(MODELS, {}, {
    applySessionModel: async () => {
      throw new Error("host refused");
    },
    notify: (lines) => notified.push(...lines),
  });
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  assert.equal(result.wrote, true);
  assert.ok(notified.some((l) => l.includes("could not update the session model: host refused")));
});

test("activateDefaultOnEmptySession=false drops the hook without touching the run", async () => {
  const dir = setupAgentDir("other: 1\n");
  const applied: [string, string | null][] = [];
  const result = await runInTempDir(dir, () =>
    runUpdater("manual", depsApplying(applied, { activateDefaultOnEmptySession: false }), { force: true }),
  );
  assert.equal(result.wrote, true);
  assert.deepEqual(applied, []);
});
