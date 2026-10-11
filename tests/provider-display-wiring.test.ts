import assert from "node:assert/strict";
import { test } from "node:test";
import extension from "../src/extension.ts";

// Extension wiring for the provider display (spec #77): the extension keeps the
// live session model's `name` suffixed with its provider pin, refreshed on
// session_start, the two fallback events, and turn_start. It must never call
// `pi.setModel` (that would wipe omp's in-flight fallback state and clobber the
// thinking level) and every handler must be contained.

type Handler = (event: unknown, ctx: unknown) => unknown;

/** A fake `ExtensionAPI` recording event handlers by name and any `setModel`
 * call (the wiring must never make one). */
function mockPi(): { handlers: Record<string, Handler[]>; setModelCalls: unknown[]; pi: unknown } {
  const handlers: Record<string, Handler[]> = {};
  const setModelCalls: unknown[] = [];
  const pi = {
    on: (event: string, handler: Handler) => {
      (handlers[event] ??= []).push(handler);
    },
    registerCommand: () => {},
    setModel: (model: unknown) => {
      setModelCalls.push(model);
    },
  };
  return { handlers, setModelCalls, pi };
}

/** A fake ctx whose live model is `model`; `models.current()` returns it and
 * `models.resolve(spec)` returns `resolve(spec)` (default: the live model, i.e.
 * the selector names the live session model). */
function mockCtx(model: unknown, resolve?: (spec: string) => unknown): unknown {
  return {
    hasUI: false,
    cwd: process.cwd(),
    ui: { notify: () => {} },
    modelRegistry: { getApiKeyForProvider: () => undefined, getAvailable: () => [] },
    models: { current: () => model, resolve: resolve ?? (() => model) },
    setTimeout: () => 0,
  };
}

/** Fire the display handler for `event`. The display wiring is registered after
 * the updater on `session_start`, so the last handler is the display one. */
async function fire(handlers: Record<string, Handler[]>, event: string, payload: unknown, ctx: unknown): Promise<void> {
  const list = handlers[event];
  assert.ok(list && list.length > 0, `no handler registered for ${event}`);
  const handler = list[list.length - 1];
  assert.ok(handler);
  await handler(payload, ctx);
}

const PINNED = { provider: "openrouter", id: "deepseek/deepseek-v4.1-flash", name: "DeepSeek V4.1 Flash", compat: { openRouterRouting: { only: ["coreweave/fp8"] } } };

test("session_start suffixes the live model's name with its provider pin", async () => {
  const { handlers, pi } = mockPi();
  extension(pi as never);
  const model = { ...PINNED, compat: { openRouterRouting: { only: ["coreweave/fp8"] } } };
  await fire(handlers, "session_start", { type: "session_start" }, mockCtx(model));
  assert.equal(model.name, "DeepSeek V4.1 Flash @coreweave/fp8");
});

test("session_start leaves an unpinned model's name unchanged", async () => {
  const { handlers, pi } = mockPi();
  extension(pi as never);
  const model = { id: "m", name: "DeepSeek V4.1 Flash", compat: {} };
  await fire(handlers, "session_start", { type: "session_start" }, mockCtx(model));
  assert.equal(model.name, "DeepSeek V4.1 Flash");
});

test("retry_fallback_applied applies the pin parsed from event.to", async () => {
  const { handlers, pi } = mockPi();
  extension(pi as never);
  const model = { ...PINNED, compat: { openRouterRouting: { only: ["coreweave/fp8"] } } };
  await fire(
    handlers,
    "retry_fallback_applied",
    { type: "retry_fallback_applied", from: "openrouter/a@x:auto", to: "openrouter/b@fireworks/us:auto", role: "default" },
    mockCtx(model),
  );
  assert.equal(model.name, "DeepSeek V4.1 Flash @fireworks/us");
});

test("retry_fallback_applied falls back to the live model's routing block when event.to carries no pin", async () => {
  const { handlers, pi } = mockPi();
  extension(pi as never);
  const model = { ...PINNED, compat: { openRouterRouting: { only: ["coreweave/fp8"] } } };
  await fire(
    handlers,
    "retry_fallback_applied",
    { type: "retry_fallback_applied", from: "openrouter/a@x:auto", to: "openrouter/b:auto", role: "default" },
    mockCtx(model),
  );
  assert.equal(model.name, "DeepSeek V4.1 Flash @coreweave/fp8");
});

