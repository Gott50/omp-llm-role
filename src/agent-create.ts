/**
 * `/create-agent` core: purpose -> archetype -> validated role -> agent `.md`,
 * in one call. The omp extension command is the only host; the tests drive this
 * module directly.
 *
 * The three writes are ordered so a failure leaves nothing half-made: every check
 * (name, weight math, existing agent file, the plugin's own validator via
 * `writeRoleSettings`) runs before either file is touched.
 *
 * Wiring `modelRoles.<name>` is the caller's job: the extension command runs the
 * updater in-process right after (the same path `/refresh-roles` takes).
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { AGENT_NAME_RE, RESERVED_AGENT_NAMES, isReadOnlyTools, projectAgentsDir, renderAgentFile, userAgentsDir, writeAgentFile } from "./agent-file.ts";
import type { RoleDef, SuffixLevel } from "./engine.ts";
import { METRIC_META } from "./explorer/explain.ts";
import { ARCHETYPES, archetypeById, fitArchetype, type Archetype } from "./role-archetypes.ts";
import { writeRoleSettings } from "./role-settings.ts";
import { KNOWN_METRICS, PLUGIN_SETTINGS_PATH } from "./settings.ts";

/** The architect's output (omp's `/agents` hub contract): the routing rule and
 * the system prompt, plus the identifier omp would use for the file name. */
export type AgentSpec = {
  identifier: string;
  whenToUse: string;
  systemPrompt: string;
};

export type CreateAgentRequest = {
  name: string;
  /** One sentence: what the agent is for. Becomes the routing description. */
  purpose: string;
  /** Force a specific archetype instead of fitting one to the purpose. */
  archetypeId?: string;
  /** Override the archetype's weights entirely (must satisfy both invariants). */
  weights?: Record<string, number>;
  required?: string[];
  thinking?: SuffixLevel;
  tools?: string[];
  scope: "user" | "project";
  image?: boolean;
  /** Override the generated body. */
  body?: string;
  /**
   * omp's architect output. When present, its `whenToUse` becomes the routing
   * description and its `systemPrompt` the body — the template is not used.
   */
  spec?: AgentSpec;
  /**
   * Extra benchmarks to fold into the role's weights (the create flow asks the
   * user for these). Names already in the weights are duplicates; names outside
   * `KNOWN_METRICS` are unknown. Both are reported, not fatal.
   */
  extraBenchmarks?: string[];
  /** Overwrite an existing agent file. */
  force: boolean;
  dryRun: boolean;
  lockPath: string;
  /** Project anchor for `scope: "project"`; defaults to the process cwd. */
  projectAnchor?: string;
};

export type CreateAgentResult =
  | {
      ok: true;
      name: string;
      archetype: Archetype;
      matched: string[];
      def: RoleDef;
      agentPath: string;
      model: string;
      readOnly: boolean;
      backupPath: string | null;
      dryRun: boolean;
      /** How the user-named benchmarks folded into the weights. */
      bench: BenchmarkApplication;
    }
  | { ok: false; errors: string[] };

/** The template body's `<critical>` for a writer; read-only agents restate their
 * contract instead. Used only when no architect spec is supplied. */
const WRITER_CRITICAL =
  "Keep the change scoped to the stated purpose. You NEVER widen it — no extra validation, telemetry, retries, or unrelated refactors — and you NEVER suppress a symptom to make a check pass.";

const READ_ONLY_CRITICAL =
  "You MUST operate as read-only. You NEVER write, edit, or modify files, and you NEVER run a state-changing command. Return findings only.";

/** Fold a free-text purpose into one line safe for a YAML scalar and a prompt. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Base-form verbs that read naturally after "MUST be used to"; anything else
 * takes "MUST be used for" (which also covers gerunds: "for writing …"). */
const PURPOSE_VERBS: Record<string, true> = {
  write: true, review: true, audit: true, analyze: true, analyse: true, refactor: true, test: true, deploy: true,
  research: true, design: true, document: true, generate: true, extract: true, summarize: true, summarise: true,
  translate: true, migrate: true, debug: true, profile: true, scrape: true, monitor: true, draft: true, edit: true,
  explain: true, plan: true, implement: true, build: true, fix: true, convert: true, compare: true, investigate: true,
};

/** The agent's routing description: `MUST be used to/for …` unless the caller
 * already wrote a routing rule. The purpose's own wording is preserved. */
