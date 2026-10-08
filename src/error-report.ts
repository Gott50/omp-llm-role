/**
 * Opt-in reporting of **unexpected** plugin errors as GitHub issues on the
 * plugin's own tracker (`Gott50/omp-llm-role`).
 *
 * This module is the feature's single home and the plugin's only GitHub client.
 * It owns the fingerprint, the redaction rules, the issue title/body, the local
 * ledger (`llm-role-error-reports.json` in the agent dir), the token path
 * (search → dedupe → caps → create/comment), the prefilled-URL path, the `ask`
 * posture and the whole-call containment.
 *
 * The entry point is `reportUnexpectedError(input, deps)`. The injected `deps`
 * object is the feature's one test seam: production callers pass
 * `defaultErrorReportDeps()`, tests inject every field (no real network, clock,
 * home dir or `gh` invocation).
 *
 * Reporting is best-effort: the whole call is wrapped, every request carries a
 * timeout, and a failure only adds one notify line. It never throws and never
 * changes the caller's run result.
 *
 * Dual runtime: only `node:` builtins and the global `fetch` (Bun under omp,
 * Node for the CLI). No runtime dependency.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isRecord } from "./guards.ts";
import { readPluginSettingsMap, resolveSettings, type ResolvedSettings } from "./settings.ts";
import { agentDir as defaultAgentDir } from "./state.ts";

/** The plugin's tracker coordinates — the one home for the repo slug. */
const REPO = "Gott50/omp-llm-role";
const API_BASE = "https://api.github.com";
const WEB_BASE = "https://github.com";
const USER_AGENT = "omp-llm-role";
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_URL_BYTES = 8 * 1024;
const MAX_TITLE_LINE = 80;
const MAX_CREATIONS_PER_DAY = 3;
const TRUNCATION_MARKER = "… truncated";

/** Ledger file name inside the agent dir. */
export const ERROR_REPORT_LEDGER_FILE = "llm-role-error-reports.json";

export type ErrorReportInput = {
  /** The command name (`session-start`, `refresh-roles`, `explore-roles`,
   *  `create-agent`, `remove-agent`, `project-roles`) or the updater abort label. */
  label: string;
  error: unknown;
  hasUI: boolean;
  /** The caller's UI line sink. */
  notify: (line: string, level: "info" | "warning") => void;
  /** The caller's yes/no prompt (built from `ctx.ui.select?`); absent in
   *  print/RPC/subagent sessions. */
  confirm?: (title: string, payload: string) => Promise<boolean>;
};

export type ErrorReportDeps = {
  settings: ResolvedSettings;
  fetch: typeof fetch;
  env: Record<string, string | undefined>;
  now(): Date;
  agentDir(): string;
  readVersion(): string;
  ghToken?(): string | null;
  openUrl?(url: string): void;
};

export type ErrorReportOutcome = {
  action: "off" | "created" | "commented" | "offered" | "suppressed" | "failed";
  url?: string;
  reason?: string;
};

/** The ledger's action vocabulary — what a ledger entry records. Narrower than
 *  `ErrorReportOutcome["action"]`: `off` and `failed` are outcomes, never
 *  ledgered. */
type ReportAction = "created" | "commented" | "offered" | "suppressed";

type Report = {
  fingerprint: string;
  label: string;
  errorName: string;
  message: string;
  stack: string;
  title: string;
  body: string;
};

type LedgerEntry = {
  fingerprint: string;
  label: string;
  title: string;
  firstSeen: string;
  lastSeen: string;
  createdDay?: string;
  offeredDay?: string;
  count: number;
  /** Untrusted on read — a hand-edited or corrupt file may hold anything, so
   *  the read path preserves the raw string; `recordLedger`'s patch is the
   *  typed write path. */
  action: string;
  issueNumber?: number;
  issueUrl?: string;
};

type Ledger = { reports: LedgerEntry[]; dayCount: { day: string; count: number } };

type GhResult = { kind: "ok"; data: unknown } | { kind: "denied"; status: number } | { kind: "error"; reason: string };

/**
 * Per-process guard: a crash loop in one session must not fire N requests.
 * Exported reset is a test hook for process-global state.
 */
const reportedFingerprints = new Set<string>();

/** Clear the in-process guard (test hook). */
export function resetErrorReportGuard(): void {
  reportedFingerprints.clear();
}

