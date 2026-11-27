/**
 * Ranking-row identity: the one home of the catalog-id -> ranking-id
 * normalization and the dated-suffix pattern. A leaf module with no imports, so
 * both `availability.ts` and `provider-priority.ts` can share it without a
 * cycle (the two modules import each other's types/functions).
 */

/** Trailing -MMDD or -YYYYMMDD date suffix. */
export const DATED_RE = /-(\d{4}|\d{8})$/;

/** Ranking-row identity of a catalog id: suffix after the last `/`, minus `:free`, minus one `-latest`. */
export function rankingIdOf(catalogId: string): string {
  const suffix = catalogId.slice(catalogId.lastIndexOf("/") + 1);
  const noFree = suffix.endsWith(":free") ? suffix.slice(0, -":free".length) : suffix;
  return noFree.endsWith("-latest") ? noFree.slice(0, -"-latest".length) : noFree;
}
