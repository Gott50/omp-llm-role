import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parseRemoveAgentArgs, removeAgent, type RemoveAgentRequest } from "../src/agent-remove.ts";
import { parseConfig } from "../src/config-edit.ts";
import { isRecord } from "../src/guards.ts";
import { mergeRemove, removeRoleSettings } from "../src/role-settings.ts";
import { readPluginSettingsMap, resolveSettings } from "../src/settings.ts";
import { runUpdater } from "../src/updater.ts";
import { fakeDeps, makeModel, runInTempDir, setupAgentDir } from "./helpers.ts";

const MODELS = [makeModel("model-a", 90, 1, 100), makeModel("model-b", 80, 5, 60)];

/** Temp home: a lock file with a plugins block, plus an agents dir the plugin
 * resolves through `OMP_LLM_ROLE_AGENT_DIR` (src/state.ts `agentDir`). */
function workspace(): { dir: string; lockPath: string; agentsDir: string } {
  const dir = mkdtempSync(join(tmpdir(), "remove-agent-"));
  const lockPath = join(dir, "omp-plugins.lock.json");
  writeFileSync(lockPath, JSON.stringify({ plugins: { "omp-llm-role": { enabled: true } }, settings: {} }, null, 2));
  process.env.OMP_LLM_ROLE_AGENT_DIR = dir;
  return { dir, lockPath, agentsDir: join(dir, "agents") };
}

/** Seed a user-created role (flat dotted keys) and its agent file. */
function seedUserRole(lockPath: string, agentsDir: string, name: string): void {
  const lock = JSON.parse(readFileSync(lockPath, "utf8")) as { settings: Record<string, unknown> };
  lock.settings["omp-llm-role"] = {
    [`roles.${name}.description`]: "user role",
    [`roles.${name}.required`]: ["general", "price", "throughput"],
    [`roles.${name}.weights.general`]: 0.5,
    [`roles.${name}.weights.price`]: 0.25,
    [`roles.${name}.weights.throughput`]: 0.25,
  };
  writeFileSync(lockPath, JSON.stringify(lock, null, 2));
  mkdirSync(agentsDir, { recursive: true });
  writeFileSync(join(agentsDir, `${name}.md`), `---\nname: ${name}\ndescription: d\nmodel: "@${name}, @default"\n---\n\nBody.\n`);
}

function request(lockPath: string, over: Partial<RemoveAgentRequest> = {}): RemoveAgentRequest {
  return { name: "changelog", dryRun: false, lockPath, ...over };
}

test("removeAgent deletes the role and the agent file, with a backup", () => {
  const { lockPath, agentsDir } = workspace();
  seedUserRole(lockPath, agentsDir, "changelog");

  const result = removeAgent(request(lockPath));
  assert.ok(result.ok, result.ok ? "" : result.errors.join("; "));
  assert.equal(result.roleRemoved, true);
  assert.deepEqual(result.agentPaths, [join(agentsDir, "changelog.md")]);
  assert.ok(result.backupPath !== null && existsSync(result.backupPath));

  assert.equal(existsSync(join(agentsDir, "changelog.md")), false);
  const { settings, errors } = resolveSettings(readPluginSettingsMap({ global: lockPath, project: null }));
  assert.deepEqual(errors, []);
  assert.equal("changelog" in settings.roles, false);
  // The plugins block and the sibling settings key survive.
  const written = JSON.parse(readFileSync(lockPath, "utf8")) as { plugins: unknown; settings: Record<string, unknown> };
  assert.deepEqual(written.plugins, { "omp-llm-role": { enabled: true } });
  assert.deepEqual(written.settings["omp-llm-role"], {});
});

test("removeAgent refuses a shipped default role", () => {
  const { lockPath } = workspace();
  const result = removeAgent(request(lockPath, { name: "slow" }));
  assert.equal(result.ok, false);
  assert.ok(!result.ok && result.errors.some((e) => e.includes("shipped default")));
});

test("removeAgent refuses a reserved or invalid name", () => {
  const { lockPath } = workspace();
  const reserved = removeAgent(request(lockPath, { name: "main" }));
  assert.equal(reserved.ok, false);
  assert.ok(!reserved.ok && reserved.errors.some((e) => e.includes("reserved")));
  const invalid = removeAgent(request(lockPath, { name: "bad name" }));
  assert.equal(invalid.ok, false);
  assert.ok(!invalid.ok && invalid.errors.some((e) => e.includes("must match")));
});

test("removeAgent errors when there is nothing to remove", () => {
  const { lockPath, agentsDir } = workspace();
  const result = removeAgent(request(lockPath));
  assert.equal(result.ok, false);
  assert.ok(!result.ok && result.errors[0].includes("nothing to remove"));
  assert.equal(existsSync(agentsDir), false);
});

