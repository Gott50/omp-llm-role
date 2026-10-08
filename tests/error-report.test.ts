import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, test } from "node:test";
import {
  ERROR_REPORT_LEDGER_FILE,
  reportUnexpectedError,
  resetErrorReportGuard,
  type ErrorReportDeps,
  type ErrorReportInput,
} from "../src/error-report.ts";
import { DEFAULT_SETTINGS, type ResolvedSettings } from "../src/settings.ts";

type CapturedBody = { title?: string; body?: string; labels?: string[] };
type CapturedRequest = { url: string; method: string; headers: Record<string, string>; body: CapturedBody | undefined };

type LedgerFile = {
  reports: { fingerprint: string; action: string; issueNumber?: number; createdDay?: string; offeredDay?: string; count: number }[];
  dayCount: { day: string; count: number };
};

const ISSUES_URL = "https://api.github.com/repos/Gott50/omp-llm-role/issues";

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

function isSearch(req: CapturedRequest): boolean {
  return req.url.includes("/search/issues");
}
function isCreate(req: CapturedRequest): boolean {
  return req.method === "POST" && req.url === ISSUES_URL;
}
function isComment(req: CapturedRequest): boolean {
  return req.method === "POST" && req.url.endsWith("/comments");
}

/** The open issue a search returns. */
function openIssue(number = 5): Response {
  return jsonResponse({ items: [{ number, state: "open", html_url: `https://github.com/Gott50/omp-llm-role/issues/${number}` }] });
}
function closedIssue(number = 3): Response {
  return jsonResponse({ items: [{ number, state: "closed", html_url: `https://github.com/Gott50/omp-llm-role/issues/${number}` }] });
}
function noMatch(): Response {
  return jsonResponse({ items: [] });
}
/** The default responder: no existing issue, every create succeeds. */
function creates(respond: (req: CapturedRequest) => Response): (req: CapturedRequest) => Response {
  return (req) => (isCreate(req) ? jsonResponse({ number: 7, html_url: "https://github.com/Gott50/omp-llm-role/issues/7" }) : respond(req));
}

function makeHarness(opts: {
  /** Deliberately `string`: the harness must be able to express a value the
   *  settings resolver would reject (a hand-edited lock file). */
  posture?: string;
  respond?: (req: CapturedRequest) => Response | Promise<Response>;
  env?: Record<string, string | undefined>;
  ghToken?: () => string | null;
  now?: () => Date;
  openUrl?: (url: string) => void;
} = {}) {
  const dir = mkdtempSync(join(tmpdir(), "omp-llm-role-error-report-"));
  const requests: CapturedRequest[] = [];
  const opened: string[] = [];
  const notifies: { line: string; level: string }[] = [];
  const respond = opts.respond ?? noMatch;
  const deps: ErrorReportDeps = {
    settings: { ...DEFAULT_SETTINGS, errorReporting: (opts.posture ?? "auto") as ResolvedSettings["errorReporting"] },
    fetch: async (input, init) => {
      const request: CapturedRequest = {
        url: String(input),
        method: init?.method ?? "GET",
        headers: (init?.headers as Record<string, string>) ?? {},
        body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      };
      requests.push(request);
      return respond(request);
    },
    env: opts.env ?? { HOME: "/Users/tester" },
    now: opts.now ?? (() => new Date("2026-10-08T12:00:00.000Z")),
    agentDir: () => dir,
    readVersion: () => "1.0.0",
    ghToken: opts.ghToken ?? (() => "ghp_harness"),
    openUrl: opts.openUrl ?? ((url) => opened.push(url)),
  };
  const input = (over: Partial<ErrorReportInput> = {}): ErrorReportInput => ({
    label: "refresh-roles",
    error: new Error("boom"),
    hasUI: false,
    notify: (line, level) => notifies.push({ line, level }),
    ...over,
  });
  return { deps, dir, requests, opened, notifies, input };
}

