/**
 * Provider display: keep the live session model's `name` suffixed with its
 * upstream provider pin, so omp's model segment renders e.g.
 * `DeepSeek V4.1 Flash @coreweave/fp8`.
 *
 * omp's built-in model segment renders `state.model.name || state.model.id`
 * only and exposes no extension hook to add to it; the only lever is the live
 * model object's `name` (the exact object `ctx.models.current()` returns). This
 * module is pure and dual-runtime (no `@oh-my-pi/*` import) — the extension
 * wiring only calls it.
 */
import { THINKING_LEVELS } from "./availability.ts";
import { isRecord } from "./guards.ts";

/** The single upstream route of a compat routing block, or null. Mirrors omp's
 * `getSingleRoutingOnly`: exactly one entry, a non-empty string. */
function singleOnly(routing: unknown): string | null {
  if (!isRecord(routing) || !Array.isArray(routing.only) || routing.only.length !== 1) return null;
  const upstream = routing.only[0];
  return typeof upstream === "string" && upstream ? upstream : null;
}

/**
 * The provider pin carried by a model's compat routing block:
 * `compat.openRouterRouting.only[0]`, else `compat.vercelGatewayRouting.only[0]`.
 * Null when absent, when `only` is not exactly one entry, or when the entry is
 * not a non-empty string.
 */
export function providerPinOf(model: unknown): string | null {
  if (!isRecord(model) || !isRecord(model.compat)) return null;
  const compat = model.compat;
  return singleOnly(compat.openRouterRouting) ?? singleOnly(compat.vercelGatewayRouting);
}

/**
 * The trailing `@<slug>` of a selector (`openrouter/<id>@<slug>:<level>`),
 * after stripping a trailing thinking suffix (`:high`, `:auto`, …). Null when
 * there is no `@` or the slug is empty. Strip order mirrors `currentRankingId`
 * in `src/availability.ts`: level first, then `@`.
 */
export function providerPinOfSelector(selector: string): string | null {
  const colon = selector.lastIndexOf(":");
  const base = colon !== -1 && selector.slice(colon + 1) in THINKING_LEVELS ? selector.slice(0, colon) : selector;
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
