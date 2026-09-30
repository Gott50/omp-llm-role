llm-stats.com best-fit ranking per omp model role — 399 models, 2026-09-30
Value ranking per role: each metric is cardinal-normalized with fixed anchors
(no ranks): llm-stats index_* affine (v+20)/80 (interval scale, observed −16..+60),
benchmarks chance-anchored pass rates, throughput log-anchored 10..300 tok/s.
q = Σ weight × metric over the quality metrics (weights renormalized excluding
price); value = q − λ·$/M sorts each role. λ = price-weight share ÷ $20, per-role
override via plugin settings roles.<role>.lambda. Metric columns show weighted
contributions and sum to q; — = metric missing (contributes 0).
Roles with a thinking level rank on the thinking-adjusted price: the billed
blend scales by the level's factor (thinking tokens bill as output); models
without thinking support are not adjusted.
Abbr: gen=general rea=reasoning math=math ag=agents tool=tool_calling lc=long_context
sea=search vis=vision tput=throughput (code, mrcr as-is).
web=website: Design Arena `models-website` Elo as a percentile within the
design-covered field (the OpenRouter mirror merged with the keyless
designarena.ai board; an endpoint Elo is trusted only at >=300 battles).
Models without Design Arena data get the capability-consistent fill 0.195 —
the percentile implied by the uncovered cohort's mean general index — and are
marked ~ in the model column.
agon=Design Arena `agents/agon_webapps` Elo from the same endpoint: context
only, unweighted (22/87 of the designer pool, below the ~35–40% coverage
bar at which a metric earns weight).
★ = Pareto-frontier: no eligible model is both cheaper and better (q).
Throughput + price: OpenRouter (p50 tok/s, last 30m routed traffic; standard-route $/M 3:1 in:out), throughput 151/399, priced 150; models without OpenRouter throughput or a billed route are not ranked.

## @default — Main workhorse: strong general coding-agent quality, sane cost
eligible: 142 — λ 0.00263 $/quality-point

|  # | value |     q | model                 | org         |   $/M | tok/s |  ctx | gen 35.8% | rea 18.9% | code 18.9% | ag 12.6% | tool 10.5% | tput 3.2% |
| -: | ----: | ----: | --------------------- | ----------- | ----: | ----: | ---: | --------: | --------: | ---------: | -------: | ---------: | --------: |
|  1 | 0.835 | 0.887 | ★ GPT-6 Astra         | OpenAI      |   $20 |    32 | 1.1M |     0.355 |     0.183 |      0.163 |    0.104 |      0.072 |     0.011 |
|  2 | 0.824 | 0.834 | ★ GPT-5.6 Sol         | OpenAI      | $4.00 |    50 | 1.1M |     0.332 |     0.173 |      0.154 |    0.095 |      0.064 |     0.015 |
|  3 | 0.815 | 0.818 | ★ GLM-5.3             | Zhipu AI    | $1.10 |   112 | 1.0M |     0.323 |     0.169 |      0.146 |    0.092 |      0.066 |     0.022 |
|  4 | 0.815 | 0.820 | ★ Muse Spark 1.3      | Meta        | $2.00 |    52 | 1.0M |     0.331 |     0.169 |      0.145 |    0.094 |      0.066 |     0.015 |
|  5 | 0.805 | 0.812 | Kimi K3               | Moonshot AI | $2.56 |    44 | 1.0M |     0.324 |     0.169 |      0.147 |    0.092 |      0.067 |     0.014 |
|  6 | 0.798 | 0.824 | Claude Opus 5         | Anthropic   |   $10 |    64 | 1.0M |     0.335 |     0.175 |      0.144 |    0.094 |      0.059 |     0.017 |
|  7 | 0.793 | 0.794 | ★ DeepSeek-V4.1-Flash | DeepSeek    | $0.11 |     5 | 1.0M |     0.319 |     0.163 |      0.149 |    0.095 |      0.068 |     0.000 |
|  8 | 0.788 | 0.791 | DeepSeek-V4-Pro-0813  | DeepSeek    | $0.98 |    66 | 1.0M |     0.318 |     0.164 |      0.140 |    0.089 |      0.063 |     0.018 |
|  9 | 0.776 | 0.788 | GPT-5.6 Terra         | OpenAI      | $4.50 |    50 | 1.1M |     0.314 |     0.162 |      0.145 |    0.090 |      0.061 |     0.015 |
| 10 | 0.776 | 0.777 | MiMo-V2.6-Pro         | Xiaomi      | $0.54 |    19 | 1.0M |     0.313 |     0.158 |      0.145 |    0.090 |      0.065 |     0.006 |

