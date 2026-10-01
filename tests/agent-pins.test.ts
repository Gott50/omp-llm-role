import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { discoverAgentPins, parseAgentPin } from "../src/agent-pins.ts";

function frontmatter(model: string): string {
  return `---\nname: x\ndescription: d\nmodel: ${model}\ntools: [read]\n---\n\nBody.\n`;
}

test("parseAgentPin takes the first @role in the model chain", () => {
  assert.equal(parseAgentPin(frontmatter('"@designer, @default"')), "designer");
  assert.equal(parseAgentPin(frontmatter('"@a, @b"')), "a");
});

test("parseAgentPin returns null for a literal model id", () => {
  assert.equal(parseAgentPin(frontmatter("openrouter/org/x")), null);
});

test("parseAgentPin returns null when there is no model line", () => {
  assert.equal(parseAgentPin("---\nname: x\ndescription: d\n---\n\nBody.\n"), null);
});

test("parseAgentPin ignores a model line outside the frontmatter", () => {
  assert.equal(parseAgentPin("---\nname: x\n---\n\nmodel: \"@designer, @default\"\n"), null);
});

function writeAgent(dir: string, name: string, model: string): void {
  writeFileSync(join(dir, `${name}.md`), frontmatter(model));
}

test("discoverAgentPins scans shipped, user and project dirs", () => {
  const shipped = mkdtempSync(join(tmpdir(), "pins-shipped-"));
  const user = mkdtempSync(join(tmpdir(), "pins-user-"));
  const project = mkdtempSync(join(tmpdir(), "pins-project-"));
  writeAgent(shipped, "designer", '"@designer, @default"');
  writeAgent(user, "myagent", '"@myrole, @default"');
  writeAgent(project, "projagent", '"@projrole, @default"');

  const pins = discoverAgentPins({ shippedDir: shipped, userDir: user, projectDir: project });
  const byAgent = Object.fromEntries(pins.map((p) => [p.agent, p]));
  assert.deepEqual(byAgent.designer, { agent: "designer", role: "designer", scope: "plugin" });
  assert.deepEqual(byAgent.myagent, { agent: "myagent", role: "myrole", scope: "user" });
  assert.deepEqual(byAgent.projagent, { agent: "projagent", role: "projrole", scope: "project" });
});

test("discoverAgentPins resolves duplicate names to the most specific scope", () => {
  const shipped = mkdtempSync(join(tmpdir(), "pins-shipped-"));
  const user = mkdtempSync(join(tmpdir(), "pins-user-"));
  const project = mkdtempSync(join(tmpdir(), "pins-project-"));
  writeAgent(shipped, "dup", '"@shippedrole, @default"');
  writeAgent(user, "dup", '"@userrole, @default"');
  writeAgent(project, "dup", '"@projectrole, @default"');

  const pins = discoverAgentPins({ shippedDir: shipped, userDir: user, projectDir: project });
  assert.deepEqual(pins, [{ agent: "dup", role: "projectrole", scope: "project" }]);
});

test("discoverAgentPins ignores non-.md files, reserved names and missing dirs", () => {
  const shipped = mkdtempSync(join(tmpdir(), "pins-shipped-"));
  writeAgent(shipped, "main", '"@mainrole, @default"');
  writeAgent(shipped, "sub", '"@subrole, @default"');
  writeFileSync(join(shipped, "notes.txt"), frontmatter('"@txtrole, @default"'));
  writeAgent(shipped, "real", '"@realrole, @default"');

  const pins = discoverAgentPins({ shippedDir: shipped, userDir: join(shipped, "nope"), projectDir: null });
  assert.deepEqual(pins, [{ agent: "real", role: "realrole", scope: "plugin" }]);
});
