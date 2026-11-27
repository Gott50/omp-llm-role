/**
 * Provider priority: the single home of the provider vocabulary (issue #116).
 *
 * A user can prioritize any omp provider (the first path segment of a selector,
 * e.g. `flocta` or `openrouter`) so the plugin picks models that provider
 * actually offers, writes selectors that route to it, and falls back to the
 * other providers. This module is pure: no I/O, no network, no subprocess.
 *
 * The priority list is a list of **omp provider ids**, not OpenRouter route
 * slugs. `openrouter` in the list means the OpenRouter gateway (the model's own
 * OpenRouter selector), not a route slug. The existing `providerPin` remains the
 * OpenRouter route slug (`@<slug>`); the two fields are distinct.
 *
 * Empty priority list + zero bonus is byte-identical to today's behavior: every
 * model's effective provider is `openrouter`, the bonus is 0 and the price
 * source is `openrouter`.
 *
 * Import note: this module imports **types only** from `availability.ts` and
 * `engine.ts` (the frozen contract, CONTEXT.md §2). T4 rewrites
 * `availability.ts` to call into this module, so a runtime import here would
 * close a real cycle. `rankingIdOf` is therefore mirrored locally (a stable
 * 5-line suffix normalization) rather than imported; the deviation from the
 * "reuse it" guidance is deliberate and reported.
 */
import type { CatalogEntry } from "./availability.ts";
import type { Model } from "./engine.ts";

/** One provider's offer of a model: the provider's catalog id (the selector's
 * model part), the 3:1 in:out blend of the catalog cost when non-zero (else
 * null = available, no own price), and that provider's thinking-level list. */
export type ProviderOffer = { catalogId: string; price: number | null; thinking: string[] };

/**
 * Where a ranked model's price basis came from.
 *
 * - `openrouter`: the model's own OpenRouter blend (effective provider is the
 *   gateway).
 * - `reference`: the effective non-OpenRouter provider's catalog cost — omp's
 *   **reference hydration** of the model's list price, not the provider's own
 *   rate.
 * - `openrouter-proxy`: the effective non-OpenRouter provider has no own price,
 *   so the OpenRouter blend is used as a labelled proxy.
 * - `provider`: reserved label for an exact provider rate (a `modelOverrides`
 *   cost in the provider's `models.yml`). Not emitted today — the catalog cost
 *   is always a reference price — but kept in the union so the explorer and the
 *   docs can name the future state without a breaking type change.
 */
export type PriceSource = "openrouter" | "provider" | "reference" | "openrouter-proxy";

const OPENROUTER = "openrouter";
/** Trailing -MMDD or -YYYYMMDD date suffix (same shape as `availability.ts`). */
const DATED_RE = /-(\d{4}|\d{8})$/;

/** Ranking-row identity of a catalog id: suffix after the last `/`, minus
 * `:free`, minus one `-latest`. Mirrors `availability.ts`'s `rankingIdOf`
 * (kept local so this module imports types only — see the import note). */
function rankingIdOf(catalogId: string): string {
  const suffix = catalogId.slice(catalogId.lastIndexOf("/") + 1);
  const noFree = suffix.endsWith(":free") ? suffix.slice(0, -":free".length) : suffix;
  return noFree.endsWith("-latest") ? noFree.slice(0, -"-latest".length) : noFree;
}

/**
 * The provider of a selector: its first path segment. A trailing `:level` and
 * an `@<slug>` pin always ride after the model part (after the first `/`), so
 * they never affect the first segment; a bare selector with no `/` is
 * `openrouter` (today's implicit provider).
 *
 *   providerOf("flocta/deepseek-v4.1-flash:high")      -> "flocta"
 *   providerOf("openrouter/x@deepinfra/fp8")           -> "openrouter"
 *   providerOf("deepseek-v4.1-flash")                  -> "openrouter"
 */
