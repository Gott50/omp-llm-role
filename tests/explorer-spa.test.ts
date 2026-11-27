import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// Spec #116 / ticket #126: the explorer SPA's provider surface. `web/app.js` is a
// browser script (top-level DOM access), so it cannot be imported by the test
// runner; the repo's established pattern for SPA behavior is a static-source
// assertion (see the focus-table test in tests/explorer.test.ts). These assert
// the user-visible surface the ticket promises, not private helper shapes.

const app = readFileSync(join(process.cwd(), "web", "app.js"), "utf8");
const css = readFileSync(join(process.cwd(), "web", "style.css"), "utf8");

test("the rank table shows the effective provider and the price-source marker", () => {
  // The column header and the per-row cell.
  assert.match(app, /text: "provider" \}\)/, "the rank table has a provider column header");
  assert.match(app, /text: r\.provider \+ \(PRICE_SOURCE_MARK\[r\.priceSource\] \|\| ""\)/);
  // Only the two non-obvious sources are marked: a reference price and the proxy.
  assert.match(app, /const PRICE_SOURCE_MARK = \{ openrouter: "", provider: "", reference: "·ref", "openrouter-proxy": "·proxy" \}/);
  // The tooltip names the source in words, so the marker is not the only signal.
  assert.match(app, /reference price: omp's hydration of the model's list price, not the provider's own rate/);
  assert.match(app, /OpenRouter proxy: the provider has no own price, so the OpenRouter blend is used as a labelled proxy/);
});

test("the explain view shows the provider bonus as its own line", () => {
  assert.match(app, /text: "provider: " \+ ex\.providerLine/);
  assert.match(app, /text: "provider preference: " \+ ex\.providerPreferenceLine/);
});

test("the settings panel exposes the global priority as text and the bonus as a number", () => {
  // The global priority is a comma-separated list, so it renders as a text input.
  assert.match(app, /if \(key === "providerPriority"\) \{\s*\n\s*out\.push\(\{ key, kind: "text", label: key, tip: GLOBAL_TIPS\.providerPriority \}\);/);
  // The bonus is a bounded number input.
  assert.match(app, /providerBonus: \{ min: 0, max: 1, step: 0\.001 \}/);
});

test("the role editor exposes the per-role overrides", () => {
  assert.match(app, /text: "Provider priority" \}\)/, "the role editor has a Provider priority section");
  assert.match(app, /providerFields\.append\(providerPriorityField\(def\)\)/);
  assert.match(app, /providerFields\.append\(providerBonusField\(def\)\)/);
  // A cleared field deletes the key, so the role inherits the global again.
  assert.match(app, /if \(list\.length === 0\) delete def\.providerPriority;/);
  assert.match(app, /if \(input\.value === ""\) delete def\.providerBonus;/);
});

test("the client validation mirrors resolveSettings", () => {
  // The selector delimiters are rejected, matching the server's per-entry check.
  assert.match(app, /must be a non-empty string without \\"@\\" or \\":\\"/);
  assert.match(app, /must be a comma-separated string or an array of provider ids/);
  // The bonus is a finite number in [0, 1] (the range table drives the check).
  assert.match(app, /if \(typeof value !== "number" \|\| !Number\.isFinite\(value\)\) return key \+ ": must be a number";/);
});

test("the provider column uses theme variables only, no background colors", () => {
  assert.match(css, /#table td\.provider \{ color: var\(--muted\); font-family: var\(--mono\); \}/);
  const providerRules = css
    .split("\n")
    .filter((line: string) => /provider/.test(line) && !/^\s*(\/\*|\*)/.test(line));
  assert.ok(providerRules.length > 0);
  for (const line of providerRules) {
    assert.doesNotMatch(line, /background/, `no background on a provider rule: ${line}`);
    assert.doesNotMatch(line, /#[0-9a-fA-F]{3,8}\b|rgba?\(/, `no literal color on a provider rule: ${line}`);
  }
});
