/**
 * Availability model (SPEC §5): what the user's OpenRouter key can actually run.
 *
 * OpenRouter exposes no per-key model allowlist — availability is derived from
 * key tier + budget (tier gate), then every candidate must resolve to a concrete
 * entry in the omp catalog (provider "openrouter"), i.e. a selector omp can
 * dispatch. Ranking rows (llm-stats bare ids) map to catalog ids through
 * `resolveVariant` (exact -> newest dated -> bare -> ~org/…-latest alias).
 */
import { isRecord } from "./guards.ts";

export type CatalogEntry = {
  provider: string;
  id: string;
  selector: string;
  name: string;
  contextWindow: number | null;
  maxTokens: number | null;
  reasoning: boolean;
  thinking: string[];
  input: string[];
  cost: { input: number; output: number } | null;
};

export type KeyMeta = {
  isFreeTier: boolean;
  limitRemaining: number;
  freeRemaining: number;
  creditsRemaining: number;
};

export type Tier = "billed" | "free" | "none";

const OPENROUTER_KEY_URL = "https://openrouter.ai/api/v1/key";
const OPENROUTER_CREDITS_URL = "https://openrouter.ai/api/v1/credits";

/** Thinking levels omp selectors may carry (`provider/model[:level]`). */
export const THINKING_LEVELS: Record<string, true> = {
  off: true,
  minimal: true,
  low: true,
  medium: true,
  high: true,
  xhigh: true,
  max: true,
  auto: true,
};

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/**
 * Bearer GETs of the key and credits endpoints with the omp-resolved token.
 * Both responses wrap their payload in `data`. Throws on non-OK — the caller
 * aborts (§9: without tier info no selector is trustworthy).
 */
export async function fetchKeyMeta(token: string, fetchImpl: typeof fetch = fetch): Promise<KeyMeta> {
  const headers = { authorization: `Bearer ${token}` };
  const keyRes = await fetchImpl(OPENROUTER_KEY_URL, { headers });
  if (!keyRes.ok) throw new Error(`openrouter ${OPENROUTER_KEY_URL}: HTTP ${keyRes.status}`);
  const creditsRes = await fetchImpl(OPENROUTER_CREDITS_URL, { headers });
  if (!creditsRes.ok) throw new Error(`openrouter ${OPENROUTER_CREDITS_URL}: HTTP ${creditsRes.status}`);
  const keyJson: unknown = await keyRes.json();
  const creditsJson: unknown = await creditsRes.json();
  const key = isRecord(keyJson) && isRecord(keyJson.data) ? keyJson.data : null;
  const credits = isRecord(creditsJson) && isRecord(creditsJson.data) ? creditsJson.data : null;
  if (!key || !credits) throw new Error("openrouter key/credits: unexpected payload shape");
  const freeReq = isRecord(key.free_model_daily_requests) ? key.free_model_daily_requests : {};
  return {
    isFreeTier: key.is_free_tier === true,
    limitRemaining: num(key.limit_remaining),
    freeRemaining: num(freeReq.remaining),
    creditsRemaining: num(credits.total_credits) - num(credits.total_usage),
  };
}

/** Tier gate (SPEC §5.2): billed budget wins, else free daily quota, else run aborts. */
export function tierGate(meta: KeyMeta): Tier {
  const billedUsable = !meta.isFreeTier && meta.limitRemaining > 0 && meta.creditsRemaining > 0;
  if (billedUsable) return "billed";
  if (meta.freeRemaining > 0) return "free";
  return "none";
}

/** Keep openrouter catalog rows the tier may run: never `:batch`; `:free` only on free tier. */
export function filterCatalog(catalog: CatalogEntry[], tier: Tier): CatalogEntry[] {
  if (tier === "none") return [];
  return catalog.filter((c) => {
    if (c.provider !== "openrouter" || c.id.endsWith(":batch")) return false;
    return tier === "free" ? c.id.endsWith(":free") : !c.id.endsWith(":free");
  });
}

/** Ranking-row identity of a catalog id: suffix after the last `/`, minus `:free`, minus `-latest`. */
export function rankingIdOf(catalogId: string): string {
  const suffix = catalogId.slice(catalogId.lastIndexOf("/") + 1);
  const noFree = suffix.endsWith(":free") ? suffix.slice(0, -":free".length) : suffix;
  return noFree.endsWith("-latest") ? noFree.slice(0, -"-latest".length) : noFree;
}