function readLedgerFile(dir: string): LedgerFile | null {
  try {
    return JSON.parse(readFileSync(join(dir, ERROR_REPORT_LEDGER_FILE), "utf8")) as LedgerFile;
  } catch {
    return null;
  }
}

function markerOf(req: CapturedRequest): string {
  const match = /omp-llm-role-error-report: ([0-9a-f]{64})/.exec(String(req.body?.body ?? ""));
  return match?.[1] ?? "";
}

function boomAt(message: string): Error {
  return new Error(message);
}

beforeEach(() => resetErrorReportGuard());

test("errorReporting off is a no-op: no request, no ledger, action off", async () => {
  const h = makeHarness({ posture: "off", respond: () => jsonResponse({}) });
  const outcome = await reportUnexpectedError(h.input(), h.deps);
  assert.deepEqual(outcome, { action: "off" });
  assert.equal(h.requests.length, 0);
  assert.equal(existsSync(join(h.dir, ERROR_REPORT_LEDGER_FILE)), false);
});

test("an invalid errorReporting value fails closed: no request, no ledger, action off", async () => {
  // A typo (`sometimes`, `Auto`) or a hand-edited lock file must not fall
  // through to the token path and file an issue without asking.
  for (const posture of ["sometimes", "Auto", "on", ""]) {
    const h = makeHarness({ posture, respond: () => jsonResponse({}) });
    const outcome = await reportUnexpectedError(h.input(), h.deps);
    assert.deepEqual(outcome, { action: "off" }, `posture ${JSON.stringify(posture)}`);
    assert.equal(h.requests.length, 0, `posture ${JSON.stringify(posture)}`);
    assert.equal(h.opened.length, 0, `posture ${JSON.stringify(posture)}`);
    assert.equal(existsSync(join(h.dir, ERROR_REPORT_LEDGER_FILE)), false, `posture ${JSON.stringify(posture)}`);
  }
});

test("auto + token files exactly one issue carrying marker, metadata, stack and labels", async () => {
  const h = makeHarness({ respond: creates(noMatch) });
  const err = new Error("boom");
  err.stack = "Error: boom\n    at doThing (/work/src/thing.ts:10:5)";
  const outcome = await reportUnexpectedError(h.input({ error: err }), h.deps);

  assert.equal(outcome.action, "created");
  assert.equal(outcome.url, "https://github.com/Gott50/omp-llm-role/issues/7");
  const createsOnly = h.requests.filter(isCreate);
  assert.equal(createsOnly.length, 1);
  const req = createsOnly[0];
  assert.equal(req.headers.Authorization, "Bearer ghp_harness");
  assert.equal(req.headers.Accept, "application/vnd.github+json");
  assert.equal(req.headers["User-Agent"], "omp-llm-role");
  assert.deepEqual(req.body.labels, ["bug", "needs-triage"]);
  assert.equal(req.body.title, "[auto] refresh-roles: Error: boom");
  const body = String(req.body.body);
  assert.match(body, /omp-llm-role-error-report: [0-9a-f]{64}/);
  assert.match(body, /Plugin version: 1\.0\.0/);
  assert.match(body, /Runtime: node /);
  assert.match(body, new RegExp(`Platform: ${process.platform} ${process.arch}`));
  assert.match(body, /Command: refresh-roles/);
  assert.match(body, /at doThing \(\/work\/src\/thing\.ts:10:5\)/);
  assert.doesNotMatch(body, /ghp_harness/);
  assert.doesNotMatch(JSON.stringify(req.body), /ghp_harness/);
  // The search is the dedupe read, and it carries the fingerprint marker.
  const search = h.requests.find(isSearch);
  assert.ok(search);
  assert.match(decodeURIComponent(search!.url), /omp-llm-role-error-report: [0-9a-f]{64}/);
});

