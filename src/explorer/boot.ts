/**
 * Shared in-process launcher for the ranking explorer. Both entry points feed
 * it today's ranking data, the key-availability overlay, plus an omp catalog
 * and get back a loopback server:
 *
 *   - the omp extension's `/explore-roles` command (catalog via the session's
 *     model registry, so no subprocess)
 *
 * All ranking math stays in `src/engine.ts` and the HTTP surface in
 * `server.ts`; this module only owns process-level concerns (bind, port
 * fallback, browser launch, shutdown) so the two hosts cannot drift.
 */

import { execFile } from "node:child_process";
import type { Server } from "node:http";
import { enrichThinkingLevels, type CatalogEntry, type KeyAvailability } from "../availability.ts";
import type { RankData } from "../engine.ts";
import { DEFAULT_ROLES, PLUGIN_SETTINGS_PATH } from "../settings.ts";
import { agentDir } from "../state.ts";
import { readScopeRoles, resolveScope, resolveScopes, type Scope, type ScopeInputs } from "./scopes.ts";
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
  /** User-level lock file (the user scope's read/export target; default: the plugin lock file). */
  lockPath?: string;
  /** Session cwd; its project joins the scope list when it has a project role config. */
  cwd?: string;
  /** Agent dir holding the project registry (default: `agentDir()`). */
  registryDir?: string;
  /** Today's ranking data, already fetched. */
  rank: RankData;
  /** omp catalog rows gating the thinking price factor (empty = OR-flag fallback). */
  catalog: CatalogEntry[];
  /** Today's key-availability overlay (key-usable vs key-blocked models). */
  availability: KeyAvailability;
  /** Refetch for `POST /api/refresh`. */
  reload(refresh: boolean): Promise<RankData>;
  /** Re-derive the key-availability overlay for `POST /api/refresh` (best-effort). */
  reloadAvailability?: () => Promise<KeyAvailability>;
  port?: number;
  /** Open the URL in the default browser (macOS only). */
  open?: boolean;
  /**
   * Detach the server from the event loop. The omp extension sets this so a
   * short-lived `omp -p` run cannot hang on the server.
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
  const userLockPath = opts.lockPath ?? PLUGIN_SETTINGS_PATH;
  const cwd = opts.cwd ?? process.cwd();
  const scopeInputs: ScopeInputs = { userLockPath, cwd, registryDir: opts.registryDir };
  let rank = opts.rank;
  let availability = opts.availability;
  enrichThinkingLevels(rank.models, opts.catalog);

  // Scope resolution is boot's job: the user-level scope, the registry's
  // projects, and the session's project. Re-resolved on every request so a
  // project registered by another session appears without a restart, and the
  // active scope's roles/universe are re-read from its lock file so a page
  // reload after Export reflects the write (the lock file is the source of
  // truth). A project scope merges the project lock over the user-level lock —
  // the exact read the updater performs.
  const listScopes = (): Scope[] => resolveScopes(scopeInputs);

  const server = createExplorerServer({
    webDir: opts.webDir,
    listScopes,
    resolveScope: (requestedId) => resolveScope(listScopes(), requestedId, cwd),
    getState: (scope) => {
      const { roles, universe, features, errors } = readScopeRoles(scope, userLockPath);
      for (const e of errors) onLog(`settings warning: ${e}`);
      return { rank, roles, universe, defaults: DEFAULT_ROLES, availability, features };
    },
    refresh: async () => {
      rank = await opts.reload(true);
      enrichThinkingLevels(rank.models, opts.catalog);
      if (opts.reloadAvailability) availability = await opts.reloadAvailability();
    },
  });
  // Optional detach (extension only): never hold the host process open on the
  // server's account, so a short-lived `omp -p` run cannot hang.
  if (opts.unref === true && typeof server.unref === "function") server.unref();

  let port: number;
  try {
    port = await listen(server, opts.port ?? EXPLORER_DEFAULT_PORT, onLog);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EADDRINUSE") throw err;
    port = await listen(server, 0, onLog);
  }

  const url = `http://127.0.0.1:${port}`;
  onLog(`explorer: ${url}  (models: ${rank.models.length}, fetched: ${rank.fetchedAt.slice(0, 10)}, scopes: ${listScopes().length}, user lock: ${userLockPath})`);
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
