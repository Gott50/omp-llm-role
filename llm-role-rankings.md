llm-stats.com best-fit ranking per omp model role — 400 models, 2026-10-01
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

|  # | value |     q | model                 | org                       |   $/M | tok/s |  ctx | gen 35.8% | rea 18.9% | code 18.9% | ag 12.6% | tool 10.5% | tput 3.2% |
| -: | ----: | ----: | --------------------- | ------------------------- | ----: | ----: | ---: | --------: | --------: | ---------: | -------: | ---------: | --------: |
|  1 | 0.809 | 0.811 | ★ DeepSeek-V4.1-Flash | DeepSeek                  | $0.43 |    75 | 1.0M |     0.318 |     0.163 |      0.149 |    0.094 |      0.068 |     0.019 |
|  2 | 0.803 | 0.812 | ★ GLM-5.3             | Zhipu AI                  | $1.71 |    66 | 1.0M |     0.322 |     0.169 |      0.145 |    0.092 |      0.066 |     0.018 |
|  3 | 0.803 | 0.823 | ★ Muse Spark 1.3      | Meta                      | $3.71 |    78 | 1.0M |     0.330 |     0.169 |      0.145 |    0.094 |      0.066 |     0.019 |
|  4 | 0.779 | 0.788 | DeepSeek-V4-Pro-0813  | DeepSeek                  | $1.74 |    53 | 1.0M |     0.318 |     0.164 |      0.140 |    0.089 |      0.063 |     0.016 |
|  5 | 0.774 | 0.780 | MiMo-V2.6-Pro         | Xiaomi                    | $0.99 |    26 | 1.0M |     0.313 |     0.158 |      0.144 |    0.091 |      0.065 |     0.009 |
|  6 | 0.770 | 0.833 | ★ GPT-5.6 Sol         | OpenAI                    | $11.4 |    55 | 1.1M |     0.331 |     0.173 |      0.154 |    0.095 |      0.064 |     0.016 |
|  7 | 0.768 | 0.781 | Hy4 preview           | Tencent                   | $2.32 |    32 |    — |     0.315 |     0.166 |      0.138 |    0.088 |      0.063 |     0.011 |
|  8 | 0.762 | 0.764 | ★ GLM-5.3-Flash       | Zhipu AI                  | $0.31 |    40 | 1.0M |     0.311 |     0.162 |      0.126 |    0.089 |      0.064 |     0.013 |
|  9 | 0.761 | 0.764 | Qwen3.8 Flash         | Alibaba Cloud / Qwen Team | $0.43 |    47 | 1.0M |     0.307 |     0.162 |      0.130 |    0.085 |      0.064 |     0.014 |
| 10 | 0.757 | 0.808 | Kimi K3               | Moonshot AI               | $9.20 |    31 | 1.0M |     0.324 |     0.169 |      0.147 |    0.092 |      0.067 |     0.011 |

## @smol — Fast lightweight model: cheap and quick, still competent
eligible: 143 — λ 0.02143 $/quality-point

|  # | value |     q | model                        | org      |   $/M | tok/s |  ctx | tput 40% | gen 28.6% | code 17.1% | tool 14.3% |
| -: | ----: | ----: | ---------------------------- | -------- | ----: | ----: | ---: | -------: | --------: | ---------: | ---------: |
|  1 | 0.713 | 0.717 | ★ DeepSeek-V4.1-Flash        | DeepSeek | $0.23 |    75 | 1.0M |    0.236 |     0.254 |      0.135 |      0.092 |
|  2 | 0.700 | 0.743 | ★ Muse Spark 1.1             | Meta     | $2.00 |   121 | 1.0M |    0.293 |     0.247 |      0.115 |      0.088 |
|  3 | 0.697 | 0.729 | ★ Gemini 3.8 Flash           | Google   | $1.50 |   109 | 1.0M |    0.281 |     0.248 |      0.123 |      0.077 |
|  4 | 0.684 | 0.726 | Muse Spark 1.3               | Meta     | $2.00 |    78 | 1.0M |    0.242 |     0.263 |      0.131 |      0.090 |
|  5 | 0.681 | 0.701 | GLM-5.3                      | Zhipu AI | $0.92 |    66 | 1.0M |    0.222 |     0.257 |      0.132 |      0.090 |
|  6 | 0.672 | 0.682 | DeepSeek-V4-Flash-Vision-Exp | DeepSeek | $0.46 |    91 | 1.0M |    0.260 |     0.232 |      0.116 |      0.074 |
|  7 | 0.666 | 0.698 | Gemini 3.7 Flash             | Google   | $1.50 |    97 | 1.0M |    0.267 |     0.242 |      0.115 |      0.075 |
|  8 | 0.649 | 0.659 | GPT-5.6 Luna                 | OpenAI   | $0.47 |    72 | 1.1M |    0.233 |     0.231 |      0.120 |      0.076 |
|  9 | 0.644 | 0.647 | ★ Laguna S 2.1               | Poolside | $0.11 |    93 | 1.0M |    0.262 |     0.215 |      0.107 |      0.062 |
| 10 | 0.642 | 0.662 | DeepSeek-V4-Pro-0813         | DeepSeek | $0.94 |    53 | 1.0M |    0.197 |     0.254 |      0.127 |      0.085 |