export function providerOf(selector: string): string {
  const slash = selector.indexOf("/");
  return slash === -1 ? OPENROUTER : selector.slice(0, slash);
}

/**
 * The provider order: the priority list deduped, order preserved, with
 * `openrouter` appended last when absent (the implicit last resort). Empty
 * strings are skipped so a malformed lock value cannot produce an empty
 * provider id.
 */
export function providerOrder(priority: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const provider of priority) {
    if (typeof provider !== "string" || provider.length === 0 || seen.has(provider)) continue;
    seen.add(provider);
    out.push(provider);
  }
  if (!seen.has(OPENROUTER)) out.push(OPENROUTER);
  return out;
}

/** 3:1 in:out blend of a catalog cost; null when the cost is absent or the
 * blend is not positive (a zero/unknown cost is "available, no own price"). */
function blendPrice(cost: { input: number; output: number } | null): number | null {
  if (!cost) return null;
  const blend = (3 * cost.input + cost.output) / 4;
  return blend > 0 ? blend : null;
}

function isDated(id: string): boolean {
  return DATED_RE.test(id);
}

function stripDate(id: string): string {
  return isDated(id) ? id.replace(DATED_RE, "") : id;
}

function dateOf(id: string): number {
  const m = id.match(DATED_RE);
  return m ? Number(m[1]) : 0;
}

/** A provider's `auto` pseudo-model and any id that already carries the
 * provider prefix are excluded from the join (they would produce a
 * double-prefixed selector). */
function isExcludedRow(row: CatalogEntry, provider: string): boolean {
  if (rankingIdOf(row.id) === "auto") return true;
  return row.id.startsWith(`${provider}/`);
}

/**
 * Match rank of a provider row against a model id, mirroring OpenRouter's
 * variant chain: exact -> newest dated -> bare -> alias. Lower rank wins; the
 * `date` breaks ties within the "newest dated" ranks (higher = newer).
 *
 * - 0 exact (non-`~`): the row's ranking id equals the model id.
 * - 1 newest dated (non-`~`): the model id is undated and the row is a dated
 *   variant of it (`model-1017`).
 * - 2 bare (non-`~`): the model id is dated and the row is its undated form.
 * - 3 alias exact (`~`): a `~org/…-latest` row whose ranking id equals the
 *   model id.
 * - 4 alias dated (`~`): a `~` row that is a dated variant of an undated model.
 * - 5 alias bare (`~`): a `~` row that is the undated form of a dated model.
 */
function matchOf(modelId: string, rowId: string): { rank: number; date: number } | null {
  const rid = rankingIdOf(rowId);
  const alias = rowId.startsWith("~");
  const modelDated = isDated(modelId);
  const ridDated = isDated(rid);
  const date = ridDated ? dateOf(rid) : 0;
  if (rid === modelId) return { rank: alias ? 3 : 0, date };
  if (!modelDated && ridDated && stripDate(rid) === modelId) return { rank: alias ? 4 : 1, date };
  if (modelDated && rid === stripDate(modelId)) return { rank: alias ? 5 : 2, date: 0 };
  return null;
}

/** The provider's catalog row for a model id, or null when the provider does
 * not offer it. Provider-scoped: only rows with `row.provider === provider`. */
function providerRowFor(modelId: string, provider: string, catalog: readonly CatalogEntry[]): CatalogEntry | null {
  let best: { row: CatalogEntry; rank: number; date: number } | null = null;
  for (const row of catalog) {
    if (row.provider !== provider || isExcludedRow(row, provider)) continue;
    const match = matchOf(modelId, row.id);
    if (!match) continue;
    if (!best) {
      best = { row, ...match };
      continue;
    }
    if (match.rank !== best.rank) {
      if (match.rank < best.rank) best = { row, ...match };
      continue;
    }
    // Same rank: "newest dated" prefers the higher date; every other rank
    // breaks ties lexicographically (the resolveVariant convention).
    if ((match.rank === 1 || match.rank === 4) && match.date !== best.date) {
      if (match.date > best.date) best = { row, ...match };
      continue;
    }
    if (row.id < best.row.id) best = { row, ...match };
  }
  return best?.row ?? null;
}

