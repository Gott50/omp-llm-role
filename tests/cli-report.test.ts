import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { enrichCatalogData, type CatalogEntry } from "../src/availability.ts";
import { computeRankings, type Model, type RoleDef } from "../src/engine.ts";
import { formatModelRolesYaml, reportRoles } from "../src/cli/llm-role-rank.ts";
import { DEFAULT_ROLES, readPluginSettingsMap, resolveSettings } from "../src/settings.ts";
import { makeModel } from "./helpers.ts";

// The report's suggested modelRoles block (issue #116, T9): the #1 model per
// role resolved through the effective provider's selector. The seam is
// `formatModelRolesYaml(rankings, roles, catalog)`; the settings come from the
// plugin lock file through `readPluginSettingsMap` + `resolveSettings`.

function entry(provider: string, id: string, thinking: string[] = []): CatalogEntry {
  return {
    provider,
    id,
    selector: `${provider}/${id}`,
    name: id,
    contextWindow: 200000,
    maxTokens: 8192,
    reasoning: thinking.length > 0,
    thinking,
    input: ["text"],
    cost: null,
  };
}

/** A lock file with the given `settings["omp-llm-role"]` map, read back through
 * the plugin's own reader (the CLI's settings source). */
function lockSettings(map: Record<string, unknown>): Record<string, unknown> {
  const dir = mkdtempSync(join(tmpdir(), "llm-role-cli-"));
  const path = join(dir, "omp-plugins.lock.json");
  writeFileSync(path, JSON.stringify({ settings: { "omp-llm-role": map } }));
  return readPluginSettingsMap({ global: path, project: null });
}

/** The report's pipeline: settings -> roles -> catalog enrichment -> rankings. */
function report(settingsMap: Record<string, unknown>, models: Model[], catalog: CatalogEntry[], all = false): string {
  const { settings } = resolveSettings(lockSettings(settingsMap));
  const roles = reportRoles(settings, all);
  enrichCatalogData(models, catalog);
  return formatModelRolesYaml(computeRankings(models, roles), roles, catalog);
}

/** The report with no plugin settings: the shipped defaults, no provider
 * priority (the CLI's no-lock-entry path). */
function defaultReport(models: Model[], catalog: CatalogEntry[], all = false): string {
  const roles = reportRoles(undefined, all);
  enrichCatalogData(models, catalog);
  return formatModelRolesYaml(computeRankings(models, roles), roles, catalog);
}

// Uniform quality metrics -> q = (v+20)/80: A 1.375, B 1.25, C 1.125. A fresh
// set per call: the enrichment mutates the models (offers, thinking levels).
const models = (): Model[] => [makeModel("model-a", 90, 1, 100), makeModel("model-b", 80, 5, 60), makeModel("model-c", 70, 10, 30)];
const OPENROUTER = [entry("openrouter", "org/model-a"), entry("openrouter", "org/model-b"), entry("openrouter", "org/model-c")];

