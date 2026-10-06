llm-stats.com best-fit ranking per omp model role — 400 models, 2026-10-06
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
Throughput + price: OpenRouter per-provider routes under the default price-based routing (weight 1/price² over stable standard-tier providers; p50 tok/s of routed traffic; $/M 3:1 in:out), throughput 152/400, priced 151; models without OpenRouter throughput or a billed route are not ranked.

## @default — Main workhorse: strong general coding-agent quality, sane cost
eligible: 143 — λ 0.00556 $/quality-point (thinking ×1.857)

|  # | value |     q | model                 | org                       |   $/M | tok/s |  ctx | gen 54.7% | code 18.9% | ag 12.6% | tool 10.5% | tput 3.2% |
| -: | ----: | ----: | --------------------- | ------------------------- | ----: | ----: | ---: | --------: | ---------: | -------: | ---------: | --------: |
|  1 | 0.811 | 0.814 | ★ DeepSeek-V4.1-Flash | DeepSeek                  | $0.59 |    56 | 1.0M |     0.487 |      0.149 |    0.094 |      0.068 |     0.016 |
|  2 | 0.807 | 0.827 | ★ Muse Spark 1.3      | Meta                      | $3.71 |    64 | 1.0M |     0.505 |      0.145 |    0.094 |      0.066 |     0.017 |
|  3 | 0.790 | 0.815 | GLM-5.3               | Zhipu AI                  | $4.55 |    74 | 1.0M |     0.493 |      0.145 |    0.092 |      0.066 |     0.019 |
|  4 | 0.784 | 0.798 | DeepSeek-V4-Pro-0813  | DeepSeek                  | $2.50 |    89 | 1.0M |     0.486 |      0.140 |    0.089 |      0.063 |     0.020 |
|  5 | 0.783 | 0.788 | MiMo-V2.6-Pro         | Xiaomi                    | $1.01 |    29 | 1.0M |     0.478 |      0.144 |    0.091 |      0.065 |     0.010 |
|  6 | 0.772 | 0.835 | ★ GPT-5.6 Sol         | OpenAI                    | $11.4 |    53 | 1.1M |     0.507 |      0.154 |    0.095 |      0.064 |     0.016 |
|  7 | 0.771 | 0.816 | Kimi K3               | Moonshot AI               | $8.09 |    53 | 1.0M |     0.495 |      0.147 |    0.092 |      0.067 |     0.016 |
|  8 | 0.771 | 0.783 | Hy4 preview           | Tencent                   | $2.26 |    40 |    — |     0.481 |      0.138 |    0.088 |      0.063 |     0.013 |
|  9 | 0.764 | 0.767 | ★ Qwen3.8 Flash       | Alibaba Cloud / Qwen Team | $0.43 |    63 | 1.0M |     0.470 |      0.130 |    0.085 |      0.064 |     0.017 |
| 10 | 0.763 | 0.765 | ★ GLM-5.3-Flash       | Zhipu AI                  | $0.33 |    35 | 1.0M |     0.475 |      0.126 |    0.089 |      0.064 |     0.012 |

## @smol — Fast lightweight model: cheap and quick, still competent
eligible: 143 — λ 0.04091 $/quality-point

