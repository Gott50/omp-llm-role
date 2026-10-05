import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { setupProject, type ProjectProfile, type SetupProjectOpts } from "../src/project-setup.ts";
import { DEFAULT_ROLES, findProjectAnchor, projectLockPath, readPluginSettingsMap, resolveSettings } from "../src/settings.ts";

type Workspace = { root: string; projectDir: string; lockPath: string; configPath: string; agentsDir: string };

/** Temp project: `<root>/.omp` is omp's project dir, with the plugin lock file
 * under it and the project agents dir at `<root>/.omp/agents`. The global agent
 * dir is pointed at a sibling temp dir so nothing touches the real home. */
function workspace(): Workspace {
  const root = mkdtempSync(join(tmpdir(), "project-setup-"));
  const projectDir = join(root, ".omp");
  const lockPath = join(projectDir, "plugins", "omp-plugins.lock.json");
  const configPath = join(projectDir, "config.yml");
  mkdirSync(join(projectDir, "plugins"), { recursive: true });
  writeFileSync(lockPath, JSON.stringify({ plugins: { "omp-llm-role": { enabled: true } }, settings: {} }, null, 2));
  process.env.OMP_LLM_ROLE_AGENT_DIR = join(root, "global-agent-dir");
  return { root, projectDir, lockPath, configPath, agentsDir: join(projectDir, "agents") };
}

function opts(ws: Workspace, over: Partial<SetupProjectOpts> = {}): SetupProjectOpts {
  return { projectDir: ws.projectDir, lockPath: ws.lockPath, configPath: ws.configPath, dryRun: false, force: false, yes: true, ...over };
}

/** The `settings["omp-llm-role"]` map the project lock file holds. */
function projectPlugin(lockPath: string): Record<string, unknown> {
  const lock = JSON.parse(readFileSync(lockPath, "utf8")) as { settings: Record<string, Record<string, unknown>> };
  return lock.settings["omp-llm-role"];
}

const DATA_SCIENCE: ProjectProfile = {
  summary: "Python data-science repo",
  domain: "data science",
  primaryWork: ["data pipelines", "model training"],
  stack: ["Python", "pandas"],
  needs: ["math", "reasoning"],
  roles: [
    { name: "vision", purpose: "image understanding", keep: false },
    { name: "designer", purpose: "design work", keep: false },
    { name: "data", purpose: "build and analyze data pipelines and statistical models" },
  ],
};

const DOCS: ProjectProfile = {
  summary: "Documentation and marketing site",
  domain: "docs",
  primaryWork: ["write guides", "write blog posts"],
  stack: ["Markdown"],
  needs: ["writing"],
  roles: [{ name: "prose", purpose: "write blog posts and marketing copy", benchmarks: ["writing"] }],
};

const NOOP: ProjectProfile = {
  summary: "Generic software repo",
  domain: "software",
  primaryWork: ["coding"],
  stack: ["TypeScript"],
  needs: ["code"],
  roles: [],
};

test("setupProject adds a data role and drops vision/designer for a data-science repo", () => {
  const ws = workspace();
  const result = setupProject(DATA_SCIENCE, opts(ws));
  assert.ok(result.ok, result.ok ? "" : result.errors.join("; "));

  assert.deepEqual(result.dropped, ["vision", "designer"]);
  assert.deepEqual(result.added, ["data"]);
  assert.ok(result.kept.includes("default"));
  assert.equal(result.kept.includes("vision"), false);
  assert.equal(result.kept.includes("designer"), false);

  // The dropped roles are disabled in the project lock file (flat dotted keys).
  const plugin = projectPlugin(ws.lockPath);
  assert.equal(plugin["roles.vision.enabled"], false);
  assert.equal(plugin["roles.designer.enabled"], false);
  assert.equal(typeof plugin["roles.data.weights.math"], "number");

  // The new role's weights satisfy both invariants the engine divides by.
  const { settings, errors } = resolveSettings(readPluginSettingsMap({ global: ws.lockPath, project: null }));
  assert.deepEqual(errors, []);
  const weights = settings.roles.data.weights;
  const sum = Object.values(weights).reduce((total, w) => total + w, 0);
  const nonPrice = Object.entries(weights).filter(([metric]) => metric !== "price").reduce((total, [, w]) => total + w, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, `Σ = ${sum}`);
  assert.ok(Math.abs(nonPrice - (1 - weights.price)) < 1e-9, `Σ(non-price) = ${nonPrice}`);
  assert.ok(weights.price > 0 && weights.throughput > 0);
  assert.ok(settings.roles.data.required.includes("price"));
  assert.ok(settings.roles.data.required.includes("throughput"));
  assert.equal("vision" in settings.roles, false);
  assert.equal("designer" in settings.roles, false);

  // The agent landed under <project>/.omp/agents/.
  assert.equal(existsSync(join(ws.agentsDir, "data.md")), true);
  assert.deepEqual(result.agents, [join(ws.agentsDir, "data.md")]);
});

