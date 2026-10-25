import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { isRecord } from "../src/guards.ts";
import { GLOBAL_SETTING_KEYS, mergeExport, mergeSettings, writeRoleSettings } from "../src/role-settings.ts";
import { DEFAULT_ROLES, deriveSettingsSchema, readPluginSettingsMap, resolveSettings } from "../src/settings.ts";

const PLUGIN = "omp-llm-role";

/** The plugin's settings map inside a merged lock object. */
function pluginOf(lock: unknown): Record<string, unknown> {
  if (!isRecord(lock) || !isRecord(lock.settings)) throw new Error("lock has no settings object");
  const plugin = lock.settings[PLUGIN];
  if (!isRecord(plugin)) throw new Error(`lock has no ${PLUGIN} settings`);
  return plugin;
}

test("GLOBAL_SETTING_KEYS is exactly the schema's non-roles keys", () => {
  const expected = Object.keys(deriveSettingsSchema()).filter((key) => !key.startsWith("roles."));
  assert.deepEqual([...GLOBAL_SETTING_KEYS], expected);
  assert.ok(GLOBAL_SETTING_KEYS.includes("switchMargin"));
  assert.ok(GLOBAL_SETTING_KEYS.includes("tokenProfile.inputTokens"));
  assert.ok(GLOBAL_SETTING_KEYS.includes("features.costCap"));
  assert.ok(!GLOBAL_SETTING_KEYS.some((key) => key.startsWith("roles.")));
});

test("mergeSettings writes a global key, deletes a cleared one, and preserves plugins, config and siblings", () => {
  const existing = {
    plugins: { [PLUGIN]: { enabled: true } },
    settings: {
      [PLUGIN]: {
        switchMargin: 0.5,
        "tokenProfile.inputTokens": 1000,
        "features.costCap": true,
        "roles.slow.weights.general": 0.5,
        config: { switchMargin: 0.9 },
        legacySibling: "keep",
      },
      "other-plugin": { x: 1 },
    },
  };
  const original = structuredClone(existing.settings[PLUGIN]);
  const merged = mergeSettings(existing, {
    roles: { slow: DEFAULT_ROLES.slow },
    settings: { switchMargin: 0.1, "features.costCap": true },
  });
  assert.ok("lock" in merged);
  if (!("lock" in merged)) return;
  const plugin = pluginOf(merged.lock);
  assert.equal(plugin.switchMargin, 0.1);
  // A key the edited settings no longer carry is deleted, not left stale.
  assert.equal(plugin["tokenProfile.inputTokens"], undefined);
  assert.equal(plugin["features.costCap"], true);
  assert.equal(plugin["roles.slow.weights.general"], DEFAULT_ROLES.slow.weights.general);
  // The escape hatch and every sibling key survive.
  assert.deepEqual(plugin.config, { switchMargin: 0.9 });
  assert.equal(plugin.legacySibling, "keep");
  assert.ok(isRecord(merged.lock));
  assert.deepEqual(merged.lock.plugins, existing.plugins);
  assert.ok(isRecord(merged.lock.settings));
  assert.deepEqual(merged.lock.settings["other-plugin"], { x: 1 });
  // The input is never mutated.
  assert.deepEqual(existing.settings[PLUGIN], original);
});

test("mergeSettings normalizes a nested global object away with the flat keys", () => {
  const existing = {
    settings: { [PLUGIN]: { tokenProfile: { inputTokens: 5, outputTokens: 6 }, features: { costCap: true } } },
  };
  const merged = mergeSettings(existing, { settings: {} });
  assert.ok("lock" in merged);
  if (!("lock" in merged)) return;
  const plugin = pluginOf(merged.lock);
  assert.equal(plugin.tokenProfile, undefined);
  assert.equal(plugin.features, undefined);
});

test("mergeSettings writes tokenProfile and features as flat dotted keys that resolve", () => {
  const merged = mergeSettings(
    { settings: {} },
    {
      settings: {
        "tokenProfile.inputTokens": 100,
        "tokenProfile.outputTokens": 200,
        "features.costCap": true,
        "features.endpointCeilings": false,
      },
    },
  );
  assert.ok("lock" in merged);
  if (!("lock" in merged)) return;
  const plugin = pluginOf(merged.lock);
  assert.equal(plugin["tokenProfile.inputTokens"], 100);
  assert.equal(plugin["tokenProfile.outputTokens"], 200);
  assert.equal(plugin["features.costCap"], true);
  assert.equal(plugin["features.endpointCeilings"], false);
  assert.equal(plugin.tokenProfile, undefined);
  assert.equal(plugin.features, undefined);

  const { settings, errors } = resolveSettings(plugin);
  assert.deepEqual(errors, []);
  assert.deepEqual(settings.tokenProfile, { inputTokens: 100, outputTokens: 200 });
  assert.deepEqual(settings.features, { costCap: true, endpointCeilings: false });
});

