import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parse as parseYaml } from "yaml";
import { applyFocusBenchmarks, assessFocusMetric, belowBarReason, countMetricCoverage, createAgent, differentiationWarning, discoverBenchmarks, extractBenchmarkLinks, extractBenchmarks, FOCUS_COVERAGE_FLOOR, FOCUS_DATASET_STALENESS_MONTHS, FOCUS_DISPERSION_FLOOR, FOCUS_METRIC_CAP, FOCUS_ORG_MIN_SHARE, FOCUS_PROVENANCE_DOMINANT_SHARE, FOCUS_SELF_REPORTED_MAX_SHARE, FOCUS_STALENESS_MONTHS, focusCoverageOk, formatBenchmarks, formatCreateAgentReport, parseCreateAgentInput, PRICE_AGREEMENT_TOLERANCE, resolveRole, type CreateAgentRequest, type FocusMetricAssessment } from "../src/agent-create.ts";
import type { BenchmarkCatalogEntry } from "../src/benchmark-sources.ts";
import { buildModels, rankRole, type Model, type RoleDef } from "../src/engine.ts";
import { formatFeatures } from "../src/features.ts";
import { isRecord } from "../src/guards.ts";
import { fitArchetype } from "../src/role-archetypes.ts";
import { KNOWN_METRICS, readPluginSettingsMap, resolveSettings } from "../src/settings.ts";
import { makeModel, makeRow } from "./helpers.ts";

/** Temp home: a lock file with a plugins block, plus an agents dir the plugin
 * resolves through `OMP_LLM_ROLE_AGENT_DIR` (src/state.ts `agentDir`). */
function workspace(): { dir: string; lockPath: string; agentsDir: string } {
  const dir = mkdtempSync(join(tmpdir(), "create-agent-"));
  const lockPath = join(dir, "omp-plugins.lock.json");
  writeFileSync(lockPath, JSON.stringify({ plugins: { "omp-llm-role": { enabled: true } }, settings: {} }, null, 2));
  process.env.OMP_LLM_ROLE_AGENT_DIR = dir;
  return { dir, lockPath, agentsDir: join(dir, "agents") };
}

function request(lockPath: string, over: Partial<CreateAgentRequest> = {}): CreateAgentRequest {
  return { name: "changelog", purpose: "write release notes and changelogs from git history", scope: "user", force: false, dryRun: false, lockPath, ...over };
}

/** Parse an agent file's YAML frontmatter. */
function frontmatter(text: string): Record<string, unknown> {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  assert.ok(match !== null, "agent file has no frontmatter block");
  const parsed: unknown = parseYaml(match[1]);
  assert.ok(isRecord(parsed));
  return parsed;
}

test("createAgent fits weights to the purpose and writes a role omp can route to", () => {
  const { lockPath, agentsDir } = workspace();

  const result = createAgent(request(lockPath));
  assert.ok(result.ok, result.ok ? "" : result.errors.join("; "));
  assert.equal(result.archetype.id, "prose");

  const { settings, errors } = resolveSettings(readPluginSettingsMap({ global: lockPath, project: null }));
  assert.deepEqual(errors, []);
  assert.deepEqual(settings.roles.changelog.weights, result.def.weights);
  assert.deepEqual(settings.roles.changelog.required, ["general", "price", "throughput"]);

  const fm = frontmatter(readFileSync(join(agentsDir, "changelog.md"), "utf8"));
  assert.equal(fm.name, "changelog");
  // The chain keeps the agent spawnable while the role is absent; a bare `@changelog`
  // would be a literal model pattern and hard-fail.
  assert.equal(fm.model, "@changelog, @default");
  assert.equal(fm.description, "MUST be used to write release notes and changelogs from git history.");
  assert.equal(fm.tools, "read, grep, glob, find, write, edit");
  // The role's `thinking` sets the effort and prices it; a second pin here would disagree.
  assert.equal("thinking-level" in fm, false);
});

test("createAgent refuses an existing agent file and writes no role", () => {
  const { lockPath, agentsDir } = workspace();
  mkdirSync(agentsDir, { recursive: true });
  const existing = "---\nname: changelog\ndescription: hand-written\n---\n\nKeep me.\n";
  writeFileSync(join(agentsDir, "changelog.md"), existing);
  const lockBefore = readFileSync(lockPath, "utf8");

  const result = createAgent(request(lockPath));
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /already exists — pass --force/);
  // Atomicity: the role must not land when the agent file is refused, or a failed
  // run leaves a role behind with no agent.
  assert.equal(readFileSync(lockPath, "utf8"), lockBefore);
  assert.equal(readFileSync(join(agentsDir, "changelog.md"), "utf8"), existing);
});

test("createAgent refuses a weight sum the engine's math would silently rescale", () => {
  const { lockPath, agentsDir } = workspace();

  // Σ = 1.005 passes the plugin validator (±0.01) but breaks Σ(non-price) = 1 − price,
  // which is what `q = Σ (wᵢ/(1−w_price))·tᵢ` divides by.
  const result = createAgent(request(lockPath, { weights: { general: 0.4, price: 0.3, throughput: 0.305 } }));
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /non-price weights sum to 0.705, must be exactly 1 − price = 0.7/);
  assert.equal(existsSync(join(agentsDir, "changelog.md")), false);
});

test("createAgent requires the price and throughput gates", () => {
  const { lockPath, agentsDir } = workspace();

  const noGate = createAgent(request(lockPath, { required: ["general"] }));
  assert.equal(noGate.ok, false);
  assert.match(noGate.errors.join(" "), /required must include "price"/);

  const noThroughput = createAgent(request(lockPath, { weights: { general: 0.5, price: 0.5 } }));
  assert.equal(noThroughput.ok, false);
  assert.match(noThroughput.errors.join(" "), /throughput must be weighted/);

  assert.equal(existsSync(agentsDir), false);
});

test("createAgent --dry-run validates without touching the lock or the agents dir", () => {
  const { lockPath, dir } = workspace();
  const before = readFileSync(lockPath, "utf8");

  const result = createAgent(request(lockPath, { dryRun: true }));
  assert.ok(result.ok);
  assert.equal(result.dryRun, true);
  assert.equal(readFileSync(lockPath, "utf8"), before);
  assert.deepEqual(readdirSync(dir), ["omp-plugins.lock.json"]);
});

test("createAgent uses omp's architect spec for the description and body", () => {
  const { lockPath, agentsDir } = workspace();
  const spec = {
    identifier: "changelog",
    whenToUse: "Use this agent when drafting changelogs from git history.",
    systemPrompt: "You are a release-notes writer.\n\n<critical>\nRead-only.\n</critical>",
  };

  const result = createAgent(request(lockPath, { spec }));
  assert.ok(result.ok, result.ok ? "" : result.errors.join("; "));
  assert.equal(result.def.description, spec.whenToUse);

  const text = readFileSync(join(agentsDir, "changelog.md"), "utf8");
  const fm = frontmatter(text);
  // The architect's routing rule and body replace the archetype template...
  assert.equal(fm.description, spec.whenToUse);
  assert.match(text, /You are a release-notes writer\./);
  assert.doesNotMatch(text, /Work the prose writer role/);
  // ...but the plugin still adds the frontmatter omp's own writer omits.
  assert.equal(fm.model, "@changelog, @default");
  assert.equal(fm.tools, "read, grep, glob, find, write, edit");
});

test("without an architect spec the role description is the one-line purpose", () => {
  const { lockPath } = workspace();
  const result = createAgent(request(lockPath));
  assert.ok(result.ok);
  assert.equal(result.def.description, "write release notes and changelogs from git history");
});

test("a benchmark URL in the purpose does not bias the archetype fit", () => {
  const { lockPath } = workspace();
  const result = createAgent(request(lockPath, { purpose: "i want an agent for writing. use https://llm-stats.com/benchmarks/technical-debt" }));
  assert.ok(result.ok);
  assert.equal(result.archetype.id, "prose");
});

test("the template body names the benchmarks the role was ranked on", () => {
  const { lockPath, agentsDir } = workspace();
  const result = createAgent(request(lockPath, { benchmarkLabels: ["WritingBench (writing leaderboard)"] }));
  assert.ok(result.ok, result.ok ? "" : result.errors.join("; "));
  const text = readFileSync(join(agentsDir, "changelog.md"), "utf8");
  assert.match(text, /chosen on WritingBench \(writing leaderboard\)/);
});

test("applyFocusBenchmarks gives a named benchmark a decisive share and keeps the invariants", () => {
  const base = { general: 0.4, code: 0.2, price: 0.2, throughput: 0.2 };

  const applied = applyFocusBenchmarks(base, ["writing", "code", "nope"]);
  assert.deepEqual(applied.added, ["writing"]);
  assert.deepEqual(applied.duplicates, ["code"]);
  assert.deepEqual(applied.unknown, ["nope"]);

  // The archetype's specialist share is 0.2 (code), so the focus budget floors at
  // 0.25 and is split across the two focus metrics.
  assert.equal(applied.weights.writing, 0.125);
  assert.equal(applied.weights.code, 0.125);
  assert.equal(applied.weights.price, 0.2);

  const sum = Object.values(applied.weights).reduce((total, weight) => total + weight, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, `weights sum to ${sum}`);
  const nonPrice = Object.entries(applied.weights)
    .filter(([metric]) => metric !== "price")
    .reduce((total, [, weight]) => total + weight, 0);
  assert.ok(Math.abs(nonPrice - (1 - applied.weights.price)) < 1e-9, `non-price sum ${nonPrice}`);
  // Rescaled weights are rounded to 4 decimals so the written role def stays readable.
  for (const [metric, weight] of Object.entries(applied.weights)) {
    assert.equal(weight, Math.round(weight * 1e4) / 1e4, `${metric} is not 4-decimal: ${weight}`);
  }

  // The rebalanced set still passes the plugin's own validator.
  const { errors } = resolveSettings({
    roles: { x: { weights: applied.weights, required: ["general", "price", "throughput"] } },
  });
  assert.deepEqual(errors, []);

  // An empty list is a no-op.
  assert.deepEqual(applyFocusBenchmarks(base, []).weights, base);
});