|  # | value |     q | model                        | org                       |   $/M | tok/s |  ctx | tput 40% | gen 28.6% | code 17.1% | tool 14.3% |
| -: | ----: | ----: | ---------------------------- | ------------------------- | ----: | ----: | ---: | -------: | --------: | ---------: | ---------: |
|  1 | 0.720 | 0.801 | ★ Muse Spark 1.1             | Meta                      | $2.00 |   199 | 1.0M |    0.351 |     0.247 |      0.115 |      0.088 |
|  2 | 0.670 | 0.683 | ★ DeepSeek-V4.1-Flash        | DeepSeek                  | $0.32 |    56 | 1.0M |    0.202 |     0.254 |      0.135 |      0.092 |
|  3 | 0.668 | 0.723 | ★ DeepSeek-V4-Pro-0813       | DeepSeek                  | $1.34 |    89 | 1.0M |    0.258 |     0.253 |      0.127 |      0.085 |
|  4 | 0.663 | 0.724 | ★ Gemini 3.7 Flash           | Google                    | $1.50 |   121 | 1.0M |    0.293 |     0.241 |      0.115 |      0.075 |
|  5 | 0.658 | 0.677 | DeepSeek-V4-Flash-Vision-Exp | DeepSeek                  | $0.46 |    87 | 1.0M |    0.255 |     0.232 |      0.116 |      0.074 |
|  6 | 0.657 | 0.667 | ★ Qwen3.8 Flash              | Alibaba Cloud / Qwen Team | $0.23 |    63 | 1.0M |    0.216 |     0.245 |      0.118 |      0.087 |
|  7 | 0.652 | 0.654 | ★ Ling 3.0 Flash             | InclusionAI               | $0.04 |   120 | 131k |    0.293 |     0.201 |      0.096 |      0.064 |
|  8 | 0.628 | 0.637 | GPT-6 Luna                   | OpenAI                    | $0.21 |    67 | 1.1M |    0.224 |     0.230 |      0.110 |      0.074 |
|  9 | 0.626 | 0.635 | Hy3                          | Tencent                   | $0.22 |    69 | 262k |    0.228 |     0.224 |      0.113 |      0.070 |
| 10 | 0.625 | 0.686 | Gemini 3.8 Flash             | Google                    | $1.50 |    76 | 1.0M |    0.239 |     0.248 |      0.123 |      0.077 |

## @slow — Most capable model for hard problems; cost and speed as tiebreakers
eligible: 143 — λ 0.00263 $/quality-point (thinking ×2.714)

|  # | value |     q | model                 | org         |   $/M | tok/s |  ctx | gen 63.2% | code 18.9% | ag 13.7% | tput 4.2% |
| -: | ----: | ----: | --------------------- | ----------- | ----: | ----: | ---: | --------: | ---------: | -------: | --------: |
|  1 | 0.838 | 0.852 | ★ Muse Spark 1.3      | Meta        | $5.43 |    64 | 1.0M |     0.582 |      0.145 |    0.102 |     0.023 |
|  2 | 0.832 | 0.834 | ★ DeepSeek-V4.1-Flash | DeepSeek    | $0.86 |    56 | 1.0M |     0.562 |      0.149 |    0.102 |     0.021 |
|  3 | 0.821 | 0.838 | GLM-5.3               | Zhipu AI    | $6.65 |    74 | 1.0M |     0.569 |      0.145 |    0.100 |     0.025 |
|  4 | 0.818 | 0.862 | ★ GPT-5.6 Sol         | OpenAI      | $16.6 |    53 | 1.1M |     0.585 |      0.154 |    0.103 |     0.021 |
|  5 | 0.814 | 0.824 | DeepSeek-V4-Pro-0813  | DeepSeek    | $3.65 |    89 | 1.0M |     0.560 |      0.140 |    0.096 |     0.027 |
|  6 | 0.807 | 0.838 | Kimi K3               | Moonshot AI | $11.8 |    53 | 1.0M |     0.572 |      0.147 |    0.099 |     0.021 |
|  7 | 0.804 | 0.807 | MiMo-V2.6-Pro         | Xiaomi      | $1.47 |    29 | 1.0M |     0.552 |      0.144 |    0.098 |     0.013 |
|  8 | 0.798 | 0.806 | Hy4 preview           | Tencent     | $3.30 |    40 |    — |     0.555 |      0.138 |    0.095 |     0.017 |
|  9 | 0.794 | 0.824 | GPT-6.1 Sol           | OpenAI      | $11.5 |    40 | 1.1M |     0.569 |      0.138 |    0.099 |     0.017 |
| 10 | 0.792 | 0.803 | Gemini 3.8 Flash      | Google      | $4.07 |    76 | 1.0M |     0.549 |      0.136 |    0.093 |     0.025 |

## @vision — Image understanding: vision index dominates
eligible: 75 — λ 0.00682 $/quality-point (thinking ×1.857)

