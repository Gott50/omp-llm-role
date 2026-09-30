import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_SETTINGS, resolveSettings } from "../src/settings.ts";

test("priceSwitchFraction defaults to 0.5 and validates its range", () => {
  assert.equal(resolveSettings({}).settings.priceSwitchFraction, DEFAULT_SETTINGS.priceSwitchFraction);
  for (const bad of [-0.1, 1.5, Number.NaN, "0.5", null]) {
    const { errors } = resolveSettings({ priceSwitchFraction: bad });
    assert.ok(errors.some((e) => e.startsWith("priceSwitchFraction:")), `expected an error for ${JSON.stringify(bad)}`);
  }
  assert.deepEqual(resolveSettings({ priceSwitchFraction: 0 }).errors, []);
  assert.deepEqual(resolveSettings({ priceSwitchFraction: 1 }).errors, []);
});