## @slow — Most capable model for hard problems; cost and speed as tiebreakers
eligible: 143 — λ 0.00263 $/quality-point (thinking ×2.714)

|  # | value |     q | model                 | org                       |   $/M | tok/s |  ctx | gen 27.4% | rea 27.4% | code 18.9% | ag 13.7% | math 8.4% | tput 4.2% |
| -: | ----: | ----: | --------------------- | ------------------------- | ----: | ----: | ---: | --------: | --------: | ---------: | -------: | --------: | --------: |
|  1 | 0.817 | 0.823 | ★ GLM-5.3             | Zhipu AI                  | $2.50 |    66 | 1.0M |     0.246 |     0.244 |      0.145 |    0.100 |     0.064 |     0.023 |
|  2 | 0.811 | 0.812 | ★ DeepSeek-V4.1-Flash | DeepSeek                  | $0.62 |    75 | 1.0M |     0.244 |     0.235 |      0.149 |    0.102 |     0.058 |     0.025 |
|  3 | 0.795 | 0.839 | ★ GPT-5.6 Sol         | OpenAI                    | $16.6 |    55 | 1.1M |     0.253 |     0.250 |      0.154 |    0.103 |     0.058 |     0.021 |
|  4 | 0.792 | 0.799 | DeepSeek-V4-Pro-0813  | DeepSeek                  | $2.54 |    53 | 1.0M |     0.243 |     0.236 |      0.140 |    0.096 |     0.063 |     0.021 |
|  5 | 0.783 | 0.792 | Hy4 preview           | Tencent                   | $3.39 |    32 |    — |     0.241 |     0.240 |      0.138 |    0.095 |     0.063 |     0.014 |
|  6 | 0.780 | 0.816 | Kimi K3               | Moonshot AI               | $13.4 |    31 | 1.0M |     0.248 |     0.244 |      0.147 |    0.099 |     0.064 |     0.014 |
|  7 | 0.775 | 0.789 | Muse Spark 1.1        | Meta                      | $5.43 |   121 | 1.0M |     0.237 |     0.238 |      0.127 |    0.092 |     0.064 |     0.031 |
|  8 | 0.768 | 0.770 | ★ GLM-5.3-Flash       | Zhipu AI                  | $0.46 |    40 | 1.0M |     0.238 |     0.234 |      0.126 |    0.096 |     0.059 |     0.017 |
|  9 | 0.766 | 0.841 | ★ Claude Opus 5       | Anthropic                 | $28.4 |    57 | 1.0M |     0.255 |     0.253 |      0.144 |    0.101 |     0.066 |     0.021 |
| 10 | 0.765 | 0.766 | Qwen3.8 Flash         | Alibaba Cloud / Qwen Team | $0.62 |    47 | 1.0M |     0.235 |     0.234 |      0.130 |    0.092 |     0.055 |     0.019 |

## @vision — Image understanding: vision index dominates
eligible: 75 — λ 0.00682 $/quality-point (thinking ×1.857)

