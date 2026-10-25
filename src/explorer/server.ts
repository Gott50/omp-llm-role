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
 *   POST /api/pool         -> { mode } -> switch the ranked pool (raw vs
 *                             as-written), return the new bootstrap payload
 *   POST /api/rank         -> { role, def, settings? } -> rows with baseline
 *                             deltas, a per-row `key` badge (usable/blocked/
 *                             unknown), and the display-only per-task price
 *   POST /api/explain      -> { role, def, modelId, settings? } -> full
 *                             decomposition plus the two price-lever readouts
 *   POST /api/preview      -> { settings, roles } -> the SelectionPreview the
 *                             updater would write (read-only, probe-optimistic)
 *   POST /api/export       -> { roles, settings? } -> validated, backed-up write
 *                             of the active scope's lock file
 *   POST /api/refresh      -> refetch the dataset, return the bootstrap payload
 *
 * Bound to loopback by the caller; no auth. Every handler is
 * wrapped so a throw becomes a 500 JSON error.
 */

import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, resolve, sep } from "node:path";
import type { AgentPin } from "../agent-pins.ts";
import { filterCatalog, pruneRoutesToAllowed, type KeyAvailability } from "../availability.ts";
import { loadDeclaredSources } from "../benchmark-sources.ts";
import { barSelection, pinnedRoute, SUFFIX_LEVELS, rankRole, roleLambda, thinkingPriceFactor, type RankData, type Ranked, type RoleDef, type SuffixLevel } from "../engine.ts";
import { expandFeatures, FEATURES } from "../features.ts";
import { isRecord } from "../guards.ts";
import { applyGlobalSettings, validateRole, writeRoleSettings } from "../role-settings.ts";
import { previewSelection } from "../selection.ts";
import { KNOWN_METRICS, resolveSettings, type UniverseEntry } from "../settings.ts";
import { resolveTokenProfile, type TokenProfile, type UsageRow } from "../usage-ledger.ts";
import { explainModel, focusAssessments, metricMetaFor, rankRows, weightableMetrics } from "./explain.ts";
import { leaderFlip, thinkingLevelEffect } from "./levers.ts";
import { asWrittenPool, type PoolInputs, type PoolMode } from "./pool.ts";
import type { Scope, ScopeGlobalSettings, ScopeSelection } from "./scopes.ts";

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
    /** The scope's GLOBAL model-selection rule (`selection` + `qualityFloor`);
     *  a posted def's own `selection`/`qualityFloor` overrides it. */
    selection: ScopeSelection;
    /** The scope's global settings in the three shapes the Settings panel needs
     *  (authored / resolved / defaults). */
    settings: ScopeGlobalSettings;
    /** The scope's merged raw settings map — the updater's own read, and the
     *  base the preview rebuilds its edited map from. */
    raw: Record<string, unknown>;
  };
  /**
   * The preview's scope-side inputs, re-read per call: the scope's own
   * `config.yml` current selectors (the hysteresis incumbent), its plugin state
   * (the managed roles and the chain keys the plugin owns), and the discovered
   * agent pins the `task.disabledAgents` sync reads.
   */
  getPreviewInputs(scope: Scope): {
    currentSelectors: Record<string, string>;
    pluginState: { managedRoles: string[]; pluginWrittenChainKeys: string[]; managedDisabledAgents: string[] };
    agentPins: AgentPin[];
  };
  /** Re-runs loadRankData({ refresh: true }) and swaps the snapshot. */
  refresh(): Promise<void>;
  /**
   * The inputs the `as-written` pool ranks with: the omp catalog, the key's
   * tier, and the account's allowed-providers whitelist (`null` = no whitelist /
   * harvest failed, which leaves every route in place). Re-derived per call, so
   * a project's whitelist can never leak into another scope's view.
   */
  getPoolInputs(): PoolInputs;
  /**
   * The recorded usage rows the per-task price resolves its token profile from,
   * for the request's active scope — a project scope reads its own
   * `<root>/.omp` ledger, so a project's usage never leaks into the user-level
   * view. Optional: a host without a ledger supplies none, and the profile falls
   * back to `tokenProfile` (or stays absent). Re-read per call, so a turn
   * recorded while the explorer is open shows up without a restart.
   */
  getUsageRows?(scope: Scope): readonly UsageRow[];
  /**
   * The user-set token profile — the fallback when a role has no recorded usage
   * (the `tokenProfile` setting). `null` (the default) = unset.
   */
  tokenProfile?: TokenProfile | null;
};

/** Per-server mutable state: the active scope id (null = the default scope) and
 * the ranked pool. Both are session state, so a scope switch and a refresh keep
 * them (the pool inputs themselves are re-derived per call). */
