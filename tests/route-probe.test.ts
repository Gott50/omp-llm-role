import assert from "node:assert/strict";
import { test } from "node:test";
import { probeRoute } from "../src/availability.ts";

function fetchResponding(status: number, body: unknown): typeof fetch {
  return async () => new Response(JSON.stringify(body), { status });
}

const ALLOWED_404 = {
  error: {
    message:
      "No allowed providers are available for the selected model. Providers serving deepseek/deepseek-v4.1-flash-20260910: open-inference, morph, wafer, but your account's allowed-providers setting permits only: groq, relace. Additionally, your request's provider.only preference permits only: relace.",
    code: 404,
  },
};

test("probeRoute: 200 completion -> ok", async () => {
  assert.equal(await probeRoute("tok", "deepseek/deepseek-v4.1-flash", "relace", fetchResponding(200, { id: "x" })), "ok");
});

test("probeRoute: 404 no-allowed-providers -> blocked", async () => {
  assert.equal(await probeRoute("tok", "deepseek/deepseek-v4.1-flash", "relace", fetchResponding(404, ALLOWED_404)), "blocked");
});

test("probeRoute: 404 with another body -> unknown (usable)", async () => {
  assert.equal(
    await probeRoute("tok", "deepseek/deepseek-v4.1-flash", "relace", fetchResponding(404, { error: { message: "No such model deepseek/deepseek-v4.1-flash" } })),
    "unknown",
  );
});

test("probeRoute: 500 -> unknown (usable)", async () => {
  assert.equal(await probeRoute("tok", "deepseek/deepseek-v4.1-flash", "relace", fetchResponding(500, { error: { message: "boom" } })), "unknown");
});

test("probeRoute: 429 rate limit -> unknown (usable)", async () => {
  assert.equal(await probeRoute("tok", "deepseek/deepseek-v4.1-flash", "coreweave", fetchResponding(429, { error: { message: "rate_limit_exceeded" } })), "unknown");
});

test("probeRoute: transport throw -> unknown (usable)", async () => {
  const throwing: typeof fetch = async () => {
    throw new Error("ECONNRESET");
  };
  assert.equal(await probeRoute("tok", "deepseek/deepseek-v4.1-flash", "relace", throwing), "unknown");
});

test("probeRoute: request is a one-token completion pinned to the slug", async () => {
  let url = "";
  let init: RequestInit | undefined;
  const capturing: typeof fetch = async (input, requestInit) => {
    url = String(input);
    init = requestInit;
    return new Response(JSON.stringify({ id: "x" }), { status: 200 });
  };
  assert.equal(await probeRoute("tok", "deepseek/deepseek-v4.1-flash", "relace", capturing), "ok");
  assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(init?.method, "POST");
  const body = JSON.parse(String(init?.body));
  assert.deepEqual(body, {
    model: "deepseek/deepseek-v4.1-flash",
    messages: [{ role: "user", content: "ok" }],
    max_tokens: 1,
    provider: { only: ["relace"] },
  });
});
