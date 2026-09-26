/**
 * Zero-dependency HTTP surface for the ranking explorer. Serves the static SPA
 * from `webDir` and a small JSON API over the engine's ranking math:
 *
 *   GET  /                 -> web/index.html
 *   GET  /app.js /style.css -> static assets (traversal-guarded)
 *   GET  /api/bootstrap    -> roles, defaults, metric universe, dataset counts
 *   POST /api/rank         -> { role, def } -> rows with baseline deltas
 *   POST /api/explain      -> { role, def, modelId } -> full decomposition
 *   POST /api/export       -> { roles } -> validated, backed-up lock-file write
 *   POST /api/refresh      -> refetch the dataset, return the bootstrap payload
 *
 * Bound to loopback by the caller (explore.ts); no auth. Every handler is
 * wrapped so a throw becomes a 500 JSON error.
 */

import { copyFileSync, existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, resolve, sep } from "node:path";
import { writeConfigAtomic } from "../config-edit.ts";
import { rankRole, roleLambda, type RankData, type RoleDef } from "../engine.ts";
import { isRecord } from "../guards.ts";
import { KNOWN_METRICS } from "../settings.ts";
import { METRIC_META, explainModel, mergeExport, rankRows, validateRole } from "./explain.ts";

export type ExplorerOpts = {
  webDir: string;
  lockPath: string;
  getSnapshot(): { rank: RankData; roles: Record<string, RoleDef>; defaults: Record<string, RoleDef> };
  /** Re-runs loadRankData({ refresh: true }) and swaps the snapshot. */
  refresh(): Promise<void>;
};

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

const MAX_BODY = 1 << 20; // 1 MiB

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(text);
}

function sendText(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(body);
}

function readBody(req: IncomingMessage): Promise<string> {
  const { promise, resolve, reject } = Promise.withResolvers<string>();
  let size = 0;
  const chunks: Buffer[] = [];
  req.on("data", (c: Buffer) => {
    size += c.length;
    if (size > MAX_BODY) {
      reject(new HttpError(413, "request body too large"));
      req.destroy();
      return;
    }
    chunks.push(c);
  });
  req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  req.on("error", reject);
  return promise;
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const text = await readBody(req);
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "invalid JSON body");
  }
}

function serveStatic(webDir: string, urlPath: string, res: ServerResponse): void {
  const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const root = resolve(webDir);
  const full = resolve(root, rel);
  if (full !== root && !full.startsWith(root + sep)) {
    sendText(res, 403, "forbidden");
    return;
  }
  let data: Buffer;
  try {
    data = readFileSync(full);
  } catch {
    sendText(res, 404, "not found");
    return;
  }
  res.writeHead(200, { "content-type": MIME[extname(full)] ?? "application/octet-stream" });
  res.end(data);
}

function bootstrapPayload(opts: ExplorerOpts): object {
  const snap = opts.getSnapshot();
  return {
    roles: snap.roles,
    defaults: snap.defaults,
    metrics: Object.keys(KNOWN_METRICS),
    metricMeta: METRIC_META,
    fetchedAt: snap.rank.fetchedAt,
    modelCount: snap.rank.models.length,
    orMatched: snap.rank.orMatched,
    orPriced: snap.rank.orPriced,
    lockPath: opts.lockPath,
  };
}

function timestamp(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const hms = `${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}${String(d.getSeconds()).padStart(2, "0")}`;
  return `${ymd}-${hms}`;
}

async function handleRank(req: IncomingMessage, res: ServerResponse, opts: ExplorerOpts): Promise<void> {
  const body = await readJson(req);
  if (!isRecord(body) || typeof body.role !== "string" || !isRecord(body.def)) {
    throw new HttpError(400, "expected { role: string, def: object }");
  }
  const role = body.role;
  const def = body.def as unknown as RoleDef;
  const snap = opts.getSnapshot();
  const baselineDef = snap.roles[role] ?? snap.defaults[role];
  const baseline = baselineDef ? rankRole(baselineDef, snap.rank.models) : [];
  const rows = rankRows(def, snap.rank.models, baseline);
  sendJson(res, 200, {
    eligible: rows.length,
    lambda: roleLambda(def),
    derivedLambda: roleLambda({ ...def, lambda: undefined }),
    rows,
    errors: validateRole(role, def),
  });
}

