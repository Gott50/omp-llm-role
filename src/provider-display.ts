/**
 * Provider display: keep the live session model's `name` suffixed with its
 * upstream provider, so omp's model segment renders e.g.
 * `DeepSeek V4.1 Flash @coreweave/fp8` (an OpenRouter route) or
 * `DeepSeek V4.1 Flash @flocta` (a direct provider).
 *
 * omp's built-in model segment renders `state.model.name || state.model.id`
 * only and exposes no extension hook to add to it; the only lever is the live
 * model object's `name` (the exact object `ctx.models.current()` returns). This
 * module is pure and dual-runtime (no `@oh-my-pi/*` import) — the extension
 * wiring only calls it.
 */
import { splitThinkingSuffix } from "./availability.ts";
import { isRecord } from "./guards.ts";

/** The aggregators that route per-request through a compat block: their own
 * provider id is the gateway, not a route, so it is never shown as a suffix.
 * Mirrors omp's `supportsUpstreamRouting` (openrouter, vercelAIGateway). */
const AGGREGATOR_PROVIDERS: Record<string, true> = { openrouter: true, "vercel-ai-gateway": true };

/** The single upstream route of a compat routing block, or null. Mirrors omp's
 * `getSingleRoutingOnly`: exactly one entry, a non-empty string. */
function singleOnly(routing: unknown): string | null {
  if (!isRecord(routing) || !Array.isArray(routing.only) || routing.only.length !== 1) return null;
  const upstream = routing.only[0];
  return typeof upstream === "string" && upstream ? upstream : null;
}

/**
 * The provider shown for a model: the compat routing pin
 * (`compat.openRouterRouting.only[0]`, else `compat.vercelGatewayRouting.only[0]`)
 * when present, else the model's own provider id for a **direct** provider.
 *
 * An aggregator's provider id (`openrouter`, `vercel-ai-gateway`) is the
 * gateway, not a route, so it is never shown — an unpinned OpenRouter model
 * yields null and its display stays bare. A direct provider (e.g. `flocta`) has
 * no compat block: its selector prefix IS the route, so its provider id is the
 * suffix. Null when the model is not a record, carries no pin and no usable
 * provider id.
 */
export function providerPinOf(model: unknown): string | null {
  if (!isRecord(model)) return null;
  if (isRecord(model.compat)) {
    const pin = singleOnly(model.compat.openRouterRouting) ?? singleOnly(model.compat.vercelGatewayRouting);
    if (pin !== null) return pin;
  }
  const provider = model.provider;
  if (typeof provider === "string" && provider && AGGREGATOR_PROVIDERS[provider] !== true) return provider;
  return null;
}

/**
 * The trailing `@<slug>` of a selector (`openrouter/<id>@<slug>:<level>`),
 * after stripping a trailing thinking suffix (`:high`, `:auto`, …). Null when
 * there is no `@` or the slug is empty. Strip order mirrors `currentRankingId`
 * in `src/availability.ts`: level first, then `@`.
 */
export function providerPinOfSelector(selector: string): string | null {
  const { base } = splitThinkingSuffix(selector);
  const at = base.lastIndexOf("@");
  if (at === -1) return null;
  const slug = base.slice(at + 1);
  return slug || null;
}

/**
 * Strip any previous ` @<slug>` suffix from `name`, then append ` @<pin>` when
 * `pin` is non-null. Idempotent; a null pin returns the base name (suffix
 * stripped). Plain text only — no theme tokens, no ANSI.
 */
export function withProviderSuffix(name: string, pin: string | null): string {
  const base = name.replace(/\s@\S+$/, "");
  return pin === null ? base : `${base} @${pin}`;
}

/**
 * Set `model.name` to `withProviderSuffix(model.name, pin)` when `model` is a
 * record with a string `name`; a no-op otherwise.
 */
export function applyProviderDisplay(model: unknown, pin: string | null): void {
  if (isRecord(model) && typeof model.name === "string") {
    model.name = withProviderSuffix(model.name, pin);
  }
}
