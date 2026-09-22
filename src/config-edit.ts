/**
 * Surgical YAML editing for the omp agent config (SPEC §8.1, decision #4).
 *
 * The document is patched as TEXT, line-oriented: only the value tokens of
 * managed roles inside the top-level `modelRoles:` block and the managed keys
 * inside `retry:` → `fallbackChains:` change. Comments, blank lines, unknown
 * keys and formatting stay byte-identical. The patched text is re-parsed with
 * the `yaml` parser before it is ever returned — a patch that does not parse
 * throws instead of writing. Values are always emitted as double-quoted strings.
 *
 * Indentation follows the file's own style: existing chain keys keep their
 * indent; new keys match the first existing sibling (defaulting to the
 * observed house style: keys at 4, list items at 6).
 */

import { renameSync, statSync, writeFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { isRecord } from "./guards.ts";

export class ConfigEditError extends Error {}

export type ConfigPatch = {
  /** managed role -> final selector (emitted double-quoted) */
  roleSelectors: Record<string, string>;
  /** fallbackChains key (selector without thinking suffix) -> bare selector values */
  chainUpserts: Record<string, string[]>;
  /** plugin-written chain keys to delete (key + its list items) */
  chainPrunes: string[];
};

export function parseConfig(text: string): { modelRoles: Record<string, string>; chainKeys: string[] } {
  let doc: unknown;
  try {
    doc = parseYaml(text);
  } catch (err) {
    throw new ConfigEditError(`config does not parse: ${err instanceof Error ? err.message : err}`);
  }
  if (doc == null) doc = {};
  if (!isRecord(doc)) throw new ConfigEditError("config root is not a mapping");
  const modelRoles = isRecord(doc.modelRoles) ? doc.modelRoles : {};
  const values: Record<string, string> = {};
  for (const [k, v] of Object.entries(modelRoles)) if (v != null) values[k] = String(v);
  const retry = isRecord(doc.retry) ? doc.retry : {};
  const chains = isRecord(retry.fallbackChains) ? retry.fallbackChains : {};
  return { modelRoles: values, chainKeys: Object.keys(chains) };
}

function indentOf(line: string): number {
  let n = 0;
  while (line[n] === " ") n++;
  return n;
}

/** Indexes of exact `key:` lines at top level. Throws on indented duplicates with no top-level home. */
function findTopLevel(lines: string[], key: string): number {
  const exact: number[] = [];
  const indented: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === `${key}:`) exact.push(i);
    else if (lines[i].trim() === `${key}:` && indentOf(lines[i]) > 0) indented.push(i);
  }
  if (exact.length > 1) throw new ConfigEditError(`multiple top-level ${key}: blocks`);
  if (exact.length === 1) return exact[0];
  if (indented.length > 0) throw new ConfigEditError(`${key}: found at non-top-level indent only`);
  return -1;
}

/** First index after `start` whose line is non-empty at indent 0 (the block terminator). */
function blockEnd(lines: string[], start: number): number {
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].length > 0 && indentOf(lines[i]) === 0) return i;
  }
  return lines.length;
}

/** `key: value` -> { indent, key (unquoted), value }; null for comments, blanks, list items. */
function parseMapLine(line: string): { indent: number; key: string; value: string } | null {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.startsWith("#") || trimmed.startsWith("- ")) return null;
  const indent = indentOf(line);
  const colon = line.indexOf(":", indent);
  if (colon === -1) return null;
  const key = line.slice(indent, colon).trim().replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
  return { indent, key, value: line.slice(colon + 1).trim() };
}

function quote(value: string): string {
  return `"${value}"`;
}

export function patchConfig(configText: string, patch: ConfigPatch): string {
  const lines = configText.split("\n");
  const out = [...lines];

  patchModelRoles(out, patch.roleSelectors);
  patchFallbackChains(out, patch.chainUpserts, patch.chainPrunes);

  const patched = out.join("\n");
  try {
    parseYaml(patched);
  } catch (err) {
    throw new ConfigEditError(`patched config does not parse (no write): ${err instanceof Error ? err.message : err}`);
  }
  return patched;
}

