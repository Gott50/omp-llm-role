import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { parse as parseYaml } from "yaml";
import type { Model, OpenRouterEndpointRecord } from "../src/engine.ts";
import { runUpdater } from "../src/updater.ts";
import { fakeDeps, makeModel, runInTempDir, setupAgentDir } from "./helpers.ts";

// Whitelist-aware route selection (issue #67, spec #65): the updater harvests
// the account's allowed-providers privacy whitelist once per run and prunes
// every model's route pool to allowed providers before ranking, so the auto-pin
// and the fallback chain only ever select routes the account can run. A null
// whitelist (no whitelist set / harvest failed) leaves the pools untouched —
// today's behaviour byte-for-byte.

function route(over: Partial<OpenRouterEndpointRecord> = {}): OpenRouterEndpointRecord {
  return {
    id: "r",
    providerSlug: "prov",
    serviceTier: null,
    status: 0,
    free: false,
    variant: "org/m-1",
    price: 1,
    weightPrice: 1,
    cacheReadPrice: null,
    tput: 10,
    latency: null,
    contextLength: null,
    maxCompletionTokens: null,
    supportsTools: null,
    ...over,
  };
}

/** A model whose routes are `slugs`, priced 1..n (so the first slug is the best
 * route by value) at the model's own throughput. */
function routed(id: string, general: number, price: number, tput: number, slugs: string[]): Model {
  const m = makeModel(id, general, price, tput);
  m.routes = slugs.map((slug, i) => route({ id: `${id}-${slug}`, providerSlug: slug, price: i + 1, tput }));
  return m;
}

/** Opt every shipped role except `default` out, so a test's chain assertions are
 * not perturbed by another role claiming the same chain key. */
const ONLY_DEFAULT = Object.fromEntries(
  ["smol", "slow", "vision", "plan", "commit", "tiny", "task", "advisor", "designer"].map((r) => [r, { enabled: false }]),
);

function onlyDefault(extra: Record<string, unknown> = {}): Record<string, unknown> {
  const { roles, ...rest } = extra;
  return { ...rest, roles: { ...ONLY_DEFAULT, ...(roles as Record<string, unknown> | undefined) } };
}

/** model-a's best route is `cheap`; model-b's is `b1`; model-c's is `c1`. All
 * three share a `mid` route so a whitelist of `mid` keeps every model eligible. */
const MODELS = [
  routed("model-a", 90, 1, 100, ["cheap", "mid", "exp"]),
  routed("model-b", 80, 5, 60, ["b1", "mid", "b3"]),
  routed("model-c", 70, 10, 30, ["c1", "mid", "c3"]),
];

function readConfig(dir: string): { modelRoles: Record<string, string>; retry: { fallbackChains: Record<string, string[]> } } {
  return parseYaml(readFileSync(join(dir, "config.yml"), "utf8")) as {
    modelRoles: Record<string, string>;
    retry: { fallbackChains: Record<string, string[]> };
  };
}

// --- prune drives the auto-pin ----------------------------------------------

test("a blocked best route falls back to the next-best allowed route as the auto-pin", async () => {
  const dir = setupAgentDir("other: 1\n");
  const deps = fakeDeps(MODELS, onlyDefault({ roles: { default: { preferOwnProvider: true } } }), {
    getAllowedProviders: async () => new Set(["mid", "exp"]),
  });
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  assert.equal(result.aborted, undefined);
  // `cheap` is blocked, so the best allowed route (`mid`) rides as the pin.
  assert.equal(readConfig(dir).modelRoles.default, "openrouter/org/model-a@mid:auto");
});

test("the written fallback chain contains only allowed routes", async () => {
  const dir = setupAgentDir("other: 1\n");
  const deps = fakeDeps(MODELS, onlyDefault({ roles: { default: { preferOwnProvider: true } } }), {
    getAllowedProviders: async () => new Set(["mid", "exp"]),
  });
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  assert.equal(result.aborted, undefined);
  const chain = readConfig(dir).retry.fallbackChains["openrouter/org/model-a@mid"];
  // Primary on its remaining 2nd route, then each fallback model on its only
  // allowed route — every entry on `mid`/`exp`, never `cheap`/`b1`/`b3`/`c1`/`c3`.
  assert.deepEqual(chain, [
    "openrouter/org/model-a@exp:auto",
    "openrouter/org/model-b@mid:auto",
    "openrouter/org/model-c@mid:auto",
  ]);
  for (const v of chain) assert.ok(v.includes("@mid") || v.includes("@exp"), `unexpected chain entry ${v}`);
});

