import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { DEFAULT_ROLES, DEFAULT_SETTINGS, deriveSettingsSchema, resolveSettings } from "../src/settings.ts";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  omp: { settings: Record<string, unknown> };
};

test("package.json omp.settings deep-equals deriveSettingsSchema()", () => {
  assert.deepEqual(pkg.omp.settings, deriveSettingsSchema());
});

test("schema covers every global knob and every shipped role field", () => {
  const schema = deriveSettingsSchema();
  for (const key of [
    "switchMargin",
    "priceSwitchFraction",
    "writeFallbackChains",
    "fallbackChainDepth",
    "fallbackQualityFloor",
    "activateDefaultOnEmptySession",
    "errorReporting",
    "selection",
    "qualityFloor",
    "tokenProfile.inputTokens",
    "tokenProfile.outputTokens",
  ]) {
    assert.ok(key in schema, `missing global ${key}`);
  }
  for (const [name, def] of Object.entries(DEFAULT_ROLES)) {
    for (const suffix of ["enabled", "thinking", "providerPin", "required"]) {
      assert.ok(`roles.${name}.${suffix}` in schema, `missing roles.${name}.${suffix}`);
    }
    for (const metric of Object.keys(def.weights)) {
      assert.ok(`roles.${name}.weights.${metric}` in schema, `missing roles.${name}.weights.${metric}`);
    }
  }
});

test("schema rows carry the shipped defaults", () => {
  const schema = deriveSettingsSchema();
  assert.equal(schema.switchMargin.default, DEFAULT_SETTINGS.switchMargin);
  assert.equal(schema.priceSwitchFraction.default, DEFAULT_SETTINGS.priceSwitchFraction);
  assert.equal(schema.writeFallbackChains.default, DEFAULT_SETTINGS.writeFallbackChains);
  assert.equal(schema.fallbackChainDepth.default, DEFAULT_SETTINGS.fallbackChainDepth);
  assert.equal(schema.activateDefaultOnEmptySession.default, DEFAULT_SETTINGS.activateDefaultOnEmptySession);
  assert.equal(schema.errorReporting.type, "enum");
  assert.deepEqual(schema.errorReporting.values, ["off", "ask", "auto"]);
  assert.equal(schema.errorReporting.default, DEFAULT_SETTINGS.errorReporting);
  for (const [name, def] of Object.entries(DEFAULT_ROLES)) {
    assert.equal(schema[`roles.${name}.enabled`].default, def.enabled ?? true);
    assert.equal(schema[`roles.${name}.thinking`].default, def.thinking);
    assert.equal(schema[`roles.${name}.required`].default, def.required.join(","));
    for (const [metric, w] of Object.entries(def.weights)) {
      assert.equal(schema[`roles.${name}.weights.${metric}`].default, w);
    }
  }
  // The shipped opt-in role is disabled by default.
  assert.equal(schema["roles.designer.enabled"].default, false);
});

test("schema exposes the soft throughput floor with default 0 and min 0", () => {
  const schema = deriveSettingsSchema();
  for (const [name, def] of Object.entries(DEFAULT_ROLES)) {
    const row = schema[`roles.${name}.filters.preferredMinThroughput`];
    assert.ok(row, `missing roles.${name}.filters.preferredMinThroughput`);
    assert.equal(row.type, "number");
    assert.equal(row.min, 0);
    assert.equal(row.default, def.filters?.preferredMinThroughput ?? 0);
  }
});

test("resolveSettings accepts a positive preferredMinThroughput", () => {
  const { settings, errors } = resolveSettings({
    "roles.default.filters.preferredMinThroughput": 50,
  });
  assert.deepEqual(errors, []);
  assert.equal(settings.roles.default.filters?.preferredMinThroughput, 50);
});

test("resolveSettings rejects bad preferredMinThroughput values", () => {
  for (const bad of [-1, "50", Number.NaN]) {
    const { errors } = resolveSettings({
      "roles.default.filters.preferredMinThroughput": bad,
    });
    assert.ok(
      errors.some((e) => e.includes("filters.preferredMinThroughput must be a number ≥ 0")),
      `expected rejection for ${String(bad)}`,
    );
  }
});

test("schema exposes the fallback quality floor row", () => {
  const row = deriveSettingsSchema().fallbackQualityFloor;
  assert.ok(row, "missing fallbackQualityFloor");
  assert.equal(row.type, "number");
  assert.equal(row.min, 0);
  assert.equal(row.max, 1);
  assert.equal(row.step, 0.001);
  assert.equal(row.default, DEFAULT_SETTINGS.fallbackQualityFloor);
});

test("resolveSettings accepts the fallback quality floor bounds", () => {
  for (const value of [0, 1]) {
    const { settings, errors } = resolveSettings({ fallbackQualityFloor: value });
    assert.deepEqual(errors, []);
    assert.equal(settings.fallbackQualityFloor, value);
  }
});

