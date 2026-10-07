import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parse as parseYaml } from "yaml";
import { applyFocusBenchmarks, assessFocusMetric, belowBarReason, countMetricCoverage, createAgent, differentiationWarning, discoverBenchmarks, extractBenchmarkLinks, extractBenchmarks, FOCUS_COVERAGE_FLOOR, FOCUS_DISPERSION_FLOOR, FOCUS_METRIC_CAP, FOCUS_ORG_MIN_SHARE, FOCUS_SELF_REPORTED_MAX_SHARE, FOCUS_STALENESS_MONTHS, focusCoverageOk, formatBenchmarks, formatCreateAgentReport, parseCreateAgentInput, resolveRole, type CreateAgentRequest, type FocusMetricAssessment } from "../src/agent-create.ts";
import type { BenchmarkCatalogEntry } from "../src/benchmark-sources.ts";
import { buildModels, rankRole, type Model, type RoleDef } from "../src/engine.ts";
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
    { id: "aaa-generic", name: "AAA Generic", description: "unrelated", categories: ["misc"], modelCount: 10, isCommunity: false },
    { id: "creative-writing-v3", name: "Creative Writing v3", description: "prose", categories: ["misc"], modelCount: 15, isCommunity: false },
    { id: "tiny-writing", name: "Tiny Writing", description: "writing", categories: ["writing"], modelCount: 1, isCommunity: false },
    { id: "writingbench", name: "WritingBench", description: "", categories: ["writing"], modelCount: 16, isCommunity: false },
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
    { id: "deepswe-1.1", name: "DeepSWE v1.1", description: "coding agentic", categories: ["coding"], modelCount: 40, isCommunity: false },
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
    { id: "swe-bench-verified", name: "SWE-bench Verified", description: "coding", categories: ["coding"], modelCount: 20, isCommunity: false },
    { id: "gpqa", name: "GPQA", description: "coding", categories: ["coding"], modelCount: 300, isCommunity: false },
    { id: "writingbench", name: "WritingBench", description: "coding", categories: ["coding"], modelCount: 4, isCommunity: false },
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
  // Without a loaded pool the four new axes are unknown, never a silent ok.
  assert.equal(applied.assessments.gpqa.dispersion.status, "unknown");
  assert.equal(applied.assessments.gpqa.composition.status, "unknown");
  assert.equal(applied.assessments.gpqa.freshness.status, "unknown");
  assert.equal(applied.assessments.gpqa.trust.status, "unknown");

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
// The five-axis focus-metric assessment (issue #17, trust axis #34)
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

  // A `bench:<id>` absent from the pool: its scores were not loaded, so the new
  // axes are unknown — never a silent ok.
  const unloaded = assessFocusMetric(assessmentPool(), "bench:deepswe-1_1");
  assert.equal(unloaded.coverage.covered, 0);
  assert.equal(unloaded.coverage.status, "unknown");
  assert.equal(unloaded.dispersion.status, "unknown");
  assert.equal(unloaded.composition.status, "unknown");
  assert.equal(unloaded.freshness.status, "unknown");
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
    assessFocusMetric(models, "gpqa", [], { payload: { trust: { selfReported, verified: 0, covered } } });

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
  assert.equal(assessFocusMetric(models, "gpqa", [], { payload: { trust: null } }).trust.status, "unknown");
  // No source info at all: unknown.
  assert.equal(assessFocusMetric(models, "gpqa").trust.status, "unknown");
  // An empty pool: every axis unknown, trust included.
  assert.equal(assessFocusMetric([], "gpqa", [], { payload: { trust: { selfReported: 19, verified: 0, covered: 20 } } }).trust.status, "unknown");
});

