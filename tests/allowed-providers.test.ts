import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchAllowedProviders } from "../src/availability.ts";

function fetchResponding(status: number, body: unknown): typeof fetch {
  return async () => new Response(JSON.stringify(body), { status });
}

const ALLOWED_404 = {
  error: {
    message:
      "No allowed providers are available for the selected model. Providers serving openai/gpt-5.6-terra-20260709: azure, openai, but your account's allowed-providers setting permits only: morph, decart, venice, baseten, nextbit, typesafe, coreweave, deepinfra, fireworks, ionstream, siliconflow. To change your allowed providers, visit: https://openrouter.ai/settings/privacy",
    code: 404,
  },
};

test("fetchAllowedProviders: 404 whitelist body -> parsed set", async () => {
  const set = await fetchAllowedProviders("tok", "org/m", fetchResponding(404, ALLOWED_404));
  assert.deepEqual(
    [...(set ?? [])].sort(),
    ["baseten", "coreweave", "decart", "deepinfra", "fireworks", "ionstream", "morph", "nextbit", "siliconflow", "typesafe", "venice"],
  );
});

test("fetchAllowedProviders: 200 -> null", async () => {
  assert.equal(await fetchAllowedProviders("tok", "org/m", fetchResponding(200, { id: "x" })), null);
});

test("fetchAllowedProviders: 404 without the permits-only clause -> null", async () => {
  assert.equal(await fetchAllowedProviders("tok", "org/m", fetchResponding(404, { error: { message: "No such model org/m" } })), null);
});

test("fetchAllowedProviders: transport throw -> null", async () => {
  const throwing: typeof fetch = async () => {
    throw new Error("boom");
  };
  assert.equal(await fetchAllowedProviders("tok", "org/m", throwing), null);
});

test("fetchAllowedProviders: canary request shape (POST, bearer, provider.only, max_tokens 1)", async () => {
  let seen: { url: string; init: RequestInit } | null = null;
  const spy: typeof fetch = async (url, init) => {
    seen = { url: String(url), init: init ?? {} };
    return new Response(JSON.stringify(ALLOWED_404), { status: 404 });
  };
  await fetchAllowedProviders("tok", "org/m", spy);
  assert.equal(seen!.url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(seen!.init.method, "POST");
  const headers = seen!.init.headers as Record<string, string>;
  assert.equal(headers.authorization, "Bearer tok");
  assert.equal(headers["content-type"], "application/json");
  const body = JSON.parse(String(seen!.init.body));
  assert.equal(body.model, "org/m");
  assert.equal(body.max_tokens, 1);
  assert.deepEqual(body.provider, { only: ["__omp-llm-role-canary__"] });
});
