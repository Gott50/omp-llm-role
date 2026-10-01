#!/usr/bin/env node
/**
 * Interactive ranking explorer: boots a loopback-only web UI that shows every
 * eligible model's rank for a role with a full value decomposition, lets you
 * tune that role's weights/required/λ live, and exports the edited roles into
 * the plugin's settings lock file so the next `/refresh-roles` uses them.
 *
 * All ranking math is the plugin's own (src/engine.ts) — the UI never
 * reimplements it, so the numbers on screen are exactly the plugin's numbers.
 *
 * Usage: node explore.ts [--port N] [--lock PATH] [--refresh] [--no-open]
 */

import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { loadRankData, type RankData } from "./src/engine.ts";
import { createExplorerServer } from "./src/explorer/server.ts";
import { DEFAULT_ROLES, readPluginSettingsMap, resolveSettings } from "./src/settings.ts";
import { catalogFromOmpModelsJson, enrichThinkingLevels, type CatalogEntry } from "./src/availability.ts";

const execFileP = promisify(execFile);
const REPO_ROOT = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = join(REPO_ROOT, "web");

type Args = { port: number; lockPath: string; refresh: boolean; open: boolean };

function parseArgs(argv: string[]): Args {
  let port = 5177;
  let lockPath = join(homedir(), ".omp", "plugins", "omp-plugins.lock.json");
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
  // `defaults`), so it always loads the full role set — and thus Design Arena.
  let rank: RankData = await loadRankData({ refresh, roles: DEFAULT_ROLES });

  // The omp catalog gates the thinking price factor per model, matching the
  // plugin's ranking; unavailable omp falls back to the OR flag.
  let catalog: CatalogEntry[] = [];
  try {
    const res = await execFileP("omp", ["models", "ls", "--json"], { maxBuffer: 16 * 1024 * 1024 });
    catalog = catalogFromOmpModelsJson(JSON.parse(res.stdout));
  } catch {
    catalog = [];
  }
  enrichThinkingLevels(rank.models, catalog);

  // User-level lock file only: pass project: null so no project-anchor file is
  // merged in (the explorer edits the user-level file).
  const raw = readPluginSettingsMap({ global: lockPath, project: null });
  const { settings, errors } = resolveSettings(raw);
  for (const e of errors) console.error(`settings warning: ${e}`);
  const roles = settings.roles;

  const server = createExplorerServer({
    webDir: WEB_DIR,
    lockPath,
    getSnapshot: () => ({ rank, roles, defaults: DEFAULT_ROLES }),
    refresh: async () => {
      rank = await loadRankData({ refresh: true, roles: DEFAULT_ROLES });
      enrichThinkingLevels(rank.models, catalog);
    },
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") console.error(`port ${port} in use — pass --port N`);
    else console.error(err.message);
    process.exit(1);
  });

  server.listen(port, "127.0.0.1", () => {
    const url = `http://127.0.0.1:${port}`;
    console.error(`explorer: ${url}  (models: ${rank.models.length}, fetched: ${rank.fetchedAt.slice(0, 10)}, lock: ${lockPath})`);
    if (open && process.platform === "darwin") execFileP("open", [url]).catch(() => {});
  });
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
