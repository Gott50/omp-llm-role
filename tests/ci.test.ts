import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCRIPT = join(ROOT, "scripts/release.ts");
const WORKFLOW = join(ROOT, ".github/workflows/ci.yml");
const TEST_COMMAND = /node --test tests\//;

interface Step {
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
}
interface Job {
  needs?: string | string[];
  permissions?: Record<string, string>;
  steps: Step[];
}
interface Workflow {
  on: { pull_request?: unknown; push?: { branches?: string[]; tags?: string[] } };
  jobs: Record<string, Job>;
}

function run(args: string[], cwd: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync("node", [SCRIPT, ...args], { cwd, encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

interface TreeOptions {
  version?: string;
  /** `.omp-plugin/marketplace.json` `plugins[0].version`, when it should disagree. */
  lockstep?: string;
  /** Body under `## [Unreleased]`. */
  unreleased?: string;
  /** Body under `## [<version>] - <date>`; `null` omits the section entirely. */
  released?: string | null;
}

/** A release-shaped tree: the four version fields, the CHANGELOG, the report and the report CLI. */
function makeTree(dir: string, options: TreeOptions = {}): void {
  const version = options.version ?? "1.1.0";
  const released = options.released === undefined ? "### Added\n\n- shipped\n" : options.released;
  mkdirSync(join(dir, ".omp-plugin"), { recursive: true });
  mkdirSync(join(dir, "docs"), { recursive: true });
  mkdirSync(join(dir, "src/cli"), { recursive: true });
  writeFileSync(
    join(dir, "package.json"),
    `${JSON.stringify({ name: "omp-llm-role", version, type: "module" }, null, 2)}\n`,
  );
  writeFileSync(
    join(dir, "package-lock.json"),
    `${JSON.stringify(
      { name: "omp-llm-role", version, lockfileVersion: 3, packages: { "": { name: "omp-llm-role", version } } },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(dir, ".omp-plugin/marketplace.json"),
    `${JSON.stringify(
      {
        name: "gott50-plugins",
        metadata: { version: "1.0.0" },
        plugins: [{ name: "omp-llm-role", version: options.lockstep ?? version }],
      },
      null,
      2,
    )}\n`,
  );
  const changelog = ["# Changelog", "", "## [Unreleased]", "", (options.unreleased ?? "").trim(), ""];
  if (released !== null) changelog.push(`## [${version}] - 2026-10-08`, "", released.trim(), "");
  changelog.push(
    `[Unreleased]: https://github.com/Gott50/omp-llm-role/compare/v${version}...HEAD`,
    `[${version}]: https://github.com/Gott50/omp-llm-role/releases/tag/v${version}`,
  );
  writeFileSync(join(dir, "CHANGELOG.md"), `${changelog.join("\n")}\n`);
  writeFileSync(join(dir, "docs/llm-role-rankings.md"), "# Rankings\n");
  writeFileSync(
    join(dir, "src/cli/llm-role-rank.ts"),
    'import { writeFileSync } from "node:fs";\nwriteFileSync("docs/llm-role-rankings.md", "# Rankings\\n\\nregenerated\\n");\n',
  );
}

/** A tree plus a git repo whose `origin/main` is the pushed HEAD. */
function makeRepo(options: TreeOptions = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "release-"));
  const repo = join(dir, "repo");
  const origin = join(dir, "origin.git");
  mkdirSync(repo);
  makeTree(repo, options);
  execFileSync("git", ["init", "--bare", "--initial-branch=main", origin]);
  execFileSync("git", ["init", "--initial-branch=main"], { cwd: repo });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: repo });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: repo });
  execFileSync("git", ["config", "commit.gpgsign", "false"], { cwd: repo });
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["commit", "-m", "init"], { cwd: repo });
  execFileSync("git", ["remote", "add", "origin", origin], { cwd: repo });
  execFileSync("git", ["push", "-u", "origin", "main"], { cwd: repo });
  return repo;
}

/** Everything a cut could touch: the five files, the commit count, the tags, the status. */
function snapshot(repo: string): string {
  const files = [
    "package.json",
    "package-lock.json",
    ".omp-plugin/marketplace.json",
    "CHANGELOG.md",
    "docs/llm-role-rankings.md",
  ];
  const parts = files.map((file) => `${file}\n${readFileSync(join(repo, file), "utf8")}`);
  for (const args of [["rev-list", "--count", "HEAD"], ["tag", "-l"], ["status", "--porcelain"]]) {
    parts.push(execFileSync("git", args, { cwd: repo, encoding: "utf8" }));
  }
  return parts.join("\n---\n");
}

