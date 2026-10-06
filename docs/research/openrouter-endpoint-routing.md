# OpenRouter endpoint routing — external learnings

Source: **Kai, "OpenRouter is Quietly Giving Nerfed AI Model (STOP Using Wrong
Endpoint)"** (2026-10-05, 14:18, https://youtu.be/ZsnFX5mEJ4s).

Grounded in the video's **full auto-caption transcript**
([`openrouter-endpoint-routing.transcript.txt`](openrouter-endpoint-routing.transcript.txt),
fetched with `yt-dlp --write-auto-subs`, `en-orig`) plus its description, and
cross-checked against this repo's own OpenRouter data model. Auto-captions, so
expect minor transcription artifacts.

This is a **research note**, not a contract. It records what an external
practitioner argues about OpenRouter's routing and how it maps onto (or
contradicts) `omp-llm-role`'s design. The contracts stay in the topic docs under
[`../dev/`](../dev/README.md); the measured numbers stay in
[`../dev/scoring.md`](../dev/scoring.md); the source model stays in
[`../dev/data-sources.md`](../dev/data-sources.md).

## The thesis

> "The model didn't get quantized and what got quietly adjusted instead was the
> number the router sorts on and the context ceiling the endpoint quietly set and
> the tool call behavior nobody tested and the cash pricing nobody factors in."

The "my model got nerfed / it must be 4-bit" complaint is mostly wrong. The real
quality and cost gaps come from **per-endpoint capability ceilings** (context
window, max output tokens, tool support) and **cache pricing** — not from bit
depth. Quantization labels are unreliable: an `fp4` tag usually means the lab's
own original weights, and a `bf16` tag on a natively-4-bit model is an upcast
that cannot add back information that was never stored.

## What the video claims (with its numbers)

1. **Routing is price-first.** OpenRouter is a routing layer over ~54 inference
   providers and takes a 5.5% cut. The default pick is **inverse-square
   weighting on price**: a provider at \$1/M is *nine times* more likely to be
   picked than one at \$3/M.
2. **The endpoints API is mostly silent on precision.** 335 endpoints across 54
   providers for 27 open-weight models. 54 serve something at 4 bits
   (FP4/INT4/MXFP4/NVFP4); **120 (35.8%) say `unknown`**. DeepSeek's own
   v4.1-flash endpoint does not state its precision.
3. **The docs admit the tradeoff.** OpenRouter's docs warn "quantized models may
   exhibit degraded performance for certain prompts"; the next line says
   "requests are routed by price".
4. **The labs ship 4-bit themselves.** Kimi K3 is MXFP4 (baked in from the SFT
   stage), gpt-oss-120b stores its MoE weights in MXFP4 (all published evals ran
   at that precision), DeepSeek V4 Pro's config has `expert_dtype: fp4`. A
   DeepInfra engineer: *"We serve the model using the original weight. The weight
   is FP4. That's why we label it FP4."* Kimi K3's cheapest provider (Morph) is
   tagged **FP8** — an upscale — and charges 39% less on output.
5. **Per-endpoint accuracy gaps are real, and not about bits.** Artificial
   Analysis scored each provider endpoint separately: on GLM 5.2, Nebius 100% vs
   DeepInfra 73% — **27 points apart, both labeled FP4, same day**.
6. **Context caps.** Novita serves Llama 3.3 70B at 12,288 tokens vs Meta's
   131,072 — **9% of the model's memory**. 27 endpoints advertise less than half
   the model's context window.
7. **Max-output caps.** Together caps Llama 3.3 70B output at 248 tokens;
   DigitalOcean's gpt-oss-120b caps at 4,096. EpochAI found that model needs
   >32,000 tokens to finish a hard benchmark question — so that endpoint can
   produce **1/8 of the thinking the task takes**. 19 endpoints cap output at
   16,384 tokens or less. A reasoning model cut off mid-thought does not look
   truncated; it just hands back a half-formed answer and *looks dumb*.
