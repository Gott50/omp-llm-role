#!/usr/bin/env node
/**
 * Add or update one model role in the omp-llm-role plugin settings lock file.
 *
 * `omp plugin config set` stores every value as a string, and the plugin's
 * validator rejects a string weight/required/boolean, so role settings must be
 * written as typed JSON. This CLI reuses the plugin's own validated write path
 * (`writeRoleSettings`: resolveSettings validation, mergeExport, backup, atomic
 * mtime-guarded write), so a role created here is exactly what the plugin ranks
 * and what the explorer shows.
 *
 * Usage:
 *   node create-role.ts --name <role> --weights general=0.3,code=0.2,price=0.25,throughput=0.25 \
 *     [--required general,price,throughput] [--thinking auto] [--description "..."] \
 *     [--image] [--lambda 0.01] [--lock PATH] [--dry-run] [--json]
 *
 * Exit codes: 0 written (or dry-run), 1 validation/IO error.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import type { RoleDef, SuffixLevel } from "./src/engine.ts";
import { writeRoleSettings } from "./src/role-settings.ts";

type CreateRoleArgs = {
  name: string;
  weights: Record<string, number>;
  required: string[];
  thinking: SuffixLevel | undefined;
  description: string;
  image: boolean;
  lambda: number | undefined;
  lockPath: string;
  dryRun: boolean;
  json: boolean;
};

const USAGE = [
  "Usage: node create-role.ts --name <role> --weights <metric=w,...> [options]",
  "",
  "  --name <role>          role name ([A-Za-z0-9_-]+, not main/sub)",
  "  --weights <m=w,...>    metric weights; must sum to 1.0 (±0.01)",
  "  --required <m,...>     eligibility gate (default: general,price,throughput)",
  "  --thinking <level>     off|minimal|low|medium|high|xhigh|max|auto",
  "  --description <text>   one-line role description",
  "  --image                require image input (filters.image)",
  "  --lambda <n>           explicit λ override ($ per quality point)",
  "  --lock <path>          settings lock file (default ~/.omp/plugins/omp-plugins.lock.json)",
  "  --dry-run              validate and print without writing",
  "  --json                 print the result as JSON",
].join("\n");

function fail(message: string): never {
  console.error(`create-role: ${message}`);
  process.exit(1);
}

/** Parse `metric=weight` pairs; a malformed pair or a non-positive weight is fatal. */
function parseWeights(spec: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const pair of spec.split(",")) {
    const [metric, raw] = pair.split("=");
    if (!metric || raw === undefined) fail(`--weights: expected metric=weight, got "${pair}"`);
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) fail(`--weights: ${metric} must be a number > 0, got "${raw}"`);
    out[metric] = value;
  }
  return out;
}

function parseList(spec: string): string[] {
  return spec
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function parseArgs(argv: string[]): CreateRoleArgs {
  const args: CreateRoleArgs = {
    name: "",
    weights: {},
    required: ["general", "price", "throughput"],
    thinking: undefined,
    description: "",
    image: false,
    lambda: undefined,
    lockPath: join(homedir(), ".omp", "plugins", "omp-plugins.lock.json"),
    dryRun: false,
    json: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--image") {
      args.image = true;
      continue;
    }
    if (flag === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (flag === "--json") {
      args.json = true;
      continue;
    }
    if (flag === "--help" || flag === "-h") {
      console.log(USAGE);
      process.exit(0);
    }
    const value = argv[++i];
    if (value === undefined) fail(`${flag} requires a value\n\n${USAGE}`);
    if (flag === "--name") args.name = value;
    else if (flag === "--weights") args.weights = parseWeights(value);
    else if (flag === "--required") args.required = parseList(value);
    else if (flag === "--thinking") args.thinking = value as SuffixLevel;
    else if (flag === "--description") args.description = value;
    else if (flag === "--lambda") args.lambda = Number(value);
    else if (flag === "--lock") args.lockPath = value;
    else fail(`unknown flag "${flag}"\n\n${USAGE}`);
  }
  if (!args.name) fail(`--name is required\n\n${USAGE}`);
  if (Object.keys(args.weights).length === 0) fail(`--weights is required\n\n${USAGE}`);
  return args;
}

function buildRoleDef(args: CreateRoleArgs): RoleDef {
  const def: RoleDef = {
    description: args.description,
    weights: args.weights,
    required: args.required,
  };
  if (args.thinking !== undefined) def.thinking = args.thinking;
  if (args.image) def.filters = { image: true };
  if (args.lambda !== undefined) def.lambda = args.lambda;
  return def;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const def = buildRoleDef(args);

  if (args.dryRun) {
    const result = writeRoleSettings(args.lockPath, { [args.name]: def }, { dryRun: true });
    if (!result.ok) fail(result.errors.join("; "));
    if (args.json) console.log(JSON.stringify({ dryRun: true, role: args.name, def }, null, 2));
    else console.log(`create-role: ${args.name} is valid (dry run, nothing written)\n${JSON.stringify(def, null, 2)}`);
    return;
  }

  const result = writeRoleSettings(args.lockPath, { [args.name]: def });
  if (!result.ok) fail(result.errors.join("; "));

  if (args.json) {
    console.log(JSON.stringify({ ok: true, role: args.name, def, backupPath: result.backupPath, lockPath: args.lockPath }, null, 2));
    return;
  }
  console.log(`create-role: wrote roles.${args.name} to ${args.lockPath}`);
  if (result.backupPath) console.log(`  backup: ${result.backupPath}`);
  console.log(`  next: author the agent that pins model: "@${args.name}, @default" — or run /create-agent,`);
  console.log(`        then tune it in the explorer: node explore.ts`);
}

main();
