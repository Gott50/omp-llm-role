#!/usr/bin/env node
/**
 * Create an omp subagent AND its omp-llm-role model role, wired to each other.
 *
 *   node create-agent.ts --name <name> --purpose "<what it is for>" [options]
 *
 * Weights are fitted to the purpose by `src/role-archetypes.ts` unless `--weights`
 * overrides them; the role goes through the plugin's validated write path
 * (`writeRoleSettings`) and the agent `.md` through the plugin's atomic writer, so
 * the result is exactly what the plugin ranks and what omp loads.
 *
 * This is the same code path the `/create-agent` omp command takes — the command
 * additionally runs the updater in-process to write `modelRoles.<name>`. From here,
 * run `node update-roles.ts` afterwards to wire it.
 *
 * Run with `--help` for the flag list, or `--list-archetypes` for the table.
 * Exit codes: 0 created (or dry-run), 1 validation/IO error.
 */

import { readFileSync } from "node:fs";
import { createAgent, CREATE_AGENT_USAGE, formatArchetypes, formatCreateAgentReport, parseCreateAgentArgs } from "./src/agent-create.ts";

function fail(message: string): never {
  console.error(`create-agent: ${message}`);
  process.exit(1);
}

const parsed = parseCreateAgentArgs(process.argv.slice(2));
if (!parsed.ok) fail(parsed.error);

if (parsed.help) {
  console.log(CREATE_AGENT_USAGE);
  process.exit(0);
}
if (parsed.listArchetypes) {
  console.log(formatArchetypes());
  process.exit(0);
}

if (parsed.bodyFile !== undefined) {
  try {
    parsed.request.body = readFileSync(parsed.bodyFile, "utf8");
  } catch (err) {
    fail(`--body-file ${parsed.bodyFile}: ${err instanceof Error ? err.message : err}`);
  }
}

const result = createAgent(parsed.request);
if (!result.ok) fail(result.errors.join("\n"));

if (parsed.json) console.log(JSON.stringify(result, null, 2));
else console.log(formatCreateAgentReport(result, "node update-roles.ts   (writes modelRoles." + result.name + " into config.yml)"));