8. **Tool support is per-endpoint.** 26 endpoints cannot call tools at all.
   OpenRouter shipped **Exacto** (Oct 2024) to route tool requests by tool-call
   correctness, and made it default for tool requests in March 2025
   (**auto-Exacto**). GLM5 tool-call errors fell 88% (8% → 1%); gpt-oss-120b
   5.6% → 3.5%. Read backwards: before March, the default router sent **1 in
   every 12 GLM5 tool calls** to an endpoint that would break it. But only ~15%
   of users include tools, so **85% of requests still route by price**.
9. **Cache pricing is ignored by the router.** Tarun Chitra (Aug): the formula
   sorts on the **input (prompt) price alone** — measured, not inferred: 64/64
   informative provider splits picked the cheapest-input provider, and output
   price carries ≲6 cents per dollar of input (the inverse-square exponent
   recovered from 1,648 choices is r = 1.968, 95% CI [1.856, 2.098]) — while
   real usage is closer to 6:1, and it ignores cache pricing entirely. DeepSeek's
   own endpoint has a **94.5% cache hit rate** vs 51–69% for most third parties,
   so the router ranks DeepSeek **10th by listed price but 1st by invoice**.
   Chitra estimated ~\$3.5M/yr of value extracted by this misalignment. Primary
   source: *Caching Cheaters on OpenRouter*, 2026-08-14,
   https://robvc.com/research/caching-cheaters (behaviour-measured, not
   source-read).
10. **The one case where quantization is real.** GLM 5.3 (ZAI) ships in FP8
    (confirmed in the repo). 11 of its 42 endpoints are tagged FP4/NVFP4 — a
    genuine downcast. ZAI's own endpoint charges \$1.40 in / \$4.40 out, while
    seven of those 4-bit endpoints charge \$4.40 out or more (one \$4.84): the
    compression freed ~2 B200 GPUs of VRAM per copy and **none of the saving was
    passed on**. Novita serves the same model at full FP8 for 30% of the lab
    price — but the router's weighting pushes traffic toward the compressed
    versions because their *input* price is slightly lower.
11. **The fix is ~4 lines of JSON.** A `provider` object with `order` (pin
    verified providers), `require_parameters: true` (drop endpoints that can't
    honor your settings), an explicit `max_tokens`, and optionally a
    `quantizations` floor. Caveat: sorting by price or using floor suffixes
    **opts you out of auto-Exacto**. Recommendation: pin providers for
    cache/chat work where you know what you want; leave tool-calling requests on
    the default with auto-Exacto active.
12. **The activity log is ground truth.** OpenRouter records which provider
    actually served each request, per request. For a bad output, the session id
    resolves the endpoint and its charge faster than any forum thread.

## What this means for `omp-llm-role`

### 1. The 1/price² blend is confirmed — no change

The project already models OpenRouter's default routing exactly:
`buildOpenRouterEnrichment` computes the expected price/throughput of one request
under probability proportional to `1/price²` over the eligible standard-tier
routes (data-sources.md, "The 1/price² blend"). The video's "inverse-square
weighting" is the same mechanism. The project's model is validated, not changed.

### 2. Quantization labels are correctly ignored

The project models no precision/quantization axis. The video argues this is
right: `fp4` often means the lab's original weights, and `bf16` on a natively
4-bit model is an upcast. **Do not add a quantization metric** — the label is not
a quality signal.

### 3. The capability-ceiling axis is real — and the data is already fetched