function routingDescription(purpose: string): string {
  const line = oneLine(purpose);
  if (/^(MUST|SHOULD|ALWAYS|NEVER)\b/i.test(line)) return /[.!?]$/.test(line) ? line : `${line}.`;
  const [first = ""] = line.split(" ");
  const routed = `${first.toLowerCase() in PURPOSE_VERBS ? "MUST be used to" : "MUST be used for"} ${line}`;
  return /[.!?]$/.test(routed) ? routed : `${routed}.`;
}

function buildBody(request: CreateAgentRequest, archetype: Archetype, readOnly: boolean): string {
  if (request.body !== undefined && request.body.trim() !== "") return request.body.trim();
  const criteria = archetype.criteria.map((line) => `- ${line}`).join("\n");
  return [
    `Work the ${archetype.label} role: ${oneLine(request.purpose)}.`,
    "",
    "<criteria>",
    criteria,
    "</criteria>",
    "",
    "<critical>",
    readOnly ? READ_ONLY_CRITICAL : WRITER_CRITICAL,
    "</critical>",
  ].join("\n");
}

/**
 * The two weight invariants the engine needs but the plugin's validator only
 * half-enforces (it accepts Σ ∈ [0.99, 1.01]; `rankRole` computes
 * `q = Σ (wᵢ/(1−w_price))·tᵢ`, so any other split silently rescales q against λ).
 */
function checkWeightMath(name: string, weights: Record<string, number>, required: readonly string[]): string[] {
  const errors: string[] = [];
  const metrics = Object.keys(weights);
  if (metrics.length === 0) return [`role ${name}: no weights given`];

  const sum = metrics.reduce((total, metric) => total + weights[metric], 0);
  if (sum > 1.01 || sum < 0.99) errors.push(`role ${name}: weights sum to ${Number(sum.toFixed(4))}, must be 1.0`);

  const price = weights.price;
  if (price === undefined || price <= 0) {
    errors.push(`role ${name}: price must be weighted (the engine's λ is derived from it)`);
  } else {
    const nonPrice = sum - price;
    const expected = 1 - price;
    if (Math.abs(nonPrice - expected) > 1e-9) {
      errors.push(
        `role ${name}: non-price weights sum to ${Number(nonPrice.toFixed(4))}, must be exactly 1 − price = ${Number(expected.toFixed(4))}`,
      );
    }
  }
  if (weights.throughput === undefined || weights.throughput <= 0) {
    errors.push(`role ${name}: throughput must be weighted`);
  }
  for (const gate of ["general", "price", "throughput"]) {
    if (!required.includes(gate)) errors.push(`role ${name}: required must include "${gate}"`);
  }
  return errors;
}

/** The result of folding user-named benchmarks into a role's weights. */
export type BenchmarkApplication = {
  weights: Record<string, number>;
  added: string[];
  duplicates: string[];
  unknown: string[];
};

/**
 * Fold user-named benchmarks into a role's weights. A name already in the
 * weights is a duplicate; a name outside `KNOWN_METRICS` is unknown (the
 * plugin's validator would reject it). Each added metric starts at the mean
 * non-price weight, then every non-price weight is rescaled so
 * Σ(non-price) = 1 − price — the invariant `rankRole` needs and the validator
 * only half-checks. Nothing is added when the list is empty.
 */
export function applyExtraBenchmarks(weights: Record<string, number>, metrics: readonly string[]): BenchmarkApplication {
  const added: string[] = [];
  const duplicates: string[] = [];
  const unknown: string[] = [];
  const next: Record<string, number> = { ...weights };
  const price = next.price ?? 0;
  const nonPriceKeys = Object.keys(next).filter((key) => key !== "price");
  const mean = nonPriceKeys.length > 0 ? nonPriceKeys.reduce((sum, key) => sum + next[key], 0) / nonPriceKeys.length : 0.1;
  for (const raw of metrics) {
    const metric = raw.trim();
    if (metric === "") continue;
    if (metric in next) {
      duplicates.push(metric);
      continue;
    }
    if (!(metric in KNOWN_METRICS)) {
      unknown.push(metric);
      continue;
    }
    next[metric] = mean;
    added.push(metric);
  }
  if (added.length > 0) {
    const keys = Object.keys(next).filter((key) => key !== "price");
    const sum = keys.reduce((total, key) => total + next[key], 0);
    const target = 1 - price;
    // Round to 4 decimals so the written role def stays readable, then absorb the
    // rounding residual in the largest non-price weight so Σ(non-price) = 1 − price
    // still holds exactly (the invariant `rankRole` divides by).
    for (const key of keys) next[key] = Math.round(((next[key] * target) / sum) * 1e4) / 1e4;
    const residual = target - keys.reduce((total, key) => total + next[key], 0);
    if (residual !== 0) {
      const largest = keys.reduce((a, b) => (next[a] >= next[b] ? a : b));
      next[largest] = Math.round((next[largest] + residual) * 1e4) / 1e4;
    }
  }
  return { weights: next, added, duplicates, unknown };
}

