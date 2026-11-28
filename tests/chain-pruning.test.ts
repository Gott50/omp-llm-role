import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { parse as parseYaml } from "yaml";
import { parseConfig } from "../src/config-edit.ts";
import type { Ranked } from "../src/engine.ts";
import { buildChains, type Candidate, type ChainPlan } from "../src/selection.ts";
import { DEFAULT_ROLES, DEFAULT_SETTINGS } from "../src/settings.ts";
import { runUpdater } from "../src/updater.ts";
import { fakeDeps, makeCatalog, makeModel, runInTempDir, setupAgentDir } from "./helpers.ts";

const MODELS = [makeModel("model-a", 90, 1, 100), makeModel("model-b", 80, 5, 60), makeModel("model-c", 70, 10, 30)];

const CONFIG = `modelRoles:
  default: openrouter/org/model-b
retry:
  fallbackChains:
    openrouter/~owner/owner-model-latest:
      - openrouter/org/model-x
    openrouter/org/model-stale:
      - openrouter/org/model-a
    openrouter/org/model-a:
      - openrouter/org/model-b
`;

const STATE = {
  lastRunDay: null,
  managedRoles: [],
  roleLastSelector: {},
  pluginWrittenChainKeys: ["openrouter/org/model-stale", "openrouter/org/model-a"],
  previousModelRoles: null,
};

test("chain maintenance: prune stale plugin keys, preserve owner keys, replace must-write keys in place", async () => {
  const dir = setupAgentDir(CONFIG, STATE);
  const result = await runInTempDir(dir, () => runUpdater("manual", fakeDeps(MODELS), { force: true }));
  assert.equal(result.aborted, undefined);
  assert.equal(result.wrote, true);

  const text = readFileSync(join(dir, "config.yml"), "utf8");
  const parsed = parseConfig(text);
  // default switched to model-a (margin 0.5 > default 0.02)
  assert.equal(parsed.modelRoles.default, "openrouter/org/model-a:off");

  // Stale plugin-written key removed; owner-written unreferenced key preserved;
  // the key the plugin must write exists exactly once (replaced, not duplicated).
  assert.deepEqual(parsed.chainKeys.sort(), ["openrouter/org/model-a", "openrouter/~owner/owner-model-latest"]);
  const keyLineCount = text.split("\n").filter((l) => l.trim() === "openrouter/org/model-a:").length;
  assert.equal(keyLineCount, 1);

  const doc = parseYaml(text) as {
    retry: { fallbackChains: Record<string, string[]> };
  };
  // Refreshed chain for the chosen model: next two tier-eligible candidates, deduped.
  assert.deepEqual(doc.retry.fallbackChains["openrouter/org/model-a"], ["openrouter/org/model-b", "openrouter/org/model-c"]);
  // Owner chain values untouched.
  assert.deepEqual(doc.retry.fallbackChains["openrouter/~owner/owner-model-latest"], ["openrouter/org/model-x"]);

  // State: plugin now owns exactly the referenced key; day stamped; pre-write snapshot kept.
  const state = JSON.parse(readFileSync(join(dir, "llm-role-state.json"), "utf8"));
  assert.deepEqual(state.pluginWrittenChainKeys, ["openrouter/org/model-a"]);
  assert.equal(state.lastRunDay, "2026-09-22");
  assert.deepEqual(state.previousModelRoles, { default: "openrouter/org/model-b" });

  // History: exactly one row for this run.
  const history = readFileSync(join(dir, "llm-role-history.jsonl"), "utf8").trim().split("\n");
  assert.equal(history.length, 1);
  assert.equal(JSON.parse(history[0]).trigger, "manual");
});
test("zero-change run writes nothing and leaves no mtime trace", async () => {
  // Config already matches today's best (model-a, bare selector for the suffix-less role)
  // and already carries the opt-in agent's disabled entry, so the run is a true no-op.
  const config = "modelRoles:\n  default: openrouter/org/model-a:off\ntask:\n  disabledAgents:\n    - \"designer\"\nretry:\n  fallbackChains:\n    openrouter/org/model-a:\n      - openrouter/org/model-b:off\n      - openrouter/org/model-c:off\n";
  const dir = setupAgentDir(config, {
    lastRunDay: null,
    managedRoles: [],
    roleLastSelector: {},
    pluginWrittenChainKeys: ["openrouter/org/model-a"],
    previousModelRoles: null,
  });
  // Restrict the run to the default role (opt the shipped defaults out) so the
  // pre-set config is genuinely a zero-change match.
  const optOut = Object.fromEntries(
    ["smol", "slow", "vision", "plan", "commit", "tiny", "task", "advisor", "designer"].map((r) => [r, { weights: null }]),
  );
  const before = readFileSync(join(dir, "config.yml"), "utf8");
  const result = await runInTempDir(dir, () => runUpdater("manual", fakeDeps(MODELS, { roles: optOut }), { force: true }));
  assert.equal(result.wrote, false);
  assert.equal(result.decisions[0].reason, "kept-eligible");
  assert.equal(readFileSync(join(dir, "config.yml"), "utf8"), before);
  // Day still stamped so the next session-start no-ops.
  const state = JSON.parse(readFileSync(join(dir, "llm-role-state.json"), "utf8"));
  assert.equal(state.lastRunDay, "2026-09-22");
});