> **Update (2026-10-06, issue #18):** this axis has since **landed**.
> `narrowEndpointRecord` now reads `context_length`, `max_completion_tokens` and
> `supported_parameters` (tools), and the role `filters` (`tools`,
> `minContextTokens`, `minOutputTokens`, `maxPriceUsdPerM`) gate the route pool on
> them. The paragraphs below record the pre-landing state that motivated the
> change.

The project's `context` is **model-level** (llm-stats `context`) and is report-only,
never scored. The endpoint pool is filtered only by tier/status/free/price. The
video's "looks dumb but isn't" failure mode — a reasoning model cut off by a low
`max_completion_tokens`, or a small per-endpoint `context_length` — is invisible
to the ranking.

Crucially, the project's **existing** model-page source already carries the
fields. The RSC payload's per-endpoint records include `context_length`,
`max_completion_tokens`, `quantization`, and `supported_parameters` (which lists
`tools`). `narrowEndpointRecord` (`src/engine.ts`) reads only
`id`/`provider_slug`/`service_tier`/`status`/`is_free`/`model_variant_permaslug`/
`pricing`/`stats` and **discards all four**. So the axis is actionable from an
existing source — no new fetch is needed.

There is also a **dormant, named hook** for part of it: the role schema declared
`filters: { maxPriceUsdPerM, minContextTokens }` as schema capability, but
`scoring.md` records that `rankRole` implements only `filters.image` —
`resolveSettings` does not validate the other two and the engine never enforces
them. Note the axis mismatch: `minContextTokens` would filter on the
**model-level** `context` (llm-stats), which the project already has, whereas the
video's ceiling is the **per-endpoint** `context_length` that
`narrowEndpointRecord` drops. So the schema anticipated a context floor but at
model granularity; the endpoint-granular cap the video is actually about is the
unused half.

### 4. Tool support is a per-endpoint property the project doesn't model

> **Update (2026-10-06, issue #18):** `filters.tools` now gates the route pool on
> the endpoint's `supported_parameters` containing `tools`; the `tool_calling`
> index remains model-level.

The project's `tool_calling` metric is the llm-stats index (model-level). The
video's point is that tool support is per-endpoint: 26 endpoints can't call
tools, and auto-Exacto only covers requests that include tools. A role weighting
`tool_calling` currently ranks on the model index, not on whether the routed
endpoint can actually call tools.

### 5. Cache pricing is a real cost axis the project doesn't model

The project's price is the `1/price²` blend of **listed** prices. The video (via
Chitra) says the listed-price sort mis-ranks cache-heavy workloads: DeepSeek's
own endpoint is 10th by listed price but 1st by invoice (94.5% cache hit vs
51–69%). Agent loops resend the same system prompt every turn, so cache pricing
dominates real cost. The project's price axis is a listed-price proxy, not an
invoice proxy.

### 6. Provider pinning is the mitigation — and it opts out of auto-Exacto

If the project ever writes provider routing into config, the video's recipe is
`provider.order` + `require_parameters: true` + explicit `max_tokens` (+ a
`quantizations` floor). But price sort / floor suffixes opt out of auto-Exacto,
so the recommendation is to pin for cache/chat work and leave tool calls on the
default.

## Actionable takeaways

- **Keep the `1/price²` model.** It is OpenRouter's actual default routing; the
  video is independent confirmation.
- **Do not add a quantization metric.** The label is not a quality signal.
- **The capability-ceiling axis is available but discarded.** Per-endpoint
  `context_length`, `max_completion_tokens`, and `supported_parameters` (tools)
  ride the already-fetched model pages; `narrowEndpointRecord` drops them. If the
  project wants to model "the endpoint can't finish the thought", the data is
  there — no new source. The `minContextTokens` filter already named in the role
  schema is a dormant hook, but it filters on model-level `context`, not the endpoint cap.
  *(Landed 2026-10-06, issue #18: the ceilings are now read and the role filters
  gate on them; `minContextTokens` now filters the endpoint `context_length`.)*
- **Cache pricing is the open cost gap.** The project prices listed, not
  invoiced; a cache-heavy role is mispriced. Not actionable without per-endpoint
  cache-hit data (the video cites DeepSeek 94.5% vs 51–69%).
- **The activity log is the ground-truth per-request provider** — useful for
  debugging a bad output, not for ranking.