test("removeAgent --dry-run writes nothing", () => {
  const { lockPath, agentsDir } = workspace();
  seedUserRole(lockPath, agentsDir, "changelog");
  const lockBefore = readFileSync(lockPath, "utf8");

  const result = removeAgent(request(lockPath, { dryRun: true }));
  assert.ok(result.ok);
  assert.equal(result.roleRemoved, true);
  assert.equal(result.dryRun, true);
  assert.equal(readFileSync(lockPath, "utf8"), lockBefore);
  assert.equal(existsSync(join(agentsDir, "changelog.md")), true);
  assert.deepEqual(readdirSync(agentsDir), ["changelog.md"]);
});

test("removeAgent removes the agent file from both user and project scopes", () => {
  const { lockPath, agentsDir } = workspace();
  const anchor = mkdtempSync(join(tmpdir(), "remove-agent-project-"));
  const projectAgents = join(anchor, ".omp", "agents");
  seedUserRole(lockPath, agentsDir, "changelog");
  mkdirSync(projectAgents, { recursive: true });
  writeFileSync(join(projectAgents, "changelog.md"), "---\nname: changelog\nmodel: \"@changelog, @default\"\n---\n\nBody.\n");

  const result = removeAgent(request(lockPath, { projectAnchor: anchor }));
  assert.ok(result.ok, result.ok ? "" : result.errors.join("; "));
  assert.deepEqual(result.agentPaths.sort(), [join(agentsDir, "changelog.md"), join(projectAgents, "changelog.md")].sort());
  assert.equal(existsSync(join(agentsDir, "changelog.md")), false);
  assert.equal(existsSync(join(projectAgents, "changelog.md")), false);
});

test("removeAgent removes a role that has no agent file", () => {
  const { lockPath } = workspace();
  const lock = JSON.parse(readFileSync(lockPath, "utf8")) as { settings: Record<string, unknown> };
  lock.settings["omp-llm-role"] = { "roles.orphan.weights.general": 1 };
  writeFileSync(lockPath, JSON.stringify(lock, null, 2));

  const result = removeAgent(request(lockPath, { name: "orphan" }));
  assert.ok(result.ok, result.ok ? "" : result.errors.join("; "));
  assert.equal(result.roleRemoved, true);
  assert.deepEqual(result.agentPaths, []);
});

test("mergeRemove deletes flat keys and nested entries, preserving siblings", () => {
  const existing = {
    plugins: { "omp-llm-role": { enabled: true } },
    settings: {
      "omp-llm-role": {
        switchMargin: 0.5,
        "roles.gone.description": "x",
        "roles.gone.weights.general": 1,
        "roles.keep.description": "y",
        roles: { nested: { description: "z" }, gone: { description: "old" } },
      },
    },
  };
  const merged = mergeRemove(existing, ["gone"]);
  assert.ok("lock" in merged);
  assert.deepEqual(merged.removed, ["gone"]);
  const lock = merged.lock as { settings: { "omp-llm-role": Record<string, unknown> } };
  const plugin = lock.settings["omp-llm-role"];
  assert.equal(plugin["roles.gone.description"], undefined);
  assert.equal(plugin["roles.gone.weights.general"], undefined);
  assert.equal(plugin["roles.keep.description"], "y");
  assert.equal(plugin.switchMargin, 0.5);
  assert.deepEqual(plugin.roles, { nested: { description: "z" } });
  // The input is cloned, never mutated.
  const original = existing.settings["omp-llm-role"] as Record<string, unknown>;
  assert.equal(original["roles.gone.description"], "x");
});

test("mergeRemove reports a name with no entry as not removed", () => {
  const merged = mergeRemove({ settings: { "omp-llm-role": { "roles.keep.description": "y" } } }, ["absent"]);
  assert.ok("lock" in merged);
  assert.deepEqual(merged.removed, []);
});

test("removeRoleSettings writes with a backup and stays valid", () => {
  const dir = mkdtempSync(join(tmpdir(), "remove-role-"));
  const lockPath = join(dir, "omp-plugins.lock.json");
  writeFileSync(
    lockPath,
    JSON.stringify({ plugins: { "omp-llm-role": { enabled: true } }, settings: { "omp-llm-role": { "roles.gone.description": "x" } } }, null, 2),
  );

  const result = removeRoleSettings(lockPath, ["gone"]);
  assert.ok(result.ok);
  assert.deepEqual(result.roles, ["gone"]);
  assert.ok(result.backupPath !== null);
  assert.equal(readdirSync(dir).filter((f) => f.includes(".bak-")).length, 1);
  const written = JSON.parse(readFileSync(lockPath, "utf8")) as { settings: { "omp-llm-role": Record<string, unknown> } };
  assert.deepEqual(written.settings["omp-llm-role"], {});
});