test("a prioritized provider writes its own selector for the role's #1", () => {
  const catalog = [...OPENROUTER, entry("flocta", "model-a")];
  const yaml = report({ providerPriority: "flocta" }, models(), catalog);
  // `default` pins `medium`, which the flocta row advertises.
  assert.match(yaml, /^ {2}default: "flocta\/model-a:off"$/m);
  // Every role's #1 is model-a, so every role routes through flocta (the
  // header comment still names the openrouter form).
  assert.doesNotMatch(yaml, /^ {2}\w+: "openrouter\//m);
});

test("the thinking suffix comes from the provider's own offer list", () => {
  const catalog = [...OPENROUTER, entry("flocta", "model-a", ["low", "medium", "high"])];
  const yaml = report({ providerPriority: "flocta" }, models(), catalog);
  // `slow` pins `high`, which the flocta row advertises.
  assert.match(yaml, /^ {2}slow: "flocta\/model-a:high"$/m);
  // `default` pins `medium`, which the flocta row advertises.
  assert.match(yaml, /^ {2}default: "flocta\/model-a:medium"$/m);
  // `smol` pins `off` (the only meta level) — always applies.
  assert.match(yaml, /^ {2}smol: "flocta\/model-a:off"$/m);
});

test("a level the provider's offer does not advertise clamps to its own range", () => {
  // The OpenRouter row advertises `high`; the flocta row advertises only `low`.
  // The level is provider-scoped, so the flocta selector clamps `high` to `low`
  // and must not inherit the OpenRouter range.
  const catalog = [
    entry("openrouter", "org/model-a", ["high"]),
    entry("openrouter", "org/model-b"),
    entry("openrouter", "org/model-c"),
    entry("flocta", "model-a", ["low"]),
  ];
  const yaml = report({ providerPriority: "flocta" }, models(), catalog);
  assert.match(yaml, /^ {2}slow: "flocta\/model-a:low"$/m);
  // The same fixture without the priority keeps the OpenRouter suffix.
  const defaults = defaultReport(models(), catalog);
  assert.match(defaults, /^ {2}slow: "openrouter\/org\/model-a:high"$/m);
});

test("a model the prioritized provider does not offer stays on OpenRouter", () => {
  // flocta offers only model-b; every role's #1 (model-a) has no flocta row.
  // (The provider-scoped join matches by ranking id, so a flocta row for a
  // different model id never claims model-a.)
  const catalog = [...OPENROUTER, entry("flocta", "model-b")];
  const yaml = report({ providerPriority: "flocta" }, models(), catalog);
  assert.match(yaml, /^ {2}default: "openrouter\/org\/model-a:off"$/m);
  assert.doesNotMatch(yaml, /flocta\//);
});

test("an empty priority list writes the OpenRouter selectors with the role's level", () => {
  const catalog = [...OPENROUTER, entry("flocta", "model-a", ["high"])];
  // No lock entry at all, and an explicit empty list, both produce this block.
  const expected = [
      "# Suggested settings.modelRoles (best-fit #1 per role, resolved via the omp catalog).",
      "# Selectors are <provider>/<id> (openrouter unless a provider priority is set); the omp-llm-role plugin writes this block daily.",
      "modelRoles:",
      '  default: "openrouter/org/model-a:off"',
      '  smol: "openrouter/org/model-a:off"',
      // The OpenRouter row advertises no thinking list, so `slow`'s `high` clamps to `off`.
      '  slow: "openrouter/org/model-a:off"',
      '  plan: "openrouter/org/model-a:off"',
      '  commit: "openrouter/org/model-a:off"',
      '  tiny: "openrouter/org/model-a:off"',
      '  task: "openrouter/org/model-a:off"',
      '  advisor: "openrouter/org/model-a:off"',
    ].join("\n");
  assert.equal(report({}, models(), catalog), expected);
  assert.equal(report({ providerPriority: "" }, models(), catalog), expected);
  // The no-settings path (the shipped defaults) writes the same block.
  assert.equal(defaultReport(models(), catalog), expected);
});

test("a role's own priority overrides the global list", () => {
  const catalog = [...OPENROUTER, entry("flocta", "model-a"), entry("other", "model-a")];
  const yaml = report({ providerPriority: "flocta", "roles.smol.providerPriority": "other" }, models(), catalog);
  assert.match(yaml, /^ {2}default: "flocta\/model-a:off"$/m);
  assert.match(yaml, /^ {2}smol: "other\/model-a:off"$/m);
});

test("a role whose #1 has no catalog row emits the next resolvable model's selector", () => {
  // The plugin's candidate building skips a model with no routable catalog row
  // and picks the next one; the suggested block must match it. model-a (the #1)
  // has no catalog row, model-b does.
  const roles: Record<string, RoleDef> = { default: DEFAULT_ROLES.default };
  const catalog = [entry("openrouter", "org/model-b")];
  const yaml = formatModelRolesYaml(computeRankings(models(), roles), roles, catalog);
  assert.match(yaml, /^ {2}default: "openrouter\/org\/model-b:off"$/m);
  assert.doesNotMatch(yaml, /no catalog match/);
});

test("a role with no resolvable model keeps the comment placeholder", () => {
  const roles: Record<string, RoleDef> = { default: DEFAULT_ROLES.default };
  const yaml = formatModelRolesYaml(computeRankings(models(), roles), roles, []);
  assert.match(yaml, /^ {2}default: # no catalog match for model-a$/m);
});

test("invalid plugin settings abort the report with the errors on stderr", () => {
  // The CLI reads the lock file from $HOME; a throwaway HOME carries an invalid
  // `providerPriority` (a selector delimiter), which must abort before any fetch.
  const home = mkdtempSync(join(tmpdir(), "llm-role-cli-home-"));
  const plugins = join(home, ".omp", "plugins");
  mkdirSync(plugins, { recursive: true });
  writeFileSync(
    join(plugins, "omp-plugins.lock.json"),
    JSON.stringify({ settings: { "omp-llm-role": { providerPriority: "flocta@x" } } }),
  );
  const cli = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "cli", "llm-role-rank.ts");
  const res = spawnSync(process.execPath, [cli], { env: { ...process.env, HOME: home }, encoding: "utf8" });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /^omp-llm-role settings invalid:\n {2}providerPriority: /m);
  assert.equal(res.stdout, "");
});

test("importing the CLI module has no side effects: no live fetch, no omp spawn", () => {
  // The report module used to call `main()` at import time, so importing it from
  // this test ran a live ranking fetch and `omp models ls`. The entry guard keeps
  // the import pure; a regression would print the report (or hang on the network).
  const cli = pathToFileURL(join(import.meta.dirname, "..", "src", "cli", "llm-role-rank.ts")).href;
  const out = execFileSync(
    process.execPath,
    ["--input-type=module", "-e", `await import(${JSON.stringify(cli)});`],
    { encoding: "utf8", timeout: 20_000, stdio: ["ignore", "pipe", "pipe"] },
  );
  assert.equal(out, "");
});

test("a tuned lock changes only the provider keys, never the role set or weights", () => {
  const catalog = [...OPENROUTER, entry("flocta", "model-a")];
  const tuned = {
    "roles.default.cacheHitRate": 0.9,
    "roles.default.filters.maxPriceUsdPerM": 1,
    "roles.default.filters.minContextTokens": 1000000,
    "roles.smol.weights.price": 0.9,
  };
  // The tuned defs would re-rank (a 1 $/M cap drops model-b/model-c, a 1M
  // context floor drops everything); the report must ignore them.
  assert.equal(report(tuned, models(), catalog), defaultReport(models(), catalog));
  // The provider keys still come through: the global priority applies.
  const yaml = report({ ...tuned, providerPriority: "flocta" }, models(), catalog);
  assert.match(yaml, /^ {2}default: "flocta\/model-a:off"$/m);
  // The role set and weights are the shipped defaults, not the lock's.
  const roles = reportRoles(resolveSettings(lockSettings(tuned)).settings, false);
  assert.deepEqual(Object.keys(roles), Object.keys(DEFAULT_ROLES).filter((r) => DEFAULT_ROLES[r].enabled !== false));
  assert.deepEqual(roles.default.weights, DEFAULT_ROLES.default.weights);
  assert.equal(roles.default.cacheHitRate, DEFAULT_ROLES.default.cacheHitRate);
  assert.deepEqual(roles.default.filters, DEFAULT_ROLES.default.filters);
  assert.deepEqual(roles.smol.weights, DEFAULT_ROLES.smol.weights);
});

test("--all keeps designer even when the lock does not enable it", () => {
  // A lock that disables designer (and tunes default) must not shrink `--all`.
  const lock = { "roles.designer.enabled": false, "roles.default.cacheHitRate": 0.9 };
  const roles = reportRoles(resolveSettings(lockSettings(lock)).settings, true);
  assert.ok("designer" in roles);
  assert.deepEqual(roles.designer.weights, DEFAULT_ROLES.designer.weights);
  // Without `--all` the shipped opt-in gate still applies (designer ships off).
  assert.equal("designer" in reportRoles(resolveSettings(lockSettings(lock)).settings, false), DEFAULT_ROLES.designer.enabled !== false);
  // The suggested block covers every ranked role, designer included (its
  // `filters.image` gate needs a multimodal model).
  const catalog = [...OPENROUTER, entry("openrouter", "org/model-a", ["high"])];
  const multimodal = models().map((m) => ({ ...m, multimodal: true }));
  const yaml = report(lock, multimodal, catalog, true);
  assert.match(yaml, /^ {2}designer: "openrouter\/org\/model-a:off"$/m);
});
