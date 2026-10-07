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
  lambda: 0,
  derivedLambda: 0,
  errors: [],
  lockPath: "",
  scopes: [],
  activeScope: "",
  features: {},
  featureRegistry: [],
  filter: "",
  topn: "25",
  hideBlocked: false,
  availability: null,
  explain: null,
  exportMessage: "",
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
  refresh: "Refetch llm-stats and OpenRouter data (hits the network).",
  rank: "Rank among this role's eligible models, by value, descending.",
  delta: "Rank change against the role's saved (effective) definition: + means this definition ranks the model higher than the plugin does today.",
  frontier: "Pareto frontier on (effective price, q): no other model is both cheaper and at least as good. Price is the thinking-adjusted effective price.",
  value: "Sort key: value = q − λ·$/M on the thinking-adjusted effective price. λ is the price of one quality point, in $/M.",
  q: "Quality q = Σ (wᵢ/(1−w_price))·tᵢ over the weighted quality metrics. Price is not blended in — it is the penalty axis.",
  price: "Effective price in $/M: OpenRouter standard-route blend (3:1 in:out) scaled by the role's thinking factor when the model supports thinking; unadjusted for bare/off roles.",
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
  exportBtn: "Write the edited roles into the plugin lock file (a .bak-<timestamp> sibling is written first); takes effect on the next /refresh-roles in any running session — the lock file is re-read from disk on every run.",
  copy: "Copy the dirty-roles payload (the shape the lock file stores) to the clipboard.",
  download: "Download the dirty-roles payload as JSON.",
};

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

function renderMeta(data) {
  const meta = document.getElementById("meta");
  meta.textContent = "";
  meta.append(
    el("span", { class: "brand", text: "omp-llm-role explorer" }),
    el("span", { class: "sep", text: "·" }),
    scopeSelect(),
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
}

async function recompute() {
  if (!state.role) return;
  let data;
  try {
    data = await api("/api/rank", { role: state.role, def: state.defs[state.role] });
  } catch (err) {
    state.errors = [err.message];
    renderErrors();
    return;
  }
  state.rows = data.rows;
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
    tbody.append(
      el("tr", { class: "row" + (r.id === state.selectedId ? " selected" : ""), onclick: () => selectModel(r.id) }, [
        el("td", { class: "num", text: String(r.rank) }),
        el("td", { class: "delta " + deltaClass(r.delta), text: deltaText(r.delta) }),
        el("td", { class: "star", text: r.frontier ? "★" : "" }),
        el("td", { class: "model", text: r.name }),
        el("td", { class: "org", text: r.org }),
        el("td", { class: "key" }, keyBadge(r.key)),
        el("td", { class: "num", text: fmt(r.value, 3) }),
        el("td", { class: "num", text: fmt(r.q, 3) }),
        el("td", { class: "num", text: fmt(r.priceEff, 2) }),
        el("td", { class: "num", text: r.throughput === null ? "—" : fmt(r.throughput, 0) }),
        el("td", { class: "num", text: r.context === null ? "—" : fmtCtx(r.context) }),
      ]),
    );
  }
  table.append(tbody);
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
    state.explain = await api("/api/explain", { role: state.role, def: state.defs[state.role], modelId: id });
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
  const ownNote = ex.ownProvider ? " · own lab" : "";
  panel.append(el("p", { class: "cost", "data-tip": TIPS.costPenalty, text: "eff price $" + fmt(ex.cost.priceEff, 2) + "/M" + (ex.cost.priceEff !== ex.cost.billedPrice ? " (billed $" + fmt(ex.cost.billedPrice, 2) + " × " + thinkNote + ")" : " (" + thinkNote + ")") + cacheNote + ownNote + " · penalty = λ·price = " + fmt(ex.cost.penalty, 4) + " · value = q − penalty = " + fmt(ex.cost.value, 4) }));

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
 * "not assessed" until the next reload. */
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
          el("td", { class: "sig unknown", colspan: "9", text: "not assessed — reload to assess the edited definition" }),
        ]),
      );
      continue;
    }
    const c = a.coverage;
    const coverage = c.status === "unknown" ? "unknown" : c.covered + "/" + c.total + " (" + (c.share === null ? "?" : (c.share * 100).toFixed(1) + "%") + ")";
    const dispersion = a.dispersion.status === "unknown" ? "unknown" : a.dispersion.value.toFixed(3);
    const composition = a.composition.status === "unknown" ? "unknown" : a.composition.status === "ok" ? "ok" : "omits " + a.composition.omittedOrgs.join(", ");
    const freshness = a.freshness.status === "unknown" ? "unknown" : a.freshness.monthsBehind.toFixed(1) + "mo";
    const trust = a.trust.status === "unknown" ? "unknown" : a.trust.selfReported + "/" + a.trust.covered;
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

/** The knobs a capability's recommended bundle fills, derived from the registry
 * so the panel cannot drift from `src/features.ts`. */
function bundleKnobs(recommended) {
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

/** Render a recommended bundle as `key=value` pairs (mirrors formatBundle). */
function bundleText(recommended) {
  return bundleKnobs(recommended).map((k) => k.key + "=" + k.value).join(", ");
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

/** The effective state of one capability for a role: the authored per-role flag
 * when present (it wins either way), else the scope's global flag. */
function effectiveFlag(def, id) {
  const authored = def.features ? def.features[id] : undefined;
  if (authored !== undefined) return authored;
  return state.features[id] === true;
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
    const origin = authored === undefined ? (state.features[feature.id] === true ? "global on" : "global off") : "role override";
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

  const imgCb = el("input", { type: "checkbox" });
  imgCb.checked = !!(def.filters && def.filters.image);
  imgCb.addEventListener("change", () => {
    def.filters = def.filters || {};
    def.filters.image = imgCb.checked;
    scheduleRecompute();
  });
  panel.append(el("label", { class: "check" }, [imgCb, el("span", { "data-tip": TIPS.imageFilter, text: "requires image input (filters.image)" })]));

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
// Export
// ---------------------------------------------------------------------------

function renderExportState() {
  const dirty = dirtyRoles();
  const count = Object.keys(dirty).length;
  const btn = document.getElementById("export");
  if (btn) btn.disabled = count === 0 || state.errors.length > 0;
  const status = document.getElementById("export-status");
  if (status) status.textContent = state.exportMessage || (count ? count + " role(s) edited" : "");
}

async function onExport() {
  const dirty = dirtyRoles();
  if (Object.keys(dirty).length === 0) return;
  const btn = document.getElementById("export");
  btn.disabled = true;
  try {
    const res = await api("/api/export", { roles: dirty });
    if (res.ok) {
      state.exportMessage = "wrote " + res.roles.length + " role(s) to " + (res.lockPath || state.lockPath) + (res.backupPath ? " — backup: " + res.backupPath : "");
      for (const role of res.roles) state.effective[role] = structuredClone(state.defs[role]);
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
  return JSON.stringify({ roles: dirtyRoles() }, null, 2);
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
  if (Object.keys(dirtyRoles()).length > 0 && !confirm("Discard unsaved role edits and switch scope?")) {
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
  state.rows = [];
  state.selectedId = null;
  state.explain = null;
  state.errors = [];
  state.exportMessage = "";
  renderMeta(data);
  renderRoles();
  renderErrors();
  renderTable();
  const role = previousRole && state.defs[previousRole] ? previousRole : Object.keys(state.defs)[0];
  if (role) selectRole(role);
  else {
    state.role = null;
    renderEditor();
    renderExplain();
  }
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