|  # | value |     q | model               | org                       |   $/M | tok/s |  ctx | vis 54.2% | gen 20.8% | rea 15.6% | code 6.3% | tput 3.1% |
| -: | ----: | ----: | ------------------- | ------------------------- | ----: | ----: | ---: | --------: | --------: | --------: | --------: | --------: |
|  1 | 0.734 | 0.737 | ★ Qwen3.8 Flash     | Alibaba Cloud / Qwen Team | $0.43 |    63 | 1.0M |     0.364 |     0.179 |     0.134 |     0.043 |     0.017 |
|  2 | 0.732 | 0.757 | ★ Muse Spark 1.1    | Meta                      | $3.71 |   199 | 1.0M |     0.371 |     0.180 |     0.136 |     0.042 |     0.027 |
|  3 | 0.724 | 0.728 | DeepSeek-V4.1-Flash | DeepSeek                  | $0.59 |    56 | 1.0M |     0.343 |     0.185 |     0.134 |     0.049 |     0.016 |
|  4 | 0.717 | 0.736 | Gemini 3.8 Flash    | Google                    | $2.79 |    76 | 1.0M |     0.363 |     0.181 |     0.128 |     0.045 |     0.019 |
|  5 | 0.716 | 0.771 | ★ Kimi K3           | Moonshot AI               | $8.09 |    53 | 1.0M |     0.380 |     0.189 |     0.139 |     0.048 |     0.015 |
|  6 | 0.711 | 0.714 | ★ GLM-5.3-Flash     | Zhipu AI                  | $0.33 |    35 | 1.0M |     0.346 |     0.181 |     0.133 |     0.042 |     0.012 |
|  7 | 0.704 | 0.723 | Gemini 3.7 Flash    | Google                    | $2.79 |   121 | 1.0M |     0.354 |     0.176 |     0.128 |     0.042 |     0.023 |
|  8 | 0.695 | 0.772 | ★ GPT-5.6 Sol       | OpenAI                    | $11.4 |    53 | 1.1M |     0.371 |     0.193 |     0.143 |     0.051 |     0.015 |
|  9 | 0.695 | 0.707 | Qwen3.8-27B         | Alibaba Cloud / Qwen Team | $1.86 |    51 | 262k |     0.359 |     0.169 |     0.126 |     0.040 |     0.015 |
| 10 | 0.685 | 0.711 | Muse Spark 1.3      | Meta                      | $3.71 |    64 | 1.0M |     0.314 |     0.192 |     0.139 |     0.048 |     0.017 |

## @plan — Planning: reasoning and long-context coherence, priced so the cheapest capable planner wins
eligible: 143 — λ 0.01667 $/quality-point (thinking ×1.857)

|  # | value |     q | model                | org                       |   $/M | tok/s |  ctx | gen 80% | lc 15.6% | tput 4.4% |
| -: | ----: | ----: | -------------------- | ------------------------- | ----: | ----: | ---: | ------: | -------: | --------: |
|  1 | 0.801 | 0.863 | ★ Muse Spark 1.3     | Meta                      | $3.71 |    64 | 1.0M |   0.737 |    0.101 |     0.024 |
|  2 | 0.783 | 0.790 | ★ Qwen3.8 Flash      | Alibaba Cloud / Qwen Team | $0.43 |    63 | 1.0M |   0.686 |    0.079 |     0.024 |
|  3 | 0.769 | 0.815 | ★ Gemini 3.8 Flash   | Google                    | $2.79 |    76 | 1.0M |   0.696 |    0.093 |     0.026 |
|  4 | 0.762 | 0.809 | Gemini 3.7 Flash     | Google                    | $2.79 |   121 | 1.0M |   0.676 |    0.100 |     0.033 |
|  5 | 0.759 | 0.797 | ★ Hy4 preview        | Tencent                   | $2.26 |    40 |    — |   0.703 |    0.076 |     0.018 |
|  6 | 0.755 | 0.765 | DeepSeek-V4.1-Flash  | DeepSeek                  | $0.59 |    56 | 1.0M |   0.712 |    0.030 |     0.022 |
|  7 | 0.736 | 0.750 | GPT-5.6 Luna         | OpenAI                    | $0.88 |    61 | 1.1M |   0.647 |    0.080 |     0.024 |
|  8 | 0.736 | 0.741 | ★ GLM-5.3-Flash      | Zhipu AI                  | $0.33 |    35 | 1.0M |   0.694 |    0.030 |     0.016 |
|  9 | 0.735 | 0.742 | ★ Hy3                | Tencent                   | $0.40 |    69 | 262k |   0.629 |    0.088 |     0.025 |
| 10 | 0.727 | 0.769 | DeepSeek-V4-Pro-0813 | DeepSeek                  | $2.50 |    89 | 1.0M |   0.710 |    0.030 |     0.029 |

## @commit — Commit messages: cheap and fast with decent general quality
eligible: 143 — λ 0.04091 $/quality-point

