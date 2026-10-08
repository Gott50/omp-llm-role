import assert from "node:assert/strict";
import { test } from "node:test";
import { FEATURES, expandFeatures } from "../src/features.ts";
import { DEFAULT_ROLES, DEFAULT_SETTINGS, isKnownMetric, resolveSettings, roleUniverse } from "../src/settings.ts";

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

test("the newly mapped leaderboard metrics are weightable", () => {
  // Issue #22: every mapped field is a KNOWN_METRICS key, so isKnownMetric
  // accepts it and resolveSettings validates a role that weights or requires it.
  const names = [
    "index_communication",
    "index_finance",
    "index_healthcare",
    "index_legal",
    "simpleqa_score",
    "hle_score",
    "mmmu_score",
    "mmmu_pro_score",
    "mmmlu_score",
    "browsecomp_score",
    "swe_bench_pro_score",
    "mcp_atlas_score",
    "apex_agents_score",
    "osworld_score",
    "scicode_score",
    "screenspot_pro_score",
    "charxiv_r_score",
    "frontiermath_score",
    "toolathlon_score",
  ];
  for (const name of names) assert.ok(isKnownMetric(name), `${name} should be a known metric`);

  const { errors } = resolveSettings({
    roles: { x: { weights: { simpleqa_score: 0.5, price: 0.5 }, required: ["index_legal"] } },
  });
  assert.deepEqual(errors, []);
});

test("no flag is a no-op: resolved roles equal the shipped defs", () => {
  const { settings, errors } = resolveSettings({});
  assert.deepEqual(errors, []);
  // The resolved set drops shipped-disabled roles (designer), so compare the
  // surviving key set and each def byte-for-byte against DEFAULT_ROLES.
  const expectedNames = Object.keys(DEFAULT_ROLES).filter((n) => DEFAULT_ROLES[n].enabled !== false);
  assert.deepEqual(Object.keys(settings.roles).sort(), expectedNames.sort());
  for (const [name, def] of Object.entries(settings.roles)) assert.deepEqual(def, DEFAULT_ROLES[name]);
  assert.deepEqual(settings.features, {});
});

test("a global flag reaches every resolved role", () => {
  const { settings, errors } = resolveSettings({ "features.cachePricing": true });
  assert.deepEqual(errors, []);
  assert.deepEqual(settings.features, { cachePricing: true });
  for (const [name, def] of Object.entries(settings.roles)) {
    assert.equal(def.cacheHitRate, 0.5, `${name} should be cache-priced`);
  }
});

test("each global flag applies its recommended bundle", () => {
  const ceilings = resolveSettings({ "features.endpointCeilings": true });
  assert.deepEqual(ceilings.errors, []);
  for (const [name, def] of Object.entries(ceilings.settings.roles)) {
    assert.equal(def.filters?.tools, true, `${name} tools`);
    assert.equal(def.filters?.minOutputTokens, 16384, `${name} minOutputTokens`);
  }
  // A hand-set leaf survives the fill (vision ships filters.image: true).
  assert.equal(ceilings.settings.roles.vision.filters?.image, true);

  const cap = resolveSettings({ "features.costCap": true });
  assert.deepEqual(cap.errors, []);
  assert.equal(cap.settings.roles.default.filters?.maxPriceUsdPerM, 10);

  const pin = resolveSettings({ "features.providerPinning": true });
  assert.deepEqual(pin.errors, []);
  for (const [name, def] of Object.entries(pin.settings.roles)) {
    assert.equal(def.preferOwnProvider, true, `${name} preferOwnProvider`);
  }
});

test("an explicit knob beats the flag", () => {
  const { settings, errors } = resolveSettings({ "features.cachePricing": true, "roles.default.cacheHitRate": 0.2 });
  assert.deepEqual(errors, []);
  assert.equal(settings.roles.default.cacheHitRate, 0.2);
  assert.equal(settings.roles.smol.cacheHitRate, 0.5);
});

test("a per-role false beats a global true", () => {
  const { settings, errors } = resolveSettings({ "features.cachePricing": true, "roles.tiny.features.cachePricing": false });
  assert.deepEqual(errors, []);
  assert.equal(settings.roles.tiny.cacheHitRate, undefined);
  for (const [name, def] of Object.entries(settings.roles)) {
    if (name === "tiny") continue;
    assert.equal(def.cacheHitRate, 0.5, `${name} should be cache-priced`);
  }
});

