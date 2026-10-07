import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAgentSpec, withArchitectRetry } from "../src/agent-architect.ts";

const VALID_SPEC = JSON.stringify({
  identifier: "code-reviewer",
  whenToUse: "Use this agent when reviewing a pull request",
  systemPrompt: "You review code.",
});

test("withArchitectRetry retries a parse failure and returns the parsed spec", async () => {
  let calls = 0;
  const spec = await withArchitectRetry(
    async () => {
      calls++;
      return calls === 1 ? '{"identifier": "code-reviewer"}' : VALID_SPEC;
    },
    parseAgentSpec,
  );
  assert.equal(calls, 2);
  assert.deepEqual(spec, {
    identifier: "code-reviewer",
    whenToUse: "Use this agent when reviewing a pull request",
    systemPrompt: "You review code.",
  });
});

test("withArchitectRetry throws after exhausting attempts, carrying the raw output", async () => {
  const malformed = '{"identifier": "code-reviewer", "whenToUse": "nope"}';
  let calls = 0;
  await assert.rejects(
    withArchitectRetry(
      async () => {
        calls++;
        return malformed;
      },
      parseAgentSpec,
    ),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /after 2 attempts/);
      assert.ok(err.message.includes(malformed), "the raw architect output is surfaced");
      return true;
    },
  );
  assert.equal(calls, 2);
});

test("withArchitectRetry propagates a run() failure without retrying", async () => {
  let calls = 0;
  await assert.rejects(
    withArchitectRetry(
      async () => {
        calls++;
        throw new Error("architect returned no text");
      },
      parseAgentSpec,
    ),
    /architect returned no text/,
  );
  assert.equal(calls, 1);
});