|  # | value |     q | model                          | org                       |   $/M | tok/s |  ctx | tput 41.5% | gen 43.1% | code 15.4% |
| -: | ----: | ----: | ------------------------------ | ------------------------- | ----: | ----: | ---: | ---------: | --------: | ---------: |
|  1 | 0.759 | 0.841 | ★ Muse Spark 1.1               | Meta                      | $2.00 |   199 | 1.0M |      0.365 |     0.372 |      0.103 |
|  2 | 0.710 | 0.771 | ★ Gemini 3.7 Flash             | Google                    | $1.50 |   121 | 1.0M |      0.304 |     0.364 |      0.103 |
|  3 | 0.709 | 0.764 | ★ DeepSeek-V4-Pro-0813         | DeepSeek                  | $1.34 |    89 | 1.0M |      0.268 |     0.382 |      0.114 |
|  4 | 0.701 | 0.714 | ★ DeepSeek-V4.1-Flash          | DeepSeek                  | $0.32 |    56 | 1.0M |      0.210 |     0.383 |      0.121 |
|  5 | 0.700 | 0.719 | ★ DeepSeek-V4-Flash-Vision-Exp | DeepSeek                  | $0.46 |    87 | 1.0M |      0.265 |     0.350 |      0.104 |
|  6 | 0.691 | 0.693 | ★ Ling 3.0 Flash               | InclusionAI               | $0.04 |   120 | 131k |      0.304 |     0.303 |      0.086 |
|  7 | 0.691 | 0.700 | ★ Qwen3.8 Flash                | Alibaba Cloud / Qwen Team | $0.23 |    63 | 1.0M |      0.225 |     0.370 |      0.106 |
|  8 | 0.671 | 0.732 | Gemini 3.8 Flash               | Google                    | $1.50 |    76 | 1.0M |      0.248 |     0.375 |      0.110 |
|  9 | 0.668 | 0.677 | GPT-6 Luna                     | OpenAI                    | $0.21 |    67 | 1.1M |      0.233 |     0.346 |      0.098 |
| 10 | 0.667 | 0.676 | Hy3                            | Tencent                   | $0.22 |    69 | 262k |      0.236 |     0.338 |      0.101 |

## @tiny — Background tasks (titles, memory): cheapest and fastest wins
eligible: 143 — λ 0.03333 $/quality-point

|  # | value |     q | model                        | org                       |   $/M | tok/s |  ctx | tput 58.3% | gen 41.7% |
| -: | ----: | ----: | ---------------------------- | ------------------------- | ----: | ----: | ---: | ---------: | --------: |
|  1 | 0.806 | 0.873 | ★ Muse Spark 1.1             | Meta                      | $2.00 |   199 | 1.0M |      0.513 |     0.360 |
|  2 | 0.752 | 0.755 | ★ Nemotron 3 Nano (30B A3B)  | NVIDIA                    | $0.09 |   235 | 262k |      0.541 |     0.214 |
|  3 | 0.732 | 0.744 | Mercury 2                    | Inception                 | $0.38 |   204 | 128k |      0.517 |     0.227 |
|  4 | 0.729 | 0.779 | ★ Gemini 3.7 Flash           | Google                    | $1.50 |   121 | 1.0M |      0.427 |     0.352 |
|  5 | 0.718 | 0.720 | ★ Ling 3.0 Flash             | InclusionAI               | $0.04 |   120 | 131k |      0.427 |     0.293 |
|  6 | 0.713 | 0.715 | Ling 3.0 Flash Fin           | InclusionAI               | $0.07 |    96 | 262k |      0.389 |     0.327 |
|  7 | 0.704 | 0.722 | Gemini 3.1 Flash-Lite        | Google                    | $0.56 |   144 | 1.0M |      0.457 |     0.265 |
|  8 | 0.703 | 0.717 | Qwen3-Next-80B-A3B-Thinking  | Alibaba Cloud / Qwen Team | $0.41 |   173 |    — |      0.489 |     0.228 |
|  9 | 0.701 | 0.745 | DeepSeek-V4-Pro-0813         | DeepSeek                  | $1.34 |    89 | 1.0M |      0.376 |     0.370 |
| 10 | 0.695 | 0.711 | DeepSeek-V4-Flash-Vision-Exp | DeepSeek                  | $0.46 |    87 | 1.0M |      0.372 |     0.339 |