test("mergeExport is mergeSettings with only the role half", () => {
  const existing = { settings: { [PLUGIN]: { switchMargin: 0.5, "roles.slow.weights.general": 0.1 } } };
  const viaExport = mergeExport(existing, { slow: DEFAULT_ROLES.slow });
  const viaMerge = mergeSettings(existing, { roles: { slow: DEFAULT_ROLES.slow } });
  assert.ok("lock" in viaExport && "lock" in viaMerge);
  if (!("lock" in viaExport) || !("lock" in viaMerge)) return;
  assert.deepEqual(viaExport.lock, viaMerge.lock);
  // No settings passed → the global half is untouched.
  assert.equal(pluginOf(viaExport.lock).switchMargin, 0.5);
});

test("writeRoleSettings writes a global key and a role key in one backed-up write", () => {
  const dir = mkdtempSync(join(tmpdir(), "role-settings-"));
  const lockPath = join(dir, "omp-plugins.lock.json");
  writeFileSync(lockPath, JSON.stringify({ plugins: { [PLUGIN]: { enabled: true } }, settings: {} }, null, 2));

  const result = writeRoleSettings(lockPath, { slow: DEFAULT_ROLES.slow }, {
    settings: { switchMargin: 0.1, "features.costCap": true },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.roles, ["slow"]);
  assert.ok(result.backupPath !== null);

  const written: unknown = JSON.parse(readFileSync(lockPath, "utf8"));
  const plugin = pluginOf(written);
  assert.equal(plugin.switchMargin, 0.1);
  assert.equal(plugin["features.costCap"], true);
  assert.equal(plugin["roles.slow.weights.general"], DEFAULT_ROLES.slow.weights.general);
  assert.ok(isRecord(written));
  assert.deepEqual(written.plugins, { [PLUGIN]: { enabled: true } });
  assert.equal(readdirSync(dir).filter((f) => f.includes(".bak-")).length, 1);

  const { settings, errors } = resolveSettings(readPluginSettingsMap({ global: lockPath, project: null }));
  assert.deepEqual(errors, []);
  assert.equal(settings.switchMargin, 0.1);
  assert.deepEqual(settings.features, { costCap: true });
});

test("an out-of-range switchMargin is refused with the offending key and no write", () => {
  const dir = mkdtempSync(join(tmpdir(), "role-settings-bad-"));
  const lockPath = join(dir, "omp-plugins.lock.json");
  const seed = JSON.stringify({ plugins: { [PLUGIN]: { enabled: true } }, settings: {} }, null, 2);
  writeFileSync(lockPath, seed);

  const result = writeRoleSettings(lockPath, { slow: DEFAULT_ROLES.slow }, { settings: { switchMargin: 1.5 } });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.errors, ["switchMargin: must be a number in [0, 1], got 1.5"]);
  assert.equal(readFileSync(lockPath, "utf8"), seed);
  assert.equal(readdirSync(dir).filter((f) => f.includes(".bak-")).length, 0);
});

test("writeRoleSettings without settings leaves the global keys alone", () => {
  const dir = mkdtempSync(join(tmpdir(), "role-settings-nosettings-"));
  const lockPath = join(dir, "omp-plugins.lock.json");
  writeFileSync(
    lockPath,
    JSON.stringify({ settings: { [PLUGIN]: { switchMargin: 0.5, "features.costCap": true } } }, null, 2),
  );

  const result = writeRoleSettings(lockPath, { slow: DEFAULT_ROLES.slow });
  assert.equal(result.ok, true);
  const plugin = pluginOf(JSON.parse(readFileSync(lockPath, "utf8")));
  assert.equal(plugin.switchMargin, 0.5);
  assert.equal(plugin["features.costCap"], true);
});

test("writeRoleSettings dryRun validates the global half and writes nothing", () => {
  const dir = mkdtempSync(join(tmpdir(), "role-settings-dry-"));
  const lockPath = join(dir, "omp-plugins.lock.json");
  const seed = JSON.stringify({ settings: {} }, null, 2);
  writeFileSync(lockPath, seed);

  const ok = writeRoleSettings(lockPath, { slow: DEFAULT_ROLES.slow }, { dryRun: true, settings: { switchMargin: 0.1 } });
  assert.equal(ok.ok, true);
  assert.equal(readFileSync(lockPath, "utf8"), seed);

  const bad = writeRoleSettings(lockPath, { slow: DEFAULT_ROLES.slow }, { dryRun: true, settings: { switchMargin: 2 } });
  assert.equal(bad.ok, false);
  assert.equal(readFileSync(lockPath, "utf8"), seed);
});