test("the workflow gates pull requests and main pushes with both jobs", () => {
  const wf = parseYaml(readFileSync(WORKFLOW, "utf8")) as Workflow;
  assert.ok(wf.on.pull_request !== undefined, "no pull_request trigger");
  assert.deepEqual(wf.on.push?.branches, ["main"]);
  assert.ok(wf.jobs.test, "no test job");
  assert.ok(wf.jobs.release, "no release job");
  const needs = Array.isArray(wf.jobs.release.needs) ? wf.jobs.release.needs : [wf.jobs.release.needs];
  assert.ok(needs.includes("test"), "the release job does not need the test job");
});

test("the workflow runs the same test command as the pre-commit hook", () => {
  const hook = readFileSync(join(ROOT, ".githooks/pre-commit"), "utf8");
  const hookLine = hook.split("\n").find((line: string) => TEST_COMMAND.test(line));
  assert.ok(hookLine, "the pre-commit hook does not run the suite");
  const hookCommand = hookLine.replace(/^if ! /, "").replace(/ >.*$/, "").trim();

  const wf = parseYaml(readFileSync(WORKFLOW, "utf8")) as Workflow;
  const workflowCommand = wf.jobs.test.steps
    .map((step) => step.run)
    .find((command): command is string => typeof command === "string" && TEST_COMMAND.test(command));
  assert.ok(workflowCommand, "the test job does not run the suite");
  assert.equal(workflowCommand, hookCommand);
});

test("the tag trigger covers every CHANGELOG tag link and the package version", () => {
  const wf = parseYaml(readFileSync(WORKFLOW, "utf8")) as Workflow;
  const patterns = wf.on.push?.tags ?? [];
  assert.ok(patterns.length > 0, "the workflow has no tag trigger");

  const md = readFileSync(join(ROOT, "CHANGELOG.md"), "utf8");
  const tags = [...md.matchAll(/releases\/tag\/(v\d+\.\d+\.\d+)/g)].map((m) => m[1]);
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { version: string };
  tags.push(`v${pkg.version}`);
  assert.ok(tags.length >= 2, "expected at least one released tag link plus the package version");

  for (const tag of tags) {
    const covered = patterns.some((pattern) =>
      new RegExp(`^${pattern.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`).test(
        tag,
      ),
    );
    assert.ok(covered, `no tag trigger matches ${tag}`);
  }
});

test(".node-version is the file the workflow reads", () => {
  const wf = parseYaml(readFileSync(WORKFLOW, "utf8")) as Workflow;
  const setup = wf.jobs.test.steps.find((step) => step.uses?.startsWith("actions/setup-node"));
  assert.ok(setup, "the test job does not set up Node");
  assert.equal(setup?.with?.["node-version-file"], ".node-version");
  assert.match(readFileSync(join(ROOT, ".node-version"), "utf8").trim(), /^\d+\.\d+\.\d+$/);
});

test("the release job publishes over OIDC and references no npm token", () => {
  const wf = parseYaml(readFileSync(WORKFLOW, "utf8")) as Workflow;
  assert.equal(wf.jobs.release.permissions?.["id-token"], "write");
  assert.equal(wf.jobs.release.permissions?.contents, "write");
  const text = readFileSync(WORKFLOW, "utf8");
  assert.ok(!text.includes("NPM_TOKEN"), "the workflow references NPM_TOKEN");
  assert.ok(!text.includes("secrets."), "the workflow references a repository secret");
});

test("the release job runs the notes guard before publishing", () => {
  const wf = parseYaml(readFileSync(WORKFLOW, "utf8")) as Workflow;
  const runs = wf.jobs.release.steps
    .map((step) => step.run)
    .filter((command): command is string => typeof command === "string");
  const guard = runs.findIndex((command) => command.includes("scripts/release.ts notes"));
  const publish = runs.findIndex((command) => command.trim() === "npm publish");
  assert.ok(guard !== -1, "the release job does not run the notes guard");
  assert.ok(publish !== -1, "the release job does not publish");
  assert.ok(guard < publish, "the notes guard must run before npm publish");

  // The guard's output is the release body: both steps must name the same file.
  const notes = /release-notes\.md/.exec(runs[guard])?.[0];
  assert.ok(notes, "the guard does not write a notes file");
  assert.ok(
    runs.some((command) => command.includes(`--notes-file ${notes}`)),
    "gh release create does not read the guard's notes file",
  );
});