|  # | value |     q | model                 | org                       |   $/M | tok/s |  ctx | vis 54.2% | gen 20.8% | rea 15.6% | code 6.3% | tput 3.1% |
| -: | ----: | ----: | --------------------- | ------------------------- | ----: | ----: | ---: | --------: | --------: | --------: | --------: | --------: |
|  1 | 0.731 | 0.734 | ★ Qwen3.8 Flash       | Alibaba Cloud / Qwen Team | $0.43 |    47 | 1.0M |     0.364 |     0.179 |     0.134 |     0.043 |     0.014 |
|  2 | 0.727 | 0.730 | ★ DeepSeek-V4.1-Flash | DeepSeek                  | $0.43 |    75 | 1.0M |     0.343 |     0.185 |     0.134 |     0.049 |     0.018 |
|  3 | 0.727 | 0.752 | ★ Muse Spark 1.1      | Meta                      | $3.71 |   121 | 1.0M |     0.371 |     0.180 |     0.136 |     0.042 |     0.023 |
|  4 | 0.720 | 0.739 | ★ Gemini 3.8 Flash    | Google                    | $2.79 |   109 | 1.0M |     0.363 |     0.181 |     0.128 |     0.045 |     0.022 |
|  5 | 0.713 | 0.715 | ★ GLM-5.3-Flash       | Zhipu AI                  | $0.31 |    40 | 1.0M |     0.346 |     0.181 |     0.133 |     0.042 |     0.013 |
|  6 | 0.704 | 0.766 | ★ Kimi K3             | Moonshot AI               | $9.20 |    31 | 1.0M |     0.380 |     0.189 |     0.139 |     0.048 |     0.010 |
|  7 | 0.702 | 0.721 | Gemini 3.7 Flash      | Google                    | $2.79 |    97 | 1.0M |     0.354 |     0.176 |     0.128 |     0.042 |     0.021 |
|  8 | 0.698 | 0.708 | Qwen3.8-27B           | Alibaba Cloud / Qwen Team | $1.38 |    53 | 262k |     0.359 |     0.169 |     0.126 |     0.040 |     0.015 |
|  9 | 0.695 | 0.773 | ★ GPT-5.6 Sol         | OpenAI                    | $11.4 |    55 | 1.1M |     0.371 |     0.193 |     0.143 |     0.051 |     0.016 |
| 10 | 0.687 | 0.712 | Muse Spark 1.3        | Meta                      | $3.71 |    78 | 1.0M |     0.314 |     0.192 |     0.139 |     0.048 |     0.019 |

## @plan — Planning: reasoning, math, long-context coherence
eligible: 143 — λ 0.00682 $/quality-point (thinking ×1.857)

|  # | value |     q | model                 | org                       |   $/M | tok/s |  ctx | rea 35.6% | gen 28.9% | lc 15.6% | math 15.6% | tput 4.4% |
| -: | ----: | ----: | --------------------- | ------------------------- | ----: | ----: | ---: | --------: | --------: | -------: | ---------: | --------: |
|  1 | 0.757 | 0.773 | ★ Hy4 preview         | Tencent                   | $2.32 |    32 |    — |     0.312 |     0.254 |    0.076 |      0.116 |     0.015 |
|  2 | 0.751 | 0.754 | ★ Qwen3.8 Flash       | Alibaba Cloud / Qwen Team | $0.43 |    47 | 1.0M |     0.305 |     0.248 |    0.079 |      0.102 |     0.020 |
|  3 | 0.743 | 0.820 | ★ GPT-5.6 Sol         | OpenAI                    | $11.4 |    55 | 1.1M |     0.324 |     0.267 |    0.099 |      0.107 |     0.022 |
|  4 | 0.739 | 0.751 | GLM-5.3               | Zhipu AI                  | $1.71 |    66 | 1.0M |     0.317 |     0.260 |    0.030 |      0.119 |     0.025 |
|  5 | 0.723 | 0.726 | ★ DeepSeek-V4.1-Flash | DeepSeek                  | $0.43 |    75 | 1.0M |     0.305 |     0.257 |    0.030 |      0.107 |     0.026 |
|  6 | 0.720 | 0.724 | Hy3                   | Tencent                   | $0.47 |    50 | 262k |     0.279 |     0.227 |    0.088 |      0.109 |     0.021 |
|  7 | 0.719 | 0.731 | DeepSeek-V4-Pro-0813  | DeepSeek                  | $1.74 |    53 | 1.0M |     0.307 |     0.256 |    0.030 |      0.116 |     0.022 |
|  8 | 0.715 | 0.740 | Muse Spark 1.1        | Meta                      | $3.71 |   121 | 1.0M |     0.310 |     0.250 |    0.030 |      0.118 |     0.033 |
|  9 | 0.710 | 0.713 | ★ GLM-5.3-Flash       | Zhipu AI                  | $0.31 |    40 | 1.0M |     0.304 |     0.251 |    0.030 |      0.110 |     0.018 |
| 10 | 0.710 | 0.716 | GPT-5.6 Luna          | OpenAI                    | $0.88 |    72 | 1.1M |     0.282 |     0.234 |    0.080 |      0.095 |     0.026 |

