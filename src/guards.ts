/**
 * The package's one canonical type guard (this repo has no schema-validator
 * dependency). Plain-object check: arrays and null are not records, so merge
 * and envelope code can rely on `Record<string, unknown>` narrowing.
 */
export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