test("applyFocusBenchmarks is a no-op when the named set is the archetype's own specialists", () => {
  // The archetype's only specialist is `writing` at 0.3, inside the focus band, so
  // the focus share equals its archetype share and nothing moves.
  const base = { general: 0.4, writing: 0.3, throughput: 0.1, price: 0.2 };
  const applied = applyFocusBenchmarks(base, ["writing"]);
  assert.deepEqual(applied.weights, base);
  assert.deepEqual(applied.duplicates, ["writing"]);
  assert.deepEqual(applied.added, []);
});

test("applyFocusBenchmarks accepts an external metric key", () => {
  const base = { general: 0.4, code: 0.2, price: 0.2, throughput: 0.2 };
  const applied = applyFocusBenchmarks(base, ["bench:alpacaeval-2_0"]);
  assert.deepEqual(applied.added, ["bench:alpacaeval-2_0"]);
  assert.equal(applied.weights["bench:alpacaeval-2_0"], 0.25);
  const { errors } = resolveSettings({
    roles: { x: { weights: applied.weights, required: ["general", "price", "throughput"] } },
  });
  assert.deepEqual(errors, []);
});

test("the raw llm-stats benchmarks are weightable", () => {
  // These are in Model.metrics and scored by cardinalMetric, so a user naming one
  // as "another benchmark" must be able to weight it.
  for (const metric of ["gpqa", "aime", "swe_bench", "arc_agi", "terminal_bench", "tau_bench"]) {
    assert.ok(metric in KNOWN_METRICS, `${metric} is not weightable`);
    const { errors } = resolveSettings({ roles: { x: { weights: { [metric]: 0.5, price: 0.5 }, required: [] } } });
    assert.deepEqual(errors, [], `${metric}: ${errors.join("; ")}`);
  }
});

