/**
 * Judge-backed benchmark relevance for `/create-agent` discovery: one `noul`
 * (yes/no probability) question per catalog candidate, batched into a single
 * judgment through omp's configured `judge` role (TypeSafe jev or its fallback
 * chain). Extension-only: it imports `@oh-my-pi/pi-coding-agent`, which only
 * resolves inside omp. The tests inject a stub `decide` into `discoverBenchmarks`
 * instead.
 *
 * The judge is resolved the way `openStandaloneJudge` does, but from the
 * specifiers omp's SDK injection actually resolves: the bare package for
 * `Settings`/`ModelRegistry`/`discoverAuthStorage`/`loadCliExtensionProviders`,
 * and the `./judgment` subpath for `resolveJudge`/`sharedJudgmentCache`. The
 * deeper `./judgment/standalone` path is not resolvable in the installed build
 * (verified: importing it fails the whole extension load).
 *
 * The SDK is imported dynamically, inside the function. Static import cannot
 * work here: the specifier is host-injected and version-dependent (the
 * `./judgment` subpath does not exist in every omp build), and a static import
 * failure is fatal to the whole `extension.ts` load — it would kill every plugin
 * command, not just discovery. Dynamic, a resolution failure degrades to "no
 * discovery" (the caller catches and skips).
 */

import type { BenchmarkCatalogEntry } from "./benchmark-sources.ts";

/** Keep a candidate when the judge's yes-probability is at least this. */
const RELEVANCE_THRESHOLD = 0.5;

/**
 * Ask the configured judge role which catalog benchmarks directly measure the
 * purpose's skill. Returns the selected benchmark ids. The candidate list is
 * already bounded and relevance-ranked by `discoverBenchmarks`. Throws when no
 * judge candidate resolves; the caller degrades to no discovery.
 */
export async function judgeBenchmarkRelevance(
  purpose: string,
  candidates: readonly BenchmarkCatalogEntry[],
  cwd: string,
): Promise<string[]> {
  const bounded = candidates;
  if (bounded.length === 0) return [];
  const { ModelRegistry, Settings, discoverAuthStorage, loadCliExtensionProviders } = await import("@oh-my-pi/pi-coding-agent");
  const { resolveJudge, sharedJudgmentCache } = await import("@oh-my-pi/pi-coding-agent/judgment");
  const settings = await Settings.init({ cwd });
  const authStorage = await discoverAuthStorage(undefined, { settings });
  try {
    const registry = new ModelRegistry(authStorage);
    await registry.refresh();
    await loadCliExtensionProviders(registry, settings, cwd);
    const judge = resolveJudge({
      settings,
      registry,
      sessionId: crypto.randomUUID(),
      purpose: "create-agent benchmark discovery",
      cache: sharedJudgmentCache(),
    });
    const questions: Record<string, { type: "noul"; instructions: string; criteria: { true: string; false: string } }> = {};
    for (const entry of bounded) {
      questions[entry.id] = {
        type: "noul",
        instructions: `Is the benchmark "${entry.name}" a direct measure of the skill this agent purpose describes?`,
        criteria: {
          true: "The benchmark directly measures the purpose's skill (e.g. a writing benchmark for a writing agent).",
          false: "The benchmark measures a different or only tangential skill.",
        },
      };
    }
    const result = await judge.judge({
      state: {
        purpose,
        candidates: bounded.map((entry) => ({ id: entry.id, name: entry.name, description: entry.description, categories: entry.categories })),
      },
      questions,
    });
    const selected: string[] = [];
    for (const entry of bounded) {
      const answer = result.answers[entry.id];
      if (answer !== undefined && answer.type === "noul" && answer.noul >= RELEVANCE_THRESHOLD) selected.push(entry.id);
    }
    return selected;
  } finally {
    authStorage.close();
  }
}
