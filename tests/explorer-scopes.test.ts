import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import type { KeyAvailability } from "../src/availability.ts";
import type { RankData, RoleDef } from "../src/engine.ts";
import { startExplorer } from "../src/explorer/boot.ts";
import { resolveScopes, unionRoles } from "../src/explorer/scopes.ts";
import { isRecord } from "../src/guards.ts";
import { PROJECT_REGISTRY_FILE } from "../src/project-registry.ts";
import { makeModel } from "./helpers.ts";

const MODELS = [makeModel("premium", 90, 20, 50), makeModel("budget", 60, 0.5, 200)];
const RANK: RankData = { models: MODELS, fetchedAt: "2026-10-06T00:00:00.000Z", source: "test", orMatched: 2, orPriced: 2 };
const NO_AVAILABILITY: KeyAvailability = {
  active: false,
  reason: "unavailable",
  allowed: new Set(),
  blocked: new Set(),
  publicCount: 0,
  keyedCount: 0,
  fetchedAt: "2026-10-06T00:00:00.000Z",
};

const USER_ROLE: RoleDef = { description: "user role", weights: { general: 0.5, price: 0.5 }, required: ["general", "price"] };
// A project-only role weighting a declared external benchmark: the union resolver
// must carry `bench:foo` into the loader's role set, or a scope switch would rank
// on a dataset missing that metric.
const PROJECT_ROLE: RoleDef = { description: "project role", weights: { general: 0.5, "bench:foo": 0.3, price: 0.2 }, required: ["general", "price"] };

function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function writeLock(path: string, roles: Record<string, RoleDef>): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ plugins: { "omp-llm-role": { enabled: true } }, settings: { "omp-llm-role": { roles } } }, null, 2));
}

function writeProjectLock(root: string, roles: Record<string, RoleDef>): string {
  const lock = join(root, ".omp", "plugins", "omp-plugins.lock.json");
  writeLock(lock, roles);
  return lock;
}

function writeRegistry(dir: string, roots: string[]): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, PROJECT_REGISTRY_FILE), JSON.stringify({ projects: roots.map((root) => ({ root, lastUsed: "2026-10-06T00:00:00.000Z" })) }, null, 2));
}

/** Boot the explorer over temp lock files and a temp registry. */
async function boot(opts: { userLock: string; cwd: string; registryDir: string }): Promise<{ url: string; close: () => Promise<void> }> {
  const handle = await startExplorer({
    webDir: join(process.cwd(), "web"),
    lockPath: opts.userLock,
    cwd: opts.cwd,
    registryDir: opts.registryDir,
    rank: RANK,
    catalog: [],
    availability: NO_AVAILABILITY,
    reload: async () => RANK,
    port: 0,
    open: false,
    onLog: () => {},
  });
  return { url: handle.url, close: () => handle.close() };
}

async function bootstrap(url: string): Promise<Record<string, unknown>> {
  const body: unknown = await (await fetch(`${url}/api/bootstrap`)).json();
  if (!isRecord(body)) throw new Error("bootstrap payload is not an object");
  return body;
}