test("formatBenchmarks lists every weightable metric and marks the role's own", () => {
  const text = formatBenchmarks({ general: 0.5, price: 0.5 });
  for (const metric of Object.keys(KNOWN_METRICS)) {
    assert.match(text, new RegExp(`\\b${metric}\\b`), `missing ${metric}`);
  }
  assert.match(text, /general\s+General index\s+<- in this role's weights/);

  // An external metric in use is listed too, with its registry label.
  const withExternal = formatBenchmarks(undefined, ["bench:alpacaeval-2_0"]);
  assert.match(withExternal, /bench:alpacaeval-2_0/);
});

test("extractBenchmarkLinks pulls URLs out of prose, deduped and punctuation-stripped", () => {
  assert.deepEqual(extractBenchmarkLinks("no links here"), []);
  assert.deepEqual(extractBenchmarkLinks("see https://llm-stats.com/benchmarks/alpacaeval-2.0."), [
    "https://llm-stats.com/benchmarks/alpacaeval-2.0",
  ]);
  assert.deepEqual(
    extractBenchmarkLinks("a https://x.example/one and b https://x.example/one and c https://y.example/two"),
    ["https://x.example/one", "https://y.example/two"],
  );
});

test("parseCreateAgentInput treats a non-flag string as a free-text request", () => {
  const raw =
    "i want an agent for writing. use the writing related Benchmarks in the Leaderboard https://llm-stats.com/leaderboards/best-ai-for-writing";
  const parsed = parseCreateAgentInput(raw);
  assert.ok(parsed.ok, parsed.ok ? "" : parsed.error);
  assert.equal(parsed.freeText, true);
  assert.equal(parsed.request.purpose, raw);
  assert.equal(parsed.request.name, "");
  assert.deepEqual(parsed.request.extraBenchmarks, ["writing"]);
  assert.deepEqual(parsed.request.benchmarkLinks, ["https://llm-stats.com/leaderboards/best-ai-for-writing"]);

  // The flag form is unchanged.
  const flags = parseCreateAgentInput('--name writer --purpose "write prose"');
  assert.ok(flags.ok, flags.ok ? "" : flags.error);
  assert.equal(flags.freeText, false);
  assert.equal(flags.request.name, "writer");
  assert.equal(flags.request.purpose, "write prose");

  // Trailing flags still apply, so a free-text request can be previewed.
  const dry = parseCreateAgentInput("i want an agent for writing --dry-run --scope project");
  assert.ok(dry.ok, dry.ok ? "" : dry.error);
  assert.equal(dry.freeText, true);
  assert.equal(dry.request.purpose, "i want an agent for writing");
  assert.equal(dry.request.dryRun, true);
  assert.equal(dry.request.scope, "project");

  // Empty input is refused, not silently treated as a purpose.
  assert.equal(parseCreateAgentInput("   ").ok, false);
});

test("extractBenchmarks matches whole words and underscore/space variants", () => {
  assert.deepEqual(extractBenchmarks("an agent for writing"), ["writing"]);
  assert.deepEqual(extractBenchmarks("weight long context and tool calling"), ["tool_calling", "long_context"]);
  assert.deepEqual(extractBenchmarks("run swe bench and terminal bench"), ["swe_bench", "terminal_bench"]);
  // "agent" is not the "agents" metric; price/throughput are never extracted.
  assert.deepEqual(extractBenchmarks("a cheap agent for price and throughput"), []);
});

test("a free-text request creates the agent under the architect's identifier", () => {
  const { lockPath, agentsDir } = workspace();
  const parsed = parseCreateAgentInput("i want an agent for writing");
  assert.ok(parsed.ok, parsed.ok ? "" : parsed.error);

  // The extension fills the name from the architect's identifier.
  parsed.request.lockPath = lockPath;
  parsed.request.spec = {
    identifier: "prose-writer",
    whenToUse: "Use this agent when you need polished prose.",
    systemPrompt: "You are a prose writer.",
  };
  parsed.request.name = parsed.request.spec.identifier;

  const result = createAgent(parsed.request);
  assert.ok(result.ok, result.ok ? "" : result.errors.join("; "));
  assert.equal(result.name, "prose-writer");
  assert.equal(result.archetype.id, "prose");
  assert.deepEqual(result.bench.duplicates, ["writing"]);
  assert.ok(existsSync(join(agentsDir, "prose-writer.md")));
});

test("fitArchetype scores by matched keyword length and falls back on no match", () => {
  // "technical debt" (13) beats the generic "code" (4) in the same purpose.
  assert.equal(fitArchetype("pay down technical debt in this legacy code").archetype.id, "refactor");
  const unmatched = fitArchetype("do something entirely unrelated");
  assert.equal(unmatched.archetype.id, "general");
  assert.deepEqual(unmatched.matched, []);
});

test("discoverBenchmarks filters by coverage, ranks lexically, and maps metrics", async () => {
  // Alphabetical order, so a blind cap would drop the writing benchmarks.
  const catalog: BenchmarkCatalogEntry[] = [
    { id: "aaa-generic", name: "AAA Generic", description: "unrelated", categories: ["misc"], modelCount: 10, isCommunity: false, modality: null, updatedAt: null, versionCount: null, latestVersionRowCount: null, starCount: null, datasetId: null, datasetOrgId: null, datasetSlug: null },
    { id: "creative-writing-v3", name: "Creative Writing v3", description: "prose", categories: ["misc"], modelCount: 15, isCommunity: false, modality: null, updatedAt: null, versionCount: null, latestVersionRowCount: null, starCount: null, datasetId: null, datasetOrgId: null, datasetSlug: null },
    { id: "tiny-writing", name: "Tiny Writing", description: "writing", categories: ["writing"], modelCount: 1, isCommunity: false, modality: null, updatedAt: null, versionCount: null, latestVersionRowCount: null, starCount: null, datasetId: null, datasetOrgId: null, datasetSlug: null },
    { id: "writingbench", name: "WritingBench", description: "", categories: ["writing"], modelCount: 16, isCommunity: false, modality: null, updatedAt: null, versionCount: null, latestVersionRowCount: null, starCount: null, datasetId: null, datasetOrgId: null, datasetSlug: null },
  ];
  let seen: readonly BenchmarkCatalogEntry[] = [];
  const decide = async (_purpose: string, candidates: readonly BenchmarkCatalogEntry[]) => {
    seen = candidates;
    return ["writingbench", "creative-writing-v3"];
  };

  const result = await discoverBenchmarks("write prose and creative writing", catalog, decide);
  // The 1-model benchmark is dropped before the decision; the unrelated entry
  // has no purpose-token overlap and is not handed to the judge either. The
  // category-matching benchmark outranks the name-only one.
  assert.deepEqual(seen.map((entry) => entry.id), ["writingbench", "creative-writing-v3"]);
  assert.ok(seen.some((entry) => entry.id === "writingbench"));
  assert.ok(!seen.some((entry) => entry.id === "aaa-generic"));
  // A shipped metric resolves to its key; an unknown one to `bench:<id>`. The
  // catalog's model count rides along as the coverage numerator.
  assert.deepEqual(result.discovered, [
    { metric: "writing", label: "WritingBench", covered: 16 },
    { metric: "bench:creative-writing-v3", label: "Creative Writing v3", covered: 15 },
  ]);
  assert.deepEqual(result.dropped, []);

  // A metric already in `exclude` is skipped.
  const excluded = await discoverBenchmarks("write prose and creative writing", catalog, decide, ["writing"]);
  assert.deepEqual(excluded.discovered, [{ metric: "bench:creative-writing-v3", label: "Creative Writing v3", covered: 15 }]);

  // No lexical overlap at all: nothing is handed to the judge.
  let called = false;
  const none = await discoverBenchmarks("quantum chromodynamics", catalog, async () => {
    called = true;
    return [];
  });
  assert.deepEqual(none.discovered, []);
  assert.equal(called, false);
});

test("discoverBenchmarks carries the declaration a dotted catalog id needs", async () => {
  const catalog: BenchmarkCatalogEntry[] = [
    { id: "deepswe-1.1", name: "DeepSWE v1.1", description: "coding agentic", categories: ["coding"], modelCount: 40, isCommunity: false, modality: null, updatedAt: null, versionCount: null, latestVersionRowCount: null, starCount: null, datasetId: null, datasetOrgId: null, datasetSlug: null },
  ];
  const result = await discoverBenchmarks("agentic coding", catalog, async () => ["deepswe-1.1"], [], null);
  assert.deepEqual(result.discovered.map((d) => d.metric), ["bench:deepswe-1_1"]);
  const declaration = result.discovered[0].declaration;
  assert.ok(declaration);
  // The raw dotted id rides in the fetch URL, so the updater can re-fetch it.
  assert.equal(declaration.fetch.url, "https://api.zeroeval.com/leaderboard/benchmarks/deepswe-1.1");
});

test("discoverBenchmarks drops a fill-0 benchmark whose coverage is below the share floor", async () => {
  // `swe-bench-verified` maps to the fill-0 `swe_bench` metric; 20/400 = 5% is
  // far below the 35% bar, so it must not become a decisive focus weight.
  const catalog: BenchmarkCatalogEntry[] = [
    { id: "swe-bench-verified", name: "SWE-bench Verified", description: "coding", categories: ["coding"], modelCount: 20, isCommunity: false, modality: null, updatedAt: null, versionCount: null, latestVersionRowCount: null, starCount: null, datasetId: null, datasetOrgId: null, datasetSlug: null },
    { id: "gpqa", name: "GPQA", description: "coding", categories: ["coding"], modelCount: 300, isCommunity: false, modality: null, updatedAt: null, versionCount: null, latestVersionRowCount: null, starCount: null, datasetId: null, datasetOrgId: null, datasetSlug: null },
    { id: "writingbench", name: "WritingBench", description: "coding", categories: ["coding"], modelCount: 4, isCommunity: false, modality: null, updatedAt: null, versionCount: null, latestVersionRowCount: null, starCount: null, datasetId: null, datasetOrgId: null, datasetSlug: null },
  ];
  const decide = async () => ["swe-bench-verified", "gpqa", "writingbench"];

  const result = await discoverBenchmarks("coding", catalog, decide, [], 400);
  // `swe_bench` (fill 0, 5%) is dropped; `gpqa` (fill 0, 75%) is kept; `writing`
  // (fill 0.195) is kept regardless of its 1% coverage.
  assert.deepEqual(result.discovered.map((d) => d.metric), ["gpqa", "writing"]);
  assert.deepEqual(result.dropped.map((d) => d.metric), ["swe_bench"]);
  assert.match(result.dropped[0].reason, /20\/400/);

  // With an unknown field size the share rule is skipped: the fill rule alone
  // applies, so the fill-0 sparse benchmark survives (annotated, not dropped).
  const unknown = await discoverBenchmarks("coding", catalog, decide, [], null);
  assert.deepEqual(unknown.discovered.map((d) => d.metric), ["gpqa", "swe_bench", "writing"]);
  assert.deepEqual(unknown.dropped, []);
});

test("focusCoverageOk: fill override, share floor boundary, and unknown field size", () => {
  // A capability-filled metric is safe at any coverage.
  assert.equal(focusCoverageOk("writing", 0, 400), "ok");
  assert.equal(focusCoverageOk("bench:whatever", 0, 400), "ok");
  // A fill-0 metric is gated on the share.
  assert.equal(focusCoverageOk("gpqa", 400, 400), "ok");
  assert.equal(focusCoverageOk("gpqa", Math.ceil(FOCUS_COVERAGE_FLOOR * 400), 400), "ok");
  assert.equal(focusCoverageOk("gpqa", Math.ceil(FOCUS_COVERAGE_FLOOR * 400) - 1, 400), "below-bar");
  // Unknown field size: the share rule is skipped.
  assert.equal(focusCoverageOk("gpqa", 0, null), "unknown");
  assert.equal(focusCoverageOk("gpqa", 0, 0), "unknown");
});

test("countMetricCoverage counts real values, not the imputed fill", () => {
  const models = [makeModel("a", 30, 1, 50), makeModel("b", 30, 1, 50)];
  models[0].metrics.writing = 0.7;
  models[1].metrics.writing = 0.195; // the capability fill, not a real score
  models[0].metrics.gpqa = 0.5;
  assert.equal(countMetricCoverage(models, "writing"), 1);
  assert.equal(countMetricCoverage(models, "gpqa"), 1);
  assert.equal(countMetricCoverage(models, "aime"), 0);
});

test("applyFocusBenchmarks caps the focus set and reports the drops", () => {
  const base = { general: 0.4, code: 0.2, price: 0.2, throughput: 0.2 };
  const applied = applyFocusBenchmarks(base, ["writing", "code", "math", "search", "vision"]);
  // Priority order is preserved: the first FOCUS_METRIC_CAP survive.
  assert.deepEqual(applied.added, ["writing", "math"]);
  assert.deepEqual(applied.duplicates, ["code"]);
  assert.deepEqual(applied.dropped, ["search", "vision"]);
  assert.equal(applied.weights.search, undefined);
  assert.equal(applied.weights.vision, undefined);

  const sum = Object.values(applied.weights).reduce((total, weight) => total + weight, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, `weights sum to ${sum}`);
  const nonPrice = Object.entries(applied.weights)
    .filter(([metric]) => metric !== "price")
    .reduce((total, [, weight]) => total + weight, 0);
  assert.ok(Math.abs(nonPrice - (1 - applied.weights.price)) < 1e-9, `non-price sum ${nonPrice}`);
  assert.equal(FOCUS_METRIC_CAP, 3);
});

test("applyFocusBenchmarks annotates coverage and warns below the bar", () => {
  const base = { general: 0.4, code: 0.2, price: 0.2, throughput: 0.2 };
  const applied = applyFocusBenchmarks(base, ["gpqa", "writing"], {
    total: 400,
    covered: { gpqa: 20, writing: 4 },
  });
  assert.deepEqual(applied.assessments.gpqa.coverage, { covered: 20, total: 400, share: 0.05, fill: 0, status: "below-bar" });
  assert.equal(applied.assessments.writing.coverage.status, "ok");
  assert.equal(applied.assessments.writing.coverage.fill, 0.195);
  // Without a loaded pool the eight new axes are unknown, never a silent ok.
  assert.equal(applied.assessments.gpqa.dispersion.status, "unknown");
  assert.equal(applied.assessments.gpqa.composition.status, "unknown");
  assert.equal(applied.assessments.gpqa.freshness.status, "unknown");
  assert.equal(applied.assessments.gpqa.trust.status, "unknown");
  assert.equal(applied.assessments.gpqa.modality.status, "unknown");
  assert.equal(applied.assessments.gpqa.maintenance.status, "unknown");
  assert.equal(applied.assessments.gpqa.provenance.status, "unknown");
  assert.equal(applied.assessments.gpqa.crossSource.status, "unknown");

  // Unknown field size: annotated, not warned.
  const unknown = applyFocusBenchmarks(base, ["gpqa"], { total: null, covered: {} });
  assert.equal(unknown.assessments.gpqa.coverage.status, "unknown");
  assert.equal(unknown.assessments.gpqa.coverage.share, null);
});

test("extractBenchmarks ignores the always-weighted backbone but keeps reasoning", () => {
  // "general"/"price"/"throughput" are weighted by every archetype, so ordinary
  // prose naming them must not fold them in as focus metrics.
  assert.deepEqual(extractBenchmarks("a general agent, cheap on price and throughput"), []);
  // `reasoning` is not weighted by every archetype, so it stays extractable.
  assert.deepEqual(extractBenchmarks("an agent for reasoning and writing"), ["reasoning", "writing"]);
});

test("differentiationWarning fires only when the new role's leader equals default's", () => {
  // A: strong but expensive; B: weaker but cheap. The default role (general-heavy)
  // leads with A; a price-heavy role leads with B.
  const models = [makeModel("strong", 50, 10, 100), makeModel("cheap", 40, 0.5, 100)];
  const defaultDef: RoleDef = { description: "d", weights: { general: 0.9, price: 0.05, throughput: 0.05 }, required: ["general", "price", "throughput"] };
  const priceDef: RoleDef = { description: "p", weights: { general: 0.1, price: 0.8, throughput: 0.1 }, required: ["general", "price", "throughput"] };

  assert.equal(rankRole(defaultDef, models)[0].model.id, "strong");
  assert.equal(rankRole(priceDef, models)[0].model.id, "cheap");
  assert.match(differentiationWarning(defaultDef, defaultDef, models) ?? "", /leader \(strong\)/);
  assert.equal(differentiationWarning(priceDef, defaultDef, models), null);
  assert.equal(differentiationWarning(defaultDef, defaultDef, []), null);
});

test("formatCreateAgentReport prints coverage, a below-bar warning, and the differentiation warning", () => {
  const { lockPath } = workspace();
  const result = createAgent(request(lockPath, {
    dryRun: true,
    extraBenchmarks: ["gpqa", "writing"],
    coverage: { total: 400, covered: { gpqa: 20, writing: 4 } },
  }));
  assert.ok(result.ok, result.ok ? "" : result.errors.join("; "));
  const report = formatCreateAgentReport(result, "ranking…", { differentiation: "the new role's leader (x) is also the default role's leader" });
  assert.match(report, /coverage:\s+gpqa 20\/400 \(5\.0%\) below-bar/);
  assert.match(report, /coverage:\s+writing 4\/400 \(1\.0%\) ok/);
  assert.match(report, /warning:\s+gpqa coverage 20\/400 is below the 35% bar/);
  assert.match(report, /warning:\s+the new role's leader \(x\)/);

  // Unknown field size: annotated without a warning.
  const unknown = createAgent(request(lockPath, { dryRun: true, extraBenchmarks: ["gpqa"], coverage: { total: null, covered: {} } }));
  assert.ok(unknown.ok);
  const unknownReport = formatCreateAgentReport(unknown, "ranking…");
  assert.match(unknownReport, /coverage:\s+gpqa unknown \(field size unavailable\)/);
  assert.doesNotMatch(unknownReport, /below the 35% bar/);
});

test("createAgent writes the agent file before the role and rolls it back when the role write fails", () => {
  const { dir, lockPath, agentsDir } = workspace();
  // A lock path whose parent is a FILE, not a directory: the dry-run pre-flight
  // only reads (a missing file is `{}`), but the real atomic write cannot create
  // the parent dir and throws ENOTDIR.
  const blocker = join(dir, "blocker");
  writeFileSync(blocker, "");
  const badLock = join(blocker, "omp-plugins.lock.json");

  const result = createAgent(request(badLock));
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /the agent file .* was written, but the role was not/);
  assert.match(result.errors.join(" "), /the agent file was removed/);
  // Rollback: no dangling agent, no lock file, so a retry needs no --force.
  assert.equal(existsSync(join(agentsDir, "changelog.md")), false);
  assert.equal(existsSync(badLock), false);
  assert.equal(readFileSync(lockPath, "utf8").includes("changelog"), false);
});

test("createAgent --force restores the prior agent file when the role write fails", () => {
  const { dir, agentsDir } = workspace();
  mkdirSync(agentsDir, { recursive: true });
  const prior = "---\nname: changelog\ndescription: hand-written\n---\n\nKeep me.\n";
  writeFileSync(join(agentsDir, "changelog.md"), prior);
  const blocker = join(dir, "blocker");
  writeFileSync(blocker, "");
  const badLock = join(blocker, "omp-plugins.lock.json");

  const result = createAgent(request(badLock, { force: true }));
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /the prior agent file was restored/);
  // Blind removal would destroy the user's agent and leave the old role dangling.
  assert.equal(readFileSync(join(agentsDir, "changelog.md"), "utf8"), prior);
});

