/** Shared fixtures for the omp-llm-role tests: fake models, catalog, deps, temp agent dirs. */

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CatalogEntry, KeyMeta } from "../src/availability.ts";
import type { Model, RankData } from "../src/engine.ts";
import type { Deps } from "../src/updater.ts";

/** Model with uniform quality metrics (general = code = agents = tool = reasoning) so
 * q reduces to the cardinal transform (v+20)/80 of `general` for roles that weight only
 * the uniform index metrics; value = q − λ·price. */
export function makeModel(id: string, general: number, price: number, tput: number): Model {
  return {
    id,
    name: id,
    org: "Org",
    orgId: "org",
    context: 200000,
    multimodal: false,
    price,
    throughput: tput,
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

export function makeCatalog(ids: string[], thinking: string[] = ["high"]): CatalogEntry[] {
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