test("the four lockstep version fields agree", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { version: string };
  const lock = JSON.parse(readFileSync(join(ROOT, "package-lock.json"), "utf8")) as {
    version: string;
    packages: Record<string, { version: string }>;
  };
  const market = JSON.parse(readFileSync(join(ROOT, ".omp-plugin/marketplace.json"), "utf8")) as {
    plugins: { version: string }[];
  };
  const fields = [pkg.version, market.plugins[0].version, lock.version, lock.packages[""].version];
  assert.equal(new Set(fields).size, 1, `lockstep version fields disagree: ${fields.join(", ")}`);
});

test("no tracked file lives under cache/", () => {
  assert.equal(execFileSync("git", ["ls-files", "cache/"], { cwd: ROOT, encoding: "utf8" }).trim(), "");
});

test("due exits 0 when ## [Unreleased] has entries and 1 when it is empty", () => {
  const owed = mkdtempSync(join(tmpdir(), "release-"));
  makeTree(owed, { unreleased: "### Changed\n\n- something changed\n" });
  const yes = run(["due"], owed);
  assert.equal(yes.status, 0);
  assert.match(yes.stdout, /owed/);

  const empty = mkdtempSync(join(tmpdir(), "release-"));
  makeTree(empty, { unreleased: "" });
  const no = run(["due"], empty);
  assert.equal(no.status, 1);
  assert.match(no.stdout, /no release owed/);
});

test("notes prints exactly the section body for a valid tag", () => {
  const dir = mkdtempSync(join(tmpdir(), "release-"));
  makeTree(dir, { unreleased: "### Changed\n\n- next\n", released: "### Added\n\n- shipped\n" });
  const result = run(["notes", "v1.1.0"], dir);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "### Added\n\n- shipped\n");
});

test("notes refuses a tag that is not v<semver>", () => {
  const dir = mkdtempSync(join(tmpdir(), "release-"));
  makeTree(dir);
  const result = run(["notes", "1.1.0"], dir);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /not v<major>\.<minor>\.<patch>/);
});

test("notes refuses a tag that disagrees with the package version", () => {
  const dir = mkdtempSync(join(tmpdir(), "release-"));
  makeTree(dir);
  const result = run(["notes", "v1.2.0"], dir);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /does not match the package version/);
});

test("notes refuses a disagreeing lockstep field", () => {
  const dir = mkdtempSync(join(tmpdir(), "release-"));
  makeTree(dir, { lockstep: "1.0.0" });
  const result = run(["notes", "v1.1.0"], dir);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /lockstep version fields disagree/);
});

test("notes refuses a missing CHANGELOG heading", () => {
  const dir = mkdtempSync(join(tmpdir(), "release-"));
  makeTree(dir, { released: null });
  const result = run(["notes", "v1.1.0"], dir);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /no "## \[1\.1\.0\] - <date>" heading/);
});

test("notes refuses an empty CHANGELOG section", () => {
  const dir = mkdtempSync(join(tmpdir(), "release-"));
  makeTree(dir, { released: "" });
  const result = run(["notes", "v1.1.0"], dir);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /has no entries/);
});

