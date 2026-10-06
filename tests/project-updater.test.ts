import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { runUpdater } from "../src/updater.ts";
import { fakeDeps, makeModel } from "./helpers.ts";

const MODELS = [makeModel("model-a", 90, 1, 100), makeModel("model-b", 80, 5, 60)];

/** A temp project root with `<root>/.omp/plugins/omp-plugins.lock.json` carrying
 * (or not) an `omp-llm-role` settings entry, plus a sibling global agent dir. */
function projectWorkspace(projectSettings: Record<string, unknown> | null): { root: string; projectDir: string; globalDir: string } {
  const root = mkdtempSync(join(tmpdir(), "project-updater-"));
  const projectDir = join(root, ".omp");
  mkdirSync(join(projectDir, "plugins"), { recursive: true });
  const lock = {
    plugins: { "omp-llm-role": { enabled: true } },
    settings: projectSettings === null ? {} : { "omp-llm-role": projectSettings },
  };
  writeFileSync(join(projectDir, "plugins", "omp-plugins.lock.json"), JSON.stringify(lock, null, 2));
  const globalDir = join(root, "global-agent-dir");
  mkdirSync(globalDir, { recursive: true });
  return { root, projectDir, globalDir };
}

/** Run `fn` with cwd = project root and the global agent dir pointed at a sibling
 * temp dir; restores both afterwards. */
async function runInProject<T>(root: string, globalDir: string, fn: () => Promise<T>): Promise<T> {
  const prevCwd = process.cwd();
  const prevAgent = process.env.OMP_LLM_ROLE_AGENT_DIR;
  process.chdir(root);
  process.env.OMP_LLM_ROLE_AGENT_DIR = globalDir;
  try {
    return await fn();
  } finally {
    process.chdir(prevCwd);
    if (prevAgent === undefined) delete process.env.OMP_LLM_ROLE_AGENT_DIR;
    else process.env.OMP_LLM_ROLE_AGENT_DIR = prevAgent;
  }
}

test("project mode: writes <project>/.omp/config.yml and scopes state/history/lock there", async () => {
  const ws = projectWorkspace({ "roles.default.thinking": "high" });
  const globalConfig = 'modelRoles:\n  default: "openrouter/org/model-b"\n';
  writeFileSync(join(ws.globalDir, "config.yml"), globalConfig);

  const deps = fakeDeps(MODELS, {}, { getSettings: async () => ({}) });
  const result = await runInProject(ws.root, ws.globalDir, () => runUpdater("manual", deps, { force: true }));

  assert.equal(result.aborted, undefined);
  assert.equal(result.wrote, true);

  // The project config landed under <project>/.omp/.
  const projectConfig = readFileSync(join(ws.projectDir, "config.yml"), "utf8");
  assert.match(projectConfig, /modelRoles:/);
  assert.match(projectConfig, /default: "openrouter\/org\/model-a/);

  // State, history and lock are project-scoped (the lock is released).
  assert.equal(existsSync(join(ws.projectDir, "llm-role-state.json")), true);
  assert.equal(existsSync(join(ws.projectDir, "llm-role-history.jsonl")), true);
  assert.equal(existsSync(join(ws.projectDir, ".llm-role-refresh.lock")), false);

  // The global config is untouched and no global state was written.
  assert.equal(readFileSync(join(ws.globalDir, "config.yml"), "utf8"), globalConfig);
  assert.equal(existsSync(join(ws.globalDir, "llm-role-state.json")), false);
  assert.equal(existsSync(join(ws.globalDir, "llm-role-history.jsonl")), false);
});

test("no project entry: writes the global config as today", async () => {
  const ws = projectWorkspace(null);
  const deps = fakeDeps(MODELS, {}, { getSettings: async () => ({}) });
  const result = await runInProject(ws.root, ws.globalDir, () => runUpdater("manual", deps, { force: true }));

  assert.equal(result.aborted, undefined);
  assert.equal(result.wrote, true);
  assert.equal(existsSync(join(ws.globalDir, "config.yml")), true);
  assert.equal(existsSync(join(ws.globalDir, "llm-role-state.json")), true);
  // The project dir is untouched.
  assert.equal(existsSync(join(ws.projectDir, "config.yml")), false);
  assert.equal(existsSync(join(ws.projectDir, "llm-role-state.json")), false);
});

test("project mode: the day gate is per scope (a second same-day run is a no-op)", async () => {
  const ws = projectWorkspace({ "roles.default.thinking": "high" });
  const deps = fakeDeps(MODELS, {}, { getSettings: async () => ({}) });
  const first = await runInProject(ws.root, ws.globalDir, () => runUpdater("manual", deps, { force: true }));
  assert.equal(first.wrote, true);
  const second = await runInProject(ws.root, ws.globalDir, () => runUpdater("session-start", deps));
  assert.deepEqual(second.decisions, []);
  assert.equal(second.wrote, false);
});