type ExplorerSession = { activeScopeId: string | null; poolMode: PoolMode };

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

/** The dataset the session's pool mode ranks: the raw fetch, or the
 * gated+pruned pool the updater writes from. Applied before ranking, never to
 * the export path (which validates a pin against the raw dataset). */
function poolRank(opts: ExplorerOpts, session: ExplorerSession, rank: RankData): RankData {
  return session.poolMode === "as-written" ? asWrittenPool(rank, opts.getPoolInputs()) : rank;
}

/** The global `features.<id>` flags an edited settings record carries: a flag is
 * on only when the record says `true` (the lock-file convention). An absent
 * record means the caller posted no edit, so the scope's committed flags apply. */
function editedFeatures(settings: Record<string, unknown> | undefined, committed: Record<string, boolean>): Record<string, boolean> {
  if (settings === undefined) return committed;
  const out: Record<string, boolean> = {};
  for (const feature of FEATURES) out[feature.id] = settings[`features.${feature.id}`] === true;
  return out;
}

/** The raw settings map a preview resolves: the scope's own map with every
 * global key replaced by the edited set and `roles` replaced by the edited defs,
 * so `roleUniverse` sees the edited `enabled` flags. The global half is the SAME
 * delete-then-write Export performs (`applyGlobalSettings`), so the preview
 * cannot resolve a global Export would not write. An ABSENT edited set means the
 * caller posted no edit, so the scope's committed globals stay in place (the
 * pre-#109 behaviour, and the contract `/api/rank`/`/api/explain`/`/api/export`
 * honour). The flat `roles.<name>.*` keys the lock file carries are dropped too —
 * otherwise a stale authored value would survive for any path the edited def
 * does not cover. */
function previewRaw(scopeRaw: Record<string, unknown>, editedSettings: Record<string, unknown> | undefined, editedRoles: Record<string, RoleDef>): Record<string, unknown> {
  const raw: Record<string, unknown> = { ...scopeRaw };
  if (editedSettings !== undefined) applyGlobalSettings(raw, editedSettings);
  for (const key of Object.keys(raw)) if (key === "roles" || key.startsWith("roles.")) delete raw[key];
  raw.roles = editedRoles;
  return raw;
}

/** The dataset the preview ranks: the raw fetch with the allowed-providers
 * whitelist pruned from each model's routes — the updater's own pre-walk dataset
 * (`pruneRoutesToAllowed`, `src/updater.ts:310-316`). The catalog/tier gate and
 * the keyed-catalog prune are applied INSIDE `previewSelection` (via `eligible`
 * and `availability`), so they must not be pre-applied here: pre-applying the
 * keyed prune would make `keyBlockedCount` always 0 and the "no usable
 * candidate" skip unreachable, and pre-applying the gate would undercount
 * `endpointBlocked`/`pinBlocked` (both iterate `rank.models`). */
function previewRank(rank: RankData, allowed: ReadonlySet<string> | null): RankData {
  return { ...rank, models: pruneRoutesToAllowed(rank.models, allowed).models };
}

function bootstrapPayload(opts: ExplorerOpts, session: ExplorerSession, scope: Scope): object {
  const state = opts.getState(scope);
  // Every count and assessment below describes the pool the user is looking at,
  // so the header's model count matches the table's rows.
  const rank = poolRank(opts, session, state.rank);
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
    Object.entries(state.roles).map(([role, def]) => [role, focusAssessments(rank.models, def, declared)]),
  );
  return {
    roles: state.roles,
    defaults: state.defaults,
    universe: state.universe,
    // The scope's global capability flags + the registry, so the SPA renders the
    // Features panel and the recommended bundles without duplicating them.
    features: state.features ?? {},
    // The scope's global settings in the three shapes the Settings panel needs:
    // what the lock file authors, what that resolves to, and the shipped
    // defaults to reset to.
    settings: state.settings,
    featureRegistry: FEATURES.map((f) => ({ id: f.id, label: f.label, description: f.description, buys: f.buys, recommended: f.recommended })),
    // The scope's global model-selection rule; a role's own `selection`/
    // `qualityFloor` overrides it, and the rank payload reports the effective one.
    selection: state.selection,
    metrics,
    metricMeta: metricMetaFor(metrics, declared),
    focusAssessments: focus,
    levels: Object.keys(SUFFIX_LEVELS),
    thinkingFactors: thinkingFactors(),
    fetchedAt: rank.fetchedAt,
    modelCount: rank.models.length,
    orMatched: rank.orMatched,
    orPriced: rank.orPriced,
    // The ranked pool the counts above describe; the SPA's header toggle reads it.
    poolMode: session.poolMode,
    // The user-set token profile the per-task column falls back to (null = unset).
    tokenProfile: opts.tokenProfile ?? null,
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
  sendJson(res, 200, bootstrapPayload(opts, session, scope));
}

