import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parseConfig } from "../src/config-edit.ts";
import { writeRoleSettings } from "../src/role-settings.ts";
import { DEFAULT_ROLES, readPluginSettingsMap, resolveSettings } from "../src/settings.ts";
import { runUpdater } from "../src/updater.ts";
import { fakeDeps, makeModel, runInTempDir, setupAgentDir } from "./helpers.ts";

const MODELS = [makeModel("model-a", 90, 1, 100), makeModel("model-b", 80, 5, 60)];

const CONFIG = "modelRoles:\n  default: openrouter/org/model-a\n  slow: openrouter/org/model-b\n";
const STATE = {
  lastRunDay: null,
  managedRoles: ["default", "slow"],
  roleLastSelector: {},
  pluginWrittenChainKeys: [],
  previousModelRoles: null,
};

// Issue #2: the explorer's enable/disable toggle exports `enabled` through the
// validated write path; the updater drops a disabled role's pin and restores it
// when re-enabled. The lock file is the round-trip medium.
test("disabling a role writes enabled:false and drops it from the resolved set", () => {
  const dir = mkdtempSync(join(tmpdir(), "role-enable-"));
  const lockPath = join(dir, "omp-plugins.lock.json");
  writeFileSync(lockPath, JSON.stringify({ plugins: { "omp-llm-role": { enabled: true } }, settings: {} }, null, 2));

  const result = writeRoleSettings(lockPath, { slow: { ...DEFAULT_ROLES.slow, enabled: false } });
  assert.equal(result.ok, true);

  const written = JSON.parse(readFileSync(lockPath, "utf8")) as {
    settings: { "omp-llm-role": { roles: { slow: { enabled: boolean; weights: Record<string, number> } } } };
  };
  assert.equal(written.settings["omp-llm-role"].roles.slow.enabled, false);
  // The def rides along untouched; only the gate flipped.
  assert.deepEqual(written.settings["omp-llm-role"].roles.slow.weights, DEFAULT_ROLES.slow.weights);

  const { settings, errors } = resolveSettings(readPluginSettingsMap({ global: lockPath, project: null }));
  assert.deepEqual(errors, []);
  assert.equal("slow" in settings.roles, false);
});

test("enable/disable round-trips through the updater's modelRoles line", async () => {
  // Disable: the stale `slow` pin must go, other roles' lines stay.
  const offDir = setupAgentDir(CONFIG, structuredClone(STATE));
  const offSettings = { "roles.slow.enabled": false };
  const off = await runInTempDir(offDir, () => runUpdater("manual", fakeDeps(MODELS, offSettings), { force: true }));
  assert.equal(off.aborted, undefined);
  const offParsed = parseConfig(readFileSync(join(offDir, "config.yml"), "utf8"));
  assert.equal(offParsed.modelRoles.slow, undefined);
  assert.ok(offParsed.modelRoles.default !== undefined);
  // Sibling settings are an input: resolveSettings clones, so the map is untouched.
  assert.deepEqual(offSettings, { "roles.slow.enabled": false });

  // Re-enable: the role is ranked again and its line rewritten.
  const onDir = setupAgentDir(CONFIG, structuredClone(STATE));
  const on = await runInTempDir(onDir, () => runUpdater("manual", fakeDeps(MODELS, { "roles.slow.enabled": true }), { force: true }));
  assert.equal(on.aborted, undefined);
  assert.ok(on.decisions.some((d) => d.role === "slow"));
  const onParsed = parseConfig(readFileSync(join(onDir, "config.yml"), "utf8"));
  assert.ok(onParsed.modelRoles.slow !== undefined);
});