## @smol — Fast lightweight model: cheap and quick, still competent
eligible: 142 — λ 0.02143 $/quality-point

|  # | value |     q | model                          | org                   |   $/M | tok/s |  ctx | tput 40% | gen 28.6% | code 17.1% | tool 14.3% |
| -: | ----: | ----: | ------------------------------ | --------------------- | ----: | ----: | ---: | -------: | --------: | ---------: | ---------: |
|  1 | 0.763 | 0.806 | ★ Muse Spark 1.1               | Meta                  | $2.00 |   206 | 1.0M |    0.356 |     0.247 |      0.115 |      0.088 |
|  2 | 0.740 | 0.763 | ★ GLM-5.3                      | Zhipu AI              | $1.10 |   112 | 1.0M |    0.284 |     0.257 |      0.132 |      0.090 |
|  3 | 0.732 | 0.765 | ★ Gemini 3.8 Flash             | Google                | $1.50 |   147 | 1.0M |    0.316 |     0.249 |      0.123 |      0.077 |
|  4 | 0.690 | 0.722 | Gemini 3.7 Flash               | Google                | $1.50 |   118 | 1.0M |    0.290 |     0.242 |      0.115 |      0.075 |
|  5 | 0.667 | 0.688 | ★ DeepSeek-V4-Pro-0813         | DeepSeek              | $0.98 |    66 | 1.0M |    0.222 |     0.254 |      0.127 |      0.085 |
|  6 | 0.658 | 0.665 | ★ DeepSeek-V4-Flash-Vision-Exp | DeepSeek              | $0.32 |    79 | 1.0M |    0.243 |     0.232 |      0.116 |      0.074 |
|  7 | 0.655 | 0.727 | Gemini 3.5 Flash               | Google                | $3.38 |   137 | 1.0M |    0.308 |     0.223 |      0.108 |      0.088 |
|  8 | 0.653 | 0.678 | GLM-5.2                        | Zhipu AI              | $1.14 |    89 | 1.0M |    0.257 |     0.233 |      0.117 |      0.071 |
|  9 | 0.636 | 0.679 | Muse Spark 1.3                 | Meta                  | $2.00 |    52 | 1.0M |    0.194 |     0.264 |      0.131 |      0.090 |
| 10 | 0.629 | 0.643 | Inkling-Small                  | Thinking Machines Lab | $0.64 |    91 | 524k |    0.260 |     0.208 |      0.105 |      0.070 |

## @slow — Most capable model for hard problems; cost and speed as tiebreakers
eligible: 142 — λ 0.00263 $/quality-point (thinking ×7.857)