function patchModelRoles(out: string[], roleSelectors: Record<string, string>): void {
  const roles = Object.entries(roleSelectors);
  const blockIdx = findTopLevel(out, "modelRoles");
  if (blockIdx === -1) {
    if (roles.length === 0) return;
    // Insert before the trailing "" element (text ends with \n) so the block joins cleanly.
    const at = out.length > 0 && out[out.length - 1] === "" ? out.length - 1 : out.length;
    out.splice(at, 0, "modelRoles:", ...roles.map(([role, selector]) => `  ${role}: ${quote(selector)}`));
    return;
  }
  const end = blockEnd(out, blockIdx);
  const upserts: string[] = [];
  for (const [role, selector] of roles) {
    const hits: number[] = [];
    for (let i = blockIdx + 1; i < end; i++) {
      const parsed = parseMapLine(out[i]);
      if (parsed && parsed.key === role) hits.push(i);
    }
    if (hits.length === 1) {
      const i = hits[0];
      if (indentOf(out[i]) !== 2) throw new ConfigEditError(`role ${role}: expected 2-space indent in modelRoles block`);
      // Semantic no-op: the line already carries this selector (any quoting/comment style) —
      // leave the line byte-identical so unchanged runs produce zero diffs.
      const parsed = parseMapLine(out[i]);
      const currentValue = (parsed?.value ?? "").replace(/\s+#.*$/, "").replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
      if (currentValue !== selector) out[i] = `  ${role}: ${quote(selector)}`;
    } else {
      upserts.push(`  ${role}: ${quote(selector)}`);
    }
  }
  // Upserts go to the end of the block, before its terminator line, in role order.
  if (upserts.length > 0) out.splice(end, 0, ...upserts);
}

type ChainEntry = { keyLine: number; itemLines: number[]; indent: number };

/** One disjoint edit on the ORIGINAL line array; applied bottom-up so positions stay valid. */
type LineEdit = { start: number; deleteCount: number; insert: string[] };

function patchFallbackChains(out: string[], chainUpserts: Record<string, string[]>, chainPrunes: string[]): void {
  const upserts = Object.entries(chainUpserts).filter(([key]) => !chainPrunes.includes(key));
  const prunes = chainPrunes.filter((key) => !(key in chainUpserts));
  if (upserts.length === 0 && prunes.length === 0) return;

  const retryIdx = findTopLevel(out, "retry");
  if (retryIdx === -1) {
    if (upserts.length === 0) return;
    const block: string[] = ["retry:", "  fallbackChains:"];
    for (const [key, values] of upserts) {
      if (values.length === 0) continue;
      block.push(`    ${key}:`);
      for (const v of values) block.push(`      - ${quote(v)}`);
    }
    const at = out.length > 0 && out[out.length - 1] === "" ? out.length - 1 : out.length;
    out.splice(at, 0, ...block);
    return;
  }

  let fcIdx = -1;
  const retryEnd = blockEnd(out, retryIdx);
  for (let i = retryIdx + 1; i < retryEnd; i++) {
    const parsed = parseMapLine(out[i]);
    if (parsed && parsed.key === "fallbackChains") {
      if (parsed.indent !== 2) throw new ConfigEditError(`fallbackChains: expected 2-space indent under retry:, got ${parsed.indent}`);
      if (fcIdx !== -1) throw new ConfigEditError("duplicate fallbackChains: block under retry:");
      fcIdx = i;
    }
  }
  if (fcIdx === -1) {
    out.splice(retryIdx + 1, 0, "  fallbackChains:");
    fcIdx = retryIdx + 1;
  }
  const fcEnd = blockEnd(out, fcIdx);
  // Map chain keys (indent > 2) and their list items inside the fallbackChains block.
  const entries: Record<string, ChainEntry> = {};
  let current: ChainEntry | null = null;
  for (let i = fcIdx + 1; i < fcEnd; i++) {
    const line = out[i];
    if (line.trim().length === 0 || line.trim().startsWith("#")) continue;
    const parsed = parseMapLine(line);
    if (parsed && parsed.indent > 2) {
      if (parsed.indent % 2 !== 0) throw new ConfigEditError(`odd indent (${parsed.indent}) in fallbackChains block`);
      if (parsed.key in entries) throw new ConfigEditError(`duplicate chain key ${parsed.key} in fallbackChains block`);
      current = { keyLine: i, itemLines: [], indent: parsed.indent };
      entries[parsed.key] = current;
    } else if (current) {
      current.itemLines.push(i);
    } else {
      throw new ConfigEditError(`unexpected line in fallbackChains block: ${JSON.stringify(line)}`);
    }
  }

  // Collect disjoint edits on original coordinates: prunes delete; upserts replace an
  // existing key's item run (or delete the key when the new chain is empty); new keys
  // append at the block end, matching the first existing sibling's indent.
  const edits: LineEdit[] = [];
  for (const key of prunes) {
    const entry = entries[key];
    if (entry) edits.push({ start: entry.keyLine, deleteCount: 1 + entry.itemLines.length, insert: [] });
  }
  for (const [key, values] of upserts) {
    const entry = entries[key];
    if (!entry) continue;
    if (values.length === 0) {
      edits.push({ start: entry.keyLine, deleteCount: 1 + entry.itemLines.length, insert: [] });
      continue;
    }
    // Semantic no-op: identical item run (any quoting style) — leave the lines untouched.
    const currentItems = entry.itemLines.map((i) =>
      out[i].trim().replace(/^-\s+/, "").replace(/\s+#.*$/, "").replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1"),
    );
    if (currentItems.length === values.length && currentItems.every((v, i) => v === values[i])) continue;
    const itemIndent = entry.indent + 2;
    edits.push({
      start: entry.keyLine + 1,
      deleteCount: entry.itemLines.length,
      insert: values.map((v) => `${" ".repeat(itemIndent)}- ${quote(v)}`),
    });
  }
  const appended = upserts.filter(([key, values]) => !(key in entries) && values.length > 0);
  if (appended.length > 0) {
    const siblingIndent = Object.values(entries)[0]?.indent ?? 4;
    const block: string[] = [];
    for (const [key, values] of appended) {
      block.push(`${" ".repeat(siblingIndent)}${key}:`);
      for (const v of values) block.push(`${" ".repeat(siblingIndent + 2)}- ${quote(v)}`);
    }
    edits.push({ start: fcEnd, deleteCount: 0, insert: block });
  }

  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    out.splice(edit.start, edit.deleteCount, ...edit.insert);
  }
}

/**
 * Atomic write: re-stat mtime first — a changed mtime means config.yml moved
 * underneath us and the caller must re-read and recompute ("conflict"). Writes
 * a temp file in the same directory and renames over the target.
 */
export function writeConfigAtomic(path: string, patchedText: string, mtimeBefore: number): "written" | "conflict" {
  let mtimeNow: number | null = null;
  try {
    mtimeNow = statSync(path).mtimeMs;
  } catch {
    mtimeNow = null; // the file vanished mid-run — only writable if it was absent at read time too
  }
  const changed = mtimeNow === null ? mtimeBefore !== 0 : mtimeNow !== mtimeBefore;
  if (changed) return "conflict";
  const tmp = `${path}.llm-role-tmp`;
  writeFileSync(tmp, patchedText);
  renameSync(tmp, path);
  return "written";
}