/**
 * The weightable benchmarks, for the create flow's "list all benchmarks in use,
 * to avoid duplicates". `weights` marks the ones already in the role.
 */
export function formatBenchmarks(weights?: Record<string, number>): string {
  const lines = ["Benchmarks in use (weightable metrics):"];
  for (const metric of Object.keys(KNOWN_METRICS)) {
    const label = METRIC_META[metric]?.label ?? "";
    const mark = weights?.[metric] !== undefined ? "  <- in this role's weights" : "";
    lines.push(`  ${metric.padEnd(14)} ${label}${mark}`);
  }
  return lines.join("\n");
}

/** Shared empty match list for an explicitly chosen archetype (no keyword hits). */
const EMPTY_MATCHED: string[] = [];

/** Resolve the archetype, then layer the caller's explicit overrides on top. */
function resolveRole(request: CreateAgentRequest): { archetype: Archetype; matched: string[]; def: RoleDef } | { errors: string[] } {
  const match = request.archetypeId === undefined ? fitArchetype(request.purpose) : { archetype: archetypeById(request.archetypeId), matched: EMPTY_MATCHED };
  if (match.archetype === null) {
    return { errors: [`unknown archetype "${request.archetypeId}" — one of ${ARCHETYPES.map((a) => a.id).join(", ")}`] };
  }
  const archetype = match.archetype;
  const weights = request.weights ?? archetype.weights;
  const required = request.required ?? archetype.required;
  const def: RoleDef = { description: oneLine(request.purpose), weights, required };
  const thinking = request.thinking ?? archetype.thinking;
  if (thinking !== undefined) def.thinking = thinking;
  if (request.image === true || (request.image === undefined && archetype.image === true)) def.filters = { image: true };
  return { archetype, matched: match.matched, def };
}

/**
 * Create the role and the agent file for `request`. Nothing is written when any
 * check fails; `dryRun` runs every check and stops before the writes.
 */
export function createAgent(request: CreateAgentRequest): CreateAgentResult {
  const errors: string[] = [];
  const name = request.name.trim();
  if (!AGENT_NAME_RE.test(name)) {
    errors.push(`name "${name}" must match [A-Za-z0-9_-]+`);
  } else if (name.toLowerCase() in RESERVED_AGENT_NAMES) {
    errors.push(`name "${name}" is reserved by omp (main/sub are session sentinels)`);
  }
  if (oneLine(request.purpose) === "") errors.push("purpose is required");

  const resolved = resolveRole(request);
  if ("errors" in resolved) return { ok: false, errors: [...errors, ...resolved.errors] };
  const bench = applyExtraBenchmarks(resolved.def.weights, request.extraBenchmarks ?? []);
  resolved.def.weights = bench.weights;
  errors.push(...checkWeightMath(name, resolved.def.weights, resolved.def.required));

  const tools = request.tools ?? resolved.archetype.tools;
  const readOnly = isReadOnlyTools(tools);
  const agentsDir = request.scope === "project" ? projectAgentsDir(request.projectAnchor ?? process.cwd()) : userAgentsDir();
  const agentPath = join(agentsDir, `${name}.md`);
  const model = `@${name}, @default`;
  // Pre-flight: the role write must not land when the agent file is going to be
  // refused, or a failed run leaves a role with no agent behind it.
  if (existsSync(agentPath) && !request.force) errors.push(`${agentPath} already exists — pass --force to overwrite`);
  if (errors.length > 0) return { ok: false, errors };

  // Validate through the plugin's own resolver before either file is touched.
  const roleWrite = writeRoleSettings(request.lockPath, { [name]: resolved.def }, { dryRun: true });
  if (!roleWrite.ok) return { ok: false, errors: roleWrite.errors };
  if (request.dryRun) {
    return { ok: true, name, archetype: resolved.archetype, matched: resolved.matched, def: resolved.def, agentPath, model, readOnly, backupPath: null, dryRun: true, bench };
  }

  const written = writeRoleSettings(request.lockPath, { [name]: resolved.def });
  if (!written.ok) return { ok: false, errors: written.errors };

  // omp's architect supplies the routing rule and the body; the plugin adds the
  // `model:`/`tools:` frontmatter omp's own writer omits. Without a spec (the
  // CLI, or a caller that skipped the architect) the archetype template is used.
  const description = request.spec?.whenToUse ?? routingDescription(request.purpose);
  const body = request.spec?.systemPrompt ?? buildBody(request, resolved.archetype, readOnly);
  const text = renderAgentFile({ name, description, model, tools, body });
  const agent = writeAgentFile(agentPath, text, request.force);
  if (!agent.ok) {
    return { ok: false, errors: [`roles.${name} was written, but the agent file was not: ${agent.error}`] };
  }

  return { ok: true, name, archetype: resolved.archetype, matched: resolved.matched, def: resolved.def, agentPath, model, readOnly, backupPath: written.backupPath, dryRun: false, bench };
}