// --- null whitelist is a no-op ----------------------------------------------

test("a null whitelist reproduces today's output byte-for-byte", async () => {
  const dir = setupAgentDir("other: 1\n");
  const deps = fakeDeps(MODELS, onlyDefault({ roles: { default: { preferOwnProvider: true } } }), {
    getAllowedProviders: async () => null,
  });
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  assert.equal(result.aborted, undefined);
  const doc = readConfig(dir);
  // The raw best route (`cheap`) is the pin, and the chain is the full 8-value
  // auto-pin shape — exactly the pre-whitelist output.
  assert.equal(doc.modelRoles.default, "openrouter/org/model-a@cheap:auto");
  assert.deepEqual(doc.retry.fallbackChains["openrouter/org/model-a@cheap"], [
    "openrouter/org/model-a@mid:auto",
    "openrouter/org/model-a@exp:auto",
    "openrouter/org/model-b@b1:auto",
    "openrouter/org/model-b@mid:auto",
    "openrouter/org/model-b@b3:auto",
    "openrouter/org/model-c@c1:auto",
    "openrouter/org/model-c@mid:auto",
    "openrouter/org/model-c@c3:auto",
  ]);
});

// --- prefix match (tiered route slug vs bare whitelist entry) ----------------

test("a bare whitelist entry matches a tiered route slug by prefix", async () => {
  // Real OpenRouter route slugs are tiered (`coreweave/fp8`) while the
  // whitelist names bare labs (`coreweave`), so the match is a prefix.
  const models = [
    routed("model-a", 90, 1, 100, ["parasail/fp8", "coreweave/fp8"]),
    routed("model-b", 80, 5, 60, ["coreweave/fp8"]),
  ];
  const dir = setupAgentDir("other: 1\n");
  const deps = fakeDeps(models, onlyDefault({ roles: { default: { preferOwnProvider: true } } }), {
    getAllowedProviders: async () => new Set(["coreweave"]),
  });
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  assert.equal(result.aborted, undefined);
  // `parasail/fp8` is blocked; `coreweave/fp8` matches the bare `coreweave` entry.
  assert.equal(readConfig(dir).modelRoles.default, "openrouter/org/model-a@coreweave/fp8:auto");
});

// --- notify ------------------------------------------------------------------

test("the notify line reports the active whitelist and the pruned route count", async () => {
  const dir = setupAgentDir("other: 1\n");
  const notified: string[] = [];
  const deps = fakeDeps(MODELS, onlyDefault({ roles: { default: { preferOwnProvider: true } } }), {
    getAllowedProviders: async () => new Set(["mid", "exp"]),
    notify: (lines) => notified.push(...lines),
  });
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  assert.equal(result.aborted, undefined);
  // 9 routes before, 4 after (a: mid+exp, b: mid, c: mid) -> 5 pruned.
  assert.ok(
    notified.some((l) => l.includes("allowed-providers whitelist active — 2 providers; 5 routes pruned")),
    `notify lines: ${notified.join(" | ")}`,
  );
});

test("a null whitelist notifies 'no whitelist'", async () => {
  const dir = setupAgentDir("other: 1\n");
  const notified: string[] = [];
  const deps = fakeDeps(MODELS, onlyDefault({ roles: { default: { preferOwnProvider: true } } }), {
    getAllowedProviders: async () => null,
    notify: (lines) => notified.push(...lines),
  });
  const result = await runInTempDir(dir, () => runUpdater("manual", deps, { force: true }));
  assert.equal(result.aborted, undefined);
  assert.ok(
    notified.some((l) => l.includes("allowed-providers whitelist: no whitelist")),
    `notify lines: ${notified.join(" | ")}`,
  );
});
