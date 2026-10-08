#!/usr/bin/env node
// Release cut for omp-llm-role. See docs/dev/ci.md.
//
//   due                          exit 0 when ## [Unreleased] owes a release, 1 when empty
//   notes <tag>                  verify the tag against the tree, print the release notes
//   cut <patch|minor|major> [--dry-run]
//
// Node builtins only, no dependencies. The CLI is the tested seam
// (tests/ci.test.ts); the pure functions below keep the orchestration readable.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const PACKAGE_JSON = "package.json";
const PACKAGE_LOCK = "package-lock.json";
const MARKETPLACE = ".omp-plugin/marketplace.json";
const CHANGELOG = "CHANGELOG.md";
const REPORT = "docs/llm-role-rankings.md";
const REPORT_CMD = ["src/cli/llm-role-rank.ts", "--all", "--out", REPORT];
const SECTIONS: Record<string, true> = {
  Added: true,
  Changed: true,
  Deprecated: true,
  Removed: true,
  Fixed: true,
  Security: true,
};
const VERSION_FIELD = /"version"\s*:\s*"([^"]*)"/;
const VERSION_FIELD_REPLACE = /("version"\s*:\s*")[^"]*(")/;

const read = (path: string): string => readFileSync(join(ROOT, path), "utf8");
const write = (path: string, text: string): void => writeFileSync(join(ROOT, path), text);

/** Run git, returning trimmed stdout, or null when the command fails. */
function git(args: string[]): string | null {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch {
    return null;
  }
}

/** Run git for its effect, inheriting stdio so a failure is visible. */
function gitRun(args: string[]): void {
  execFileSync("git", args, { cwd: ROOT, stdio: "inherit" });
}

/** The `"version"` value of the first version field at or after `from`. */
function versionAt(text: string, from = 0): string {
  const m = VERSION_FIELD.exec(text.slice(from));
  if (!m) throw new Error("no version field");
  return m[1];
}

/** Rewrite the first version field at or after `from`, preserving formatting. */
function setVersionAt(text: string, from: number, version: string): string {
  const head = text.slice(0, from);
  const tail = text.slice(from);
  if (!VERSION_FIELD_REPLACE.test(tail)) throw new Error("no version field");
  return head + tail.replace(VERSION_FIELD_REPLACE, `$1${version}$2`);
}

export interface VersionFiles {
  packageJson: string;
  packageLock: string;
  marketplace: string;
}

/**
 * The four lockstep version fields, in file order: `package.json` `version`,
 * `.omp-plugin/marketplace.json` `plugins[0].version`, `package-lock.json`
 * `version` and `package-lock.json` `packages[""].version`. The marketplace
 * catalog's own `metadata.version` is deliberately not part of the set.
 */
export function readVersionFields(files: VersionFiles): string[] {
  return [
    versionAt(files.packageJson),
    versionAt(files.marketplace, files.marketplace.indexOf('"plugins"')),
    versionAt(files.packageLock),
    versionAt(files.packageLock, files.packageLock.indexOf('"packages"')),
  ];
}

/** Rewrite all four lockstep version fields. */
export function rewriteVersionFields(files: VersionFiles, version: string): VersionFiles {
  const packageJson = setVersionAt(files.packageJson, 0, version);
  const marketplace = setVersionAt(files.marketplace, files.marketplace.indexOf('"plugins"'), version);
  const lockTop = setVersionAt(files.packageLock, 0, version);
  const packageLock = setVersionAt(lockTop, lockTop.indexOf('"packages"'), version);
  return { packageJson, packageLock, marketplace };
}

/** The body of a `## [<name>]` section: the lines up to the next `## [` heading or link ref. */
export function changelogSection(md: string, name: string): string | null {
  const lines = md.split("\n");
  const start = lines.findIndex((line) => line.startsWith(`## [${name}]`));
  if (start === -1) return null;
  const end = lines.findIndex(
    (line, i) => i > start && (line.startsWith("## [") || /^\[[^\]]+\]: /.test(line)),
  );
  return lines.slice(start + 1, end === -1 ? lines.length : end).join("\n").trim();
}

