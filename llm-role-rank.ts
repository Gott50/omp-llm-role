#!/usr/bin/env node
/**
 * Fetches the current llm-stats.com leaderboard and computes a best-fit
 * model ranking for each omp model role:
 *   default, smol, slow, vision, plan, commit, tiny, task, advisor
 *
 * The ranking engine (fetch/caches, percentile norms, per-role scoring) lives
 * in src/engine.ts and is shared with the omp-llm-role plugin; this CLI is the
 * report surface. Role weight defaults live in src/settings.ts.
 *
 * Data sources:
 *   Quality: https://llm-stats.com/leaderboards/llm-leaderboard — the page
 *   server-renders its dataset into the Next.js RSC flight payload
 *   (`self.__next_f.push([1,"..."])` chunks ending in an `initialData: [...]`
 *   array). There is no public JSON API, so we extract that array.
 *   Throughput + price: OpenRouter per-endpoint p50 (last 30m routed traffic)
 *   and per-endpoint pricing — the sole sources; models without OpenRouter
 *   data are not ranked.
 *
 * Usage: node llm-role-rank.ts [--top N] [--json] [--out FILE] [--refresh] [--url URL]
 *
 * Caches the fetched leaderboard in llm-stats-fetched-rankings.json and the full
 * OpenRouter find response in openrouter-fetched-data.json; both are reused while
 * from the current UTC day; --refresh forces a refetch.
 */

import { execFile } from "node:child_process";
import { writeFileSync } from "node:fs";
import { promisify } from "node:util";
import { catalogFromOmpModelsJson, resolveVariant, type CatalogEntry } from "./src/availability.ts";
import { computeRankings, loadRankData, paretoFrontier, type Model, type Ranked } from "./src/engine.ts";
import { DEFAULT_ROLES as ROLES } from "./src/settings.ts";

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
  price: "price",
  throughput: "tput",
};

