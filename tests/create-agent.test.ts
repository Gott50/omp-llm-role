import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parse as parseYaml } from "yaml";
import { applyFocusBenchmarks, createAgent, extractBenchmarkLinks, extractBenchmarks, formatBenchmarks, parseCreateAgentInput, type CreateAgentRequest } from "../src/agent-create.ts";
import { isRecord } from "../src/guards.ts";
import { fitArchetype } from "../src/role-archetypes.ts";
import { KNOWN_METRICS, readPluginSettingsMap, resolveSettings } from "../src/settings.ts";

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
