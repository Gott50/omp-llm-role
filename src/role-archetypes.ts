/**
 * Purpose -> weight archetypes for `/create-agent` and the `create-agent.ts` CLI.
 *
 * This table is the executable source of truth; the same sets appear as prose in
 * `skills/omp-llm-role-create-agent/SKILL.md`, which an agent reads when it
 * creates an agent by hand. Keep the two in step.
 *
 * Every set satisfies the three invariants the engine and the plugin require:
 *   - Σ(weights) = 1.0 exactly (the validator accepts ±0.01, the math does not);
 *   - Σ(non-price weights) = 1 − w_price exactly, because
 *     `q = Σ (wᵢ/(1−w_price))·tᵢ` silently rescales q against the derived λ otherwise;
 *   - `price` and `throughput` are both weighted AND both in `required`.
 *
 * `thinking` uses only `off`/`auto`/`high`: `off` and `auto` are meta levels the
 * suffix resolver always accepts, so a pin can never silently drop to bare.
 */

import type { SuffixLevel } from "./engine.ts";
import { DEFAULT_ROLES } from "./settings.ts";

export type Archetype = {
  id: string;
  /** Human label used in the generated agent body and the command's report. */
  label: string;
  /** Lowercased substrings matched against the purpose; longer hits score higher. */
  keywords: string[];
  /** Used when the purpose matches no keyword. Exactly one archetype sets this. */
  fallback?: boolean;
  weights: Record<string, number>;
  required: string[];
  thinking: SuffixLevel;
  /** The agent's default `tools:` allowlist (agents-guide.md §4). */
  tools: string[];
  /** Require image input (`filters.image`). */
  image?: boolean;
  /** Bullets for the generated agent body's `<criteria>` section. */
  criteria: string[];
};