## @task — Subagents: agentic + tool calling, moderate cost sensitivity
eligible: 143 — λ 0.00747 $/quality-point (thinking ×1.857)

|  # | value |     q | model                 | org                       |   $/M | tok/s |  ctx | ag 29.9% | tool 20.7% | code 18.4% | gen 25.3% | tput 5.7% |
| -: | ----: | ----: | --------------------- | ------------------------- | ----: | ----: | ---: | -------: | ---------: | ---------: | --------: | --------: |
|  1 | 0.751 | 0.755 | ★ DeepSeek-V4.1-Flash | DeepSeek                  | $0.59 |    56 | 1.0M |    0.223 |      0.133 |      0.145 |     0.225 |     0.029 |
|  2 | 0.730 | 0.758 | ★ Muse Spark 1.3      | Meta                      | $3.71 |    64 | 1.0M |    0.222 |      0.131 |      0.141 |     0.233 |     0.031 |
|  3 | 0.717 | 0.751 | GLM-5.3               | Zhipu AI                  | $4.55 |    74 | 1.0M |    0.218 |      0.130 |      0.141 |     0.228 |     0.034 |
|  4 | 0.714 | 0.722 | MiMo-V2.6-Pro         | Xiaomi                    | $1.01 |    29 | 1.0M |    0.214 |      0.128 |      0.140 |     0.221 |     0.018 |
|  5 | 0.712 | 0.731 | DeepSeek-V4-Pro-0813  | DeepSeek                  | $2.50 |    89 | 1.0M |    0.210 |      0.123 |      0.136 |     0.224 |     0.037 |
|  6 | 0.700 | 0.703 | ★ Qwen3.8 Flash       | Alibaba Cloud / Qwen Team | $0.43 |    63 | 1.0M |    0.202 |      0.126 |      0.126 |     0.217 |     0.031 |
|  7 | 0.696 | 0.699 | ★ GLM-5.3-Flash       | Zhipu AI                  | $0.33 |    35 | 1.0M |    0.210 |      0.126 |      0.122 |     0.219 |     0.021 |
|  8 | 0.695 | 0.712 | Hy4 preview           | Tencent                   | $2.26 |    40 |    — |    0.208 |      0.123 |      0.134 |     0.222 |     0.023 |
|  9 | 0.693 | 0.721 | Muse Spark 1.1        | Meta                      | $3.71 |   199 | 1.0M |    0.201 |      0.127 |      0.124 |     0.219 |     0.050 |
| 10 | 0.687 | 0.747 | Kimi K3               | Moonshot AI               | $8.09 |    53 | 1.0M |    0.217 |      0.131 |      0.142 |     0.229 |     0.028 |

## @advisor — Advisor/watchdog: deep reasoning over long context
eligible: 143 — λ 0.01250 $/quality-point (thinking ×1.857)

|  # | value |     q | model                | org                       |   $/M | tok/s |  ctx | gen 74.3% | lc 12.6% | tput 13.1% |
| -: | ----: | ----: | -------------------- | ------------------------- | ----: | ----: | ---: | --------: | -------: | ---------: |
|  1 | 0.792 | 0.838 | ★ Muse Spark 1.3     | Meta                      | $3.71 |    64 | 1.0M |     0.685 |    0.081 |      0.072 |
|  2 | 0.770 | 0.805 | ★ Gemini 3.7 Flash   | Google                    | $2.79 |   121 | 1.0M |     0.628 |    0.080 |      0.096 |
|  3 | 0.768 | 0.773 | ★ Qwen3.8 Flash      | Alibaba Cloud / Qwen Team | $0.43 |    63 | 1.0M |     0.638 |    0.064 |      0.071 |
|  4 | 0.765 | 0.800 | Gemini 3.8 Flash     | Google                    | $2.79 |    76 | 1.0M |     0.646 |    0.075 |      0.078 |
|  5 | 0.745 | 0.752 | DeepSeek-V4.1-Flash  | DeepSeek                  | $0.59 |    56 | 1.0M |     0.662 |    0.024 |      0.066 |
|  6 | 0.740 | 0.768 | Hy4 preview          | Tencent                   | $2.26 |    40 |    — |     0.654 |    0.061 |      0.053 |
|  7 | 0.737 | 0.769 | DeepSeek-V4-Pro-0813 | DeepSeek                  | $2.50 |    89 | 1.0M |     0.660 |    0.024 |      0.084 |
|  8 | 0.736 | 0.782 | Muse Spark 1.1       | Meta                      | $3.71 |   199 | 1.0M |     0.643 |    0.024 |      0.115 |
|  9 | 0.724 | 0.729 | ★ Hy3                | Tencent                   | $0.40 |    69 | 262k |     0.584 |    0.071 |      0.075 |
| 10 | 0.724 | 0.735 | GPT-5.6 Luna         | OpenAI                    | $0.88 |    61 | 1.1M |     0.601 |    0.065 |      0.070 |

