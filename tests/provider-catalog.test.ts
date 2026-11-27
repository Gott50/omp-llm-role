import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { CatalogEntry } from "../src/availability.ts";
import {
  getProviderCatalog,
  providerCatalogCachePath,
  providerDiscovery,
  readProviderCatalogCache,
  refreshProviderCatalog,
  writeProviderCatalogCache,
  type ExecFn,
} from "../src/provider-catalog.ts";

// Provider catalog (spec #116, ticket #118): the omp subprocess seams
// (`omp models refresh <provider>`, `omp models ls --json`) and the daily
// provider-catalog cache. Every seam is best-effort: a missing binary, a
// non-zero exit or an unparseable payload degrades to null, never a throw.

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "provider-catalog-test-"));
}

function row(provider: string, id: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return { provider, id, name: id, cost: { input: 1, output: 3 }, thinking: ["high"], ...over };
}

function entry(provider: string, id: string): CatalogEntry {
  return {
    provider,
    id,
    selector: `${provider}/${id}`,
    name: id,
    contextWindow: null,
    maxTokens: null,
    reasoning: false,
    thinking: [],
    input: [],
    cost: null,
  };
}

/** Fake exec that records calls and answers from a table keyed by the joined args. */
function fakeExec(answers: Record<string, () => Promise<{ stdout: string }>>): ExecFn & { calls: string[][] } {
  const calls: string[][] = [];
  const fn = (async (cmd: string, args: string[]) => {
    calls.push([cmd, ...args]);
    const key = [cmd, ...args].join(" ");
    const answer = answers[key];
    if (!answer) throw new Error(`unexpected exec: ${key}`);
    return answer();
  }) as ExecFn & { calls: string[][] };
  fn.calls = calls;
  return fn;
}

// --- refreshProviderCatalog ------------------------------------------------

test("refreshProviderCatalog runs omp models refresh <provider> and reports success", async () => {
  const exec = fakeExec({ "omp models refresh flocta": async () => ({ stdout: "" }) });
  assert.deepEqual(await refreshProviderCatalog("flocta", exec), { provider: "flocta", ok: true });
  assert.deepEqual(exec.calls, [["omp", "models", "refresh", "flocta"]]);
});

test("refreshProviderCatalog reports a non-zero exit as ok:false with a reason", async () => {
  const exec: ExecFn = async () => {
    throw Object.assign(new Error("Command failed: omp models refresh flocta"), {
      code: 1,
      stderr: "provider flocta not found\n",
    });
  };
  const res = await refreshProviderCatalog("flocta", exec);
  assert.equal(res.provider, "flocta");
  assert.equal(res.ok, false);
  assert.equal(res.reason, "provider flocta not found");
});

test("refreshProviderCatalog never throws on a missing binary", async () => {
  const exec: ExecFn = async () => {
    throw Object.assign(new Error("spawn omp ENOENT"), { code: "ENOENT" });
  };
  const res = await refreshProviderCatalog("flocta", exec);
  assert.equal(res.ok, false);
  assert.equal(res.reason, "spawn omp ENOENT");
});

// --- getProviderCatalog ----------------------------------------------------

test("getProviderCatalog reads omp models ls --json and keeps only the provider's rows", async () => {
  const payload = {
    models: [row("flocta", "deepseek/deepseek-v4.1-flash"), row("openrouter", "deepseek/deepseek-v4.1-flash"), row("flocta", "qwen/qwen3")],
  };
  const exec = fakeExec({ "omp models ls --json": async () => ({ stdout: JSON.stringify(payload) }) });
  const rows = await getProviderCatalog("flocta", exec);
  assert.ok(rows);
  assert.deepEqual(
    rows.map((r) => r.id),
    ["deepseek/deepseek-v4.1-flash", "qwen/qwen3"],
  );
  assert.ok(rows.every((r) => r.provider === "flocta"));
  assert.deepEqual(exec.calls, [["omp", "models", "ls", "--json"]]);
});

test("getProviderCatalog returns an empty array when the provider has no rows", async () => {
  const exec = fakeExec({ "omp models ls --json": async () => ({ stdout: JSON.stringify({ models: [row("openrouter", "x")] }) }) });
  assert.deepEqual(await getProviderCatalog("flocta", exec), []);
});

test("getProviderCatalog returns null on an unparseable payload", async () => {
  const exec = fakeExec({ "omp models ls --json": async () => ({ stdout: "not json" }) });
  assert.equal(await getProviderCatalog("flocta", exec), null);
});

test("getProviderCatalog returns null when the payload has no models array", async () => {
  const exec = fakeExec({ "omp models ls --json": async () => ({ stdout: JSON.stringify({ rows: [] }) }) });
  assert.equal(await getProviderCatalog("flocta", exec), null);
});

