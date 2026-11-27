/**
 * Provider catalog: the omp subprocess seams and the daily provider-catalog
 * cache (spec #116, ticket #118).
 *
 * The omp catalog is the availability source for every provider. A prioritized
 * non-OpenRouter provider's list is refreshed through omp once per UTC day
 * (`omp models refresh <provider>`) and read back (`omp models ls --json`),
 * filtered to that provider. Both seams are best-effort: a missing binary, a
 * non-zero exit or an unparseable payload degrades to `null` so the caller
 * falls back to the session catalog. Nothing here throws.
 *
 * The fresh rows are cached in `cache/provider-catalog-fetched-data.json`
 * beside the plugin's other daily caches, fresh while `fetchedAt` is the
 * current UTC day, so a later `/refresh-roles` the same day does not re-run
 * the subprocess.
 *
 * This module never writes `models.yml`; `providerDiscovery` only reports
 * whether a provider's entry carries a `discovery` block, so the run can note
 * the snippet the user must add once.
 *
 * Dual-runtime rule: only `node:` builtins + the `yaml` dependency; relative
 * imports with explicit `.ts` extensions (runs under Node type-stripping).
 */

import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { parse as parseYaml } from "yaml";
import { catalogFromOmpModelsJson, type CatalogEntry } from "./availability.ts";
import { isRecord } from "./guards.ts";
import { agentDir } from "./state.ts";

const execFileP = promisify(execFile);

/** The subprocess seam: `omp <args>`; tests inject a fake, production uses execFile. */
export type ExecFn = (cmd: string, args: string[]) => Promise<{ stdout: string }>;

export type ProviderRefresh = { provider: string; ok: boolean; reason?: string };

export type ProviderDiscovery = "discovery" | "static" | "unknown";

/** `omp models ls --json` can be large; the CLI uses the same ceiling. */
const MAX_BUFFER = 16 * 1024 * 1024;

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url))); // <repo>
const CACHE_PATH = join(REPO_ROOT, "cache", "provider-catalog-fetched-data.json");

type ProviderCatalogCacheFile = { fetchedAt: string; providers: Record<string, CatalogEntry[]> };

/** `<repo>/cache/provider-catalog-fetched-data.json` (gitignored, not shipped). */
export function providerCatalogCachePath(): string {
  return CACHE_PATH;
}

function reasonOf(err: unknown): string {
  if (isRecord(err)) {
    const stderr = typeof err.stderr === "string" ? err.stderr.trim() : "";
    if (stderr) return stderr.split("\n")[0] ?? stderr;
    if (typeof err.message === "string" && err.message) return err.message;
    if (typeof err.code === "string" || typeof err.code === "number") return `exit ${err.code}`;
  }
  return err instanceof Error ? err.message : String(err);
}

/** Best-effort `omp models refresh <provider>`. Never throws. */
export async function refreshProviderCatalog(provider: string, exec: ExecFn = execFileP): Promise<ProviderRefresh> {
  try {
    await exec("omp", ["models", "refresh", provider]);
    return { provider, ok: true };
  } catch (err) {
    return { provider, ok: false, reason: reasonOf(err) };
  }
}

/** `omp models ls --json`, filtered to `provider`. Never throws; `null` on a failed
 * exec or an unparseable payload (the caller degrades to the session catalog). An
 * empty array is a valid result: the provider has no rows. */
export async function getProviderCatalog(provider: string, exec: ExecFn = execFileP): Promise<CatalogEntry[] | null> {
  let stdout: string;
  try {
    ({ stdout } = await exec("omp", ["models", "ls", "--json"]));
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.models)) return null;
  return catalogFromOmpModelsJson(parsed).filter((row) => row.provider === provider);
}

function isCatalogEntry(v: unknown): v is CatalogEntry {
  return isRecord(v) && typeof v.provider === "string" && typeof v.id === "string";
}

/** The cached providers map, only when `fetchedAt` is the same UTC day (`day` is
 * `YYYY-MM-DD`); otherwise `null`. */
export function readProviderCatalogCache(day: string, path: string = CACHE_PATH): Record<string, CatalogEntry[]> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
  if (!isRecord(parsed) || typeof parsed.fetchedAt !== "string" || !isRecord(parsed.providers)) return null;
  if (parsed.fetchedAt.slice(0, 10) !== day) return null;
  const providers: Record<string, CatalogEntry[]> = {};
  for (const [provider, rows] of Object.entries(parsed.providers)) {
    if (Array.isArray(rows)) providers[provider] = rows.filter(isCatalogEntry);
  }
  return providers;
}

/** Write the daily cache: pretty-printed JSON with sorted keys (mirrors `writeOrCache`). */
export function writeProviderCatalogCache(
  day: string,
  providers: Record<string, CatalogEntry[]>,
  path: string = CACHE_PATH,
): void {
  const cache: ProviderCatalogCacheFile = { fetchedAt: `${day}T00:00:00.000Z`, providers };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, sortedStringify(cache));
}

function sortedStringify(value: object): string {
  return JSON.stringify(
    value,
    (key, v: unknown) => {
      if (key === "" || v === null || typeof v !== "object" || Array.isArray(v)) return v;
      const sorted: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) sorted[k] = val;
      return sorted;
    },
    2,
  );
}

/** Whether the provider's `models.yml` entry carries a `discovery` block. Never throws:
 * an absent/unparseable file or an unlisted provider is `"unknown"`. */
export function providerDiscovery(provider: string, modelsYmlPath?: string): ProviderDiscovery {
  let parsed: unknown;
  try {
    parsed = parseYaml(readFileSync(modelsYmlPath ?? join(agentDir(), "models.yml"), "utf8"));
  } catch {
    return "unknown";
  }
  if (!isRecord(parsed)) return "unknown";
  const providers = isRecord(parsed.providers) ? parsed.providers : parsed;
  const entry = providers[provider];
  if (!isRecord(entry)) return "unknown";
  return "discovery" in entry ? "discovery" : "static";
}
