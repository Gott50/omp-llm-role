/**
 * Zero-dependency HTTP surface for the ranking explorer. Serves the static SPA
 * from `webDir` and a small JSON API over the engine's ranking math:
 *
 *   GET  /                 -> web/index.html
 *   GET  /app.js /style.css -> static assets (traversal-guarded)
 *   GET  /api/bootstrap    -> the scope list + the active scope's roles,
 *                             defaults, metric universe, dataset counts, the
 *                             key-availability summary, the scope's global
 *                             capability flags, and the feature registry
 *   POST /api/scope        -> { scope } -> switch the active scope, return the
 *                             new bootstrap payload
 *   POST /api/rank         -> { role, def } -> rows with baseline deltas and a
 *                             per-row `key` badge (usable/blocked/unknown)
 *   POST /api/explain      -> { role, def, modelId } -> full decomposition
 *   POST /api/export       -> { roles } -> validated, backed-up write of the
 *                             active scope's lock file
 *   POST /api/refresh      -> refetch the dataset, return the bootstrap payload
 *
 * Bound to loopback by the caller; no auth. Every handler is
 * wrapped so a throw becomes a 500 JSON error.
 */

import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, resolve, sep } from "node:path";
import type { KeyAvailability } from "../availability.ts";
import { loadDeclaredSources } from "../benchmark-sources.ts";
import { SUFFIX_LEVELS, rankRole, roleLambda, thinkingPriceFactor, type RankData, type RoleDef, type SuffixLevel } from "../engine.ts";
import { expandFeatures, FEATURES } from "../features.ts";
import { isRecord } from "../guards.ts";
import { validateRole, writeRoleSettings } from "../role-settings.ts";
import { KNOWN_METRICS, type UniverseEntry } from "../settings.ts";
import { explainModel, focusAssessments, metricMetaFor, rankRows, weightableMetrics } from "./explain.ts";
import type { Scope } from "./scopes.ts";

export type ExplorerOpts = {
  webDir: string;
  /** All known scopes, re-resolved per call so a project registered by another
   *  session appears without a restart. */
  listScopes(): Scope[];
  /** The scope a request should use: the requested id when known and present,
   *  else the default (session project when present, else user-level). */
  resolveScope(requestedId: string | null): Scope;
  /**
   * Fresh state for one scope: `rank` (swapped by `refresh`) plus
   * `roles`/`universe` re-read from that scope's lock file, so a page reload
   * after Export reflects the write instead of a boot-time snapshot.
   * `availability` is the key-usable/key-blocked overlay derived from the
   * OpenRouter keyed catalog (re-derived on refresh).
   */
  getState(scope: Scope): {
    rank: RankData;
    roles: Record<string, RoleDef>;
    /** Every known role (disabled included) with kind/enabled/locked + effective def. */
    universe: Record<string, UniverseEntry>;
    defaults: Record<string, RoleDef>;
    availability: KeyAvailability;
    /** The scope's GLOBAL capability flags (`features.<id>`); a posted def is
     *  expanded with these before ranking so the preview matches the resolved
     *  baseline. Defaults to `{}` when a host omits it. */
    features: Record<string, boolean>;
  };
  /** Re-runs loadRankData({ refresh: true }) and swaps the snapshot. */
  refresh(): Promise<void>;
};

/** Per-server mutable state: the active scope id (null = the default scope). */
type ExplorerSession = { activeScopeId: string | null };

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

/** Billed-blend multiplier per level, from the engine's own formula so the UI's
 * readout cannot drift from the ranking. */
function thinkingFactors(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const level of Object.keys(SUFFIX_LEVELS) as SuffixLevel[]) out[level] = thinkingPriceFactor(level);
  return out;
}

/** The scope a request should use, persisting the fallback so a scope that
 * became unavailable does not keep re-resolving to the default. */
function activeScope(opts: ExplorerOpts, session: ExplorerSession): Scope {
  const scope = opts.resolveScope(session.activeScopeId);
  session.activeScopeId = scope.id;
  return scope;
}