test("setupProject adds a prose role for a docs repo", () => {
  const ws = workspace();
  const result = setupProject(DOCS, opts(ws));
  assert.ok(result.ok, result.ok ? "" : result.errors.join("; "));
  assert.deepEqual(result.added, ["prose"]);
  assert.deepEqual(result.dropped, []);

  const plugin = projectPlugin(ws.lockPath);
  assert.equal(typeof plugin["roles.prose.weights.writing"], "number");
  assert.equal(existsSync(join(ws.agentsDir, "prose.md")), true);

  const { settings, errors } = resolveSettings(readPluginSettingsMap({ global: ws.lockPath, project: null }));
  assert.deepEqual(errors, []);
  assert.ok(settings.roles.prose.weights.writing > 0);
});

test("setupProject keeps the shipped set for a no-op profile", () => {
  const ws = workspace();
  const before = readFileSync(ws.lockPath, "utf8");
  const result = setupProject(NOOP, opts(ws));
  assert.ok(result.ok, result.ok ? "" : result.errors.join("; "));
  assert.deepEqual(result.kept, Object.keys(DEFAULT_ROLES));
  assert.deepEqual(result.dropped, []);
  assert.deepEqual(result.added, []);
  assert.deepEqual(result.agents, []);
  // Nothing to write: the lock file is byte-identical and no agents dir appears.
  assert.equal(readFileSync(ws.lockPath, "utf8"), before);
  assert.equal(existsSync(ws.agentsDir), false);
});

test("setupProject --dry-run writes nothing", () => {
  const ws = workspace();
  const before = readFileSync(ws.lockPath, "utf8");
  const result = setupProject(DATA_SCIENCE, opts(ws, { dryRun: true }));
  assert.ok(result.ok, result.ok ? "" : result.errors.join("; "));
  assert.deepEqual(result.added, ["data"]);
  assert.deepEqual(result.agents, [join(ws.agentsDir, "data.md")]);
  assert.equal(readFileSync(ws.lockPath, "utf8"), before);
  assert.equal(existsSync(ws.agentsDir), false);
});

test("setupProject refuses an existing project role config without --force", () => {
  const ws = workspace();
  const lock = JSON.parse(readFileSync(ws.lockPath, "utf8")) as { settings: Record<string, unknown> };
  lock.settings["omp-llm-role"] = {
    "roles.data.description": "hand-tuned",
    "roles.data.weights.math": 0.5,
    "roles.data.weights.price": 0.5,
    "roles.data.required": ["general", "price", "throughput"],
  };
  writeFileSync(ws.lockPath, JSON.stringify(lock, null, 2));
  const before = readFileSync(ws.lockPath, "utf8");

  const refused = setupProject(DATA_SCIENCE, opts(ws));
  assert.equal(refused.ok, false);
  assert.match(refused.errors.join(" "), /--force/);
  assert.equal(readFileSync(ws.lockPath, "utf8"), before);
  assert.equal(existsSync(ws.agentsDir), false);

  const forced = setupProject(DATA_SCIENCE, opts(ws, { force: true }));
  assert.ok(forced.ok, forced.ok ? "" : forced.errors.join("; "));
  assert.equal(existsSync(join(ws.agentsDir, "data.md")), true);
});

test("the project-scope read uses <cwd>/.omp, not the walk-up anchor", () => {
  const root = mkdtempSync(join(tmpdir(), "project-anchor-"));
  mkdirSync(join(root, ".git"));
  const sub = join(root, "packages", "app");
  mkdirSync(sub, { recursive: true });

  // The walk-up anchor is the repo root...
  assert.equal(findProjectAnchor(sub), root);
  // ...but omp reads the project dir as <cwd>/.omp with no walk-up.
  assert.equal(projectLockPath(sub), join(sub, ".omp", "plugins", "omp-plugins.lock.json"));

  // A lock file at the walk-up anchor is not read for `sub`; the <cwd>/.omp one is.
  mkdirSync(join(root, ".omp", "plugins"), { recursive: true });
  writeFileSync(join(root, ".omp", "plugins", "omp-plugins.lock.json"), JSON.stringify({ settings: { "omp-llm-role": { "roles.anchor.weights.general": 1 } } }));
  mkdirSync(join(sub, ".omp", "plugins"), { recursive: true });
  writeFileSync(projectLockPath(sub), JSON.stringify({ settings: { "omp-llm-role": { "roles.cwd.weights.general": 1 } } }));

  const raw = readPluginSettingsMap({ global: join(root, "missing.json"), project: projectLockPath(sub) });
  assert.equal("roles.cwd.weights.general" in raw, true);
  assert.equal("roles.anchor.weights.general" in raw, false);
});

test("readPluginSettingsMap defaults the project source to <cwd>/.omp", () => {
  const root = mkdtempSync(join(tmpdir(), "project-cwd-"));
  mkdirSync(join(root, ".omp", "plugins"), { recursive: true });
  writeFileSync(join(root, ".omp", "plugins", "omp-plugins.lock.json"), JSON.stringify({ settings: { "omp-llm-role": { "roles.cwd.weights.general": 1 } } }));
  const previous = process.cwd();
  process.chdir(root);
  try {
    const raw = readPluginSettingsMap({ global: join(root, "missing.json") });
    assert.equal("roles.cwd.weights.general" in raw, true);
  } finally {
    process.chdir(previous);
  }
});