## @commit — Commit messages: cheap and fast with decent general quality
eligible: 143 — λ 0.02692 $/quality-point

|  # | value |     q | model                        | org      |   $/M | tok/s |  ctx | tput 41.5% | gen 43.1% | code 15.4% |
| -: | ----: | ----: | ---------------------------- | -------- | ----: | ----: | ---: | ---------: | --------: | ---------: |
|  1 | 0.744 | 0.750 | ★ DeepSeek-V4.1-Flash        | DeepSeek | $0.23 |    75 | 1.0M |      0.246 |     0.383 |      0.121 |
|  2 | 0.736 | 0.776 | ★ Gemini 3.8 Flash           | Google   | $1.50 |   109 | 1.0M |      0.292 |     0.375 |      0.110 |
|  3 | 0.727 | 0.780 | ★ Muse Spark 1.1             | Meta     | $2.00 |   121 | 1.0M |      0.304 |     0.372 |      0.103 |
|  4 | 0.712 | 0.766 | Muse Spark 1.3               | Meta     | $2.00 |    78 | 1.0M |      0.251 |     0.397 |      0.118 |
|  5 | 0.712 | 0.724 | DeepSeek-V4-Flash-Vision-Exp | DeepSeek | $0.46 |    91 | 1.0M |      0.270 |     0.350 |      0.104 |
|  6 | 0.712 | 0.736 | GLM-5.3                      | Zhipu AI | $0.92 |    66 | 1.0M |      0.231 |     0.388 |      0.118 |
|  7 | 0.704 | 0.744 | Gemini 3.7 Flash             | Google   | $1.50 |    97 | 1.0M |      0.277 |     0.364 |      0.103 |
|  8 | 0.690 | 0.693 | ★ Laguna S 2.1               | Poolside | $0.11 |    93 | 1.0M |      0.272 |     0.324 |      0.096 |
|  9 | 0.685 | 0.698 | GPT-5.6 Luna                 | OpenAI   | $0.47 |    72 | 1.1M |      0.242 |     0.348 |      0.108 |
| 10 | 0.680 | 0.686 | GPT-6 Luna                   | OpenAI   | $0.21 |    72 | 1.1M |      0.242 |     0.346 |      0.098 |

## @tiny — Background tasks (titles, memory): cheapest and fastest wins
eligible: 143 — λ 0.03333 $/quality-point

|  # | value |     q | model                        | org                       |   $/M | tok/s |  ctx | tput 58.3% | gen 41.7% |
| -: | ----: | ----: | ---------------------------- | ------------------------- | ----: | ----: | ---: | ---------: | --------: |
|  1 | 0.752 | 0.755 | ★ Ling 3.0 Flash Fin         | InclusionAI               | $0.07 |   121 | 262k |      0.428 |     0.327 |
|  2 | 0.722 | 0.772 | ★ Gemini 3.8 Flash           | Google                    | $1.50 |   109 | 1.0M |      0.410 |     0.362 |
|  3 | 0.721 | 0.788 | ★ Muse Spark 1.1             | Meta                      | $2.00 |   121 | 1.0M |      0.428 |     0.360 |
|  4 | 0.708 | 0.716 | DeepSeek-V4.1-Flash          | DeepSeek                  | $0.23 |    75 | 1.0M |      0.345 |     0.371 |
|  5 | 0.702 | 0.718 | DeepSeek-V4-Flash-Vision-Exp | DeepSeek                  | $0.46 |    91 | 1.0M |      0.379 |     0.339 |
|  6 | 0.692 | 0.696 | Laguna S 2.1                 | Poolside                  | $0.11 |    93 | 1.0M |      0.382 |     0.314 |
|  7 | 0.691 | 0.741 | Gemini 3.7 Flash             | Google                    | $1.50 |    97 | 1.0M |      0.389 |     0.352 |
|  8 | 0.689 | 0.690 | ★ Ling 3.0 Flash             | InclusionAI               | $0.04 |   101 | 131k |      0.397 |     0.293 |
|  9 | 0.672 | 0.686 | Qwen3-Next-80B-A3B-Thinking  | Alibaba Cloud / Qwen Team | $0.41 |   144 |    — |      0.458 |     0.228 |
| 10 | 0.670 | 0.736 | Muse Spark 1.3               | Meta                      | $2.00 |    78 | 1.0M |      0.352 |     0.384 |