export const ARCHETYPES: readonly Archetype[] = [
  {
    id: "general",
    label: "general coding agent",
    fallback: true,
    keywords: ["general", "coding", "code", "engineering", "implement", "develop", "feature", "bug", "fix", "maintain", "debug"],
    // The shipped `default` role's own weights: a generalist specialist IS the default.
    weights: DEFAULT_ROLES.default.weights,
    required: DEFAULT_ROLES.default.required,
    thinking: "auto",
    tools: ["read", "grep", "glob", "find", "write", "edit", "bash", "task"],
    criteria: [
      "Read the surrounding code before changing it; follow the repo's existing patterns rather than introducing a second convention.",
      "Keep the change complete and minimal: migrate every caller, delete what the change obsoletes, add nothing the task did not ask for.",
      "Run the thing you changed and report what you observed, not what you expect.",
    ],
  },
  {
    id: "review",
    label: "code reviewer",
    keywords: ["review", "audit", "critique", "inspect", "security", "vulnerab", "pull request", "merge", "regression hunt"],
    weights: { reasoning: 0.3, general: 0.24, code: 0.2, agents: 0.1, price: 0.1, throughput: 0.06 },
    required: ["general", "price", "throughput"],
    thinking: "high",
    tools: ["read", "grep", "glob", "find"],
    criteria: [
      "Report findings, not a rewrite: each finding names the file, the line, the failure mode, and the fix.",
      "Rank by consequence — correctness and security before style; say when a finding is a nit.",
      "State uncertainty at the claim; a plausible but unverified finding is labelled as unverified.",
    ],
  },
  {
    id: "docs",
    label: "documentation writer",
    keywords: ["doc", "readme", "guide", "tutorial", "explain", "comment", "api reference", "manual", "onboard", "report"],
    weights: { general: 0.34, reasoning: 0.2, code: 0.1, long_context: 0.1, price: 0.16, throughput: 0.1 },
    required: ["general", "price", "throughput"],
    thinking: "auto",
    tools: ["read", "grep", "glob", "find", "write", "edit"],
    criteria: [
      "Write for a reader without your context: define a term on first use, name the file paths, keep examples runnable.",
      "Quote real output verbatim rather than paraphrasing it.",
      "Delete documentation the change makes false; never leave a stale claim standing.",
    ],
  },
  {
    id: "prose",
    label: "prose writer",
    keywords: ["prose", "writing", "write", "blog", "article", "essay", "narrative", "copy", "marketing", "release note", "changelog", "announcement", "newsletter", "email"],
    weights: { general: 0.24, reasoning: 0.16, long_context: 0.1, writing: 0.26, price: 0.14, throughput: 0.1 },
    required: ["general", "price", "throughput"],
    thinking: "auto",
    tools: ["read", "grep", "glob", "find", "write", "edit"],
    criteria: [
      "Lead with the outcome; cut ceremony, hedging, and filler.",
      "Match the register of the surrounding material — read what is already there before adding to it.",
      "Ground every factual claim in the source you were given; mark inference as inference.",
    ],
  },
  {
    id: "data",
    label: "data analyst",
    keywords: ["data", "analy", "sql", "database", "quer", "statistic", "metric", "dashboard", "csv", "dataframe", "etl", "spreadsheet", "chart", "number"],
    weights: { math: 0.28, reasoning: 0.26, general: 0.2, code: 0.1, price: 0.1, throughput: 0.06 },
    required: ["general", "price", "throughput"],
    thinking: "high",
    tools: ["read", "grep", "glob", "find", "write", "edit", "bash"],
    criteria: [
      "State the question, the query, and the result in that order; show the numbers.",
      "Check row counts and units before interpreting — a silent join fan-out or a unit mismatch invalidates the conclusion.",
      "Report the query so it can be re-run, and say what it does not cover.",
    ],
  },
  {
    id: "research",
    label: "researcher",
    keywords: ["research", "search", "investigat", "survey", "literature", "gather", "explore", "compare", "scout", "discover", "source", "find out"],
    weights: { search: 0.28, general: 0.24, reasoning: 0.2, long_context: 0.1, price: 0.1, throughput: 0.08 },
    required: ["general", "price", "throughput"],
    thinking: "auto",
    tools: ["read", "grep", "glob", "find", "web_search"],
    criteria: [
      "Return findings another agent can act on without re-reading the sources: claim, evidence, source.",
      "Prefer primary sources; name the version or date you read.",
      "Say what you could not determine and what you tried.",
    ],
  },
  {
    id: "design",
    label: "design specialist",
    keywords: ["design", "ui", "ux", "visual", "layout", "style", "css", "frontend", "mockup", "wireframe", "screenshot", "image", "logo", "brand", "accessib", "typograph"],
    weights: { vision: 0.3, website: 0.2, general: 0.2, code: 0.1, price: 0.12, throughput: 0.08 },
    required: ["general", "price", "throughput"],
    thinking: "auto",
    tools: ["read", "grep", "glob", "find", "write", "edit"],
    image: true,
    criteria: [
      "Start from the existing design system; do not introduce a second visual convention.",
      "Verify the result in the real surface at the real breakpoints, not in the abstract.",
      "Treat contrast and accessibility as non-negotiable, not as polish.",
    ],
  },
  {
    id: "refactor",
    label: "refactoring specialist",
    keywords: ["refactor", "migration", "migrate", "restructure", "cleanup", "clean up", "moderni", "upgrade", "rewrite", "legacy", "technical debt"],
    weights: { code: 0.3, agents: 0.2, general: 0.2, long_context: 0.1, price: 0.12, throughput: 0.08 },
    required: ["general", "price", "throughput"],
    thinking: "auto",
    tools: ["read", "grep", "glob", "find", "write", "edit", "bash"],
    criteria: [
      "Preserve behaviour: the change is structure, not features — call out any intentional behaviour change explicitly.",
      "Migrate every caller in the same change; leave no shim, alias, or dead branch behind.",
      "Run the project's tests once, at the end, and report the real result.",
    ],
  },
  {
    id: "test",
    label: "test engineer",
    keywords: ["test", "qa", "coverage", "assert", "e2e", "fuzz", "fixture", "flaky"],
    weights: { code: 0.28, agents: 0.2, tool_calling: 0.14, general: 0.18, price: 0.12, throughput: 0.08 },
    required: ["general", "price", "throughput"],
    thinking: "auto",
    tools: ["read", "grep", "glob", "find", "write", "edit", "bash"],
    criteria: [
      "Test behaviour, boundaries, and error paths — never wiring, copies, mock echoes, or source text.",
      "Reproduce the failure before the fix and confirm it after.",
      "Keep tests deterministic and isolated: no shared state, no wall clock, no network.",
    ],
  },
  {
    id: "ops",
    label: "operations engineer",
    keywords: ["ops", "infra", "deploy", "devops", "ci", "cd", "pipeline", "kubernetes", "docker", "terraform", "monitor", "sre", "incident", "shell", "provision"],
    weights: { agents: 0.24, tool_calling: 0.2, general: 0.2, code: 0.14, price: 0.12, throughput: 0.1 },
    required: ["general", "price", "throughput"],
    thinking: "auto",
    tools: ["read", "grep", "glob", "find", "write", "edit", "bash"],
    criteria: [
      "State the blast radius before running anything that changes state.",
      "Prefer the reversible operation; back up before the destructive one.",
      "Report the command you ran and its real output.",
    ],
  },
];

