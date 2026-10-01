import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parse as parseYaml } from "yaml";
import { ConfigEditError, parseConfig, patchConfig, writeConfigAtomic } from "../src/config-edit.ts";

const COMMENTED_CONFIG = `# header comment
modelRoles:
  # role comments survive
  default: openrouter/org/old   # trailing comment
  custom: something-else
other: value
retry:
  fallbackChains:
    openrouter/owner/key:
      - openrouter/a
      - openrouter/b
tail: true
`;

test("noop patch returns byte-identical text", () => {
  const out = patchConfig(COMMENTED_CONFIG, { roleSelectors: {}, roleRemovals: [], chainUpserts: {}, chainPrunes: [] });
  assert.equal(out, COMMENTED_CONFIG);
});

test("managed role value replaced in place; every other line byte-identical", () => {
  const out = patchConfig(COMMENTED_CONFIG, {
    roleSelectors: { default: "openrouter/org/new" },
    roleRemovals: [],
    chainUpserts: {},
    chainPrunes: [],
  });
  const inLines = COMMENTED_CONFIG.split("\n");
  const outLines = out.split("\n");
  assert.equal(outLines.length, inLines.length);
  for (let i = 0; i < inLines.length; i++) {
    if (inLines[i].startsWith("  default:")) continue;
    assert.equal(outLines[i], inLines[i], `line ${i + 1} changed unexpectedly`);
  }
  assert.equal(outLines[3], '  default: "openrouter/org/new"');
  const reparsed = parseConfig(out);
  assert.equal(reparsed.modelRoles.default, "openrouter/org/new");
  assert.equal(reparsed.modelRoles.custom, "something-else");
});

test("missing role upserted at the end of the modelRoles block, quoted, 2-space", () => {
  const out = patchConfig(COMMENTED_CONFIG, {
    roleSelectors: { added: "openrouter/org/x" },
    roleRemovals: [],
    chainUpserts: {},
    chainPrunes: [],
  });
  const lines = out.split("\n");
  const addedIdx = lines.indexOf('  added: "openrouter/org/x"');
  assert.ok(addedIdx > 0);
  assert.ok(addedIdx < lines.indexOf("other: value"), "upsert must stay inside the modelRoles block");
  assert.equal(parseConfig(out).modelRoles.added, "openrouter/org/x");
});

test("chain key replaced in place, never duplicated; owner items replaced", () => {
  const out = patchConfig(COMMENTED_CONFIG, {
    roleSelectors: {}, roleRemovals: [],
    chainUpserts: { "openrouter/owner/key": ["openrouter/c", "openrouter/d"] },
    chainPrunes: [],
  });
  const lines = out.split("\n");
  assert.equal(lines.filter((l) => l.trim() === "openrouter/owner/key:").length, 1);
  assert.ok(lines.includes("    openrouter/owner/key:")); // key line byte-identical
  const doc = parseConfig(out);
  assert.deepEqual(doc.chainKeys, ["openrouter/owner/key"]);
  // items re-quoted, in place, before the untouched tail key
  assert.ok(out.includes('      - "openrouter/c"'));
  assert.ok(!out.includes("- openrouter/a"));
  assert.ok(lines.indexOf("tail: true") > lines.indexOf("fallbackChains:"));
});

test("pruned chain key removed with its items", () => {
  const out = patchConfig(COMMENTED_CONFIG, {
    roleSelectors: {}, roleRemovals: [],
    chainUpserts: {},
    chainPrunes: ["openrouter/owner/key"],
  });
  assert.ok(!out.includes("openrouter/owner/key"));
  assert.ok(out.includes("retry:"));
  assert.ok(out.includes("  fallbackChains:"));
  const doc = parseConfig(out);
  assert.deepEqual(doc.chainKeys, []);
});

test("a role that left the managed set is removed from modelRoles", () => {
  const out = patchConfig(COMMENTED_CONFIG, {
    roleSelectors: {},
    roleRemovals: ["custom"],
    chainUpserts: {},
    chainPrunes: [],
  });
  assert.ok(!out.includes("custom:"));
  assert.ok(out.includes("default: openrouter/org/old"));
  assert.ok(out.includes("# role comments survive"));
  assert.deepEqual(Object.keys(parseConfig(out).modelRoles), ["default"]);
});