/** True when a section body carries at least one entry under an allowed heading. */
export function hasEntries(body: string): boolean {
  let section: string | null = null;
  for (const line of body.split("\n")) {
    const heading = /^### (.+)$/.exec(line);
    if (heading) {
      section = heading[1].trim();
      continue;
    }
    if (section !== null && SECTIONS[section] === true && line.startsWith("- ")) return true;
  }
  return false;
}

/** Rename `## [Unreleased]` to `## [<version>] - <date>`, insert a fresh one, rewrite the link refs. */
export function cutChangelog(md: string, version: string, date: string): string {
  const lines = md.split("\n");
  const heading = lines.findIndex((line) => line.startsWith("## [Unreleased]"));
  if (heading === -1) throw new Error("CHANGELOG.md has no ## [Unreleased] heading");
  lines[heading] = `## [Unreleased]\n\n## [${version}] - ${date}`;

  const ref = lines.findIndex((line) => line.startsWith("[Unreleased]: "));
  if (ref === -1) throw new Error("CHANGELOG.md has no [Unreleased] link ref");
  const base = lines[ref].slice("[Unreleased]: ".length).split("/compare/")[0];
  if (!base.startsWith("http")) throw new Error("the [Unreleased] link ref is not a compare URL");
  lines[ref] = `[Unreleased]: ${base}/compare/v${version}...HEAD`;
  lines.splice(ref + 1, 0, `[${version}]: ${base}/releases/tag/v${version}`);
  return lines.join("\n");
}

