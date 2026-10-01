import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

test("every relative markdown link resolves to an existing path", () => {
  const docsDir = join(ROOT, "docs");
  const docsMarkdown = readdirSync(docsDir, { recursive: true })
    .map((p) => String(p))
    .filter((p) => p.endsWith(".md"))
    .map((p) => join("docs", p))
    .filter((p) => statSync(join(ROOT, p)).isFile());

  for (const file of ["README.md", "AGENTS.md", "CHANGELOG.md", ...docsMarkdown]) {
    const abs = join(ROOT, file);
    assert.ok(existsSync(abs), `${file} is missing`);
    // Drop fenced code blocks so `](…)` inside examples is not read as a link.
    const md = readFileSync(abs, "utf8")
      .replace(/```[\s\S]*?```/g, "")
      .replace(/~~~[\s\S]*?~~~/g, "");
    for (const m of md.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const link = m[1];
      if (/^[a-z][a-z0-9+.-]*:/i.test(link)) continue; // http:, https:, mailto:, …
      if (link.startsWith("#")) continue; // same-page anchor
      const target = link.split("#")[0].split("?")[0];
      if (!target) continue;
      const resolved = resolve(dirname(abs), decodeURIComponent(target));
      assert.ok(existsSync(resolved), `${file}: link "${link}" does not resolve`);
    }
  }
});

test("no repo file references a moved doc as a live path", () => {
  // Built by concatenation so this guard does not flag its own source.
  const stale = ["SPEC", "agents-guide"].map((name) => `${name}.md`);
  // Tracked files plus untracked-but-not-ignored ones, so a new doc is guarded
  // before its first commit; gitignored caches and node_modules stay out.
  const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    cwd: ROOT,
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);

  const offenders: string[] = [];
  for (const file of files) {
    let text: string;
    try {
      text = readFileSync(join(ROOT, file), "utf8");
    } catch {
      continue; // unreadable/binary
    }
    for (const token of stale) {
      if (text.includes(token)) offenders.push(`${file}: ${token}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("CHANGELOG.md is Keep-a-Changelog shaped", () => {
  const md = readFileSync(join(ROOT, "CHANGELOG.md"), "utf8");
  assert.match(md, /^## \[1\.0\.0\]/m, "missing the ## [1.0.0] heading");
  assert.match(md, /^## \[Unreleased\]/m, "missing the ## [Unreleased] heading");

  const versions = [...md.matchAll(/^## \[([^\]]+)\](?: - (\d{4}-\d{2}-\d{2}))?/gm)];
  assert.ok(versions.length >= 2, "expected at least Unreleased + one release");
  for (const [, name, date] of versions) {
    if (name === "Unreleased") continue;
    assert.match(name, /^\d+\.\d+\.\d+$/, `bad version heading: ${name}`);
    assert.ok(date, `version heading ${name} is missing a date`);
  }

  const allowedSections: Record<string, true> = {
    Added: true,
    Changed: true,
    Deprecated: true,
    Removed: true,
    Fixed: true,
    Security: true,
  };
  for (const m of md.matchAll(/^### (.+)$/gm)) {
    assert.ok(allowedSections[m[1].trim()], `unexpected changelog section: ${m[1]}`);
  }
});

test("every package.json files entry exists on disk", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { files: string[] };
  for (const entry of pkg.files) {
    assert.ok(existsSync(join(ROOT, entry)), `package.json files entry missing: ${entry}`);
  }
});

test("README.md has no dev-only headings", () => {
  const lines = readFileSync(join(ROOT, "README.md"), "utf8").split("\n");
  const banned = [
    "## Files",
    "## Data sources",
    "## Caching",
    "## Known quirks",
    "## Current state",
    "## Releasing",
  ];
  for (const heading of banned) {
    assert.ok(
      !lines.some((line) => line.startsWith(heading)),
      `README.md still has the dev-only heading "${heading}"`,
    );
  }
});
