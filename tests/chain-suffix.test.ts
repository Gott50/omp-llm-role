import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { parse as parseYaml } from "yaml";
import type { CatalogEntry } from "../src/availability.ts";
import { runUpdater } from "../src/updater.ts";
import { fakeDeps, makeCatalog, makeModel, runInTempDir, setupAgentDir } from "./helpers.ts";

// Uniform quality metrics -> q = (v+20)/80: A 1.375, B 1.25, C 1.125.
const MODELS = [makeModel("model-a", 90, 1, 100), makeModel("model-b", 80, 5, 60), makeModel("model-c", 70, 10, 30)];

// Only `smol` is managed, with a non-default suffix, so the chain assertions are exact.
const SMOL_ONLY = Object.fromEntries(
  ["default", "slow", "vision", "plan", "commit", "tiny", "task", "advisor", "designer"].map((r) => [r, { weights: null }]),
);
const SETTINGS = { roles: { ...SMOL_ONLY, smol: { thinking: "max" } } };

type ConfigDoc = {
  modelRoles: Record<string, string>;
  retry: { fallbackChains: Record<string, string[]> };
};

async function run(catalog?: CatalogEntry[]) {
  const dir = setupAgentDir('modelRoles:\n  smol: "openrouter/org/model-a"\n');
  const deps = fakeDeps(MODELS, SETTINGS, catalog ? { getCatalog: async () => catalog } : {});
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  return { result, doc: parseYaml(readFileSync(join(dir, "config.yml"), "utf8")) as ConfigDoc };
}

test("chain values carry the role's thinking suffix; the chain key stays bare", async () => {
  const { result, doc } = await run();
  assert.equal(result.aborted, undefined);
  assert.equal(doc.modelRoles.smol, "openrouter/org/model-a:max");
  // Key without suffix (it must match the active model id), values with it.
  assert.deepEqual(doc.retry.fallbackChains["openrouter/org/model-a"], ["openrouter/org/model-b:max", "openrouter/org/model-c:max"]);
});

test("a chain entry without thinking support gets no suffix", async () => {
  const { doc } = await run([...makeCatalog(["model-a", "model-b"]), ...makeCatalog(["model-c"], [])]);
  assert.equal(doc.modelRoles.smol, "openrouter/org/model-a:max");
  assert.deepEqual(doc.retry.fallbackChains["openrouter/org/model-a"], ["openrouter/org/model-b:max", "openrouter/org/model-c"]);
});

test("two roles on the same model share one level-free chain", async () => {
  // `default` (no suffix) and `smol` (`:max`) both rank model-a first, so the chain
  // key `openrouter/org/model-a` serves both and must not carry either role's level.
  const optOut = Object.fromEntries(
    ["slow", "vision", "plan", "commit", "tiny", "task", "advisor", "designer"].map((r) => [r, { weights: null }]),
  );
  const dir = setupAgentDir("other: 1\n");
  const deps = fakeDeps(MODELS, { roles: { ...optOut, smol: { thinking: "max" } } });
  await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  const doc = parseYaml(readFileSync(join(dir, "config.yml"), "utf8")) as ConfigDoc;
  assert.equal(doc.modelRoles.default, "openrouter/org/model-a");
  assert.equal(doc.modelRoles.smol, "openrouter/org/model-a:max");
  assert.deepEqual(doc.retry.fallbackChains["openrouter/org/model-a"], ["openrouter/org/model-b", "openrouter/org/model-c"]);
});
