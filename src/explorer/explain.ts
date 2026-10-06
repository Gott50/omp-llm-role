/**
 * Pure explanation layer for the ranking explorer: turns the engine's ranking
 * math into per-model decompositions (raw -> cardinal -> weighted contribution),
 * rank deltas against a baseline, and "what would it take to move up" targets.
 *
 * No I/O: the server (src/explorer/server.ts) owns the HTTP surface and the
 * export write; this module only computes. All ranking math is delegated to
 * src/engine.ts so the numbers on screen are exactly the plugin's numbers.
 *
 * The keyed-catalog availability annotation (`key` on rank rows and the eligible
 * explanation) is a pure overlay computed from an injected `KeyAvailability`
 * value — no I/O here; the caller owns the fetch.
 */

import { assessFocusMetric, type FocusMetricAssessment } from "../agent-create.ts";
import { type KeyAvailability } from "../availability.ts";
import { sourceForMetric, type SourceDeclaration } from "../benchmark-sources.ts";
import { CAPABILITY_FILL, cardinalMetric, modelPassesEndpointFilters, paretoFrontier, rankRole, roleLambda, type Model, type Ranked, type RoleDef, type SuffixLevel } from "../engine.ts";
import { KNOWN_METRICS } from "../settings.ts";

// ---------------------------------------------------------------------------
// Metric metadata (the UI's picklists and formula legends)
// ---------------------------------------------------------------------------

export type MetricMeta = {
  label: string;
  kind: "index" | "benchmark" | "throughput" | "price" | "percentile";
  unit: string;
  formula: string;
  anchors: string;
};

const INDEX_ANCHORS = "−20→0, +60→1, unclamped (observed −16..+60)";

/** One entry per KNOWN_METRICS key. The six raw llm-stats benchmark pass rates
 * are sparse (gpqa 62.5%, aime 30.5%, swe_bench 29.0%, arc_agi/terminal_bench/
 * tau_bench ~5-6% of the field) — weight them as differentiators, not gates. */