|  # | value |     q | model                  | org                       |   $/M | tok/s |  ctx | gen 27.4% | rea 27.4% | code 18.9% | ag 13.7% | math 8.4% | tput 4.2% |
| -: | ----: | ----: | ---------------------- | ------------------------- | ----: | ----: | ---: | --------: | --------: | ---------: | -------: | --------: | --------: |
|  1 | 0.808 | 0.831 | ★ GLM-5.3              | Zhipu AI                  | $8.62 |   112 | 1.0M |     0.247 |     0.244 |      0.146 |    0.100 |     0.064 |     0.030 |
|  2 | 0.791 | 0.796 | ★ Muse Spark 1.1       | Meta                      | $2.00 |   206 | 1.0M |     0.237 |     0.238 |      0.128 |    0.092 |     0.064 |     0.037 |
|  3 | 0.786 | 0.789 | ★ DeepSeek-V4.1-Flash  | DeepSeek                  | $0.89 |     5 | 1.0M |     0.244 |     0.235 |      0.149 |    0.102 |     0.058 |     0.000 |
|  4 | 0.782 | 0.802 | ★ DeepSeek-V4-Pro-0813 | DeepSeek                  | $7.66 |    66 | 1.0M |     0.243 |     0.236 |      0.140 |    0.096 |     0.063 |     0.023 |
|  5 | 0.782 | 0.785 | Hy4 preview            | Tencent                   | $1.25 |    18 |    — |     0.241 |     0.240 |      0.139 |    0.096 |     0.063 |     0.007 |
|  6 | 0.768 | 0.821 | Kimi K3                | Moonshot AI               | $20.1 |    44 | 1.0M |     0.248 |     0.244 |      0.147 |    0.100 |     0.064 |     0.018 |
|  7 | 0.766 | 0.766 | ★ Qwen3.8 Flash        | Alibaba Cloud / Qwen Team | $0.23 |    45 | 1.0M |     0.235 |     0.234 |      0.130 |    0.093 |     0.055 |     0.019 |
|  8 | 0.757 | 0.839 | ★ GPT-5.6 Sol          | OpenAI                    | $31.4 |    50 | 1.1M |     0.254 |     0.250 |      0.154 |    0.103 |     0.058 |     0.020 |
|  9 | 0.756 | 0.758 | GLM-5.3-Flash          | Zhipu AI                  | $0.60 |    15 | 1.0M |     0.238 |     0.234 |      0.126 |    0.096 |     0.059 |     0.005 |
| 10 | 0.749 | 0.755 | Qwen3.7 Max            | Alibaba Cloud / Qwen Team | $2.21 |    70 | 1.0M |     0.224 |     0.226 |      0.132 |    0.083 |     0.066 |     0.024 |

## @vision — Image understanding: vision index dominates
eligible: 74 — λ 0.00208 $/quality-point (thinking ×1.857)

|  # | value |     q | model                 | org                       |   $/M | tok/s |  ctx | vis 54.2% | gen 20.8% | rea 15.6% | code 6.3% | tput 3.1% |
| -: | ----: | ----: | --------------------- | ------------------------- | ----: | ----: | ---: | --------: | --------: | --------: | --------: | --------: |
|  1 | 0.760 | 0.770 | ★ Kimi K3             | Moonshot AI               | $4.75 |    44 | 1.0M |     0.380 |     0.189 |     0.139 |     0.048 |     0.014 |
|  2 | 0.760 | 0.775 | ★ GPT-5.6 Sol         | OpenAI                    | $7.43 |    50 | 1.1M |     0.374 |     0.193 |     0.143 |     0.051 |     0.015 |
|  3 | 0.754 | 0.793 | ★ Claude Opus 5       | Anthropic                 | $18.6 |    64 | 1.0M |     0.388 |     0.195 |     0.145 |     0.048 |     0.017 |
|  4 | 0.750 | 0.827 | ★ GPT-6 Astra         | OpenAI                    | $37.1 |    32 | 1.1M |     0.406 |     0.206 |     0.151 |     0.054 |     0.011 |
|  5 | 0.750 | 0.757 | ★ Muse Spark 1.1      | Meta                      | $3.71 |   206 | 1.0M |     0.371 |     0.180 |     0.136 |     0.042 |     0.028 |
|  6 | 0.737 | 0.743 | ★ Gemini 3.8 Flash    | Google                    | $2.79 |   147 | 1.0M |     0.363 |     0.181 |     0.128 |     0.045 |     0.025 |
|  7 | 0.733 | 0.734 | ★ Qwen3.8 Flash       | Alibaba Cloud / Qwen Team | $0.43 |    45 | 1.0M |     0.365 |     0.179 |     0.134 |     0.043 |     0.014 |
|  8 | 0.716 | 0.722 | Gemini 3.7 Flash      | Google                    | $2.79 |   118 | 1.0M |     0.353 |     0.176 |     0.128 |     0.042 |     0.023 |
|  9 | 0.712 | 0.712 | ★ DeepSeek-V4.1-Flash | DeepSeek                  | $0.21 |     5 | 1.0M |     0.343 |     0.186 |     0.134 |     0.049 |     0.000 |
| 10 | 0.711 | 0.726 | Claude Sonnet 5       | Anthropic                 | $7.43 |    44 | 1.0M |     0.361 |     0.177 |     0.131 |     0.044 |     0.014 |

