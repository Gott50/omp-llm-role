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