export const METRIC_META: Record<string, MetricMeta> = {
  general: { label: "General index", kind: "index", unit: "index pts", formula: "(v+20)/80", anchors: INDEX_ANCHORS },
  reasoning: { label: "Reasoning index", kind: "index", unit: "index pts", formula: "(v+20)/80", anchors: INDEX_ANCHORS },
  math: { label: "Math index", kind: "index", unit: "index pts", formula: "(v+20)/80", anchors: INDEX_ANCHORS },
  code: { label: "Code index", kind: "index", unit: "index pts", formula: "(v+20)/80", anchors: INDEX_ANCHORS },
  agents: { label: "Agents index", kind: "index", unit: "index pts", formula: "(v+20)/80", anchors: INDEX_ANCHORS },
  search: { label: "Search index", kind: "index", unit: "index pts", formula: "(v+20)/80", anchors: INDEX_ANCHORS },
  vision: { label: "Vision index", kind: "index", unit: "index pts", formula: "(v+20)/80", anchors: INDEX_ANCHORS },
  tool_calling: { label: "Tool-calling index", kind: "index", unit: "index pts", formula: "(v+20)/80", anchors: INDEX_ANCHORS },
  long_context: { label: "Long-context index", kind: "index", unit: "index pts", formula: "(v+20)/80", anchors: INDEX_ANCHORS },
  index_communication: { label: "Communication index", kind: "index", unit: "index pts", formula: "(v+20)/80", anchors: INDEX_ANCHORS },
  index_finance: { label: "Finance index", kind: "index", unit: "index pts", formula: "(v+20)/80", anchors: INDEX_ANCHORS },
  index_healthcare: { label: "Healthcare index", kind: "index", unit: "index pts", formula: "(v+20)/80", anchors: INDEX_ANCHORS },
  index_legal: { label: "Legal index", kind: "index", unit: "index pts", formula: "(v+20)/80", anchors: INDEX_ANCHORS },
  mrcr: { label: "MRCR v2", kind: "benchmark", unit: "pass rate", formula: "raw 0-1", anchors: "chance ≈ 0" },
  gpqa: { label: "GPQA", kind: "benchmark", unit: "pass rate", formula: "(v−0.25)/0.75", anchors: "4-way multiple choice, chance 0.25" },
  aime: { label: "AIME 2025", kind: "benchmark", unit: "pass rate", formula: "raw 0-1", anchors: "chance ≈ 0" },
  swe_bench: { label: "SWE-bench Verified", kind: "benchmark", unit: "pass rate", formula: "raw 0-1", anchors: "chance ≈ 0" },
  arc_agi: { label: "ARC-AGI v2", kind: "benchmark", unit: "pass rate", formula: "raw 0-1", anchors: "chance ≈ 0" },
  terminal_bench: { label: "Terminal-Bench", kind: "benchmark", unit: "pass rate", formula: "raw 0-1", anchors: "chance ≈ 0" },
  tau_bench: { label: "τ-bench (retail)", kind: "benchmark", unit: "pass rate", formula: "raw 0-1", anchors: "chance ≈ 0" },
  simpleqa_score: { label: "SimpleQA", kind: "benchmark", unit: "pass rate", formula: "raw 0-1", anchors: "chance ≈ 0" },
  hle_score: { label: "Humanity's Last Exam", kind: "benchmark", unit: "pass rate", formula: "raw 0-1", anchors: "chance ≈ 0" },
  mmmu_score: { label: "MMMU", kind: "benchmark", unit: "pass rate", formula: "raw 0-1", anchors: "chance ≈ 0" },
  mmmu_pro_score: { label: "MMMU-Pro", kind: "benchmark", unit: "pass rate", formula: "raw 0-1", anchors: "chance ≈ 0" },
  mmmlu_score: { label: "MMMLU", kind: "benchmark", unit: "pass rate", formula: "raw 0-1", anchors: "chance ≈ 0" },
  browsecomp_score: { label: "BrowseComp", kind: "benchmark", unit: "pass rate", formula: "raw 0-1", anchors: "chance ≈ 0" },
  swe_bench_pro_score: { label: "SWE-bench Pro", kind: "benchmark", unit: "pass rate", formula: "raw 0-1", anchors: "chance ≈ 0" },
  mcp_atlas_score: { label: "MCP Atlas", kind: "benchmark", unit: "pass rate", formula: "raw 0-1", anchors: "chance ≈ 0" },
  apex_agents_score: { label: "APEX Agents", kind: "benchmark", unit: "pass rate", formula: "raw 0-1", anchors: "chance ≈ 0" },
  osworld_score: { label: "OSWorld", kind: "benchmark", unit: "pass rate", formula: "raw 0-1", anchors: "chance ≈ 0" },
  scicode_score: { label: "SciCode", kind: "benchmark", unit: "pass rate", formula: "raw 0-1", anchors: "chance ≈ 0" },
  screenspot_pro_score: { label: "ScreenSpot-Pro", kind: "benchmark", unit: "pass rate", formula: "raw 0-1", anchors: "chance ≈ 0" },
  charxiv_r_score: { label: "CharXiv-R", kind: "benchmark", unit: "pass rate", formula: "raw 0-1", anchors: "chance ≈ 0" },
  frontiermath_score: { label: "FrontierMath", kind: "benchmark", unit: "pass rate", formula: "raw 0-1", anchors: "chance ≈ 0" },
  toolathlon_score: { label: "Toolathlon", kind: "benchmark", unit: "pass rate", formula: "raw 0-1", anchors: "chance ≈ 0" },
  website: { label: "Design Arena (website)", kind: "percentile", unit: "percentile", formula: "identity (already 0-1)", anchors: "percentile within the design-covered field; models without Design Arena data get the capability fill 0.195" },
  writing: { label: "WritingBench", kind: "percentile", unit: "score 0-1", formula: "identity (already 0-1)", anchors: "WritingBench normalized score (writing leaderboard); models outside the ranking get the capability fill 0.195" },
  price: { label: "Price", kind: "price", unit: "$/M", formula: "billed blend 3:1 in:out, ×(3ρ+1+T)/(3ρ+1) at the role's thinking level", anchors: "OpenRouter standard route" },
  throughput: { label: "Throughput", kind: "throughput", unit: "tok/s", formula: "ln(v/10)/ln(30)", anchors: "10 tok/s→0, 300 tok/s→1, clamped" },
};

/**
 * Metadata for one metric: the shipped table, or a derived entry for an external
 * benchmark (identity transform, label from the registry's source). The derived
 * entry keeps the explorer's picklists and formula legends registry-driven, so a
 * new metric renders without a second hand-maintained table.
 */
export function metricMeta(metric: string, declared: readonly SourceDeclaration[] = []): MetricMeta {
  const known = METRIC_META[metric];
  if (known) return known;
  const source = sourceForMetric(metric, declared);
  return {
    label: source?.label ?? metric,
    kind: "percentile",
    unit: "score 0-1",
    formula: "identity (already 0-1)",
    anchors: `external benchmark (${metric}); models outside the source get the capability fill ${source?.fill ?? 0}`,
  };
}

