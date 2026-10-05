/** Shared fixtures for the omp-llm-role tests: fake models, catalog, deps, temp agent dirs. */

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeKeyAvailability, type CatalogEntry, type KeyAvailability, type KeyMeta } from "../src/availability.ts";
import type { LlmStatsRow, Model, RankData } from "../src/engine.ts";
import type { Deps } from "../src/updater.ts";

/** Model with uniform quality metrics (general = code = agents = tool = reasoning) so
 * q reduces to the cardinal transform (v+20)/80 of `general` for roles that weight only
 * the uniform index metrics; value = q − λ·price. */
export function makeModel(id: string, general: number, price: number, tput: number, thinking = false): Model {
  return {
    id,
    name: id,
    org: "Org",
    orgId: "org",
    context: 200000,
    multimodal: false,
    thinking,
    price,
    throughput: tput,
    designElo: null,
    designEloAgents: null,
    writingBench: null,
    metrics: {
      general,
      code: general,
      agents: general,
      tool_calling: general,
      reasoning: general,
      price,
      throughput: tput,
    },
  };
}

/** A full llm-stats leaderboard row with every field null, overridable — the
 * `buildModels` fixture. Keeps the row shape in one place so a new mapped field
 * is added here once. */
export function makeRow(overrides: Partial<LlmStatsRow> = {}): LlmStatsRow {
  return {
    model_id: "m",
    name: "m",
    organization: "Org",
    organization_id: "org",
    context: null,
    release_date: null,
    multimodal: null,
    license: null,
    input_price: null,
    output_price: null,
    throughput: null,
    latency: null,
    index_general: null,
    index_reasoning: null,
    index_math: null,
    index_code: null,
    index_agents: null,
    index_search: null,
    index_vision: null,
    index_tool_calling: null,
    index_long_context: null,
    index_communication: null,
    index_finance: null,
    index_healthcare: null,
    index_legal: null,
    gpqa_score: null,
    aime_2025_score: null,
    swe_bench_verified_score: null,
    arc_agi_v2_score: null,
    mrcr_v2_score: null,
    terminal_bench_score: null,
    tau_bench_retail_score: null,
    simpleqa_score: null,
    hle_score: null,
    mmmu_score: null,
    mmmu_pro_score: null,
    mmmlu_score: null,
    browsecomp_score: null,
    swe_bench_pro_score: null,
    mcp_atlas_score: null,
    apex_agents_score: null,
    osworld_score: null,
    scicode_score: null,
    screenspot_pro_score: null,
    charxiv_r_score: null,
    frontiermath_score: null,
    toolathlon_score: null,
    ...overrides,
  };
}

/** Catalog entries for `ids`. `thinking` defaults to empty (no thinking support) so
 * updater tests exercise bare selectors regardless of the shipped role suffixes;
 * suffix behavior is covered by the tests that pass a level explicitly. */
export function makeCatalog(ids: string[], thinking: string[] = []): CatalogEntry[] {
  return ids.map((id) => ({
    provider: "openrouter",
    id: `org/${id}`,
    selector: `openrouter/org/${id}`,
    name: id,
    contextWindow: 200000,
    maxTokens: 8192,
    reasoning: true,
    thinking,
    input: ["text"],
    cost: null,
  }));
}

export const PAID_KEY_META: KeyMeta = { isFreeTier: false, limitRemaining: 10, freeRemaining: 1000, creditsRemaining: 500 };

/** Keyed-catalog availability fixture: the OpenRouter "Filter the model catalog
 * for API keys" setting is off (keyed == public), so the probe walk stays the
 * sole availability gate. Keeps `fakeDeps` hermetic — without it the updater's
 * `?? fetchKeyAvailability(token)` default would issue live HTTP in every test. */
export const NO_FILTER_AVAILABILITY: KeyAvailability = computeKeyAvailability(["org/a"], ["org/a"]);

/** Temp agent dir with an optional config.yml and preloaded state file. */
export function setupAgentDir(configText: string | null, state?: object): string {
  const dir = mkdtempSync(join(tmpdir(), "llm-role-test-"));
  if (configText !== null) writeFileSync(join(dir, "config.yml"), configText);
  if (state) writeFileSync(join(dir, "llm-role-state.json"), JSON.stringify(state, null, 2));
  return dir;
}

/** Deps with no network and no real filesystem beyond `dir` (via OMP_LLM_ROLE_AGENT_DIR). */
export function fakeDeps(models: Model[], settings: Record<string, unknown> = {}, overrides: Partial<Deps> = {}): Deps {
  const rankData: RankData = {
    models,
    fetchedAt: "2026-09-22T00:00:00.000Z",
    source: "test",
    orMatched: models.length,
    orPriced: models.length,
  };
  return {
    getToken: async () => "sk-or-test",
    getCatalog: async () => makeCatalog(models.map((m) => m.id)),
    getKeyMeta: async () => PAID_KEY_META,
    getKeyAvailability: async () => NO_FILTER_AVAILABILITY,
    probeModel: async () => "ok",
    getRankData: async () => rankData,
    getSettings: async () => settings,
    notify: () => {},
    nowUtcDay: () => "2026-09-22",
    ...overrides,
  };
}

/** Run runUpdater with the agent dir pointed at a temp dir; restores the env afterwards. */
export async function runInTempDir<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const previous = process.env.OMP_LLM_ROLE_AGENT_DIR;
  process.env.OMP_LLM_ROLE_AGENT_DIR = dir;
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.OMP_LLM_ROLE_AGENT_DIR;
    else process.env.OMP_LLM_ROLE_AGENT_DIR = previous;
  }
}