test("resolveRole previews the request's weights without writing", () => {
  const { lockPath, dir } = workspace();
  const resolved = resolveRole(request(lockPath));
  assert.ok(!("errors" in resolved));
  assert.equal(resolved.archetype.id, "prose");
  // The preview is the archetype's weights, so the live prompt can mark them.
  assert.deepEqual(resolved.def.weights, resolved.archetype.weights);
  assert.deepEqual(readdirSync(dir), ["omp-plugins.lock.json"]);
});

test("parseCreateAgentInput carries the discovery flags", () => {
  const noDiscover = parseCreateAgentInput('--name writer --purpose "write prose" --no-discover');
  assert.ok(noDiscover.ok, noDiscover.ok ? "" : noDiscover.error);
  assert.equal(noDiscover.noDiscover, true);
  assert.equal(noDiscover.explicitBenchmarks, false);

  const explicit = parseCreateAgentInput('--name writer --purpose "write prose" --benchmarks writing');
  assert.ok(explicit.ok, explicit.ok ? "" : explicit.error);
  assert.equal(explicit.explicitBenchmarks, true);
  assert.deepEqual(explicit.request.extraBenchmarks, ["writing"]);
  assert.equal(explicit.noDiscover, false);
});

// ---------------------------------------------------------------------------
// The nine-axis focus-metric assessment (issue #17, trust axis #34, modality axis #35, maintenance axis #36, provenance axis #37, cross-source axis #38)
// ---------------------------------------------------------------------------

/** A pool with distinct orgs and release dates, for the assessment axes. */
function assessmentPool(): Model[] {
  const models = [makeModel("a", 30, 1, 50), makeModel("b", 40, 1, 50), makeModel("c", 50, 1, 50), makeModel("d", 60, 1, 50)];
  models[0].org = "Alpha";
  models[1].org = "Alpha";
  models[2].org = "Beta";
  models[3].org = "Gamma";
  for (const m of models) m.releaseDate = "2025-06-01";
  return models;
}

test("assessFocusMetric: dispersion is gated on the floor and unknown below two values", () => {
  const models = assessmentPool();
  models[0].metrics.aime = 0.2;
  models[1].metrics.aime = 0.5;
  models[2].metrics.aime = 0.8;
  models[3].metrics.aime = 0.9;
  const spread = assessFocusMetric(models, "aime");
  assert.equal(spread.dispersion.status, "ok");
  assert.ok(spread.dispersion.value !== null && spread.dispersion.value > FOCUS_DISPERSION_FLOOR);

  // Saturated: all ~0.5, IQR/median under the floor.
  models[0].metrics.aime = 0.5;
  models[1].metrics.aime = 0.51;
  models[2].metrics.aime = 0.52;
  models[3].metrics.aime = 0.53;
  const flat = assessFocusMetric(models, "aime");
  assert.equal(flat.dispersion.status, "below-bar");
  assert.ok(flat.dispersion.value !== null && flat.dispersion.value < FOCUS_DISPERSION_FLOOR);

  // Fewer than two covered values: no scale to divide by.
  const one = assessmentPool();
  one[0].metrics.aime = 0.5;
  assert.equal(assessFocusMetric(one, "aime").dispersion.status, "unknown");
});

test("assessFocusMetric: the cardinal transform makes index and 0-1 metrics comparable", () => {
  // Raw index 20/40/60 -> (v+20)/80 = 0.5/0.75/1.0; the same normalized spread as
  // a 0-1 benchmark at 0.5/0.75/1.0, so one floor covers both.
  const index = [makeModel("a", 20, 1, 50), makeModel("b", 40, 1, 50), makeModel("c", 60, 1, 50)];
  const bench = [makeModel("a", 30, 1, 50), makeModel("b", 30, 1, 50), makeModel("c", 30, 1, 50)];
  bench[0].metrics.aime = 0.5;
  bench[1].metrics.aime = 0.75;
  bench[2].metrics.aime = 1.0;
  const a = assessFocusMetric(index, "general");
  const b = assessFocusMetric(bench, "aime");
  assert.ok(a.dispersion.value !== null && b.dispersion.value !== null);
  assert.ok(Math.abs(a.dispersion.value - b.dispersion.value) < 1e-9, `${a.dispersion.value} vs ${b.dispersion.value}`);
});

test("assessFocusMetric: composition flags an org the covered set omits, ignoring rare orgs", () => {
  const models = assessmentPool(); // Alpha×2, Beta, Gamma
  for (const m of models) m.metrics.gpqa = 0.5;
  assert.equal(assessFocusMetric(models, "gpqa").composition.status, "ok");

  // Only Alpha covered: Beta and Gamma (each 25% of the pool) are omitted.
  models[2].metrics.gpqa = null;
  models[3].metrics.gpqa = null;
  const skewed = assessFocusMetric(models, "gpqa");
  assert.equal(skewed.composition.status, "below-bar");
  assert.deepEqual(skewed.composition.omittedOrgs, ["Beta", "Gamma"]);

  // An org below the minimum pool share is ignored (1/20 = 5% < 10%).
  const rare: Model[] = [];
  for (let i = 0; i < 19; i++) rare.push(makeModel(`a${i}`, 30, 1, 50));
  rare.push(makeModel("rare", 30, 1, 50));
  rare[19].org = "Rare";
  for (let i = 0; i < 19; i++) rare[i].metrics.gpqa = 0.5;
  assert.equal(assessFocusMetric(rare, "gpqa").composition.status, "ok");
  assert.ok(FOCUS_ORG_MIN_SHARE > 1 / 20);
});

test("assessFocusMetric: freshness compares the covered set to the pool's newest", () => {
  const models = assessmentPool();
  for (const m of models) m.metrics.gpqa = 0.5;
  assert.equal(assessFocusMetric(models, "gpqa").freshness.status, "ok");

  // The covered set (Alpha, old) trails the pool's newest (Beta/Gamma, new).
  models[0].releaseDate = "2025-01-01";
  models[1].releaseDate = "2025-01-01";
  models[2].metrics.gpqa = null;
  models[3].metrics.gpqa = null;
  const stale = assessFocusMetric(models, "gpqa");
  assert.equal(stale.freshness.status, "below-bar");
  assert.ok(stale.freshness.monthsBehind !== null && stale.freshness.monthsBehind > FOCUS_STALENESS_MONTHS);

  // A missing date degrades to unknown.
  for (const m of models) m.releaseDate = null;
  assert.equal(assessFocusMetric(models, "gpqa").freshness.status, "unknown");
});