export function bumpVersion(version: string, kind: "patch" | "minor" | "major"): string {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!m) throw new Error(`not a x.y.z version: ${version}`);
  const [major, minor, patch] = m.slice(1).map(Number);
  if (kind === "major") return `${major + 1}.0.0`;
  if (kind === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

/** The changed lines between two texts, as a minimal `-`/`+` block. */
function diffLines(before: string, after: string): string[] {
  const a = before.split("\n");
  const b = after.split("\n");
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  return [...a.slice(start, endA).map((line) => `- ${line}`), ...b.slice(start, endB).map((line) => `+ ${line}`)];
}

function due(): number {
  const body = changelogSection(read(CHANGELOG), "Unreleased");
  if (body === null) {
    console.error("release due: CHANGELOG.md has no ## [Unreleased] heading.");
    return 1;
  }
  if (!hasEntries(body)) {
    console.log("no release owed: ## [Unreleased] is empty.");
    return 1;
  }
  console.log("release owed: ## [Unreleased] has entries.");
  return 0;
}

function notes(tag: string): number {
  const fail = (message: string): number => {
    console.error(`release notes: ${message}`);
    return 1;
  };
  const m = /^v(\d+\.\d+\.\d+)$/.exec(tag);
  if (!m) return fail(`tag "${tag}" is not v<major>.<minor>.<patch>.`);
  const version = m[1];

  const fields = readVersionFields({
    packageJson: read(PACKAGE_JSON),
    packageLock: read(PACKAGE_LOCK),
    marketplace: read(MARKETPLACE),
  });
  if (new Set(fields).size !== 1) return fail(`the lockstep version fields disagree: ${fields.join(", ")}.`);
  if (fields[0] !== version) return fail(`tag ${tag} does not match the package version ${fields[0]}.`);

  const md = read(CHANGELOG);
  const escaped = version.replace(/\./g, "\\.");
  if (!new RegExp(`^## \\[${escaped}\\] - \\d{4}-\\d{2}-\\d{2}$`, "m").test(md)) {
    return fail(`CHANGELOG.md has no "## [${version}] - <date>" heading.`);
  }
  const body = changelogSection(md, version);
  if (body === null || !hasEntries(body)) return fail(`the CHANGELOG section for ${version} has no entries.`);

  process.stdout.write(`${body}\n`);
  return 0;
}

function cut(kind: string, dryRun: boolean): number {
  const fail = (message: string): number => {
    console.error(`release cut: ${message}`);
    return 1;
  };
  if (kind !== "patch" && kind !== "minor" && kind !== "major") {
    return fail(`bump must be patch, minor or major (got "${kind}").`);
  }
  if ((git(["status", "--porcelain"]) ?? "") !== "") return fail("the working tree is dirty; commit or stash first.");

  const files = {
    packageJson: read(PACKAGE_JSON),
    packageLock: read(PACKAGE_LOCK),
    marketplace: read(MARKETPLACE),
  };
  const fields = readVersionFields(files);
  if (new Set(fields).size !== 1) return fail(`the lockstep version fields disagree: ${fields.join(", ")}.`);
  const current = fields[0];
  const version = bumpVersion(current, kind);
  const tag = `v${version}`;

  if (git(["rev-parse", "-q", "--verify", `refs/tags/${tag}`]) !== null) return fail(`tag ${tag} already exists.`);

  const md = read(CHANGELOG);
  const unreleased = changelogSection(md, "Unreleased");
  if (unreleased === null) return fail("CHANGELOG.md has no ## [Unreleased] heading.");
  if (!hasEntries(unreleased)) return fail("## [Unreleased] is empty; nothing to release.");

  const head = git(["rev-parse", "HEAD"]);
  const origin = git(["rev-parse", "origin/main"]);
  if (head === null || origin === null || head !== origin) {
    return fail("HEAD is not origin/main; push first so the tag points at a pushed commit.");
  }

  const date = new Date().toISOString().slice(0, 10);
  const nextMd = cutChangelog(md, version, date);
  const next = rewriteVersionFields(files, version);

  if (dryRun) {
    console.log(`release cut (dry run): ${current} -> ${version} (${kind})`);
    console.log(`  ${PACKAGE_JSON}  version ${current} -> ${version}`);
    console.log(`  ${MARKETPLACE}  plugins[0].version ${current} -> ${version}`);
    console.log(`  ${PACKAGE_LOCK}  version + packages[""].version ${current} -> ${version}`);
    console.log(`  ${CHANGELOG}  ## [Unreleased] -> ## [${version}] - ${date}`);
    console.log(`  ${REPORT}  regenerated at cut (skipped in --dry-run)`);
    console.log(`  git  commit "Release ${version}", push main, tag ${tag}, push tag`);
    console.log("changelog diff:");
    for (const line of diffLines(md, nextMd)) console.log(`  ${line}`);
    return 0;
  }

  const report = read(REPORT);
  write(PACKAGE_JSON, next.packageJson);
  write(MARKETPLACE, next.marketplace);
  write(PACKAGE_LOCK, next.packageLock);
  write(CHANGELOG, nextMd);
  try {
    execFileSync("node", REPORT_CMD, { cwd: ROOT, stdio: "inherit" });
  } catch {
    write(PACKAGE_JSON, files.packageJson);
    write(MARKETPLACE, files.marketplace);
    write(PACKAGE_LOCK, files.packageLock);
    write(CHANGELOG, md);
    write(REPORT, report);
    return fail(`regenerating ${REPORT} failed (node ${REPORT_CMD.join(" ")}); the tree was restored.`);
  }

  gitRun(["add", "--", PACKAGE_JSON, MARKETPLACE, PACKAGE_LOCK, CHANGELOG, REPORT]);
  gitRun(["commit", "-m", `Release ${version}`]);
  gitRun(["push", "origin", "main"]);
  gitRun(["tag", "-a", tag, "-m", `Release ${version}`]);
  gitRun(["push", "origin", tag]);
  console.log(`released ${version}: pushed main and tag ${tag} — the tag push publishes to npm.`);
  return 0;
}

function main(argv: string[]): number {
  const [command, ...rest] = argv;
  if (command === "due") return due();
  if (command === "notes") {
    if (rest.length !== 1) {
      console.error("usage: release.ts notes <tag>");
      return 1;
    }
    return notes(rest[0]);
  }
  if (command === "cut") {
    const kind = rest.find((arg) => !arg.startsWith("--"));
    if (kind === undefined) {
      console.error("usage: release.ts cut <patch|minor|major> [--dry-run]");
      return 1;
    }
    return cut(kind, rest.includes("--dry-run"));
  }
  console.error("usage: release.ts <due | notes <tag> | cut <patch|minor|major> [--dry-run]>");
  return 1;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
