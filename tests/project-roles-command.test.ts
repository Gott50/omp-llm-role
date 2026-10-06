import assert from "node:assert/strict";
import { test } from "node:test";
import extension from "../src/extension.ts";

/** A minimal `ExtensionAPI` mock: records the registered command names and
 * swallows the event subscriptions. */
function mockPi(): { commands: string[]; pi: unknown } {
  const commands: string[] = [];
  const pi = {
    on: () => {},
    registerCommand: (name: string) => {
      commands.push(name);
    },
  };
  return { commands, pi };
}

test("the extension registers /project-roles alongside the other commands", () => {
  const { commands, pi } = mockPi();
  extension(pi as never);
  assert.ok(commands.includes("project-roles"), `registered: ${commands.join(", ")}`);
  // The existing commands are still registered (the import refactor did not drop them).
  for (const name of ["refresh-roles", "explore-roles", "create-agent", "remove-agent"]) {
    assert.ok(commands.includes(name), `missing ${name}; registered: ${commands.join(", ")}`);
  }
});