test("a per-role true beats a global false", () => {
  const { settings, errors } = resolveSettings({ "roles.review.features.costCap": true, roles: { review: { weights: { general: 0.5, price: 0.5 }, required: [] } } });
  assert.deepEqual(errors, []);
  assert.equal(settings.roles.review.filters?.maxPriceUsdPerM, 10);
  assert.equal(settings.roles.default.filters?.maxPriceUsdPerM, undefined);
});

test("unknown and non-boolean flags abort with the offending key", () => {
  const unknownGlobal = resolveSettings({ "features.katz": true });
  assert.ok(unknownGlobal.errors.includes("features.katz is not a known capability"), unknownGlobal.errors.join("; "));

  const unknownRole = resolveSettings({ "roles.review.features.katz": true, roles: { review: { weights: { general: 0.5, price: 0.5 }, required: [] } } });
  assert.ok(unknownRole.errors.includes("role review: features.katz is not a known capability"), unknownRole.errors.join("; "));

  const badGlobal = resolveSettings({ "features.cachePricing": "yes" });
  assert.ok(badGlobal.errors.some((e) => e.startsWith("features.cachePricing: must be a boolean")), badGlobal.errors.join("; "));

  const badRole = resolveSettings({ "roles.tiny.features.cachePricing": "yes" });
  assert.ok(badRole.errors.some((e) => e.startsWith("role tiny: features.cachePricing must be a boolean")), badRole.errors.join("; "));

  const badPrefer = resolveSettings({ "roles.tiny.preferOwnProvider": "yes" });
  assert.ok(badPrefer.errors.some((e) => e.startsWith("role tiny: preferOwnProvider must be a boolean")), badPrefer.errors.join("; "));
});

test("roleUniverse keeps the authored def (flags retained, not expanded)", () => {
  const raw = { "roles.tiny.features.costCap": true };
  const resolved = resolveSettings(raw);
  const universe = roleUniverse(raw, resolved.settings.roles);
  assert.deepEqual(universe.tiny.def.features, { costCap: true });
  assert.equal(universe.tiny.def.filters, undefined);
});

test("expandFeatures never mutates its input and strips features", () => {
  const authored = { description: "x", weights: { general: 0.5, price: 0.5 }, required: [], features: { cachePricing: true } };
  const snapshot = structuredClone(authored);
  const out = expandFeatures(authored, {});
  assert.deepEqual(authored, snapshot);
  assert.equal(out.features, undefined);
  assert.equal(out.cacheHitRate, 0.5);
});

test("errorReporting defaults to off and accepts only off/ask/auto", () => {
  assert.equal(DEFAULT_SETTINGS.errorReporting, "off");
  assert.equal(resolveSettings({}).settings.errorReporting, "off");
  for (const value of ["off", "ask", "auto"]) {
    const { settings, errors } = resolveSettings({ errorReporting: value });
    assert.deepEqual(errors, []);
    assert.equal(settings.errorReporting, value);
  }
  const { errors } = resolveSettings({ errorReporting: "sometimes" });
  assert.equal(errors.length, 1);
  assert.ok(errors[0].startsWith("errorReporting:"), `got ${errors[0]}`);
});

test("feature bundles are pairwise leaf-disjoint", () => {
  const leaves = (rec: (typeof FEATURES)[number]["recommended"]): string[] => {
    const out: string[] = [];
    if (rec.filters?.tools !== undefined) out.push("filters.tools");
    if (rec.filters?.minOutputTokens !== undefined) out.push("filters.minOutputTokens");
    if (rec.filters?.maxPriceUsdPerM !== undefined) out.push("filters.maxPriceUsdPerM");
    if (rec.cacheHitRate !== undefined) out.push("cacheHitRate");
    if (rec.preferOwnProvider !== undefined) out.push("preferOwnProvider");
    return out;
  };
  for (let i = 0; i < FEATURES.length; i++) {
    for (let j = i + 1; j < FEATURES.length; j++) {
      const a = new Set(leaves(FEATURES[i].recommended));
      for (const leaf of leaves(FEATURES[j].recommended)) {
        assert.ok(!a.has(leaf), `${FEATURES[i].id} and ${FEATURES[j].id} share ${leaf}`);
      }
    }
  }
});