test("writeFallbackChains: false leaves chains untouched and prunes nothing", async () => {
  const dir = setupAgentDir(CONFIG, STATE);
  const result = await runInTempDir(dir, () => runUpdater("manual", fakeDeps(MODELS, { writeFallbackChains: false }), { force: true }));
  assert.equal(result.wrote, true);
  const text = readFileSync(join(dir, "config.yml"), "utf8");
  // Role line changed, chains byte-identical (stale key NOT pruned when chains are off).
  assert.ok(text.includes("openrouter/org/model-stale:"));
  assert.ok(text.includes("openrouter/~owner/owner-model-latest:"));
  const state = JSON.parse(readFileSync(join(dir, "llm-role-state.json"), "utf8"));
  assert.deepEqual(state.pluginWrittenChainKeys, ["openrouter/org/model-stale", "openrouter/org/model-a"]);
});

test("a role that left the managed set is pruned from modelRoles", async () => {
  // `designer` was managed last run (state) but ships disabled, so this run must
  // delete its stale pin — otherwise the shipped agent keeps routing to it.
  const config = "modelRoles:\n  default: openrouter/org/model-b\n  designer: openrouter/org/model-c\n";
  const dir = setupAgentDir(config, {
    lastRunDay: null,
    managedRoles: ["default", "designer"],
    roleLastSelector: {},
    pluginWrittenChainKeys: [],
    previousModelRoles: null,
  });
  const result = await runInTempDir(dir, () => runUpdater("manual", fakeDeps(MODELS), { force: true }));
  assert.equal(result.aborted, undefined);
  const parsed = parseConfig(readFileSync(join(dir, "config.yml"), "utf8"));
  assert.equal(parsed.modelRoles.designer, undefined);
  assert.ok(parsed.modelRoles.default !== undefined);
});

test("fallback chain prefers candidates priced at or below the chosen model", async () => {
  // Ranking (value): model-a 0.9107 (chosen), model-b 0.8149, model-c 0.7893.
  // model-c is priced at the chosen model-a's price and model-b is pricier, so
  // the cost-aware ordering puts model-c first even though model-b ranks higher
  // by value. model-c also clears the quality floor (q 1.1893 ≥ 0.9·1.3107) —
  // a cheaper-or-equal candidate below the floor would be dropped instead.
  const models = [makeModel("model-a", 95, 8, 100), makeModel("model-b", 93, 9, 60), makeModel("model-c", 89, 8, 30)];
  const settings = {
    roles: {
      default: { enabled: false },
      smol: { enabled: false },
      slow: { enabled: false },
      vision: { enabled: false },
      plan: { enabled: false },
      commit: { enabled: false },
      tiny: { enabled: false },
      task: { enabled: false },
      advisor: { enabled: false },
      designer: { enabled: false },
      testrole: { weights: { general: 0.5, throughput: 0.1, price: 0.4 }, required: ["general", "price", "throughput"], lambda: 0.05 },
    },
  };
  const config = "modelRoles:\n  testrole: openrouter/org/model-a\n";
  const dir = setupAgentDir(config, {
    lastRunDay: null,
    managedRoles: [],
    roleLastSelector: {},
    pluginWrittenChainKeys: [],
    previousModelRoles: null,
  });
  const result = await runInTempDir(dir, () => runUpdater("manual", fakeDeps(models, settings), { force: true }));
  assert.equal(result.aborted, undefined);
  assert.equal(result.wrote, true);

  const doc = parseYaml(readFileSync(join(dir, "config.yml"), "utf8")) as {
    retry: { fallbackChains: Record<string, string[]> };
  };
  // `testrole` omits `thinking`, so it resolves to the `medium` default and the
  // chain values carry the clamped effective level.
  assert.deepEqual(doc.retry.fallbackChains["openrouter/org/model-a"], ["openrouter/org/model-c:off", "openrouter/org/model-b:off"]);
});
// ---------------------------------------------------------------------------
// Spec #116: the cross-provider chain entries. `openrouter/*` is a chain VALUE,
// not a key, so the prune's key ownership is unchanged. Driven through the
// exported `buildChains` with a hand-built plan, so the assertion is the chain
// the builder writes.
// ---------------------------------------------------------------------------

/** A ranked candidate on `provider` with an offer map. */
function chainCandidate(id: string, provider: string, offers: Record<string, { catalogId: string; price: number | null; thinking: string[] }>): Candidate {
  const model = makeModel(id, 0, 1, 100);
  model.providerOffers = offers;
  const ranked: Ranked = {
    model,
    value: 1,
    q: 1,
    priceEff: 1,
    parts: {},
    provider,
    providerBonus: provider === "openrouter" ? 0 : 0.05,
    priceSource: provider === "openrouter" ? "openrouter" : "reference",
  };
  return { ranked, catalogId: offers[provider]?.catalogId ?? `org/${id}` };
}

