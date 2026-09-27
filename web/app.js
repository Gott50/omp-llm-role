"use strict";

/* omp-llm-role explorer client. All ranking math is server-side (src/engine.ts);
 * this file only renders and edits role defs. Model names come from a scraped
 * third-party site, so DOM is built with textContent/createElement only. */

const state = {
  role: null,
  effective: {},
  defs: {},
  defaults: {},
  metrics: [],
  metricMeta: {},
  rows: [],
  selectedId: null,
  lambda: 0,
  derivedLambda: 0,
  errors: [],
  lockPath: "",
  filter: "",
  topn: "25",
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
  lock: "Plugin settings lock file that Export writes to.",
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
  imageFilter: "Require image input (filters.image) — the gate that shrinks the vision role's eligible set.",
  normalize: "Rescale every weight so the sum is 1.0 (the parked ε is rescaled too).",
  addMetric: "Add a metric at weight 0.05, then Normalize.",
  resetEffective: "Discard edits and restore the role's saved (effective) definition.",
  resetDefaults: "Restore the shipped default definition from src/settings.ts.",
  dropInherited: "set to ~0 — the plugin deep-merges weights over the shipped defaults, so an inherited metric cannot be removed",
  dropAdded: "remove — this metric is not in the shipped default, so the key is deleted outright",
  exportBtn: "Write the edited roles into the plugin lock file (a .bak-<timestamp> sibling is written first); takes effect on the next /refresh-roles in a freshly started session.",
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

function renderMeta(data) {
  const meta = document.getElementById("meta");
  meta.textContent = "";
  meta.append(
    el("span", { class: "brand", text: "omp-llm-role explorer" }),
    el("span", { class: "sep", text: "·" }),
    el("span", { "data-tip": TIPS.models, text: data.modelCount + " models" }),
    el("span", { class: "sep", text: "·" }),
    el("span", { "data-tip": TIPS.fetched, text: "fetched " + data.fetchedAt.slice(0, 10) }),
    el("span", { class: "sep", text: "·" }),
    el("span", { "data-tip": TIPS.orJoin, text: "OpenRouter " + data.orMatched + " matched / " + data.orPriced + " priced" }),
    el("span", { class: "sep", text: "·" }),
    el("span", { class: "lock", "data-tip": TIPS.lock, text: "lock: " + data.lockPath }),
    el("button", { id: "refresh", "data-tip": TIPS.refresh, text: "Refresh data", onclick: onRefresh }),
  );
}

function renderRoles() {
  const nav = document.getElementById("roles");
  nav.textContent = "";
  for (const role of Object.keys(state.defs)) {
    const dirty = JSON.stringify(state.defs[role]) !== JSON.stringify(state.effective[role]);
    nav.append(
      el("button", {
        class: "tab" + (role === state.role ? " active" : "") + (dirty ? " dirty" : ""),
        "data-tip": state.defs[role].description || null,
        text: role,
        onclick: () => selectRole(role),
      }),
    );
  }
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
  for (const r of rows) {
    tbody.append(
      el("tr", { class: "row" + (r.id === state.selectedId ? " selected" : ""), onclick: () => selectModel(r.id) }, [
        el("td", { class: "num", text: String(r.rank) }),
        el("td", { class: "delta " + deltaClass(r.delta), text: deltaText(r.delta) }),
        el("td", { class: "star", text: r.frontier ? "★" : "" }),
        el("td", { class: "model", text: r.name }),
        el("td", { class: "org", text: r.org }),
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
    }
  }
  comp.append(cbody);
  panel.append(comp);

  panel.append(el("h3", { "data-tip": TIPS.lambda, text: "Cost" }));
  const derived = ex.role.lambda === ex.role.derivedLambda;
  panel.append(el("p", { class: "cost", "data-tip": TIPS.lambda, text: "λ = " + ex.role.lambda.toFixed(5) + " $/quality-point" + (derived ? " (derived = " + LAMBDA_DERIVATION + ")" : " (override)") }));
  panel.append(el("p", { class: "cost", "data-tip": TIPS.costPenalty, text: "eff price $" + fmt(ex.cost.priceEff, 2) + "/M" + (ex.cost.priceEff !== ex.cost.billedPrice ? " (billed $" + fmt(ex.cost.billedPrice, 2) + " × thinking)" : "") + " · penalty = λ·price = " + fmt(ex.cost.penalty, 4) + " · value = q − penalty = " + fmt(ex.cost.value, 4) }));

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

function renderEditor() {
  const panel = document.getElementById("editor");
  panel.textContent = "";
  if (!state.role) return;
  const def = state.defs[state.role];
  panel.append(el("h2", { text: "Edit @" + state.role }));

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

  const imgCb = el("input", { type: "checkbox" });
  imgCb.checked = !!(def.filters && def.filters.image);
  imgCb.addEventListener("change", () => {
    def.filters = def.filters || {};
    def.filters.image = imgCb.checked;
    scheduleRecompute();
  });
  panel.append(el("label", { class: "check" }, [imgCb, el("span", { "data-tip": TIPS.imageFilter, text: "requires image input (filters.image)" })]));

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
      el("button", { id: "reset-effective", "data-tip": TIPS.resetEffective, text: "Reset to effective", onclick: () => { state.defs[state.role] = structuredClone(state.effective[state.role]); renderEditor(); renderRoles(); scheduleRecompute(); } }),
      el("button", { id: "reset-defaults", "data-tip": TIPS.resetDefaults, text: "Reset to shipped default", onclick: () => { state.defs[state.role] = structuredClone(state.defaults[state.role]); renderEditor(); renderRoles(); scheduleRecompute(); } }),
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
      state.exportMessage = "wrote " + res.roles.length + " role(s)" + (res.backupPath ? " — backup: " + res.backupPath : "");
      for (const role of res.roles) state.effective[role] = structuredClone(state.defs[role]);
      renderRoles();
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
    const data = await api("/api/refresh", {});
    renderMeta(data);
    await recompute();
  } catch (err) {
    alert("Refresh failed: " + err.message);
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function boot() {
  const data = await api("/api/bootstrap");
  state.effective = data.roles;
  state.defaults = data.defaults;
  state.metrics = data.metrics;
  state.metricMeta = data.metricMeta;
  state.lockPath = data.lockPath;
  state.defs = structuredClone(data.roles);
  initTips();
  renderMeta(data);
  renderRoles();

  document.getElementById("filter").addEventListener("input", (e) => {
    state.filter = e.target.value;
    renderTable();
  });
  document.getElementById("topn").addEventListener("change", (e) => {
    state.topn = e.target.value;
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

  const first = Object.keys(state.defs)[0];
  if (first) selectRole(first);
}

boot().catch((err) => {
  document.getElementById("meta").textContent = "failed to load: " + err.message;
});