/** The metadata table for a metric universe: the shipped entries plus a derived
 * entry for every external metric in `metrics`. */
export function metricMetaFor(metrics: readonly string[], declared: readonly SourceDeclaration[] = []): Record<string, MetricMeta> {
  const out: Record<string, MetricMeta> = { ...METRIC_META };
  for (const metric of metrics) if (!(metric in out)) out[metric] = metricMeta(metric, declared);
  return out;
}

/** A role's focus metrics: the weighted benchmarks (kind `benchmark`/`percentile`),
 * i.e. the metrics a role was ranked on beyond the index/price/throughput
 * backbone. Shipped roles weight index metrics, so they carry none. */
export function focusMetricsOf(def: RoleDef, declared: readonly SourceDeclaration[] = []): string[] {
  return Object.keys(def.weights).filter((metric) => {
    const kind = metricMeta(metric, declared).kind;
    return kind === "benchmark" || kind === "percentile";
  });
}

/** Four-axis assessment of each of a role's focus metrics, over the loaded pool
 * (the same dataset the updater ranks on). */
export function focusAssessments(
  models: readonly Model[],
  def: RoleDef,
  declared: readonly SourceDeclaration[] = [],
): Record<string, FocusMetricAssessment> {
  const out: Record<string, FocusMetricAssessment> = {};
  for (const metric of focusMetricsOf(def, declared)) out[metric] = assessFocusMetric(models, metric, declared);
  return out;
}

// ---------------------------------------------------------------------------
// Rank rows (table data with baseline deltas)
// ---------------------------------------------------------------------------

export type RankRow = {
  id: string;
  name: string;
  org: string;
  price: number | null;
  /** the price the ranking penalized: billed blend × the role's thinking factor
   * when the model supports thinking; equals `price` for bare/off roles */
  priceEff: number;
  throughput: number | null;
  context: number | null;
  multimodal: boolean;
  value: number;
  q: number;
  parts: Record<string, number>;
  /** weighted non-price metrics whose raw value is null (they contribute 0) */
  missing: string[];
  /** keyed-catalog availability overlay: whether the user's OpenRouter key can
   * run this model. Orthogonal to `missing` (weighted metrics with no value) and
   * to the eligibility gates `rankRole` applies; `"unknown"` when the keyed
   * catalog is inactive or the model is in neither catalog. */
  key: "usable" | "blocked" | "unknown";
  frontier: boolean;
  rank: number;
  baselineRank: number | null;
  /** baselineRank − rank; positive = moved up */
  delta: number | null;
};

/** The availability overlay verdict for one model id: `"usable"` when the keyed
 * catalog allows it, `"blocked"` when the public catalog has it but the keyed
 * one does not, `"unknown"` when the keyed catalog is inactive or the model is
 * in neither catalog. Pure; no I/O. */
function keyVerdict(availability: KeyAvailability | undefined, id: string): "usable" | "blocked" | "unknown" {
  if (availability?.active !== true) return "unknown";
  if (availability.allowed.has(id)) return "usable";
  if (availability.blocked.has(id)) return "blocked";
  return "unknown";
}

/** Rank `models` under `def`, annotating each row with its rank delta against
 * `baseline` (the effective role's ranking, i.e. what the plugin does today) and
 * its keyed-catalog availability overlay. Ranking order, deltas, and every other
 * field are unaffected by `availability`. */
export function rankRows(def: RoleDef, models: Model[], baseline: Ranked[], availability?: KeyAvailability): RankRow[] {
  const ranked = rankRole(def, models);
  const frontier = paretoFrontier(ranked);
  const baselineRank = new Map<string, number>();
  baseline.forEach((r, i) => baselineRank.set(r.model.id, i + 1));
  const weightedNonPrice = Object.keys(def.weights).filter((k) => k !== "price");
  return ranked.map((r, i) => {
    const rank = i + 1;
    const b = baselineRank.get(r.model.id) ?? null;
    return {
      id: r.model.id,
      name: r.model.name,
      org: r.model.org,
      price: r.model.price,
      priceEff: r.priceEff,
      throughput: r.model.throughput,
      context: r.model.context,
      multimodal: r.model.multimodal,
      value: r.value,
      q: r.q,
      parts: r.parts,
      missing: weightedNonPrice.filter((k) => r.model.metrics[k] == null),
      key: keyVerdict(availability, r.model.id),
      frontier: frontier.has(r.model.id),
      rank,
      baselineRank: b,
      delta: b == null ? null : b - rank,
    };
  });
}