/** The ok branch of a create run, for the report formatters. */
export type CreatedAgent = Extract<CreateAgentResult, { ok: true }>;

// ---------------------------------------------------------------------------
// Argument parsing and report formatting, shared by the `/create-agent` omp
// command (which receives the raw text typed after the command name) and the
// tests (which pass argv). One parser, so the two cannot drift.
// ---------------------------------------------------------------------------

export const CREATE_AGENT_USAGE = [
  "Usage: /create-agent --name <name> --purpose <text> [options]",
  "",
  "  --name <name>          agent and role name ([A-Za-z0-9_-]+, not main/sub)",
  "  --purpose <text>       one sentence: what the agent is for (fits the weights)",
  "  --archetype <id>       force a weight archetype instead of fitting the purpose",
  "  --weights <m=w,...>    explicit weights (must sum to 1.0; overrides the archetype)",
  "  --required <m,...>     eligibility gate (default: the archetype's)",
  "  --thinking <level>     off|minimal|low|medium|high|xhigh|max|auto",
  "  --tools <a,b,...>      builtin tool allowlist (default: the archetype's)",
  "  --benchmarks <m,...>   extra benchmarks to fold into the weights (see --list-benchmarks)",
  "  --list-benchmarks      print the weightable benchmarks and exit",
  "  --scope <user|project> where the agent file goes (default: user)",
  "  --image                require image input (filters.image)",
  "  --body <text>          override the generated agent body",
  "  --body-file <path>     read the body from a file",
  "  --force                overwrite an existing agent file",
  "  --lock <path>          settings lock file (default ~/.omp/plugins/omp-plugins.lock.json)",
  "  --dry-run              validate and print without writing",
  "  --json                 print the result as JSON",
  "  --list-archetypes      print the archetype table",
].join("\n");

/** Split a command string into tokens, honoring double and single quotes. */
export function tokenizeArgs(text: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let started = false;
  for (const char of text) {
    if (quote !== null) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      started = true;
      continue;
    }
    if (/\s/.test(char)) {
      if (started) tokens.push(current);
      current = "";
      started = false;
      continue;
    }
    current += char;
    started = true;
  }
  if (started) tokens.push(current);
  return tokens;
}

/** Parse `metric=weight` pairs; a malformed pair or a non-positive weight is fatal. */
function parseWeights(spec: string): string | Record<string, number> {
  const out: Record<string, number> = {};
  for (const pair of spec.split(",")) {
    const [metric, raw] = pair.split("=");
    if (!metric || raw === undefined) return `--weights: expected metric=weight, got "${pair}"`;
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) return `--weights: ${metric} must be a number > 0, got "${raw}"`;
    out[metric] = value;
  }
  return out;
}