test("disabledAgents: added to an existing task block, other keys and entries preserved", () => {
  const config = `task:
  isolation:
    enabled: true
  disabledAgents:
    - "other-agent"
  enableLsp: true
tail: true
`;
  const out = patchConfig(config, {
    roleSelectors: {}, roleRemovals: [], chainUpserts: {}, chainPrunes: [],
    agentDisableAdds: ["designer"],
  });
  const doc = parseYaml(out) as { task: { disabledAgents: string[]; isolation: { enabled: boolean }; enableLsp: boolean } };
  assert.deepEqual(doc.task.disabledAgents, ["other-agent", "designer"]);
  assert.equal(doc.task.isolation.enabled, true);
  assert.equal(doc.task.enableLsp, true);
  assert.deepEqual(parseConfig(out).disabledAgents, ["other-agent", "designer"]);
});

test("disabledAgents: removed in place, other entries preserved", () => {
  const config = `task:
  disabledAgents:
    - "designer"
    - "other-agent"
tail: true
`;
  const out = patchConfig(config, {
    roleSelectors: {}, roleRemovals: [], chainUpserts: {}, chainPrunes: [],
    agentDisableRemoves: ["designer"],
  });
  assert.deepEqual(parseConfig(out).disabledAgents, ["other-agent"]);
  assert.ok(out.includes("tail: true"));
});

test("disabledAgents: task block created when absent", () => {
  const out = patchConfig("modelRoles:\n  default: a\n", {
    roleSelectors: {}, roleRemovals: [], chainUpserts: {}, chainPrunes: [],
    agentDisableAdds: ["designer"],
  });
  assert.deepEqual(parseConfig(out).disabledAgents, ["designer"]);
  const doc = parseYaml(out) as { task: { disabledAgents: string[] } };
  assert.deepEqual(doc.task.disabledAgents, ["designer"]);
});

test("disabledAgents: already-correct state is a byte-identical no-op", () => {
  const config = `task:
  disabledAgents:
    - "designer"
`;
  const out = patchConfig(config, {
    roleSelectors: {}, roleRemovals: [], chainUpserts: {}, chainPrunes: [],
    agentDisableAdds: ["designer"],
  });
  assert.equal(out, config);
});

test("disabledAgents: inline value is a structural surprise", () => {
  assert.throws(
    () => patchConfig("task:\n  disabledAgents: []\n", {
      roleSelectors: {}, roleRemovals: {}, chainUpserts: {}, chainPrunes: [],
      agentDisableAdds: ["designer"],
    }),
    ConfigEditError,
  );
});

test("missing retry block is created at the end (house style: keys 4, items 6)", () => {
  const config = "modelRoles:\n  default: openrouter/org/a\n";
  const out = patchConfig(config, {
    roleSelectors: {}, roleRemovals: [],
    chainUpserts: { "openrouter/org/a": ["openrouter/org/b"] },
    chainPrunes: [],
  });
  const doc = parseConfig(out);
  assert.deepEqual(doc.chainKeys, ["openrouter/org/a"]);
  assert.ok(out.includes("retry:\n  fallbackChains:\n    openrouter/org/a:\n      - \"openrouter/org/b\"\n"));
});

test("missing modelRoles block is created", () => {
  const out = patchConfig("other: value\n", {
    roleSelectors: { default: "openrouter/org/a" },
    roleRemovals: [],
    chainUpserts: {},
    chainPrunes: [],
  });
  const doc = parseConfig(out);
  assert.equal(doc.modelRoles.default, "openrouter/org/a");
  assert.ok(out.startsWith("other: value\n"));
});

test("duplicate managed role line is a structural surprise", () => {
  const config = "modelRoles:\n  default: a\n  default: b\n";
  assert.throws(() => patchConfig(config, { roleSelectors: { default: "c" }, roleRemovals: [], chainUpserts: {}, chainPrunes: [] }), ConfigEditError);
});

test("indented modelRoles block is a structural surprise", () => {
  const config = "top:\n  modelRoles:\n    default: a\n";
  assert.throws(() => patchConfig(config, { roleSelectors: { default: "c" }, roleRemovals: [], chainUpserts: {}, chainPrunes: [] }), ConfigEditError);
});