/**
 * Report an unexpected plugin error. Never throws, never rejects, and never
 * changes the caller's run result. A no-op (`action: "off"`) when
 * `errorReporting` is `off`.
 */
export async function reportUnexpectedError(input: ErrorReportInput, deps: ErrorReportDeps): Promise<ErrorReportOutcome> {
  try {
    // Fail closed: only the two explicit opt-ins report. Anything else — `off`,
    // a typo, a value from a hand-edited lock file — is a no-op, so a privacy
    // setting can never fail open into filing an issue.
    const posture = deps.settings.errorReporting;
    if (posture !== "ask" && posture !== "auto") return { action: "off" };
    const report = buildReport(input, deps);
    if (reportedFingerprints.has(report.fingerprint)) {
      return { action: "suppressed", reason: "already reported in this process" };
    }
    reportedFingerprints.add(report.fingerprint);
    return await dispatch(report, input, deps);
  } catch (err) {
    const reason = errText(err);
    try {
      input.notify(`llm-role: error reporting failed: ${reason}`, "warning");
    } catch {
      // the notify sink itself failed; nothing left to do
    }
    return { action: "failed", reason };
  }
}

/** Production deps: resolved plugin settings, the global fetch, the real clock,
 *  the agent dir, the shipped manifest, `gh auth token` and the OS opener. */
export function defaultErrorReportDeps(): ErrorReportDeps {
  return {
    settings: resolveSettings(readPluginSettingsMap()).settings,
    fetch: globalThis.fetch,
    env: process.env,
    now: () => new Date(),
    agentDir: defaultAgentDir,
    readVersion: readPluginVersion,
    ghToken: resolveGhToken,
    openUrl: defaultOpenUrl,
  };
}

async function dispatch(report: Report, input: ErrorReportInput, deps: ErrorReportDeps): Promise<ErrorReportOutcome> {
  if (deps.settings.errorReporting === "ask") {
    if (input.hasUI && input.confirm) {
      const approved = await input.confirm(report.title, report.body);
      if (!approved) return offerUrl(report, input, deps);
    } else {
      // No UI (print/RPC/subagent) or no prompt: never upload without asking.
      return offerUrl(report, input, deps);
    }
  }
  const token = resolveToken(deps);
  if (!token) return offerUrl(report, input, deps);
  return tokenPath(report, input, deps, token);
}

async function tokenPath(report: Report, input: ErrorReportInput, deps: ErrorReportDeps, token: string): Promise<ErrorReportOutcome> {
  const query = `repo:${REPO} in:body "omp-llm-role-error-report: ${report.fingerprint}"`;
  const search = await ghRequest(deps, token, "GET", `/search/issues?q=${encodeURIComponent(query)}`);
  if (search.kind === "denied") return offerUrl(report, input, deps);
  if (search.kind === "error") return failed(input, search.reason);
  const items = searchItems(search.data);
  const open = items.find((item) => item.state === "open");
  if (open) {
    const comment = await ghRequest(deps, token, "POST", `/repos/${REPO}/issues/${open.number}/comments`, { body: commentBody(report) });
    if (comment.kind === "denied") return offerUrl(report, input, deps);
    if (comment.kind === "error") return failed(input, comment.reason);
    recordLedger(deps, report, { action: "commented", issueNumber: open.number, issueUrl: open.html_url });
    input.notify(`llm-role: commented on ${open.html_url}`, "info");
    return { action: "commented", url: open.html_url };
  }

  const closed = items.filter((item) => item.state === "closed");
  const today = dayKey(deps.now());
  const ledger = readLedger(deps.agentDir());
  const entry = ledgerEntry(ledger, report.fingerprint);
  if (entry?.createdDay === today) {
    recordLedger(deps, report, { action: "suppressed" });
    return { action: "suppressed", reason: "already created today" };
  }
  if (ledger.dayCount.day === today && ledger.dayCount.count >= MAX_CREATIONS_PER_DAY) {
    recordLedger(deps, report, { action: "suppressed" });
    return { action: "suppressed", reason: "daily creation cap reached" };
  }

  const body = closed.length > 0 ? `${report.body}\n\n---\nReappearance of ${closed.map((c) => `#${c.number}`).join(", ")}.` : report.body;
  const create = await ghRequest(deps, token, "POST", `/repos/${REPO}/issues`, { title: report.title, body, labels: ["bug", "needs-triage"] });
  if (create.kind === "denied") return offerUrl(report, input, deps);
  if (create.kind === "error") return failed(input, create.reason);
  const issue = createIssue(create.data);
  if (!issue) return failed(input, "malformed create response");
  recordLedger(deps, report, { action: "created", issueNumber: issue.number, issueUrl: issue.html_url, createdDay: today, incrementDay: true });
  input.notify(`llm-role: filed ${issue.html_url}`, "info");
  return { action: "created", url: issue.html_url };
}

