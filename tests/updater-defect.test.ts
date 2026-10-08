import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { runUpdater, type RunResult } from "../src/updater.ts";
import { fakeDeps, makeModel, runInTempDir, setupAgentDir } from "./helpers.ts";

// `RunResult.defect` marks an unexpected exception abort (a bug) and is unset on
// every enumerated environment abort (a condition). The extension reads it to
// decide whether to file a report (spec #48, ticket #50).
const MODELS = [makeModel("model-a", 90, 1, 100), makeModel("model-b", 80, 5, 60), makeModel("model-c", 70, 10, 30)];

// --- exception aborts: `defect` carries the abort message -------------------

test("a ConfigEditError escaping the run is a defect", async () => {
  // `modelRoles: {}` is flow-style: patchConfig refuses it with a ConfigEditError,
  // which propagates out of writePatch to the final catch.
  const dir = setupAgentDir("modelRoles: {}\n");
  const deps = fakeDeps(MODELS);
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  assert.ok(result.aborted);
  assert.match(result.aborted, /config edit refused/);
  assert.equal(result.defect, result.aborted);
});

test("a catch-all throw escaping the run is a defect", async () => {
  const dir = setupAgentDir("other: 1\n");
  const deps = fakeDeps(MODELS, {}, {
    getKeyAvailability: async () => {
      throw new Error("boom");
    },
  });
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true, dryRun: true }));
  assert.ok(result.aborted);
  assert.equal(result.defect, "boom");
});

// --- enumerated environment aborts: `defect` unset --------------------------

test("settings invalid is an enumerated abort, not a defect", async () => {
  const dir = setupAgentDir("other: 1\n");
  const deps = fakeDeps(MODELS, {}, { getSettings: async () => ({ roles: { slow: { locked: "yes" } } }) });
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  assert.ok(result.aborted);
  assert.match(result.aborted, /settings invalid/);
  assert.equal(result.defect, undefined);
});

test("ranking data unavailable is an enumerated abort, not a defect", async () => {
  const dir = setupAgentDir("other: 1\n");
  const deps = fakeDeps(MODELS, {}, {
    getRankData: async () => {
      throw new Error("boom");
    },
  });
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  assert.ok(result.aborted);
  assert.match(result.aborted, /ranking data unavailable/);
  assert.equal(result.defect, undefined);
});

test("tier none is an enumerated abort, not a defect", async () => {
  const dir = setupAgentDir("other: 1\n");
  const deps = fakeDeps(MODELS, {}, {
    getKeyMeta: async () => ({ isFreeTier: false, limitRemaining: 0, freeRemaining: 0, creditsRemaining: 0 }),
  });
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  assert.ok(result.aborted);
  assert.match(result.aborted, /no usable budget/);
  assert.equal(result.defect, undefined);
});

test("a held refresh lock is an enumerated abort, not a defect", async () => {
  const dir = setupAgentDir("other: 1\n");
  writeFileSync(join(dir, ".llm-role-refresh.lock"), "held");
  const deps = fakeDeps(MODELS);
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  assert.ok(result.aborted);
  assert.match(result.aborted, /refresh lock/);
  assert.equal(result.defect, undefined);
});

test("3 mtime conflicts is an enumerated abort, not a defect", async () => {
  // writePatch's read→stat window is synchronous, so only a separate process can
  // change config.yml's mtime inside it. A tight utimes loop plus a large config
  // (a slow patchConfig widens the window) makes every attempt conflict; the
  // bounded retry keeps the assertion off a single race. The writer signals
  // readiness on stdout so the test awaits an event, not a guessed delay.
  const original = "other: 1\n" + "# filler\n".repeat(40000);
  const dir = setupAgentDir(original);
  const configPath = join(dir, "config.yml");
  const writer = spawn(
    process.execPath,
    ["-e", `const fs=require("fs");const p=${JSON.stringify(configPath)};process.stdout.write("ready\\n");const end=Date.now()+8000;while(Date.now()<end){try{fs.utimesSync(p,new Date(),new Date())}catch{}}`],
    { stdio: ["ignore", "pipe", "ignore"] },
  );
  try {
    const ready = Promise.withResolvers<void>();
    writer.stdout?.once("data", () => ready.resolve());
    writer.once("error", () => ready.resolve());
    writer.once("exit", () => ready.resolve());
    await ready.promise;
    const deps = fakeDeps(MODELS);
    let result: RunResult | undefined;
    for (let i = 0; i < 10; i++) {
      writeFileSync(configPath, original);
      result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
      if (result.aborted !== undefined) break;
    }
    assert.ok(result?.aborted);
    assert.match(result.aborted, /mtime conflicts/);
    assert.equal(result.defect, undefined);
  } finally {
    writer.kill("SIGKILL");
  }
});

test("a getToken failure is an enumerated abort, not a defect", async () => {
  const dir = setupAgentDir("other: 1\n");
  const deps = fakeDeps(MODELS, {}, {
    getToken: async () => {
      throw new Error("no token");
    },
  });
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  assert.ok(result.aborted);
  assert.match(result.aborted, /no token/);
  assert.equal(result.defect, undefined);
});

test("a getKeyMeta failure is an enumerated abort, not a defect", async () => {
  const dir = setupAgentDir("other: 1\n");
  const deps = fakeDeps(MODELS, {}, {
    getKeyMeta: async () => {
      throw new Error("key endpoint down");
    },
  });
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  assert.ok(result.aborted);
  assert.match(result.aborted, /key endpoint down/);
  assert.equal(result.defect, undefined);
});
