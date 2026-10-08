/**
 * Surgical YAML editing for the omp agent config.
 *
 * The document is patched as TEXT, line-oriented: only the value tokens of
 * managed roles inside the top-level `modelRoles:` block, the managed keys
 * inside `retry:` → `fallbackChains:` and the `- name` entries of
 * `task.disabledAgents` change. Comments, blank lines, unknown keys and
 * formatting stay byte-identical. Reading back uses the same line-oriented
 * rules, so the plugin has no runtime YAML dependency (required for omp
 * marketplace installs, which never install package dependencies) and
 * read/write can never disagree. Every patch is self-checked: the patched text
 * must read back as exactly the intended state or it throws instead of
 * returning. The real `yaml` parser still validates patch output in tests
 * (dev-only dependency). Values are always emitted as double-quoted strings.
 *
 * An empty managed collection may be spelled the way a YAML serializer writes
 * it — a null scalar (`disabledAgents: null`) or a flow collection on its own
 * indented line (`fallbackChains:` then `    {}`) — and reads as empty; the
 * patch path rewrites that placeholder line into the block form. Any other
 * inline value on a managed key line is a structural surprise and throws, so
 * the plugin never silently drops something it cannot re-emit.
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

/** A line's value text: trailing ` # comment` stripped, trimmed. */
function valueText(value: string): string {
  return value.replace(/\s+#.*$/, "").trim();
}

/**
 * A YAML null *token* (`key: null`, `key: ~`) — a spelling a config writer
 * emits for an empty collection value. Not a structural surprise: it means
 * exactly what an empty block means, and the patch path rewrites the line. An
 * empty inline value is a different thing — a block header whose body follows —
 * so it is not a token.
 */
function isNullToken(value: string): boolean {
  const text = valueText(value);
  return text === "null" || text === "~" || text === "Null" || text === "NULL";
}

/**
 * The flow collection a YAML serializer puts on its own indented line for an
 * empty collection (`key:` followed by `    []` / `    {}` — Bun's
 * `YAML.stringify` does this, and omp's config writer uses it). Recognized so
 * the patch path replaces the placeholder line instead of reading it as content.
 */
function isEmptyFlow(line: string, flow: "[]" | "{}"): boolean {
  return valueText(line) === flow;
}

/**
 * A `key: value # comment` line rewritten as its block header: the `indent +
 * key + :` head keeps its own indentation and trailing comment, so replacing an
 * inline empty value with a block loses nothing but the empty value token.
 */
function keyHead(line: string): string {
  return line.slice(0, line.indexOf(":") + 1) + (line.match(/\s+#.*$/)?.[0] ?? "");
}

/**
 * Best-effort line-oriented read of the two surfaces the plugin owns: values
 * inside the top-level `modelRoles:` block and keys inside
 * `retry:` → `fallbackChains:`. Uses the same structural rules as the patch
 * path, so read and write cannot disagree on a block-style document; inline
 * flow-style blocks (`modelRoles: {}`), indented blocks and duplicate top-level
 * blocks are structural surprises and throw. The empty-collection spellings a
 * config writer emits — a null scalar (`disabledAgents: null`) or a flow
 * collection on its own indented line (`disabledAgents:` then `    []`, `    {}`
 * for an empty mapping) — are NOT surprises: they read as the empty collection.
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
    const fc = findFallbackChains(lines, retryIdx);
    if (fc.keyLine !== -1) {
      const fcEnd = blockEnd(lines, fc.keyLine, indentOf(lines[fc.keyLine]));
      for (const key of Object.keys(chainEntries(lines, fc.keyLine, fcEnd))) chainKeys.push(key);
    }
  }
  const disabledAgents: string[] = [];
  const taskIdx = findTopLevel(lines, "task");
  if (taskIdx !== -1) {
    for (const i of disabledAgentsBody(lines, taskIdx).itemLines) {
      const value = scalarValue(lines[i].trim().replace(/^-\s+/, ""));
      if (value !== null) disabledAgents.push(value);
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

/**
 * First index after `start` whose line is non-empty at an indent <= `indent` (the
 * block terminator): 0 for a top-level block, or the key's own indent for a nested
 * one, so a sibling key of the key being read ends its block rather than landing
 * inside it.
 */
function blockEnd(lines: string[], start: number, indent = 0): number {
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].length > 0 && indentOf(lines[i]) <= indent) return i;
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
  // Upserts go to the end of the block, before its terminator line, in role order —
  // replacing a serializer-emitted empty-mapping placeholder (`modelRoles:` + `  {}`).
  if (upserts.length > 0) {
    const placeholder = emptyFlowLine(out, blockIdx, "{}");
    if (placeholder === -1) out.splice(end, 0, ...upserts);
    else out.splice(placeholder, 1, ...upserts);
  }
}

type ChainEntry = { keyLine: number; itemLines: number[]; indent: number };

/** One disjoint edit on the ORIGINAL line array; applied bottom-up so positions stay valid. */
type LineEdit = { start: number; deleteCount: number; insert: string[] };

/** A managed key's line plus the line carrying an empty-collection placeholder; -1 for the latter when the body is a real block. */
type KeyBody = { keyLine: number; emptyLine: number };

/**
 * The `fallbackChains:` line (indent 2) under the top-level retry: block and the
 * line carrying its empty-collection placeholder when it holds no chain keys —
 * `keyLine` is -1 when the key is absent. An inline flow-style value on the key
 * line stays a structural surprise (the plugin writes the block form); a null
 * scalar reads as an empty mapping.
 */
function findFallbackChains(lines: string[], retryIdx: number): KeyBody {
  const retryEnd = blockEnd(lines, retryIdx);
  let keyLine = -1;
  for (let i = retryIdx + 1; i < retryEnd; i++) {
    const parsed = parseMapLine(lines[i]);
    if (!parsed || parsed.key !== "fallbackChains") continue;
    if (parsed.indent !== 2) throw new ConfigEditError(`fallbackChains: expected 2-space indent under retry:, got ${parsed.indent}`);
    if (keyLine !== -1) throw new ConfigEditError("duplicate fallbackChains: block under retry:");
    keyLine = i;
  }
  if (keyLine === -1) return { keyLine: -1, emptyLine: -1 };
  const inline = valueText(parseMapLine(lines[keyLine])!.value);
  if (inline.length > 0) {
    if (!isNullToken(inline)) throw new ConfigEditError("fallbackChains: inline value is not supported (block mapping expected)");
    return { keyLine, emptyLine: keyLine };
  }
  return { keyLine, emptyLine: emptyFlowLine(lines, keyLine, "{}") };
}

/**
 * Index of the line holding an empty flow collection (`[]`/`{}`) as the first
 * content line of `keyLine`'s body — the spelling a YAML serializer emits for an
 * empty collection — or -1 when the body starts with a real entry (or is empty).
 */
function emptyFlowLine(lines: string[], keyLine: number, flow: "[]" | "{}"): number {
  const keyIndent = indentOf(lines[keyLine]);
  const end = blockEnd(lines, keyLine, keyIndent);
  for (let i = keyLine + 1; i < end; i++) {
    const line = lines[i];
    if (line.trim().length === 0 || line.trim().startsWith("#")) continue;
    if (indentOf(line) <= keyIndent) return -1;
    return isEmptyFlow(line, flow) ? i : -1;
  }
  return -1;
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
    if (current === null && isEmptyFlow(line, "{}")) continue; // serializer-emitted empty-mapping placeholder, not content
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
  const chainLines = (chainEntriesToWrite: [string, string[]][], indent: number): string[] => {
    const block: string[] = [];
    for (const [key, values] of chainEntriesToWrite) {
      if (values.length === 0) continue;
      block.push(`${" ".repeat(indent)}${key}:`);
      for (const v of values) block.push(`${" ".repeat(indent + 2)}- ${quote(v)}`);
    }
    return block;
  };
  if (retryIdx === -1) {
    const block = chainLines(upserts, 4);
    if (block.length === 0) return;
    const at = out.length > 0 && out[out.length - 1] === "" ? out.length - 1 : out.length;
    out.splice(at, 0, "retry:", "  fallbackChains:", ...block);
    return;
  }

  const fc = findFallbackChains(out, retryIdx);
  if (fc.keyLine === -1) {
    const block = chainLines(upserts, 4);
    if (block.length === 0) return; // a prune-only patch has nothing to create
    // An empty retry block (`retry:` + `  {}`) becomes the fallbackChains header;
    // otherwise the key is inserted first in the block, ahead of any sibling key.
    const placeholder = emptyFlowLine(out, retryIdx, "{}");
    if (placeholder === -1) out.splice(retryIdx + 1, 0, "  fallbackChains:", ...block);
    else out.splice(placeholder, 1, "  fallbackChains:", ...block);
    return;
  }
  const fcEnd = blockEnd(out, fc.keyLine, indentOf(out[fc.keyLine]));
  const entries = chainEntries(out, fc.keyLine, fcEnd);

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
    const block = chainLines(appended, Object.values(entries)[0]?.indent ?? 4);
    if (fc.emptyLine === -1) {
      edits.push({ start: fcEnd, deleteCount: 0, insert: block });
    } else if (fc.emptyLine === fc.keyLine) {
      // An inline empty value becomes the block header; the chain keys follow it.
      edits.push({ start: fc.emptyLine, deleteCount: 1, insert: [keyHead(out[fc.emptyLine]), ...block] });
    } else {
      // The serializer's `{}` placeholder line becomes the first chain key.
      edits.push({ start: fc.emptyLine, deleteCount: 1, insert: block });
    }
  }

  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    out.splice(edit.start, edit.deleteCount, ...edit.insert);
  }
}