test("patched output is valid YAML (real parser) and reads back through parseConfig", () => {
  const out = patchConfig(COMMENTED_CONFIG, {
    roleSelectors: { default: "openrouter/org/new", added: "openrouter/org/x" },
    roleRemovals: [],
    chainUpserts: { "openrouter/owner/key": ["openrouter/c"], "openrouter/new/key": ["openrouter/d"] },
    chainPrunes: [],
  });
  const doc = parseYaml(out) as { modelRoles: Record<string, string>; retry: { fallbackChains: Record<string, unknown> } };
  assert.deepEqual(doc.modelRoles, { default: "openrouter/org/new", custom: "something-else", added: "openrouter/org/x" });
  assert.deepEqual(Object.keys(doc.retry.fallbackChains).sort(), ["openrouter/new/key", "openrouter/owner/key"]);
  const read = parseConfig(out);
  assert.deepEqual(read.chainKeys.sort(), ["openrouter/new/key", "openrouter/owner/key"]);
});

test("parseConfig agrees with the real yaml parser on block-style configs", () => {
  const REAL_SHAPED = `modelRoles:
  smol: openrouter/deepseek/deepseek-v4.1-flash:off
  default: "openrouter/org/model-x:auto"
  web: web/exa
modelTags:
  designer:
    name: Designer
task:
  isolation:
    enabled: true
  disabledAgents:
    - "designer"
    - other-agent
retry:
  fallbackChains:
    openrouter/org/model-x:
      - "openrouter/org/model-y"
tail: true
`;
  const patched = patchConfig(COMMENTED_CONFIG, {
    roleSelectors: { default: "openrouter/org/new", added: "openrouter/org/x" },
    roleRemovals: [],
    chainUpserts: { "openrouter/owner/key": ["openrouter/c"], "openrouter/new/key": ["openrouter/d"] },
    chainPrunes: [],
  });
  for (const text of [COMMENTED_CONFIG, REAL_SHAPED, patched]) {
    const doc = parseYaml(text) as {
      modelRoles?: Record<string, unknown>;
      retry?: { fallbackChains?: Record<string, unknown> };
      task?: { disabledAgents?: unknown[] };
    };
    const expectedRoles: Record<string, string> = {};
    for (const [key, value] of Object.entries(doc.modelRoles ?? {})) if (value != null) expectedRoles[key] = String(value);
    const expectedDisabled = (doc.task?.disabledAgents ?? []).map((v) => String(v));
    assert.deepEqual(
      parseConfig(text),
      { modelRoles: expectedRoles, chainKeys: Object.keys(doc.retry?.fallbackChains ?? {}), disabledAgents: expectedDisabled },
      `divergence on: ${JSON.stringify(text)}`,
    );
  }
});

test("flow-style config (JSON) is rejected before patching", () => {
  const config = '{"modelRoles": {"default": "openrouter/org/a"}}\n';
  assert.throws(
    () => patchConfig(config, { roleSelectors: { default: "openrouter/org/b" }, roleRemovals: [], chainUpserts: {}, chainPrunes: [] }),
    ConfigEditError,
  );
});

test("inline modelRoles value is a structural surprise", () => {
  assert.throws(
    () => patchConfig("modelRoles: {}\n", { roleSelectors: { default: "openrouter/org/a" }, roleRemovals: [], chainUpserts: {}, chainPrunes: [] }),
    ConfigEditError,
  );
});

test("writeConfigAtomic writes atomically and detects mtime conflicts", () => {
  const dir = mkdtempSync(join(tmpdir(), "llm-role-write-"));
  const path = join(dir, "config.yml");
  writeFileSync(path, "a: 1\n");
  const mtime = statSync(path).mtimeMs;
  assert.equal(writeConfigAtomic(path, "a: 2\n", mtime), "written");
  assert.equal(readFileSync(path, "utf8"), "a: 2\n");
  assert.equal(readdirSync(dir).filter((f) => f.includes("llm-role-tmp")).length, 0);

  // File changed after the caller read it -> conflict, target untouched.
  const mtime2 = statSync(path).mtimeMs;
  writeFileSync(path, "a: 3\n");
  utimesSync(path, new Date(Date.now() + 5000), new Date(Date.now() + 5000)); // force a distinct mtime
  assert.equal(writeConfigAtomic(path, "a: 4\n", mtime2), "conflict");
  assert.equal(readFileSync(path, "utf8"), "a: 3\n");

  // Absent at read time and still absent -> create is allowed.
  const missing = join(dir, "absent.yml");
  assert.equal(writeConfigAtomic(missing, "a: 1\n", 0), "written");
  // Absent at read time but present now -> conflict.
  assert.equal(writeConfigAtomic(missing, "a: 2\n", 0), "conflict");
});
