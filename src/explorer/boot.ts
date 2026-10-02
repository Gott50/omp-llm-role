/**
 * Shared in-process launcher for the ranking explorer. Both entry points feed
 * it today's ranking data plus an omp catalog and get back a loopback server:
 *
 *   - `explore.ts` (the `node explore.ts` CLI shim, catalog via `omp models ls`)
 *   - the omp extension's `/explore-roles` command (catalog via the session's
 *     model registry, so no subprocess)
 *
 * All ranking math stays in `src/engine.ts` and the HTTP surface in
 * `server.ts`; this module only owns process-level concerns (bind, port
 * fallback, browser launch, shutdown) so the two hosts cannot drift.
 */

import { execFile } from "node:child_process";
import type { Server } from "node:http";
import { enrichThinkingLevels, type CatalogEntry } from "../availability.ts";
import type { RankData, RoleDef } from "../engine.ts";
import { DEFAULT_ROLES, PLUGIN_SETTINGS_PATH, readPluginSettingsMap, resolveSettings, roleUniverse, type UniverseEntry } from "../settings.ts";
import { createExplorerServer } from "./server.ts";

/** Preferred loopback port; a busy port falls back to an OS-assigned one. */
export const EXPLORER_DEFAULT_PORT = 5177;

export type ExplorerHandle = {
  url: string;
  port: number;
  /** Stop accepting connections and release the port. */
  close(): Promise<void>;
};

export type ExplorerBootOpts = {
  /** Directory holding the SPA (`web/`). */
  webDir: string;
  /** Lock file the explorer reads roles from and exports to (default: the user lock file). */
  lockPath?: string;
  /** Today's ranking data, already fetched. */
  rank: RankData;
  /** omp catalog rows gating the thinking price factor (empty = OR-flag fallback). */
  catalog: CatalogEntry[];
  /** Refetch for `POST /api/refresh`. */
  reload(refresh: boolean): Promise<RankData>;
  port?: number;
  /** Open the URL in the default browser (macOS only). */
  open?: boolean;
  /**
   * Detach the server from the event loop. The omp extension sets this so a
   * short-lived `omp -p` run cannot hang on the server; the CLI must NOT (the
   * listening handle is what keeps `node explore.ts` alive).
   */
  unref?: boolean;
  onLog?(line: string): void;
};

/**
 * Bind `server` and resolve the actual port. The permanent `error` listener is
 * attached before `listen`, so a post-listen socket error is logged instead of
 * becoming an uncaughtException — which would tear down the whole omp session.
 */
function listen(server: Server, port: number, onLog: (line: string) => void): Promise<number> {
  const { promise, resolve, reject } = Promise.withResolvers<number>();
  let settled = false;
  server.on("error", (err: NodeJS.ErrnoException) => {
    if (settled) {
      onLog(`explorer server error: ${err.message}`);
      return;
    }
    settled = true;
    reject(err);
  });
  server.listen(port, "127.0.0.1", () => {
    settled = true;
    const address = server.address();
    resolve(typeof address === "object" && address !== null ? address.port : port);
  });
  return promise;
}

/** Boot the explorer server for one host. Callers own the returned handle and
 * must `close()` it on shutdown (the extension does so in `session_shutdown`). */
export async function startExplorer(opts: ExplorerBootOpts): Promise<ExplorerHandle> {
  const onLog = opts.onLog ?? (() => {});
  const lockPath = opts.lockPath ?? PLUGIN_SETTINGS_PATH;
  let rank = opts.rank;
  enrichThinkingLevels(rank.models, opts.catalog);

  // User-level lock file only: project: null keeps any project-anchor file out
  // of the merge (the explorer edits the user-level file). Re-read on every
  // getState() so a page reload after Export reflects the write: the server
  // outlives the edit, and a boot-time snapshot would keep reporting the old
  // enabled/weights state (the lock file is the source of truth).
  const readRoles = (): { roles: Record<string, RoleDef>; universe: Record<string, UniverseEntry> } => {
    const raw = readPluginSettingsMap({ global: lockPath, project: null });
    const { settings, errors } = resolveSettings(raw);
    for (const e of errors) onLog(`settings warning: ${e}`);
    // The resolved set is what the plugin does today; the universe adds the roles
    // it knows but does not currently rank (shipped opt-ins, lock-file-only roles).
    return { roles: settings.roles, universe: roleUniverse(raw, settings.roles) };
  };

  const server = createExplorerServer({
    webDir: opts.webDir,
    lockPath,
    getState: () => {
      const { roles, universe } = readRoles();
      return { rank, roles, universe, defaults: DEFAULT_ROLES };
    },
    refresh: async () => {
      rank = await opts.reload(true);
      enrichThinkingLevels(rank.models, opts.catalog);
    },
  });
  // Optional detach (extension only): never hold the host process open on the
  // server's account, so a short-lived `omp -p` run cannot hang. The CLI leaves
  // the handle referenced — it is what keeps `node explore.ts` alive.
  if (opts.unref === true && typeof server.unref === "function") server.unref();

  let port: number;
  try {
    port = await listen(server, opts.port ?? EXPLORER_DEFAULT_PORT, onLog);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EADDRINUSE") throw err;
    port = await listen(server, 0, onLog);
  }

  const url = `http://127.0.0.1:${port}`;
  onLog(`explorer: ${url}  (models: ${rank.models.length}, fetched: ${rank.fetchedAt.slice(0, 10)}, lock: ${lockPath})`);
  if (opts.open === true && process.platform === "darwin") execFile("open", [url], () => {});

  return {
    url,
    port,
    close: () =>
      new Promise<void>((resolve) => {
        if (typeof server.closeAllConnections === "function") server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
