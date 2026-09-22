#!/usr/bin/env node
/**
 * Headless CLI shim for the omp-llm-role plugin (SPEC §10):
 *   node update-roles.ts [--dry-run] [--json]
 *
 * Always forces a run (explicit invocation is consent — no day gate). Deps come
 * from the omp CLI itself: `omp token openrouter` for the key, `omp models ls
 * --json` for the catalog. --dry-run computes decisions without writing;
 * --json emits the decisions payload only.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { catalogFromOmpModelsJson } from "./src/availability.ts";
import { runUpdater, type Deps } from "./src/updater.ts";

const execFileP = promisify(execFile);

const dryRun = process.argv.includes("--dry-run");
const asJson = process.argv.includes("--json");

const deps: Deps = {
  getToken: async () => {
    const res = await execFileP("omp", ["token", "openrouter"]);
    const token = res.stdout.trim();
    if (token.length === 0) throw new Error("omp token openrouter returned nothing");
    return token;
  },
  getCatalog: async () => {
    const res = await execFileP("omp", ["models", "ls", "--json"], { maxBuffer: 16 * 1024 * 1024 });
    return catalogFromOmpModelsJson(JSON.parse(res.stdout));
  },
  notify: (lines) => {
    if (!asJson) for (const line of lines) console.log(line);
  },
  nowUtcDay: () => new Date().toISOString().slice(0, 10),
};

const result = await runUpdater("cli", deps, { force: true, dryRun });

if (asJson) {
  console.log(
    JSON.stringify({ wrote: result.wrote, aborted: result.aborted ?? null, decisions: result.decisions }, null, 2),
  );
}
process.exit(result.aborted === undefined ? 0 : 1);