## @task — Subagents: agentic + tool calling, moderate cost sensitivity
eligible: 143 — λ 0.00747 $/quality-point (thinking ×1.857)

|  # | value |     q | model                 | org                       |   $/M | tok/s |  ctx | ag 29.9% | tool 20.7% | code 18.4% | gen 25.3% | tput 5.7% |
| -: | ----: | ----: | --------------------- | ------------------------- | ----: | ----: | ---: | -------: | ---------: | ---------: | --------: | --------: |
|  1 | 0.757 | 0.760 | ★ DeepSeek-V4.1-Flash | DeepSeek                  | $0.43 |    75 | 1.0M |    0.223 |      0.133 |      0.145 |     0.225 |     0.034 |
|  2 | 0.736 | 0.749 | GLM-5.3               | Zhipu AI                  | $1.71 |    66 | 1.0M |    0.218 |      0.130 |      0.141 |     0.228 |     0.032 |
|  3 | 0.734 | 0.761 | ★ Muse Spark 1.3      | Meta                      | $3.71 |    78 | 1.0M |    0.222 |      0.131 |      0.141 |     0.233 |     0.035 |
|  4 | 0.712 | 0.719 | MiMo-V2.6-Pro         | Xiaomi                    | $0.99 |    26 | 1.0M |    0.214 |      0.128 |      0.140 |     0.221 |     0.016 |
|  5 | 0.709 | 0.722 | DeepSeek-V4-Pro-0813  | DeepSeek                  | $1.74 |    53 | 1.0M |    0.210 |      0.123 |      0.136 |     0.224 |     0.028 |
|  6 | 0.698 | 0.701 | ★ GLM-5.3-Flash       | Zhipu AI                  | $0.31 |    40 | 1.0M |    0.210 |      0.126 |      0.122 |     0.219 |     0.023 |
|  7 | 0.695 | 0.698 | Qwen3.8 Flash         | Alibaba Cloud / Qwen Team | $0.43 |    47 | 1.0M |    0.202 |      0.126 |      0.126 |     0.217 |     0.026 |
|  8 | 0.690 | 0.708 | Hy4 preview           | Tencent                   | $2.32 |    32 |    — |    0.208 |      0.123 |      0.134 |     0.222 |     0.019 |
|  9 | 0.685 | 0.713 | Muse Spark 1.1        | Meta                      | $3.71 |   121 | 1.0M |    0.201 |      0.127 |      0.124 |     0.219 |     0.042 |
| 10 | 0.685 | 0.706 | Gemini 3.8 Flash      | Google                    | $2.79 |   109 | 1.0M |    0.203 |      0.111 |      0.132 |     0.220 |     0.040 |

## @advisor — Advisor/watchdog: deep reasoning over long context
eligible: 143 — λ 0.01250 $/quality-point (thinking ×1.857)

|  # | value |     q | model                 | org                       |   $/M | tok/s |  ctx | rea 43.7% | gen 30.6% | lc 12.6% | tput 13.1% |
| -: | ----: | ----: | --------------------- | ------------------------- | ----: | ----: | ---: | --------: | --------: | -------: | ---------: |
|  1 | 0.786 | 0.833 | ★ Muse Spark 1.3      | Meta                      | $3.71 |    78 | 1.0M |     0.390 |     0.282 |    0.081 |      0.079 |
|  2 | 0.758 | 0.793 | ★ Gemini 3.8 Flash    | Google                    | $2.79 |   109 | 1.0M |     0.359 |     0.266 |    0.075 |      0.092 |
|  3 | 0.756 | 0.761 | ★ Qwen3.8 Flash       | Alibaba Cloud / Qwen Team | $0.43 |    47 | 1.0M |     0.375 |     0.263 |    0.064 |      0.060 |
|  4 | 0.750 | 0.785 | Gemini 3.7 Flash      | Google                    | $2.79 |    97 | 1.0M |     0.358 |     0.259 |    0.080 |      0.087 |
|  5 | 0.745 | 0.750 | ★ DeepSeek-V4.1-Flash | DeepSeek                  | $0.43 |    75 | 1.0M |     0.375 |     0.272 |    0.024 |      0.078 |
|  6 | 0.741 | 0.763 | ★ GLM-5.3             | Zhipu AI                  | $1.71 |    66 | 1.0M |     0.390 |     0.276 |    0.024 |      0.073 |
|  7 | 0.729 | 0.758 | Hy4 preview           | Tencent                   | $2.32 |    32 |    — |     0.384 |     0.269 |    0.061 |      0.044 |
|  8 | 0.724 | 0.735 | GPT-5.6 Luna          | OpenAI                    | $0.88 |    72 | 1.1M |     0.347 |     0.248 |    0.065 |      0.076 |
|  9 | 0.720 | 0.766 | Muse Spark 1.1        | Meta                      | $3.71 |   121 | 1.0M |     0.381 |     0.265 |    0.024 |      0.096 |
| 10 | 0.716 | 0.738 | DeepSeek-V4-Pro-0813  | DeepSeek                  | $1.74 |    53 | 1.0M |     0.377 |     0.272 |    0.024 |      0.064 |