function bootstrapPayload(opts: ExplorerOpts, scope: Scope): object {
  const state = opts.getState(scope);
  // The metric universe the UI may weight: the shipped keys plus any external
  // metric a resolved role weights, with a derived metadata entry for each.
  const external = new Set<string>();
  for (const def of Object.values(state.roles)) {
    for (const metric of Object.keys(def.weights)) if (!(metric in KNOWN_METRICS)) external.add(metric);
  }
  const metrics = weightableMetrics([...external]);
  const declared = loadDeclaredSources();
  // Five-axis assessment of each role's focus metrics, over the same resolved
  // dataset the updater ranks on (so the explorer and the updater agree).
  const focus = Object.fromEntries(
    Object.entries(state.roles).map(([role, def]) => [role, focusAssessments(state.rank.models, def, declared)]),
  );
  return {
    roles: state.roles,
    defaults: state.defaults,
    universe: state.universe,
    // The scope's global capability flags + the registry, so the SPA renders the
    // Features panel and the recommended bundles without duplicating them.
    features: state.features ?? {},
    featureRegistry: FEATURES.map((f) => ({ id: f.id, label: f.label, description: f.description, buys: f.buys, recommended: f.recommended })),
    metrics,
    metricMeta: metricMetaFor(metrics, declared),
    focusAssessments: focus,
    levels: Object.keys(SUFFIX_LEVELS),
    thinkingFactors: thinkingFactors(),
    fetchedAt: state.rank.fetchedAt,
    modelCount: state.rank.models.length,
    orMatched: state.rank.orMatched,
    orPriced: state.rank.orPriced,
    availability: {
      active: state.availability.active,
      reason: state.availability.reason,
      publicCount: state.availability.publicCount,
      keyedCount: state.availability.keyedCount,
      blockedCount: state.availability.blocked.size,
      fetchedAt: state.availability.fetchedAt,
    },
    lockPath: scope.lockPath,
    scopes: opts.listScopes().map((s) => ({ id: s.id, label: s.label, kind: s.kind, present: s.present })),
    activeScope: scope.id,
  };
}

async function handleScope(req: IncomingMessage, res: ServerResponse, opts: ExplorerOpts, session: ExplorerSession): Promise<void> {
  const body = await readJson(req);
  if (!isRecord(body) || typeof body.scope !== "string") throw new HttpError(400, "expected { scope: string }");
  const scope = opts.listScopes().find((s) => s.id === body.scope);
  if (scope === undefined) throw new HttpError(404, `unknown scope: ${body.scope}`);
  if (!scope.present) throw new HttpError(409, `scope unavailable: ${body.scope}`);
  session.activeScopeId = scope.id;
  sendJson(res, 200, bootstrapPayload(opts, scope));
}

async function handleRank(req: IncomingMessage, res: ServerResponse, opts: ExplorerOpts, session: ExplorerSession): Promise<void> {
  const body = await readJson(req);
  if (!isRecord(body) || typeof body.role !== "string" || !isRecord(body.def)) {
    throw new HttpError(400, "expected { role: string, def: object }");
  }
  const role = body.role;
  const authored = body.def as unknown as RoleDef;
  const state = opts.getState(activeScope(opts, session));
  // The posted def is AUTHORED (flags + explicit keys); expand it with the
  // scope's global flags so the preview matches the resolved baseline
  // (`state.roles[role]`) — otherwise every row's Δ would be a lie.
  const def = expandFeatures(authored, state.features ?? {});
  // Enabled roles baseline against their resolved def; a disabled or lock-file-only
  // role against its effective def (shipped defaults merged with its overrides) so
  // selecting it still shows deltas, not an empty baseline.
  const baselineDef = state.roles[role] ?? state.universe[role]?.def ?? state.defaults[role];
  const baseline = baselineDef ? rankRole(baselineDef, state.rank.models) : [];
  const rows = rankRows(def, state.rank.models, baseline, state.availability);
  sendJson(res, 200, {
    eligible: rows.length,
    lambda: roleLambda(def),
    derivedLambda: roleLambda({ ...def, lambda: undefined }),
    rows,
    // Validate the AUTHORED def: an unknown feature id must surface here, and
    // `expandFeatures` strips `features` (validating the expanded def would hide it).
    errors: validateRole(role, authored),
  });
}