## @designer — Design work: visual/UX judgement on image-capable models
eligible: 88 — λ 0.01024 $/quality-point (thinking ×1.857)

|  # | value |     q | model                 | org         |   $/M | tok/s |  ctx | gen 31.3% | code 7.2% | vis 21.7% | tput 18.1% | web 21.7% | agon |
| -: | ----: | ----: | --------------------- | ----------- | ----: | ----: | ---: | --------: | --------: | --------: | ---------: | --------: | ---: |
|  1 | 0.760 | 0.766 | ★ DeepSeek-V4.1-Flash | DeepSeek    | $0.59 |    56 | 1.0M |     0.279 |     0.057 |     0.137 |      0.091 |     0.202 |    — |
|  2 | 0.757 | 0.785 | ★ Gemini 3.7 Flash    | Google      | $2.79 |   121 | 1.0M |     0.265 |     0.048 |     0.142 |      0.132 |     0.198 | 1214 |
|  3 | 0.755 | 0.793 | ★ Muse Spark 1.1      | Meta        | $3.71 |   199 | 1.0M |     0.271 |     0.049 |     0.149 |      0.159 |     0.166 |    — |
|  4 | 0.747 | 0.785 | Muse Spark 1.3        | Meta        | $3.71 |    64 | 1.0M |     0.289 |     0.055 |     0.126 |      0.099 |     0.216 | 1289 |
|  5 | 0.745 | 0.774 | Gemini 3.8 Flash      | Google      | $2.79 |    76 | 1.0M |     0.272 |     0.052 |     0.145 |      0.108 |     0.196 | 1231 |
|  6 | 0.717 | 0.746 | Gemini 3.6 Flash      | Google      | $2.79 |   102 | 1.0M |     0.246 |     0.043 |     0.140 |      0.123 |     0.193 | 1187 |
|  7 | 0.711 | 0.794 | ★ Kimi K3             | Moonshot AI | $8.09 |    53 | 1.0M |     0.284 |     0.056 |     0.152 |      0.089 |     0.214 | 1285 |
|  8 | 0.708 | 0.719 | MiMo-V2.6-Pro         | Xiaomi      | $1.01 |    29 | 1.0M |     0.274 |     0.055 |     0.128 |      0.057 |     0.205 |    — |
|  9 | 0.693 | 0.697 | ★ GLM-5.3-Flash       | Zhipu AI    | $0.33 |    35 | 1.0M |     0.272 |     0.048 |     0.139 |      0.067 |     0.171 |    — |
| 10 | 0.684 | 0.688 | GPT-6 Luna            | OpenAI      | $0.39 |    67 | 1.1M |     0.252 |     0.046 |     0.114 |      0.101 |     0.175 |    — |
focus: website — coverage 121/400 (30.3%) ok; dispersion 0.992 ok; composition ok; freshness 0.2mo ok

# Suggested settings.modelRoles (best-fit #1 per role, resolved via the omp catalog).
# Selectors are openrouter/<id>; the omp-llm-role plugin writes this block daily.
modelRoles:
  default: "openrouter/deepseek/deepseek-v4.1-flash"
  smol: "openrouter/meta/muse-spark-1.1"
  slow: "openrouter/meta/muse-spark-1.3"
  vision: "openrouter/qwen/qwen3.8-flash"
  plan: "openrouter/meta/muse-spark-1.3"
  commit: "openrouter/meta/muse-spark-1.1"
  tiny: "openrouter/meta/muse-spark-1.1"
  task: "openrouter/deepseek/deepseek-v4.1-flash"
  advisor: "openrouter/meta/muse-spark-1.3"
  designer: "openrouter/deepseek/deepseek-v4.1-flash"
