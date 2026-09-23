import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { probeModel } from "../src/availability.ts";
import { runUpdater } from "../src/updater.ts";
import { fakeDeps, makeModel, runInTempDir, setupAgentDir } from "./helpers.ts";

// Uniform quality metrics -> scores: A 1.0, B 0.5, C 0.0; margin(A,B) = 0.5.
const MODELS = [makeModel("model-a", 90, 1, 100), makeModel("model-b", 80, 5, 60), makeModel("model-c", 70, 10, 30)];

function fetchResponding(status: number, body: unknown): typeof fetch {
  return async () => new Response(JSON.stringify(body), { status });
}

const ALLOWED_404 = {
  error: {
    message:
      "No allowed providers are available for the selected model. Providers serving openai/gpt-5.6-terra-20260709: azure, openai, but your account's allowed-providers setting permits only: modal, together.",
    code: 404,
  },
};

test("probeModel: 200 completion -> ok", async () => {
  assert.equal(await probeModel("tok", "org/m", fetchResponding(200, { id: "x" })), "ok");
});

test("probeModel: 404 no-allowed-providers -> blocked", async () => {
  assert.equal(await probeModel("tok", "org/m", fetchResponding(404, ALLOWED_404)), "blocked");
});

test("probeModel: 404 unknown model -> unknown (usable)", async () => {
  assert.equal(await probeModel("tok", "org/m", fetchResponding(404, { error: { message: "No such model org/m" } })), "unknown");
});

test("probeModel: 500 and transport failure -> unknown (usable)", async () => {
  assert.equal(await probeModel("tok", "org/m", fetchResponding(500, { error: { message: "upstream" } })), "unknown");
  const failing = async (): Promise<Response> => {
    throw new Error("dns");
  };
  assert.equal(await probeModel("tok", "org/m", failing as unknown as typeof fetch), "unknown");
});

function blockedExcept(blocked: string[], counter?: { n: number }) {
  return async (_token: string, catalogId: string) => {
    if (counter) counter.n++;
    return blocked.includes(catalogId) ? "blocked" : "ok";
  };
}

async function run(configText: string, probe: (token: string, id: string) => Promise<string>, settings: Record<string, unknown> = {}) {
  const dir = setupAgentDir(configText);
  const notified: string[] = [];
  const deps = fakeDeps(MODELS, settings, { probeModel: probe, notify: (lines) => notified.push(...lines) });
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true, dryRun: true }));
  return { result, notified };
}

test("blocked best candidate -> next ranked adopted, decision records the block", async () => {
  const { result } = await run("other: 1\n", blockedExcept(["org/model-a"]));
  const d = result.decisions.find((x) => x.role === "default");
  assert.ok(d);
  assert.equal(d.reason, "no-current");
  assert.equal(d.to, "openrouter/org/model-b");
  assert.deepEqual(d.blocked, ["org/model-a"]);
});

test("blocked current selector -> adopted replacement", async () => {
  const { result } = await run('modelRoles:\n  default: "openrouter/org/model-b"\n', blockedExcept(["org/model-b"]));
  const d = result.decisions.find((x) => x.role === "default");
  assert.ok(d);
  assert.equal(d.reason, "adopted");
  assert.equal(d.to, "openrouter/org/model-a");
  assert.deepEqual(d.blocked, ["org/model-b"]);
});

test("hysteresis intact when everything probes clean", async () => {
  const { result } = await run('modelRoles:\n  default: "openrouter/org/model-b"\n', blockedExcept([]), { switchMargin: 0.6 });
  const d = result.decisions.find((x) => x.role === "default");
  assert.ok(d);
  assert.equal(d.reason, "kept-margin");
  assert.equal(d.to, "openrouter/org/model-b");
  assert.deepEqual(d.blocked, []);
});

test("fallback chains contain only probe-clean candidates", async () => {
  const dir = setupAgentDir('modelRoles:\n  default: "openrouter/org/model-b"\n');
  const deps = fakeDeps(MODELS, { fallbackChainDepth: 2 }, { probeModel: blockedExcept(["org/model-a"]) });
  await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  const text = readFileSync(join(dir, "config.yml"), "utf8");
  assert.match(text, /openrouter\/org\/model-b:\n\s+- "openrouter\/org\/model-c"/);
  assert.doesNotMatch(text, /model-a/);
});

test("probe verdicts are cached across roles (shared candidates probed once)", async () => {
  const dir = setupAgentDir("other: 1\n");
  const counter = { n: 0 };
  const deps = fakeDeps(MODELS, {}, { probeModel: blockedExcept([], counter) });
  await runInTempDir(dir, () => runUpdater("manual", deps, { force: true, dryRun: true }));
  // Every role walks the same three candidates; the cache collapses them.
  assert.equal(counter.n, 3);
});

test("all candidates blocked -> role untouched with a note", async () => {
  const { result, notified } = await run('modelRoles:\n  default: "openrouter/org/model-a"\n', async () => "blocked");
  assert.equal(result.decisions.find((x) => x.role === "default"), undefined);
  assert.ok(notified.some((l) => l.includes("@default: no probe-clean candidate")));
});

const SIX = [makeModel("model-a", 90, 1, 100), makeModel("model-b", 80, 2, 90), makeModel("model-c", 70, 3, 80), makeModel("model-d", 60, 4, 70), makeModel("model-e", 50, 5, 60), makeModel("model-f", 40, 6, 50)];
const SEVEN = [...SIX, makeModel("model-g", 30, 7, 50)];

test("walk fills a kept role's chain to full depth with probe-clean entries", async () => {
  const dir = setupAgentDir('modelRoles:\n  default: "openrouter/org/model-d"\n');
  const deps = fakeDeps(SIX, { switchMargin: 1, fallbackChainDepth: 2 }, { probeModel: blockedExcept([]) });
  await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  const text = readFileSync(join(dir, "config.yml"), "utf8");
  assert.match(text, /openrouter\/org\/model-d:\n\s+- "openrouter\/org\/model-e"\n\s+- "openrouter\/org\/model-f"/);
});

test("blocked candidates beyond a kept current do not count toward chain depth", async () => {
  const dir = setupAgentDir('modelRoles:\n  default: "openrouter/org/model-d"\n');
  const deps = fakeDeps(SEVEN, { switchMargin: 1, fallbackChainDepth: 2 }, { probeModel: blockedExcept(["org/model-e"]) });
  await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  const text = readFileSync(join(dir, "config.yml"), "utf8");
  assert.match(text, /openrouter\/org\/model-d:\n\s+- "openrouter\/org\/model-f"\n\s+- "openrouter\/org\/model-g"/);
  assert.doesNotMatch(text, /model-e/);
});