function offerUrl(report: Report, input: ErrorReportInput, deps: ErrorReportDeps): ErrorReportOutcome {
  const today = dayKey(deps.now());
  const entry = ledgerEntry(readLedger(deps.agentDir()), report.fingerprint);
  if (entry?.offeredDay === today) {
    return { action: "suppressed", reason: "already offered today" };
  }
  const url = buildIssueUrl(report);
  recordLedger(deps, report, { action: "offered", offeredDay: today });
  try {
    (deps.openUrl ?? defaultOpenUrl)(url);
  } catch {
    // opening the browser is best-effort; the URL is still notified
  }
  input.notify(`llm-role: report this at ${url}`, "info");
  return { action: "offered", url };
}

function failed(input: ErrorReportInput, reason: string): ErrorReportOutcome {
  input.notify(`llm-role: error reporting failed: ${reason}`, "warning");
  return { action: "failed", reason };
}

// --- report construction ---------------------------------------------------

function buildReport(input: ErrorReportInput, deps: ErrorReportDeps): Report {
  const { errorName, message, stack } = describeError(input.error);
  const redact = makeRedactor(deps.env);
  const rMessage = redact(message);
  const rStack = redact(stack);
  const failureSite = firstFrame(rStack) ?? collapseWhitespace(rMessage);
  const fingerprint = sha256(`${input.label}\n${errorName}\n${failureSite}`);
  const title = buildTitle(input.label, errorName, rMessage);
  const body = buildBody({ fingerprint, label: input.label, errorName, message: rMessage, stack: rStack }, deps);
  return { fingerprint, label: input.label, errorName, message: rMessage, stack: rStack, title, body };
}

function describeError(error: unknown): { errorName: string; message: string; stack: string } {
  if (error instanceof Error) {
    return { errorName: error.name || "Error", message: error.message ?? "", stack: error.stack ?? "" };
  }
  return { errorName: "Error", message: typeof error === "string" ? error : safeStringify(error), stack: "" };
}

function buildTitle(label: string, errorName: string, message: string): string {
  const firstLine = (message.split("\n")[0] ?? "").trim();
  const clipped = firstLine.length > MAX_TITLE_LINE ? `${firstLine.slice(0, MAX_TITLE_LINE - 1)}…` : firstLine;
  return `[auto] ${label}: ${errorName}: ${clipped}`;
}

function buildBody(report: { fingerprint: string; label: string; errorName: string; message: string; stack: string }, deps: ErrorReportDeps): string {
  const versions = process.versions as Record<string, string | undefined>;
  const runtime = versions.bun ? `bun ${versions.bun}` : `node ${versions.node}`;
  const sections = [
    `<!-- omp-llm-role-error-report: ${report.fingerprint} -->`,
    "",
    "### Metadata",
    `- Plugin version: ${deps.readVersion()}`,
    `- Runtime: ${runtime}`,
    `- Platform: ${process.platform} ${process.arch}`,
    `- Command: ${report.label}`,
    `- Timestamp: ${deps.now().toISOString()}`,
    "",
    "### Error",
    `\`${report.errorName}: ${report.message}\``,
    "",
    "```",
    report.stack || "(no stack)",
    "```",
  ];
  const body = sections.join("\n");
  // The cap is a byte budget: `body.length` counts UTF-16 code units, so a
  // non-ASCII stack could otherwise exceed 64 KB by up to ~4×.
  if (Buffer.byteLength(body, "utf8") <= MAX_BODY_BYTES) return body;
  const truncated = Buffer.from(body, "utf8").subarray(0, MAX_BODY_BYTES).toString("utf8");
  return `${truncated}\n${TRUNCATION_MARKER}`;
}

function commentBody(report: Report): string {
  return `Another occurrence of this error (fingerprint \`${report.fingerprint}\`).\n\n\`\`\`\n${report.stack || report.message}\n\`\`\``;
}

