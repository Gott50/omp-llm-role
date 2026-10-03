import assert from "node:assert/strict";
import { test } from "node:test";
import { computeKeyAvailability, fetchKeyAvailability } from "../src/availability.ts";

const PUBLIC = ["org/a", "org/b", "org/c", "~org/d-latest", "org/e:free"];
const KEYED = ["org/a", "org/b", "~org/d-latest"];

test("computeKeyAvailability: proper subset -> active with the right blocked set", () => {
  const a = computeKeyAvailability(PUBLIC, KEYED);
  assert.equal(a.active, true);
  assert.equal(a.reason, "active");
  assert.deepEqual([...a.allowed].sort(), ["a", "b", "d"]);
  assert.deepEqual([...a.blocked].sort(), ["c", "e"]);
  assert.equal(a.publicCount, 5);
  assert.equal(a.keyedCount, 3);
});

test("computeKeyAvailability: equal sets -> no-filter with empty marks", () => {
  const a = computeKeyAvailability(PUBLIC, PUBLIC);
  assert.equal(a.active, false);
  assert.equal(a.reason, "no-filter");
  assert.equal(a.allowed.size, 0);
  assert.equal(a.blocked.size, 0);
  assert.equal(a.publicCount, 5);
  assert.equal(a.keyedCount, 5);
});

test("computeKeyAvailability: empty keyed or public -> unavailable", () => {
  for (const a of [computeKeyAvailability(PUBLIC, []), computeKeyAvailability([], KEYED)]) {
    assert.equal(a.active, false);
    assert.equal(a.reason, "unavailable");
    assert.equal(a.allowed.size, 0);
    assert.equal(a.blocked.size, 0);
  }
});

test("computeKeyAvailability: a keyed id absent from public -> no-filter, never blocked", () => {
  const a = computeKeyAvailability(["org/a", "org/b"], ["org/a", "org/zz"]);
  assert.equal(a.reason, "no-filter");
  assert.equal(a.blocked.size, 0);
});

test("computeKeyAvailability: aliases and dated suffixes collapse to one ranking id", () => {
  const a = computeKeyAvailability(["org/x", "org/y-20260709", "org/z:free"], ["~org/x-latest", "~org/y-20260709"]);
  assert.equal(a.reason, "active");
  assert.deepEqual([...a.allowed].sort(), ["x", "y-20260709"]);
  assert.deepEqual([...a.blocked], ["z"]);
});

/** Test double for the global fetch signature, recording each call's URL + auth header. */
function fakeFetch(handler: (auth: string | null) => Response | Promise<Response>): { impl: typeof fetch; calls: Array<{ url: string; auth: string | null }> } {
  const calls: Array<{ url: string; auth: string | null }> = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const auth = new Headers(init?.headers).get("authorization");
    calls.push({ url: String(input), auth });
    return handler(auth);
  }) as unknown as typeof fetch;
  return { impl, calls };
}

test("fetchKeyAvailability: two parallel catalog GETs, one authenticated", async () => {
  const { impl, calls } = fakeFetch((auth) =>
    new Response(JSON.stringify({ data: (auth === null ? PUBLIC : KEYED).map((id) => ({ id })) }), { status: 200 }),
  );
  const a = await fetchKeyAvailability("sk-or-test", impl);
  assert.equal(a.reason, "active");
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((c) => c.url), ["https://openrouter.ai/api/v1/models", "https://openrouter.ai/api/v1/models"]);
  assert.deepEqual(calls.map((c) => c.auth).sort(), ["Bearer sk-or-test", null].sort());
  assert.deepEqual([...a.blocked].sort(), ["c", "e"]);
});

test("fetchKeyAvailability: non-OK, thrown, and malformed responses -> unavailable, never throws", async () => {
  const cases: Array<() => Promise<Response>> = [
    async () => new Response("nope", { status: 500 }),
    async () => {
      throw new Error("dns");
    },
    async () => new Response(JSON.stringify({ nope: true }), { status: 200 }),
  ];
  for (const respond of cases) {
    const a = await fetchKeyAvailability("sk-or-test", (async () => respond()) as unknown as typeof fetch);
    assert.equal(a.reason, "unavailable");
    assert.equal(a.active, false);
    assert.equal(a.allowed.size, 0);
    assert.equal(a.blocked.size, 0);
  }
});

test("fetchKeyAvailability: a rejected keyed request degrades to unavailable", async () => {
  const { impl } = fakeFetch((auth) =>
    auth === null
      ? new Response(JSON.stringify({ data: PUBLIC.map((id) => ({ id })) }), { status: 200 })
      : new Response(JSON.stringify({ error: { message: "invalid key" } }), { status: 401 }),
  );
  const a = await fetchKeyAvailability("sk-or-bad", impl);
  assert.equal(a.reason, "unavailable");
  assert.equal(a.active, false);
});
