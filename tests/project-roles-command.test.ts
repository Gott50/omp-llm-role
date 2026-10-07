import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import extension from "../src/extension.ts";
import { parseProjectRolesArgs, setupProject, type ProjectProfile, type SetupProjectOpts } from "../src/project-setup.ts";

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

test("parseProjectRolesArgs parses --feature and rejects an unknown id", () => {
  const parsed = parseProjectRolesArgs("--feature endpointCeilings,costCap --feature cachePricing");
  assert.ok(parsed.ok, parsed.ok ? "" : parsed.error);
  assert.deepEqual(parsed.features, { endpointCeilings: true, costCap: true, cachePricing: true });

  const bad = parseProjectRolesArgs("--feature katz");
  assert.equal(bad.ok, false);
  assert.match(bad.ok ? "" : bad.error, /unknown capability "katz"/);
});

test("/project-roles --feature passes the flag through to the planned roles' defs", () => {
  const root = mkdtempSync(join(tmpdir(), "project-roles-feature-"));
  const projectDir = join(root, ".omp");
  const lockPath = join(projectDir, "plugins", "omp-plugins.lock.json");
  mkdirSync(join(projectDir, "plugins"), { recursive: true });
  writeFileSync(lockPath, JSON.stringify({ plugins: { "omp-llm-role": { enabled: true } }, settings: {} }, null, 2));
  process.env.OMP_LLM_ROLE_AGENT_DIR = join(root, "global-agent-dir");

  const parsed = parseProjectRolesArgs("--feature endpointCeilings");
  assert.ok(parsed.ok, parsed.ok ? "" : parsed.error);

  const profile: ProjectProfile = {
    summary: "Python data-science repo",
    domain: "data science",
    primaryWork: ["data pipelines"],
    stack: ["Python"],
    needs: ["math"],
    roles: [{ name: "data", purpose: "build and analyze data pipelines and statistical models" }],
  };
  const opts: SetupProjectOpts = {
    projectDir,
    lockPath,
    configPath: join(projectDir, "config.yml"),
    dryRun: true,
    force: false,
    yes: true,
    features: parsed.features,
  };
  const result = setupProject(profile, opts);
  assert.ok(result.ok, result.ok ? "" : result.errors.join("; "));
  // The planned def carries the FLAG (authored), not the expanded knobs.
  assert.deepEqual(result.roles.data.features, { endpointCeilings: true });
  assert.equal(result.roles.data.filters?.tools, undefined);
});