test("removeRoleSettings --dry-run validates without touching the file", () => {
  const dir = mkdtempSync(join(tmpdir(), "remove-role-dry-"));
  const lockPath = join(dir, "omp-plugins.lock.json");
  writeFileSync(lockPath, JSON.stringify({ settings: { "omp-llm-role": { "roles.gone.description": "x" } } }, null, 2));
  const before = readFileSync(lockPath, "utf8");

  const result = removeRoleSettings(lockPath, ["gone"], { dryRun: true });
  assert.ok(result.ok);
  assert.deepEqual(result.roles, ["gone"]);
  assert.equal(readFileSync(lockPath, "utf8"), before);
  assert.deepEqual(readdirSync(dir), ["omp-plugins.lock.json"]);
});

test("parseRemoveAgentArgs parses flags and rejects a bad scope", () => {
  const ok = parseRemoveAgentArgs(["--name", "changelog", "--scope", "project", "--yes", "--dry-run"]);
  assert.ok(ok.ok);
  assert.equal(ok.request.name, "changelog");
  assert.equal(ok.request.scope, "project");
  assert.equal(ok.request.dryRun, true);
  assert.equal(ok.yes, true);

  const bad = parseRemoveAgentArgs(["--name", "x", "--scope", "global"]);
  assert.equal(bad.ok, false);
  const missing = parseRemoveAgentArgs([]);
  assert.equal(missing.ok, false);
});

// The remove flow's config cleanup: the updater drops the stale
// `modelRoles.<name>` line (role left the managed set) and the plugin-managed
// `task.disabledAgents` entry (state `managedDisabledAgents`).
test("the updater drops a removed agent's disabledAgents entry", async () => {
  const dir = setupAgentDir('modelRoles:\n  default: openrouter/org/model-a:auto\ntask:\n  disabledAgents:\n    - "myagent"\n', {
    lastRunDay: null,
    managedRoles: [],
    roleLastSelector: {},
    pluginWrittenChainKeys: [],
    managedDisabledAgents: ["myagent"],
    previousModelRoles: null,
  });
  // No agent file for `myagent` — it was removed.
  const result = await runInTempDir(dir, () => runUpdater("manual", fakeDeps(MODELS), { force: true }));
  assert.equal(result.aborted, undefined);
  const disabled = parseConfig(readFileSync(join(dir, "config.yml"), "utf8")).disabledAgents;
  assert.ok(!disabled.includes("myagent"), `expected myagent removed from ${JSON.stringify(disabled)}`);
  const state = JSON.parse(readFileSync(join(dir, "llm-role-state.json"), "utf8")) as { managedDisabledAgents: string[] };
  assert.deepEqual(state.managedDisabledAgents, ["designer"]);
});

test("the updater prunes modelRoles for a role removed from settings", async () => {
  const dir = setupAgentDir("modelRoles:\n  default: openrouter/org/model-a:auto\n  changelog: openrouter/org/model-b\n", {
    lastRunDay: null,
    managedRoles: ["default", "changelog"],
    roleLastSelector: {},
    pluginWrittenChainKeys: [],
    managedDisabledAgents: [],
    previousModelRoles: null,
  });
  const result = await runInTempDir(dir, () => runUpdater("manual", fakeDeps(MODELS), { force: true }));
  assert.equal(result.aborted, undefined);
  const parsed = parseConfig(readFileSync(join(dir, "config.yml"), "utf8"));
  assert.equal("changelog" in parsed.modelRoles, false);
  assert.equal(parsed.modelRoles.default, "openrouter/org/model-a:auto");
});

test("create then remove leaves no role, agent, or modelRoles entry", async () => {
  const { lockPath, agentsDir } = workspace();
  seedUserRole(lockPath, agentsDir, "changelog");

  const removed = removeAgent(request(lockPath));
  assert.ok(removed.ok, removed.ok ? "" : removed.errors.join("; "));

  const dir = setupAgentDir("modelRoles:\n  default: openrouter/org/model-a:auto\n  changelog: openrouter/org/model-b\n", {
    lastRunDay: null,
    managedRoles: ["default", "changelog"],
    roleLastSelector: {},
    pluginWrittenChainKeys: [],
    managedDisabledAgents: [],
    previousModelRoles: null,
  });
  const result = await runInTempDir(dir, () => runUpdater("manual", fakeDeps(MODELS), { force: true }));
  assert.equal(result.aborted, undefined);

  const parsed = parseConfig(readFileSync(join(dir, "config.yml"), "utf8"));
  assert.equal("changelog" in parsed.modelRoles, false);
  const { settings } = resolveSettings(readPluginSettingsMap({ global: lockPath, project: null }));
  assert.equal("changelog" in settings.roles, false);
  assert.equal(existsSync(join(agentsDir, "changelog.md")), false);
  assert.ok(isRecord(JSON.parse(readFileSync(lockPath, "utf8"))));
});
