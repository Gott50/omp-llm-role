import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { ARCHITECT_PROMPT_VERSION } from "../src/architect-provenance.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

test("the vendored architect prompt's header matches the exported provenance constant", () => {
  const prompt = readFileSync(`${ROOT}src/prompts/agent-creation-architect.md`, "utf8");
  const header = prompt.split("\n")[0];
  const match = /omp (\d+\.\d+\.\d+)/.exec(header);
  assert.ok(match !== null, `prompt header carries no omp version: ${header}`);
  assert.equal(match[1], ARCHITECT_PROMPT_VERSION);
});

test("docs/dev/agent-authoring.md documents the same architect prompt version", () => {
  const docs = readFileSync(`${ROOT}docs/dev/agent-authoring.md`, "utf8");
  assert.match(docs, new RegExp(`omp ${ARCHITECT_PROMPT_VERSION.replace(/\./g, "\\.")}`));
});
