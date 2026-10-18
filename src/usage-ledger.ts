/**
 * The per-role usage ledger — an append-only jsonl file beside the plugin's
 * state, one row per recorded assistant turn, and the token profile derived
 * from it.
 *
 * - `llm-role-usage.jsonl` — one row per turn (role, model, provider, token
 *   counts, cost). Bounded to `USAGE_LEDGER_CAP` rows: the normal path is a
 *   single append; an over-cap file is compacted to its newest rows via a temp
 *   file + atomic rename, so a crash mid-compaction leaves the original intact.
 * - Recording is best-effort: a failure never breaks a session.
 *
 * The per-task price resolves its token profile from the recorded usage first
 * (the role's median per-turn counts), then the user-set `tokenProfile` setting.
 */

import { appendFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { quantile } from "./agent-create.ts";
import { isRecord } from "./guards.ts";

export type UsageRow = {
  ts: string;
  role: string;
  model: string;
  provider: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
};

export type TokenProfile = { inputTokens: number; outputTokens: number };

export const USAGE_LEDGER_FILE = "llm-role-usage.jsonl";
export const USAGE_LEDGER_CAP = 2000;

const STRING_FIELDS = ["ts", "role", "model", "provider"] as const;
const NUMBER_FIELDS = ["input", "output", "cacheRead", "cacheWrite", "cost"] as const;

/** A parsed line is a row only when every field is present with the right type;
 *  anything else is a malformed line the reader skips. */
function toUsageRow(v: unknown): UsageRow | null {
  if (!isRecord(v)) return null;
  for (const k of STRING_FIELDS) if (typeof v[k] !== "string") return null;
  for (const k of NUMBER_FIELDS) if (typeof v[k] !== "number" || !Number.isFinite(v[k])) return null;
  return {
    ts: v.ts as string,
    role: v.role as string,
    model: v.model as string,
    provider: v.provider as string,
    input: v.input as number,
    output: v.output as number,
    cacheRead: v.cacheRead as number,
    cacheWrite: v.cacheWrite as number,
    cost: v.cost as number,
  };
}

/** Keep the newest `USAGE_LEDGER_CAP` rows: temp file + atomic rename, so a
 *  crash mid-compaction leaves the original file intact. */
function compactIfOverCap(dir: string, path: string): void {
  const lines = readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.length > 0);
  if (lines.length <= USAGE_LEDGER_CAP) return;
  const tmp = join(dir, `${USAGE_LEDGER_FILE}.tmp`);
  writeFileSync(tmp, `${lines.slice(-USAGE_LEDGER_CAP).join("\n")}\n`);
  renameSync(tmp, path);
}

/** Append one row; best-effort — a recording failure never throws. */
export function appendUsageRow(dir: string, row: UsageRow): void {
  try {
    mkdirSync(dir, { recursive: true });
    const path = join(dir, USAGE_LEDGER_FILE);
    appendFileSync(path, `${JSON.stringify(row)}\n`);
    compactIfOverCap(dir, path);
  } catch {
    // best-effort: never break a session over a ledger write
  }
}

/** Tolerant read: a missing, unreadable, or malformed file degrades to []; an
 *  unparseable or wrongly-shaped line is skipped. */
export function readUsageRows(dir: string): UsageRow[] {
  let text: string;
  try {
    text = readFileSync(join(dir, USAGE_LEDGER_FILE), "utf8");
  } catch {
    return [];
  }
  const rows: UsageRow[] = [];
  for (const line of text.split("\n")) {
    if (line.length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    const row = toUsageRow(parsed);
    if (row) rows.push(row);
  }
  return rows;
}

/** The role's median per-turn input/output counts, or null when it has no rows.
 *  The median is `agent-create.ts`'s `quantile(values, 0.5)` — the repo's one
 *  quantile convention (linear interpolation), not a second implementation. */
export function roleTokenProfile(rows: readonly UsageRow[], role: string): TokenProfile | null {
  const mine = rows.filter((r) => r.role === role);
  if (mine.length === 0) return null;
  return {
    inputTokens: quantile(mine.map((r) => r.input), 0.5),
    outputTokens: quantile(mine.map((r) => r.output), 0.5),
  };
}

/** Precedence: the recorded usage, then the user-set setting, then null. */
export function resolveTokenProfile(
  role: string,
  rows: readonly UsageRow[],
  setting: TokenProfile | null,
): TokenProfile | null {
  return roleTokenProfile(rows, role) ?? setting;
}
