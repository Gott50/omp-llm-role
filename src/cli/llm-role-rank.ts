#!/usr/bin/env node
/**
 * Fetches the current llm-stats.com leaderboard and computes a best-fit
 * model ranking for each omp model role:
 *   default, smol, slow, vision, plan, commit, tiny, task, advisor, designer
 *
 * The ranking engine (fetch/caches, cardinal transforms, per-role value scoring) lives
 * in src/engine.ts and is shared with the omp-llm-role plugin; this CLI is the
 * report surface. Role weight defaults live in src/settings.ts.
 *
 * Data sources:
 *   Quality: https://llm-stats.com/leaderboards/llm-leaderboard — the page
 *   server-renders its dataset into the Next.js RSC flight payload
 *   (`self.__next_f.push([1,"..."])` chunks ending in an `initialData: [...]`
 *   array). There is no public JSON API, so we extract that array.
 *   Throughput + price: OpenRouter per-provider routes (model pages + the find
 *   table), blended by the default price-based routing — weight 1/price² over
 *   the stable standard-tier providers — the sole sources; models without
 *   OpenRouter data are not ranked.
 *
 * Usage: node src/cli/llm-role-rank.ts [--top N] [--json] [--out FILE] [--refresh] [--url URL]
 *
 * Caches the fetched leaderboard in cache/llm-stats-fetched-rankings.json and the
 * full OpenRouter find response in cache/openrouter-fetched-data.json; both are
 * reused while from the current UTC day; --refresh forces a refetch.
 */

import { execFile } from "node:child_process";
import { writeFileSync } from "node:fs";
import { promisify } from "node:util";
import { catalogFromOmpModelsJson, enrichThinkingLevels, resolveVariant, type CatalogEntry } from "../availability.ts";
import { computeRankings, loadRankData, paretoFrontier, roleLambda, thinkingPriceFactor, type Model, type Ranked, type RoleDef } from "../engine.ts";
import { DEFAULT_ROLES as ROLES } from "../settings.ts";

const execFileP = promisify(execFile);

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/** Metric key -> column header abbreviation for the weighted-contribution columns. */
const METRIC_ABBR: Record<string, string> = {
  general: "gen",
  reasoning: "rea",
  math: "math",
  code: "code",
  agents: "ag",
  search: "sea",
  vision: "vis",
  tool_calling: "tool",
  long_context: "lc",
  mrcr: "mrcr",
  website: "web",
  writing: "writ",
  price: "price",
  throughput: "tput",
};

/** Column header for a metric: the shipped abbreviation, or the local part of an
 * external key (`bench:alpacaeval-2_0` -> `alpacaeval`). */
function metricAbbr(metric: string): string {
  const known = METRIC_ABBR[metric];
  if (known !== undefined) return known;
  const local = metric.includes(":") ? metric.slice(metric.indexOf(":") + 1) : metric;
  return local.slice(0, 10);
}