test("cut bumps the four version fields, cuts the changelog, commits and tags", () => {
  const repo = makeRepo({ unreleased: "### Changed\n\n- next release\n" });
  const before = execFileSync("git", ["rev-list", "--count", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
  const result = run(["cut", "minor"], repo);
  assert.equal(result.status, 0, result.stderr);

  const pkg = JSON.parse(readFileSync(join(repo, "package.json"), "utf8")) as { version: string };
  const lock = JSON.parse(readFileSync(join(repo, "package-lock.json"), "utf8")) as {
    version: string;
    packages: Record<string, { version: string }>;
  };
  const market = JSON.parse(readFileSync(join(repo, ".omp-plugin/marketplace.json"), "utf8")) as {
    metadata: { version: string };
    plugins: { version: string }[];
  };
  assert.equal(pkg.version, "1.2.0");
  assert.equal(lock.version, "1.2.0");
  assert.equal(lock.packages[""].version, "1.2.0");
  assert.equal(market.plugins[0].version, "1.2.0");
  // The catalog's own version is deliberately not part of the lockstep set.
  assert.equal(market.metadata.version, "1.0.0");

  const md = readFileSync(join(repo, "CHANGELOG.md"), "utf8");
  const today = new Date().toISOString().slice(0, 10);
  assert.match(md, /^## \[Unreleased\]$/m);
  assert.match(md, new RegExp(`^## \\[1\\.2\\.0\\] - ${today}$`, "m"));
  assert.match(md, /^\[Unreleased\]: https:\/\/github\.com\/Gott50\/omp-llm-role\/compare\/v1\.2\.0\.\.\.HEAD$/m);
  assert.match(md, /^\[1\.2\.0\]: https:\/\/github\.com\/Gott50\/omp-llm-role\/releases\/tag\/v1\.2\.0$/m);
  assert.ok(md.indexOf("## [Unreleased]") < md.indexOf("## [1.2.0] - "), "the fresh Unreleased is not above the cut");

  assert.equal(
    execFileSync("git", ["rev-list", "--count", "HEAD"], { cwd: repo, encoding: "utf8" }).trim(),
    String(Number(before) + 1),
  );
  assert.equal(execFileSync("git", ["log", "-1", "--format=%s"], { cwd: repo, encoding: "utf8" }).trim(), "Release 1.2.0");
  assert.equal(execFileSync("git", ["cat-file", "-t", "v1.2.0"], { cwd: repo, encoding: "utf8" }).trim(), "tag");
  assert.match(readFileSync(join(repo, "docs/llm-role-rankings.md"), "utf8"), /regenerated/);
  assert.equal(execFileSync("git", ["status", "--porcelain"], { cwd: repo, encoding: "utf8" }).trim(), "");

  // Both the commit and the tag reached the origin.
  const origin = join(repo, "..", "origin.git");
  assert.equal(
    execFileSync("git", ["rev-parse", "main"], { cwd: origin, encoding: "utf8" }).trim(),
    execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim(),
  );
  assert.equal(execFileSync("git", ["cat-file", "-t", "v1.2.0"], { cwd: origin, encoding: "utf8" }).trim(), "tag");
});

test("cut --dry-run writes nothing and reports the target version", () => {
  const repo = makeRepo({ unreleased: "### Changed\n\n- next\n" });
  const before = snapshot(repo);
  const result = run(["cut", "minor", "--dry-run"], repo);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /1\.1\.0 -> 1\.2\.0/);
  assert.match(result.stdout, /changelog diff:/);
  assert.equal(snapshot(repo), before);
});

test("cut refuses a dirty tree", () => {
  const repo = makeRepo({ unreleased: "### Changed\n\n- next\n" });
  writeFileSync(join(repo, "CHANGELOG.md"), `${readFileSync(join(repo, "CHANGELOG.md"), "utf8")}\n<!-- dirty -->\n`);
  const before = snapshot(repo);
  const result = run(["cut", "minor"], repo);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /dirty/);
  assert.equal(snapshot(repo), before);
});

test("cut refuses an existing tag", () => {
  const repo = makeRepo({ unreleased: "### Changed\n\n- next\n" });
  execFileSync("git", ["tag", "-a", "v1.2.0", "-m", "existing"], { cwd: repo });
  const before = snapshot(repo);
  const result = run(["cut", "minor"], repo);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /already exists/);
  assert.equal(snapshot(repo), before);
});

test("cut refuses an empty ## [Unreleased]", () => {
  const repo = makeRepo({ unreleased: "" });
  const before = snapshot(repo);
  const result = run(["cut", "minor"], repo);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /nothing to release/);
  assert.equal(snapshot(repo), before);
});

test("cut refuses when HEAD is not origin/main", () => {
  const repo = makeRepo({ unreleased: "### Changed\n\n- next\n" });
  writeFileSync(join(repo, "docs/llm-role-rankings.md"), "# Rankings\n\nlocal only\n");
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["commit", "-m", "local only"], { cwd: repo });
  const before = snapshot(repo);
  const result = run(["cut", "minor"], repo);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /origin\/main/);
  assert.equal(snapshot(repo), before);
});
