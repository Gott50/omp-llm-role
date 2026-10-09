/**
 * Opt-in capability presets (issue #40): one named flag per capability, each
 * applying the plugin's recommended settings to a role. This module is the
 * single source of truth for the registry and the single implementation of the
 * precedence rule (`expandFeatures`), consumed by `resolveSettings` and (phase 2)
 * the explorer's rank/explain handlers.
 *
 * Dual-runtime rule: only `node:` builtins, relative imports with explicit `.ts`
 * extensions, `import type` for types.
 */

import type { RoleDef } from "./engine.ts";

export type FeatureId = "endpointCeilings" | "cachePricing" | "providerPinning" | "costCap";

export type FeatureRow = {
  id: FeatureId;
  label: string;
  description: string;
  /** The recommended settings the flag applies. A bundle value is either a
   * scalar knob or a per-model policy field (`preferOwnProvider`). */
  recommended: { filters?: { tools?: boolean; minOutputTokens?: number; maxPriceUsdPerM?: number }; cacheHitRate?: number; preferOwnProvider?: true };
  /** What the flag buys, for `--list-features` and the docs. */
  buys: string;
};

export const FEATURES: readonly FeatureRow[] = [
  {
    id: "endpointCeilings",
    label: "Endpoint capability ceilings",
    description: "Drop routes that cannot call tools and routes whose output ceiling is below 16 384 tokens",
    recommended: { filters: { tools: true, minOutputTokens: 16384 } },
    buys: "routes that cannot call tools and routes whose output ceiling is below 16 384 tokens leave the pool — a reasoning model is not cut off mid-thought",
  },
  {
    id: "cachePricing",
    label: "Cache-read pricing",
    description: "Price the role on a cache-heavy agent loop's invoice (cacheHitRate 0.5) instead of the sticker price",
    recommended: { cacheHitRate: 0.5 },
    buys: "the role is priced on a cache-heavy agent loop's invoice (the endpoint's cacheReadPrice blended in) rather than the sticker price",
  },
  {
    id: "providerPinning",
    label: "Best-route provider pinning",
    // Per-model policy, not a scalar slug: the sensible pin differs per model,
    // so the bundle carries `preferOwnProvider` (evaluated against the model's
    // best route at rank time). It changes no eligibility — a model with no
    // candidate route keeps the default 1/price² blend.
    description: "Bind each request to the model's best provider route (per-model policy; never drops a model)",
    recommended: { preferOwnProvider: true },
    buys: "each request is bound to the model's best provider route — the selector gains @<slug> — and the fallback chain carries the same model on its next-best providers plus each fallback model on its best providers, so a down route fails over within the model's own routes",
  },
  {
    id: "costCap",
    label: "Cost cap",
    description: "Drop the priciest tail of the eligible pool (maxPriceUsdPerM 10)",
    recommended: { filters: { maxPriceUsdPerM: 10 } },
    buys: "the priciest tail of the eligible pool leaves it, so the pick cannot be an expensive outlier",
  },
];

export function featureById(id: string): FeatureRow | null {
  return FEATURES.find((f) => f.id === id) ?? null;
}

/** Render a bundle as `key=value` pairs for `--list-features`. */
function formatBundle(rec: FeatureRow["recommended"]): string {
  const parts: string[] = [];
  if (rec.filters?.tools !== undefined) parts.push(`filters.tools=${rec.filters.tools}`);
  if (rec.filters?.minOutputTokens !== undefined) parts.push(`filters.minOutputTokens=${rec.filters.minOutputTokens}`);
  if (rec.filters?.maxPriceUsdPerM !== undefined) parts.push(`filters.maxPriceUsdPerM=${rec.filters.maxPriceUsdPerM}`);
  if (rec.cacheHitRate !== undefined) parts.push(`cacheHitRate=${rec.cacheHitRate}`);
  if (rec.preferOwnProvider !== undefined) parts.push(`preferOwnProvider=${rec.preferOwnProvider}`);
  return parts.join(", ");
}

/** One human-readable line per feature for `--list-features`. */
export function formatFeatures(): string {
  return FEATURES.map((f) => `${f.id} — ${f.label}: ${f.buys} [${formatBundle(f.recommended)}]`).join("\n");
}

/** The ONE implementation of the precedence rule. Fills only the knobs the
 * authored def does NOT already set, then strips `features` from the result.
 * Never mutates `authored`. */
export function expandFeatures(authored: RoleDef, globalFlags: Record<string, boolean>): RoleDef {
  const out = structuredClone(authored) as RoleDef;
  delete out.features;
  for (const row of FEATURES) {
    const authoredFlag = authored.features?.[row.id];
    const on = authoredFlag !== undefined ? authoredFlag : globalFlags[row.id] === true;
    if (!on) continue;
    const rec = row.recommended;
    if (rec.filters) {
      const f = (out.filters ??= {});
      if (rec.filters.tools !== undefined && f.tools === undefined) f.tools = rec.filters.tools;
      if (rec.filters.minOutputTokens !== undefined && f.minOutputTokens === undefined) f.minOutputTokens = rec.filters.minOutputTokens;
      if (rec.filters.maxPriceUsdPerM !== undefined && f.maxPriceUsdPerM === undefined) f.maxPriceUsdPerM = rec.filters.maxPriceUsdPerM;
    }
    if (rec.cacheHitRate !== undefined && out.cacheHitRate === undefined) out.cacheHitRate = rec.cacheHitRate;
    if (rec.preferOwnProvider !== undefined && out.preferOwnProvider === undefined) out.preferOwnProvider = rec.preferOwnProvider;
  }
  return out;
}