/** Replace lone surrogates with U+FFFD so `encodeURIComponent` cannot throw. */
function toWellFormed(s: string): string {
  return s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "\uFFFD");
}

function buildIssueUrl(report: Report): string {
  const base = `${WEB_BASE}/${REPO}/issues/new`;
  const labels = "bug,needs-triage";
  const title = toWellFormed(report.title);
  const make = (body: string): string => `${base}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(toWellFormed(body))}&labels=${labels}`;
  let body = report.body;
  let url = make(body);
  while (url.length > MAX_URL_BYTES && body.length > 0) {
    // Truncate on code points, not UTF-16 code units: a code-unit cut can split
    // a surrogate pair, and `encodeURIComponent` then throws on the lone half.
    const points = Array.from(body);
    body = points.slice(0, Math.floor(points.length * 0.8)).join("");
    url = make(body);
  }
  return url;
}

// --- redaction -------------------------------------------------------------

/** The named redaction rules, applied in order to the message and the stack
 *  before either reaches the title, the body, the URL or the fingerprint. */
function makeRedactor(env: Record<string, string | undefined>): (s: string) => string {
  const home = env.HOME || env.USERPROFILE || "";
  return (s: string): string => {
    let out = s;
    if (home) out = out.split(home).join("~");
    out = out.replace(/[^\s()]*node_modules\//g, "<pkg>/");
    out = out.replace(/\bsk-[A-Za-z0-9_-]+/g, "<redacted>");
    out = out.replace(/\bgh[pousr]_[A-Za-z0-9]+/g, "<redacted>");
    out = out.replace(/\bgithub_pat_[A-Za-z0-9_]+/g, "<redacted>");
    out = out.replace(/Bearer\s+\S+/g, "<redacted>");
    return out;
  };
}

// --- fingerprint helpers ---------------------------------------------------

function firstFrame(stack: string): string | null {
  for (const line of stack.split("\n")) {
    const match = /^\s*at\s+(.+)$/.exec(line);
    if (match) return collapseWhitespace(match[1]);
  }
  return null;
}

function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// --- GitHub API ------------------------------------------------------------

async function ghRequest(deps: ErrorReportDeps, token: string, method: string, path: string, body?: unknown): Promise<GhResult> {
  let res: Response;
  try {
    res = await deps.fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": USER_AGENT,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    return { kind: "error", reason: errText(err) };
  }
  // 401/403/404 all mean "this token cannot write here" (a fine-grained PAT
  // without Issues:write answers 404): fall through to the prefilled URL.
  if (res.status === 401 || res.status === 403 || res.status === 404) return { kind: "denied", status: res.status };
  if (!res.ok) return { kind: "error", reason: `HTTP ${res.status}` };
  try {
    return { kind: "ok", data: await res.json() };
  } catch (err) {
    return { kind: "error", reason: `malformed response: ${errText(err)}` };
  }
}

type SearchItem = { number: number; state: string; html_url: string };

function searchItems(data: unknown): SearchItem[] {
  if (!isRecord(data) || !Array.isArray(data.items)) return [];
  const out: SearchItem[] = [];
  for (const item of data.items) {
    if (!isRecord(item) || typeof item.number !== "number") continue;
    out.push({
      number: item.number,
      state: typeof item.state === "string" ? item.state : "",
      html_url: typeof item.html_url === "string" ? item.html_url : "",
    });
  }
  return out;
}

function createIssue(data: unknown): { number: number; html_url: string } | null {
  if (isRecord(data) && typeof data.number === "number") {
    return { number: data.number, html_url: typeof data.html_url === "string" ? data.html_url : "" };
  }
  return null;
}

// --- token resolution ------------------------------------------------------

function resolveToken(deps: ErrorReportDeps): string | null {
  const fromEnv = deps.env.GITHUB_TOKEN || deps.env.GH_TOKEN;
  if (fromEnv) return fromEnv;
  try {
    return deps.ghToken?.() ?? null;
  } catch {
    return null;
  }
}

let ghTokenCache: string | null | undefined;

function resolveGhToken(): string | null {
  if (ghTokenCache !== undefined) return ghTokenCache;
  let resolved: string | null = null;
  try {
    const out = execFileSync("gh", ["auth", "token"], { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] }).trim();
    resolved = out.length > 0 ? out : null;
  } catch {
    resolved = null;
  }
  ghTokenCache = resolved;
  return resolved;
}