## @plan — Planning: reasoning, math, long-context coherence
eligible: 142 — λ 0.00556 $/quality-point (thinking ×2.714)

|  # | value |     q | model                | org                       |   $/M | tok/s |  ctx | rea 35.6% | gen 28.9% | lc 15.6% | math 15.6% | tput 4.4% |
| -: | ----: | ----: | -------------------- | ------------------------- | ----: | ----: | ---: | --------: | --------: | -------: | ---------: | --------: |
|  1 | 0.760 | 0.820 | ★ GPT-5.6 Sol        | OpenAI                    | $10.9 |    50 | 1.1M |     0.325 |     0.268 |    0.099 |      0.107 |     0.021 |
|  2 | 0.750 | 0.754 | ★ Qwen3.8 Flash      | Alibaba Cloud / Qwen Team | $0.62 |    45 | 1.0M |     0.305 |     0.248 |    0.079 |      0.102 |     0.020 |
|  3 | 0.747 | 0.765 | ★ Hy4 preview        | Tencent                   | $3.39 |    18 |    — |     0.312 |     0.254 |    0.076 |      0.116 |     0.008 |
|  4 | 0.711 | 0.728 | GLM-5.3              | Zhipu AI                  | $2.98 |   112 | 1.0M |     0.317 |     0.260 |        — |      0.119 |     0.032 |
|  5 | 0.709 | 0.712 | Hy3                  | Tencent                   | $0.62 |    21 | 262k |     0.279 |     0.227 |    0.088 |      0.109 |     0.010 |
|  6 | 0.705 | 0.712 | GPT-5.6 Luna         | OpenAI                    | $1.22 |    51 | 1.1M |     0.282 |     0.234 |    0.080 |      0.095 |     0.021 |
|  7 | 0.704 | 0.712 | Qwen3.7-Plus         | Alibaba Cloud / Qwen Team | $1.52 |     9 |    — |     0.280 |     0.226 |    0.091 |      0.116 |     0.000 |
|  8 | 0.701 | 0.769 | GPT-5.6 Terra        | OpenAI                    | $12.2 |    50 | 1.1M |     0.304 |     0.254 |    0.089 |      0.102 |     0.021 |
|  9 | 0.695 | 0.706 | Qwen3.6 Plus         | Alibaba Cloud / Qwen Team | $1.98 |    35 | 1.0M |     0.268 |     0.214 |    0.092 |      0.115 |     0.016 |
| 10 | 0.689 | 0.704 | DeepSeek-V4-Pro-0813 | DeepSeek                  | $2.65 |    66 | 1.0M |     0.307 |     0.256 |        — |      0.116 |     0.025 |

## @commit — Commit messages: cheap and fast with decent general quality
eligible: 142 — λ 0.02692 $/quality-point