// ---------------------------------------------------------------------------
// Inverse cardinal transform (for "what would it take" targets)
// ---------------------------------------------------------------------------

/** Inverse of `cardinalMetric` for the weightable metrics. Returns null when the
 * target is unreachable because the forward transform clamps (throughput). */
export function inverseCardinal(metric: string, t: number): number | null {
  const kind = METRIC_META[metric]?.kind;
  if (kind === "index") return t * 80 - 20;
  if (kind === "throughput") {
    if (t < 0 || t > 1) return null; // forward clamps to [0,1]; outside is unreachable
    return 10 * 30 ** t;
  }
  return t; // benchmark (mrcr), percentile (website) and price: identity
}

// ---------------------------------------------------------------------------
// Per-model explanation
// ---------------------------------------------------------------------------

export type Contribution = {
  metric: string;
  raw: number | null;
  t: number | null;
  weight: number;
  renormWeight: number;
  contribution: number;
  shareOfQ: number;
  /** Note when the value is a capability fill rather than a measurement (Design
   * Arena `website` with no board data, `writing` outside the WritingBench
   * ranking); null when the value is measured. */
  fillNote: string | null;
};

export type Closing = {
  metric: string;
  raw: number | null;
  targetT: number;
  targetRaw: number | null;
  deltaRaw: number | null;
  note?: string;
};

export type Explanation =
  | { eligible: false; reasons: string[] }
  | {
      eligible: true;
      model: { id: string; name: string; org: string };
      /** keyed-catalog availability overlay (see `RankRow.key`) */
      key: "usable" | "blocked" | "unknown";
      /** why the overlay reads as it does: the injected availability reason, or
       * `"unavailable"` when no availability value was supplied */
      keyReason: KeyAvailability["reason"];
      rank: number;
      total: number;
      value: number;
      q: number;
      priceEff: number;
      role: { name: string; lambda: number; derivedLambda: number; wPrice: number; qW: number; thinking: SuffixLevel | undefined };
      contributions: Contribution[];
      cost: { priceEff: number; billedPrice: number; lambda: number; penalty: number; q: number; value: number };
      gapAbove: number | null;
      gapToTop: number;
      above: { id: string; name: string; value: number } | null;
      closing: Closing[];
      dominators: Array<{ id: string; name: string; priceEff: number; q: number }>;
    };

/** Full decomposition of one model's rank for a role, or the eligibility gates it
 * failed (same gates `rankRole` applies, listed in the same order). The eligible
 * branch also carries the keyed-catalog availability overlay (`key`/`keyReason`). */