test("assessFocusMetric: an empty pool or an unloaded metric is all-unknown", () => {
  // Unknown field size: every axis unknown.
  const empty = assessFocusMetric([], "gpqa");
  assert.equal(empty.coverage.status, "unknown");
  assert.equal(empty.dispersion.status, "unknown");
  assert.equal(empty.composition.status, "unknown");
  assert.equal(empty.freshness.status, "unknown");
  assert.equal(empty.provenance.status, "unknown");

  // A `bench:<id>` absent from the pool: its scores were not loaded, so the new
  // axes are unknown — never a silent ok.
  const unloaded = assessFocusMetric(assessmentPool(), "bench:deepswe-1_1");
  assert.equal(unloaded.coverage.covered, 0);
  assert.equal(unloaded.coverage.status, "unknown");
  assert.equal(unloaded.dispersion.status, "unknown");
  assert.equal(unloaded.composition.status, "unknown");
  assert.equal(unloaded.freshness.status, "unknown");
  assert.equal(unloaded.provenance.status, "unknown");
});

test("belowBarReason names the failed axis", () => {
  const models = assessmentPool();
  models[0].metrics.aime = 0.5;
  models[1].metrics.aime = 0.51;
  models[2].metrics.aime = 0.52;
  models[3].metrics.aime = 0.53;
  assert.match(belowBarReason(assessFocusMetric(models, "aime")) ?? "", /dispersion 0\.0\d+ below the 0\.05 bar/);
  assert.equal(belowBarReason(assessFocusMetric([], "aime")), null);
});

test("assessFocusMetric: the trust axis reads the payload's self-reported share", () => {
  const models = assessmentPool();
  for (const m of models) m.metrics.gpqa = 0.5;
  const withTrust = (selfReported: number, covered: number) =>
    assessFocusMetric(models, "gpqa", [], { payload: { trust: { selfReported, verified: 0, covered }, modality: null } });

  // 19/20 self-reported is above the bar; an independently measured source passes.
  const flagged = withTrust(19, 20);
  assert.equal(flagged.trust.status, "below-bar");
  assert.equal(flagged.trust.selfReported, 19);
  assert.equal(flagged.trust.covered, 20);
  assert.equal(withTrust(0, 20).trust.status, "ok");

  // The bar is a strict majority: exactly half passes, more than half fails.
  assert.equal(FOCUS_SELF_REPORTED_MAX_SHARE, 0.5);
  assert.equal(withTrust(10, 20).trust.status, "ok");
  assert.equal(withTrust(11, 20).trust.status, "below-bar");

  // A payload with no entry flags (a declared/writing source) is unknown, never ok.
  assert.equal(assessFocusMetric(models, "gpqa", [], { payload: { trust: null, modality: null } }).trust.status, "unknown");
  // No source info at all: unknown.
  assert.equal(assessFocusMetric(models, "gpqa").trust.status, "unknown");
  // An empty pool: every axis unknown, trust included.
  assert.equal(assessFocusMetric([], "gpqa", [], { payload: { trust: { selfReported: 19, verified: 0, covered: 20 }, modality: null } }).trust.status, "unknown");
});

test("assessFocusMetric: the trust axis annotates the catalog row's community flag", () => {
  const catalog = (isCommunity: boolean): BenchmarkCatalogEntry => ({ id: "gpqa", name: "GPQA", description: "", categories: [], modelCount: 4, isCommunity, modality: null, updatedAt: null, versionCount: null, latestVersionRowCount: null, starCount: null, datasetId: null, datasetOrgId: null, datasetSlug: null });

  // A metric whose scores were not loaded: the all-unknown branch still carries
  // the catalog row's community flag.
  const unloaded = assessmentPool();
  const unloadedCommunity = assessFocusMetric(unloaded, "gpqa", [], { catalog: catalog(true) });
  assert.equal(unloadedCommunity.trust.community, true);
  assert.equal(unloadedCommunity.trust.status, "unknown");

  const models = assessmentPool();
  for (const m of models) m.metrics.gpqa = 0.5;

  // A community row with no payload trust: unknown status, but visible as community.
  const community = assessFocusMetric(models, "gpqa", [], { catalog: catalog(true) });
  assert.equal(community.trust.community, true);
  assert.equal(community.trust.status, "unknown");

  // A non-community row stays unknown.
  const standard = assessFocusMetric(models, "gpqa", [], { catalog: catalog(false) });
  assert.equal(standard.trust.community, false);
  assert.equal(standard.trust.status, "unknown");

  // No source at all: no community flag.
  assert.equal(assessFocusMetric(models, "gpqa").trust.community, false);

  // The flag rides alongside an ok/below-bar status without changing it.
  const withTrust = (selfReported: number, covered: number) =>
    assessFocusMetric(models, "gpqa", [], { catalog: catalog(true), payload: { trust: { selfReported, verified: 0, covered }, modality: null } });
  const ok = withTrust(0, 20);
  assert.equal(ok.trust.community, true);
  assert.equal(ok.trust.status, "ok");
  const flagged = withTrust(19, 20);
  assert.equal(flagged.trust.community, true);
  assert.equal(flagged.trust.status, "below-bar");

  // The community flag is an annotation, never a gate: belowBarReason never names it.
  assert.doesNotMatch(belowBarReason(flagged) ?? "", /community/);
});

test("assessFocusMetric: the modality axis is an annotation, never a gate", () => {
  const models = assessmentPool();
  for (const m of models) m.metrics.gpqa = 0.5;
  const catalog = (modality: string | null): BenchmarkCatalogEntry => ({ id: "gpqa", name: "GPQA", description: "", categories: [], modelCount: 4, isCommunity: false, modality, updatedAt: null, versionCount: null, latestVersionRowCount: null, starCount: null, datasetId: null, datasetOrgId: null, datasetSlug: null });

  // The catalog row's modality alone is enough for ok.
  const fromCatalog = assessFocusMetric(models, "gpqa", [], { catalog: catalog("image") });
  assert.equal(fromCatalog.modality.status, "ok");
  assert.equal(fromCatalog.modality.value, "image");
  assert.equal(fromCatalog.modality.multimodalShare, null);

  // The payload's multimodal share alone is enough for ok.
  const fromPayload = assessFocusMetric(models, "gpqa", [], { payload: { trust: null, modality: { multimodal: 1, covered: 2 } } });
  assert.equal(fromPayload.modality.status, "ok");
  assert.equal(fromPayload.modality.value, null);
  assert.equal(fromPayload.modality.multimodalShare, 0.5);

  // Both signals: the value and the share are carried together.
  const both = assessFocusMetric(models, "gpqa", [], {
    catalog: catalog("multimodal"),
    payload: { trust: null, modality: { multimodal: 3, covered: 4 } },
  });
  assert.equal(both.modality.value, "multimodal");
  assert.equal(both.modality.multimodalShare, 0.75);

  // A fully-multimodal share is still `ok` — the axis is informational, never below-bar.
  assert.equal(assessFocusMetric(models, "gpqa", [], { payload: { trust: null, modality: { multimodal: 2, covered: 2 } } }).modality.status, "ok");

  // No source info at all: unknown.
  assert.equal(assessFocusMetric(models, "gpqa").modality.status, "unknown");
  // A payload with no entry flags and no catalog row: unknown.
  assert.equal(assessFocusMetric(models, "gpqa", [], { payload: { trust: null, modality: null } }).modality.status, "unknown");
  // An empty pool: every axis unknown, modality included.
  assert.equal(assessFocusMetric([], "gpqa", [], { catalog: catalog("image") }).modality.status, "unknown");

  // A text-only benchmark for a multimodal role is still `ok`, and belowBarReason
  // never names modality (the axis cannot drop a candidate).
  const textOnly = assessFocusMetric(models, "gpqa", [], { catalog: catalog("text") });
  assert.equal(textOnly.modality.status, "ok");
  assert.equal(textOnly.modality.value, "text");
  assert.doesNotMatch(belowBarReason(textOnly) ?? "", /modality/);
});

test("assessFocusMetric: the maintenance axis reads the catalog row's dataset age, never a gate", () => {
  const models = assessmentPool();
  // Distinct values so dispersion/composition/freshness are all ok and maintenance
  // is the only axis that can be below-bar.
  models[0].metrics.gpqa = 0.2;
  models[1].metrics.gpqa = 0.5;
  models[2].metrics.gpqa = 0.8;
  models[3].metrics.gpqa = 0.9;
  const catalog = (updatedAt: string | null, versionCount: number | null = null, starCount: number | null = null): BenchmarkCatalogEntry => ({
    id: "gpqa",
    name: "GPQA",
    description: "",
    categories: [],
    modelCount: 4,
    isCommunity: false,
    modality: null,
    updatedAt,
    versionCount,
    latestVersionRowCount: null,
    starCount,
    datasetId: null,
    datasetOrgId: null,
    datasetSlug: null,
  });

  // A dataset last updated years ago is below-bar, with the age in months.
  const stale = assessFocusMetric(models, "gpqa", [], { catalog: catalog("2020-01-01T00:00:00Z", 4, 7) });
  assert.equal(stale.maintenance.status, "below-bar");
  const expected = (Date.now() - Date.parse("2020-01-01T00:00:00Z")) / (1000 * 60 * 60 * 24 * 30.4375);
  assert.ok(stale.maintenance.monthsOld !== null && Math.abs(stale.maintenance.monthsOld - expected) < 0.01);
  assert.ok(stale.maintenance.monthsOld > FOCUS_DATASET_STALENESS_MONTHS);
  assert.equal(stale.maintenance.updatedAt, "2020-01-01T00:00:00Z");
  assert.equal(stale.maintenance.versionCount, 4);
  assert.equal(stale.maintenance.starCount, 7);

  // A recently updated dataset is ok.
  const fresh = assessFocusMetric(models, "gpqa", [], { catalog: catalog(new Date().toISOString()) });
  assert.equal(fresh.maintenance.status, "ok");
  assert.ok(fresh.maintenance.monthsOld !== null && fresh.maintenance.monthsOld < FOCUS_DATASET_STALENESS_MONTHS);

  // A missing or unparseable updated_at degrades to unknown (never a false positive).
  assert.equal(assessFocusMetric(models, "gpqa", [], { catalog: catalog(null) }).maintenance.status, "unknown");
  assert.equal(assessFocusMetric(models, "gpqa", [], { catalog: catalog("not-a-date") }).maintenance.status, "unknown");
  // No source info at all: unknown.
  assert.equal(assessFocusMetric(models, "gpqa").maintenance.status, "unknown");
  // An empty pool: every axis unknown, maintenance included.
  assert.equal(assessFocusMetric([], "gpqa", [], { catalog: catalog("2020-01-01T00:00:00Z") }).maintenance.status, "unknown");

  // The axis is an annotation, never a gate: belowBarReason never names it.
  assert.equal(belowBarReason(stale), null);
  assert.doesNotMatch(belowBarReason(stale) ?? "", /maintenance/);
});

