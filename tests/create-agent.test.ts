import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parse as parseYaml } from "yaml";
import { applyExtraBenchmarks, createAgent, formatBenchmarks, type CreateAgentRequest } from "../src/agent-create.ts";
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

test("applyExtraBenchmarks adds new metrics, skips duplicates/unknown, and keeps the invariants", () => {
  const base = { general: 0.4, code: 0.2, price: 0.2, throughput: 0.2 };

  const applied = applyExtraBenchmarks(base, ["writing", "code", "nope"]);
  assert.deepEqual(applied.added, ["writing"]);
  assert.deepEqual(applied.duplicates, ["code"]);
  assert.deepEqual(applied.unknown, ["nope"]);

  const sum = Object.values(applied.weights).reduce((total, weight) => total + weight, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, `weights sum to ${sum}`);
  const nonPrice = Object.entries(applied.weights)
    .filter(([metric]) => metric !== "price")
    .reduce((total, [, weight]) => total + weight, 0);
  assert.ok(Math.abs(nonPrice - (1 - applied.weights.price)) < 1e-9, `non-price sum ${nonPrice}`);
  assert.ok(applied.weights.writing > 0);
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
  assert.deepEqual(applyExtraBenchmarks(base, []).weights, base);
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
});

test("fitArchetype scores by matched keyword length and falls back on no match", () => {
  // "technical debt" (13) beats the generic "code" (4) in the same purpose.
  assert.equal(fitArchetype("pay down technical debt in this legacy code").archetype.id, "refactor");
  const unmatched = fitArchetype("do something entirely unrelated");
  assert.equal(unmatched.archetype.id, "general");
  assert.deepEqual(unmatched.matched, []);
});
