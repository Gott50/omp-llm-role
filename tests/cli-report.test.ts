import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { enrichThinkingLevels, type CatalogEntry } from "../src/availability.ts";
import { computeRankings, type Model, type RoleDef } from "../src/engine.ts";
import { formatModelRolesYaml } from "../src/cli/llm-role-rank.ts";
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
function report(settingsMap: Record<string, unknown>, models: Model[], catalog: CatalogEntry[]): string {
  const { settings } = resolveSettings(lockSettings(settingsMap));
  enrichThinkingLevels(models, catalog);
  return formatModelRolesYaml(computeRankings(models, settings.roles), settings.roles, catalog);
}

/** The pre-#116 report: shipped defaults, no settings, no provider offers. */
function legacyReport(models: Model[], catalog: CatalogEntry[]): string {
  enrichThinkingLevels(models, catalog);
  return formatModelRolesYaml(computeRankings(models, DEFAULT_ROLES), DEFAULT_ROLES, catalog);
}

// Uniform quality metrics -> q = (v+20)/80: A 1.375, B 1.25, C 1.125. A fresh
// set per call: the enrichment mutates the models (offers, thinking levels).
const models = (): Model[] => [makeModel("model-a", 90, 1, 100), makeModel("model-b", 80, 5, 60), makeModel("model-c", 70, 10, 30)];
const OPENROUTER = [entry("openrouter", "org/model-a"), entry("openrouter", "org/model-b"), entry("openrouter", "org/model-c")];

test("a prioritized provider writes its own selector for the role's #1", () => {
  const catalog = [...OPENROUTER, entry("flocta", "model-a")];
  const yaml = report({ providerPriority: "flocta" }, models(), catalog);
  // `default` pins the meta level `auto`, which always applies.
  assert.match(yaml, /^ {2}default: "flocta\/model-a:auto"$/m);
  // Every role's #1 is model-a, so every role routes through flocta (the
  // header comment still names the openrouter form).
  assert.doesNotMatch(yaml, /^ {2}\w+: "openrouter\//m);
});

test("the thinking suffix comes from the provider's own offer list", () => {
  const catalog = [...OPENROUTER, entry("flocta", "model-a", ["low", "high"])];
  const yaml = report({ providerPriority: "flocta" }, models(), catalog);
  // `slow` pins `high`, which the flocta row advertises.
  assert.match(yaml, /^ {2}slow: "flocta\/model-a:high"$/m);
  // `default` pins the meta level `auto`, which always applies.
  assert.match(yaml, /^ {2}default: "flocta\/model-a:auto"$/m);
  // `smol` pins `off` (a meta level) — also always applies.
  assert.match(yaml, /^ {2}smol: "flocta\/model-a:off"$/m);
});

test("a level the provider's offer does not advertise leaves the selector bare", () => {
  // The OpenRouter row advertises `high`; the flocta row does not. The level is
  // provider-scoped, so the flocta selector must not inherit it.
  const catalog = [
    entry("openrouter", "org/model-a", ["high"]),
    entry("openrouter", "org/model-b"),
    entry("openrouter", "org/model-c"),
    entry("flocta", "model-a", ["low"]),
  ];
  const yaml = report({ providerPriority: "flocta" }, models(), catalog);
  assert.match(yaml, /^ {2}slow: "flocta\/model-a"$/m);
  // The same fixture without the priority keeps the OpenRouter suffix.
  const legacy = legacyReport(models(), catalog);
  assert.match(legacy, /^ {2}slow: "openrouter\/org\/model-a:high"$/m);
});

test("a model the prioritized provider does not offer stays on OpenRouter", () => {
  // flocta offers only model-b; every role's #1 (model-a) has no flocta row.
  // (The provider-scoped join matches by ranking id, so a flocta row for a
  // different model id never claims model-a.)
  const catalog = [...OPENROUTER, entry("flocta", "model-b")];
  const yaml = report({ providerPriority: "flocta" }, models(), catalog);
  assert.match(yaml, /^ {2}default: "openrouter\/org\/model-a:auto"$/m);
  assert.doesNotMatch(yaml, /flocta\//);
});

test("an empty priority list produces the exact pre-change YAML", () => {
  const catalog = [...OPENROUTER, entry("flocta", "model-a", ["high"])];
  const legacy = legacyReport(models(), catalog);
  // No lock entry at all, and an explicit empty list, both match the old output.
  assert.equal(report({}, models(), catalog), legacy);
  assert.equal(report({ providerPriority: "" }, models(), catalog), legacy);
  // The header is provider-neutral (issue #116); every selector line is unchanged.
  assert.equal(
    legacy,
    [
      "# Suggested settings.modelRoles (best-fit #1 per role, resolved via the omp catalog).",
      "# Selectors are <provider>/<id> (openrouter unless a provider priority is set); the omp-llm-role plugin writes this block daily.",
      "modelRoles:",
      '  default: "openrouter/org/model-a:auto"',
      '  smol: "openrouter/org/model-a:off"',
      // The OpenRouter row advertises no thinking list, so `slow`'s `high` is bare.
      '  slow: "openrouter/org/model-a"',
      '  plan: "openrouter/org/model-a:auto"',
      '  commit: "openrouter/org/model-a:off"',
      '  tiny: "openrouter/org/model-a:off"',
      '  task: "openrouter/org/model-a:auto"',
      '  advisor: "openrouter/org/model-a:auto"',
    ].join("\n"),
  );
});

test("a role's own priority overrides the global list", () => {
  const catalog = [...OPENROUTER, entry("flocta", "model-a"), entry("other", "model-a")];
  const yaml = report({ providerPriority: "flocta", "roles.smol.providerPriority": "other" }, models(), catalog);
  assert.match(yaml, /^ {2}default: "flocta\/model-a:auto"$/m);
  assert.match(yaml, /^ {2}smol: "other\/model-a:off"$/m);
});

test("a role whose #1 has no catalog match keeps the comment placeholder", () => {
  const roles: Record<string, RoleDef> = { default: DEFAULT_ROLES.default };
  const yaml = formatModelRolesYaml(computeRankings(models(), roles), roles, []);
  assert.match(yaml, /^ {2}default: # no catalog match for model-a$/m);
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