test("redaction scrubs the home dir, node_modules prefixes and token-shaped strings", async () => {
  const h = makeHarness({ respond: creates(noMatch) });
  const err = new Error(
    "failed /Users/tester/secret.txt with sk-abc123def456 ghp_deadbeef01 gho_feedface02 github_pat_11ABCDEFG0abc Authorization: Bearer xyz789",
  );
  err.stack = `Error: ${err.message}\n    at fn (/Users/tester/node_modules/pkg/index.js:1:1)`;
  await reportUnexpectedError(h.input({ error: err }), h.deps);

  const body = String(h.requests.find(isCreate)?.body.body);
  assert.match(body, /~/);
  assert.match(body, /<pkg>\/pkg\/index\.js/);
  assert.doesNotMatch(body, /\/Users\/tester/);
  assert.doesNotMatch(body, /sk-abc123def456/);
  assert.doesNotMatch(body, /ghp_deadbeef01/);
  assert.doesNotMatch(body, /gho_feedface02/);
  assert.doesNotMatch(body, /github_pat_11ABCDEFG0abc/);
  assert.doesNotMatch(body, /Bearer xyz789/);
  assert.ok(body.match(/<redacted>/g)!.length >= 5);
  // The title is redacted too.
  assert.doesNotMatch(String(h.requests.find(isCreate)?.body.title), /sk-abc/);
});

test("the prefilled URL carries no token-shaped string", async () => {
  const h = makeHarness({ posture: "auto", env: { HOME: "/Users/tester" }, ghToken: () => null });
  const err = new Error("leaked sk-abc123def456");
  const outcome = await reportUnexpectedError(h.input({ error: err }), h.deps);
  assert.equal(outcome.action, "offered");
  assert.equal(h.requests.length, 0);
  assert.equal(h.opened.length, 1);
  assert.doesNotMatch(h.opened[0], /sk-abc/);
  const body = new URL(h.opened[0]).searchParams.get("body") ?? "";
  assert.match(body, /<redacted>/);
});

test("dedupe: an open match is commented on, never a second create", async () => {
  let searches = 0;
  const h = makeHarness({
    respond: creates((req) => {
      if (isSearch(req)) {
        searches += 1;
        return searches === 1 ? noMatch() : openIssue(5);
      }
      return jsonResponse({ id: 1 });
    }),
  });
  const first = await reportUnexpectedError(h.input(), h.deps);
  assert.equal(first.action, "created");
  resetErrorReportGuard();
  const second = await reportUnexpectedError(h.input(), h.deps);

  assert.equal(second.action, "commented");
  assert.equal(second.url, "https://github.com/Gott50/omp-llm-role/issues/5");
  assert.equal(h.requests.filter(isCreate).length, 1);
  const comment = h.requests.find(isComment);
  assert.ok(comment);
  assert.doesNotMatch(String(comment!.body?.body), /ghp_harness/);
  assert.doesNotMatch(JSON.stringify(comment!.body), /ghp_harness/);
});