async function handleExplain(req: IncomingMessage, res: ServerResponse, opts: ExplorerOpts, session: ExplorerSession): Promise<void> {
  const body = await readJson(req);
  if (!isRecord(body) || typeof body.role !== "string" || !isRecord(body.def) || typeof body.modelId !== "string") {
    throw new HttpError(400, "expected { role: string, def: object, modelId: string }");
  }
  const authored = body.def as unknown as RoleDef;
  const state = opts.getState(activeScope(opts, session));
  // Same expansion as handleRank: the posted def is authored, the baseline is
  // resolved, so the preview must apply the scope's global flags first.
  const def = expandFeatures(authored, state.features ?? {});
  const explanation = explainModel(def, state.rank.models, body.modelId, body.role, state.availability);
  sendJson(res, 200, { ...explanation, errors: validateRole(body.role, authored) });
}

async function handleExport(req: IncomingMessage, res: ServerResponse, opts: ExplorerOpts, session: ExplorerSession): Promise<void> {
  const body = await readJson(req);
  if (!isRecord(body) || !isRecord(body.roles)) throw new HttpError(400, "expected { roles: object }");
  const scope = activeScope(opts, session);
  const dirty = body.roles as unknown as Record<string, RoleDef>;
  // A manual provider pin must name a route the loaded dataset actually has, or
  // the exported role would be unroutable. Validate before any write; the
  // plugin's own validator (empty/@/:) still runs, so both error sets surface.
  const state = opts.getState(scope);
  const errors: string[] = [];
  for (const [name, def] of Object.entries(dirty)) {
    errors.push(...validateRole(name, def));
    if (def.providerPin === undefined) continue;
    const known = state.rank.models.some((m) => (m.routes ?? []).some((r) => r.providerSlug === def.providerPin));
    if (!known) errors.push(`role "${name}": provider pin "${def.providerPin}" matches no route in the loaded dataset`);
  }
  if (errors.length > 0) return sendJson(res, 200, { ok: false, errors });
  const result = writeRoleSettings(scope.lockPath, dirty);
  if (!result.ok) return sendJson(res, 200, { ok: false, errors: result.errors });
  sendJson(res, 200, { ok: true, backupPath: result.backupPath, roles: result.roles, lockPath: scope.lockPath });
}

async function handle(req: IncomingMessage, res: ServerResponse, opts: ExplorerOpts, session: ExplorerSession): Promise<void> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const path = url.pathname;
  const method = req.method ?? "GET";

  if (path.startsWith("/api/")) {
    if (path === "/api/bootstrap") {
      if (method !== "GET") return sendText(res, 405, "method not allowed");
      return sendJson(res, 200, bootstrapPayload(opts, activeScope(opts, session)));
    }
    if (path === "/api/scope") {
      if (method !== "POST") return sendText(res, 405, "method not allowed");
      return handleScope(req, res, opts, session);
    }
    if (path === "/api/rank") {
      if (method !== "POST") return sendText(res, 405, "method not allowed");
      return handleRank(req, res, opts, session);
    }
    if (path === "/api/explain") {
      if (method !== "POST") return sendText(res, 405, "method not allowed");
      return handleExplain(req, res, opts, session);
    }
    if (path === "/api/export") {
      if (method !== "POST") return sendText(res, 405, "method not allowed");
      return handleExport(req, res, opts, session);
    }
    if (path === "/api/refresh") {
      if (method !== "POST") return sendText(res, 405, "method not allowed");
      await opts.refresh();
      return sendJson(res, 200, bootstrapPayload(opts, activeScope(opts, session)));
    }
    return sendText(res, 404, "not found");
  }

  if (method !== "GET") return sendText(res, 405, "method not allowed");
  return serveStatic(opts.webDir, path, res);
}

export function createExplorerServer(opts: ExplorerOpts): Server {
  const session: ExplorerSession = { activeScopeId: null };
  return createServer((req, res) => {
    handle(req, res, opts, session).catch((err: unknown) => {
      if (res.headersSent) {
        res.end();
        return;
      }
      if (err instanceof HttpError) sendJson(res, err.status, { error: err.message });
      else sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
    });
  });
}