async function handlePool(req: IncomingMessage, res: ServerResponse, opts: ExplorerOpts, session: ExplorerSession): Promise<void> {
  const body = await readJson(req);
  if (!isRecord(body) || (body.mode !== "raw" && body.mode !== "as-written")) {
    throw new HttpError(400, 'expected { mode: "raw" | "as-written" }');
  }
  session.poolMode = body.mode;
  sendJson(res, 200, bootstrapPayload(opts, session, activeScope(opts, session)));
}

async function handleRank(req: IncomingMessage, res: ServerResponse, opts: ExplorerOpts, session: ExplorerSession): Promise<void> {
  const body = await readJson(req);
  if (!isRecord(body) || typeof body.role !== "string" || !isRecord(body.def)) {
    throw new HttpError(400, "expected { role: string, def: object }");
  }
  const role = body.role;
  const authored = body.def as unknown as RoleDef;
  const edited = body.settings;
  if (edited !== undefined && !isRecord(edited)) throw new HttpError(400, "expected { role: string, def: object, settings?: object }");
  const scope = activeScope(opts, session);
  const state = opts.getState(scope);
  const rank = poolRank(opts, session, state.rank);
  // The posted def is AUTHORED (flags + explicit keys); expand it with the
  // scope's global flags so the preview matches the resolved baseline
  // (`state.roles[role]`) — otherwise every row's Δ would be a lie. An edited
  // global-flags record re-expands with the edited `features.<id>` set, so the
  // table re-ranks before the write lands.
  const def = expandFeatures(authored, editedFeatures(edited, state.features ?? {}));
  // Enabled roles baseline against their resolved def; a disabled or lock-file-only
  // role against its effective def (shipped defaults merged with its overrides) so
  // selecting it still shows deltas, not an empty baseline.
  const baselineDef = state.roles[role] ?? state.universe[role]?.def ?? state.defaults[role];
  const baseline = baselineDef ? rankRole(baselineDef, rank.models) : [];
  // The EFFECTIVE selection rule: the posted def's own `selection`/`qualityFloor`
  // wins over the scope's global. `cheapest` computes the bar over the same
  // ranking the rows show; `value` has no bar and marks the value leader, so the
  // SPA always has a pick to mark. An empty pool has neither.
  const ranked = rankRole(def, rank.models);
  const mode = def.selection ?? state.selection.mode;
  const floor = def.qualityFloor ?? state.selection.qualityFloor;
  const bar = mode === "cheapest" ? barSelection(ranked, floor) : null;
  const pick = bar?.pick ?? ranked[0];
  // The anchor is the highest-`q` candidate — the same definition `barSelection`
  // uses. In `value` mode there is no bar, so report the max-`q` model rather
  // than the value leader: the anchor is a quality statement, not a price one.
  const anchor = bar?.anchor ?? ranked.reduce<Ranked | undefined>((best, r) => (best === undefined || r.q > best.q ? r : best), undefined);
  const rows = rankRows(def, rank.models, baseline, state.availability, resolveTokenProfile(role, opts.getUsageRows?.(scope) ?? [], opts.tokenProfile ?? null), bar);
  sendJson(res, 200, {
    eligible: rows.length,
    lambda: roleLambda(def),
    derivedLambda: roleLambda({ ...def, lambda: undefined }),
    selection: {
      mode,
      pick: pick?.model.id ?? "",
      anchor: anchor?.model.id ?? "",
      anchorQ: anchor?.q ?? 0,
      floor,
      bar: bar?.bar ?? null,
    },
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
  const edited = body.settings;
  if (edited !== undefined && !isRecord(edited)) throw new HttpError(400, "expected { role: string, def: object, modelId: string, settings?: object }");
  const scope = activeScope(opts, session);
  const state = opts.getState(scope);
  const rank = poolRank(opts, session, state.rank);
  // Same expansion as handleRank: the posted def is authored, the baseline is
  // resolved, so the preview must apply the scope's global flags first — the
  // edited ones when the caller posted them.
  const def = expandFeatures(authored, editedFeatures(edited, state.features ?? {}));
  const explanation = explainModel(def, rank.models, body.modelId, body.role, state.availability, resolveTokenProfile(body.role, opts.getUsageRows?.(scope) ?? [], opts.tokenProfile ?? null));
  // The two price-lever readouts are role-level, so they ride beside the
  // per-model decomposition — computed on the active pool, so the readout and
  // the ranking above it agree.
  sendJson(res, 200, {
    ...explanation,
    leaderFlip: leaderFlip(def, rank.models),
    thinkingLevels: thinkingLevelEffect(def, rank.models),
    errors: validateRole(body.role, authored),
  });
}

async function handlePreview(req: IncomingMessage, res: ServerResponse, opts: ExplorerOpts, session: ExplorerSession): Promise<void> {
  const body = await readJson(req);
  if (!isRecord(body) || !isRecord(body.roles)) throw new HttpError(400, "expected { settings: object, roles: object }");
  const editedSettings = body.settings;
  if (editedSettings !== undefined && !isRecord(editedSettings)) throw new HttpError(400, "expected { settings: object, roles: object }");
  const scope = activeScope(opts, session);
  const state = opts.getState(scope);
  const editedRoles = body.roles as unknown as Record<string, RoleDef>;
  // The preview's dataset is the updater's own pre-walk set, regardless of the
  // table's pool toggle (user story 33): the raw fetch with the
  // allowed-providers prune, never `poolRank` (which respects the toggle) and
  // never `asWrittenPool` (which would pre-apply the keyed prune the candidate
  // set must apply itself).
  const pool = opts.getPoolInputs();
  const raw = previewRaw(state.raw, editedSettings, editedRoles);
  const { settings, errors } = resolveSettings(raw);
  const inputs = opts.getPreviewInputs(scope);
  const preview = previewSelection({
    settings,
    rank: previewRank(state.rank, pool.allowed),
    eligible: filterCatalog(pool.catalog, pool.tier),
    availability: state.availability,
    currentSelectors: inputs.currentSelectors,
    state: inputs.pluginState,
    agentPins: inputs.agentPins,
    raw,
    tier: pool.tier,
  });
  // Read-only: no lock write, no config.yml write.
  sendJson(res, 200, { preview, errors });
}

async function handleExport(req: IncomingMessage, res: ServerResponse, opts: ExplorerOpts, session: ExplorerSession): Promise<void> {
  const body = await readJson(req);
  if (!isRecord(body) || !isRecord(body.roles)) throw new HttpError(400, "expected { roles: object }");
  const editedSettings = body.settings;
  if (editedSettings !== undefined && !isRecord(editedSettings)) throw new HttpError(400, "expected { roles: object, settings?: object }");
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
    const known = state.rank.models.some((m) => pinnedRoute(m, def.providerPin) !== null);
    if (!known) errors.push(`role "${name}": provider pin "${def.providerPin}" matches no route in the loaded dataset`);
  }
  if (errors.length > 0) return sendJson(res, 200, { ok: false, errors });
  // Both halves in one validated, backed-up, atomic write. An absent `settings`
  // leaves the global half of the lock file untouched (the pre-#109 behaviour).
  const result = writeRoleSettings(scope.lockPath, dirty, editedSettings === undefined ? undefined : { settings: editedSettings });
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
      return sendJson(res, 200, bootstrapPayload(opts, session, activeScope(opts, session)));
    }
    if (path === "/api/scope") {
      if (method !== "POST") return sendText(res, 405, "method not allowed");
      return handleScope(req, res, opts, session);
    }
    if (path === "/api/pool") {
      if (method !== "POST") return sendText(res, 405, "method not allowed");
      return handlePool(req, res, opts, session);
    }
    if (path === "/api/rank") {
      if (method !== "POST") return sendText(res, 405, "method not allowed");
      return handleRank(req, res, opts, session);
    }
    if (path === "/api/explain") {
      if (method !== "POST") return sendText(res, 405, "method not allowed");
      return handleExplain(req, res, opts, session);
    }
    if (path === "/api/preview") {
      if (method !== "POST") return sendText(res, 405, "method not allowed");
      return handlePreview(req, res, opts, session);
    }
    if (path === "/api/export") {
      if (method !== "POST") return sendText(res, 405, "method not allowed");
      return handleExport(req, res, opts, session);
    }
    if (path === "/api/refresh") {
      if (method !== "POST") return sendText(res, 405, "method not allowed");
      await opts.refresh();
      return sendJson(res, 200, bootstrapPayload(opts, session, activeScope(opts, session)));
    }
    return sendText(res, 404, "not found");
  }

  if (method !== "GET") return sendText(res, 405, "method not allowed");
  return serveStatic(opts.webDir, path, res);
}

export function createExplorerServer(opts: ExplorerOpts): Server {
  // `raw` is the historical behaviour, so a fresh server ranks exactly what it
  // ranked before the pool toggle existed.
  const session: ExplorerSession = { activeScopeId: null, poolMode: "raw" };
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