test("the maintenance axis never drops a discovered candidate (annotation, not a gate)", async () => {
  const catalog: BenchmarkCatalogEntry[] = [
    { id: "old", name: "Old Board", description: "coding", categories: ["coding"], modelCount: 300, isCommunity: false, modality: null, updatedAt: "2015-01-01T00:00:00Z", versionCount: 1, latestVersionRowCount: 40, starCount: 0, datasetId: null, datasetOrgId: null, datasetSlug: null },
  ];
  // Every other axis ok; maintenance is the only below-bar one.
  const staleOnly: FocusMetricAssessment = {
    coverage: { covered: 300, total: 400, share: 0.75, fill: 0, status: "ok" },
    dispersion: { value: 0.2, status: "ok" },
    composition: { omittedOrgs: [], status: "ok" },
    freshness: { newestCovered: "2025-06-01", newestPool: "2025-06-01", monthsBehind: 0, status: "ok" },
    trust: { selfReported: 0, covered: 20, status: "ok" },
    modality: { value: null, multimodalShare: null, status: "unknown" },
    maintenance: { updatedAt: "2015-01-01T00:00:00Z", monthsOld: 130, versionCount: 1, starCount: 0, status: "below-bar" },
    provenance: { owner: null, dominantOrg: null, dominantShare: null, compositionAgreement: "unknown", status: "unknown" },
    crossSource: { compared: 0, priceAgreement: "unknown", contextAgreement: "unknown", speedAgreement: "unknown", priceDivergence: null, contextDivergence: null, status: "unknown" },
  };
  assert.equal(belowBarReason(staleOnly), null);
  const discovered = await discoverBenchmarks("coding", catalog, async () => ["old"], [], 400, async () => staleOnly);
  assert.deepEqual(discovered.dropped, []);
  assert.equal(discovered.discovered.length, 1);
  assert.equal(discovered.discovered[0].metric, "bench:old");
});

test("assessFocusMetric: the provenance axis reads the owner and the source's org mix", () => {
  const models = assessmentPool();
  // Distinct values so dispersion/composition/freshness are all ok.
  models[0].metrics.gpqa = 0.2;
  models[1].metrics.gpqa = 0.5;
  models[2].metrics.gpqa = 0.8;
  models[3].metrics.gpqa = 0.9;
  const catalog = (datasetOrgId: string | null, datasetSlug: string | null = null): BenchmarkCatalogEntry => ({
    id: "gpqa",
    name: "GPQA",
    description: "",
    categories: [],
    modelCount: 4,
    isCommunity: false,
    modality: null,
    updatedAt: null,
    versionCount: null,
    latestVersionRowCount: null,
    starCount: null,
    datasetId: null,
    datasetOrgId,
    datasetSlug,
  });

  // The owner is the catalog row's dataset_org_id; a dominant share above the bar
  // flags the source as vendor-populated.
  const flagged = assessFocusMetric(models, "gpqa", [], {
    catalog: catalog("metr"),
    payload: { trust: null, modality: null, provenance: { dominantOrg: "openai", dominantShare: 0.9, orgs: 1, covered: 20 } },
  });
  assert.equal(flagged.provenance.owner, "metr");
  assert.equal(flagged.provenance.status, "below-bar");
  assert.equal(flagged.provenance.dominantOrg, "openai");
  assert.equal(flagged.provenance.dominantShare, 0.9);
  assert.equal(FOCUS_PROVENANCE_DOMINANT_SHARE, 0.5);

  // The bar is a strict majority: exactly half passes, more than half fails.
  const half = assessFocusMetric(models, "gpqa", [], {
    payload: { trust: null, modality: null, provenance: { dominantOrg: "openai", dominantShare: 0.5, orgs: 2, covered: 20 } },
  });
  assert.equal(half.provenance.status, "ok");
  const majority = assessFocusMetric(models, "gpqa", [], {
    payload: { trust: null, modality: null, provenance: { dominantOrg: "openai", dominantShare: 0.55, orgs: 2, covered: 20 } },
  });
  assert.equal(majority.provenance.status, "below-bar");

  // The owner falls back to dataset_slug when dataset_org_id is absent.
  const slugOwner = assessFocusMetric(models, "gpqa", [], { catalog: catalog(null, "metr/swe") });
  assert.equal(slugOwner.provenance.owner, "metr/swe");
  assert.equal(slugOwner.provenance.dominantShare, null);
  assert.equal(slugOwner.provenance.status, "ok");

  // A payload org mix with no catalog row: the owner is null, the mix still flags.
  const payloadOnly = assessFocusMetric(models, "gpqa", [], {
    payload: { trust: null, modality: null, provenance: { dominantOrg: "openai", dominantShare: 0.9, orgs: 1, covered: 20 } },
  });
  assert.equal(payloadOnly.provenance.owner, null);
  assert.equal(payloadOnly.provenance.status, "below-bar");

  // No source info at all: unknown.
  assert.equal(assessFocusMetric(models, "gpqa").provenance.status, "unknown");
  // A payload with no org mix and no catalog row: unknown.
  assert.equal(assessFocusMetric(models, "gpqa", [], { payload: { trust: null, modality: null, provenance: null } }).provenance.status, "unknown");
  // An empty pool: every axis unknown, provenance included.
  assert.equal(assessFocusMetric([], "gpqa", [], { catalog: catalog("metr") }).provenance.status, "unknown");
});

test("assessFocusMetric: provenance cross-checks the composition axis", () => {
  const models = assessmentPool();
  // Distinct values so dispersion/freshness are ok; composition is controlled by
  // whether Beta/Gamma carry the metric.
  models[0].metrics.gpqa = 0.2;
  models[1].metrics.gpqa = 0.5;
  models[2].metrics.gpqa = 0.8;
  models[3].metrics.gpqa = 0.9;
  const mix = (dominantShare: number) => ({ trust: null, modality: null, provenance: { dominantOrg: "openai", dominantShare, orgs: 2, covered: 20 } });

  // Composition ok + provenance ok: the two concur.
  const bothOk = assessFocusMetric(models, "gpqa", [], { payload: mix(0.5) });
  assert.equal(bothOk.composition.status, "ok");
  assert.equal(bothOk.provenance.status, "ok");
  assert.equal(bothOk.provenance.compositionAgreement, "agree");

  // Composition below-bar + provenance below-bar: the two concur.
  models[2].metrics.gpqa = null;
  models[3].metrics.gpqa = null;
  const bothFlagged = assessFocusMetric(models, "gpqa", [], { payload: mix(0.9) });
  assert.equal(bothFlagged.composition.status, "below-bar");
  assert.equal(bothFlagged.provenance.status, "below-bar");
  assert.equal(bothFlagged.provenance.compositionAgreement, "agree");

  // Composition below-bar, provenance ok: exactly one flagged → disagree.
  const compositionOnly = assessFocusMetric(models, "gpqa", [], { payload: mix(0.5) });
  assert.equal(compositionOnly.composition.status, "below-bar");
  assert.equal(compositionOnly.provenance.status, "ok");
  assert.equal(compositionOnly.provenance.compositionAgreement, "disagree");

  // Composition ok, provenance below-bar: exactly one flagged → disagree.
  models[2].metrics.gpqa = 0.8;
  models[3].metrics.gpqa = 0.9;
  const provenanceOnly = assessFocusMetric(models, "gpqa", [], { payload: mix(0.9) });
  assert.equal(provenanceOnly.composition.status, "ok");
  assert.equal(provenanceOnly.provenance.status, "below-bar");
  assert.equal(provenanceOnly.provenance.compositionAgreement, "disagree");

  // No payload org mix: the cross-check is unknown, never a silent agree.
  const noMix = assessFocusMetric(models, "gpqa", [], { payload: { trust: null, modality: null, provenance: null } });
  assert.equal(noMix.provenance.compositionAgreement, "unknown");
});