function planOf(key: string, candidates: Candidate[], def: Record<string, unknown>, suffix?: string): ChainPlan {
  return { key, suffix, pin: "", pinnedSlug: undefined, candidates, chosenIdx: 0, def: { ...DEFAULT_ROLES.default, ...def }, autoPin: false };
}

test("openrouter/* is a chain value, not a key: the prune set is unchanged", () => {
  const chosen = chainCandidate("model-a", "flocta", { flocta: { catalogId: "org/model-a", price: 1, thinking: [] } });
  const plan = planOf("flocta/org/model-a", [chosen], { providerPriority: ["flocta"] });
  const rowById = new Map(makeCatalog(["model-a"]).map((c) => [c.id, c]));
  const { chainUpserts, chainPrunes } = buildChains({
    plans: [{ role: "default", plan }],
    settings: DEFAULT_SETTINGS,
    rowById,
    keepKeys: [],
    writtenKeys: ["flocta/org/model-a", "openrouter/org/stale"],
    tier: "billed",
  });
  // The wildcard keeps the model id: the OpenRouter catalog id equals the
  // chosen provider's, so the chain stays short.
  assert.deepEqual(chainUpserts["flocta/org/model-a"], ["openrouter/*"]);
  // The wildcard is a value, not a key: only the stale key is pruned.
  assert.deepEqual(chainPrunes, ["openrouter/org/stale"]);
});

test("a differing OpenRouter id is enumerated, not wildcarded", () => {
  const chosen = chainCandidate("model-a", "flocta", { flocta: { catalogId: "org/model-a-1017", price: 1, thinking: [] } });
  const plan = planOf("flocta/org/model-a-1017", [chosen], { providerPriority: ["flocta"] });
  const rowById = new Map(makeCatalog(["model-a"]).map((c) => [c.id, c]));
  const { chainUpserts } = buildChains({ plans: [{ role: "default", plan }], settings: DEFAULT_SETTINGS, rowById, keepKeys: [], writtenKeys: [], tier: "billed" });
  assert.deepEqual(chainUpserts["flocta/org/model-a-1017"], ["openrouter/org/model-a"]);
});

test("the chosen model's other offering providers lead the chain", () => {
  const chosen = chainCandidate("model-a", "openrouter", { flocta: { catalogId: "org/model-a", price: 1, thinking: [] } });
  const plan = planOf("openrouter/org/model-a", [chosen], { providerPriority: ["flocta"] });
  const rowById = new Map(makeCatalog(["model-a"]).map((c) => [c.id, c]));
  const { chainUpserts } = buildChains({ plans: [{ role: "default", plan }], settings: DEFAULT_SETTINGS, rowById, keepKeys: [], writtenKeys: [], tier: "billed" });
  assert.deepEqual(chainUpserts["openrouter/org/model-a"], ["flocta/org/model-a"]);
});

test("a fallback candidate is chained on its effective provider with its own thinking level", () => {
  const chosen = chainCandidate("model-a", "openrouter", {});
  const fallback = chainCandidate("model-b", "flocta", { flocta: { catalogId: "org/model-b", price: 2, thinking: ["high"] } });
  const plan = planOf("openrouter/org/model-a", [chosen, fallback], { providerPriority: ["flocta"], thinking: "high" }, "high");
  const rowById = new Map(makeCatalog(["model-a", "model-b"], ["high"]).map((c) => [c.id, c]));
  const { chainUpserts } = buildChains({ plans: [{ role: "default", plan }], settings: DEFAULT_SETTINGS, rowById, keepKeys: [], writtenKeys: [], tier: "billed" });
  assert.deepEqual(chainUpserts["openrouter/org/model-a"], ["flocta/org/model-b:high"]);
});

test("a single-claim chain carries each target's own effective level", () => {
  // The role pins `high`; the primary's row advertises `high`, the fallback's
  // advertises only `low`, so the fallback value clamps to `low` — never the
  // primary's level.
  const chosen = chainCandidate("model-a", "openrouter", {});
  const fallback = chainCandidate("model-b", "openrouter", {});
  const plan = planOf("openrouter/org/model-a", [chosen, fallback], { thinking: "high" }, "high");
  const rowById = new Map([
    ["org/model-a", { ...makeCatalog(["model-a"], ["high"])[0] }],
    ["org/model-b", { ...makeCatalog(["model-b"], ["low"])[0] }],
  ]);
  const { chainUpserts } = buildChains({ plans: [{ role: "default", plan }], settings: DEFAULT_SETTINGS, rowById, keepKeys: [], writtenKeys: [], tier: "billed" });
  assert.deepEqual(chainUpserts["openrouter/org/model-a"], ["openrouter/org/model-b:low"]);
});
