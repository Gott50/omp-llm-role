"use strict";

/* omp-llm-role explorer client. All ranking math is server-side (src/engine.ts);
 * this file only renders and edits role defs. Model names come from a scraped
 * third-party site, so DOM is built with textContent/createElement only. */

const state = {
  role: null,
  universe: {},
  effective: {},
  defs: {},
  defaults: {},
  metrics: [],
  metricMeta: {},
  focusAssessments: {},
  levels: [],
  thinkingFactors: {},
  rows: [],
  selectedId: null,
  // The /api/rank selection block: the effective mode, the prospective pick,
  // the bar's anchor/threshold and the floor. null until the first rank.
  selection: null,
  lambda: 0,
  derivedLambda: 0,
  errors: [],
  lockPath: "",
  scopes: [],
  activeScope: "",
  // The ranked pool the server is serving (raw | as-written) and the user-set
  // token profile the per-task price falls back to (null = unset). Both come
  // from the bootstrap payload, so a refresh keeps them.
  poolMode: "raw",
  tokenProfile: null,
  features: {},
  featureRegistry: [],
  filter: "",
  topn: "25",
  hideBlocked: false,
  availability: null,
  explain: null,
  exportMessage: "",
  // The scope's global settings, in the three shapes the Settings panel needs:
  // `authored` (the lock file's flat dotted keys), `resolved` (the committed
  // effective values) and `defaults` (the shipped values to reset to).
  // `settingsEdited` is the working copy the panel mutates and Export posts.
  settingsAuthored: {},
  settingsResolved: null,
  settingsDefaults: null,
  settingsEdited: {},
  // The updater's decision preview (probe-optimistic) and its validation errors.
  preview: null,
  previewErrors: [],
};

// The plugin deep-merges a role's weights over DEFAULT_ROLES, so a metric the
// shipped default weights cannot be dropped from the key set — the default's
// weight survives the merge and the sum check fails. "Remove" therefore parks an
// inherited metric at this negligible weight instead of deleting the key.
const EPSILON = 0.001;

// The λ derivation exactly as the engine computes it (roleLambda:
// w_price/(1−w_price)/P_REF_USD, P_REF_USD = $20). One copy so the λ tooltip and
// the explain panel's derived line cannot drift apart.
const LAMBDA_DERIVATION = "w_price/(1−w_price)/$20";

function el(tag, props, children) {
  const node = document.createElement(tag);
  if (props) {
    for (const key of Object.keys(props)) {
      const value = props[key];
      if (value === null || value === undefined) continue;
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
      else if (key === "dataset") Object.assign(node.dataset, value);
      else node.setAttribute(key, value);
    }
  }
  if (children) {
    for (const child of [].concat(children)) {
      if (child === null || child === undefined) continue;
      node.append(child);
    }
  }
  return node;
}

async function api(path, body) {
  const opts = body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
  const res = await fetch(path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data && data.error ? data.error : res.statusText);
  return data;
}

function fmt(value, digits) {
  return Number(value).toFixed(digits);
}

function fmtCtx(value) {
  return value >= 1000 ? Math.round(value / 1000) + "K" : String(value);
}

/** Dollars per task, at a precision that keeps the small values readable: a
 * per-task price spans roughly $0.0001 (a cheap model, a short task) to $1+. */
function fmtUsd(value) {
  if (value === null || value === undefined) return "—";
  const abs = Math.abs(value);
  if (abs >= 1) return "$" + value.toFixed(2);
  if (abs >= 0.01) return "$" + value.toFixed(3);
  if (abs > 0) return "$" + value.toFixed(4);
  return "$0";
}

/** Token counts, compact: 20000 → "20K", 1500 → "1.5K", 800 → "800". */
function fmtTokens(value) {
  if (value >= 1000) {
    const k = value / 1000;
    return (k >= 10 ? Math.round(k) : Math.round(k * 10) / 10) + "K";
  }
  return String(value);
}

function deltaText(delta) {
  if (delta === null || delta === undefined || delta === 0) return "·";
  return delta > 0 ? "+" + delta : "−" + Math.abs(delta);
}

function deltaClass(delta) {
  if (delta === null || delta === undefined || delta === 0) return "flat";
  return delta > 0 ? "up" : "down";
}

function metricLabel(metric) {
  const meta = state.metricMeta[metric];
  return meta ? meta.label : metric;
}