test("resolveSettings rejects bad fallbackQualityFloor values", () => {
  const cases: Array<[unknown, string]> = [
    [-0.1, "fallbackQualityFloor: must be a number in [0, 1], got -0.1"],
    [1.1, "fallbackQualityFloor: must be a number in [0, 1], got 1.1"],
    [Number.NaN, "fallbackQualityFloor: must be a number in [0, 1], got null"],
    ["0.9", 'fallbackQualityFloor: must be a number in [0, 1], got "0.9"'],
  ];
  for (const [bad, expected] of cases) {
    const { errors } = resolveSettings({ fallbackQualityFloor: bad });
    assert.deepEqual(errors, [expected]);
  }
});

test("schema exposes the token profile rows with min 0 and no default", () => {
  const schema = deriveSettingsSchema();
  for (const key of ["tokenProfile.inputTokens", "tokenProfile.outputTokens"]) {
    const row = schema[key];
    assert.ok(row, `missing ${key}`);
    assert.equal(row.type, "number");
    assert.equal(row.min, 0);
    // No default: an absent profile is not a silent zero.
    assert.equal(row.default, undefined);
  }
});

test("every schema default resolves to a real setting", () => {
  const raw: Record<string, unknown> = {};
  for (const [key, row] of Object.entries(deriveSettingsSchema())) {
    if (row.default !== undefined) raw[key] = row.default;
  }
  const { errors } = resolveSettings(raw);
  assert.deepEqual(errors, []);
});

test("selection and qualityFloor resolve to their defaults when unset", () => {
  const { settings, errors } = resolveSettings({});
  assert.deepEqual(errors, []);
  assert.equal(settings.selection, "value");
  assert.equal(settings.qualityFloor, 0.9);
});

test("a per-role selection/qualityFloor wins over the global one", () => {
  const { settings, errors } = resolveSettings({
    selection: "value",
    qualityFloor: 0.9,
    "roles.default.selection": "cheapest",
    "roles.default.qualityFloor": 0.5,
  });
  assert.deepEqual(errors, []);
  assert.equal(settings.roles.default.selection, "cheapest");
  assert.equal(settings.roles.default.qualityFloor, 0.5);
});

test("resolveSettings rejects an unknown selection value", () => {
  const { errors } = resolveSettings({ selection: "cheapestest" });
  assert.deepEqual(errors, ['selection: must be one of value, cheapest, got "cheapestest"']);
});

test("resolveSettings rejects an unknown per-role selection value", () => {
  const { errors } = resolveSettings({ "roles.default.selection": "nope" });
  assert.deepEqual(errors, ["role default: selection must be one of value, cheapest"]);
});

test("resolveSettings rejects bad qualityFloor values", () => {
  const cases: Array<[unknown, string]> = [
    [-0.1, "qualityFloor: must be a number in [0, 1], got -0.1"],
    [1.1, "qualityFloor: must be a number in [0, 1], got 1.1"],
    [Number.NaN, "qualityFloor: must be a number in [0, 1], got null"],
    ["0.9", 'qualityFloor: must be a number in [0, 1], got "0.9"'],
  ];
  for (const [bad, expected] of cases) {
    const { errors } = resolveSettings({ qualityFloor: bad });
    assert.deepEqual(errors, [expected]);
  }
});

test("resolveSettings rejects a bad per-role qualityFloor value", () => {
  const { errors } = resolveSettings({ "roles.default.qualityFloor": 2 });
  assert.deepEqual(errors, ["role default: qualityFloor must be a number in [0, 1]"]);
});

test("schema exposes the selection and qualityFloor rows", () => {
  const schema = deriveSettingsSchema();
  const sel = schema.selection;
  assert.ok(sel, "missing selection");
  assert.equal(sel.type, "enum");
  assert.deepEqual(sel.values, ["value", "cheapest"]);
  assert.equal(sel.default, DEFAULT_SETTINGS.selection);
  const qf = schema.qualityFloor;
  assert.ok(qf, "missing qualityFloor");
  assert.equal(qf.type, "number");
  assert.equal(qf.min, 0);
  assert.equal(qf.max, 1);
  assert.equal(qf.step, 0.001);
  assert.equal(qf.default, DEFAULT_SETTINGS.qualityFloor);
  for (const [name, def] of Object.entries(DEFAULT_ROLES)) {
    const rs = schema[`roles.${name}.selection`];
    assert.ok(rs, `missing roles.${name}.selection`);
    assert.equal(rs.type, "enum");
    assert.deepEqual(rs.values, ["value", "cheapest"]);
    assert.equal(rs.default, def.selection ?? "value");
    const rq = schema[`roles.${name}.qualityFloor`];
    assert.ok(rq, `missing roles.${name}.qualityFloor`);
    assert.equal(rq.type, "number");
    assert.equal(rq.min, 0);
    assert.equal(rq.max, 1);
    assert.equal(rq.step, 0.001);
    assert.equal(rq.default, def.qualityFloor ?? DEFAULT_SETTINGS.qualityFloor);
  }
});

test("README documents the selection and qualityFloor knobs", () => {
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  assert.match(readme, /\|\s*`selection`\s*\|/, "README settings table is missing the selection row");
  assert.match(readme, /\|\s*`qualityFloor`\s*\|/, "README settings table is missing the qualityFloor row");
  assert.match(
    readme,
    /inert in `"value"` mode/i,
    "README must say qualityFloor is inert in \"value\" mode",
  );
});