function formatRankings(
  rankings: Record<string, Ranked[]>,
  roles: Record<string, RoleDef>,
  models: Model[],
  top: number,
  fetchedAt: string,
  orMatched: number,
  orPriced: number,
): string {
  // The Design Arena legend only applies when a ranked role weights `website`
  // (designer); a stock run ranks the built-in roles and never fetches it.
  const weightsWebsite = Object.values(roles).some((d) => d.weights.website !== undefined);
  const weightsWriting = Object.values(roles).some((d) => d.weights.writing !== undefined);
  const lines: string[] = [
    `llm-stats.com best-fit ranking per omp model role — ${models.length} models, ` +
      `${fetchedAt.slice(0, 10)}`,
    "Value ranking per role: each metric is cardinal-normalized with fixed anchors",
    "(no ranks): llm-stats index_* affine (v+20)/80 (interval scale, observed −16..+60),",
    "benchmarks chance-anchored pass rates, throughput log-anchored 10..300 tok/s.",
    "q = Σ weight × metric over the quality metrics (weights renormalized excluding",
    "price); value = q − λ·$/M sorts each role. λ = price-weight share ÷ $20, per-role",
    "override via plugin settings roles.<role>.lambda. Metric columns show weighted",
    "contributions and sum to q; — = metric missing (contributes 0).",
    "Roles with a thinking level rank on the thinking-adjusted price: the billed",
    "blend scales by the level's factor (thinking tokens bill as output); models",
    "without thinking support are not adjusted.",
    "Abbr: gen=general rea=reasoning math=math ag=agents tool=tool_calling lc=long_context",
    "sea=search vis=vision tput=throughput (code, mrcr as-is).",
    ...(weightsWebsite
      ? [
          "web=website: Design Arena `models-website` Elo as a percentile within the",
          "design-covered field (the OpenRouter mirror merged with the keyless",
          "designarena.ai board; an endpoint Elo is trusted only at >=300 battles).",
          "Models without Design Arena data get the capability-consistent fill 0.195 —",
          "the percentile implied by the uncovered cohort's mean general index — and are",
          "marked ~ in the model column.",
          "agon=Design Arena `agents/agon_webapps` Elo from the same endpoint: context",
          "only, unweighted (22/87 of the designer pool, below the ~35–40% coverage",
          "bar at which a metric earns weight).",
        ]
      : []),
    ...(weightsWriting
      ? [
          "writ=writing: WritingBench normalized score (0-1) from the writing",
          "leaderboard's canonical export (llm-stats.com/research/best-ai-for-writing/",
          "evidence.json). Models outside the WritingBench ranking get the capability",
          "fill 0.195 and are marked ~ in the model column.",
        ]
      : []),
    "★ = Pareto-frontier: no eligible model is both cheaper and better (q).",
  ];
  lines.push(
    `Throughput + price: OpenRouter per-provider routes under the default price-based routing` +
      ` (weight 1/price² over stable standard-tier providers; p50 tok/s of routed traffic;` +
      ` $/M 3:1 in:out), throughput ${orMatched}/${models.length}, priced ${orPriced}; models` +
      " without OpenRouter throughput or a billed route are not ranked.",
  );
  lines.push("");

  for (const [role, def] of Object.entries(roles)) {
    const ranked = rankings[role] ?? [];
    lines.push(`## @${role} — ${def.description}`);
    if (ranked.length === 0) {
      lines.push("eligible: 0 — no eligible models", "");
      continue;
    }
    const tf = def.thinking === undefined ? 1 : thinkingPriceFactor(def.thinking);
    lines.push(`eligible: ${ranked.length} — λ ${roleLambda(def).toFixed(5)} $/quality-point` + (tf > 1 ? ` (thinking ×${tf.toFixed(3)})` : ""), "");
    const frontier = paretoFrontier(ranked);
    const metricKeys = Object.keys(def.weights).filter((k) => k !== "price");
    const weightsWebsite = def.weights.website !== undefined;
    const weightsWriting = def.weights.writing !== undefined;
    const qW = 1 - (def.weights.price ?? 0);
    const rows: string[][] = [
      [
        "#",
        "value",
        "q",
        "model",
        "org",
        "$/M",
        "tok/s",
        "ctx",
        ...metricKeys.map((k) => `${metricAbbr(k)} ${Number(((def.weights[k] / qW) * 100).toFixed(1))}%`),
        ...(weightsWebsite ? ["agon"] : []),
      ],
    ];
    for (let i = 0; i < Math.min(top, ranked.length); i++) {
      const r = ranked[i];
      const m = r.model;
      const price = `$${r.priceEff < 10 ? r.priceEff.toFixed(2) : Number(r.priceEff.toFixed(1))}`;
      const tokS = m.throughput?.toFixed(0) ?? "—";
      const ctx =
        m.context == null
          ? "—"
          : m.context >= 1e6
            ? `${(m.context / 1e6).toFixed(1)}M`
            : `${Math.round(m.context / 1e3)}k`;
      rows.push([
        String(i + 1),
        r.value.toFixed(3),
        r.q.toFixed(3),
        `${frontier.has(m.id) ? "★ " : ""}${(weightsWebsite && m.designElo == null) || (weightsWriting && m.writingBench == null) ? "~ " : ""}${m.name}`,
        m.org,
        price,
        tokS,
        ctx,
        ...metricKeys.map((k) => {
          const p: number | undefined = r.parts[k];
          return p == null ? "—" : p.toFixed(3);
        }),
        ...(weightsWebsite ? [m.designEloAgents?.toFixed(0) ?? "—"] : []),
      ]);
    }
    // Columns 2 (model) and 3 (org) hold text: left-align. All others: right-align.
    const widths = rows[0].map((_, c) => Math.max(...rows.map((row) => row[c].length)));
    const padded = rows.map((row) =>
      row.map((v, c) => (c === 3 || c === 4 ? v.padEnd(widths[c]) : v.padStart(widths[c]))),
    );
    lines.push(`| ${padded[0].join(" | ")} |`);
    lines.push(
      `| ${widths.map((w, c) => (c === 3 || c === 4 ? "-".repeat(w) : `${"-".repeat(w - 1)}:`)).join(" | ")} |`,
    );
    for (let ri = 1; ri < padded.length; ri++) lines.push(`| ${padded[ri].join(" | ")} |`);
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * Suggested settings.modelRoles: each role's #1 ranked model resolved through the
 * same catalog/variant resolution the plugin uses (tier "billed"), emitted as
 * `openrouter/<catalogId>`. Roles whose best model has no catalog match get a
 * comment placeholder instead of a selector.
 */
function formatModelRolesYaml(rankings: Record<string, Ranked[]>, roles: Record<string, RoleDef>, catalog: CatalogEntry[]): string {
  const lines: string[] = [
    "# Suggested settings.modelRoles (best-fit #1 per role, resolved via the omp catalog).",
    "# Selectors are openrouter/<id>; the omp-llm-role plugin writes this block daily.",
    "modelRoles:",
  ];
  for (const role of Object.keys(roles)) {
    const best = rankings[role]?.[0];
    if (!best) continue;
    const catalogId = resolveVariant(best.model.id, catalog, "billed");
    if (catalogId === null) {
      lines.push(`  ${role}: # no catalog match for ${best.model.id}`);
      continue;
    }
    lines.push(`  ${role}: "openrouter/${catalogId}"`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let url = "https://llm-stats.com/leaderboards/llm-leaderboard";
  let top = 10;
  let asJson = false;
  let outPath: string | null = null;
  let refresh = false;
  let all = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--top") top = Number(args[++i]);
    else if (args[i] === "--json") asJson = true;
    else if (args[i] === "--out") outPath = args[++i];
    else if (args[i] === "--refresh") refresh = true;
    else if (args[i] === "--all") all = true;
    else if (args[i] === "--url") url = args[++i];
    else if (args[i] === "--help" || args[i] === "-h") {
      console.log("Usage: node src/cli/llm-role-rank.ts [--top N] [--json] [--out FILE] [--refresh] [--all] [--url URL]");
      process.exit(0);
    }
  }

  // Shipped defaults rank the omp built-in roles only; `--all` adds opt-in roles
  // (designer) — which also pulls in their exclusive sources (Design Arena).
  const roles = all ? ROLES : Object.fromEntries(Object.entries(ROLES).filter(([, d]) => d.enabled !== false));
  const { models, fetchedAt, source, orMatched, orPriced } = await loadRankData({ refresh, url, roles });
  // The omp catalog gates the thinking price factor per model (a model whose
  // thinking[] excludes the role's level is priced bare, matching the plugin's
  // suffix gate) and resolves each role's #1 into a concrete openrouter/<id>
  // selector. Unavailable omp (or a failed call) falls back to the OR
  // supports_reasoning flag and only skips the suggested block.
  let catalog: CatalogEntry[] = [];
  try {
    const res = await execFileP("omp", ["models", "ls", "--json"], { maxBuffer: 16 * 1024 * 1024 });
    catalog = catalogFromOmpModelsJson(JSON.parse(res.stdout));
  } catch {
    catalog = [];
  }
  enrichThinkingLevels(models, catalog);

  const rankings = computeRankings(models, roles);

  let report: string;
  if (asJson) {
    const payload: Record<string, unknown> = {
      fetchedAt,
      source,
      modelCount: models.length,
      roles: Object.fromEntries(
        Object.entries(roles).map(([role, def]) => {
          const ranked = rankings[role] ?? [];
          const frontier = paretoFrontier(ranked);
          return [
            role,
            ranked.slice(0, top).map((r, i) => ({
              rank: i + 1,
              modelId: r.model.id,
              name: r.model.name,
              organization: r.model.org,
              value: Number(r.value.toFixed(4)),
              q: Number(r.q.toFixed(4)),
              lambda: Number(roleLambda(def).toFixed(6)),
              paretoFrontier: frontier.has(r.model.id),
              priceBlendedUsdPerM: r.model.price,
              priceEffUsdPerM: r.priceEff,
              throughputTokS: r.model.throughput,
              contextTokens: r.model.context,
            })),
          ];
        }),
      ),
    };
    report = JSON.stringify(payload, null, 2);
  } else {
    const suggested =
      catalog.length === 0
        ? "# (catalog unavailable — suggested modelRoles skipped)"
        : formatModelRolesYaml(rankings, roles, catalog);
    report = formatRankings(rankings, roles, models, top, fetchedAt, orMatched, orPriced) + "\n" + suggested + "\n";
  }

  if (outPath) {
    writeFileSync(outPath, report);
    console.error(`wrote ${outPath}`);
  } else {
    console.log(report);
  }
}

main().catch((err) => {
  console.error(`error: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
