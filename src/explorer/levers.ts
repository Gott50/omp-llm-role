/**
 * Price-lever readouts for the ranking explorer: the leader-flip threshold (the
 * price weight at which a cheaper challenger overtakes the value leader) and the
 * thinking level's effect on the leader.
 *
 * Both are pure and computed on the pool they are handed, so the caller decides
 * raw vs as-written. The math is the engine's own — `roleLambda`, `rankRole`,
 * `SUFFIX_LEVELS` and `thinkingPriceFactor` are reused, never re-derived.
 */

import {
  rankRole,
  SUFFIX_LEVELS,
  thinkingPriceFactor,
  type Model,
  type Ranked,
  type RoleDef,
  type SuffixLevel,
} from "../engine.ts";

/** The price weight at which a cheaper challenger overtakes the value leader. */
export type LeaderFlip = {
  /** the role's current price weight */
  wPrice: number;
  /** the price weight at which a cheaper challenger overtakes */
  flipW: number;
  /** `flipW − wPrice` */
  distance: number;
  challenger: { id: string; name: string; value: number; priceEff: number };
};

/**
 * The price weight at which a cheaper challenger overtakes the value leader, or
 * `null` when no cheaper challenger exists (the readout is absent, never
 * invented).
 *
 * `λ* = min over cheaper challengers X of (q_L − q_X)/(pEff_L − pEff_X)`, then
 * `w* = 20·λ* ÷ (1 + 20·λ*)` — the inverse of `roleLambda`'s
 * `λ = w/(1−w)/20`. The degenerate case — the value leader is also the quality
 * leader, where the naive `(q_QL − q_VL)/(p_QL − p_VL)` is 0/0 — is handled by
 * this same min formula; it is *undefined*, not zero.
 *
 * The threshold is exact when the role's price basis is weight-independent (the
 * 1/price² blend, or a hard `providerPin`). With the soft `preferOwnProvider`
 * basis the route choice itself moves with the price weight, so the threshold is
 * a first-order estimate.
 */
export function leaderFlip(def: RoleDef, models: Model[]): LeaderFlip | null {
  const ranked = rankRole(def, models);
  const leader = ranked[0];
  if (leader === undefined) return null;
  let best: { lambda: number; challenger: Ranked } | null = null;
  for (const x of ranked) {
    if (!(x.priceEff < leader.priceEff)) continue; // cheaper challengers only
    const lambda = (leader.q - x.q) / (leader.priceEff - x.priceEff);
    if (best === null || lambda < best.lambda) best = { lambda, challenger: x };
  }
  if (best === null) return null;
  const wPrice = def.weights.price ?? 0;
  const flipW = (20 * best.lambda) / (1 + 20 * best.lambda);
  return {
    wPrice,
    flipW,
    distance: flipW - wPrice,
    challenger: {
      id: best.challenger.model.id,
      name: best.challenger.model.name,
      value: best.challenger.value,
      priceEff: best.challenger.priceEff,
    },
  };
}

/** One thinking level's effect on the ranking: the level, its price factor, and
 * the leader at that level (`null` when the level ranks nothing). */
export type ThinkingLevelRow = {
  level: SuffixLevel;
  factor: number;
  leader: { id: string; name: string; value: number } | null;
};

/**
 * The leader at each thinking level, with the level's price factor, or `null`
 * for a bare role (`def.thinking === undefined` — a role with no thinking level
 * is unaffected).
 *
 * The factor is a price-sensitivity amplifier, not a hidden cost: it multiplies
 * `priceEff`, so it penalizes expensive models more in absolute λ-units.
 */
export function thinkingLevelEffect(def: RoleDef, models: Model[]): ThinkingLevelRow[] | null {
  if (def.thinking === undefined) return null;
  return (Object.keys(SUFFIX_LEVELS) as SuffixLevel[]).map((level) => {
    const leader = rankRole({ ...def, thinking: level }, models)[0];
    return {
      level,
      factor: thinkingPriceFactor(level),
      leader: leader === undefined ? null : { id: leader.model.id, name: leader.model.name, value: leader.value },
    };
  });
}
