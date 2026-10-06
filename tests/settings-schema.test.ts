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
    "activateDefaultOnEmptySession",
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

test("every schema default resolves to a real setting", () => {
  const raw: Record<string, unknown> = {};
  for (const [key, row] of Object.entries(deriveSettingsSchema())) {
    if (row.default !== undefined) raw[key] = row.default;
  }
  const { errors } = resolveSettings(raw);
  assert.deepEqual(errors, []);
});