test("getProviderCatalog returns null when the exec fails", async () => {
  const exec: ExecFn = async () => {
    throw new Error("spawn omp ENOENT");
  };
  assert.equal(await getProviderCatalog("flocta", exec), null);
});

// --- daily cache -----------------------------------------------------------

test("the provider catalog cache path is under cache/", () => {
  const path = providerCatalogCachePath();
  assert.ok(path.endsWith(join("cache", "provider-catalog-fetched-data.json")), path);
});

test("the daily cache round-trips and is stale on a different day", () => {
  const path = join(tempDir(), "provider-catalog-fetched-data.json");
  const providers = { flocta: [entry("flocta", "a")], zeta: [entry("zeta", "b")] };
  writeProviderCatalogCache("2026-11-27", providers, path);

  const fresh = readProviderCatalogCache("2026-11-27", path);
  assert.deepEqual(fresh, providers);
  assert.equal(readProviderCatalogCache("2026-11-28", path), null);
});

test("the cache file is pretty-printed JSON with sorted keys", () => {
  const path = join(tempDir(), "provider-catalog-fetched-data.json");
  writeProviderCatalogCache("2026-11-27", { zeta: [entry("zeta", "b")], flocta: [entry("flocta", "a")] }, path);
  const text = readFileSync(path, "utf8");
  assert.ok(text.includes("\n  "), "pretty-printed");
  assert.ok(text.indexOf('"flocta"') < text.indexOf('"zeta"'), "provider keys sorted");
  const parsed = JSON.parse(text) as { fetchedAt: string; providers: Record<string, unknown> };
  assert.equal(parsed.fetchedAt.slice(0, 10), "2026-11-27");
});

test("a missing or corrupt cache file reads as null", () => {
  const dir = tempDir();
  assert.equal(readProviderCatalogCache("2026-11-27", join(dir, "absent.json")), null);
  const path = join(dir, "corrupt.json");
  writeFileSync(path, "{not json");
  assert.equal(readProviderCatalogCache("2026-11-27", path), null);
});

// --- providerDiscovery -----------------------------------------------------

test("providerDiscovery reports discovery for a provider entry with a discovery block", () => {
  const path = join(tempDir(), "models.yml");
  writeFileSync(
    path,
    ["providers:", "  flocta:", "    baseUrl: https://example.test/v1", "    discovery:", "      type: openai-models-list", ""].join("\n"),
  );
  assert.equal(providerDiscovery("flocta", path), "discovery");
});

test("providerDiscovery reports static for a provider entry without a discovery block", () => {
  const path = join(tempDir(), "models.yml");
  writeFileSync(path, ["providers:", "  flocta:", "    baseUrl: https://example.test/v1", ""].join("\n"));
  assert.equal(providerDiscovery("flocta", path), "static");
});

test("providerDiscovery finds a nested discovery block inside the provider's block", () => {
  const path = join(tempDir(), "models.yml");
  writeFileSync(
    path,
    [
      "providers:",
      "  flocta:",
      "    baseUrl: https://example.test/v1",
      "    apiKey: !echo $FLOCTA_KEY",
      "    discovery:",
      "      type: openai-models-list",
      "  other:",
      "    baseUrl: https://other.test/v1",
      "",
    ].join("\n"),
  );
  assert.equal(providerDiscovery("flocta", path), "discovery");
  assert.equal(providerDiscovery("other", path), "static");
});

test("providerDiscovery does not read a sibling provider's discovery block", () => {
  const path = join(tempDir(), "models.yml");
  writeFileSync(
    path,
    ["providers:", "  flocta:", "    baseUrl: https://example.test/v1", "  other:", "    discovery:", "      type: openai-models-list", ""].join("\n"),
  );
  assert.equal(providerDiscovery("flocta", path), "static");
  assert.equal(providerDiscovery("other", path), "discovery");
});

test("providerDiscovery accepts a top-level provider key", () => {
  const path = join(tempDir(), "models.yml");
  writeFileSync(path, ["flocta:", "  discovery:", "    type: openai-models-list", ""].join("\n"));
  assert.equal(providerDiscovery("flocta", path), "discovery");
});

test("providerDiscovery reports unknown for an absent file, an unparseable file or an unlisted provider", () => {
  const dir = tempDir();
  assert.equal(providerDiscovery("flocta", join(dir, "absent.yml")), "unknown");
  const bad = join(dir, "bad.yml");
  writeFileSync(bad, "providers: [unclosed\n  - : :");
  assert.equal(providerDiscovery("flocta", bad), "unknown");
  const listed = join(dir, "listed.yml");
  writeFileSync(listed, ["providers:", "  other:", "    discovery:", "      type: openai-models-list", ""].join("\n"));
  assert.equal(providerDiscovery("flocta", listed), "unknown");
});