|  # | value |     q | model                          | org      |   $/M | tok/s |  ctx | tput 41.5% | gen 43.1% | code 15.4% |
| -: | ----: | ----: | ------------------------------ | -------- | ----: | ----: | ---: | ---------: | --------: | ---------: |
|  1 | 0.792 | 0.846 | ★ Muse Spark 1.1               | Meta     | $2.00 |   206 | 1.0M |      0.369 |     0.373 |      0.104 |
|  2 | 0.773 | 0.814 | ★ Gemini 3.8 Flash             | Google   | $1.50 |   147 | 1.0M |      0.328 |     0.375 |      0.111 |
|  3 | 0.772 | 0.801 | ★ GLM-5.3                      | Zhipu AI | $1.10 |   112 | 1.0M |      0.295 |     0.388 |      0.118 |
|  4 | 0.728 | 0.769 | Gemini 3.7 Flash               | Google   | $1.50 |   118 | 1.0M |      0.301 |     0.364 |      0.103 |
|  5 | 0.701 | 0.727 | ★ DeepSeek-V4-Pro-0813         | DeepSeek | $0.98 |    66 | 1.0M |      0.230 |     0.382 |      0.114 |
|  6 | 0.698 | 0.707 | ★ DeepSeek-V4-Flash-Vision-Exp | DeepSeek | $0.32 |    79 | 1.0M |      0.252 |     0.350 |      0.104 |
|  7 | 0.693 | 0.723 | GLM-5.2                        | Zhipu AI | $1.14 |    89 | 1.0M |      0.267 |     0.351 |      0.105 |
|  8 | 0.669 | 0.672 | ★ Laguna S 2.1                 | Poolside | $0.11 |    78 | 1.0M |      0.251 |     0.324 |      0.096 |
|  9 | 0.665 | 0.671 | GPT-6 Luna                     | OpenAI   | $0.20 |    63 | 1.1M |      0.225 |     0.347 |      0.099 |
| 10 | 0.663 | 0.717 | Muse Spark 1.3                 | Meta     | $2.00 |    52 | 1.0M |      0.201 |     0.398 |      0.118 |

## @tiny — Background tasks (titles, memory): cheapest and fastest wins
eligible: 142 — λ 0.03333 $/quality-point

|  # | value |     q | model                        | org         |   $/M | tok/s |  ctx | tput 58.3% | gen 41.7% |
| -: | ----: | ----: | ---------------------------- | ----------- | ----: | ----: | ---: | ---------: | --------: |
|  1 | 0.813 | 0.879 | ★ Muse Spark 1.1             | Meta        | $2.00 |   206 | 1.0M |      0.519 |     0.360 |
|  2 | 0.773 | 0.823 | ★ Gemini 3.8 Flash           | Google      | $1.50 |   147 | 1.0M |      0.461 |     0.362 |
|  3 | 0.753 | 0.790 | ★ GLM-5.3                    | Zhipu AI    | $1.10 |   112 | 1.0M |      0.414 |     0.375 |
|  4 | 0.725 | 0.775 | Gemini 3.7 Flash             | Google      | $1.50 |   118 | 1.0M |      0.423 |     0.352 |
|  5 | 0.694 | 0.696 | ★ Ling 3.0 Flash Fin         | InclusionAI | $0.06 |    86 | 262k |      0.369 |     0.327 |
|  6 | 0.683 | 0.693 | DeepSeek-V4-Flash-Vision-Exp | DeepSeek    | $0.32 |    79 | 1.0M |      0.354 |     0.339 |
|  7 | 0.677 | 0.715 | GLM-5.2                      | Zhipu AI    | $1.14 |    89 | 1.0M |      0.375 |     0.340 |
|  8 | 0.664 | 0.677 | Mercury 2                    | Inception   | $0.38 |   138 | 128k |      0.450 |     0.227 |
|  9 | 0.662 | 0.666 | Laguna S 2.1                 | Poolside    | $0.11 |    78 | 1.0M |      0.352 |     0.314 |
| 10 | 0.661 | 0.774 | Gemini 3.5 Flash             | Google      | $3.38 |   137 | 1.0M |      0.449 |     0.325 |

## @task — Subagents: agentic + tool calling, moderate cost sensitivity
eligible: 142 — λ 0.00747 $/quality-point

