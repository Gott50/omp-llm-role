import assert from "node:assert/strict";
import { test } from "node:test";
import extension, { parseRefreshRolesArgs, registerRefreshRoles } from "../src/extension.ts";

type Handler = (args: unknown, ctx: unknown) => Promise<void>;

/** A minimal `ExtensionAPI` mock: records the registered commands with their
 * options, so a test can drive the exact handler the command builder wired. */
function mockPi(): { registered: Record<string, { handler: Handler }>; pi: unknown } {
  const registered: Record<string, { handler: Handler }> = {};
  const pi = {
    on: () => {},
    registerCommand: (name: string, options: { handler: Handler }) => {
      registered[name] = options;
    },
  };
  return { registered, pi };
}

/** A fake ctx carrying only the notify sink the command touches (`hasUI` keeps
 * the sink from mirroring the line to stderr). */
function mockCtx(notified: string[]): unknown {
  return { hasUI: true, ui: { notify: (line: string) => notified.push(line) } };
}

/** Register `/refresh-roles` with a recording runner and return the calls it saw. */
function registerWithRecordingRunner(registered: Record<string, { handler: Handler }>, pi: unknown) {
  const calls: Array<{ trigger: unknown; opts: unknown }> = [];
  registerRefreshRoles(pi as never, (async (trigger: unknown, _deps: unknown, opts: unknown) => {
    calls.push({ trigger, opts });
    return { decisions: [], wrote: false };
  }) as never);
  const handler = registered["refresh-roles"]?.handler;
  assert.ok(handler, `refresh-roles was not registered: ${Object.keys(registered).join(", ")}`);
  return { calls, handler };
}

test("/refresh-roles --no-margin -> the per-run switchMargin override", () => {
  assert.deepEqual(parseRefreshRolesArgs("--no-margin"), { ok: true, switchMargin: 0 });
});

test("/refresh-roles with no args -> no override", () => {
  assert.deepEqual(parseRefreshRolesArgs(""), { ok: true });
  assert.deepEqual(parseRefreshRolesArgs("   "), { ok: true });
});

test("/refresh-roles with an unknown token -> the usage line, no override", () => {
  const parsed = parseRefreshRolesArgs("--force");
  assert.equal(parsed.ok, false);
  assert.match(parsed.ok ? "" : parsed.error, /unknown flag "--force"/);
  assert.match(parsed.ok ? "" : parsed.error, /Usage: \/refresh-roles \[--no-margin\]/);
});

test("/refresh-roles --no-margin=0.05 -> rejected, not silently ignored", () => {
  const parsed = parseRefreshRolesArgs("--no-margin=0.05");
  assert.equal(parsed.ok, false);
  assert.match(parsed.ok ? "" : parsed.error, /unknown flag "--no-margin=0\.05"/);
});

// ---------------------------------------------------------------------------
// Wiring: the registered handler passes the parsed override through to the
// updater. The runner is the seam (the real run reaches the network), the
// assertion is the opts object the handler builds.
// ---------------------------------------------------------------------------

test("/refresh-roles --no-margin hands the per-run override to the updater", async () => {
  const { registered, pi } = mockPi();
  const { calls, handler } = registerWithRecordingRunner(registered, pi);
  await handler("--no-margin", mockCtx([]));
  assert.deepEqual(calls, [{ trigger: "manual", opts: { force: true, switchMargin: 0 } }]);
});

test("/refresh-roles with no args still forces a run, with no override", async () => {
  const { registered, pi } = mockPi();
  const { calls, handler } = registerWithRecordingRunner(registered, pi);
  await handler("", mockCtx([]));
  assert.deepEqual(calls, [{ trigger: "manual", opts: { force: true } }]);
});

test("/refresh-roles with an unknown flag reports the usage line and never runs", async () => {
  const { registered, pi } = mockPi();
  const { calls, handler } = registerWithRecordingRunner(registered, pi);
  const notified: string[] = [];
  await handler("--oops", mockCtx(notified));
  assert.equal(calls.length, 0);
  assert.match(notified.join("\n"), /unknown flag "--oops"/);
  assert.match(notified.join("\n"), /Usage: \/refresh-roles \[--no-margin\]/);
});

test("the extension registers /refresh-roles alongside the other commands", () => {
  const { registered, pi } = mockPi();
  extension(pi as never);
  for (const name of ["refresh-roles", "explore-roles", "create-agent", "remove-agent", "project-roles"]) {
    assert.ok(name in registered, `missing ${name}; registered: ${Object.keys(registered).join(", ")}`);
  }
});
