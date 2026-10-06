/**
 * Surgical YAML editing for the omp agent config.
 *
 * The document is patched as TEXT, line-oriented: only the value tokens of
 * managed roles inside the top-level `modelRoles:` block and the managed keys
 * inside `retry:` → `fallbackChains:` change. Comments, blank lines, unknown
 * keys and formatting stay byte-identical. Reading back uses the same
 * line-oriented rules, so the plugin has no runtime YAML dependency (required
 * for omp marketplace installs, which never install package dependencies) and
 * read/write can never disagree. Every patch is self-checked: the patched text
 * must read back as exactly the intended state or it throws instead of
 * returning. The real `yaml` parser still validates patch output in tests
 * (dev-only dependency). Values are always emitted as double-quoted strings.
 *
 * Indentation follows the file's own style: existing chain keys keep their
 * indent; new keys match the first existing sibling (defaulting to the
 * observed house style: keys at 4, list items at 6).
 */

import { mkdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export class ConfigEditError extends Error {}

export type ConfigPatch = {
  /** managed role -> final selector (emitted double-quoted) */
  roleSelectors: Record<string, string>;
  /** roles the plugin previously managed but no longer does (disabled/removed) —
   * their `modelRoles.<role>` line is deleted so a stale pin cannot keep routing */
  roleRemovals: string[];
  /** fallbackChains key (selector without thinking suffix) -> bare selector values */
  chainUpserts: Record<string, string[]>;
  /** plugin-written chain keys to delete (key + its list items) */
  chainPrunes: string[];
  /** `task.disabledAgents` names the plugin manages: ensure present (opt-in
   * agents) / absent (their role is enabled). Other entries and their order are
   * preserved. */
  agentDisableAdds?: string[];
  agentDisableRemoves?: string[];
};

/** Strip a trailing ` # comment`, then unquote a fully-quoted scalar; null for empty/`null`/`~` scalars. */
function scalarValue(raw: string): string | null {
  const stripped = raw.replace(/\s+#.*$/, "").trim();
  if (stripped.length === 0 || stripped === "~" || stripped === "null") return null;
  return stripped.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
}

/**
 * Best-effort line-oriented read of the two surfaces the plugin owns: values
 * inside the top-level `modelRoles:` block and keys inside
 * `retry:` → `fallbackChains:`. Uses the same structural rules as the patch
 * path, so read and write cannot disagree on a block-style document; inline
 * blocks (`modelRoles: {}`), indented blocks and duplicate top-level blocks
 * are structural surprises and throw.
 */
export function parseConfig(text: string): { modelRoles: Record<string, string>; chainKeys: string[]; disabledAgents: string[] } {
  const lines = text.split("\n");
  const modelRoles: Record<string, string> = {};
  const rolesIdx = findTopLevel(lines, "modelRoles");
  if (rolesIdx !== -1) {
    const end = blockEnd(lines, rolesIdx);
    for (let i = rolesIdx + 1; i < end; i++) {
      const parsed = parseMapLine(lines[i]);
      if (!parsed) continue;
      const value = scalarValue(parsed.value);
      if (value !== null) modelRoles[parsed.key] = value;
    }
  }
  const chainKeys: string[] = [];
  const retryIdx = findTopLevel(lines, "retry");
  if (retryIdx !== -1) {
    const fcIdx = findFallbackChains(lines, retryIdx);
    if (fcIdx !== -1) {
      for (const key of Object.keys(chainEntries(lines, fcIdx, blockEnd(lines, fcIdx)))) chainKeys.push(key);
    }
  }
  const disabledAgents: string[] = [];
  const taskIdx = findTopLevel(lines, "task");
  if (taskIdx !== -1) {
    const daIdx = findDisabledAgents(lines, taskIdx);
    if (daIdx !== -1) {
      for (const i of sequenceItemLines(lines, daIdx)) {
        const value = scalarValue(lines[i].trim().replace(/^-\s+/, ""));
        if (value !== null) disabledAgents.push(value);
      }
    }
  }
  return { modelRoles, chainKeys, disabledAgents };
}

function indentOf(line: string): number {
  let n = 0;
  while (line[n] === " ") n++;
  return n;
}

/** Indexes of exact `key:` lines at top level. Throws on indented duplicates with no top-level home, on inline values, and on duplicates. */
function findTopLevel(lines: string[], key: string): number {
  const exact: number[] = [];
  const indented: number[] = [];
  const inline: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === `${key}:`) exact.push(i);
    else if (indentOf(lines[i]) === 0 && lines[i].startsWith(`${key}:`)) inline.push(i);
    else if (lines[i].trim() === `${key}:` && indentOf(lines[i]) > 0) indented.push(i);
  }
  if (inline.length > 0) throw new ConfigEditError(`${key}: inline value is not supported (block mapping expected)`);
  if (exact.length > 1) throw new ConfigEditError(`multiple top-level ${key}: blocks`);
  if (exact.length === 1) return exact[0];
  if (indented.length > 0) throw new ConfigEditError(`${key}: found at non-top-level indent only`);
  return -1;
}

