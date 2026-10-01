#!/usr/bin/env node
/**
 * Interactive ranking explorer (CLI shim): boots a loopback-only web UI that
 * shows every eligible model's rank for a role with a full value
 * decomposition, lets you tune that role's weights/required/λ live, and
 * exports the edited roles into the plugin's settings lock file so the next
 * `/refresh-roles` uses them.
 *
 * Inside omp the same server is launched in-process by the plugin's
 * `/explore-roles` command (src/extension.ts) — this shim remains for headless
 * use (`--no-open`, CI, no omp session). Both go through src/explorer/boot.ts,
 * so they cannot drift.
 *
 * All ranking math is the plugin's own (src/engine.ts) — the UI never
 * reimplements it, so the numbers on screen are exactly the plugin's numbers.
 *
 * Usage: node explore.ts [--port N] [--lock PATH] [--refresh] [--no-open]
 */

import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { catalogFromOmpModelsJson, type CatalogEntry } from "./src/availability.ts";
import { loadRankData } from "./src/engine.ts";
import { EXPLORER_DEFAULT_PORT, startExplorer } from "./src/explorer/boot.ts";

const execFileP = promisify(execFile);
const REPO_ROOT = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = join(REPO_ROOT, "web");

type Args = { port: number; lockPath: string | undefined; refresh: boolean; open: boolean };

function parseArgs(argv: string[]): Args {
  let port = EXPLORER_DEFAULT_PORT;
  let lockPath: string | undefined;
  let refresh = false;
  let open = true;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--port") port = Number(argv[++i]);
    else if (a === "--lock") lockPath = argv[++i];
    else if (a === "--refresh") refresh = true;
    else if (a === "--no-open") open = false;
    else {
      console.error(`unknown flag: ${a}`);
      process.exit(1);
    }
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(`invalid --port: ${port}`);
    process.exit(1);
  }
  return { port, lockPath, refresh, open };
}

async function main(): Promise<void> {
  const { port, lockPath, refresh, open } = parseArgs(process.argv.slice(2));

  // The explorer can surface any shipped role (including opt-in ones via
  // `defaults`) and any user-created role, so it loads every role-exclusive
  // source (Design Arena, the writing leaderboard) rather than gating on a
  // fixed role set.
  const rank = await loadRankData({ refresh });

  // The omp catalog gates the thinking price factor per model, matching the
  // plugin's ranking; unavailable omp falls back to the OR flag.
  let catalog: CatalogEntry[] = [];
  try {
    const res = await execFileP("omp", ["models", "ls", "--json"], { maxBuffer: 16 * 1024 * 1024 });
    catalog = catalogFromOmpModelsJson(JSON.parse(res.stdout));
  } catch {
    catalog = [];
  }

  await startExplorer({
    webDir: WEB_DIR,
    lockPath,
    rank,
    catalog,
    reload: (r) => loadRankData({ refresh: r }),
    port,
    open,
    onLog: (line) => console.error(line),
  });
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