export function explainModel(def: RoleDef, models: Model[], modelId: string, roleName = "", availability?: KeyAvailability): Explanation {
  const model = models.find((m) => m.id === modelId);
  if (!model) return { eligible: false, reasons: ["model not found in today's dataset"] };

  const reasons: string[] = [];
  const missingRequired = def.required.filter((k) => model.metrics[k] == null);
  if (missingRequired.length > 0) reasons.push(`missing required metric(s): ${missingRequired.join(", ")}`);
  if (def.filters?.image && !model.multimodal) reasons.push("role requires image input; model is text-only");
  if (!modelPassesEndpointFilters(model, def.filters)) reasons.push("no standard-tier route satisfies the role's endpoint filters");
  if (model.price == null) reasons.push("no billed OpenRouter route");
  if (reasons.length > 0) return { eligible: false, reasons };

  const ranked = rankRole(def, models);
  const idx = ranked.findIndex((r) => r.model.id === modelId);
  const self = ranked[idx];
  const rank = idx + 1;
  const total = ranked.length;

  const wPrice = def.weights.price ?? 0;
  const qW = 1 - wPrice;
  const derivedLambda = roleLambda({ ...def, lambda: undefined });
  const lambda = roleLambda(def);

  const contributions: Contribution[] = [];
  for (const [metric, w] of Object.entries(def.weights)) {
    if (metric === "price") continue; // cost enters as the λ·$ penalty, not the blend
    const stored = model.metrics[metric] ?? null;
    // Mirror rankRole: a sparse capability metric with no data scores at
    // CAPABILITY_FILL *as a cardinal value* (no transform), not 0 — otherwise
    // the parts would not sum to q.
    const fill = stored == null ? CAPABILITY_FILL[metric] : undefined;
    const t = stored != null ? cardinalMetric(metric, stored) : (fill ?? null);
    const renormWeight = w / qW;
    const contribution = t == null ? 0 : renormWeight * t;
    let fillNote: string | null = null;
    if (metric === "website" && model.designElo == null) fillNote = "no Design Arena data → capability fill 0.195";
    else if (metric === "writing" && model.writingBench == null) fillNote = "outside the WritingBench ranking → capability fill 0.195";
    else if (fill !== undefined) fillNote = `${metric} not measured → capability fill ${fill}`;
    contributions.push({
      metric,
      raw: stored ?? fill ?? null,
      t,
      weight: w,
      renormWeight,
      contribution,
      shareOfQ: self.q > 0 ? contribution / self.q : 0,
      fillNote,
    });
  }
  contributions.sort((a, b) => {
    // Capability-filled metrics have no measured value to tune, so they stay last.
    if ((a.fillNote != null) !== (b.fillNote != null)) return a.fillNote != null ? 1 : -1;
    return b.contribution - a.contribution;
  });

  const gapAbove = rank === 1 ? null : ranked[idx - 1].value - self.value;
  const gapToTop = ranked[0].value - self.value;
  const above = rank === 1 ? null : { id: ranked[idx - 1].model.id, name: ranked[idx - 1].model.name, value: ranked[idx - 1].value };

  const closing: Closing[] = [];
  if (gapAbove != null) {
    for (const c of contributions) {
      if (c.raw == null || c.t == null || c.fillNote != null) continue; // a filled score is not tunable
      const targetT = c.t + gapAbove / c.renormWeight;
      const targetRaw = inverseCardinal(c.metric, targetT);
      const deltaRaw = targetRaw == null ? null : targetRaw - c.raw;
      let note: string | undefined;
      if (targetRaw == null) note = "unreachable — throughput clamps at 300 tok/s";
      else if (METRIC_META[c.metric]?.kind === "index" && targetRaw > 60) note = "extrapolates past the +60 anchor";
      else if (METRIC_META[c.metric]?.kind === "benchmark" && targetRaw > 1) note = "unreachable — pass rate cannot exceed 1";
      else if (METRIC_META[c.metric]?.kind === "percentile" && targetRaw > 1) note = "unreachable — percentile cannot exceed 1";
      closing.push(note ? { metric: c.metric, raw: c.raw, targetT, targetRaw, deltaRaw, note } : { metric: c.metric, raw: c.raw, targetT, targetRaw, deltaRaw });
    }
    if (lambda > 0) {
      const targetPrice = self.priceEff - gapAbove / lambda;
      const note = targetPrice < 0 ? "unreachable — price cannot go below $0" : undefined;
      closing.push(
        note
          ? { metric: "price", raw: self.priceEff, targetT: targetPrice, targetRaw: targetPrice, deltaRaw: targetPrice - self.priceEff, note }
          : { metric: "price", raw: self.priceEff, targetT: targetPrice, targetRaw: targetPrice, deltaRaw: targetPrice - self.priceEff },
      );
    }
  }

  const dominators = ranked
    .filter(
      (r) =>
        r.model.id !== modelId &&
        r.priceEff <= self.priceEff &&
        r.q >= self.q &&
        (r.priceEff < self.priceEff || r.q > self.q),
    )
    .sort((a, b) => a.priceEff - b.priceEff)
    .slice(0, 3)
    .map((r) => ({ id: r.model.id, name: r.model.name, priceEff: r.priceEff, q: r.q }));

  return {
    eligible: true,
    model: { id: model.id, name: model.name, org: model.org },
    key: keyVerdict(availability, model.id),
    keyReason: availability?.reason ?? "unavailable",
    rank,
    total,
    value: self.value,
    q: self.q,
    priceEff: self.priceEff,
    role: { name: roleName, lambda, derivedLambda, wPrice, qW, thinking: def.thinking },
    contributions,
    cost: { priceEff: self.priceEff, billedPrice: model.price, lambda, penalty: lambda * self.priceEff, q: self.q, value: self.value },
    gapAbove,
    gapToTop,
    above,
    closing,
    dominators,
  };
}

// ---------------------------------------------------------------------------
// Metric universe
// ---------------------------------------------------------------------------

/** The metric universe the UI may weight: the shipped keys plus any external
 * metric present in the resolved roles' weights (exactly what the validator
 * accepts). */
export function weightableMetrics(extra: readonly string[] = []): string[] {
  return [...Object.keys(KNOWN_METRICS), ...extra.filter((metric) => !(metric in KNOWN_METRICS))];
}