/** The provider's catalog id for a ranking model id, or null when the provider
 * does not offer it. The provider-scoped variant chain (exact -> newest dated ->
 * bare -> alias), `auto`/prefixed rows excluded. */
export function providerCatalogIdFor(modelId: string, provider: string, catalog: readonly CatalogEntry[]): string | null {
  return providerRowFor(modelId, provider, catalog)?.id ?? null;
}

/**
 * Each listed non-OpenRouter provider's offer of the model, keyed by provider
 * id. OpenRouter is never in the map (the model's own price and throughput are
 * the OpenRouter blend). A provider with no routable row is absent.
 */
export function providerOffersFor(
  model: Model,
  catalog: readonly CatalogEntry[],
  order: readonly string[],
): Record<string, ProviderOffer> {
  const offers: Record<string, ProviderOffer> = {};
  for (const provider of order) {
    if (provider === OPENROUTER) continue;
    const row = providerRowFor(model.id, provider, catalog);
    if (!row) continue;
    offers[provider] = { catalogId: row.id, price: blendPrice(row.cost), thinking: row.thinking };
  }
  return offers;
}

/**
 * The model's effective provider: the first provider in `order` that offers it,
 * else `openrouter`. `openrouter` always offers (it is the gateway), so its
 * position in the list is honored; a model with no offer from any listed
 * provider stays in the OpenRouter pool.
 */
export function effectiveProvider(model: Model, order: readonly string[]): string {
  for (const provider of order) {
    if (provider === OPENROUTER) return OPENROUTER;
    if (model.providerOffers?.[provider]) return provider;
  }
  return OPENROUTER;
}

/**
 * The provider bonus for a model on `provider`: `bonus / (index + 1)` for the
 * provider at its index in `order`; 0 when the provider is not listed or is
 * `openrouter`. A model offered by several listed providers gets its
 * highest-priority provider's bonus (the caller passes the effective provider).
 */
export function providerBonusFor(provider: string, order: readonly string[], bonus: number): number {
  if (provider === OPENROUTER) return 0;
  const index = order.indexOf(provider);
  if (index === -1) return 0;
  return bonus / (index + 1);
}

/**
 * The model's price basis and its source. The effective provider's offer price
 * when non-null (a `reference` price — omp's hydration of the list price), else
 * the OpenRouter blend as a labelled `openrouter-proxy`; the gateway itself is
 * `openrouter`.
 */
export function priceBasisFor(
  model: Model,
  order: readonly string[],
  openRouterPrice: number | null,
): { price: number | null; source: PriceSource } {
  const provider = effectiveProvider(model, order);
  if (provider === OPENROUTER) return { price: openRouterPrice, source: "openrouter" };
  const offer = model.providerOffers?.[provider];
  if (offer && offer.price !== null) return { price: offer.price, source: "reference" };
  return { price: openRouterPrice, source: "openrouter-proxy" };
}

/**
 * The model's other offering providers in priority order, excluding `chosen`.
 * `openrouter` is included when the model has an OpenRouter price (the caller
 * decides the `openrouter/*` wildcard vs the enumerated form). A provider with
 * no offer is skipped.
 */
export function chainProviderOrder(model: Model, order: readonly string[], chosen: string): string[] {
  const out: string[] = [];
  let sawOpenRouter = false;
  for (const provider of order) {
    if (provider === OPENROUTER) {
      sawOpenRouter = true;
      if (provider !== chosen && model.price !== null) out.push(OPENROUTER);
      continue;
    }
    if (provider === chosen) continue;
    if (model.providerOffers?.[provider]) out.push(provider);
  }
  if (!sawOpenRouter && chosen !== OPENROUTER && model.price !== null) out.push(OPENROUTER);
  return out;
}
