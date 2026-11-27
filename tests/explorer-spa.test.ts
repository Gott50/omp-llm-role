import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

// The explorer SPA has no DOM harness, so these are static-source assertions
// (the repo's pattern for browser-only code): they pin the provider-preference
// rendering and the mode-aware tooltip wording against a silent regression.
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const APP = readFileSync(`${ROOT}web/app.js`, "utf8");

test("the rank table's provider cell renders the preference term when non-zero", () => {
  // The cell text is provider + price-source marker + the bonus term; a zero
  // bonus adds nothing, so the empty-priority table is unchanged.
  assert.match(APP, /function providerCellText\(row\)/);
  assert.match(APP, /const mark = PRICE_SOURCE_MARK\[row\.priceSource\] \|\| ""/);
  assert.match(APP, /const bonus = row\.providerBonus > 0 \? " \+" \+ row\.providerBonus : ""/);
  assert.match(APP, /return row\.provider \+ mark \+ bonus/);
  // The table wires the helper into the provider cell.
  assert.match(APP, /class: "provider", "data-tip": providerTip\(r\), text: providerCellText\(r\)/);
});

test("the provider tooltip explains the preference term in the active mode", () => {
  // The mode comes from the rank payload's selection block, not a client guess.
  assert.match(APP, /const mode = state\.selection\?\.mode/);
  assert.match(APP, /mode === "cheapest"/);
  assert.match(APP, /the provider preference is a price-fraction discount on the bar-clearing order/);
  assert.match(APP, /the provider preference is a value-unit nudge applied in the selection comparison only \(never in the honest value\)/);
  // The term is appended only when the row carries a preference.
  assert.match(APP, /if \(row\.providerBonus > 0\) \{/);
});