test("the provenance axis never drops a discovered candidate (annotation, not a gate)", async () => {
  const catalog: BenchmarkCatalogEntry[] = [
    { id: "vendor", name: "Vendor Board", description: "coding", categories: ["coding"], modelCount: 300, isCommunity: false, modality: null, updatedAt: null, versionCount: null, latestVersionRowCount: null, starCount: null, datasetId: null, datasetOrgId: "openai", datasetSlug: null },
  ];
  // Every other axis ok; provenance is the only below-bar one.
  const vendorOnly: FocusMetricAssessment = {
    coverage: { covered: 300, total: 400, share: 0.75, fill: 0, status: "ok" },
    dispersion: { value: 0.2, status: "ok" },
    composition: { omittedOrgs: [], status: "ok" },
    freshness: { newestCovered: "2025-06-01", newestPool: "2025-06-01", monthsBehind: 0, status: "ok" },
    trust: { selfReported: 0, covered: 20, status: "ok" },
    modality: { value: null, multimodalShare: null, status: "unknown" },
    maintenance: { updatedAt: null, monthsOld: null, versionCount: null, starCount: null, status: "unknown" },
    provenance: { owner: "openai", dominantOrg: "openai", dominantShare: 0.9, compositionAgreement: "disagree", status: "below-bar" },
    crossSource: { compared: 0, priceAgreement: "unknown", contextAgreement: "unknown", speedAgreement: "unknown", priceDivergence: null, contextDivergence: null, status: "unknown" },
  };
  assert.equal(vendorOnly.provenance.status, "below-bar");
  assert.equal(belowBarReason(vendorOnly), null);
  assert.doesNotMatch(belowBarReason(vendorOnly) ?? "", /provenance/);
  const discovered = await discoverBenchmarks("coding", catalog, async () => ["vendor"], [], 400, async () => vendorOnly);
  assert.deepEqual(discovered.dropped, []);
  assert.equal(discovered.discovered.length, 1);
  assert.equal(discovered.discovered[0].metric, "bench:vendor");
});

test("assessFocusMetric: the cross-source axis compares the zeroeval per-entry values", () => {
  const models = assessmentPool(); // price 1, context 200000, throughput 50
  for (const m of models) m.metrics.gpqa = 0.5;
  const withCross = (crossSource: Record<string, { input: number | null; output: number | null; speed: number | null; context: number | null }> | null) =>
    assessFocusMetric(models, "gpqa", [], { payload: { trust: null, modality: null, provenance: null, crossSource } });

  // A matching price (the 3:1 blend of 1/1 is 1) and context: both ok.
  const match = withCross({ a: { input: 1, output: 1, speed: 50, context: 200000 } });
  assert.equal(match.crossSource.compared, 1);
  assert.equal(match.crossSource.priceAgreement, "ok");
  assert.equal(match.crossSource.contextAgreement, "ok");
  assert.equal(match.crossSource.speedAgreement, "ok");
  assert.equal(match.crossSource.status, "ok");
  assert.equal(match.crossSource.priceDivergence, 0);
  assert.equal(match.crossSource.contextDivergence, 0);

  // A price past the tolerance (blend 4 vs 1 → 0.75) is below-bar; context still ok.
  const priceDiverged = withCross({ a: { input: 4, output: 4, speed: 50, context: 200000 } });
  assert.equal(priceDiverged.crossSource.priceAgreement, "below-bar");
  assert.equal(priceDiverged.crossSource.contextAgreement, "ok");
  assert.equal(priceDiverged.crossSource.status, "below-bar");
  assert.ok(priceDiverged.crossSource.priceDivergence !== null && Math.abs(priceDiverged.crossSource.priceDivergence - 0.75) < 1e-9);

  // A context past the tolerance (100000 vs 200000 → 0.75) is below-bar on its own.
  const ctxDiverged = withCross({ a: { input: 1, output: 1, speed: 50, context: 50000 } });
  assert.equal(ctxDiverged.crossSource.contextAgreement, "below-bar");
  assert.equal(ctxDiverged.crossSource.status, "below-bar");

  // The tolerance boundary: exactly at the tolerance is ok, just past is below-bar.
  // price 1 vs blend 2 → divergence 0.5 (exactly the tolerance).
  assert.equal(withCross({ a: { input: 2, output: 2, speed: null, context: null } }).crossSource.priceAgreement, "ok");
  // price 1 vs blend 2.02 → divergence 0.5049… > 0.5.
  assert.equal(withCross({ a: { input: 2.02, output: 2.02, speed: null, context: null } }).crossSource.priceAgreement, "below-bar");
  assert.equal(PRICE_AGREEMENT_TOLERANCE, 0.5);

  // A model not in the map, or not carrying the metric, does not count.
  const noJoin = withCross({ zzz: { input: 1, output: 1, speed: 50, context: 200000 } });
  assert.equal(noJoin.crossSource.compared, 0);
  assert.equal(noJoin.crossSource.status, "unknown");
  assert.equal(noJoin.crossSource.priceAgreement, "unknown");
  assert.equal(noJoin.crossSource.contextAgreement, "unknown");
  assert.equal(noJoin.crossSource.speedAgreement, "unknown");
  assert.equal(noJoin.crossSource.priceDivergence, null);
  assert.equal(noJoin.crossSource.contextDivergence, null);
  // No cross-source map at all: the whole axis is unknown.
  assert.equal(withCross(null).crossSource.status, "unknown");
  assert.equal(withCross(null).crossSource.compared, 0);

  // speed is informational only: a speed divergence alone never sets below-bar.
  const speedOnly = withCross({ a: { input: 1, output: 1, speed: 500, context: 200000 } });
  assert.equal(speedOnly.crossSource.speedAgreement, "below-bar");
  assert.equal(speedOnly.crossSource.status, "ok");
});

test("the cross-source axis never drops a candidate and never moves a ranking", () => {
  const models = assessmentPool();
  // Distinct values so dispersion/composition/freshness are all ok and the
  // cross-source axis is the only below-bar one.
  models[0].metrics.gpqa = 0.2;
  models[1].metrics.gpqa = 0.5;
  models[2].metrics.gpqa = 0.8;
  models[3].metrics.gpqa = 0.9;
  const def: RoleDef = { description: "d", weights: { general: 0.5, gpqa: 0.3, price: 0.2 }, required: ["general", "price"] };
  const before = rankRole(def, models);
  // A diverging price/context/speed: the axis flags it, yet the ranking is untouched.
  const a = assessFocusMetric(models, "gpqa", [], {
    payload: { trust: null, modality: null, provenance: null, crossSource: { a: { input: 4, output: 4, speed: 500, context: 1000 } } },
  });
  assert.equal(a.crossSource.status, "below-bar");
  assert.equal(belowBarReason(a), null);
  assert.doesNotMatch(belowBarReason(a) ?? "", /cross-source/);
  const after = rankRole(def, models);
  assert.deepEqual(after, before);
});

test("belowBarReason names the trust axis, and the drop/warn split holds for it", async () => {
  // Distinct gpqa values so dispersion/composition/freshness are all ok and the
  // trust axis is the only below-bar one.
  const models = assessmentPool();
  models[0].metrics.gpqa = 0.2;
  models[1].metrics.gpqa = 0.5;
  models[2].metrics.gpqa = 0.8;
  models[3].metrics.gpqa = 0.9;
  const flagged = assessFocusMetric(models, "gpqa", [], { payload: { trust: { selfReported: 19, verified: 0, covered: 20 }, modality: null } });
  assert.equal(flagged.dispersion.status, "ok");
  assert.match(belowBarReason(flagged) ?? "", /trust 19\/20 self-reported is above the 0\.5 bar/);

  // A discovered candidate below-bar on trust alone is dropped with that reason.
  const catalog: BenchmarkCatalogEntry[] = [
    { id: "vendor", name: "Vendor Board", description: "coding", categories: ["coding"], modelCount: 300, isCommunity: false, modality: null, updatedAt: null, versionCount: null, latestVersionRowCount: null, starCount: null, datasetId: null, datasetOrgId: null, datasetSlug: null },
  ];
  const trustBelowBar: FocusMetricAssessment = {
    coverage: { covered: 300, total: 400, share: 0.75, fill: 0, status: "ok" },
    dispersion: { value: 0.2, status: "ok" },
    composition: { omittedOrgs: [], status: "ok" },
    freshness: { newestCovered: "2025-06-01", newestPool: "2025-06-01", monthsBehind: 0, status: "ok" },
    trust: { selfReported: 19, covered: 20, status: "below-bar" },
    modality: { value: null, multimodalShare: null, status: "unknown" },
    maintenance: { updatedAt: null, monthsOld: null, versionCount: null, starCount: null, status: "unknown" },
    provenance: { owner: null, dominantOrg: null, dominantShare: null, compositionAgreement: "unknown", status: "unknown" },
    crossSource: { compared: 0, priceAgreement: "unknown", contextAgreement: "unknown", speedAgreement: "unknown", priceDivergence: null, contextDivergence: null, status: "unknown" },
  };
  const discovered = await discoverBenchmarks("coding", catalog, async () => ["vendor"], [], 400, async () => trustBelowBar);
  assert.deepEqual(discovered.discovered, []);
  assert.equal(discovered.dropped.length, 1);
  assert.match(discovered.dropped[0].reason, /trust 19\/20 self-reported is above the 0\.5 bar/);

  // The same metric named by the user is kept and annotated, never dropped.
  const base = { general: 0.4, code: 0.2, price: 0.2, throughput: 0.2 };
  const applied = applyFocusBenchmarks(base, ["bench:vendor"], {
    total: 400,
    covered: { "bench:vendor": 300 },
    assessments: { "bench:vendor": trustBelowBar },
  });
  assert.deepEqual(applied.added, ["bench:vendor"]);
  assert.equal(applied.assessments["bench:vendor"].trust.status, "below-bar");
  assert.ok(applied.weights["bench:vendor"] !== undefined);
});