## @designer — Design work: visual/UX judgement on image-capable models
eligible: 88 — λ 0.00882 $/quality-point (thinking ×1.857)

|  # | value |     q | model                 | org         |   $/M | tok/s |  ctx | gen 30.6% | code 11.8% | vis 21.2% | tput 15.3% | web 21.2% | agon |
| -: | ----: | ----: | --------------------- | ----------- | ----: | ----: | ---: | --------: | ---------: | --------: | ---------: | --------: | ---: |
|  1 | 0.781 | 0.784 | ★ DeepSeek-V4.1-Flash | DeepSeek    | $0.43 |    75 | 1.0M |     0.272 |      0.092 |     0.134 |      0.090 |     0.195 |    — |
|  2 | 0.766 | 0.798 | ★ Muse Spark 1.3      | Meta        | $3.71 |    78 | 1.0M |     0.282 |      0.090 |     0.123 |      0.092 |     0.211 | 1294 |
|  3 | 0.765 | 0.790 | ★ Gemini 3.8 Flash    | Google      | $2.79 |   109 | 1.0M |     0.266 |      0.084 |     0.142 |      0.107 |     0.190 | 1237 |
|  4 | 0.746 | 0.771 | Gemini 3.7 Flash      | Google      | $2.79 |    97 | 1.0M |     0.259 |      0.079 |     0.138 |      0.102 |     0.193 | 1220 |
|  5 | 0.732 | 0.764 | Muse Spark 1.1        | Meta        | $3.71 |   121 | 1.0M |     0.264 |      0.079 |     0.145 |      0.112 |     0.164 |    — |
|  6 | 0.719 | 0.728 | MiMo-V2.6-Pro         | Xiaomi      | $0.99 |    26 | 1.0M |     0.267 |      0.090 |     0.125 |      0.042 |     0.204 |    — |
|  7 | 0.707 | 0.710 | ★ GLM-5.3-Flash       | Zhipu AI    | $0.31 |    40 | 1.0M |     0.265 |      0.078 |     0.135 |      0.062 |     0.169 |    — |
|  8 | 0.706 | 0.731 | Gemini 3.6 Flash      | Google      | $2.79 |    83 | 1.0M |     0.240 |      0.070 |     0.137 |      0.095 |     0.188 | 1194 |
|  9 | 0.698 | 0.799 | ★ GPT-5.6 Sol         | OpenAI      | $11.4 |    55 | 1.1M |     0.283 |      0.095 |     0.145 |      0.077 |     0.199 | 1189 |
| 10 | 0.694 | 0.775 | Kimi K3               | Moonshot AI | $9.20 |    31 | 1.0M |     0.277 |      0.091 |     0.148 |      0.051 |     0.207 | 1292 |

# Suggested settings.modelRoles (best-fit #1 per role, resolved via the omp catalog).
# Selectors are openrouter/<id>; the omp-llm-role plugin writes this block daily.
modelRoles:
  default: "openrouter/deepseek/deepseek-v4.1-flash"
  smol: "openrouter/deepseek/deepseek-v4.1-flash"
  slow: "openrouter/z-ai/glm-5.3"
  vision: "openrouter/qwen/qwen3.8-flash"
  plan: "openrouter/tencent/hy4-preview"
  commit: "openrouter/deepseek/deepseek-v4.1-flash"
  tiny: "openrouter/inclusionai/ling-3.0-flash-fin"
  task: "openrouter/deepseek/deepseek-v4.1-flash"
  advisor: "openrouter/meta/muse-spark-1.3"
  designer: "openrouter/deepseek/deepseek-v4.1-flash"