async function switchScope(url: string, scope: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${url}/api/scope`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scope }),
  });
  const body: unknown = await res.json();
  if (!isRecord(body)) throw new Error("scope payload is not an object");
  return { status: res.status, body };
}

test("bootstrap lists the user-level scope and every registered project scope", async () => {
  const root = tempDir("explorer-scopes-");
  const userLock = join(root, "user", "omp-plugins.lock.json");
  writeLock(userLock, { userrole: USER_ROLE });
  const projectA = join(root, "a");
  const projectB = join(root, "b");
  writeProjectLock(projectA, { projrole: PROJECT_ROLE });
  writeProjectLock(projectB, {});
  const registryDir = join(root, "agent");
  writeRegistry(registryDir, [projectA, projectB]);

  const handle = await boot({ userLock, cwd: join(root, "elsewhere"), registryDir });
  try {
    const body = await bootstrap(handle.url);
    const scopes = body.scopes as Array<{ id: string; kind: string; present: boolean }>;
    assert.deepEqual(scopes.map((s) => s.id), ["user", `project:${projectA}`, `project:${projectB}`]);
    assert.equal(scopes[0].kind, "user");
    assert.equal(scopes[0].present, true);
    assert.equal(scopes[1].present, true);
    assert.equal(scopes[2].present, true);
    // No project role config in the cwd: the default is the user-level scope.
    assert.equal(body.activeScope, "user");
    assert.equal(body.lockPath, userLock);
  } finally {
    await handle.close();
  }
});

test("the default active scope is the cwd project when it has a project role config", async () => {
  const root = tempDir("explorer-scopes-");
  const userLock = join(root, "user", "omp-plugins.lock.json");
  writeLock(userLock, { userrole: USER_ROLE });
  const project = join(root, "proj");
  const projectLock = writeProjectLock(project, { projrole: PROJECT_ROLE });
  const registryDir = join(root, "agent");

  const handle = await boot({ userLock, cwd: project, registryDir });
  try {
    const body = await bootstrap(handle.url);
    // The session project is listed immediately, before the registry records it.
    const scopes = body.scopes as Array<{ id: string }>;
    assert.deepEqual(scopes.map((s) => s.id), ["user", `project:${project}`]);
    assert.equal(body.activeScope, `project:${project}`);
    assert.equal(body.lockPath, projectLock);
  } finally {
    await handle.close();
  }
});

test("switching to a project resolves project-over-user-level roles and the shipped universe", async () => {
  const root = tempDir("explorer-scopes-");
  const userLock = join(root, "user", "omp-plugins.lock.json");
  writeLock(userLock, { userrole: USER_ROLE });
  const project = join(root, "proj");
  const projectLock = writeProjectLock(project, { projrole: PROJECT_ROLE });
  const registryDir = join(root, "agent");
  writeRegistry(registryDir, [project]);

  const handle = await boot({ userLock, cwd: join(root, "elsewhere"), registryDir });
  try {
    const { status, body } = await switchScope(handle.url, `project:${project}`);
    assert.equal(status, 200);
    assert.equal(body.activeScope, `project:${project}`);
    assert.equal(body.lockPath, projectLock);

    const roles = body.roles as Record<string, unknown>;
    assert.ok("projrole" in roles, "the project role is resolved");
    assert.ok("userrole" in roles, "the user-level lock is merged under the project lock");
    assert.ok("slow" in roles, "shipped roles are present");

    const universe = body.universe as Record<string, { kind: string }>;
    assert.ok("designer" in universe, "the shipped opt-in role is in the universe");
    assert.equal(universe.designer.kind, "plugin");
    assert.equal(universe.projrole.kind, "user");
  } finally {
    await handle.close();
  }
});

test("Export in a project scope writes the project lock and leaves the user lock untouched", async () => {
  const root = tempDir("explorer-scopes-");
  const userLock = join(root, "user", "omp-plugins.lock.json");
  writeLock(userLock, { userrole: USER_ROLE });
  const project = join(root, "proj");
  const projectLock = writeProjectLock(project, { projrole: PROJECT_ROLE });
  const registryDir = join(root, "agent");
  writeRegistry(registryDir, [project]);
  const userBefore = readFileSync(userLock, "utf8");

  const handle = await boot({ userLock, cwd: join(root, "elsewhere"), registryDir });
  try {
    await switchScope(handle.url, `project:${project}`);
    const edited: RoleDef = { ...PROJECT_ROLE, weights: { general: 0.6, "bench:foo": 0.2, price: 0.2 } };
    const res = await fetch(`${handle.url}/api/export`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roles: { projrole: edited } }),
    });
    const body: unknown = await res.json();
    if (!isRecord(body)) throw new Error("export payload is not an object");
    assert.equal(body.ok, true);
    assert.equal(body.lockPath, projectLock);

    const written = JSON.parse(readFileSync(projectLock, "utf8")) as { settings: { "omp-llm-role": Record<string, unknown> } };
    assert.equal(written.settings["omp-llm-role"]["roles.projrole.weights.general"], 0.6);
    assert.equal(written.settings["omp-llm-role"]["roles.projrole.weights.bench:foo"], 0.2);
    const backups = readdirSync(dirname(projectLock)).filter((f) => f.includes(".bak-"));
    assert.equal(backups.length, 1);

    // The user-level lock is byte-identical: switching scopes can never cross-write.
    assert.equal(readFileSync(userLock, "utf8"), userBefore);
  } finally {
    await handle.close();
  }
});

test("Export in the user-level scope leaves the project lock untouched", async () => {
  const root = tempDir("explorer-scopes-");
  const userLock = join(root, "user", "omp-plugins.lock.json");
  writeLock(userLock, { userrole: USER_ROLE });
  const project = join(root, "proj");
  const projectLock = writeProjectLock(project, { projrole: PROJECT_ROLE });
  const registryDir = join(root, "agent");
  writeRegistry(registryDir, [project]);
  const projectBefore = readFileSync(projectLock, "utf8");

  const handle = await boot({ userLock, cwd: join(root, "elsewhere"), registryDir });
  try {
    const edited: RoleDef = { ...USER_ROLE, weights: { general: 0.6, price: 0.4 } };
    const res = await fetch(`${handle.url}/api/export`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roles: { userrole: edited } }),
    });
    const body: unknown = await res.json();
    if (!isRecord(body)) throw new Error("export payload is not an object");
    assert.equal(body.ok, true);
    assert.equal(body.lockPath, userLock);
    assert.equal(readFileSync(projectLock, "utf8"), projectBefore);
  } finally {
    await handle.close();
  }
});

test("a registry entry whose lock file is gone is not present and cannot be selected", async () => {
  const root = tempDir("explorer-scopes-");
  const userLock = join(root, "user", "omp-plugins.lock.json");
  writeLock(userLock, { userrole: USER_ROLE });
  const gone = join(root, "gone");
  const registryDir = join(root, "agent");
  writeRegistry(registryDir, [gone]);

  const handle = await boot({ userLock, cwd: join(root, "elsewhere"), registryDir });
  try {
    const body = await bootstrap(handle.url);
    const scopes = body.scopes as Array<{ id: string; present: boolean }>;
    const entry = scopes.find((s) => s.id === `project:${gone}`);
    if (entry === undefined) throw new Error("the gone project is not listed");
    assert.equal(entry.present, false);

    const { status } = await switchScope(handle.url, `project:${gone}`);
    assert.equal(status, 409);
  } finally {
    await handle.close();
  }
});

test("a missing or unparseable registry still boots with the session's project only", async () => {
  const root = tempDir("explorer-scopes-");
  const userLock = join(root, "user", "omp-plugins.lock.json");
  writeLock(userLock, { userrole: USER_ROLE });
  const project = join(root, "proj");
  writeProjectLock(project, { projrole: PROJECT_ROLE });
  const registryDir = join(root, "agent");
  mkdirSync(registryDir, { recursive: true });

  for (const contents of [null, "{ not json"]) {
    if (contents === null) {
      // no registry file at all
    } else {
      writeFileSync(join(registryDir, PROJECT_REGISTRY_FILE), contents);
    }
    const handle = await boot({ userLock, cwd: project, registryDir });
    try {
      const body = await bootstrap(handle.url);
      const scopes = body.scopes as Array<{ id: string }>;
      assert.deepEqual(scopes.map((s) => s.id), ["user", `project:${project}`]);
      assert.equal(body.activeScope, `project:${project}`);
    } finally {
      await handle.close();
    }
  }
});

test("the scope union resolver carries a project-only metric into the loader's role set", () => {
  const root = tempDir("explorer-scopes-");
  const userLock = join(root, "user", "omp-plugins.lock.json");
  writeLock(userLock, { userrole: USER_ROLE });
  const project = join(root, "proj");
  writeProjectLock(project, { projrole: PROJECT_ROLE });
  const registryDir = join(root, "agent");
  writeRegistry(registryDir, [project]);

  const scopes = resolveScopes({ userLockPath: userLock, cwd: join(root, "elsewhere"), registryDir });
  const roles = unionRoles(scopes, userLock);
  assert.ok("userrole" in roles);
  assert.ok("projrole" in roles);
  assert.ok("bench:foo" in roles.projrole.weights, "the project-only metric is in the union");

  // The user-level scope alone would not carry it — the union is what keeps a
  // scope switch from ranking on an unfetched metric.
  const userOnly = unionRoles(scopes.filter((s) => s.kind === "user"), userLock);
  assert.equal("projrole" in userOnly, false);
});