/** The archetype used when a purpose matches no keyword (exactly one sets `fallback`). */
export const FALLBACK_ARCHETYPE: Archetype = ARCHETYPES.find((a) => a.fallback === true) ?? ARCHETYPES[0];

export type ArchetypeMatch = {
  archetype: Archetype;
  /** The keywords that matched, longest first. Empty when the fallback was used. */
  matched: string[];
  /** Σ(matched keyword lengths); 0 when the fallback was used. */
  score: number;
};

/** Purpose words, lowercased and stripped of punctuation. */
function purposeWords(purpose: string): string[] {
  return purpose.toLowerCase().split(/[^a-z0-9_]+/).filter((word) => word !== "");
}

/**
 * True when some word (or consecutive word run) in the purpose starts with the
 * keyword. This is a stem match — "analy" hits "analyze" and "analysis", "vulnerab"
 * hits "vulnerability" — that never fires mid-word: "bug" must NOT hit "debug", and
 * "fix" must not hit "prefix". Multi-word keywords require their leading words to be
 * exact ("release note" hits "release notes", not "release notebook").
 */
function matchesKeyword(words: readonly string[], keyword: string): boolean {
  const parts = keyword.split(" ");
  for (let i = 0; i + parts.length <= words.length; i++) {
    let hit = true;
    for (let j = 0; j < parts.length && hit; j++) {
      hit = j < parts.length - 1 ? words[i + j] === parts[j] : words[i + j].startsWith(parts[j]);
    }
    if (hit) return true;
  }
  return false;
}

/**
 * Pick the archetype whose keywords best fit the purpose. Scoring is the summed
 * length of the matched keywords, so a long specific hit ("technical debt") beats
 * a short generic one ("code"); ties resolve to the earlier table entry.
 */
export function fitArchetype(purpose: string): ArchetypeMatch {
  const words = purposeWords(purpose);
  let best: Archetype | null = null;
  let bestScore = 0;
  let bestMatched: string[] = [];
  for (const archetype of ARCHETYPES) {
    const matched = archetype.keywords.filter((keyword) => matchesKeyword(words, keyword));
    if (matched.length === 0) continue;
    const score = matched.reduce((total, keyword) => total + keyword.length, 0);
    if (score > bestScore) {
      best = archetype;
      bestScore = score;
      bestMatched = matched.sort((a, b) => b.length - a.length);
    }
  }
  if (best === null) return { archetype: FALLBACK_ARCHETYPE, matched: [], score: 0 };
  return { archetype: best, matched: bestMatched, score: bestScore };
}

/** Look up an archetype by id; null when unknown. */
export function archetypeById(id: string): Archetype | null {
  return ARCHETYPES.find((a) => a.id === id) ?? null;
}