/** Identity of a configured selector for hysteresis/chain keys: drop `:level`, `openrouter/`, then rankingIdOf. */
export function currentRankingId(selector: string): string {
  const colon = selector.lastIndexOf(":");
  const base = colon !== -1 && selector.slice(colon + 1) in THINKING_LEVELS ? selector.slice(0, colon) : selector;
  const unprefixed = base.startsWith("openrouter/") ? base.slice("openrouter/".length) : base;
  return rankingIdOf(unprefixed);
}

// "Newest dated" = trailing -MMDD or -YYYYMMDD (max numeric wins; ties lexicographic).
const DATED_RE = /-(\d{4}|\d{8})$/;

/**
 * Map a ranking row id (llm-stats bare id) to a concrete catalog id among
 * tier-eligible candidates (SPEC §5.4). Candidates match when their suffix after
 * the last `/` equals the ranking id, possibly after stripping `:free` and one
 * `-latest` (org prefixes, including `~`-prefixed, are ignored for matching).
 * Order: exact id -> newest dated -> bare -> `~org/…-latest` alias (last resort —
 * a valid selector beats no update). Never emits `:batch`; `:free` only on the
 * free tier. Ties break lexicographically. Null when nothing matches.
 */
export function resolveVariant(rankingId: string, candidates: CatalogEntry[], tier: "billed" | "free"): string | null {
  const pool = candidates
    .filter((c) => c.provider === "openrouter" && !c.id.endsWith(":batch") && (tier === "free" || !c.id.endsWith(":free")))
    .filter((c) => rankingIdOf(c.id) === rankingId)
    .map((c) => ({ id: c.id, bare: c.id.slice(c.id.lastIndexOf("/") + 1).replace(/:free$/, "") }));
  if (pool.length === 0) return null;
  const minLex = pool.reduce((a, b) => (b.id < a.id ? b : a));
  const exact = pool.filter((c) => c.bare === rankingId && !c.id.startsWith("~"));
  if (exact.length > 0) return exact.reduce((a, b) => (b.id < a.id ? b : a)).id;
  if (DATED_RE.test(rankingId)) {
    // The ranking id is itself dated: a ~-prefixed exact form still beats the alias.
    const datedExact = pool.filter((c) => c.bare === rankingId);
    if (datedExact.length > 0) return datedExact.reduce((a, b) => (b.id < a.id ? b : a)).id;
  }
  return minLex.id; // newest dated (equal dates) or ~org/…-latest alias — last resort
}

/**
 * Tolerant parser for `omp models ls --json` output (`{"models": [...]}`) —
 * shared by the CLI report, the update shim, and anywhere else that consumes
 * omp's catalog. Unknown-shaped rows are skipped; missing optional fields default.
 */
export function catalogFromOmpModelsJson(v: unknown): CatalogEntry[] {
  if (!isRecord(v) || !Array.isArray(v.models)) return [];
  const out: CatalogEntry[] = [];
  for (const row of v.models) {
    if (!isRecord(row)) continue;
    if (typeof row.provider !== "string" || typeof row.id !== "string") continue;
    const thinking = Array.isArray(row.thinking) ? row.thinking.filter((t): t is string => typeof t === "string") : [];
    const input = Array.isArray(row.input) ? row.input.filter((t): t is string => typeof t === "string") : [];
    const cost = isRecord(row.cost) && typeof row.cost.input === "number" && typeof row.cost.output === "number"
      ? { input: row.cost.input, output: row.cost.output }
      : null;
    out.push({
      provider: row.provider,
      id: row.id,
      selector: typeof row.selector === "string" ? row.selector : `${row.provider}/${row.id}`,
      name: typeof row.name === "string" ? row.name : row.id,
      contextWindow: typeof row.contextWindow === "number" ? row.contextWindow : null,
      maxTokens: typeof row.maxTokens === "number" ? row.maxTokens : null,
      reasoning: row.reasoning === true,
      thinking,
      input,
      cost,
    });
  }
  return out;
}