function readPluginVersion(): string {
  try {
    const pkg: unknown = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    return isRecord(pkg) && typeof pkg.version === "string" ? pkg.version : "unknown";
  } catch {
    return "unknown";
  }
}

function defaultOpenUrl(url: string): void {
  try {
    if (process.platform === "darwin") execFileSync("open", [url], { stdio: "ignore" });
    else console.error(url);
  } catch {
    console.error(url);
  }
}

// --- ledger ----------------------------------------------------------------

function emptyLedger(): Ledger {
  return { reports: [], dayCount: { day: "", count: 0 } };
}

/** Read the ledger. Missing, unparseable, or unexpected-shape → empty. */
function readLedger(dir: string): Ledger {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(join(dir, ERROR_REPORT_LEDGER_FILE), "utf8"));
  } catch {
    return emptyLedger();
  }
  if (!isRecord(parsed)) return emptyLedger();
  const reports: LedgerEntry[] = [];
  if (Array.isArray(parsed.reports)) {
    for (const entry of parsed.reports) {
      if (!isRecord(entry) || typeof entry.fingerprint !== "string") continue;
      reports.push({
        fingerprint: entry.fingerprint,
        label: typeof entry.label === "string" ? entry.label : "",
        title: typeof entry.title === "string" ? entry.title : "",
        firstSeen: typeof entry.firstSeen === "string" ? entry.firstSeen : "",
        lastSeen: typeof entry.lastSeen === "string" ? entry.lastSeen : "",
        createdDay: typeof entry.createdDay === "string" ? entry.createdDay : undefined,
        offeredDay: typeof entry.offeredDay === "string" ? entry.offeredDay : undefined,
        count: typeof entry.count === "number" ? entry.count : 0,
        action: typeof entry.action === "string" ? entry.action : "",
        issueNumber: typeof entry.issueNumber === "number" ? entry.issueNumber : undefined,
        issueUrl: typeof entry.issueUrl === "string" ? entry.issueUrl : undefined,
      });
    }
  }
  const dayCount = isRecord(parsed.dayCount) ? parsed.dayCount : {};
  return {
    reports,
    dayCount: { day: typeof dayCount.day === "string" ? dayCount.day : "", count: typeof dayCount.count === "number" ? dayCount.count : 0 },
  };
}

/** The ledger entry for a fingerprint, or undefined. The one lookup both the
 *  token path and the URL path use. */
function ledgerEntry(ledger: Ledger, fingerprint: string): LedgerEntry | undefined {
  return ledger.reports.find((e) => e.fingerprint === fingerprint);
}

/** Atomic replace (temp + rename) so concurrent writers cannot corrupt the file. */
function writeLedger(ledger: Ledger, dir: string): void {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, ERROR_REPORT_LEDGER_FILE);
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(ledger, null, 2)}\n`);
  renameSync(tmp, path);
}

function recordLedger(
  deps: ErrorReportDeps,
  report: Report,
  patch: { action: ReportAction; issueNumber?: number; issueUrl?: string; createdDay?: string; offeredDay?: string; incrementDay?: boolean },
): void {
  try {
    const dir = deps.agentDir();
    const ledger = readLedger(dir);
    const iso = deps.now().toISOString();
    let entry = ledger.reports.find((e) => e.fingerprint === report.fingerprint);
    if (!entry) {
      entry = { fingerprint: report.fingerprint, label: report.label, title: report.title, firstSeen: iso, lastSeen: iso, count: 0, action: patch.action };
      ledger.reports.push(entry);
    }
    entry.lastSeen = iso;
    entry.count += 1;
    entry.action = patch.action;
    if (patch.issueNumber !== undefined) entry.issueNumber = patch.issueNumber;
    if (patch.issueUrl !== undefined) entry.issueUrl = patch.issueUrl;
    if (patch.createdDay !== undefined) entry.createdDay = patch.createdDay;
    if (patch.offeredDay !== undefined) entry.offeredDay = patch.offeredDay;
    if (patch.incrementDay) {
      const day = dayKey(deps.now());
      if (ledger.dayCount.day === day) ledger.dayCount.count += 1;
      else ledger.dayCount = { day, count: 1 };
    }
    writeLedger(ledger, dir);
  } catch {
    // the ledger is an audit aid, never a run prerequisite
  }
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