/** The `task.disabledAgents` key line, its `- name` item lines, and its empty-collection placeholder line; -1s when absent. */
type DisabledAgentsBody = { keyLine: number; itemLines: number[]; emptyLine: number };

/**
 * The `task.disabledAgents:` line (indent 2) under the top-level task: block, its
 * `- name` item lines in document order, and the line carrying its
 * empty-collection placeholder when it holds no names — `keyLine` is -1 when the
 * key is absent. An inline flow-style value on the key line stays a structural
 * surprise (the plugin writes the block form); a null scalar reads as an empty
 * sequence. Every other non-comment body line must be an item.
 */
function disabledAgentsBody(lines: string[], taskIdx: number): DisabledAgentsBody {
  const taskEnd = blockEnd(lines, taskIdx);
  let keyLine = -1;
  for (let i = taskIdx + 1; i < taskEnd; i++) {
    const parsed = parseMapLine(lines[i]);
    if (!parsed || parsed.key !== "disabledAgents") continue;
    if (parsed.indent !== 2) throw new ConfigEditError(`disabledAgents: expected 2-space indent under task:, got ${parsed.indent}`);
    if (keyLine !== -1) throw new ConfigEditError("duplicate disabledAgents: block under task:");
    keyLine = i;
  }
  if (keyLine === -1) return { keyLine: -1, itemLines: [], emptyLine: -1 };
  const inline = valueText(parseMapLine(lines[keyLine])!.value);
  if (inline.length > 0) {
    if (!isNullToken(inline)) throw new ConfigEditError("disabledAgents: inline value is not supported (block sequence expected)");
    return { keyLine, itemLines: [], emptyLine: keyLine };
  }
  const itemLines: number[] = [];
  let emptyLine = -1;
  for (let i = keyLine + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().length === 0 || line.trim().startsWith("#")) continue;
    if (indentOf(line) <= 2) break;
    if (line.trim().startsWith("- ")) itemLines.push(i);
    else if (itemLines.length === 0 && emptyLine === -1 && isEmptyFlow(line, "[]")) emptyLine = i;
    else throw new ConfigEditError(`unexpected line in disabledAgents sequence: ${JSON.stringify(line)}`);
  }
  return { keyLine, itemLines, emptyLine };
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
  const body = disabledAgentsBody(out, taskIdx);
  if (body.keyLine === -1) {
    if (adds.length === 0) return;
    const block = ["  disabledAgents:", ...adds.map((name) => `    - ${quote(name)}`)];
    // An empty task block (`task:` + `  {}`) becomes the disabledAgents header;
    // otherwise the key is inserted first in the block, ahead of any sibling key.
    const placeholder = emptyFlowLine(out, taskIdx, "{}");
    if (placeholder === -1) out.splice(taskIdx + 1, 0, ...block);
    else out.splice(placeholder, 1, ...block);
    return;
  }
  const removeSet: Record<string, true> = {};
  for (const name of removes) removeSet[name] = true;
  const present: Record<string, true> = {};
  const removeLines: number[] = [];
  for (const i of body.itemLines) {
    const value = scalarValue(out[i].trim().replace(/^-\s+/, ""));
    if (value === null) continue;
    present[value] = true;
    if (value in removeSet) removeLines.push(i);
  }
  const toAdd = adds.filter((name) => !(name in present));
  if (removeLines.length === 0 && toAdd.length === 0) return;
  const items = (indent: number) => toAdd.map((name) => `${" ".repeat(indent)}- ${quote(name)}`);
  const edits: LineEdit[] = [];
  for (const i of removeLines) edits.push({ start: i, deleteCount: 1, insert: [] });
  if (toAdd.length > 0) {
    if (body.emptyLine === body.keyLine) {
      // An inline empty value becomes the block header; the names follow it.
      edits.push({ start: body.emptyLine, deleteCount: 1, insert: [keyHead(out[body.emptyLine]), ...items(4)] });
    } else if (body.emptyLine !== -1) {
      // The serializer's `[]` placeholder line becomes the item run, at its own indent.
      edits.push({ start: body.emptyLine, deleteCount: 1, insert: items(indentOf(out[body.emptyLine])) });
    } else {
      const itemIndent = body.itemLines.length > 0 ? indentOf(out[body.itemLines[0]]) : 4;
      const insertAt = body.itemLines.length > 0 ? body.itemLines[body.itemLines.length - 1] + 1 : body.keyLine + 1;
      edits.push({ start: insertAt, deleteCount: 0, insert: items(itemIndent) });
    }
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