|  # | value |     q | model                 | org                       |   $/M | tok/s |  ctx | ag 29.9% | tool 20.7% | code 18.4% | gen 25.3% | tput 5.7% |
| -: | ----: | ----: | --------------------- | ------------------------- | ----: | ----: | ---: | -------: | ---------: | ---------: | --------: | --------: |
|  1 | 0.750 | 0.758 | ★ GLM-5.3             | Zhipu AI                  | $1.10 |   112 | 1.0M |    0.218 |      0.130 |      0.141 |     0.228 |     0.041 |
|  2 | 0.740 | 0.755 | Muse Spark 1.3        | Meta                      | $2.00 |    52 | 1.0M |    0.223 |      0.131 |      0.141 |     0.234 |     0.028 |
|  3 | 0.734 | 0.764 | ★ GPT-5.6 Sol         | OpenAI                    | $4.00 |    50 | 1.1M |    0.226 |      0.126 |      0.150 |     0.235 |     0.027 |
|  4 | 0.727 | 0.727 | ★ DeepSeek-V4.1-Flash | DeepSeek                  | $0.11 |     5 | 1.0M |    0.224 |      0.133 |      0.145 |     0.225 |     0.000 |
|  5 | 0.726 | 0.745 | Kimi K3               | Moonshot AI               | $2.56 |    44 | 1.0M |    0.217 |      0.131 |      0.143 |     0.229 |     0.025 |
|  6 | 0.719 | 0.726 | DeepSeek-V4-Pro-0813  | DeepSeek                  | $0.98 |    66 | 1.0M |    0.211 |      0.123 |      0.136 |     0.225 |     0.032 |
|  7 | 0.710 | 0.714 | MiMo-V2.6-Pro         | Xiaomi                    | $0.54 |    19 | 1.0M |    0.214 |      0.128 |      0.141 |     0.221 |     0.011 |
|  8 | 0.707 | 0.722 | Muse Spark 1.1        | Meta                      | $2.00 |   206 | 1.0M |    0.201 |      0.127 |      0.124 |     0.219 |     0.051 |
|  9 | 0.701 | 0.712 | Gemini 3.8 Flash      | Google                    | $1.50 |   147 | 1.0M |    0.204 |      0.111 |      0.132 |     0.220 |     0.045 |
| 10 | 0.696 | 0.698 | Qwen3.8 Flash         | Alibaba Cloud / Qwen Team | $0.23 |    45 | 1.0M |    0.202 |      0.126 |      0.127 |     0.217 |     0.025 |

## @advisor — Advisor/watchdog: deep reasoning over long context
eligible: 142 — λ 0.00435 $/quality-point

|  # | value |     q | model                | org                       |   $/M | tok/s |  ctx | rea 39.1% | gen 32.6% | lc 13% | math 10.9% | tput 4.3% |
| -: | ----: | ----: | -------------------- | ------------------------- | ----: | ----: | ---: | --------: | --------: | -----: | ---------: | --------: |
|  1 | 0.821 | 0.839 | ★ GPT-5.6 Sol        | OpenAI                    | $4.00 |    50 | 1.1M |     0.357 |     0.303 |  0.083 |      0.075 |     0.021 |
|  2 | 0.777 | 0.782 | ★ Hy4 preview        | Tencent                   | $1.25 |    18 |    — |     0.343 |     0.287 |  0.063 |      0.081 |     0.008 |
|  3 | 0.771 | 0.772 | ★ Qwen3.8 Flash      | Alibaba Cloud / Qwen Team | $0.23 |    45 | 1.0M |     0.335 |     0.280 |  0.067 |      0.071 |     0.019 |
|  4 | 0.767 | 0.787 | GPT-5.6 Terra        | OpenAI                    | $4.50 |    50 | 1.1M |     0.334 |     0.286 |  0.075 |      0.071 |     0.021 |
|  5 | 0.752 | 0.757 | GLM-5.3              | Zhipu AI                  | $1.10 |   112 | 1.0M |     0.349 |     0.294 |      — |      0.083 |     0.031 |
|  6 | 0.747 | 0.756 | Muse Spark 1.3       | Meta                      | $2.00 |    52 | 1.0M |     0.349 |     0.301 |  0.085 |          — |     0.021 |
|  7 | 0.735 | 0.744 | Muse Spark 1.1       | Meta                      | $2.00 |   206 | 1.0M |     0.341 |     0.282 |      — |      0.082 |     0.039 |
|  8 | 0.735 | 0.746 | Kimi K3              | Moonshot AI               | $2.56 |    44 | 1.0M |     0.349 |     0.295 |      — |      0.083 |     0.019 |
|  9 | 0.733 | 0.776 | Claude Opus 5        | Anthropic                 |   $10 |    64 | 1.0M |     0.362 |     0.305 |      — |      0.085 |     0.024 |
| 10 | 0.728 | 0.732 | DeepSeek-V4-Pro-0813 | DeepSeek                  | $0.98 |    66 | 1.0M |     0.338 |     0.290 |      — |      0.081 |     0.024 |

