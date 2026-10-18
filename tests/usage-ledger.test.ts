import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  USAGE_LEDGER_CAP,
  USAGE_LEDGER_FILE,
  appendUsageRow,
  readUsageRows,
  resolveTokenProfile,
  roleTokenProfile,
  type UsageRow,
} from "../src/usage-ledger.ts";

function row(overrides: Partial<UsageRow> = {}): UsageRow {
  return {
    ts: "2026-10-18T10:00:00.000Z",
    role: "default",
    model: "deepseek/deepseek-v4.1-flash",
    provider: "openrouter",
    input: 1000,
    output: 200,
    cacheRead: 0,
    cacheWrite: 0,
    cost: 0.0012,
    ...overrides,
  };
}

function ledgerLines(dir: string): string[] {
  return readFileSync(join(dir, USAGE_LEDGER_FILE), "utf8")
    .split("\n")
    .filter((l) => l.length > 0);
}

test("a recorded turn appends exactly one row with the expected fields", () => {
  const dir = mkdtempSync(join(tmpdir(), "omp-usage-"));
  const recorded = row();
  appendUsageRow(dir, recorded);

  const written = ledgerLines(dir);
  assert.equal(written.length, 1);
  assert.deepEqual(JSON.parse(written[0]), recorded);
  assert.deepEqual(readUsageRows(dir), [recorded]);
});

test("a missing ledger file degrades to []", () => {
  assert.deepEqual(readUsageRows(mkdtempSync(join(tmpdir(), "omp-usage-"))), []);
});

test("a malformed ledger file degrades to []", () => {
  const dir = mkdtempSync(join(tmpdir(), "omp-usage-"));
  writeFileSync(join(dir, USAGE_LEDGER_FILE), "not json\n{\"broken\":\n");
  assert.deepEqual(readUsageRows(dir), []);
});

test("unparseable or wrongly-shaped lines are skipped, valid rows kept", () => {
  const dir = mkdtempSync(join(tmpdir(), "omp-usage-"));
  const good = row();
  writeFileSync(
    join(dir, USAGE_LEDGER_FILE),
    `garbage\n${JSON.stringify(good)}\n{"ts":"x"}\n${JSON.stringify(row({ input: "1000" }))}\n\n`,
  );
  assert.deepEqual(readUsageRows(dir), [good]);
});

test("the cap holds: appending past USAGE_LEDGER_CAP keeps the newest rows", () => {
  const dir = mkdtempSync(join(tmpdir(), "omp-usage-"));
  for (let i = 0; i < USAGE_LEDGER_CAP + 5; i++) appendUsageRow(dir, row({ input: i }));

  const rows = readUsageRows(dir);
  assert.equal(rows.length, USAGE_LEDGER_CAP);
  assert.equal(rows[0].input, 5); // the five oldest rows were dropped
  assert.equal(rows[rows.length - 1].input, USAGE_LEDGER_CAP + 4);
  // The file is still valid jsonl with exactly cap lines, and no temp file remains.
  assert.equal(ledgerLines(dir).length, USAGE_LEDGER_CAP);
  assert.equal(existsSync(join(dir, `${USAGE_LEDGER_FILE}.tmp`)), false);
});

test("roleTokenProfile returns the median per-turn counts for a role with rows, null without", () => {
  const rows = [
    row({ role: "default", input: 100, output: 10 }),
    row({ role: "default", input: 300, output: 30 }),
    row({ role: "default", input: 200, output: 20 }),
    row({ role: "slow", input: 5000, output: 900 }),
  ];
  assert.deepEqual(roleTokenProfile(rows, "default"), { inputTokens: 200, outputTokens: 20 });
  assert.deepEqual(roleTokenProfile(rows, "slow"), { inputTokens: 5000, outputTokens: 900 });
  assert.equal(roleTokenProfile(rows, "tiny"), null);
  assert.equal(roleTokenProfile([], "default"), null);
});

test("roleTokenProfile interpolates the two middle counts for an even sample", () => {
  const rows = [row({ input: 100, output: 10 }), row({ input: 201, output: 21 })];
  assert.deepEqual(roleTokenProfile(rows, "default"), { inputTokens: 150.5, outputTokens: 15.5 });
});

test("resolveTokenProfile prefers recorded usage, then the setting, then null", () => {
  const rows = [row({ role: "default", input: 100, output: 10 })];
  const setting = { inputTokens: 999, outputTokens: 99 };
  assert.deepEqual(resolveTokenProfile("default", rows, setting), { inputTokens: 100, outputTokens: 10 });
  assert.deepEqual(resolveTokenProfile("tiny", rows, setting), setting);
  assert.equal(resolveTokenProfile("tiny", rows, null), null);
  assert.equal(resolveTokenProfile("tiny", [], null), null);
});

test("appendUsageRow never throws when the ledger cannot be written", () => {
  const dir = mkdtempSync(join(tmpdir(), "omp-usage-"));
  const file = join(dir, "not-a-dir");
  writeFileSync(file, "");
  assert.doesNotThrow(() => appendUsageRow(file, row()));
});