function dirtyRoles() {
  const out = {};
  for (const role of Object.keys(state.defs)) {
    if (JSON.stringify(state.defs[role]) !== JSON.stringify(state.effective[role])) out[role] = state.defs[role];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Global settings (the Settings panel's model)
// ---------------------------------------------------------------------------

/** Read a flat dotted key (`tokenProfile.inputTokens`) out of a nested object.
 * A key that is itself a property wins, so a literal dotted key still resolves. */
function pathGet(obj, key) {
  if (!obj) return undefined;
  if (key in obj) return obj[key];
  let cur = obj;
  for (const part of key.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = cur[part];
  }
  return cur;
}

/** The shipped default for a flat dotted key. A capability flag's schema default
 * is `false`, but `DEFAULT_SETTINGS.features` is empty, so the flag falls back
 * to false rather than undefined (which would make a cleared toggle look set). */
function defaultOf(key) {
  const value = pathGet(state.settingsDefaults, key);
  if (value === undefined && key.startsWith("features.")) return false;
  return value;
}

/** The scope's committed effective value for a flat dotted key. */
function resolvedOf(key) {
  const value = pathGet(state.settingsResolved, key);
  if (value === undefined && key.startsWith("features.")) return false;
  return value;
}

/** Re-derive the committed resolved globals from a flat dotted-key record over
 * the shipped defaults — the projection `resolveSettings` applies to the global
 * half. Used after an export, so the panel's committed readout cannot go stale. */
function resolvedFromFlat(flat) {
  const out = structuredClone(state.settingsDefaults);
  for (const [key, value] of Object.entries(flat)) {
    if (key === "config" || key === "suffixes" || key.startsWith("suffixes.")) continue;
    const parts = key.split(".");
    let node = out;
    for (let i = 0; i < parts.length - 1; i++) {
      if (node[parts[i]] === null || typeof node[parts[i]] !== "object") node[parts[i]] = {};
      node = node[parts[i]];
    }
    node[parts[parts.length - 1]] = value;
  }
  return out;
}

function fmtDefault(value) {
  if (value === undefined || value === null) return "—";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

/** Set (or clear) one global key on the working copy. A value equal to the
 * shipped default — or an empty field — deletes the key, so Export never
 * accumulates a redundant key that just restates the default. */
function setGlobal(key, value) {
  if (value === undefined || value === "" || value === defaultOf(key)) delete state.settingsEdited[key];
  else state.settingsEdited[key] = value;
}

/** Global dirty: the working copy differs from the scope's authored keys. */
function settingsDirty() {
  return JSON.stringify(state.settingsEdited) !== JSON.stringify(state.settingsAuthored);
}

/** The server's own validation, mirrored so the panel can show the error as you
 * type. Returns null for a valid value (or a key with no range). */
function validateGlobal(key, value) {
  const range = GLOBAL_RANGES[key];
  if (!range) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return key + ": must be a number";
  if (range.integer) {
    if (!Number.isInteger(value) || value < 0) return key + ": must be an integer >= 0, got " + JSON.stringify(value);
    return null;
  }
  if (range.max === undefined) {
    if (value < range.min) return key + ": must be a number >= 0, got " + JSON.stringify(value);
    return null;
  }
  if (value < range.min || value > range.max) {
    return key + ": must be a number in [" + range.min + ", " + range.max + "], got " + JSON.stringify(value);
  }
  return null;
}

/** Every validation error in the working copy, keyed by the offending key. The
 * token profile is a pair: the server rejects a lone half, so the panel does
 * too (a cleared field falls back to the shipped default, which is null). */
function settingsErrors() {
  const out = {};
  for (const [key, value] of Object.entries(state.settingsEdited)) {
    const err = validateGlobal(key, value);
    if (err) out[key] = err;
  }
  const hasIn = "tokenProfile.inputTokens" in state.settingsEdited;
  const hasOut = "tokenProfile.outputTokens" in state.settingsEdited;
  if (hasIn !== hasOut) {
    const missing = hasIn ? "tokenProfile.outputTokens" : "tokenProfile.inputTokens";
    out[missing] = missing + ": must be a number >= 0, got undefined";
  }
  return out;
}

// ---------------------------------------------------------------------------
// Hover tooltips
// ---------------------------------------------------------------------------

/* Static explanations for columns and controls. Metric and role tooltips are
 * built from the bootstrap payload (METRIC_META / role descriptions) instead of
 * being duplicated here, so they cannot drift from the engine's transforms. */
const TIPS = {
  models: "Models in the cached llm-stats leaderboard snapshot.",
  fetched: "UTC day of the cached snapshot; a cache older than today is refetched on boot.",
  orJoin: "OpenRouter join: matched = models paired by slug suffix (source of throughput and price); priced = matched models that carry an OpenRouter price.",
  availability: "Whether your OpenRouter key can run each model, from the keyed catalog. Enable OpenRouter → Settings → \"Filter the model catalog for API keys\" so the keyed catalog is a per-model allowlist; otherwise every mark reads unknown.",
  key: "Key usability: usable = your OpenRouter key can run this model (in the keyed catalog); blocked = the public catalog has it but your key cannot; unknown = the keyed catalog is inactive or the model is in neither catalog.",
  hideBlocked: "Drop rows your OpenRouter key cannot run (key = blocked). Applied after the text filter and the top-n slice.",
  lock: "Plugin settings lock file that Export writes to (the active scope's lock file).",
  scope: "Role-config source: the user-level scope, or a project where /project-roles was used. Switching re-reads that scope's roles and universe from disk and points Export at its lock file. A project whose lock file is gone is unavailable.",
  pool: "Ranked pool. raw = the full cached dataset (account-agnostic), key-blocked models included with their key verdicts. as-written = the pool the updater ranks on: the catalog/tier gate, the allowed-providers whitelist prune, and the keyed-catalog prune — key-blocked models are dropped here, so switch to raw to see them and their verdicts. It is not the written selector: hysteresis can keep a different model than this pool's leader, and Export always writes the authored role. Best-effort: a failed whitelist fetch degrades to the raw pool.",
  refresh: "Refetch llm-stats and OpenRouter data (hits the network).",
  rank: "Rank among this role's eligible models, by value, descending.",
  delta: "Rank change against the role's saved (effective) definition: + means this definition ranks the model higher than the plugin does today.",
  frontier: "Pareto frontier on (effective price, q): no other model is both cheaper and at least as good. Price is the thinking-adjusted effective price.",
  value: "Sort key: value = q − λ·$/M on the thinking-adjusted effective price. λ is the price of one quality point, in $/M.",
  q: "Quality q = Σ (wᵢ/(1−w_price))·tᵢ over the weighted quality metrics. Price is not blended in — it is the penalty axis.",
  pick: "The prospective pick: the model the role's selection rule would choose — in cheapest mode the cheapest candidate at or above the bar, in value mode the value leader. A pure function of the pool and the role def, not the written selector: the plugin's hysteresis can still keep a different model, and Export always writes the authored role.",
  bar: "The quality floor: bar = qualityFloor × the anchor's q, where the anchor is the pool's highest-q model. Candidates under the bar are excluded from the cheapest pick. The fill shows the bar as a share of the anchor's q. Absent in value mode, which has no bar.",
  excluded: "Candidates the bar excluded: their q is under the bar, so the cheapest pick never considers them. The missing metrics are the weighted non-price metrics with no value for that model — they contribute 0 to its q.",
  price: "Effective price in $/M: OpenRouter standard-route blend (3:1 in:out) scaled by the role's thinking factor when the model supports thinking; unadjusted for bare/off roles.",
  perTask: "Dollars per task: your own token mix (the role's recorded usage, else the tokenProfile setting) × the role's priced route, thinking-adjusted. Display-only — the ranking still sorts on $/M. — when no token profile is available (no recorded usage and no tokenProfile set).",
  throughput: "Output throughput in tok/s (OpenRouter p50 when matched, else llm-stats).",
  context: "Context window in tokens.",
  explainSub: "value = q − λ·$/M (effective price), where q is the weighted quality sum and λ the price of one quality point.",
  composition: "Raw source value → cardinal transform t → this role's renormalized weight → contribution to q. Bars show each metric's share of q.",
  raw: "Raw value from the source: llm-stats index score, benchmark pass rate, $/M, or tok/s.",
  t: "Cardinal-normalized value t with sample-independent fixed anchors — this is what the weights multiply.",
  weight: "This role's weight for the metric, renormalized over the quality metrics (price excluded).",
  contrib: "Renormalized weight × t. Contributions sum to q.",
  share: "Share of q contributed by this metric.",
  costPenalty: "value = q − λ·price (effective): the penalty grows linearly with the thinking-adjusted price, at λ $/M per quality point.",
  whyNotHigher: "The value gap to the model ranked above, and the per-metric raw target that would close it (inverse of the cardinal transform).",
  dominated: "Models that are both cheaper and at least as good on q.",
  lambda: "λ = price of one quality point, in $/M. Derived as " + LAMBDA_DERIVATION + " unless the role overrides lambda.",
  leaderFlip: "The price weight w* at which a cheaper challenger overtakes the value leader: λ* = min over cheaper challengers X of (q_L − q_X)/(pEff_L − pEff_X), then w* = 20λ*/(1+20λ*). Absent when no cheaper challenger exists. Exact for the 1/price² blend or a hard provider pin; a first-order estimate under the soft best-route basis (the route choice itself moves with the price weight).",
  levers: "Two price-lever readouts, computed on the pool you are viewing: the leader-flip threshold (the price weight at which a cheaper challenger overtakes the leader) and the thinking level's effect on the leader. Each is absent when the server sends null — no cheaper challenger, or a bare role.",
  thinkingLevels: "The leader at each thinking level, with the level's price factor (3ρ+1+T)/(3ρ+1). The factor multiplies the price axis, so it penalizes expensive models more in absolute λ-units — that is why auto favours the cheap model. Absent for a bare role (no thinking level).",
  sum: "Weights must sum to 1.0 (±0.01) or the plugin rejects the role.",
  required: "Eligibility gate, not a weight: a model missing this metric is not ranked at all for the role.",
  focus: "Nine-axis audit of each weighted benchmark/percentile metric, over the same pool the updater ranks on. A below-bar axis is warned; unknown means the metric's scores were not loaded (never a silent ok).",
  focusCoverage: "Coverage: models carrying the metric (not the imputed fill) out of the pool, and the share. Below the coverage floor — or a capability-filled metric — is warned.",
  focusDispersion: "Dispersion: IQR/median of the cardinal-normalized covered values. Too little spread means the metric barely separates models.",
  focusComposition: "Composition: pool orgs above the minimum share that carry no covered model. A missing major provider is warned.",
  focusFreshness: "Freshness: months between the newest covered model and the newest pool model. A stale benchmark is warned.",
  focusTrust: "Trust: the self-reported share of the payload's covered entries (the per-entry self_reported flag). A mostly vendor-submitted source is warned; unknown means the payload carried no entry flags or the scores were not loaded.",
  focusModality: "Modality: the catalog row's modality (text/image/audio/video/multimodal) and the payload's multimodal share. Informational only — never a gate; unknown means neither the catalog row nor the payload carried a modality signal.",
  focusMaintenance: "Maintenance: months since the catalog row's updated_at (the dataset's own age), against a 12-month bar, with version_count/star_count as supporting detail. This is the dataset-date axis, distinct from freshness (the model-date axis). An annotation, never a gate — a stale dataset is warned but never drops a candidate; unknown means the catalog row is absent or its updated_at is missing/unparseable.",
  focusProvenance: "Provenance: the benchmark's owner (the catalog row's dataset_org_id, falling back to dataset_slug) and the source's own per-entry org mix (the dominant lab and its share). A cross-check on the pool-derived composition axis: agree/disagree records whether the two concur. An annotation, never a gate — a vendor-populated source is warned but never drops a candidate; unknown means there is neither an owner nor a payload org mix.",
  focusCrossSource: "Cross-source: the zeroeval per-entry price/context compared against the plugin's own price/context for the models carrying the metric (the median relative divergence, within a 0.5 tolerance). The speed figure is informational only (rps vs tok/s). An annotation, never a gate — it never feeds the 1/price² blend; unknown means no model joined or the payload carried none of the four fields.",
  imageFilter: "Require image input (filters.image) — the gate that shrinks the vision role's eligible set.",
  providerPin: "Hard provider pin: the OpenRouter provider slug this role's requests are routed to (a tiered slug like deepinfra/fp8 is accepted verbatim). Setting it opts the role out of the automatic best-route pin; empty = default OpenRouter routing.",
  autoPin: "Automatic provider pin (candidate): this model's best route by the role's value-for-money score — the first route the updater's daily run tries. The updater probes that route with a one-token request bound to it (provider: { only: [slug] }) and skips to the next route when OpenRouter does not serve it, dropping the pin entirely (bare selector, OpenRouter's own routing) when none is routable — so the pin that gets written can be a later route, or absent.",
  features: "Opt-in capability presets (issue #40). Each flag applies the plugin's recommended settings for that capability to this role; an explicit knob value always wins. Export writes the flag, not the expanded values, so a future change to the recommendation keeps reaching the role.",
  featureState: "inherit = use the global flag (features.<id> in the lock file); on/off = a per-role override (roles.<role>.features.<id>) that beats the global in either direction.",
  featureKnob: "An individual knob the capability's recommended bundle fills. Leave it at inherit to take the recommendation; set a value to override it (an explicit value always wins over the flag).",
  featureDerived: "derived = this value comes from the enabled capability's recommended bundle, not from an explicit key in the role. Set the knob to make it authored.",
  thinking: "Thinking level appended to the role's selector (`:level`) and used to scale the price axis. The factor (3ρ+1+T)/(3ρ+1) applies only to models that will actually run the level (omp catalog `thinking[]` membership; meta levels off/auto need only a non-empty list). Bare = no suffix — the session's defaultThinkingLevel applies and the price is unadjusted.",
  thinkingBare: "Bare (no suffix). Not restorable once the role's shipped default or the lock file sets a level: the plugin deep-merges roles over DEFAULT_ROLES, so an omitted key keeps the inherited value.",
  normalize: "Rescale every weight so the sum is 1.0 (the parked ε is rescaled too).",
  addMetric: "Add a metric at weight 0.05, then Normalize.",
  resetEffective: "Discard edits and restore the role's saved (effective) definition.",
  resetDefaults: "Restore the shipped default definition from src/settings.ts.",
  newRole: "Create a new role from a template (general/code/price/throughput), then tune it and Export. The plugin ranks any role in its settings; an agent must pin @<role> to route to it.",
  description: "One-line role description, shown in the report and the role tab tooltip.",
  enabled: "Whether the plugin ranks this role at all. A disabled role is dropped from the resolved set (and the agent that pins it is disabled), but it still ranks and exports here.",
  disabled: "Disabled — the plugin does not rank this role until Enabled is checked.",
  locked: "Locked — the plugin still ranks this role, but never rewrites its selector or fallback chain, and never removes it.",
  dropInherited: "set to ~0 — the plugin deep-merges weights over the shipped defaults, so an inherited metric cannot be removed",
  dropAdded: "remove — this metric is not in the shipped default, so the key is deleted outright",
  exportBtn: "Write the edited roles and global settings into the plugin lock file (a .bak-<timestamp> sibling is written first); takes effect on the next /refresh-roles in any running session — the lock file is re-read from disk on every run.",
  copy: "Copy the export payload (the dirty roles plus the edited global settings) to the clipboard.",
  download: "Download the export payload (the dirty roles plus the edited global settings) as JSON.",
  settings: "Global settings for this scope, read from the plugin lock file. The input shows the effective value (authored, else the shipped default); Export writes only the keys you change, and a cleared field falls back to the shipped default.",
  settingsNoImpact: "Editable, but it has no visual impact: it changes a session behaviour (activateDefaultOnEmptySession) or a side channel (errorReporting), not the ranking or the decision preview.",
  globalFeatures: "Global capability flags (features.<id>): a role's own features.<id> overrides the global in either direction. Export writes the flag, not the expanded values.",
  selection: "Model selection rule: value (best value, today's behaviour) or cheapest (the cheapest model clearing qualityFloor).",
  errorReporting: "File unexpected plugin errors as GitHub issues: off, ask, or auto.",
  tokenProfile: "Per-task token mix for the per-task price, used when the role has no recorded usage. Both fields are required together; clear both to unset.",
  probeOptimistic: "The preview is probe-optimistic: it never issues a request. The candidate set, the keyed prune, the ladder, the chain and the side effects are the updater's own code; the probe walk can still drop a candidate or skip the pinned route, so the written pin can be a later route or absent.",
  preview: "What the updater would write for this scope, from the edited settings and role defs. Read-only: it never writes config.yml or the lock file.",
  previewChain: "The fallback chain the updater would write, keyed by the chain key (the selector without its thinking suffix). Two roles on the same model share one chain key.",
  previewFlags: "Why a candidate left the pool: endpoint-blocked (the role's endpoint filters), pin-blocked (the provider pin matched no route), key-blocked (the keyed catalog cannot run it), probe-blocked (the probe walk rejected it), route-blocked (the auto-pin's route probe rejected the slug).",
  endpointFilters: "Per-role endpoint filters: a candidate whose standard-tier routes cannot satisfy these leaves the pool. An empty field inherits (no filter); a value overrides the capability bundle that recommends it.",
  filterTools: "filters.tools — require a route that can call tools.",
  filterMinContextTokens: "filters.minContextTokens — require a route whose context window is at least this many tokens.",
  filterMinOutputTokens: "filters.minOutputTokens — require a route whose output ceiling is at least this many tokens.",
  filterMaxPrice: "filters.maxPriceUsdPerM — drop routes priced above this $/M.",
  filterMinThroughput: "filters.preferredMinThroughput — prefer routes with at least this output throughput (tok/s).",
};

/* Per-setting explanations for the Settings panel, keyed by the flat dotted
 * key. The panel renders one control per key of `settings.defaults`, so a
 * setting added to the schema shows up here with a generic row until it gets a
 * tip. */
const GLOBAL_TIPS = {
  switchMargin: "Value margin a challenger must beat the incumbent by before switching.",
  priceSwitchFraction: "Adopt a challenger inside the margin when it is at least this fraction cheaper (0 disables).",
  writeFallbackChains: "Write per-role fallback chains into config.yml.",
  fallbackChainDepth: "Number of fallback models per role chain.",
  fallbackQualityFloor: "Quality floor for a cheaper-or-equal fallback: the fraction of the chosen model's quality it must retain (0 disables).",
  selection: "Model selection rule: value (best value) or cheapest (the cheapest model clearing qualityFloor).",
  qualityFloor: "In cheapest mode, the fraction of the pool's highest-q model's quality a cheaper candidate must retain (0 disables; inert in value mode).",
  activateDefaultOnEmptySession: "Reapply the new default selector to an empty session's active model. No visual impact.",
  errorReporting: "File unexpected plugin errors as GitHub issues (off, ask, auto). No visual impact.",
  "tokenProfile.inputTokens": "Input tokens per task for the per-task price (used when the role has no recorded usage).",
  "tokenProfile.outputTokens": "Output tokens per task for the per-task price (used when the role has no recorded usage).",
};

/* The numeric ranges the server validates, mirrored so the panel can show the
 * error as you type instead of only on Export. A key absent here is not a
 * number (a boolean or an enum) and needs no range check. */
const GLOBAL_RANGES = {
  switchMargin: { min: 0, max: 1, step: 0.001 },
  priceSwitchFraction: { min: 0, max: 1, step: 0.001 },
  fallbackChainDepth: { min: 0, step: 1, integer: true },
  fallbackQualityFloor: { min: 0, max: 1, step: 0.001 },
  qualityFloor: { min: 0, max: 1, step: 0.001 },
  "tokenProfile.inputTokens": { min: 0, step: 1 },
  "tokenProfile.outputTokens": { min: 0, step: 1 },
};

/* The five per-role endpoint filters, rendered as first-class fields. The four
 * a capability bundle also recommends are skipped by `bundleKnobs`, so one def
 * key has exactly one input; `cacheHitRate` and `preferOwnProvider` stay
 * bundle-only. */
const ENDPOINT_FILTERS = [
  { key: "filters.tools", kind: "boolean", label: "tools", tip: TIPS.filterTools },
  { key: "filters.minContextTokens", kind: "number", label: "minContextTokens", tip: TIPS.filterMinContextTokens },
  { key: "filters.minOutputTokens", kind: "number", label: "minOutputTokens", tip: TIPS.filterMinOutputTokens },
  { key: "filters.maxPriceUsdPerM", kind: "number", label: "maxPriceUsdPerM", tip: TIPS.filterMaxPrice },
  { key: "filters.preferredMinThroughput", kind: "number", label: "preferredMinThroughput", tip: TIPS.filterMinThroughput },
];

/** The four def keys a capability bundle also recommends: rendered as
 * first-class endpoint-filter fields, so `bundleKnobs` skips them. */
const BUNDLE_SKIPPED_KEYS = ["filters.tools", "filters.minOutputTokens", "filters.maxPriceUsdPerM", "filters.preferredMinThroughput"];

function metricTip(metric) {
  const meta = state.metricMeta[metric];
  if (!meta) return metric;
  const lines = [meta.label + " (" + metric + ") — " + meta.unit, "cardinal t = " + meta.formula, "anchors: " + meta.anchors];
  if (meta.kind === "price") lines.push("penalty axis: value = q − λ·price, never blended into q");
  return lines.join("\n");
}

let tipEl = null;
let tipOwner = null;

function hideTip() {
  tipOwner = null;
  if (tipEl) tipEl.classList.remove("show");
}

function placeTip(event) {
  const pad = 12;
  const rect = tipEl.getBoundingClientRect();
  let left = event.clientX + pad;
  let top = event.clientY + pad;
  if (left + rect.width > window.innerWidth - 8) left = event.clientX - rect.width - pad;
  if (top + rect.height > window.innerHeight - 8) top = event.clientY - rect.height - pad;
  tipEl.style.left = Math.max(4, left) + "px";
  tipEl.style.top = Math.max(4, top) + "px";
}

function tipTarget(node) {
  return node instanceof Element ? node.closest("[data-tip]") : null;
}

/** One delegated pair of listeners for the whole SPA: any element carrying a
 * `data-tip` attribute gets the floating tooltip, so re-rendered tables and
 * editors need no per-node wiring. */
function initTips() {
  tipEl = el("div", { id: "tip" });
  document.body.append(tipEl);
  document.addEventListener("mouseover", (event) => {
    const target = tipTarget(event.target);
    if (!target || target === tipOwner) return;
    tipOwner = target;
    tipEl.textContent = target.dataset.tip;
    tipEl.classList.add("show");
    placeTip(event);
  });
  document.addEventListener("mousemove", (event) => {
    if (!tipOwner) return;
    if (tipOwner.isConnected && tipTarget(event.target) === tipOwner) placeTip(event);
    else hideTip();
  });
  document.addEventListener("mouseout", (event) => {
    if (tipOwner && !tipOwner.contains(event.relatedTarget)) hideTip();
  });
  document.addEventListener("scroll", hideTip, true);
}

// ---------------------------------------------------------------------------
// Header + role tabs
// ---------------------------------------------------------------------------

/** Header availability summary. When the keyed catalog is active it reports the
 * allowlist size; otherwise it names the OpenRouter setting that turns it on and
 * every row's mark reads unknown. */
function availabilitySpan() {
  const a = state.availability;
  if (a && a.active) {
    return el("span", { "data-tip": TIPS.availability, text: "key: " + a.keyedCount + " usable / " + a.blockedCount + " blocked" });
  }
  return el("span", { class: "muted", "data-tip": TIPS.availability, text: "availability unknown — enable OpenRouter → Settings → \"Filter the model catalog for API keys\"" });
}

/** The scope selector: the user-level scope plus every known project. A scope
 * whose lock file is gone is disabled with a reason tooltip. */
function scopeSelect() {
  const sel = el("select", { id: "scope", "data-tip": TIPS.scope });
  for (const s of state.scopes) {
    sel.append(
      el("option", {
        value: s.id,
        text: s.label,
        disabled: s.present ? null : "",
        title: s.present ? null : "unavailable — lock file missing",
      }),
    );
  }
  sel.value = state.activeScope;
  sel.addEventListener("change", onScopeChange);
  return sel;
}

/** The pool selector: the raw dataset (account-agnostic, key-blocked models
 * kept with their verdicts) or the as-written pool (the catalog/tier gate +
 * allowed-providers prune + keyed-catalog prune the updater ranks on). The
 * value is the server's mode, so the header always names the active pool. */
function poolSelect() {
  const sel = el("select", { id: "pool", "data-tip": TIPS.pool });
  sel.append(
    el("option", { value: "raw", text: "raw pool" }),
    el("option", { value: "as-written", text: "as-written pool" }),
  );
  sel.value = state.poolMode;
  sel.addEventListener("change", onPoolChange);
  return sel;
}

function renderMeta(data) {
  const meta = document.getElementById("meta");
  meta.textContent = "";
  meta.append(
    el("span", { class: "brand", text: "omp-llm-role explorer" }),
    el("span", { class: "sep", text: "·" }),
    scopeSelect(),
    el("span", { class: "sep", text: "·" }),
    poolSelect(),
    el("span", { class: "sep", text: "·" }),
    el("span", { "data-tip": TIPS.models, text: data.modelCount + " models" }),
    el("span", { class: "sep", text: "·" }),
    el("span", { "data-tip": TIPS.fetched, text: "fetched " + data.fetchedAt.slice(0, 10) }),
    el("span", { class: "sep", text: "·" }),
    el("span", { "data-tip": TIPS.orJoin, text: "OpenRouter " + data.orMatched + " matched / " + data.orPriced + " priced" }),
    el("span", { class: "sep", text: "·" }),
    availabilitySpan(),
    el("span", { class: "sep", text: "·" }),
    el("span", { class: "lock", "data-tip": TIPS.lock, text: "lock: " + data.lockPath }),
    el("button", { id: "refresh", "data-tip": TIPS.refresh, text: "Refresh data", onclick: onRefresh }),
  );
}

function renderRoles() {
  const nav = document.getElementById("roles");
  nav.textContent = "";
  for (const role of Object.keys(state.universe)) {
    const entry = state.universe[role];
    const dirty = JSON.stringify(state.defs[role]) !== JSON.stringify(state.effective[role]);
    const classes = ["tab", "kind-" + (entry.kind || "default")];
    if (role === state.role) classes.push("active");
    if (dirty) classes.push("dirty");
    if (!entry.enabled) classes.push("disabled");
    if (entry.locked) classes.push("locked");
    const notes = [state.defs[role].description || ""];
    if (!entry.enabled) notes.push(TIPS.disabled);
    if (entry.locked) notes.push(TIPS.locked);
    nav.append(
      el("button", {
        class: classes.join(" "),
        "data-tip": notes.filter(Boolean).join("\n\n") || null,
        text: role,
        onclick: () => selectRole(role),
      }),
    );
  }
  nav.append(el("button", { class: "tab new", "data-tip": TIPS.newRole, text: "+ new role", onclick: onNewRole }));
}

/** Keep the tab's disabled tint in step with the edited def: `universe` is the
 * boot-time snapshot, but the Enabled toggle and the reset buttons change what
 * the plugin would resolve, and the tab must not lie until the next reload. */
function syncUniverseEnabled(role) {
  if (state.universe[role]) state.universe[role].enabled = state.defs[role].enabled !== false;
}

/** Keep the tab's lock marker in step with the edited def, same as the enabled
 * tint: `locked` is absent when unlocked, so the tab must not lie until reload. */
function syncUniverseLocked(role) {
  if (state.universe[role]) state.universe[role].locked = state.defs[role].locked === true;
}

/** Create a role from a template so it can be tuned and exported. The plugin
 * ranks any role in its settings; the name must be a valid omp role alias. */
function onNewRole() {
  const name = (window.prompt("New role name ([A-Za-z0-9_-]+, not main/sub):") || "").trim();
  if (!name) return;
  if (!/^[A-Za-z0-9_-]+$/.test(name) || /^(main|sub)$/i.test(name)) {
    alert("Invalid role name: " + name);
    return;
  }
  if (state.defs[name]) {
    alert("Role already exists: " + name);
    return;
  }
  state.defs[name] = {
    description: "",
    weights: { general: 0.35, code: 0.2, price: 0.25, throughput: 0.2 },
    required: ["general", "price", "throughput"],
  };
  state.universe[name] = { kind: "user", enabled: true, locked: false, def: state.defs[name] };
  state.exportMessage = "";
  selectRole(name);
}

function selectRole(role) {
  state.role = role;
  state.selectedId = null;
  state.explain = null;
  state.exportMessage = "";
  renderRoles();
  renderEditor();
  renderExplain();
  recompute();
}

// ---------------------------------------------------------------------------
// Ranking table
// ---------------------------------------------------------------------------

let recomputeTimer = null;

function scheduleRecompute() {
  if (recomputeTimer) clearTimeout(recomputeTimer);
  recomputeTimer = setTimeout(recompute, 120);
  // Any edit (a role def or a global setting) also re-runs the decision preview.
  schedulePreview();
}

async function recompute() {
  if (!state.role) return;
  let data;
  try {
    data = await api("/api/rank", { role: state.role, def: state.defs[state.role], settings: state.settingsEdited });
  } catch (err) {
    state.errors = [err.message];
    renderErrors();
    return;
  }
  state.rows = data.rows;
  state.selection = data.selection;
  state.lambda = data.lambda;
  state.derivedLambda = data.derivedLambda;
  state.errors = data.errors;
  renderErrors();
  renderTable();
  updateReadouts();
  if (state.selectedId && state.rows.some((r) => r.id === state.selectedId)) loadExplain(state.selectedId);
  else if (state.selectedId) {
    state.selectedId = null;
    state.explain = null;
    renderExplain();
  }
}

// ---------------------------------------------------------------------------
// Preview panel (what the updater would write)
// ---------------------------------------------------------------------------

let previewTimer = null;

/** Debounced like `scheduleRecompute`: any edit re-runs the preview. */
function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(runPreview, 150);
}

/** Ask the server for the decision preview on the edited settings and defs. The
 * preview is read-only and probe-optimistic; the server owns the decision. */
async function runPreview() {
  let data;
  try {
    data = await api("/api/preview", { settings: state.settingsEdited, roles: state.defs });
  } catch (err) {
    state.preview = null;
    state.previewErrors = [err.message];
    renderPreview();
    return;
  }
  state.preview = data.preview;
  state.previewErrors = data.errors || [];
  renderPreview();
}

/** The chain key a decision's selector belongs to: the selector without its
 * thinking suffix (the updater's own `key` derivation). The suffix is the role's
 * RESOLVED thinking level — the authored value, else the shipped default —
 * because the preview computes it from the resolved def, so a role inheriting a
 * shipped default level still gets a suffixed selector. */
function chainKeyFor(decision) {
  const def = state.defs[decision.role];
  const shipped = state.defaults[decision.role];
  const suffix = def && def.thinking !== undefined ? def.thinking : shipped ? shipped.thinking : undefined;
  if (suffix && decision.to.endsWith(":" + suffix)) return decision.to.slice(0, -(suffix.length + 1));
  return decision.to;
}

/** Why a candidate left the pool, as one compact line. */
function decisionFlags(d) {
  const parts = [];
  if (d.endpointBlocked && d.endpointBlocked.length) parts.push("endpoint-blocked " + d.endpointBlocked.length);
  if (d.pinBlocked && d.pinBlocked.length) parts.push("pin-blocked " + d.pinBlocked.length);
  if (d.keyBlockedCount) parts.push("key-blocked " + d.keyBlockedCount);
  if (d.pinDropped) parts.push("pin dropped");
  if (d.routeBlockedSlugs && d.routeBlockedSlugs.length) parts.push("route-blocked " + d.routeBlockedSlugs.length);
  if (d.blocked && d.blocked.length) parts.push("probe-blocked " + d.blocked.length);
  return parts.join(" · ") || "—";
}

function renderPreview() {
  const panel = document.getElementById("preview");
  if (!panel) return;
  panel.textContent = "";
  panel.append(
    el("h2", {}, [
      el("span", { "data-tip": TIPS.preview, text: "Preview — what the updater would write" }),
      el("span", { class: "probe-label", "data-tip": TIPS.probeOptimistic, text: "probe-optimistic" }),
    ]),
  );
  if (state.previewErrors.length) {
    const box = el("div", { class: "errors" });
    for (const e of state.previewErrors) box.append(el("div", { class: "err", text: e }));
    panel.append(box);
  }
  const p = state.preview;
  if (!p) {
    panel.append(el("p", { class: "muted", text: "…" }));
    return;
  }

  panel.append(el("h3", { text: "Decisions (" + p.decisions.length + ")" }));
  if (p.decisions.length === 0) {
    panel.append(el("p", { class: "muted", text: "No managed role could be decided." }));
  } else {
    const table = el("table", { class: "preview" });
    table.append(
      el("thead", {}, el("tr", {}, [
        el("th", { text: "role" }),
        el("th", { text: "from → to" }),
        el("th", { text: "reason" }),
        el("th", { class: "num", text: "value" }),
        el("th", { class: "num", text: "best" }),
        el("th", { "data-tip": TIPS.previewChain, text: "chain" }),
        el("th", { "data-tip": TIPS.previewFlags, text: "flags" }),
      ])),
    );
    const body = el("tbody");
    for (const d of p.decisions) {
      const key = chainKeyFor(d);
      const chain = p.chains ? p.chains[key] : undefined;
      body.append(
        el("tr", {}, [
          el("td", { class: "role", text: d.role }),
          el("td", { class: "sel", text: (d.from || "—") + " → " + (d.to || "—") }),
          el("td", { class: "reason reason-" + d.reason, text: d.reason }),
          el("td", { class: "num", text: fmt(d.value, 3) }),
          el("td", { class: "num", text: fmt(d.bestValue, 3) }),
          el("td", { class: "chain", text: chain ? key + ": " + chain.join(", ") : key }),
          el("td", { class: "flags", text: decisionFlags(d) }),
        ]),
      );
    }
    table.append(body);
    panel.append(table);
  }

  panel.append(el("h3", { text: "Config side effects" }));
  const fx = el("ul", { class: "side-effects" });
  fx.append(el("li", { text: "role removals: " + (p.roleRemovals.length ? p.roleRemovals.join(", ") : "none") }));
  fx.append(el("li", { text: "agent-disable adds: " + (p.agentDisableAdds.length ? p.agentDisableAdds.join(", ") : "none") }));
  fx.append(el("li", { text: "agent-disable removes: " + (p.agentDisableRemoves.length ? p.agentDisableRemoves.join(", ") : "none") }));
  fx.append(el("li", { text: "chain prunes: " + (p.chainPrunes.length ? p.chainPrunes.join(", ") : "none") }));
  panel.append(fx);

  panel.append(el("h3", { text: "Skipped (" + p.skipped.length + ")" }));
  if (p.skipped.length === 0) {
    panel.append(el("p", { class: "muted", text: "Every managed role was decided." }));
  } else {
    const ul = el("ul", { class: "skipped" });
    for (const s of p.skipped) ul.append(el("li", { text: s.role + " — " + s.reason }));
    panel.append(ul);
  }
}

/** Tooltip text for one key verdict. The server owns the verdict; the client
 * only explains it, so the three states cannot drift from the ranking. */
function keyTip(key) {
  if (key === "usable") return "usable — your OpenRouter key can run this model (in the keyed catalog)";
  if (key === "blocked") return "key-blocked — the public catalog has this model but your key cannot run it (OpenRouter → Settings → \"Filter the model catalog for API keys\")";
  return "unknown — the keyed catalog is inactive or this model is in neither catalog (OpenRouter → Settings → \"Filter the model catalog for API keys\")";
}

/** Three-state key badge. Renders exactly the verdict the server sent; the
 * client never invents an availability rule. */
function keyBadge(key) {
  const state_ = key === "usable" || key === "blocked" ? key : "unknown";
  return el("span", { class: "badge " + state_, "data-tip": keyTip(state_), text: state_ });
}

function renderTable() {
  const table = document.getElementById("table");
  table.textContent = "";
  table.append(
    el("thead", {}, el("tr", {}, [
      el("th", { "data-tip": TIPS.rank, text: "#" }),
      el("th", { "data-tip": TIPS.delta, text: "Δ" }),
      el("th", { "data-tip": TIPS.frontier, text: "★" }),
      el("th", { text: "model" }),
      el("th", { text: "org" }),
      el("th", { "data-tip": TIPS.key, text: "key" }),
      el("th", { class: "num", "data-tip": TIPS.value, text: "value" }),
      el("th", { class: "num", "data-tip": TIPS.q, text: "q" }),
      el("th", { class: "num", "data-tip": TIPS.price, text: "$/M" }),
      el("th", { class: "num", "data-tip": TIPS.perTask, text: "$/task" }),
      el("th", { class: "num", "data-tip": TIPS.throughput, text: "tok/s" }),
      el("th", { class: "num", "data-tip": TIPS.context, text: "ctx" }),
    ])),
  );
  const tbody = el("tbody");
  const filter = state.filter.toLowerCase();
  let rows = state.rows;
  if (filter) rows = rows.filter((r) => (r.name + " " + r.org + " " + r.id).toLowerCase().includes(filter));
  if (state.topn !== "all") rows = rows.slice(0, Number(state.topn));
  // Order: text filter → top-n slice → hide-blocked drop. The drop runs last so
  // the top-n count is the ranking's own prefix, not a post-filter count.
  if (state.hideBlocked) rows = rows.filter((r) => r.key !== "blocked");
  for (const r of rows) {
    // Row marks: `selected` is the clicked row, `pick` the selection rule's
    // prospective model, `excluded` a candidate the bar dropped. The pick is
    // never re-derived here — it is the server's `selection.pick`.
    const classes = ["row"];
    if (r.id === state.selectedId) classes.push("selected");
    if (state.selection && r.id === state.selection.pick) classes.push("pick");
    if (r.excludedByBar === true) classes.push("excluded");
    tbody.append(
      el("tr", { class: classes.join(" "), onclick: () => selectModel(r.id) }, [
        el("td", { class: "num", text: String(r.rank) }),
        el("td", { class: "delta " + deltaClass(r.delta), text: deltaText(r.delta) }),
        el("td", { class: "star", text: r.frontier ? "★" : "" }),
        el("td", { class: "model", text: r.name }),
        el("td", { class: "org", text: r.org }),
        el("td", { class: "key" }, keyBadge(r.key)),
        el("td", { class: "num", text: fmt(r.value, 3) }),
        el("td", { class: "num", text: fmt(r.q, 3) }),
        el("td", { class: "num", text: fmt(r.priceEff, 2) }),
        el("td", { class: "num", text: fmtUsd(r.perTask) }),
        el("td", { class: "num", text: r.throughput === null ? "—" : fmt(r.throughput, 0) }),
        el("td", { class: "num", text: r.context === null ? "—" : fmtCtx(r.context) }),
      ]),
    );
  }
  table.append(tbody);
  renderSelection();
}

/** The selection readout: the bar (cheapest mode only) and the candidates it
 * excluded. Both are absent in `value` mode, which has no bar. The bar is the
 * threshold q against the anchor's q, with the floor named; the fill shows the
 * threshold as a share of the anchor's q. The excluded list names each dropped
 * candidate and the weighted metrics its q is missing (they contribute 0). */
function renderSelection() {
  const barBox = document.getElementById("selection-bar");
  const exBox = document.getElementById("excluded");
  if (!barBox || !exBox) return;
  barBox.textContent = "";
  exBox.textContent = "";
  const sel = state.selection;
  if (!sel || sel.mode !== "cheapest" || sel.bar === null) return;
  const rowOf = (id) => state.rows.find((r) => r.id === id) || null;
  const anchorQ = sel.anchorQ;
  const frac = anchorQ > 0 ? Math.max(0, Math.min(1, sel.bar / anchorQ)) : 0;
  const bar = el("div", { class: "bar", "data-tip": TIPS.bar });
  const fill = el("div", { class: "fill" });
  fill.style.width = frac * 100 + "%";
  bar.append(fill);
  const anchor = rowOf(sel.anchor);
  const pick = rowOf(sel.pick);
  barBox.append(
    el("div", { class: "sel-line" }, [
      el("span", { class: "sel-title", text: "cheapest above the bar" }),
      el("span", { class: "muted", text: "floor " + fmt(sel.floor, 2) + " × anchor q " + fmt(anchorQ, 3) + " = bar " + fmt(sel.bar, 3) }),
    ]),
    el("div", { class: "sel-bar" }, [
      bar,
      el("span", { class: "muted", text: "bar " + fmt(sel.bar, 3) + " of anchor q " + fmt(anchorQ, 3) }),
    ]),
    el("div", { class: "sel-line" }, [
      el("span", { class: "muted", text: "anchor: " + (anchor ? anchor.name : sel.anchor) + " (q " + fmt(anchorQ, 3) + ")" }),
      el("span", { class: "muted", "data-tip": TIPS.pick, text: "pick: " + (pick ? pick.name : sel.pick) + (pick ? " (q " + fmt(pick.q, 3) + ")" : "") }),
    ]),
  );
  const excluded = state.rows.filter((r) => r.excludedByBar === true);
  if (excluded.length === 0) return;
  exBox.append(
    el("div", { class: "excluded-head", "data-tip": TIPS.excluded, text: "excluded by the bar — " + excluded.length + " candidate(s) under q " + fmt(sel.bar, 3) }),
  );
  const list = el("ul", { class: "excluded-list" });
  for (const r of excluded) {
    const li = el("li", {}, [
      el("span", { class: "model", text: r.name }),
      el("span", { class: "muted", text: " q " + fmt(r.q, 3) + " · missing: " }),
    ]);
    if (r.missing && r.missing.length) {
      r.missing.forEach((m, i) => {
        if (i > 0) li.append(document.createTextNode(", "));
        li.append(el("span", { class: "metric", "data-tip": metricTip(m), text: metricLabel(m) }));
      });
    } else {
      li.append(el("span", { class: "muted", text: "none — its q is measured" }));
    }
    list.append(li);
  }
  exBox.append(list);
}

function selectModel(id) {
  state.selectedId = id;
  renderTable();
  loadExplain(id);
}

// ---------------------------------------------------------------------------
// Explain panel
// ---------------------------------------------------------------------------

async function loadExplain(id) {
  try {
    state.explain = await api("/api/explain", { role: state.role, def: state.defs[state.role], modelId: id, settings: state.settingsEdited });
  } catch (err) {
    state.explain = { eligible: false, reasons: [err.message] };
  }
  renderExplain();
}

function renderExplain() {
  const panel = document.getElementById("explain");
  panel.textContent = "";
  const ex = state.explain;
  if (!ex) {
    panel.append(el("p", { class: "muted", text: "Click a row to see why it ranks where it does." }));
    return;
  }
  if (!ex.eligible) {
    panel.append(el("h2", { text: "Not eligible" }));
    const ul = el("ul", { class: "reasons" });
    for (const reason of ex.reasons) ul.append(el("li", { text: reason }));
    panel.append(ul);
    return;
  }

  panel.append(el("h2", { text: ex.model.name }));
  panel.append(
    el("p", {
      class: "sub",
      "data-tip": TIPS.explainSub,
      text: ex.model.org + " · rank " + ex.rank + " of " + ex.total + " · value " + fmt(ex.value, 3) + " · q " + fmt(ex.q, 3) + " · $" + fmt(ex.priceEff, 2) + "/M",
    }),
  );

  // Key verdict line: the server's overlay verdict, plus the reason and the
  // OpenRouter setting name when the keyed catalog is not active.
  let keyLine = "key: " + keyTip(ex.key);
  if (ex.keyReason !== "active") keyLine += " (reason: " + ex.keyReason + ")";
  panel.append(el("p", { class: "sub key-line", "data-tip": TIPS.key, text: keyLine }));

  // The pin basis: a manual pin (from the edited def) overrides the automatic
  // best-route pin the updater would write. Read-only here.
  const manualPin = state.defs[state.role]?.providerPin;
  if (manualPin) {
    panel.append(el("p", { class: "sub pin-line", "data-tip": TIPS.providerPin, text: "pin: " + manualPin + " (manual)" }));
  } else if (ex.autoPin) {
    // The candidate route — the first route the updater's value-ordered walk
    // tries — not a promise of the written pin: the updater probes it and skips
    // to the next route when OpenRouter does not serve it, or drops the pin
    // entirely when none is routable (spec #90). Read-only, offline: the
    // explorer cannot probe, so it names the candidate and says so in the tip.
    panel.append(el("p", { class: "sub pin-line", "data-tip": TIPS.autoPin, text: "auto pin (candidate): " + ex.autoPin }));
  }

  panel.append(el("h3", { "data-tip": TIPS.composition, text: "Value composition" }));
  const comp = el("table", { class: "comp" });
  comp.append(
    el("thead", {}, el("tr", {}, [
      el("th", { text: "metric" }),
      el("th", { class: "num", "data-tip": TIPS.raw, text: "raw" }),
      el("th", { class: "num", "data-tip": TIPS.t, text: "t" }),
      el("th", { class: "num", "data-tip": TIPS.weight, text: "weight" }),
      el("th", { class: "num", "data-tip": TIPS.contrib, text: "contrib" }),
      el("th", { "data-tip": TIPS.share, text: "" }),
    ])),
  );
  const cbody = el("tbody");
  for (const c of ex.contributions) {
    const bar = el("div", { class: "bar" });
    const fill = el("div", { class: "fill" });
    fill.style.width = Math.max(0, Math.min(1, c.shareOfQ)) * 100 + "%";
    bar.append(fill);
    cbody.append(
      el("tr", { class: c.raw === null ? "missing-row" : "" }, [
        el("td", { "data-tip": metricTip(c.metric), text: metricLabel(c.metric) }),
        el("td", { class: "num", text: c.raw === null ? "—" : fmt(c.raw, 2) }),
        el("td", { class: "num", text: c.t === null ? "—" : fmt(c.t, 3) }),
        el("td", { class: "num", text: (c.renormWeight * 100).toFixed(1) + "%" }),
        el("td", { class: "num", text: fmt(c.contribution, 3) }),
        el("td", { class: "barcell" }, bar),
      ]),
    );
    if (c.raw === null) {
      cbody.append(el("tr", { class: "note-row" }, el("td", { colspan: "6", class: "muted", text: metricLabel(c.metric) + ": missing → contributes 0" })));
    } else if (c.fillNote) {
      cbody.append(el("tr", { class: "note-row" }, el("td", { colspan: "6", class: "muted", text: metricLabel(c.metric) + ": " + c.fillNote })));
    }
  }
  comp.append(cbody);
  panel.append(comp);

  panel.append(el("h3", { "data-tip": TIPS.lambda, text: "Cost" }));
  const derived = ex.role.lambda === ex.role.derivedLambda;
  panel.append(el("p", { class: "cost", "data-tip": TIPS.lambda, text: "λ = " + ex.role.lambda.toFixed(5) + " $/quality-point" + (derived ? " (derived = " + LAMBDA_DERIVATION + ")" : " (override)") }));
  const thinkNote = ex.role.thinking === undefined ? "bare" : ":" + ex.role.thinking;
  const cacheNote = ex.role.cacheHitRate > 0 ? " · cache " + ex.role.cacheHitRate : "";
  const ownNote = ex.ownProvider ? " · best route" : "";
  panel.append(el("p", { class: "cost", "data-tip": TIPS.costPenalty, text: "eff price $" + fmt(ex.cost.priceEff, 2) + "/M" + (ex.cost.priceEff !== ex.cost.billedPrice ? " (billed $" + fmt(ex.cost.billedPrice, 2) + " × " + thinkNote + ")" : " (" + thinkNote + ")") + cacheNote + ownNote + " · penalty = λ·price = " + fmt(ex.cost.penalty, 4) + " · value = q − penalty = " + fmt(ex.cost.value, 4) }));

  // The per-task price breakdown: display-only, so it sits apart from the
  // ranking's cost line. A muted note when no token profile resolved (never a
  // silent zero).
  panel.append(el("h3", { "data-tip": TIPS.perTask, text: "Per-task price" }));
  if (ex.perTask) {
    const p = ex.perTask;
    panel.append(
      el("p", {
        class: "cost",
        "data-tip": TIPS.perTask,
        text: "per task: " + fmtTokens(p.inputTokens) + " in × $" + fmt(p.inputPrice, 3) + "/M + " + fmtTokens(p.outputTokens) + " out × $" + fmt(p.outputPrice, 3) + "/M × " + p.thinkingFactor.toFixed(3) + " = " + fmtUsd(p.total),
      }),
    );
  } else {
    panel.append(el("p", { class: "cost muted", "data-tip": TIPS.perTask, text: "per task: — (no token profile — record usage or set tokenProfile)" }));
  }

  panel.append(el("h3", { "data-tip": TIPS.whyNotHigher, text: "Why not higher" }));
  if (ex.gapAbove === null) {
    panel.append(el("p", { class: "muted", text: "Already #1 for this role." }));
  } else {
    panel.append(el("p", { text: "Gap to " + ex.above.name + " (#" + (ex.rank - 1) + "): " + fmt(ex.gapAbove, 4) + " value" }));
    const ul = el("ul", { class: "closing" });
    for (const c of ex.closing) {
      let text;
      if (c.metric === "price") {
        text = "eff price would need to drop to $" + fmt(c.targetRaw, 2) + "/M";
        if (c.note) text += " — " + c.note;
      } else if (c.targetRaw === null) {
        text = metricLabel(c.metric) + ": " + (c.note || "unreachable");
      } else {
        const unit = state.metricMeta[c.metric] ? state.metricMeta[c.metric].unit : "";
        text = metricLabel(c.metric) + ": " + fmt(c.raw, 2) + " → " + fmt(c.targetRaw, 2) + " " + unit + " (" + (c.deltaRaw >= 0 ? "+" : "−") + fmt(Math.abs(c.deltaRaw), 2) + ")";
        if (c.note) text += " — " + c.note;
      }
      ul.append(el("li", { text }));
    }
    panel.append(ul);
  }

  panel.append(el("h3", { "data-tip": TIPS.dominated, text: "Dominated by" }));
  if (ex.dominators.length === 0) {
    panel.append(el("p", { class: "muted", text: "No model is both cheaper and at least as good (Pareto-optimal)." }));
  } else {
    const ul = el("ul", { class: "dominators" });
    for (const d of ex.dominators) ul.append(el("li", { text: d.name + " — $" + fmt(d.priceEff, 2) + "/M, q " + fmt(d.q, 3) }));
    panel.append(ul);
  }

  // The two price-lever readouts are role-level (computed on the pool the
  // ranking above uses), so they close the panel. Each is absent when the
  // server sends null: no cheaper challenger, or a bare role.
  const flip = ex.leaderFlip;
  const levels = ex.thinkingLevels;
  if (flip || levels) {
    panel.append(el("h3", { "data-tip": TIPS.levers, text: "Price levers" }));
    if (flip) {
      const ratio = flip.wPrice > 0 ? (flip.flipW / flip.wPrice).toFixed(2) + "×" : "—";
      panel.append(
        el("p", {
          class: "cost",
          "data-tip": TIPS.leaderFlip,
          text: "leader flip: w* = " + flip.flipW.toFixed(3) + " · now " + flip.wPrice.toFixed(3) + " · distance " + (flip.distance >= 0 ? "+" : "−") + Math.abs(flip.distance).toFixed(3) + " (" + ratio + ")",
        }),
      );
      panel.append(
        el("p", {
          class: "cost",
          text: "challenger: " + flip.challenger.name + " — $" + fmt(flip.challenger.priceEff, 2) + "/M, value " + fmt(flip.challenger.value, 3),
        }),
      );
    }
    if (levels) {
      const t = el("table", { class: "comp" });
      t.append(
        el("thead", {}, el("tr", {}, [
          el("th", { text: "level" }),
          el("th", { class: "num", "data-tip": TIPS.thinking, text: "×price" }),
          el("th", { "data-tip": TIPS.thinkingLevels, text: "leader" }),
        ])),
      );
      const tb = el("tbody");
      for (const row of levels) {
        tb.append(
          el("tr", { class: row.level === ex.role.thinking ? "active-level" : "" }, [
            el("td", { text: row.level }),
            el("td", { class: "num", text: "×" + row.factor.toFixed(3) }),
            el("td", { text: row.leader ? row.leader.name + " (" + fmt(row.leader.value, 3) + ")" : "—" }),
          ]),
        );
      }
      t.append(tb);
      panel.append(t);
    }
  }
}

// ---------------------------------------------------------------------------
// Weight editor
// ---------------------------------------------------------------------------

/** Drop a metric from the role's weights. An inherited metric (one the shipped
 * default weights) cannot leave the key set — the plugin deep-merges over
 * DEFAULT_ROLES, so the default's weight would survive and break the sum — so it
 * is parked at EPSILON instead. A metric the user added is deleted outright. */
function dropWeight(metric) {
  const def = state.defs[state.role];
  if (state.defaults[state.role] && metric in state.defaults[state.role].weights) def.weights[metric] = EPSILON;
  else delete def.weights[metric];
}

function setWeight(metric, value) {
  const def = state.defs[state.role];
  if (!Number.isFinite(value) || value <= 0) {
    dropWeight(metric);
    renderEditor();
  } else {
    def.weights[metric] = value;
    updateReadouts();
  }
  renderRoles();
  scheduleRecompute();
}

function normalizeWeights(def) {
  const sum = Object.values(def.weights).reduce((a, b) => a + b, 0);
  if (sum <= 0) return;
  for (const key of Object.keys(def.weights)) def.weights[key] = def.weights[key] / sum;
}

/** The role's focus metrics: the weighted benchmark/percentile metrics, the same
 * rule the server's focusMetricsOf applies (shipped roles weight index metrics,
 * so they carry none). */
function focusMetricsOf(def) {
  return Object.keys(def.weights).filter((metric) => {
    const meta = state.metricMeta[metric];
    return !!meta && (meta.kind === "benchmark" || meta.kind === "percentile");
  });
}

/** One focus-signal cell: the value text plus a status class. `unknown` renders
 * as unknown (muted), never as ok; `below-bar` gets the warning tint and glyph. */
function focusSignal(text, status) {
  const cls = status === "ok" ? "ok" : status === "below-bar" ? "below-bar" : "unknown";
  return el("td", { class: "sig " + cls, text });
}

/** The nine-axis focus assessment of the role's weighted benchmark/percentile
 * metrics, from the bootstrap payload's focusAssessments[role]. The payload is
 * computed over the resolved definition, so a metric the editor just added reads
 * "not assessed" until it is Exported and the page reloaded. */
function renderFocus(panel) {
  const def = state.defs[state.role];
  const assessments = state.focusAssessments[state.role] || {};
  const metrics = focusMetricsOf(def);
  panel.append(el("h3", { "data-tip": TIPS.focus, text: "Focus metrics" }));
  if (metrics.length === 0) {
    panel.append(el("p", { class: "muted", text: "No benchmark/percentile metric weighted — the role ranks on the index/price/throughput backbone." }));
    return;
  }
  const table = el("table", { class: "focus" });
  table.append(
    el("thead", {}, el("tr", {}, [
      el("th", { text: "metric" }),
      el("th", { "data-tip": TIPS.focusCoverage, text: "coverage" }),
      el("th", { "data-tip": TIPS.focusDispersion, text: "dispersion" }),
      el("th", { "data-tip": TIPS.focusComposition, text: "composition" }),
      el("th", { "data-tip": TIPS.focusFreshness, text: "freshness" }),
      el("th", { "data-tip": TIPS.focusTrust, text: "trust" }),
      el("th", { "data-tip": TIPS.focusModality, text: "modality" }),
      el("th", { "data-tip": TIPS.focusMaintenance, text: "maintenance" }),
      el("th", { "data-tip": TIPS.focusProvenance, text: "provenance" }),
      el("th", { "data-tip": TIPS.focusCrossSource, text: "cross-source" }),
    ])),
  );
  const body = el("tbody");
  for (const metric of metrics) {
    const a = assessments[metric];
    if (!a) {
      body.append(
        el("tr", {}, [
          el("td", { "data-tip": metricTip(metric), text: metricLabel(metric) }),
          el("td", { class: "sig unknown", colspan: "9", text: "not assessed — Export, then reload to assess the edited definition" }),
        ]),
      );
      continue;
    }
    const c = a.coverage;
    const coverage = c.status === "unknown" ? "unknown" : c.covered + "/" + c.total + " (" + (c.share === null ? "?" : (c.share * 100).toFixed(1) + "%") + ")";
    const dispersion = a.dispersion.status === "unknown" ? "unknown" : a.dispersion.value.toFixed(3);
    const composition = a.composition.status === "unknown" ? "unknown" : a.composition.status === "ok" ? "ok" : "omits " + a.composition.omittedOrgs.join(", ");
    const freshness = a.freshness.status === "unknown" ? "unknown" : a.freshness.monthsBehind.toFixed(1) + "mo";
    const community = a.trust.community ?? false;
    const trust =
      a.trust.status === "unknown"
        ? community ? "community" : "unknown"
        : a.trust.selfReported + "/" + a.trust.covered + " " + a.trust.status + (community ? " community" : "");
    const modality =
      a.modality.status === "unknown"
        ? "unknown"
        : (a.modality.value ?? "?") + (a.modality.multimodalShare === null ? "" : " " + (a.modality.multimodalShare * 100).toFixed(0) + "% multimodal");
    const maintenance = a.maintenance.status === "unknown" ? "unknown" : a.maintenance.monthsOld.toFixed(1) + "mo";
    const provenance =
      a.provenance.status === "unknown"
        ? "unknown"
        : (a.provenance.owner ?? "?") +
          (a.provenance.dominantShare === null ? "" : " " + (a.provenance.dominantShare * 100).toFixed(0) + "% " + (a.provenance.dominantOrg ?? "?")) +
          " " +
          a.provenance.compositionAgreement;
    const crossSource =
      a.crossSource.status === "unknown"
        ? "unknown"
        : a.crossSource.compared +
          " priceΔ" +
          (a.crossSource.priceDivergence === null ? "?" : (a.crossSource.priceDivergence * 100).toFixed(0) + "%") +
          " ctxΔ" +
          (a.crossSource.contextDivergence === null ? "?" : (a.crossSource.contextDivergence * 100).toFixed(0) + "%");
    const statuses = [c.status, a.dispersion.status, a.composition.status, a.freshness.status, a.trust.status, a.modality.status, a.maintenance.status, a.provenance.status, a.crossSource.status];
    body.append(
      el("tr", { class: statuses.includes("below-bar") ? "warned" : "" }, [
        el("td", { "data-tip": metricTip(metric), text: metricLabel(metric) }),
        focusSignal(coverage, c.status),
        focusSignal(dispersion, a.dispersion.status),
        focusSignal(composition, a.composition.status),
        focusSignal(freshness, a.freshness.status),
        focusSignal(trust, a.trust.status),
        focusSignal(modality, a.modality.status),
        focusSignal(maintenance, a.maintenance.status),
        focusSignal(provenance, a.provenance.status),
        focusSignal(crossSource, a.crossSource.status),
      ]),
    );
  }
  table.append(body);
  panel.append(table);
}

// ---------------------------------------------------------------------------
// Capability flags (issue #40)
// ---------------------------------------------------------------------------

/** Every knob a capability's recommended bundle fills, derived from the registry
 * so the panel cannot drift from `src/features.ts`. */
function allBundleKnobs(recommended) {
  const out = [];
  if (recommended.filters) {
    for (const [key, value] of Object.entries(recommended.filters)) {
      out.push({ key: "filters." + key, kind: typeof value === "boolean" ? "boolean" : "number", value });
    }
  }
  if (recommended.cacheHitRate !== undefined) out.push({ key: "cacheHitRate", kind: "number", value: recommended.cacheHitRate });
  if (recommended.preferOwnProvider !== undefined) out.push({ key: "preferOwnProvider", kind: "boolean", value: recommended.preferOwnProvider });
  return out;
}

/** The knobs a capability bundle renders as its own inputs. The four keys the
 * editor renders as first-class endpoint-filter fields are skipped, so one def
 * key has exactly one input; `cacheHitRate` and `preferOwnProvider` stay
 * bundle-only. */
function bundleKnobs(recommended) {
  return allBundleKnobs(recommended).filter((knob) => !BUNDLE_SKIPPED_KEYS.includes(knob.key));
}

/** Render a recommended bundle as `key=value` pairs (mirrors formatBundle). The
 * full set, so the "recommended:" line still names the four first-class keys. */
function bundleText(recommended) {
  return allBundleKnobs(recommended).map((k) => k.key + "=" + k.value).join(", ");
}

/** Read one knob from the AUTHORED def by its dotted key. */
function getKnob(def, key) {
  if (key === "cacheHitRate") return def.cacheHitRate;
  if (key === "preferOwnProvider") return def.preferOwnProvider;
  if (key.startsWith("filters.")) return def.filters ? def.filters[key.slice("filters.".length)] : undefined;
  return undefined;
}

/** Write (or clear, with `undefined`) one knob on the AUTHORED def. */
function setKnob(def, key, value) {
  if (key === "cacheHitRate" || key === "preferOwnProvider") {
    if (value === undefined) delete def[key];
    else def[key] = value;
    return;
  }
  if (key.startsWith("filters.")) {
    const leaf = key.slice("filters.".length);
    if (value === undefined) {
      if (def.filters) {
        delete def.filters[leaf];
        if (Object.keys(def.filters).length === 0) delete def.filters;
      }
    } else {
      def.filters = def.filters || {};
      def.filters[leaf] = value;
    }
  }
}

/** The scope's global capability flag for `id` as the SERVER will see it. The
 * edited record is the full global set the SPA posts, so a key it no longer
 * carries is off (the shipped default) — reading the committed `state.features`
 * first would resurrect a flag the user just cleared. The committed flag is the
 * fallback only for a payload that carried no `settings` at all. */
function effectiveGlobalFlag(id) {
  const key = "features." + id;
  if (key in state.settingsEdited) return state.settingsEdited[key] === true;
  if (key in state.settingsAuthored) return false;
  return state.features[id] === true;
}

/** The effective state of one capability for a role: the authored per-role flag
 * when present (it wins either way), else the scope's global flag. */
function effectiveFlag(def, id) {
  const authored = def.features ? def.features[id] : undefined;
  if (authored !== undefined) return authored;
  return effectiveGlobalFlag(id);
}

/** The effective value of one knob and whether it is DERIVED (filled by an
 * enabled capability) rather than authored (an explicit key on the def). */
function effectiveKnob(def, featureId, knob) {
  const authored = getKnob(def, knob.key);
  if (authored !== undefined) return { value: authored, derived: false };
  if (effectiveFlag(def, featureId) && knob.value !== undefined) return { value: knob.value, derived: true };
  return { value: undefined, derived: false };
}

/** One knob field: an editable input (number, or inherit/true/false select) plus
 * a badge marking the value authored or derived from the capability. */
function knobField(def, featureId, knob) {
  const authored = getKnob(def, knob.key);
  const eff = effectiveKnob(def, featureId, knob);
  const cell = el("span", { class: "knob" + (eff.derived ? " derived" : "") });
  let input;
  if (knob.kind === "boolean") {
    input = el("select", { class: "knob-input", "data-tip": TIPS.featureKnob });
    input.append(el("option", { value: "inherit", text: "inherit" }));
    input.append(el("option", { value: "true", text: "true" }));
    input.append(el("option", { value: "false", text: "false" }));
    input.value = authored === undefined ? "inherit" : String(authored);
    input.addEventListener("change", () => {
      setKnob(def, knob.key, input.value === "inherit" ? undefined : input.value === "true");
      renderEditor();
      renderRoles();
      scheduleRecompute();
    });
  } else {
    input = el("input", { type: "number", class: "knob-input", step: "any", "data-tip": TIPS.featureKnob, placeholder: eff.value === undefined ? "—" : String(eff.value) });
    if (authored !== undefined) input.value = String(authored);
    input.addEventListener("input", () => {
      setKnob(def, knob.key, input.value === "" ? undefined : Number(input.value));
      scheduleRecompute();
    });
    input.addEventListener("change", () => {
      renderEditor();
      renderRoles();
    });
  }
  cell.append(input);
  cell.append(el("span", { class: "knob-name", text: knob.key }));
  const badge = eff.derived ? "derived " + eff.value : authored !== undefined ? "authored" : "—";
  cell.append(el("span", { class: "knob-badge " + (eff.derived ? "derived" : authored !== undefined ? "authored" : "none"), "data-tip": TIPS.featureDerived, text: badge }));
  return cell;
}

/** The enabled capability (if any) whose recommended bundle fills this def key,
 * so a first-class field can mark its value derived rather than authored. */
function derivedFor(def, key) {
  for (const feature of state.featureRegistry) {
    const knob = allBundleKnobs(feature.recommended).find((k) => k.key === key);
    if (knob && knob.value !== undefined && effectiveFlag(def, feature.id)) return { feature, knob };
  }
  return null;
}

/** One first-class endpoint-filter field: the single input for its def key. The
 * value is authored (an explicit key) or derived from an enabled capability
 * bundle; an empty field inherits. */
function endpointFilterField(def, spec) {
  const authored = getKnob(def, spec.key);
  const rec = derivedFor(def, spec.key);
  const derived = authored === undefined && rec !== null;
  const eff = authored !== undefined ? authored : derived ? rec.knob.value : undefined;
  const cell = el("span", { class: "knob endpoint-filter" + (derived ? " derived" : "") });
  let input;
  if (spec.kind === "boolean") {
    input = el("select", { class: "knob-input", "data-tip": spec.tip });
    input.append(el("option", { value: "inherit", text: "inherit" }));
    input.append(el("option", { value: "true", text: "true" }));
    input.append(el("option", { value: "false", text: "false" }));
    input.value = authored === undefined ? "inherit" : String(authored);
    input.addEventListener("change", () => {
      setKnob(def, spec.key, input.value === "inherit" ? undefined : input.value === "true");
      renderEditor();
      renderRoles();
      scheduleRecompute();
    });
  } else {
    input = el("input", { type: "number", min: "0", step: "any", class: "knob-input", "data-tip": spec.tip, placeholder: eff === undefined ? "—" : String(eff) });
    if (authored !== undefined) input.value = String(authored);
    input.addEventListener("input", () => {
      setKnob(def, spec.key, input.value === "" ? undefined : Number(input.value));
      scheduleRecompute();
    });
    input.addEventListener("change", () => {
      renderEditor();
      renderRoles();
    });
  }
  cell.append(input);
  cell.append(el("span", { class: "knob-name", text: spec.label }));
  const badge = derived ? "derived " + eff : authored !== undefined ? "authored" : "—";
  cell.append(el("span", { class: "knob-badge " + (derived ? "derived" : authored !== undefined ? "authored" : "none"), "data-tip": TIPS.featureDerived, text: badge }));
  return cell;
}

/** The per-role Features panel: one tri-state control per capability (inherit /
 * on / off) writing `def.features[id]`, the recommended bundle, and the
 * individual knobs the bundle fills, each marked derived or authored. */
function renderFeatures(panel) {
  panel.append(el("h3", { "data-tip": TIPS.features, text: "Capabilities" }));
  if (state.featureRegistry.length === 0) {
    panel.append(el("p", { class: "muted", text: "No capability registry in the payload." }));
    return;
  }
  const def = state.defs[state.role];
  const wrap = el("div", { class: "features" });
  for (const feature of state.featureRegistry) {
    const authored = def.features ? def.features[feature.id] : undefined;
    const on = effectiveFlag(def, feature.id);
    const row = el("div", { class: "feature" + (on ? " on" : "") });
    const sel = el("select", { class: "feature-state", "data-tip": TIPS.featureState });
    sel.append(el("option", { value: "inherit", text: "inherit" }));
    sel.append(el("option", { value: "on", text: "on" }));
    sel.append(el("option", { value: "off", text: "off" }));
    sel.value = authored === undefined ? "inherit" : authored ? "on" : "off";
    sel.addEventListener("change", () => {
      def.features = def.features || {};
      if (sel.value === "inherit") {
        delete def.features[feature.id];
        if (Object.keys(def.features).length === 0) delete def.features;
      } else {
        def.features[feature.id] = sel.value === "on";
      }
      renderEditor();
      renderRoles();
      scheduleRecompute();
    });
    const origin = authored === undefined ? (effectiveGlobalFlag(feature.id) ? "global on" : "global off") : "role override";
    row.append(
      el("div", { class: "feature-head" }, [
        sel,
        el("span", { class: "feature-label", "data-tip": feature.description + "\n\n" + feature.buys, text: feature.label }),
        el("span", { class: "feature-origin muted", text: origin }),
      ]),
    );
    row.append(el("div", { class: "feature-bundle muted", text: "recommended: " + bundleText(feature.recommended) }));
    const knobs = el("div", { class: "feature-knobs" });
    for (const knob of bundleKnobs(feature.recommended)) knobs.append(knobField(def, feature.id, knob));
    row.append(knobs);
    wrap.append(row);
  }
  panel.append(wrap);
}

function renderEditor() {
  const panel = document.getElementById("editor");
  panel.textContent = "";
  if (!state.role) return;
  const def = state.defs[state.role];
  panel.append(el("h2", { text: "Edit @" + state.role }));

  const desc = el("input", { type: "text", class: "desc", "data-tip": TIPS.description, value: def.description || "", placeholder: "one-line role description" });
  desc.addEventListener("input", () => {
    def.description = desc.value;
    renderRoles();
    renderExportState();
  });
  panel.append(el("div", { class: "row-controls" }, [desc]));

  const enabled = el("input", { type: "checkbox" });
  enabled.checked = def.enabled !== false;
  enabled.addEventListener("change", () => {
    // A role whose shipped default is enabled (or that has no shipped default)
    // needs no explicit flag: dropping the key lets the deep-merge leave it
    // enabled, so re-enabling does not leave a redundant `enabled: true` behind.
    const shippedEnabled = !(state.defaults[state.role] && state.defaults[state.role].enabled === false);
    if (enabled.checked && shippedEnabled) delete def.enabled;
    else def.enabled = enabled.checked;
    syncUniverseEnabled(state.role);
    renderRoles();
    renderExportState();
  });
  const locked = el("input", { type: "checkbox" });
  locked.checked = def.locked === true;
  locked.addEventListener("change", () => {
    // Absent means unlocked, so unchecking deletes the key rather than writing
    // a redundant `locked: false` the plugin would have to carry forever.
    if (locked.checked) def.locked = true;
    else delete def.locked;
    syncUniverseLocked(state.role);
    renderRoles();
    renderExportState();
  });
  panel.append(el("div", { class: "row-controls" }, [
    el("label", { class: "check" }, [enabled, el("span", { "data-tip": TIPS.enabled, text: "Enabled — ranked by the plugin" })]),
    el("label", { class: "check" }, [locked, el("span", { "data-tip": TIPS.locked, text: "Locked — never rewrite selector or chain" })]),
  ]));

  panel.append(el("h3", { text: "Weights" }));
  const weights = el("table", { class: "weights" });
  const wbody = el("tbody");
  for (const metric of state.metrics) {
    if (!(metric in def.weights)) continue;
    const value = def.weights[metric];
    const inherited = !!(state.defaults[state.role] && metric in state.defaults[state.role].weights);
    const range = el("input", { type: "range", min: "0", max: "1", step: "0.001", value: String(value) });
    const num = el("input", { type: "number", min: "0", max: "1", step: "0.001", class: "wnum", value: String(value) });
    range.addEventListener("input", () => {
      num.value = range.value;
      setWeight(metric, Number(range.value));
    });
    num.addEventListener("input", () => {
      range.value = num.value;
      setWeight(metric, Number(num.value));
    });
    wbody.append(
      el("tr", { class: value <= EPSILON ? "off" : "" }, [
        el("td", { "data-tip": metricTip(metric), text: metricLabel(metric) }),
        el("td", {}, range),
        el("td", {}, num),
        el("td", {}, el("button", {
          class: "x",
          text: "×",
          "data-tip": inherited ? TIPS.dropInherited : TIPS.dropAdded,
          onclick: () => {
            dropWeight(metric);
            renderEditor();
            renderRoles();
            scheduleRecompute();
          },
        })),
      ]),
    );
  }
  weights.append(wbody);
  panel.append(weights);

  const sum = Object.values(def.weights).reduce((a, b) => a + b, 0);
  const addSel = el("select", { id: "add-metric", "data-tip": TIPS.addMetric });
  addSel.append(el("option", { value: "", text: "add metric…" }));
  for (const metric of state.metrics) if (!(metric in def.weights)) addSel.append(el("option", { value: metric, text: metricLabel(metric) }));
  addSel.addEventListener("change", () => {
    if (!addSel.value) return;
    def.weights[addSel.value] = 0.05;
    renderEditor();
    renderRoles();
    scheduleRecompute();
  });
  panel.append(
    el("div", { class: "row-controls" }, [
      el("span", { id: "sum", class: "sum " + (Math.abs(sum - 1) > 0.01 ? "bad" : "ok"), "data-tip": TIPS.sum, text: "Σ = " + sum.toFixed(3) }),
      el("button", { id: "normalize", "data-tip": TIPS.normalize, text: "Normalize", onclick: () => { normalizeWeights(def); renderEditor(); renderRoles(); scheduleRecompute(); } }),
      addSel,
    ]),
  );

  panel.append(el("h3", { "data-tip": TIPS.required, text: "Required (eligibility gate)" }));
  const checks = el("div", { class: "checks" });
  for (const metric of state.metrics) {
    const cb = el("input", { type: "checkbox" });
    cb.checked = def.required.includes(metric);
    cb.addEventListener("change", () => {
      if (cb.checked) {
        if (!def.required.includes(metric)) def.required.push(metric);
      } else {
        def.required = def.required.filter((k) => k !== metric);
      }
      scheduleRecompute();
    });
    checks.append(el("label", { class: "check" }, [cb, el("span", { "data-tip": TIPS.required + "\n\n" + metricTip(metric), text: metricLabel(metric) })]));
  }
  panel.append(checks);

  renderFocus(panel);

  panel.append(el("h3", { "data-tip": TIPS.endpointFilters, text: "Endpoint filters" }));
  const imgCb = el("input", { type: "checkbox" });
  imgCb.checked = !!(def.filters && def.filters.image);
  imgCb.addEventListener("change", () => {
    def.filters = def.filters || {};
    def.filters.image = imgCb.checked;
    scheduleRecompute();
  });
  panel.append(el("label", { class: "check" }, [imgCb, el("span", { "data-tip": TIPS.imageFilter, text: "requires image input (filters.image)" })]));
  const filterFields = el("div", { class: "endpoint-filters" });
  for (const spec of ENDPOINT_FILTERS) filterFields.append(endpointFilterField(def, spec));
  panel.append(filterFields);

  panel.append(el("h3", { "data-tip": TIPS.providerPin, text: "Provider pin" }));
  const pin = el("input", { type: "text", class: "desc", "data-tip": TIPS.providerPin, value: def.providerPin || "", placeholder: "provider slug, e.g. deepinfra/fp8" });
  pin.addEventListener("change", () => {
    // Empty clears the key (default routing); a tiered slug is kept verbatim.
    const value = pin.value.trim();
    if (value === "") delete def.providerPin;
    else def.providerPin = value;
    renderEditor();
    renderRoles();
    scheduleRecompute();
  });
  panel.append(el("div", { class: "row-controls" }, [pin]));

  renderFeatures(panel);

  panel.append(el("h3", { "data-tip": TIPS.thinking, text: "Thinking level" }));
  const bareLocked = state.effective[state.role]?.thinking !== undefined;
  const levelSel = el("select", { id: "thinking", "data-tip": TIPS.thinking });
  levelSel.append(el("option", { value: "", text: "— (bare)", disabled: bareLocked ? "" : null, "data-tip": bareLocked ? TIPS.thinkingBare : null }));
  for (const level of state.levels) levelSel.append(el("option", { value: level, text: level }));
  levelSel.value = def.thinking === undefined ? "" : def.thinking;
  levelSel.addEventListener("change", () => {
    if (levelSel.value === "") delete def.thinking;
    else def.thinking = levelSel.value;
    renderEditor();
    renderRoles();
    scheduleRecompute();
  });
  panel.append(el("div", { class: "row-controls" }, [levelSel, el("span", { id: "thinking-readout", class: "muted", text: "" })]));

  panel.append(el("h3", { "data-tip": TIPS.lambda, text: "λ override" }));
  const lam = el("input", { type: "number", min: "0", step: "0.0001", class: "wnum", placeholder: "derived", "data-tip": TIPS.lambda });
  if (def.lambda !== undefined) lam.value = String(def.lambda);
  lam.addEventListener("input", () => {
    if (lam.value === "") delete def.lambda;
    else def.lambda = Number(lam.value);
    scheduleRecompute();
  });
  panel.append(el("div", { class: "row-controls" }, [lam, el("span", { id: "lambda-readout", class: "muted", text: "" })]));

  panel.append(
    el("div", { class: "row-controls" }, [
      el("button", { id: "reset-effective", "data-tip": TIPS.resetEffective, text: "Reset to effective", onclick: () => { state.defs[state.role] = structuredClone(state.effective[state.role]); syncUniverseEnabled(state.role); syncUniverseLocked(state.role); renderEditor(); renderRoles(); scheduleRecompute(); } }),
      state.defaults[state.role]
        ? el("button", { id: "reset-defaults", "data-tip": TIPS.resetDefaults, text: "Reset to shipped default", onclick: () => { state.defs[state.role] = structuredClone(state.defaults[state.role]); syncUniverseEnabled(state.role); syncUniverseLocked(state.role); renderEditor(); renderRoles(); scheduleRecompute(); } })
        : null,
    ]),
  );

  updateReadouts();
}

function updateReadouts() {
  const def = state.defs[state.role];
  if (!def) return;
  const sumEl = document.getElementById("sum");
  if (sumEl) {
    const sum = Object.values(def.weights).reduce((a, b) => a + b, 0);
    sumEl.textContent = "Σ = " + sum.toFixed(3);
    sumEl.className = "sum " + (Math.abs(sum - 1) > 0.01 ? "bad" : "ok");
  }
  const thinkEl = document.getElementById("thinking-readout");
  if (thinkEl) {
    if (def.thinking === undefined) thinkEl.textContent = "bare — price unadjusted";
    else {
      const factor = state.thinkingFactors[def.thinking] ?? 1;
      thinkEl.textContent = "price ×" + factor.toFixed(3) + " on models that run :" + def.thinking;
    }
  }
  const lamEl = document.getElementById("lambda-readout");
  if (lamEl) lamEl.textContent = "derived λ = " + state.derivedLambda.toFixed(5) + " · effective λ = " + state.lambda.toFixed(5);
  renderExportState();
}

function renderErrors() {
  const box = document.getElementById("errors");
  box.textContent = "";
  box.className = state.errors.length ? "errors" : "";
  for (const e of state.errors) box.append(el("div", { class: "err", text: e }));
}

// ---------------------------------------------------------------------------
// Settings panel (the scope's global settings)
// ---------------------------------------------------------------------------

/** The per-row sync callbacks of the current Settings panel. An edit refreshes
 * every row, so a cross-row error (the tokenProfile pair) lands on the sibling
 * row too, not only on the one being typed into. */
let settingsRowSyncs = [];

/** One control per key of `settings.defaults` (excluding `features`), in the
 * order the resolved settings carry them. `tokenProfile` is two number fields;
 * `selection` and `errorReporting` are enum pickers; the rest are number or
 * boolean by their default's type. */
function globalFields() {
  const out = [];
  for (const key of Object.keys(state.settingsDefaults)) {
    if (key === "features") continue;
    if (key === "tokenProfile") {
      out.push({ key: "tokenProfile.inputTokens", kind: "number", label: "tokenProfile.inputTokens", tip: GLOBAL_TIPS["tokenProfile.inputTokens"] });
      out.push({ key: "tokenProfile.outputTokens", kind: "number", label: "tokenProfile.outputTokens", tip: GLOBAL_TIPS["tokenProfile.outputTokens"] });
      continue;
    }
    if (key === "selection") {
      out.push({ key, kind: "enum", values: ["value", "cheapest"], label: key, tip: GLOBAL_TIPS.selection });
      continue;
    }
    if (key === "errorReporting") {
      out.push({ key, kind: "enum", values: ["off", "ask", "auto"], label: key, tip: GLOBAL_TIPS.errorReporting, noImpact: true });
      continue;
    }
    const def = state.settingsDefaults[key];
    out.push({ key, kind: typeof def === "boolean" ? "boolean" : "number", label: key, tip: GLOBAL_TIPS[key] || null, noImpact: key === "activateDefaultOnEmptySession" });
  }
  return out;
}

/** One global-setting row: the effective value (authored, else the shipped
 * default), the shipped default, a dirty marker and a reset. The input is the
 * single source of the value; the badge and the reset follow it. */
function globalField(field) {
  const key = field.key;
  const row = el("div", { class: "setting" });
  const badge = el("span", { class: "setting-badge" });
  const errText = el("span", { class: "setting-error" });
  const reset = el("button", { class: "setting-reset", text: "reset" });
  const authored = () => key in state.settingsEdited;
  const current = () => (authored() ? state.settingsEdited[key] : defaultOf(key));
  const commit = () => {
    for (const sync of settingsRowSyncs) sync();
    onGlobalEdit(key);
  };

  let input;
  if (field.kind === "boolean") {
    input = el("input", { type: "checkbox", class: "setting-input" });
    input.checked = current() === true;
    input.addEventListener("change", () => {
      setGlobal(key, input.checked);
      commit();
    });
  } else if (field.kind === "enum") {
    input = el("select", { class: "setting-input" });
    for (const value of field.values) input.append(el("option", { value, text: value }));
    input.value = current() === undefined ? "" : String(current());
    input.addEventListener("change", () => {
      setGlobal(key, input.value);
      commit();
    });
  } else {
    const range = GLOBAL_RANGES[key] || {};
    input = el("input", { type: "number", class: "setting-input", step: range.step === undefined ? "any" : String(range.step) });
    if (range.min !== undefined) input.setAttribute("min", String(range.min));
    if (range.max !== undefined) input.setAttribute("max", String(range.max));
    const value = current();
    if (value !== undefined && value !== null) input.value = String(value);
    input.addEventListener("input", () => {
      setGlobal(key, input.value === "" ? undefined : Number(input.value));
      commit();
    });
    input.addEventListener("change", () => {
      // On blur, re-render so a cleared field shows the effective value (the
      // shipped default) instead of staying blank.
      renderSettings();
      renderExportState();
    });
  }

  function sync() {
    const isAuthored = authored();
    // Two axes: the badge says whether the key will be written (authored) or
    // falls back to the shipped default; the row is dirty only when the working
    // copy differs from the scope's committed authored value.
    const pending = isAuthored ? state.settingsEdited[key] : undefined;
    const committed = state.settingsAuthored[key];
    const dirty = JSON.stringify(pending) !== JSON.stringify(committed);
    row.className = "setting" + (dirty ? " dirty" : "");
    badge.className = "setting-badge " + (isAuthored ? "authored" : "default");
    badge.textContent = isAuthored ? "authored" : "default";
    badge.dataset.tip = "committed " + fmtDefault(resolvedOf(key)) + " · shipped default " + fmtDefault(defaultOf(key));
    reset.disabled = !isAuthored;
    const err = settingsErrors()[key];
    errText.textContent = err || "";
    errText.className = "setting-error" + (err ? " show" : "");
  }

  reset.addEventListener("click", () => {
    delete state.settingsEdited[key];
    renderSettings();
    onGlobalEdit(key);
  });

  row.append(el("label", { class: "setting-name", "data-tip": field.tip, text: field.label }));
  row.append(input);
  row.append(el("span", { class: "setting-default muted", text: "default " + fmtDefault(defaultOf(key)) }));
  if (field.noImpact) row.append(el("span", { class: "setting-noimpact muted", "data-tip": TIPS.settingsNoImpact, text: "no visual impact" }));
  row.append(badge);
  reset.dataset.tip = "reset to the shipped default (delete this key)";
  row.append(reset);
  row.append(errText);
  settingsRowSyncs.push(sync);
  sync();
  return row;
}

/** One global capability toggle, writing `features.<id>`. */
function featureToggle(feature) {
  const key = "features." + feature.id;
  const row = el("div", { class: "setting" });
  const badge = el("span", { class: "setting-badge" });
  const reset = el("button", { class: "setting-reset", text: "reset" });
  const cb = el("input", { type: "checkbox", class: "setting-input" });
  cb.checked = (key in state.settingsEdited ? state.settingsEdited[key] : defaultOf(key)) === true;
  const sync = () => {
    const isAuthored = key in state.settingsEdited;
    const pending = isAuthored ? state.settingsEdited[key] : undefined;
    const committed = state.settingsAuthored[key];
    const dirty = JSON.stringify(pending) !== JSON.stringify(committed);
    row.className = "setting" + (dirty ? " dirty" : "");
    badge.className = "setting-badge " + (isAuthored ? "authored" : "default");
    badge.textContent = isAuthored ? "authored" : "default";
    badge.dataset.tip = "committed " + fmtDefault(resolvedOf(key)) + " · shipped default " + fmtDefault(defaultOf(key));
    reset.disabled = !isAuthored;
  };
  cb.addEventListener("change", () => {
    setGlobal(key, cb.checked);
    sync();
    onGlobalEdit(key);
  });
  reset.addEventListener("click", () => {
    delete state.settingsEdited[key];
    renderSettings();
    onGlobalEdit(key);
  });
  row.append(el("label", { class: "setting-name", "data-tip": feature.description + "\n\n" + feature.buys, text: feature.label }));
  row.append(cb);
  row.append(el("span", { class: "setting-default muted", text: "default " + fmtDefault(defaultOf(key)) }));
  row.append(badge);
  reset.dataset.tip = "reset to the shipped default (delete this key)";
  row.append(reset);
  settingsRowSyncs.push(sync);
  sync();
  return row;
}

/** Rebuild the Settings panel from the working copy. Rendered per scope, so a
 * scope switch cannot carry edits across. */
function renderSettings() {
  const panel = document.getElementById("settings");
  if (!panel) return;
  panel.textContent = "";
  settingsRowSyncs = [];
  if (!state.settingsDefaults) return;
  panel.append(el("h2", { "data-tip": TIPS.settings, text: "Settings" }));
  panel.append(el("p", { class: "muted", text: "Global settings for this scope. Export writes the keys you change; a cleared field falls back to the shipped default." }));
  const grid = el("div", { class: "settings-grid" });
  for (const field of globalFields()) grid.append(globalField(field));
  panel.append(grid);
  panel.append(el("h3", { "data-tip": TIPS.globalFeatures, text: "Global capabilities" }));
  if (state.featureRegistry.length === 0) {
    panel.append(el("p", { class: "muted", text: "No capability registry in the payload." }));
    return;
  }
  const feats = el("div", { class: "settings-grid" });
  for (const feature of state.featureRegistry) feats.append(featureToggle(feature));
  panel.append(feats);
}

/** A global edit: clear the last export message, refresh the Export state and
 * re-run the ranking and the preview (both debounced). A capability flag also
 * changes the per-role expansion, so the editor is rebuilt to move its derived
 * badges and origin labels with the re-ranked table. */
function onGlobalEdit(key) {
  state.exportMessage = "";
  renderExportState();
  if (key && key.startsWith("features.")) renderEditor();
  scheduleRecompute();
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

function renderExportState() {
  const dirty = dirtyRoles();
  const count = Object.keys(dirty).length;
  const globalDirty = settingsDirty();
  const errCount = Object.keys(settingsErrors()).length;
  const btn = document.getElementById("export");
  if (btn) btn.disabled = (count === 0 && !globalDirty) || state.errors.length > 0 || errCount > 0;
  const status = document.getElementById("export-status");
  if (status) {
    const parts = [];
    if (count) parts.push(count + " role(s) edited");
    if (globalDirty) parts.push("settings edited");
    if (errCount) parts.push(errCount + " setting error(s)");
    status.textContent = state.exportMessage || parts.join(" · ");
  }
}

async function onExport() {
  const dirty = dirtyRoles();
  const hadSettings = settingsDirty();
  if (Object.keys(dirty).length === 0 && !hadSettings) return;
  const btn = document.getElementById("export");
  btn.disabled = true;
  try {
    const res = await api("/api/export", { roles: dirty, settings: state.settingsEdited });
    if (res.ok) {
      const parts = [];
      if (res.roles.length) parts.push(res.roles.length + " role(s)");
      if (hadSettings) parts.push("settings");
      state.exportMessage = "wrote " + (parts.join(" + ") || "nothing") + " to " + (res.lockPath || state.lockPath) + (res.backupPath ? " — backup: " + res.backupPath : "");
      for (const role of res.roles) state.effective[role] = structuredClone(state.defs[role]);
      // The settings half is committed too: the authored baseline becomes the
      // edited record, so the panel reads clean until the next edit, and the
      // committed readout is re-derived so it cannot go stale.
      state.settingsAuthored = structuredClone(state.settingsEdited);
      state.settingsResolved = resolvedFromFlat(state.settingsAuthored);
      renderSettings();
      renderRoles();
      renderEditor();
    } else {
      state.exportMessage = "export failed: " + (res.error || (res.errors || []).join("; "));
    }
  } catch (err) {
    state.exportMessage = "export failed: " + err.message;
  }
  renderExportState();
}

function dirtyJson() {
  return JSON.stringify({ roles: dirtyRoles(), settings: state.settingsEdited }, null, 2);
}

async function onCopy() {
  try {
    await navigator.clipboard.writeText(dirtyJson());
    state.exportMessage = "copied dirty roles JSON";
  } catch {
    state.exportMessage = "clipboard unavailable";
  }
  renderExportState();
}

function onDownload() {
  const blob = new Blob([dirtyJson()], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "omp-llm-role-roles.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

async function onRefresh() {
  if (!confirm("Refetch the leaderboard and OpenRouter data? This hits the network.")) return;
  try {
    applyBootstrap(await api("/api/refresh", {}));
  } catch (err) {
    alert("Refresh failed: " + err.message);
  }
}

/** Switch the active scope. Unsaved edits are confirmed first (mirroring
 * Refresh); the returned payload rebuilds every per-scope panel. */
async function onScopeChange(event) {
  const id = event.target.value;
  if (id === state.activeScope) return;
  if ((Object.keys(dirtyRoles()).length > 0 || settingsDirty()) && !confirm("Discard unsaved edits and switch scope?")) {
    event.target.value = state.activeScope;
    return;
  }
  try {
    applyBootstrap(await api("/api/scope", { scope: id }));
  } catch (err) {
    alert("Scope switch failed: " + err.message);
    event.target.value = state.activeScope;
  }
}

/** Switch the ranked pool (raw ↔ as-written). Unsaved edits are confirmed first
 * (mirroring the scope switcher); the returned payload rebuilds every panel, so
 * the header's model count and the table describe the new pool. */
async function onPoolChange(event) {
  const mode = event.target.value;
  if (mode === state.poolMode) return;
  if ((Object.keys(dirtyRoles()).length > 0 || settingsDirty()) && !confirm("Discard unsaved edits and switch pool?")) {
    event.target.value = state.poolMode;
    return;
  }
  try {
    applyBootstrap(await api("/api/pool", { mode }));
  } catch (err) {
    alert("Pool switch failed: " + err.message);
    event.target.value = state.poolMode;
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

/** Rebuild every panel from a bootstrap payload (boot, scope switch, refresh).
 * The per-scope editing state is rebuilt from the payload, so dirty tracking is
 * per scope; the previously selected role is kept when the new scope has it. */
function applyBootstrap(data) {
  const previousRole = state.role;
  state.scopes = data.scopes || [];
  state.activeScope = data.activeScope;
  state.poolMode = data.poolMode || "raw";
  state.tokenProfile = data.tokenProfile ?? null;
  state.universe = data.universe;
  state.effective = {};
  for (const [name, entry] of Object.entries(state.universe)) state.effective[name] = entry.def;
  state.defs = structuredClone(state.effective);
  state.defaults = data.defaults;
  state.metrics = data.metrics;
  state.metricMeta = data.metricMeta;
  state.focusAssessments = data.focusAssessments || {};
  state.levels = data.levels;
  state.thinkingFactors = data.thinkingFactors;
  state.lockPath = data.lockPath;
  state.availability = data.availability;
  state.features = data.features || {};
  state.featureRegistry = data.featureRegistry || [];
  // The scope's global settings: the authored keys are the working copy's
  // baseline, so a scope switch rebuilds the panel and drops the old edits.
  const settings = data.settings || {};
  state.settingsAuthored = settings.authored || {};
  state.settingsResolved = settings.resolved || null;
  state.settingsDefaults = settings.defaults || null;
  state.settingsEdited = structuredClone(state.settingsAuthored);
  state.preview = null;
  state.previewErrors = [];
  state.rows = [];
  state.selectedId = null;
  state.selection = null;
  state.explain = null;
  state.errors = [];
  state.exportMessage = "";
  renderMeta(data);
  renderRoles();
  renderErrors();
  renderTable();
  renderSettings();
  renderPreview();
  const role = previousRole && state.defs[previousRole] ? previousRole : Object.keys(state.defs)[0];
  if (role) selectRole(role);
  else {
    state.role = null;
    renderEditor();
    renderExplain();
  }
  schedulePreview();
}

async function boot() {
  initTips();
  applyBootstrap(await api("/api/bootstrap"));

  document.getElementById("filter").addEventListener("input", (e) => {
    state.filter = e.target.value;
    renderTable();
  });
  document.getElementById("topn").addEventListener("change", (e) => {
    state.topn = e.target.value;
    renderTable();
  });
  const hideBlocked = document.getElementById("hide-blocked");
  hideBlocked.dataset.tip = TIPS.hideBlocked;
  hideBlocked.addEventListener("change", (e) => {
    state.hideBlocked = e.target.checked;
    renderTable();
  });
  const exportBtn = document.getElementById("export");
  exportBtn.dataset.tip = TIPS.exportBtn;
  exportBtn.addEventListener("click", onExport);
  const copyBtn = document.getElementById("copy");
  copyBtn.dataset.tip = TIPS.copy;
  copyBtn.addEventListener("click", onCopy);
  const downloadBtn = document.getElementById("download");
  downloadBtn.dataset.tip = TIPS.download;
  downloadBtn.addEventListener("click", onDownload);
}

boot().catch((err) => {
  document.getElementById("meta").textContent = "failed to load: " + err.message;
});
