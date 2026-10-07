import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { isRecord } from "../src/guards.ts";
import { readPluginSettingsMap, resolveSettings } from "../src/settings.ts";

const CLI = join(process.cwd(), "src/cli/create-role.ts");

/** Temp dir with a lock file that already carries a plugins block. */
function seedLock(dir: string): string {
  const lockPath = join(dir, "omp-plugins.lock.json");
  writeFileSync(lockPath, JSON.stringify({ plugins: { "omp-llm-role": { enabled: true } }, settings: {} }, null, 2));
  return lockPath;
}

test("create-role writes a validated role, preserves plugins, and backs up", () => {
  const dir = mkdtempSync(join(tmpdir(), "create-role-"));
  const lockPath = seedLock(dir);

  execFileSync("node", [
    CLI,
    "--name", "review",
    "--weights", "general=0.5,price=0.5",
    "--required", "general,price",
    "--thinking", "high",
    "--description", "Code review",
    "--lock", lockPath,
  ]);

  const written: unknown = JSON.parse(readFileSync(lockPath, "utf8"));
  assert.ok(isRecord(written));
  assert.deepEqual(written.plugins, { "omp-llm-role": { enabled: true } });
  assert.equal(readdirSync(dir).filter((f) => f.includes(".bak-")).length, 1);

  const { settings, errors } = resolveSettings(readPluginSettingsMap({ global: lockPath, project: null }));
  assert.deepEqual(errors, []);
  assert.deepEqual(settings.roles.review, {
    description: "Code review",
    weights: { general: 0.5, price: 0.5 },
    required: ["general", "price"],
    thinking: "high",
  });
});

test("create-role --dry-run validates without touching the file", () => {
  const dir = mkdtempSync(join(tmpdir(), "create-role-dry-"));
  const lockPath = seedLock(dir);
  const before = readFileSync(lockPath, "utf8");

  execFileSync("node", [CLI, "--name", "review", "--weights", "general=0.5,price=0.5", "--lock", lockPath, "--dry-run"]);

  assert.equal(readFileSync(lockPath, "utf8"), before);
  assert.deepEqual(readdirSync(dir), ["omp-plugins.lock.json"]);
});

test("create-role refuses an invalid weight sum and writes nothing", () => {
  const dir = mkdtempSync(join(tmpdir(), "create-role-bad-"));
  const lockPath = seedLock(dir);
  const before = readFileSync(lockPath, "utf8");

  assert.throws(() => execFileSync("node", [CLI, "--name", "review", "--weights", "general=0.7,price=0.6", "--lock", lockPath]));

  assert.equal(readFileSync(lockPath, "utf8"), before);
  assert.deepEqual(readdirSync(dir), ["omp-plugins.lock.json"]);
});

test("create-role --feature writes the flag key and the resolver expands it", () => {
  const dir = mkdtempSync(join(tmpdir(), "create-role-feature-"));
  const lockPath = seedLock(dir);

  execFileSync("node", [CLI, "--name", "review", "--weights", "general=0.5,price=0.5", "--feature", "cachePricing", "--lock", lockPath]);

  const written: unknown = JSON.parse(readFileSync(lockPath, "utf8"));
  assert.ok(isRecord(written));
  // The lock's settings bag, keyed by plugin id (see role-settings.ts).
  const settingsBag = written.settings as Record<string, unknown>;
  const plugin = settingsBag["omp-llm-role"] as Record<string, unknown>;
  // The FLAG is persisted, not the knob it expands to.
  assert.equal(plugin["roles.review.features.cachePricing"], true);
  assert.equal(plugin["roles.review.cacheHitRate"], undefined);

  const { settings, errors } = resolveSettings(readPluginSettingsMap({ global: lockPath, project: null }));
  assert.deepEqual(errors, []);
  assert.equal(settings.roles.review.cacheHitRate, 0.5);
  assert.equal(settings.roles.review.features, undefined);
});

test("create-role --feature accepts a comma-separated list and merges repeats", () => {
  const dir = mkdtempSync(join(tmpdir(), "create-role-features-"));
  const lockPath = seedLock(dir);

  execFileSync("node", [CLI, "--name", "review", "--weights", "general=0.5,price=0.5", "--feature", "cachePricing,costCap", "--feature", "endpointCeilings", "--lock", lockPath]);

  const written: unknown = JSON.parse(readFileSync(lockPath, "utf8"));
  assert.ok(isRecord(written));
  const settingsBag = written.settings as Record<string, unknown>;
  const plugin = settingsBag["omp-llm-role"] as Record<string, unknown>;
  assert.equal(plugin["roles.review.features.cachePricing"], true);
  assert.equal(plugin["roles.review.features.costCap"], true);
  assert.equal(plugin["roles.review.features.endpointCeilings"], true);

  const { settings, errors } = resolveSettings(readPluginSettingsMap({ global: lockPath, project: null }));
  assert.deepEqual(errors, []);
  assert.equal(settings.roles.review.cacheHitRate, 0.5);
  assert.equal(settings.roles.review.filters?.maxPriceUsdPerM, 10);
  assert.equal(settings.roles.review.filters?.tools, true);
  assert.equal(settings.roles.review.filters?.minOutputTokens, 16384);
});

test("create-role --feature with an unknown id exits non-zero and writes nothing", () => {
  const dir = mkdtempSync(join(tmpdir(), "create-role-badfeature-"));
  const lockPath = seedLock(dir);
  const before = readFileSync(lockPath, "utf8");

  assert.throws(() => execFileSync("node", [CLI, "--name", "review", "--weights", "general=0.5,price=0.5", "--feature", "katz", "--lock", lockPath]));

  assert.equal(readFileSync(lockPath, "utf8"), before);
  assert.deepEqual(readdirSync(dir), ["omp-plugins.lock.json"]);
});

test("create-role --prefer-own-provider writes the policy key", () => {
  const dir = mkdtempSync(join(tmpdir(), "create-role-prefer-"));
  const lockPath = seedLock(dir);

  execFileSync("node", [CLI, "--name", "review", "--weights", "general=0.5,price=0.5", "--prefer-own-provider", "--lock", lockPath]);

  const written: unknown = JSON.parse(readFileSync(lockPath, "utf8"));
  assert.ok(isRecord(written));
  const settingsBag = written.settings as Record<string, unknown>;
  const plugin = settingsBag["omp-llm-role"] as Record<string, unknown>;
  assert.equal(plugin["roles.review.preferOwnProvider"], true);

  const { settings, errors } = resolveSettings(readPluginSettingsMap({ global: lockPath, project: null }));
  assert.deepEqual(errors, []);
  assert.equal(settings.roles.review.preferOwnProvider, true);
});

test("create-role --list-features prints every capability id and its bundle", () => {
  const out = execFileSync("node", [CLI, "--list-features"], { encoding: "utf8" });
  for (const id of ["endpointCeilings", "cachePricing", "providerPinning", "costCap"]) {
    assert.ok(out.includes(id), `missing ${id} in:\n${out}`);
  }
  assert.match(out, /cachePricing[^\n]*cacheHitRate=0\.5/);
  assert.match(out, /costCap[^\n]*maxPriceUsdPerM=10/);
  assert.match(out, /providerPinning[^\n]*preferOwnProvider=true/);
});
