import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import extension from "../src/extension.ts";
import { USAGE_LEDGER_FILE, type UsageRow } from "../src/usage-ledger.ts";
import { runInTempDir, setupAgentDir } from "./helpers.ts";

// Extension wiring for the per-role usage ledger (spec #81): the extension
// records one row per assistant turn in the session branch, on turn_end, with
// turn_start/session_shutdown as backstops. Every hook is contained, so a
// recording failure can never break a session.

type Handler = (event: unknown, ctx: unknown) => unknown;

/** A fake `ExtensionAPI` recording event handlers by name. */
function mockPi(): { handlers: Record<string, Handler[]>; pi: unknown } {
  const handlers: Record<string, Handler[]> = {};
  const pi = {
    on: (event: string, handler: Handler) => {
      (handlers[event] ??= []).push(handler);
    },
    registerCommand: () => {},
  };
  return { handlers, pi };
}

/** A fake ctx whose session branch is `branch` (`getBranch` throws when it is a
 * function). Only the fields the ledger hooks touch are populated. */
function mockCtx(branch: readonly unknown[]): unknown {
  return {
    hasUI: false,
    cwd: process.cwd(),
    ui: { notify: () => {} },
    modelRegistry: { getApiKeyForProvider: () => undefined, getAvailable: () => [] },
    models: { current: () => null, resolve: () => null },
    sessionManager: { getBranch: () => branch },
    setTimeout: () => 0,
  };
}

/** Fire every handler registered for `event`, as omp's dispatcher does. */
async function fireAll(handlers: Record<string, Handler[]>, event: string, ctx: unknown): Promise<void> {
  const list = handlers[event];
  assert.ok(list && list.length > 0, `no handler registered for ${event}`);
  for (const handler of list) await handler({ type: event }, ctx);
}

/** The ledger's rows, read straight from the temp agent dir. */
function ledgerRows(dir: string): UsageRow[] {
  return readFileSync(join(dir, USAGE_LEDGER_FILE), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as UsageRow);
}

/** `config.yml` in the plugin's own modelRoles format: the selectors carry a
 * provider prefix, a `@pin`, and a `:level`, so the role lookup has to
 * normalize all three away. */
const CONFIG = `modelRoles:
  default: openrouter/deepseek/deepseek-v4.1-flash@decart/fp4:auto
  slow: openrouter/google/gemini-4-argon:high
`;

/** A branch with two assistant turns: one on a configured role's model, one on a
 * model no role names, plus every entry kind that must NOT record a row. */
const BRANCH: readonly unknown[] = [
  { type: "message", timestamp: "2026-10-18T10:00:00.000Z", message: { role: "user", content: "hello" } },
  {
    type: "message",
    timestamp: "2026-10-18T10:00:05.000Z",
    message: {
      role: "assistant",
      provider: "openrouter",
      model: "deepseek/deepseek-v4.1-flash",
      usage: {
        input: 1000,
        output: 200,
        cacheRead: 50,
        cacheWrite: 10,
        totalTokens: 1260,
        reasoningTokens: 0,
        cost: { input: 0.001, output: 0.002, cacheRead: 0.0001, cacheWrite: 0.0002, total: 0.0033 },
      },
    },
  },
  { type: "message", timestamp: "2026-10-18T10:00:06.000Z", message: { role: "toolResult", toolName: "read", content: "file" } },
  // An assistant message with no usage block (an aborted turn) records nothing.
  { type: "message", timestamp: "2026-10-18T10:00:07.000Z", message: { role: "assistant", provider: "openrouter", model: "deepseek/deepseek-v4.1-flash" } },
  {
    type: "message",
    timestamp: "2026-10-18T10:01:00.000Z",
    message: {
      role: "assistant",
      provider: "openrouter",
      model: "unlisted/model-x",
      usage: { input: 7, output: 3, cacheRead: 0, cacheWrite: 0, totalTokens: 10, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0.0001 } },
    },
  },
  { type: "custom_message", timestamp: "2026-10-18T10:02:00.000Z", customType: "advisor", content: "note" },
];

test("an assistant turn appends one ledger row with the turn's role, model and usage", async () => {
  const dir = setupAgentDir(CONFIG);
  await runInTempDir(dir, async () => {
    const { handlers, pi } = mockPi();
    extension(pi as never);
    await fireAll(handlers, "turn_end", mockCtx(BRANCH));
  });

  assert.deepEqual(ledgerRows(dir), [
    {
      ts: "2026-10-18T10:00:05.000Z",
      role: "default",
      model: "deepseek/deepseek-v4.1-flash",
      provider: "openrouter",
      input: 1000,
      output: 200,
      cacheRead: 50,
      cacheWrite: 10,
      cost: 0.0033,
    },
    // No configured selector names this model, so its role is unknown.
    {
      ts: "2026-10-18T10:01:00.000Z",
      role: "",
      model: "unlisted/model-x",
      provider: "openrouter",
      input: 7,
      output: 3,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0.0001,
    },
  ]);
});

test("the backstop hooks do not double-record a turn", async () => {
  const dir = setupAgentDir(CONFIG);
  await runInTempDir(dir, async () => {
    const { handlers, pi } = mockPi();
    extension(pi as never);
    const ctx = mockCtx(BRANCH);
    await fireAll(handlers, "turn_end", ctx);
    await fireAll(handlers, "session_shutdown", ctx);
    await fireAll(handlers, "turn_end", ctx);
  });

  assert.equal(ledgerRows(dir).length, 2);
});

test("an unreadable config records the turn with no role", async () => {
  const dir = setupAgentDir(null);
  await runInTempDir(dir, async () => {
    const { handlers, pi } = mockPi();
    extension(pi as never);
    await fireAll(handlers, "turn_end", mockCtx(BRANCH));
  });

  assert.deepEqual(
    ledgerRows(dir).map((row) => row.role),
    ["", ""],
  );
});

test("a recording failure never escapes the hook", async () => {
  const dir = setupAgentDir(CONFIG);
  await runInTempDir(dir, async () => {
    const { handlers, pi } = mockPi();
    extension(pi as never);
    // A branch read that throws, and a ledger path that is a directory (so the
    // append fails): neither may reject into omp's dispatcher.
    const throwing = mockCtx(BRANCH) as { sessionManager: { getBranch(): readonly unknown[] } };
    throwing.sessionManager.getBranch = () => {
      throw new Error("branch unavailable");
    };
    await fireAll(handlers, "turn_end", throwing);

    mkdirSync(join(dir, USAGE_LEDGER_FILE), { recursive: true });
    await fireAll(handlers, "turn_end", mockCtx(BRANCH));
  });
});

test("a session with no branch records nothing", async () => {
  const dir = setupAgentDir(CONFIG);
  await runInTempDir(dir, async () => {
    const { handlers, pi } = mockPi();
    extension(pi as never);
    await fireAll(handlers, "turn_end", { hasUI: false, cwd: process.cwd(), ui: { notify: () => {} }, setTimeout: () => 0 });
  });

  assert.throws(() => readFileSync(join(dir, USAGE_LEDGER_FILE), "utf8"));
});

test("the ledger lives in the agent dir beside the plugin's other state", async () => {
  const dir = mkdtempSync(join(tmpdir(), "llm-role-ledger-"));
  await runInTempDir(dir, async () => {
    const { handlers, pi } = mockPi();
    extension(pi as never);
    await fireAll(handlers, "turn_end", mockCtx(BRANCH));
  });

  assert.equal(ledgerRows(dir).length, 2);
});