test("retry_fallback_applied strips the suffix when neither the target nor the live model carries a pin", async () => {
  const { handlers, pi } = mockPi();
  extension(pi as never);
  const model = { id: "m", name: "DeepSeek V4.1 Flash @coreweave/fp8", compat: {} };
  await fire(
    handlers,
    "retry_fallback_applied",
    { type: "retry_fallback_applied", from: "openrouter/a@x:auto", to: "openrouter/b:auto", role: "default" },
    mockCtx(model),
  );
  assert.equal(model.name, "DeepSeek V4.1 Flash");
});

test("retry_fallback_succeeded applies the pin parsed from event.model", async () => {
  const { handlers, pi } = mockPi();
  extension(pi as never);
  const model = { ...PINNED, compat: { openRouterRouting: { only: ["coreweave/fp8"] } } };
  await fire(
    handlers,
    "retry_fallback_succeeded",
    { type: "retry_fallback_succeeded", model: "openrouter/b@baseten/fp8:auto", role: "default" },
    mockCtx(model),
  );
  assert.equal(model.name, "DeepSeek V4.1 Flash @baseten/fp8");
});

test("retry_fallback_applied ignores the event pin when the selector names a different model (advisor fallback)", async () => {
  const { handlers, pi } = mockPi();
  extension(pi as never);
  // Advisor fallbacks emit the same event, but only the advisor's model
  // changes; the event's selector resolves to the advisor, not the session.
  const model = { ...PINNED, name: "DeepSeek V4.1 Flash @coreweave/fp8", compat: { openRouterRouting: { only: ["coreweave/fp8"] } } };
  const advisorModel = { provider: "openrouter", id: "qwen/qwen3-14b" };
  await fire(
    handlers,
    "retry_fallback_applied",
    { type: "retry_fallback_applied", from: "openrouter/a@x:auto", to: "openrouter/qwen3-14b@fireworks/us:auto", role: "advisor" },
    mockCtx(model, () => advisorModel),
  );
  assert.equal(model.name, "DeepSeek V4.1 Flash @coreweave/fp8");
});

test("retry_fallback_succeeded ignores the event pin when the selector names a different model (advisor fallback)", async () => {
  const { handlers, pi } = mockPi();
  extension(pi as never);
  const model = { ...PINNED, name: "DeepSeek V4.1 Flash @coreweave/fp8", compat: { openRouterRouting: { only: ["coreweave/fp8"] } } };
  const advisorModel = { provider: "openrouter", id: "qwen/qwen3-14b" };
  await fire(
    handlers,
    "retry_fallback_succeeded",
    { type: "retry_fallback_succeeded", model: "openrouter/qwen3-14b@baseten/fp8:auto", role: "advisor" },
    mockCtx(model, () => advisorModel),
  );
  assert.equal(model.name, "DeepSeek V4.1 Flash @coreweave/fp8");
});

test("turn_start re-derives the pin from the live model (the silent restore case)", async () => {
  const { handlers, pi } = mockPi();
  extension(pi as never);
  // The display still shows the fallback's pin; omp silently restored the
  // primary, whose routing block carries the primary's pin.
  const model = { id: "m", name: "DeepSeek V4.1 Flash @fireworks/us", compat: { openRouterRouting: { only: ["coreweave/fp8"] } } };
  await fire(handlers, "turn_start", { type: "turn_start", turnIndex: 1, timestamp: 0 }, mockCtx(model));
  assert.equal(model.name, "DeepSeek V4.1 Flash @coreweave/fp8");
});

test("the display handlers never call pi.setModel", async () => {
  const { handlers, setModelCalls, pi } = mockPi();
  extension(pi as never);
  const model = { ...PINNED, compat: { openRouterRouting: { only: ["coreweave/fp8"] } } };
  const ctx = mockCtx(model);
  await fire(handlers, "session_start", { type: "session_start" }, ctx);
  await fire(handlers, "retry_fallback_applied", { type: "retry_fallback_applied", from: "a", to: "openrouter/b@x:auto", role: "default" }, ctx);
  await fire(handlers, "retry_fallback_succeeded", { type: "retry_fallback_succeeded", model: "openrouter/b@x:auto", role: "default" }, ctx);
  await fire(handlers, "turn_start", { type: "turn_start", turnIndex: 1, timestamp: 0 }, ctx);
  assert.deepEqual(setModelCalls, []);
});

test("a throwing live-model read is contained (never escapes the handler)", async () => {
  const { handlers, pi } = mockPi();
  extension(pi as never);
  const ctx = {
    ...(mockCtx({}) as Record<string, unknown>),
    models: {
      current: () => {
        throw new Error("boom");
      },
      resolve: () => undefined,
    },
  };
  await assert.doesNotReject(() => fire(handlers, "turn_start", { type: "turn_start", turnIndex: 1, timestamp: 0 }, ctx));
});
