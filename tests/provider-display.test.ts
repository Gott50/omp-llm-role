import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyProviderDisplay,
  providerPinOf,
  providerPinOfSelector,
  withProviderSuffix,
} from "../src/provider-display.ts";

// The pure display module (spec #77): read the live model's provider pin, parse
// the pin out of a selector, and apply/strip the ` @<slug>` display suffix.

// --- providerPinOf -----------------------------------------------------------

test("providerPinOf reads the single openRouterRouting upstream", () => {
  const model = { compat: { openRouterRouting: { only: ["coreweave/fp8"] } } };
  assert.equal(providerPinOf(model), "coreweave/fp8");
});

test("providerPinOf falls back to vercelGatewayRouting", () => {
  const model = { compat: { vercelGatewayRouting: { only: ["vercel/edge"] } } };
  assert.equal(providerPinOf(model), "vercel/edge");
});

test("providerPinOf prefers openRouterRouting when both are present", () => {
  const model = {
    compat: {
      openRouterRouting: { only: ["coreweave/fp8"] },
      vercelGatewayRouting: { only: ["vercel/edge"] },
    },
  };
  assert.equal(providerPinOf(model), "coreweave/fp8");
});

test("providerPinOf returns null when compat is absent", () => {
  assert.equal(providerPinOf({ id: "m" }), null);
});

test("providerPinOf returns null when the routing block is absent", () => {
  assert.equal(providerPinOf({ compat: {} }), null);
});

test("providerPinOf returns null when only is missing or not an array", () => {
  assert.equal(providerPinOf({ compat: { openRouterRouting: {} } }), null);
  assert.equal(providerPinOf({ compat: { openRouterRouting: { only: "coreweave/fp8" } } }), null);
});

test("providerPinOf returns null for an empty only array", () => {
  assert.equal(providerPinOf({ compat: { openRouterRouting: { only: [] } } }), null);
});

test("providerPinOf returns null when only has more than one entry", () => {
  const model = { compat: { openRouterRouting: { only: ["a", "b"] } } };
  assert.equal(providerPinOf(model), null);
});

test("providerPinOf returns null when the entry is not a non-empty string", () => {
  assert.equal(providerPinOf({ compat: { openRouterRouting: { only: [5] } } }), null);
  assert.equal(providerPinOf({ compat: { openRouterRouting: { only: [""] } } }), null);
  assert.equal(providerPinOf({ compat: { openRouterRouting: { only: [null] } } }), null);
});

test("providerPinOf returns null for a non-record model", () => {
  assert.equal(providerPinOf(null), null);
  assert.equal(providerPinOf("model"), null);
  assert.equal(providerPinOf(undefined), null);
});

// --- providerPinOfSelector ---------------------------------------------------

test("providerPinOfSelector parses a trailing @slug", () => {
  assert.equal(providerPinOfSelector("openrouter/org/model@coreweave/fp8"), "coreweave/fp8");
});

test("providerPinOfSelector parses @slug before a thinking suffix", () => {
  assert.equal(providerPinOfSelector("openrouter/org/model@coreweave/fp8:high"), "coreweave/fp8");
  assert.equal(providerPinOfSelector("openrouter/org/model@coreweave/fp8:auto"), "coreweave/fp8");
});

test("providerPinOfSelector returns null without an @", () => {
  assert.equal(providerPinOfSelector("openrouter/org/model"), null);
  assert.equal(providerPinOfSelector("openrouter/org/model:high"), null);
  assert.equal(providerPinOfSelector(""), null);
});

test("providerPinOfSelector returns null for an empty slug", () => {
  assert.equal(providerPinOfSelector("openrouter/org/model@"), null);
  assert.equal(providerPinOfSelector("openrouter/org/model@:high"), null);
});

// --- withProviderSuffix ------------------------------------------------------

test("withProviderSuffix appends the pin", () => {
  assert.equal(withProviderSuffix("DeepSeek V4.1 Flash", "coreweave/fp8"), "DeepSeek V4.1 Flash @coreweave/fp8");
});

test("withProviderSuffix strips a previous suffix before appending", () => {
  assert.equal(withProviderSuffix("DeepSeek V4.1 Flash @old/route", "coreweave/fp8"), "DeepSeek V4.1 Flash @coreweave/fp8");
});

test("withProviderSuffix is idempotent", () => {
  const once = withProviderSuffix("DeepSeek V4.1 Flash", "coreweave/fp8");
  assert.equal(withProviderSuffix(once, "coreweave/fp8"), once);
});

test("withProviderSuffix returns the base name unchanged for a null pin", () => {
  assert.equal(withProviderSuffix("DeepSeek V4.1 Flash", null), "DeepSeek V4.1 Flash");
});

test("withProviderSuffix strips a previous suffix for a null pin", () => {
  assert.equal(withProviderSuffix("DeepSeek V4.1 Flash @old/route", null), "DeepSeek V4.1 Flash");
});

// --- applyProviderDisplay ----------------------------------------------------

test("applyProviderDisplay mutates a record's name", () => {
  const model: Record<string, unknown> = { name: "DeepSeek V4.1 Flash" };
  applyProviderDisplay(model, "coreweave/fp8");
  assert.equal(model.name, "DeepSeek V4.1 Flash @coreweave/fp8");
});

test("applyProviderDisplay strips the suffix for a null pin", () => {
  const model: Record<string, unknown> = { name: "DeepSeek V4.1 Flash @old/route" };
  applyProviderDisplay(model, null);
  assert.equal(model.name, "DeepSeek V4.1 Flash");
});

test("applyProviderDisplay no-ops on a non-record", () => {
  assert.doesNotThrow(() => applyProviderDisplay(null, "coreweave/fp8"));
  assert.doesNotThrow(() => applyProviderDisplay("model", "coreweave/fp8"));
  assert.doesNotThrow(() => applyProviderDisplay(["model"], "coreweave/fp8"));
});

test("applyProviderDisplay no-ops when name is not a string", () => {
  const model: Record<string, unknown> = { name: 5 };
  applyProviderDisplay(model, "coreweave/fp8");
  assert.equal(model.name, 5);
});