function parseList(spec: string): string[] {
  return spec
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

export type ParsedCreateAgentArgs =
  | { ok: true; request: CreateAgentRequest; json: boolean; bodyFile: string | undefined; listArchetypes: boolean; listBenchmarks: boolean; help: boolean }
  | { ok: false; error: string };

/** Parse the flags of `/create-agent` into a request. */
export function parseCreateAgentArgs(argv: string[]): ParsedCreateAgentArgs {
  const request: CreateAgentRequest = {
    name: "",
    purpose: "",
    scope: "user",
    force: false,
    dryRun: false,
    lockPath: PLUGIN_SETTINGS_PATH,
  };
  let json = false;
  let bodyFile: string | undefined;
  let listArchetypes = false;
  let listBenchmarks = false;
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--help" || flag === "-h") {
      help = true;
      continue;
    }
    if (flag === "--list-archetypes") {
      listArchetypes = true;
      continue;
    }
    if (flag === "--list-benchmarks") {
      listBenchmarks = true;
      continue;
    }
    if (flag === "--force") {
      request.force = true;
      continue;
    }
    if (flag === "--dry-run") {
      request.dryRun = true;
      continue;
    }
    if (flag === "--json") {
      json = true;
      continue;
    }
    if (flag === "--image") {
      request.image = true;
      continue;
    }
    const value = argv[++i];
    if (value === undefined) return { ok: false, error: `${flag} requires a value\n\n${CREATE_AGENT_USAGE}` };
    if (flag === "--name") request.name = value;
    else if (flag === "--purpose") request.purpose = value;
    else if (flag === "--archetype") request.archetypeId = value;
    else if (flag === "--weights") {
      const parsed = parseWeights(value);
      if (typeof parsed === "string") return { ok: false, error: parsed };
      request.weights = parsed;
    } else if (flag === "--required") request.required = parseList(value);
    else if (flag === "--thinking") request.thinking = value as SuffixLevel;
    else if (flag === "--tools") request.tools = parseList(value);
    else if (flag === "--benchmarks") request.extraBenchmarks = parseList(value);
    else if (flag === "--scope") {
      if (value !== "user" && value !== "project") return { ok: false, error: `--scope must be user or project, got "${value}"` };
      request.scope = value;
    } else if (flag === "--body") request.body = value;
    else if (flag === "--body-file") bodyFile = value;
    else if (flag === "--lock") request.lockPath = value;
    else return { ok: false, error: `unknown flag "${flag}"\n\n${CREATE_AGENT_USAGE}` };
  }

  if (!help && !listArchetypes && !listBenchmarks) {
    if (request.name === "") return { ok: false, error: `--name is required\n\n${CREATE_AGENT_USAGE}` };
    if (request.purpose === "") return { ok: false, error: `--purpose is required\n\n${CREATE_AGENT_USAGE}` };
  }
  return { ok: true, request, json, bodyFile, listArchetypes, listBenchmarks, help };
}

/** The archetype table, for `--list-archetypes`. */
export function formatArchetypes(): string {
  return ARCHETYPES.map((archetype) => {
    const weights = Object.entries(archetype.weights).map(([metric, weight]) => `${metric}=${weight}`).join(",");
    const image = archetype.image === true ? "  filters.image: true" : "";
    return `${archetype.id.padEnd(10)} ${archetype.label}\n  weights: ${weights}\n  thinking: ${archetype.thinking}${image}`;
  }).join("\n\n");
}

/** The human-readable report for a completed (or dry-run) create. */
export function formatCreateAgentReport(result: CreatedAgent, updaterHint: string): string {
  const weights = Object.entries(result.def.weights).map(([metric, weight]) => `${metric}=${weight}`).join(",");
  const fit = result.matched.length > 0 ? `matched ${result.matched.join(", ")}` : "fallback (no purpose keyword matched)";
  const lines = [
    `create-agent: ${result.dryRun ? "(dry run) " : ""}${result.name}`,
    `  archetype: ${result.archetype.id} (${result.archetype.label}) — ${fit}`,
    `  role:      ${weights}`,
    `             required=${result.def.required.join(",")}  thinking=${result.def.thinking ?? "bare"}${result.def.filters?.image === true ? "  filters.image=true" : ""}`,
    `  agent:     ${result.agentPath}${result.readOnly ? "  (read-only)" : ""}`,
    `             model: ${result.model}`,
  ];
  if (result.bench.added.length > 0) lines.push(`  benchmarks: added ${result.bench.added.join(", ")}`);
  if (result.bench.duplicates.length > 0) lines.push(`  benchmarks: already weighted (skipped) ${result.bench.duplicates.join(", ")}`);
  if (result.bench.unknown.length > 0) lines.push(`  benchmarks: unknown (skipped) ${result.bench.unknown.join(", ")}`);
  if (result.backupPath !== null) lines.push(`  backup:    ${result.backupPath}`);
  if (result.dryRun) lines.push("  nothing written (--dry-run)");
  else lines.push(`  next:      ${updaterHint}`);
  return lines.join("\n");
}