function formatRankings(
  rankings: Record<string, Ranked[]>,
  models: Model[],
  top: number,
  fetchedAt: string,
  orMatched: number,
  orPriced: number,
): string {
  const lines: string[] = [
    `llm-stats.com best-fit ranking per omp model role — ${models.length} models, ` +
      `${fetchedAt.slice(0, 10)}`,
    "Score = Σ weight × percentile per metric (1.0 = best). Each metric column shows that",
    "metric's weighted contribution (weight × percentile); the metric columns of a row sum",
    "to the score. price is the inverted (cheaper = better) percentile; — = metric missing",
    "(contributes 0). Metric column headers show the weight.",
    "Abbr: gen=general rea=reasoning math=math ag=agents tool=tool_calling lc=long_context",
    "sea=search vis=vision tput=throughput (code, price, mrcr as-is).",
    "★ = Pareto-frontier: no eligible model is both cheaper and better (price-free score).",
    "$/score = $/M ÷ (score without price − 0.5), cost per quality point above the median;",
    "— when the price-free score is ≤ 0.5 (price not double-counted: it is excluded there).",
  ];
  lines.push(
    `Throughput + price: OpenRouter (p50 tok/s, last 30m routed traffic; standard-route` +
      ` $/M 3:1 in:out), throughput ${orMatched}/${models.length}, priced ${orPriced}; models` +
      " without OpenRouter throughput or a billed route are not ranked.",
  );
  lines.push("");

  for (const [role, def] of Object.entries(ROLES)) {
    const ranked = rankings[role] ?? [];
    lines.push(`## @${role} — ${def.description}`);
    if (ranked.length === 0) {
      lines.push("eligible: 0 — no eligible models", "");
      continue;
    }
    lines.push(`eligible: ${ranked.length}`, "");
    const frontier = paretoFrontier(ranked);
    const metricKeys = Object.keys(def.weights);
    const rows: string[][] = [
      [
        "#",
        "score",
        "model",
        "org",
        "$/M",
        "tok/s",
        "$/score",
        "ctx",
        ...metricKeys.map((k) => `${METRIC_ABBR[k]} ${Number((def.weights[k] * 100).toFixed(1))}%`),
      ],
    ];
    for (let i = 0; i < Math.min(top, ranked.length); i++) {
      const r = ranked[i];
      const m = r.model;
      const price =
        m.price == null ? "—" : `$${m.price < 10 ? m.price.toFixed(2) : Number(m.price.toFixed(1))}`;
      const tokS = m.throughput?.toFixed(0) ?? "—";
      const ctx =
        m.context == null
          ? "—"
          : m.context >= 1e6
            ? `${(m.context / 1e6).toFixed(1)}M`
            : `${Math.round(m.context / 1e3)}k`;
      let value = "—";
      if (m.price != null && r.qScore > 0.5) {
        const pps = m.price / (r.qScore - 0.5);
        value = `$${pps < 10 ? pps.toFixed(2) : Number(pps.toFixed(1))}`;
      }
      rows.push([
        String(i + 1),
        r.score.toFixed(3),
        frontier.has(m.id) ? `★ ${m.name}` : m.name,
        m.org,
        price,
        tokS,
        value,
        ctx,
        ...metricKeys.map((k) => {
          const p: number | undefined = r.parts[k];
          return p == null ? "—" : (def.weights[k] * p).toFixed(3);
        }),
      ]);
    }
    // Columns 2 (model) and 3 (org) hold text: left-align. All others: right-align.
    const widths = rows[0].map((_, c) => Math.max(...rows.map((row) => row[c].length)));
    const padded = rows.map((row) =>
      row.map((v, c) => (c === 2 || c === 3 ? v.padEnd(widths[c]) : v.padStart(widths[c]))),
    );
    lines.push(`| ${padded[0].join(" | ")} |`);
    lines.push(
      `| ${widths.map((w, c) => (c === 2 || c === 3 ? "-".repeat(w) : `${"-".repeat(w - 1)}:`)).join(" | ")} |`,
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
function formatModelRolesYaml(rankings: Record<string, Ranked[]>, catalog: CatalogEntry[]): string {
  const lines: string[] = [
    "# Suggested settings.modelRoles (best-fit #1 per role, resolved via the omp catalog).",
    "# Selectors are openrouter/<id>; the omp-llm-role plugin writes this block daily.",
    "modelRoles:",
  ];
  for (const role of Object.keys(ROLES)) {
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
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--top") top = Number(args[++i]);
    else if (args[i] === "--json") asJson = true;
    else if (args[i] === "--out") outPath = args[++i];
    else if (args[i] === "--refresh") refresh = true;
    else if (args[i] === "--url") url = args[++i];
    else if (args[i] === "--help" || args[i] === "-h") {
      console.log("Usage: node llm-role-rank.ts [--top N] [--json] [--out FILE] [--refresh] [--url URL]");
      process.exit(0);
    }
  }

  const { models, fetchedAt, source, orMatched, orPriced } = await loadRankData({ refresh, url });
  const rankings = computeRankings(models, ROLES);

  // The omp catalog resolves each role's #1 into a concrete openrouter/<id>
  // selector. Unavailable omp (or a failed call) only skips the suggested block.
  let catalog: CatalogEntry[] = [];
  try {
    const res = await execFileP("omp", ["models", "ls", "--json"], { maxBuffer: 16 * 1024 * 1024 });
    catalog = catalogFromOmpModelsJson(JSON.parse(res.stdout));
  } catch {
    catalog = [];
  }

  let report: string;
  if (asJson) {
    const payload: Record<string, unknown> = {
      fetchedAt,
      source,
      modelCount: models.length,
      roles: Object.fromEntries(
        Object.entries(rankings).map(([role, ranked]) => {
          const frontier = paretoFrontier(ranked);
          return [
            role,
            ranked.slice(0, top).map((r, i) => ({
              rank: i + 1,
              modelId: r.model.id,
              name: r.model.name,
              organization: r.model.org,
              score: Number(r.score.toFixed(4)),
              priceFreeScore: Number(r.qScore.toFixed(4)),
              valueUsdPerScore:
                r.model.price != null && r.qScore > 0.5
                  ? Number((r.model.price / (r.qScore - 0.5)).toFixed(4))
                  : null,
              paretoFrontier: frontier.has(r.model.id),
              priceBlendedUsdPerM: r.model.price,
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
        : formatModelRolesYaml(rankings, catalog);
    report = formatRankings(rankings, models, top, fetchedAt, orMatched, orPriced) + "\n" + suggested + "\n";
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