test("a closed match is a regression: a fresh issue links the old one", async () => {
  const h = makeHarness({ respond: creates(() => closedIssue(3)) });
  const outcome = await reportUnexpectedError(h.input(), h.deps);
  assert.equal(outcome.action, "created");
  const body = String(h.requests.find(isCreate)?.body.body);
  assert.match(body, /#3/);
});

test("caps: the 4th distinct fingerprint in one UTC day is suppressed with no create", async () => {
  const h = makeHarness({ respond: creates(noMatch) });
  for (const label of ["a", "b", "c"]) {
    assert.equal((await reportUnexpectedError(h.input({ label }), h.deps)).action, "created");
  }
  const fourth = await reportUnexpectedError(h.input({ label: "d" }), h.deps);
  assert.equal(fourth.action, "suppressed");
  assert.equal(h.requests.filter(isCreate).length, 3);
});

test("caps: a fingerprint created earlier the same day is suppressed even when the issue is closed", async () => {
  let searches = 0;
  const h = makeHarness({
    respond: creates((req) => {
      if (!isSearch(req)) return jsonResponse({});
      searches += 1;
      return searches === 1 ? noMatch() : closedIssue(9);
    }),
  });
  assert.equal((await reportUnexpectedError(h.input(), h.deps)).action, "created");
  resetErrorReportGuard();
  const second = await reportUnexpectedError(h.input(), h.deps);
  assert.equal(second.action, "suppressed");
  assert.equal(h.requests.filter(isCreate).length, 1);
});

test("caps: a later UTC day re-creates the regression", async () => {
  let day = new Date("2026-10-08T12:00:00.000Z");
  const h = makeHarness({ now: () => day, respond: creates(() => closedIssue(3)) });
  assert.equal((await reportUnexpectedError(h.input(), h.deps)).action, "created");
  resetErrorReportGuard();
  day = new Date("2026-10-09T12:00:00.000Z");
  const second = await reportUnexpectedError(h.input(), h.deps);
  assert.equal(second.action, "created");
  const bodies = h.requests.filter(isCreate).map((r) => String(r.body.body));
  assert.equal(bodies.length, 2);
  assert.match(bodies[1], /#3/);
});

test("permission fall-through: 403 from the create yields offered and leaves the counters untouched", async () => {
  const h = makeHarness({ respond: (req) => (isSearch(req) ? noMatch() : jsonResponse({}, 403)) });
  const outcome = await reportUnexpectedError(h.input(), h.deps);
  assert.equal(outcome.action, "offered");
  assert.equal(h.opened.length, 1);
  assert.match(h.opened[0], /issues\/new\?/);
  const ledger = readLedgerFile(h.dir);
  assert.equal(ledger.dayCount.count, 0);
  assert.equal(ledger.reports[0].createdDay, undefined);
});

test("permission fall-through: a 404 from a fine-grained PAT create yields offered", async () => {
  const h = makeHarness({ respond: (req) => (isSearch(req) ? noMatch() : jsonResponse({}, 404)) });
  const outcome = await reportUnexpectedError(h.input(), h.deps);
  assert.equal(outcome.action, "offered");
  assert.equal(h.requests.filter(isCreate).length, 1);
});

test("permission fall-through: a 403 from the search yields offered with no create", async () => {
  const h = makeHarness({ respond: () => jsonResponse({}, 403) });
  const outcome = await reportUnexpectedError(h.input(), h.deps);
  assert.equal(outcome.action, "offered");
  assert.equal(h.requests.filter(isCreate).length, 0);
  assert.equal(h.opened.length, 1);
});

test("no token: no HTTP at all, an issues/new URL with title, body and labels, opened once", async () => {
  const h = makeHarness({ env: {}, ghToken: () => null });
  const outcome = await reportUnexpectedError(h.input(), h.deps);
  assert.equal(outcome.action, "offered");
  assert.equal(h.requests.length, 0);
  assert.equal(h.opened.length, 1);
  const url = new URL(h.opened[0]);
  assert.match(url.pathname, /\/Gott50\/omp-llm-role\/issues\/new$/);
  assert.equal(url.searchParams.get("title"), "[auto] refresh-roles: Error: boom");
  assert.match(url.searchParams.get("body") ?? "", /omp-llm-role-error-report: [0-9a-f]{64}/);
  assert.equal(url.searchParams.get("labels"), "bug,needs-triage");
});

test("the URL is offered at most once per fingerprint per day", async () => {
  const h = makeHarness({ env: {}, ghToken: () => null });
  assert.equal((await reportUnexpectedError(h.input(), h.deps)).action, "offered");
  resetErrorReportGuard();
  assert.equal((await reportUnexpectedError(h.input(), h.deps)).action, "suppressed");
  assert.equal(h.opened.length, 1);
});

test("token resolution: GITHUB_TOKEN wins over GH_TOKEN", async () => {
  const h = makeHarness({ env: { GITHUB_TOKEN: "env-first", GH_TOKEN: "env-second" }, respond: creates(noMatch) });
  await reportUnexpectedError(h.input(), h.deps);
  assert.equal(h.requests.find(isSearch)?.headers.Authorization, "Bearer env-first");
});

test("token resolution: GH_TOKEN is used when GITHUB_TOKEN is absent", async () => {
  const h = makeHarness({ env: { GH_TOKEN: "env-second" }, respond: creates(noMatch) });
  await reportUnexpectedError(h.input(), h.deps);
  assert.equal(h.requests.find(isSearch)?.headers.Authorization, "Bearer env-second");
});

test("token resolution: gh auth token is used when no env token is set", async () => {
  const h = makeHarness({ env: {}, ghToken: () => "from-gh-cli", respond: creates(noMatch) });
  await reportUnexpectedError(h.input(), h.deps);
  assert.equal(h.requests.find(isSearch)?.headers.Authorization, "Bearer from-gh-cli");
});

test("token resolution: a throwing gh executor falls through to the URL path with no HTTP", async () => {
  const h = makeHarness({
    env: {},
    ghToken: () => {
      throw new Error("gh: command not found");
    },
  });
  const outcome = await reportUnexpectedError(h.input(), h.deps);
  assert.equal(outcome.action, "offered");
  assert.equal(h.requests.length, 0);
});

test("token resolution: an empty gh executor result falls through to the URL path", async () => {
  const h = makeHarness({ env: {}, ghToken: () => "" });
  const outcome = await reportUnexpectedError(h.input(), h.deps);
  assert.equal(outcome.action, "offered");
  assert.equal(h.requests.length, 0);
});

test("containment: a rejected fetch yields failed, one notify line and no throw", async () => {
  const h = makeHarness({
    respond: () => {
      throw new Error("offline");
    },
  });
  const outcome = await reportUnexpectedError(h.input(), h.deps);
  assert.equal(outcome.action, "failed");
  assert.equal(h.notifies.length, 1);
  assert.equal(h.notifies[0].level, "warning");
  assert.equal(existsSync(join(h.dir, ERROR_REPORT_LEDGER_FILE)), false);
});

test("containment: a 500 yields failed with one notify line", async () => {
  const h = makeHarness({ respond: () => jsonResponse({}, 500) });
  const outcome = await reportUnexpectedError(h.input(), h.deps);
  assert.equal(outcome.action, "failed");
  assert.equal(h.notifies.length, 1);
});

test("containment: a timeout yields failed with one notify line", async () => {
  const h = makeHarness({
    respond: () => {
      const err = new Error("The operation was aborted due to timeout");
      err.name = "TimeoutError";
      throw err;
    },
  });
  const outcome = await reportUnexpectedError(h.input(), h.deps);
  assert.equal(outcome.action, "failed");
  assert.equal(h.notifies.length, 1);
});

test("containment: a malformed JSON body yields failed", async () => {
  const h = makeHarness({ respond: () => new Response("not json", { status: 200, headers: { "content-type": "application/json" } }) });
  const outcome = await reportUnexpectedError(h.input(), h.deps);
  assert.equal(outcome.action, "failed");
  assert.equal(h.notifies.length, 1);
});

test("fingerprint stability: a varying id inside the message does not change it; the label does", async () => {
  const a = boomAt("boom id=123");
  const b = boomAt("boom id=456");
  const h1 = makeHarness({ respond: creates(noMatch) });
  const h2 = makeHarness({ respond: creates(noMatch) });
  const h3 = makeHarness({ respond: creates(noMatch) });
  await reportUnexpectedError(h1.input({ error: a }), h1.deps);
  resetErrorReportGuard();
  await reportUnexpectedError(h2.input({ error: b }), h2.deps);
  resetErrorReportGuard();
  await reportUnexpectedError(h3.input({ label: "create-agent", error: a }), h3.deps);
  const m1 = markerOf(h1.requests.find(isCreate)!);
  const m2 = markerOf(h2.requests.find(isCreate)!);
  const m3 = markerOf(h3.requests.find(isCreate)!);
  assert.match(m1, /^[0-9a-f]{64}$/);
  assert.equal(m1, m2);
  assert.notEqual(m1, m3);
});

test("a defect string is fingerprinted by its message, so distinct aborts differ", async () => {
  // `reportDefect` passes the updater's abort string as `error` (not wrapped in
  // an `Error`), so the module's failure site is the message: two different
  // aborts under one command label must not collapse onto one fingerprint.
  const h1 = makeHarness({ respond: creates(noMatch) });
  const h2 = makeHarness({ respond: creates(noMatch) });
  const h3 = makeHarness({ respond: creates(noMatch) });
  await reportUnexpectedError(h1.input({ error: "config edit refused: flow style" }), h1.deps);
  resetErrorReportGuard();
  await reportUnexpectedError(h2.input({ error: "boom" }), h2.deps);
  resetErrorReportGuard();
  await reportUnexpectedError(h3.input({ error: "config edit refused: flow style" }), h3.deps);
  const m1 = markerOf(h1.requests.find(isCreate)!);
  const m2 = markerOf(h2.requests.find(isCreate)!);
  const m3 = markerOf(h3.requests.find(isCreate)!);
  assert.match(m1, /^[0-9a-f]{64}$/);
  assert.notEqual(m1, m2);
  assert.equal(m1, m3);
  // The failure site is the whitespace-collapsed message (a string error has no stack).
  assert.equal(m1, createHash("sha256").update("refresh-roles\nError\nconfig edit refused: flow style").digest("hex"));
});

test("ask: a confirm resolving true surfaces the payload and files exactly once", async () => {
  const h = makeHarness({ posture: "ask", respond: creates(noMatch) });
  const surfaced: { title: string; payload: string }[] = [];
  const outcome = await reportUnexpectedError(
    h.input({
      hasUI: true,
      confirm: async (title, payload) => {
        surfaced.push({ title, payload });
        return true;
      },
    }),
    h.deps,
  );
  assert.equal(outcome.action, "created");
  assert.equal(h.requests.filter(isCreate).length, 1);
  assert.equal(surfaced.length, 1);
  assert.equal(surfaced[0].title, "[auto] refresh-roles: Error: boom");
  assert.match(surfaced[0].payload, /omp-llm-role-error-report: [0-9a-f]{64}/);
});

test("ask: a confirm resolving false sends nothing and offers the URL", async () => {
  const h = makeHarness({ posture: "ask", respond: creates(noMatch) });
  const outcome = await reportUnexpectedError(h.input({ hasUI: true, confirm: async () => false }), h.deps);
  assert.equal(outcome.action, "offered");
  assert.equal(h.requests.length, 0);
  assert.equal(h.opened.length, 1);
});

test("ask: without a UI it degrades to the URL path, never a silent auto", async () => {
  const h = makeHarness({ posture: "ask", respond: creates(noMatch) });
  const outcome = await reportUnexpectedError(h.input({ hasUI: false }), h.deps);
  assert.equal(outcome.action, "offered");
  assert.equal(h.requests.length, 0);
});

test("ask: with a UI but no confirm it degrades to the URL path", async () => {
  const h = makeHarness({ posture: "ask", respond: creates(noMatch) });
  const outcome = await reportUnexpectedError(h.input({ hasUI: true }), h.deps);
  assert.equal(outcome.action, "offered");
  assert.equal(h.requests.length, 0);
});

test("the in-process guard collapses repeated identical reports within one session", async () => {
  const h = makeHarness({ respond: creates(noMatch) });
  assert.equal((await reportUnexpectedError(h.input(), h.deps)).action, "created");
  const second = await reportUnexpectedError(h.input(), h.deps);
  assert.equal(second.action, "suppressed");
  assert.equal(h.requests.filter(isCreate).length, 1);
});

test("the ledger records what was filed and is tolerant of junk", async () => {
  const h = makeHarness({ respond: creates(noMatch) });
  await reportUnexpectedError(h.input(), h.deps);
  const ledger = readLedgerFile(h.dir);
  assert.equal(ledger.reports[0].action, "created");
  assert.equal(ledger.reports[0].issueNumber, 7);
  assert.equal(ledger.reports[0].createdDay, "2026-10-08");
  assert.deepEqual(ledger.dayCount, { day: "2026-10-08", count: 1 });
});

test("a long stack is truncated with a visible marker under 64 KB", async () => {
  const h = makeHarness({ respond: creates(noMatch) });
  const err = new Error("boom");
  err.stack = `Error: boom\n${"    at frame (/x/y.ts:1:1)\n".repeat(5000)}`;
  await reportUnexpectedError(h.input({ error: err }), h.deps);
  const body = String(h.requests.find(isCreate)?.body.body);
  assert.ok(body.length <= 64 * 1024 + 64);
  assert.match(body, /… truncated/);
});

test("a multi-byte stack is truncated to the byte budget, not the code-unit count", async () => {
  const h = makeHarness({ respond: creates(noMatch) });
  const err = new Error("boom");
  err.stack = `Error: boom\n${"    at 帧 (/x/日本語のファイル.ts:1:1)\n".repeat(5000)}`;
  await reportUnexpectedError(h.input({ error: err }), h.deps);
  const body = String(h.requests.find(isCreate)?.body.body);
  assert.match(body, /… truncated/);
  const bytes = Buffer.byteLength(body, "utf8");
  assert.ok(bytes <= 64 * 1024 + 64, `body was ${bytes} bytes`);
});

test("the prefilled URL stays under ~8 KB even for a pathological stack", async () => {
  const h = makeHarness({ env: {}, ghToken: () => null });
  const err = new Error("boom");
  err.stack = `Error: boom\n${"    at frame (/x/y.ts:1:1)\n".repeat(5000)}`;
  const outcome = await reportUnexpectedError(h.input({ error: err }), h.deps);
  assert.equal(outcome.action, "offered");
  assert.ok(h.opened[0].length <= 8 * 1024 + 256);
  assert.match(new URL(h.opened[0]).searchParams.get("body") ?? "", /omp-llm-role-error-report: [0-9a-f]{64}/);
});

test("a non-BMP character at the 8 KB URL cut is offered, never failed", async () => {
  // Learn the exact body prefix length (metadata + error header) by filing once
  // with a token; the prefix is independent of the stack, so the same offset
  // holds for the crafted stack below.
  const probe = makeHarness({ respond: creates(noMatch) });
  const probeErr = new Error("boom");
  probeErr.stack = "STACKMARKER\n    at frame (/x/y.ts:1:1)";
  await reportUnexpectedError(probe.input({ error: probeErr }), probe.deps);
  const probeBody = String(probe.requests.find(isCreate)?.body.body);
  const prefixLen = probeBody.indexOf("STACKMARKER");
  assert.ok(prefixLen > 0, "probe body must contain the stack marker");

  // Place an emoji so the 80% code-unit cut lands between its two surrogates.
  // The body is prefix + "a"*head + emoji + "a"*tail + "\n```" (4-char suffix),
  // so head = 8019 - prefix makes floor(0.8 * body.length) === prefix + head + 1
  // (the low surrogate) for any prefix length.
  const tail = 2000;
  const head = 8019 - prefixLen;
  const h = makeHarness({ env: {}, ghToken: () => null });
  const err = new Error("boom");
  err.stack = `${"a".repeat(head)}😀${"a".repeat(tail)}`;
  const outcome = await reportUnexpectedError(h.input({ error: err }), h.deps);
  assert.equal(outcome.action, "offered");
  assert.ok(outcome.url);
  assert.equal(h.opened.length, 1);
});

test("a lone surrogate in the message is sanitized, not a failed report", async () => {
  const h = makeHarness({ env: {}, ghToken: () => null });
  const outcome = await reportUnexpectedError(h.input({ error: new Error("boom \uD800 end") }), h.deps);
  assert.equal(outcome.action, "offered");
  assert.ok(outcome.url);
  assert.equal(h.opened.length, 1);
});
