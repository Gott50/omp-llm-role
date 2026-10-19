import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { probeModel } from "../src/availability.ts";
import { runUpdater } from "../src/updater.ts";
import { fakeDeps, makeModel, runInTempDir, setupAgentDir } from "./helpers.ts";

// Uniform quality metrics -> q = (v+20)/80: A 1.375, B 1.25, C 1.125; margin(A,B) ≈ 0.1355.
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
  assert.equal(d.to, "openrouter/org/model-b:auto");
  assert.deepEqual(d.blocked, ["org/model-a"]);
});

test("blocked current selector -> adopted replacement", async () => {
  const { result } = await run('modelRoles:\n  default: "openrouter/org/model-b"\n', blockedExcept(["org/model-b"]));
  const d = result.decisions.find((x) => x.role === "default");
  assert.ok(d);
  assert.equal(d.reason, "adopted");
  assert.equal(d.to, "openrouter/org/model-a:auto");
  assert.deepEqual(d.blocked, ["org/model-b"]);
});

test("hysteresis intact when everything probes clean", async () => {
  const { result } = await run('modelRoles:\n  default: "openrouter/org/model-b"\n', blockedExcept([]), { switchMargin: 0.6, priceSwitchFraction: 0 });
  const d = result.decisions.find((x) => x.role === "default");
  assert.ok(d);
  assert.equal(d.reason, "kept-margin");
  assert.equal(d.to, "openrouter/org/model-b:auto");
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

test("a kept role's chain is filled to full depth from the candidates below the kept model", async () => {
  const dir = setupAgentDir('modelRoles:\n  default: "openrouter/org/model-d"\n');
  const deps = fakeDeps(SIX, { switchMargin: 1, fallbackChainDepth: 2, priceSwitchFraction: 0 }, { probeModel: blockedExcept([]) });
  await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  const text = readFileSync(join(dir, "config.yml"), "utf8");
  assert.match(text, /openrouter\/org\/model-d:\n\s+- "openrouter\/org\/model-e:auto"\n\s+- "openrouter\/org\/model-f:auto"/);
});

// Spec #95: the chain's fallback models come from the role's whole ranked
// candidate list, not from the probe window. The walk still stops at
// `1 + fallbackChainDepth` clean candidates, so the rank-4 `model-d` below is
// never probed — it is chained anyway, because it is cheaper-or-equal to the
// chosen model and clears the quality floor.
const PROBE_WINDOW = [
  makeModel("model-a", 90, 2, 100),
  makeModel("model-b", 88, 3, 100),
  makeModel("model-c", 86, 4, 100),
  makeModel("model-d", 80, 1, 100),
];

/** Every shipped role except `default` opted out, so the chain key is claimed by
 * one role and the assertions below read that role's own chain (a key claimed by
 * several roles is written level-free, from whichever role iterated last). */
const ONLY_DEFAULT_ROLES = Object.fromEntries(
  ["smol", "slow", "vision", "plan", "commit", "tiny", "task", "advisor", "designer"].map((r) => [r, { enabled: false }]),
);

test("the chain reaches a cheaper candidate the walk never probes", async () => {
  const dir = setupAgentDir("other: 1\n");
  const deps = fakeDeps(PROBE_WINDOW, { fallbackChainDepth: 2, roles: ONLY_DEFAULT_ROLES }, { probeModel: blockedExcept([]) });
  await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  const text = readFileSync(join(dir, "config.yml"), "utf8");
  assert.match(text, /openrouter\/org\/model-a:\n\s+- "openrouter\/org\/model-d:auto"\n\s+- "openrouter\/org\/model-b:auto"/);
});