test("discoverBenchmarks drops a below-bar candidate with the failed axis in the reason", async () => {
  const catalog: BenchmarkCatalogEntry[] = [
    { id: "saturated", name: "Saturated", description: "coding", categories: ["coding"], modelCount: 300, isCommunity: false, modality: null, updatedAt: null, versionCount: null, latestVersionRowCount: null, starCount: null, datasetId: null, datasetOrgId: null, datasetSlug: null },
  ];
  const belowBar: FocusMetricAssessment = {
    coverage: { covered: 300, total: 400, share: 0.75, fill: 0, status: "ok" },
    dispersion: { value: 0.03, status: "below-bar" },
    composition: { omittedOrgs: [], status: "ok" },
    freshness: { newestCovered: "2025-06-01", newestPool: "2025-06-01", monthsBehind: 0, status: "ok" },
    trust: { selfReported: 0, covered: 20, status: "ok" },
    modality: { value: null, multimodalShare: null, status: "unknown" },
    maintenance: { updatedAt: null, monthsOld: null, versionCount: null, starCount: null, status: "unknown" },
    provenance: { owner: null, dominantOrg: null, dominantShare: null, compositionAgreement: "unknown", status: "unknown" },
    crossSource: { compared: 0, priceAgreement: "unknown", contextAgreement: "unknown", speedAgreement: "unknown", priceDivergence: null, contextDivergence: null, status: "unknown" },
  };
  const result = await discoverBenchmarks("coding", catalog, async () => ["saturated"], [], 400, async () => belowBar);
  assert.deepEqual(result.discovered, []);
  assert.equal(result.dropped.length, 1);
  assert.match(result.dropped[0].reason, /dispersion 0\.030 below the 0\.05 bar/);
});

test("the drop/warn split: a discovered below-bar candidate is dropped, a named one kept and warned", async () => {
  const catalog: BenchmarkCatalogEntry[] = [
    { id: "saturated", name: "Saturated", description: "coding", categories: ["coding"], modelCount: 300, isCommunity: false, modality: null, updatedAt: null, versionCount: null, latestVersionRowCount: null, starCount: null, datasetId: null, datasetOrgId: null, datasetSlug: null },
  ];
  const belowBar: FocusMetricAssessment = {
    coverage: { covered: 300, total: 400, share: 0.75, fill: 0, status: "ok" },
    dispersion: { value: 0.03, status: "below-bar" },
    composition: { omittedOrgs: [], status: "ok" },
    freshness: { newestCovered: "2025-06-01", newestPool: "2025-06-01", monthsBehind: 0, status: "ok" },
    trust: { selfReported: 0, covered: 20, status: "ok" },
    modality: { value: null, multimodalShare: null, status: "unknown" },
    maintenance: { updatedAt: null, monthsOld: null, versionCount: null, starCount: null, status: "unknown" },
    provenance: { owner: null, dominantOrg: null, dominantShare: null, compositionAgreement: "unknown", status: "unknown" },
    crossSource: { compared: 0, priceAgreement: "unknown", contextAgreement: "unknown", speedAgreement: "unknown", priceDivergence: null, contextDivergence: null, status: "unknown" },
  };
  const discovered = await discoverBenchmarks("coding", catalog, async () => ["saturated"], [], 400, async () => belowBar);
  assert.deepEqual(discovered.discovered, []);
  assert.equal(discovered.dropped.length, 1);

  // The same metric named by the user is kept and annotated, never dropped.
  const base = { general: 0.4, code: 0.2, price: 0.2, throughput: 0.2 };
  const applied = applyFocusBenchmarks(base, ["bench:saturated"], {
    total: 400,
    covered: { "bench:saturated": 300 },
    assessments: { "bench:saturated": belowBar },
  });
  assert.deepEqual(applied.added, ["bench:saturated"]);
  assert.equal(applied.assessments["bench:saturated"].dispersion.status, "below-bar");
  assert.ok(applied.weights["bench:saturated"] !== undefined);
});

test("formatCreateAgentReport prints the nine signals and warns per below-bar axis", () => {
  const { lockPath } = workspace();
  const belowBar: FocusMetricAssessment = {
    coverage: { covered: 300, total: 400, share: 0.75, fill: 0, status: "ok" },
    dispersion: { value: 0.03, status: "below-bar" },
    composition: { omittedOrgs: ["Beta"], status: "below-bar" },
    freshness: { newestCovered: "2025-01-01", newestPool: "2025-06-01", monthsBehind: 5, status: "below-bar" },
    trust: { selfReported: 19, covered: 20, status: "below-bar" },
    modality: { value: null, multimodalShare: null, status: "unknown" },
    maintenance: { updatedAt: "2023-01-15T00:00:00Z", monthsOld: 30, versionCount: 4, starCount: 7, status: "below-bar" },
    provenance: { owner: "metr", dominantOrg: "openai", dominantShare: 0.9, compositionAgreement: "agree", status: "below-bar" },
    crossSource: { compared: 3, priceAgreement: "below-bar", contextAgreement: "ok", speedAgreement: "unknown", priceDivergence: 0.8, contextDivergence: 0.1, status: "below-bar" },
  };
  const result = createAgent(request(lockPath, {
    dryRun: true,
    extraBenchmarks: ["gpqa"],
    coverage: { total: 400, covered: { gpqa: 300 }, assessments: { gpqa: belowBar } },
  }));
  assert.ok(result.ok, result.ok ? "" : result.errors.join("; "));
  const report = formatCreateAgentReport(result, "ranking…");
  assert.match(report, /coverage:\s+gpqa 300\/400 \(75\.0%\) ok\s+dispersion 0\.030 below-bar\s+composition omits Beta\s+freshness 5\.0mo below-bar\s+trust 19\/20 below-bar\s+modality unknown\s+maintenance 30\.0mo below-bar\s+provenance metr 90% openai agree\s+cross-source 3 priceΔ80% ctxΔ10% below-bar/);
  assert.match(report, /warning:\s+gpqa dispersion 0\.030 is below the 0\.05 bar/);
  assert.match(report, /warning:\s+gpqa omits Beta/);
  assert.match(report, /warning:\s+gpqa trails the pool by 5\.0 months/);
  assert.match(report, /warning:\s+gpqa trust 19\/20 self-reported is above the 0\.5 bar/);
  assert.match(report, /warning:\s+gpqa dataset last updated 30\.0 months ago/);
  assert.match(report, /warning:\s+gpqa provenance openai dominates 90% of the source's entries/);
  assert.match(report, /warning:\s+gpqa cross-source price\/context diverges from the source's own per-entry values/);
});

test("buildModels carries the row's release_date onto the model record", () => {
  const [model] = buildModels([makeRow({ release_date: "2025-01-02" })]);
  assert.equal(model.releaseDate, "2025-01-02");
  const [missing] = buildModels([makeRow()]);
  assert.equal(missing.releaseDate, null);
});

// ---------------------------------------------------------------------------
// Capability flags (issue #40): `--feature` authors the flag, `--list-features`
// prints the registry.
// ---------------------------------------------------------------------------

test("parseCreateAgentInput --feature sets the request's capability flags", () => {
  const parsed = parseCreateAgentInput('--name reviewer --purpose "review code" --feature costCap');
  assert.ok(parsed.ok, parsed.ok ? "" : parsed.error);
  assert.deepEqual(parsed.request.features, { costCap: true });

  // Repeatable and comma-separated, merged.
  const merged = parseCreateAgentInput('--name reviewer --purpose "review code" --feature cachePricing,costCap --feature endpointCeilings');
  assert.ok(merged.ok, merged.ok ? "" : merged.error);
  assert.deepEqual(merged.request.features, { cachePricing: true, costCap: true, endpointCeilings: true });
});

test("parseCreateAgentInput --feature rejects an unknown id before any write", () => {
  const parsed = parseCreateAgentInput('--name reviewer --purpose "review code" --feature katz');
  assert.equal(parsed.ok, false);
  assert.match(parsed.ok ? "" : parsed.error, /unknown capability "katz"/);
});

test("createAgent authors the flag, not the knobs it expands to", () => {
  const { lockPath } = workspace();
  const parsed = parseCreateAgentInput('--name reviewer --purpose "review code" --feature costCap');
  assert.ok(parsed.ok, parsed.ok ? "" : parsed.error);
  parsed.request.lockPath = lockPath;

  const result = createAgent(parsed.request);
  assert.ok(result.ok, result.ok ? "" : result.errors.join("; "));
  assert.deepEqual(result.def.features, { costCap: true });

  const written: unknown = JSON.parse(readFileSync(lockPath, "utf8"));
  assert.ok(isRecord(written));
  const settingsBag = written.settings as Record<string, unknown>;
  const plugin = settingsBag["omp-llm-role"] as Record<string, unknown>;
  assert.equal(plugin["roles.reviewer.features.costCap"], true);
  assert.equal(plugin["roles.reviewer.filters.maxPriceUsdPerM"], undefined);

  const { settings, errors } = resolveSettings(readPluginSettingsMap({ global: lockPath, project: null }));
  assert.deepEqual(errors, []);
  assert.equal(settings.roles.reviewer.filters?.maxPriceUsdPerM, 10);
});

test("parseCreateAgentInput --list-features needs no name or purpose", () => {
  const parsed = parseCreateAgentInput("--list-features");
  assert.ok(parsed.ok, parsed.ok ? "" : parsed.error);
  assert.equal(parsed.listFeatures, true);
});

test("formatFeatures prints every capability id and the settings it applies", () => {
  const out = formatFeatures();
  for (const id of ["endpointCeilings", "cachePricing", "providerPinning", "costCap"]) {
    assert.ok(out.includes(id), `missing ${id} in:\n${out}`);
  }
  assert.match(out, /endpointCeilings[^\n]*filters\.tools=true, filters\.minOutputTokens=16384/);
  assert.match(out, /cachePricing[^\n]*cacheHitRate=0\.5/);
  assert.match(out, /providerPinning[^\n]*preferOwnProvider=true/);
  assert.match(out, /costCap[^\n]*filters\.maxPriceUsdPerM=10/);
});
