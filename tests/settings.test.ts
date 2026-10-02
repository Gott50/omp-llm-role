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

test("flat dotted keys and a nested roles object merge without clobbering", () => {
  const review = { description: "Code review", weights: { general: 0.5, price: 0.5 }, required: ["general", "price"] };
  // The explorer writes a nested `roles` object; `omp plugin config set` writes
  // flat dotted keys. Both must survive in either order.
  for (const raw of [
    { "roles.designer.enabled": true, roles: { review } },
    { roles: { review }, "roles.designer.enabled": true },
  ]) {
    const { settings, errors } = resolveSettings(raw);
    assert.deepEqual(errors, []);
    assert.equal(settings.roles.designer?.enabled, true);
    assert.deepEqual(settings.roles.review?.weights, review.weights);
  }
});

test("required accepts a comma-separated string (omp /settings) or an array", () => {
  const fromString = resolveSettings({ "roles.slow.required": "general, price , throughput" });
  assert.deepEqual(fromString.errors, []);
  assert.deepEqual(fromString.settings.roles.slow.required, ["general", "price", "throughput"]);

  const fromArray = resolveSettings({ "roles.slow.required": ["general", "price", "throughput"] });
  assert.deepEqual(fromArray.errors, []);
  assert.deepEqual(fromArray.settings.roles.slow.required, ["general", "price", "throughput"]);
});

test("an external metric key is weightable, but a dotted one is rejected", () => {
  // The flat dotted settings path splits on `.`, so a dotted metric key would
  // mis-nest on read-back; the external form is `<namespace>:<local>`, dot-free.
  const ok = resolveSettings({ roles: { x: { weights: { "bench:alpacaeval-2_0": 0.5, price: 0.5 }, required: [] } } });
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.settings.roles.x.weights["bench:alpacaeval-2_0"], 0.5);

  const dotted = resolveSettings({ roles: { x: { weights: { "bench:alpacaeval-2.0": 0.5, price: 0.5 }, required: [] } } });
  assert.ok(dotted.errors.some((e) => e.includes("unknown metric")), dotted.errors.join("; "));

  const required = resolveSettings({ roles: { x: { weights: { general: 0.5, price: 0.5 }, required: ["bench:alpacaeval-2_0"] } } });
  assert.deepEqual(required.errors, []);
});