async function handleExplain(req: IncomingMessage, res: ServerResponse, opts: ExplorerOpts): Promise<void> {
  const body = await readJson(req);
  if (!isRecord(body) || typeof body.role !== "string" || !isRecord(body.def) || typeof body.modelId !== "string") {
    throw new HttpError(400, "expected { role: string, def: object, modelId: string }");
  }
  const def = body.def as unknown as RoleDef;
  const explanation = explainModel(def, opts.getSnapshot().rank.models, body.modelId, body.role);
  sendJson(res, 200, { ...explanation, errors: validateRole(body.role, def) });
}

async function handleExport(req: IncomingMessage, res: ServerResponse, opts: ExplorerOpts): Promise<void> {
  const body = await readJson(req);
  if (!isRecord(body) || !isRecord(body.roles)) throw new HttpError(400, "expected { roles: object }");
  const dirty = body.roles as Record<string, RoleDef>;

  // 1. Validate every dirty role before touching the file.
  const errors: string[] = [];
  for (const [name, def] of Object.entries(dirty)) errors.push(...validateRole(name, def));
  if (errors.length > 0) {
    sendJson(res, 200, { ok: false, errors });
    return;
  }

  // 2. Read the lock file; never clobber an unreadable one.
  let text = "";
  try {
    text = readFileSync(opts.lockPath, "utf8");
  } catch {
    text = "";
  }
  let parsed: unknown = {};
  if (text.trim() !== "") {
    try {
      parsed = JSON.parse(text);
    } catch {
      sendJson(res, 200, { ok: false, error: "lock file is not valid JSON — refusing to overwrite" });
      return;
    }
  }

  // 3. mtime guard (0 when the file is absent).
  let mtimeBefore = 0;
  try {
    mtimeBefore = statSync(opts.lockPath).mtimeMs;
  } catch {
    mtimeBefore = 0;
  }

  // 4. Backup before any write.
  let backupPath: string | null = null;
  if (existsSync(opts.lockPath)) {
    backupPath = `${opts.lockPath}.bak-${timestamp()}`;
    copyFileSync(opts.lockPath, backupPath);
  }

  // 5. Merge dirty roles into the parsed lock.
  const merged = mergeExport(parsed, dirty);
  if ("error" in merged) {
    sendJson(res, 200, { ok: false, error: merged.error });
    return;
  }

  // 6. Atomic, mtime-guarded write.
  const result = writeConfigAtomic(opts.lockPath, JSON.stringify(merged.lock, null, 2) + "\n", mtimeBefore);
  if (result === "conflict") {
    sendJson(res, 200, { ok: false, error: "lock file changed since load — reload the page and re-export" });
    return;
  }

  sendJson(res, 200, { ok: true, backupPath, roles: Object.keys(dirty) });
}

async function handle(req: IncomingMessage, res: ServerResponse, opts: ExplorerOpts): Promise<void> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const path = url.pathname;
  const method = req.method ?? "GET";

  if (path.startsWith("/api/")) {
    if (path === "/api/bootstrap") {
      if (method !== "GET") return sendText(res, 405, "method not allowed");
      return sendJson(res, 200, bootstrapPayload(opts));
    }
    if (path === "/api/rank") {
      if (method !== "POST") return sendText(res, 405, "method not allowed");
      return handleRank(req, res, opts);
    }
    if (path === "/api/explain") {
      if (method !== "POST") return sendText(res, 405, "method not allowed");
      return handleExplain(req, res, opts);
    }
    if (path === "/api/export") {
      if (method !== "POST") return sendText(res, 405, "method not allowed");
      return handleExport(req, res, opts);
    }
    if (path === "/api/refresh") {
      if (method !== "POST") return sendText(res, 405, "method not allowed");
      await opts.refresh();
      return sendJson(res, 200, bootstrapPayload(opts));
    }
    return sendText(res, 404, "not found");
  }

  if (method !== "GET") return sendText(res, 405, "method not allowed");
  return serveStatic(opts.webDir, path, res);
}

export function createExplorerServer(opts: ExplorerOpts): Server {
  return createServer((req, res) => {
    handle(req, res, opts).catch((err: unknown) => {
      if (res.headersSent) {
        res.end();
        return;
      }
      if (err instanceof HttpError) sendJson(res, err.status, { error: err.message });
      else sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
    });
  });
}