test("belowBarReason names the trust axis, and the drop/warn split holds for it", async () => {
  // Distinct gpqa values so dispersion/composition/freshness are all ok and the
  // trust axis is the only below-bar one.
  const models = assessmentPool();
  models[0].metrics.gpqa = 0.2;
  models[1].metrics.gpqa = 0.5;
  models[2].metrics.gpqa = 0.8;
  models[3].metrics.gpqa = 0.9;
  const flagged = assessFocusMetric(models, "gpqa", [], { payload: { trust: { selfReported: 19, verified: 0, covered: 20 } } });
  assert.equal(flagged.dispersion.status, "ok");
  assert.match(belowBarReason(flagged) ?? "", /trust 19\/20 self-reported is above the 0\.5 bar/);

  // A discovered candidate below-bar on trust alone is dropped with that reason.
  const catalog: BenchmarkCatalogEntry[] = [
    { id: "vendor", name: "Vendor Board", description: "coding", categories: ["coding"], modelCount: 300, isCommunity: false },
  ];
  const trustBelowBar: FocusMetricAssessment = {
    coverage: { covered: 300, total: 400, share: 0.75, fill: 0, status: "ok" },
    dispersion: { value: 0.2, status: "ok" },
    composition: { omittedOrgs: [], status: "ok" },
    freshness: { newestCovered: "2025-06-01", newestPool: "2025-06-01", monthsBehind: 0, status: "ok" },
    trust: { selfReported: 19, covered: 20, status: "below-bar" },
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
    { id: "saturated", name: "Saturated", description: "coding", categories: ["coding"], modelCount: 300, isCommunity: false },
  ];
  const belowBar: FocusMetricAssessment = {
    coverage: { covered: 300, total: 400, share: 0.75, fill: 0, status: "ok" },
    dispersion: { value: 0.03, status: "below-bar" },
    composition: { omittedOrgs: [], status: "ok" },
    freshness: { newestCovered: "2025-06-01", newestPool: "2025-06-01", monthsBehind: 0, status: "ok" },
    trust: { selfReported: 0, covered: 20, status: "ok" },
  };
  const result = await discoverBenchmarks("coding", catalog, async () => ["saturated"], [], 400, async () => belowBar);
  assert.deepEqual(result.discovered, []);
  assert.equal(result.dropped.length, 1);
  assert.match(result.dropped[0].reason, /dispersion 0\.030 below the 0\.05 bar/);
});

test("the drop/warn split: a discovered below-bar candidate is dropped, a named one kept and warned", async () => {
  const catalog: BenchmarkCatalogEntry[] = [
    { id: "saturated", name: "Saturated", description: "coding", categories: ["coding"], modelCount: 300, isCommunity: false },
  ];
  const belowBar: FocusMetricAssessment = {
    coverage: { covered: 300, total: 400, share: 0.75, fill: 0, status: "ok" },
    dispersion: { value: 0.03, status: "below-bar" },
    composition: { omittedOrgs: [], status: "ok" },
    freshness: { newestCovered: "2025-06-01", newestPool: "2025-06-01", monthsBehind: 0, status: "ok" },
    trust: { selfReported: 0, covered: 20, status: "ok" },
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

test("formatCreateAgentReport prints the five signals and warns per below-bar axis", () => {
  const { lockPath } = workspace();
  const belowBar: FocusMetricAssessment = {
    coverage: { covered: 300, total: 400, share: 0.75, fill: 0, status: "ok" },
    dispersion: { value: 0.03, status: "below-bar" },
    composition: { omittedOrgs: ["Beta"], status: "below-bar" },
    freshness: { newestCovered: "2025-01-01", newestPool: "2025-06-01", monthsBehind: 5, status: "below-bar" },
    trust: { selfReported: 19, covered: 20, status: "below-bar" },
  };
  const result = createAgent(request(lockPath, {
    dryRun: true,
    extraBenchmarks: ["gpqa"],
    coverage: { total: 400, covered: { gpqa: 300 }, assessments: { gpqa: belowBar } },
  }));
  assert.ok(result.ok, result.ok ? "" : result.errors.join("; "));
  const report = formatCreateAgentReport(result, "ranking…");
  assert.match(report, /coverage:\s+gpqa 300\/400 \(75\.0%\) ok\s+dispersion 0\.030 below-bar\s+composition omits Beta\s+freshness 5\.0mo below-bar\s+trust 19\/20 below-bar/);
  assert.match(report, /warning:\s+gpqa dispersion 0\.030 is below the 0\.05 bar/);
  assert.match(report, /warning:\s+gpqa omits Beta/);
  assert.match(report, /warning:\s+gpqa trails the pool by 5\.0 months/);
  assert.match(report, /warning:\s+gpqa trust 19\/20 self-reported is above the 0\.5 bar/);
});

test("buildModels carries the row's release_date onto the model record", () => {
  const [model] = buildModels([makeRow({ release_date: "2025-01-02" })]);
  assert.equal(model.releaseDate, "2025-01-02");
  const [missing] = buildModels([makeRow()]);
  assert.equal(missing.releaseDate, null);
});