## @designer — Design work: visual/UX judgement on image-capable models
eligible: 87 — λ 0.00882 $/quality-point (thinking ×2.714)

|  # | value |     q | model                 | org         |   $/M | tok/s |  ctx | gen 30.6% | code 11.8% | vis 21.2% | tput 15.3% | web 21.2% | agon |
| -: | ----: | ----: | --------------------- | ----------- | ----: | ----: | ---: | --------: | ---------: | --------: | ---------: | --------: | ---: |
|  1 | 0.768 | 0.803 | ★ Gemini 3.8 Flash    | Google      | $4.07 |   147 | 1.0M |     0.266 |      0.085 |     0.142 |      0.121 |     0.190 | 1247 |
|  2 | 0.746 | 0.782 | Gemini 3.7 Flash      | Google      | $4.07 |   118 | 1.0M |     0.259 |      0.079 |     0.138 |      0.111 |     0.195 | 1232 |
|  3 | 0.741 | 0.789 | Muse Spark 1.1        | Meta        | $5.43 |   206 | 1.0M |     0.265 |      0.079 |     0.145 |      0.136 |     0.164 |    — |
|  4 | 0.735 | 0.783 | Muse Spark 1.3        | Meta        | $5.43 |    52 | 1.0M |     0.283 |      0.090 |     0.125 |      0.074 |     0.211 | 1303 |
|  5 | 0.730 | 0.791 | Kimi K3               | Moonshot AI | $6.94 |    44 | 1.0M |     0.277 |      0.091 |     0.149 |      0.067 |     0.207 |    — |
|  6 | 0.703 | 0.716 | ★ MiMo-V2.6-Pro       | Xiaomi      | $1.47 |    19 | 1.0M |     0.267 |      0.090 |     0.125 |      0.029 |     0.206 |    — |
|  7 | 0.703 | 0.798 | GPT-5.6 Sol           | OpenAI      | $10.9 |    50 | 1.1M |     0.284 |      0.096 |     0.146 |      0.072 |     0.200 | 1200 |
|  8 | 0.694 | 0.696 | ★ DeepSeek-V4.1-Flash | DeepSeek    | $0.31 |     5 | 1.0M |     0.273 |      0.093 |     0.134 |      0.000 |     0.197 |    — |
|  9 | 0.683 | 0.688 | GPT-6 Luna            | OpenAI      | $0.54 |    63 | 1.1M |     0.247 |      0.075 |     0.112 |      0.083 |     0.171 |    — |
| 10 | 0.665 | 0.666 | ★ GLM-5.3-Flash       | Zhipu AI    | $0.21 |    15 | 1.0M |     0.266 |      0.078 |     0.135 |      0.018 |     0.169 |    — |

# Suggested settings.modelRoles (best-fit #1 per role, resolved via the omp catalog).
# Selectors are openrouter/<id>; the omp-llm-role plugin writes this block daily.
modelRoles:
  default: "openrouter/openai/gpt-6-astra"
  smol: "openrouter/meta/muse-spark-1.1"
  slow: "openrouter/z-ai/glm-5.3"
  vision: "openrouter/moonshotai/kimi-k3"
  plan: "openrouter/openai/gpt-5.6-sol"
  commit: "openrouter/meta/muse-spark-1.1"
  tiny: "openrouter/meta/muse-spark-1.1"
  task: "openrouter/z-ai/glm-5.3"
  advisor: "openrouter/openai/gpt-5.6-sol"
  designer: "openrouter/google/gemini-3.8-flash"
