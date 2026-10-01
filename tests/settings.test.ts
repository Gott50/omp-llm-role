import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_SETTINGS, resolveSettings } from "../src/settings.ts";

test("opt-in roles: designer ships disabled and is dropped unless enabled", () => {
  const { settings, errors } = resolveSettings({});
  assert.deepEqual(errors, []);
  assert.equal(settings.roles.designer, undefined);
  assert.ok(settings.roles.default !== undefined);

  const enabled = resolveSettings({ roles: { designer: { enabled: true } } });
  assert.deepEqual(enabled.errors, []);
  assert.equal(enabled.settings.roles.designer?.enabled, true);
  assert.deepEqual(enabled.settings.roles.designer?.weights, DEFAULT_SETTINGS.roles.designer.weights);

  const bad = resolveSettings({ roles: { designer: { enabled: "yes" } } });
  assert.ok(bad.errors.some((e) => e.startsWith("role designer: enabled")));
});

test("priceSwitchFraction defaults to 0.5 and validates its range", () => {
  assert.equal(resolveSettings({}).settings.priceSwitchFraction, DEFAULT_SETTINGS.priceSwitchFraction);
  for (const bad of [-0.1, 1.5, Number.NaN, "0.5", null]) {
    const { errors } = resolveSettings({ priceSwitchFraction: bad });
    assert.ok(errors.some((e) => e.startsWith("priceSwitchFraction:")), `expected an error for ${JSON.stringify(bad)}`);
  }
  assert.deepEqual(resolveSettings({ priceSwitchFraction: 0 }).errors, []);
  assert.deepEqual(resolveSettings({ priceSwitchFraction: 1 }).errors, []);
});