/** Reject flow-style/JSON documents before patching: every top-level line must be a block-style `key:` line. */
function assertTopLevelBlockStyle(lines: string[]): void {
  for (const line of lines) {
    if (line.length === 0 || indentOf(line) > 0) continue;
    if (line.startsWith("#") || line === "---" || line === "...") continue;
    if (/^[{\["']/.test(line) || line.startsWith("- ") || !line.includes(":")) {
      throw new ConfigEditError(`config is not block-style YAML at the top level: ${JSON.stringify(line)}`);
    }
  }
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
  assertTopLevelBlockStyle(lines);
  const before = parseConfig(configText);

  const out = [...lines];
  patchModelRoles(out, patch.roleSelectors, patch.roleRemovals);
  patchFallbackChains(out, patch.chainUpserts, patch.chainPrunes);
  patchDisabledAgents(out, patch.agentDisableAdds ?? [], patch.agentDisableRemoves ?? []);

  // Self-check: the patched text must read back as exactly the intended state
  // (replaces the former yaml re-parse; the dev-only yaml dependency still
  // validates every fixture in tests/config-edit.test.ts).
  const patched = out.join("\n");
  const after = parseConfig(patched);
  for (const [role, selector] of Object.entries(patch.roleSelectors)) {
    if (after.modelRoles[role] !== selector) {
      throw new ConfigEditError(`patch self-check failed: modelRoles.${role} did not read back as written`);
    }
  }
  for (const role of patch.roleRemovals) {
    if (role in patch.roleSelectors) continue; // an upsert of the same role wins over its removal
    if (role in after.modelRoles) {
      throw new ConfigEditError(`patch self-check failed: modelRoles.${role} was not removed`);
    }
  }
  const expectedChains: Record<string, true> = {};
  for (const key of before.chainKeys) expectedChains[key] = true;
  for (const key of patch.chainPrunes) {
    if (!(key in patch.chainUpserts)) delete expectedChains[key];
  }
  for (const [key, values] of Object.entries(patch.chainUpserts)) {
    if (patch.chainPrunes.includes(key)) continue; // patchFallbackChains ignores keys in both lists
    if (values.length === 0) delete expectedChains[key];
    else expectedChains[key] = true;
  }
  const afterChains: Record<string, true> = {};
  for (const key of after.chainKeys) afterChains[key] = true;
  const expectedKeys = Object.keys(expectedChains);
  if (expectedKeys.length !== after.chainKeys.length || expectedKeys.some((key) => !(key in afterChains))) {
    throw new ConfigEditError("patch self-check failed: fallbackChains keys did not read back as written");
  }
  const afterDisabled: Record<string, true> = {};
  for (const name of after.disabledAgents) afterDisabled[name] = true;
  for (const name of patch.agentDisableAdds ?? []) {
    if (!(name in afterDisabled)) throw new ConfigEditError(`patch self-check failed: task.disabledAgents did not gain ${name}`);
  }
  for (const name of patch.agentDisableRemoves ?? []) {
    if (name in afterDisabled) throw new ConfigEditError(`patch self-check failed: task.disabledAgents still lists ${name}`);
  }
  return patched;
}

function patchModelRoles(out: string[], roleSelectors: Record<string, string>, roleRemovals: string[]): void {
  const roles = Object.entries(roleSelectors);
  const blockIdx = findTopLevel(out, "modelRoles");
  if (blockIdx === -1) {
    if (roles.length === 0) return;
    // Insert before the trailing "" element (text ends with \n) so the block joins cleanly.
    const at = out.length > 0 && out[out.length - 1] === "" ? out.length - 1 : out.length;
    out.splice(at, 0, "modelRoles:", ...roles.map(([role, selector]) => `  ${role}: ${quote(selector)}`));
    return;
  }
  let end = blockEnd(out, blockIdx);
  // Roles that left the managed set: delete their line so a stale pin cannot keep
  // routing (a disabled role must stop resolving `@<role>`).
  const removals = new Set(roleRemovals);
  const removeLines: number[] = [];
  for (let i = blockIdx + 1; i < end; i++) {
    const parsed = parseMapLine(out[i]);
    if (parsed && removals.has(parsed.key)) removeLines.push(i);
  }
  for (const i of removeLines.sort((a, b) => b - a)) out.splice(i, 1);
  end -= removeLines.length;
  const upserts: string[] = [];
  for (const [role, selector] of roles) {
    const hits: number[] = [];
    for (let i = blockIdx + 1; i < end; i++) {
      const parsed = parseMapLine(out[i]);
      if (parsed && parsed.key === role) hits.push(i);
    }
    if (hits.length > 1) throw new ConfigEditError(`role ${role}: duplicate line in modelRoles block`);
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

/** Index of the `fallbackChains:` line (indent 2) under the top-level retry: block; -1 when absent. */
function findFallbackChains(lines: string[], retryIdx: number): number {
  const retryEnd = blockEnd(lines, retryIdx);
  let fcIdx = -1;
  for (let i = retryIdx + 1; i < retryEnd; i++) {
    const parsed = parseMapLine(lines[i]);
    if (parsed && parsed.key === "fallbackChains") {
      if (parsed.indent !== 2) throw new ConfigEditError(`fallbackChains: expected 2-space indent under retry:, got ${parsed.indent}`);
      if (parsed.value.replace(/\s+#.*$/, "").trim().length > 0) throw new ConfigEditError("fallbackChains: inline value is not supported (block mapping expected)");
      if (fcIdx !== -1) throw new ConfigEditError("duplicate fallbackChains: block under retry:");
      fcIdx = i;
    }
  }
  return fcIdx;
}

/**
 * Chain keys (indent > 2) and their list-item lines inside the fallbackChains
 * block, in document order. Every non-comment line must be a key line or belong
 * to the preceding key's item run — anything else is a structural surprise.
 */
function chainEntries(lines: string[], fcIdx: number, fcEnd: number): Record<string, ChainEntry> {
  const entries: Record<string, ChainEntry> = {};
  let current: ChainEntry | null = null;
  for (let i = fcIdx + 1; i < fcEnd; i++) {
    const line = lines[i];
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
  return entries;
}

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

  let fcIdx = findFallbackChains(out, retryIdx);
  if (fcIdx === -1) {
    out.splice(retryIdx + 1, 0, "  fallbackChains:");
    fcIdx = retryIdx + 1;
  }
  const fcEnd = blockEnd(out, fcIdx);
  const entries = chainEntries(out, fcIdx, fcEnd);

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

/** Index of the `disabledAgents:` line (indent 2) under the top-level task: block; -1 when absent. */
function findDisabledAgents(lines: string[], taskIdx: number): number {
  const taskEnd = blockEnd(lines, taskIdx);
  let idx = -1;
  for (let i = taskIdx + 1; i < taskEnd; i++) {
    const parsed = parseMapLine(lines[i]);
    if (parsed && parsed.key === "disabledAgents") {
      if (parsed.indent !== 2) throw new ConfigEditError(`disabledAgents: expected 2-space indent under task:, got ${parsed.indent}`);
      if (parsed.value.replace(/\s+#.*$/, "").trim().length > 0) throw new ConfigEditError("disabledAgents: inline value is not supported (block sequence expected)");
      if (idx !== -1) throw new ConfigEditError("duplicate disabledAgents: block under task:");
      idx = i;
    }
  }
  return idx;
}

/** Line indexes of the `- item` entries under a sequence key, in document order. */
function sequenceItemLines(lines: string[], keyIdx: number): number[] {
  const items: number[] = [];
  for (let i = keyIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().length === 0 || line.trim().startsWith("#")) continue;
    if (indentOf(line) <= 2) break;
    if (line.trim().startsWith("- ")) items.push(i);
    else throw new ConfigEditError(`unexpected line in disabledAgents sequence: ${JSON.stringify(line)}`);
  }
  return items;
}

/**
 * Add/remove names in `task.disabledAgents`, preserving every other entry and
 * its order. Creates the `task:` block (or the `disabledAgents:` key) when the
 * names to add have no home yet; a removal with no block is a no-op.
 */
function patchDisabledAgents(out: string[], adds: string[], removes: string[]): void {
  if (adds.length === 0 && removes.length === 0) return;
  const taskIdx = findTopLevel(out, "task");
  if (taskIdx === -1) {
    if (adds.length === 0) return;
    const block = ["task:", "  disabledAgents:", ...adds.map((name) => `    - ${quote(name)}`)];
    const at = out.length > 0 && out[out.length - 1] === "" ? out.length - 1 : out.length;
    out.splice(at, 0, ...block);
    return;
  }
  const daIdx = findDisabledAgents(out, taskIdx);
  if (daIdx === -1) {
    if (adds.length === 0) return;
    out.splice(taskIdx + 1, 0, "  disabledAgents:", ...adds.map((name) => `    - ${quote(name)}`));
    return;
  }
  const itemLines = sequenceItemLines(out, daIdx);
  const removeSet: Record<string, true> = {};
  for (const name of removes) removeSet[name] = true;
  const present: Record<string, true> = {};
  const removeLines: number[] = [];
  for (const i of itemLines) {
    const value = scalarValue(out[i].trim().replace(/^-\s+/, ""));
    if (value === null) continue;
    present[value] = true;
    if (value in removeSet) removeLines.push(i);
  }
  const toAdd = adds.filter((name) => !(name in present));
  if (removeLines.length === 0 && toAdd.length === 0) return;
  const edits: LineEdit[] = [];
  for (const i of removeLines) edits.push({ start: i, deleteCount: 1, insert: [] });
  if (toAdd.length > 0) {
    const itemIndent = itemLines.length > 0 ? indentOf(out[itemLines[0]]) : 4;
    const insertAt = itemLines.length > 0 ? itemLines[itemLines.length - 1] + 1 : daIdx + 1;
    edits.push({ start: insertAt, deleteCount: 0, insert: toAdd.map((name) => `${" ".repeat(itemIndent)}- ${quote(name)}`) });
  }
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    out.splice(edit.start, edit.deleteCount, ...edit.insert);
  }
}

/**
 * Atomic write: re-stat mtime first — a changed mtime means config.yml moved
 * underneath us and the caller must re-read and recompute ("conflict"). Writes
 * a temp file in the same directory and renames over the target. Creates the
 * target's directory when missing: the project scope writes into
 * `<cwd>/.omp/plugins/`, which omp does not create until something writes there.
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
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(tmp, patchedText);
  renameSync(tmp, path);
  return "written";
}
