llm-stats.com best-fit ranking per omp model role — 400 models, 2026-10-02
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
|  1 | 0.810 | 0.812 | ★ DeepSeek-V4.1-Flash | DeepSeek                  | $0.45 |    87 | 1.0M |     0.318 |     0.163 |      0.149 |    0.094 |      0.068 |     0.020 |
|  2 | 0.803 | 0.824 | ★ Muse Spark 1.3      | Meta                      | $3.71 |    81 | 1.0M |     0.330 |     0.169 |      0.145 |    0.094 |      0.066 |     0.019 |
|  3 | 0.803 | 0.811 | GLM-5.3               | Zhipu AI                  | $1.50 |    59 | 1.0M |     0.322 |     0.169 |      0.145 |    0.092 |      0.066 |     0.016 |
|  4 | 0.782 | 0.788 | DeepSeek-V4-Pro-0813  | DeepSeek                  | $0.94 |    49 | 1.0M |     0.318 |     0.164 |      0.140 |    0.089 |      0.063 |     0.015 |
|  5 | 0.775 | 0.780 | MiMo-V2.6-Pro         | Xiaomi                    | $0.99 |    26 | 1.0M |     0.313 |     0.158 |      0.144 |    0.091 |      0.065 |     0.009 |
|  6 | 0.771 | 0.834 | ★ GPT-5.6 Sol         | OpenAI                    | $11.4 |    60 | 1.1M |     0.331 |     0.173 |      0.154 |    0.095 |      0.064 |     0.017 |
|  7 | 0.762 | 0.764 | ★ GLM-5.3-Flash       | Zhipu AI                  | $0.36 |    41 | 1.0M |     0.311 |     0.162 |      0.126 |    0.089 |      0.064 |     0.013 |
|  8 | 0.761 | 0.764 | Qwen3.8 Flash         | Alibaba Cloud / Qwen Team | $0.43 |    46 | 1.0M |     0.307 |     0.162 |      0.130 |    0.085 |      0.064 |     0.014 |
|  9 | 0.761 | 0.774 | Hy4 preview           | Tencent                   | $2.32 |    15 |    — |     0.315 |     0.166 |      0.138 |    0.088 |      0.063 |     0.004 |
| 10 | 0.757 | 0.778 | Muse Spark 1.1        | Meta                      | $3.71 |   170 | 1.0M |     0.309 |     0.165 |      0.127 |    0.085 |      0.065 |     0.026 |

## @smol — Fast lightweight model: cheap and quick, still competent
eligible: 143 — λ 0.02143 $/quality-point

|  # | value |     q | model                        | org         |   $/M | tok/s |  ctx | tput 40% | gen 28.6% | code 17.1% | tool 14.3% |
| -: | ----: | ----: | ---------------------------- | ----------- | ----: | ----: | ---: | -------: | --------: | ---------: | ---------: |
|  1 | 0.740 | 0.783 | ★ Muse Spark 1.1             | Meta        | $2.00 |   170 | 1.0M |    0.333 |     0.247 |      0.115 |      0.088 |
|  2 | 0.730 | 0.735 | ★ DeepSeek-V4.1-Flash        | DeepSeek    | $0.24 |    87 | 1.0M |    0.254 |     0.254 |      0.135 |      0.092 |
|  3 | 0.688 | 0.731 | Muse Spark 1.3               | Meta        | $2.00 |    81 | 1.0M |    0.246 |     0.263 |      0.131 |      0.090 |
|  4 | 0.685 | 0.717 | Gemini 3.8 Flash             | Google      | $1.50 |    99 | 1.0M |    0.270 |     0.248 |      0.123 |      0.077 |
|  5 | 0.669 | 0.679 | DeepSeek-V4-Flash-Vision-Exp | DeepSeek    | $0.46 |    89 | 1.0M |    0.257 |     0.232 |      0.116 |      0.074 |
|  6 | 0.669 | 0.686 | GLM-5.3                      | Zhipu AI    | $0.81 |    59 | 1.0M |    0.208 |     0.257 |      0.132 |      0.090 |
|  7 | 0.669 | 0.701 | Gemini 3.7 Flash             | Google      | $1.50 |    99 | 1.0M |    0.269 |     0.242 |      0.115 |      0.075 |
|  8 | 0.654 | 0.728 | Gemini 3.5 Flash             | Google      | $3.47 |   138 | 1.0M |    0.309 |     0.223 |      0.108 |      0.088 |
|  9 | 0.648 | 0.649 | ★ Ling 3.0 Flash             | InclusionAI | $0.04 |   115 | 131k |    0.287 |     0.201 |      0.096 |      0.064 |
| 10 | 0.642 | 0.652 | DeepSeek-V4-Pro-0813         | DeepSeek    | $0.51 |    49 | 1.0M |    0.187 |     0.254 |      0.127 |      0.085 |

## @slow — Most capable model for hard problems; cost and speed as tiebreakers
eligible: 143 — λ 0.00263 $/quality-point (thinking ×2.714)

|  # | value |     q | model                 | org                       |   $/M | tok/s |  ctx | gen 27.4% | rea 27.4% | code 18.9% | ag 13.7% | math 8.4% | tput 4.2% |
| -: | ----: | ----: | --------------------- | ------------------------- | ----: | ----: | ---: | --------: | --------: | ---------: | -------: | --------: | --------: |
|  1 | 0.816 | 0.822 | ★ GLM-5.3             | Zhipu AI                  | $2.19 |    59 | 1.0M |     0.246 |     0.244 |      0.145 |    0.100 |     0.064 |     0.022 |
|  2 | 0.812 | 0.814 | ★ DeepSeek-V4.1-Flash | DeepSeek                  | $0.66 |    87 | 1.0M |     0.244 |     0.235 |      0.149 |    0.102 |     0.058 |     0.027 |
|  3 | 0.796 | 0.840 | ★ GPT-5.6 Sol         | OpenAI                    | $16.6 |    60 | 1.1M |     0.253 |     0.250 |      0.154 |    0.103 |     0.058 |     0.022 |
|  4 | 0.794 | 0.798 | DeepSeek-V4-Pro-0813  | DeepSeek                  | $1.38 |    49 | 1.0M |     0.243 |     0.236 |      0.140 |    0.096 |     0.063 |     0.020 |
|  5 | 0.782 | 0.821 | Kimi K3               | Moonshot AI               | $14.7 |    47 | 1.0M |     0.248 |     0.244 |      0.147 |    0.099 |     0.064 |     0.019 |
|  6 | 0.779 | 0.793 | Muse Spark 1.1        | Meta                      | $5.43 |   170 | 1.0M |     0.237 |     0.238 |      0.127 |    0.092 |     0.064 |     0.035 |
|  7 | 0.774 | 0.783 | Hy4 preview           | Tencent                   | $3.39 |    15 |    — |     0.241 |     0.240 |      0.138 |    0.095 |     0.063 |     0.005 |
|  8 | 0.769 | 0.770 | ★ GLM-5.3-Flash       | Zhipu AI                  | $0.53 |    41 | 1.0M |     0.238 |     0.234 |      0.126 |    0.096 |     0.059 |     0.017 |
|  9 | 0.767 | 0.842 | ★ Claude Opus 5       | Anthropic                 | $28.4 |    61 | 1.0M |     0.255 |     0.253 |      0.144 |    0.101 |     0.066 |     0.022 |
| 10 | 0.765 | 0.766 | Qwen3.8 Flash         | Alibaba Cloud / Qwen Team | $0.62 |    46 | 1.0M |     0.235 |     0.234 |      0.130 |    0.092 |     0.055 |     0.019 |

## @vision — Image understanding: vision index dominates
eligible: 75 — λ 0.00682 $/quality-point (thinking ×1.857)

|  # | value |     q | model               | org                       |   $/M | tok/s |  ctx | vis 54.2% | gen 20.8% | rea 15.6% | code 6.3% | tput 3.1% |
| -: | ----: | ----: | ------------------- | ------------------------- | ----: | ----: | ---: | --------: | --------: | --------: | --------: | --------: |
|  1 | 0.731 | 0.734 | ★ Qwen3.8 Flash     | Alibaba Cloud / Qwen Team | $0.43 |    46 | 1.0M |     0.364 |     0.179 |     0.134 |     0.043 |     0.014 |
|  2 | 0.730 | 0.756 | ★ Muse Spark 1.1    | Meta                      | $3.71 |   170 | 1.0M |     0.371 |     0.180 |     0.136 |     0.042 |     0.026 |
|  3 | 0.729 | 0.732 | DeepSeek-V4.1-Flash | DeepSeek                  | $0.45 |    87 | 1.0M |     0.343 |     0.185 |     0.134 |     0.049 |     0.020 |
|  4 | 0.720 | 0.739 | ★ Gemini 3.8 Flash  | Google                    | $2.79 |    99 | 1.0M |     0.363 |     0.181 |     0.128 |     0.045 |     0.021 |
|  5 | 0.713 | 0.715 | ★ GLM-5.3-Flash     | Zhipu AI                  | $0.36 |    41 | 1.0M |     0.346 |     0.181 |     0.133 |     0.042 |     0.013 |
|  6 | 0.702 | 0.721 | Gemini 3.7 Flash    | Google                    | $2.79 |    99 | 1.0M |     0.354 |     0.176 |     0.128 |     0.042 |     0.021 |
|  7 | 0.701 | 0.770 | ★ Kimi K3           | Moonshot AI               | $10.1 |    47 | 1.0M |     0.380 |     0.189 |     0.139 |     0.048 |     0.014 |
|  8 | 0.697 | 0.706 | Qwen3.8-27B         | Alibaba Cloud / Qwen Team | $1.38 |    47 | 262k |     0.359 |     0.169 |     0.126 |     0.040 |     0.014 |
|  9 | 0.696 | 0.774 | ★ GPT-5.6 Sol       | OpenAI                    | $11.4 |    60 | 1.1M |     0.371 |     0.193 |     0.143 |     0.051 |     0.016 |
| 10 | 0.688 | 0.713 | Muse Spark 1.3      | Meta                      | $3.71 |    81 | 1.0M |     0.314 |     0.192 |     0.139 |     0.048 |     0.019 |

## @plan — Planning: reasoning, math, long-context coherence
eligible: 143 — λ 0.00682 $/quality-point (thinking ×1.857)

|  # | value |     q | model                | org                       |   $/M | tok/s |  ctx | rea 35.6% | gen 28.9% | lc 15.6% | math 15.6% | tput 4.4% |
| -: | ----: | ----: | -------------------- | ------------------------- | ----: | ----: | ---: | --------: | --------: | -------: | ---------: | --------: |
|  1 | 0.751 | 0.754 | ★ Qwen3.8 Flash      | Alibaba Cloud / Qwen Team | $0.43 |    46 | 1.0M |     0.305 |     0.248 |    0.079 |      0.102 |     0.020 |
|  2 | 0.747 | 0.763 | ★ Hy4 preview        | Tencent                   | $2.32 |    15 |    — |     0.312 |     0.254 |    0.076 |      0.116 |     0.005 |
|  3 | 0.744 | 0.822 | ★ GPT-5.6 Sol        | OpenAI                    | $11.4 |    60 | 1.1M |     0.324 |     0.267 |    0.099 |      0.107 |     0.023 |
|  4 | 0.739 | 0.749 | GLM-5.3              | Zhipu AI                  | $1.50 |    59 | 1.0M |     0.317 |     0.260 |    0.030 |      0.119 |     0.023 |
|  5 | 0.725 | 0.728 | DeepSeek-V4.1-Flash  | DeepSeek                  | $0.45 |    87 | 1.0M |     0.305 |     0.257 |    0.030 |      0.107 |     0.028 |
|  6 | 0.724 | 0.730 | DeepSeek-V4-Pro-0813 | DeepSeek                  | $0.94 |    49 | 1.0M |     0.307 |     0.256 |    0.030 |      0.116 |     0.021 |
|  7 | 0.723 | 0.726 | Hy3                  | Tencent                   | $0.47 |    61 | 262k |     0.279 |     0.227 |    0.088 |      0.109 |     0.024 |
|  8 | 0.719 | 0.744 | Muse Spark 1.1       | Meta                      | $3.71 |   170 | 1.0M |     0.310 |     0.250 |    0.030 |      0.118 |     0.037 |
|  9 | 0.713 | 0.774 | ★ GPT-5.6 Terra      | OpenAI                    | $8.82 |    73 | 1.1M |     0.303 |     0.253 |    0.089 |      0.102 |     0.026 |
| 10 | 0.710 | 0.713 | ★ GLM-5.3-Flash      | Zhipu AI                  | $0.36 |    41 | 1.0M |     0.304 |     0.251 |    0.030 |      0.110 |     0.018 |

## @commit — Commit messages: cheap and fast with decent general quality
eligible: 143 — λ 0.02692 $/quality-point

|  # | value |     q | model                        | org         |   $/M | tok/s |  ctx | tput 41.5% | gen 43.1% | code 15.4% |
| -: | ----: | ----: | ---------------------------- | ----------- | ----: | ----: | ---: | ---------: | --------: | ---------: |
|  1 | 0.768 | 0.822 | ★ Muse Spark 1.1             | Meta        | $2.00 |   170 | 1.0M |      0.346 |     0.372 |      0.103 |
|  2 | 0.762 | 0.768 | ★ DeepSeek-V4.1-Flash        | DeepSeek    | $0.24 |    87 | 1.0M |      0.264 |     0.383 |      0.121 |
|  3 | 0.724 | 0.765 | Gemini 3.8 Flash             | Google      | $1.50 |    99 | 1.0M |      0.280 |     0.375 |      0.110 |
|  4 | 0.717 | 0.770 | Muse Spark 1.3               | Meta        | $2.00 |    81 | 1.0M |      0.255 |     0.397 |      0.118 |
|  5 | 0.709 | 0.721 | DeepSeek-V4-Flash-Vision-Exp | DeepSeek    | $0.46 |    89 | 1.0M |      0.267 |     0.350 |      0.104 |
|  6 | 0.706 | 0.746 | Gemini 3.7 Flash             | Google      | $1.50 |    99 | 1.0M |      0.279 |     0.364 |      0.103 |
|  7 | 0.700 | 0.722 | GLM-5.3                      | Zhipu AI    | $0.81 |    59 | 1.0M |      0.216 |     0.388 |      0.118 |
|  8 | 0.686 | 0.687 | ★ Ling 3.0 Flash             | InclusionAI | $0.04 |   115 | 131k |      0.298 |     0.303 |      0.086 |
|  9 | 0.677 | 0.690 | DeepSeek-V4-Pro-0813         | DeepSeek    | $0.51 |    49 | 1.0M |      0.194 |     0.382 |      0.114 |
| 10 | 0.676 | 0.681 | GPT-6 Luna                   | OpenAI      | $0.21 |    69 | 1.1M |      0.237 |     0.346 |      0.098 |

## @tiny — Background tasks (titles, memory): cheapest and fastest wins
eligible: 143 — λ 0.03333 $/quality-point

|  # | value |     q | model                        | org                       |   $/M | tok/s |  ctx | tput 58.3% | gen 41.7% |
| -: | ----: | ----: | ---------------------------- | ------------------------- | ----: | ----: | ---: | ---------: | --------: |
|  1 | 0.779 | 0.846 | ★ Muse Spark 1.1             | Meta                      | $2.00 |   170 | 1.0M |      0.485 |     0.360 |
|  2 | 0.735 | 0.737 | ★ Ling 3.0 Flash Fin         | InclusionAI               | $0.07 |   110 | 262k |      0.411 |     0.327 |
|  3 | 0.734 | 0.742 | ★ DeepSeek-V4.1-Flash        | DeepSeek                  | $0.24 |    87 | 1.0M |      0.371 |     0.371 |
|  4 | 0.710 | 0.712 | ★ Ling 3.0 Flash             | InclusionAI               | $0.04 |   115 | 131k |      0.419 |     0.293 |
|  5 | 0.705 | 0.755 | ★ Gemini 3.8 Flash           | Google                    | $1.50 |    99 | 1.0M |      0.393 |     0.362 |
|  6 | 0.698 | 0.714 | DeepSeek-V4-Flash-Vision-Exp | DeepSeek                  | $0.46 |    89 | 1.0M |      0.375 |     0.339 |
|  7 | 0.695 | 0.745 | Gemini 3.7 Flash             | Google                    | $1.50 |    99 | 1.0M |      0.392 |     0.352 |
|  8 | 0.676 | 0.682 | Seed 2.0 Mini                | ByteDance                 | $0.17 |   125 | 256k |      0.433 |     0.249 |
|  9 | 0.676 | 0.743 | Muse Spark 1.3               | Meta                      | $2.00 |    81 | 1.0M |      0.359 |     0.384 |
| 10 | 0.668 | 0.682 | Qwen3-Next-80B-A3B-Thinking  | Alibaba Cloud / Qwen Team | $0.41 |   141 |    — |      0.454 |     0.228 |

## @task — Subagents: agentic + tool calling, moderate cost sensitivity
eligible: 143 — λ 0.00747 $/quality-point (thinking ×1.857)

|  # | value |     q | model                 | org                       |   $/M | tok/s |  ctx | ag 29.9% | tool 20.7% | code 18.4% | gen 25.3% | tput 5.7% |
| -: | ----: | ----: | --------------------- | ------------------------- | ----: | ----: | ---: | -------: | ---------: | ---------: | --------: | --------: |
|  1 | 0.759 | 0.763 | ★ DeepSeek-V4.1-Flash | DeepSeek                  | $0.45 |    87 | 1.0M |    0.223 |      0.133 |      0.145 |     0.225 |     0.037 |
|  2 | 0.735 | 0.747 | GLM-5.3               | Zhipu AI                  | $1.50 |    59 | 1.0M |    0.218 |      0.130 |      0.141 |     0.228 |     0.030 |
|  3 | 0.734 | 0.762 | Muse Spark 1.3        | Meta                      | $3.71 |    81 | 1.0M |    0.222 |      0.131 |      0.141 |     0.233 |     0.035 |
|  4 | 0.714 | 0.721 | DeepSeek-V4-Pro-0813  | DeepSeek                  | $0.94 |    49 | 1.0M |    0.210 |      0.123 |      0.136 |     0.224 |     0.027 |
|  5 | 0.713 | 0.720 | MiMo-V2.6-Pro         | Xiaomi                    | $0.99 |    26 | 1.0M |    0.214 |      0.128 |      0.140 |     0.221 |     0.016 |
|  6 | 0.698 | 0.701 | ★ GLM-5.3-Flash       | Zhipu AI                  | $0.36 |    41 | 1.0M |    0.210 |      0.126 |      0.122 |     0.219 |     0.024 |
|  7 | 0.694 | 0.698 | Qwen3.8 Flash         | Alibaba Cloud / Qwen Team | $0.43 |    46 | 1.0M |    0.202 |      0.126 |      0.126 |     0.217 |     0.026 |
|  8 | 0.691 | 0.719 | Muse Spark 1.1        | Meta                      | $3.71 |   170 | 1.0M |    0.201 |      0.127 |      0.124 |     0.219 |     0.048 |
|  9 | 0.683 | 0.704 | Gemini 3.8 Flash      | Google                    | $2.79 |    99 | 1.0M |    0.203 |      0.111 |      0.132 |     0.220 |     0.039 |
| 10 | 0.680 | 0.765 | ★ GPT-5.6 Sol         | OpenAI                    | $11.4 |    60 | 1.1M |    0.225 |      0.126 |      0.149 |     0.234 |     0.030 |

## @advisor — Advisor/watchdog: deep reasoning over long context
eligible: 143 — λ 0.01250 $/quality-point (thinking ×1.857)

|  # | value |     q | model                | org                       |   $/M | tok/s |  ctx | rea 43.7% | gen 30.6% | lc 12.6% | tput 13.1% |
| -: | ----: | ----: | -------------------- | ------------------------- | ----: | ----: | ---: | --------: | --------: | -------: | ---------: |
|  1 | 0.788 | 0.834 | ★ Muse Spark 1.3     | Meta                      | $3.71 |    81 | 1.0M |     0.390 |     0.282 |    0.081 |      0.081 |
|  2 | 0.755 | 0.760 | ★ Qwen3.8 Flash      | Alibaba Cloud / Qwen Team | $0.43 |    46 | 1.0M |     0.375 |     0.263 |    0.064 |      0.059 |
|  3 | 0.754 | 0.789 | ★ Gemini 3.8 Flash   | Google                    | $2.79 |    99 | 1.0M |     0.359 |     0.266 |    0.075 |      0.088 |
|  4 | 0.751 | 0.786 | Gemini 3.7 Flash     | Google                    | $2.79 |    99 | 1.0M |     0.358 |     0.259 |    0.080 |      0.088 |
|  5 | 0.750 | 0.756 | DeepSeek-V4.1-Flash  | DeepSeek                  | $0.45 |    87 | 1.0M |     0.375 |     0.272 |    0.024 |      0.083 |
|  6 | 0.739 | 0.758 | GLM-5.3              | Zhipu AI                  | $1.50 |    59 | 1.0M |     0.390 |     0.276 |    0.024 |      0.068 |
|  7 | 0.733 | 0.779 | Muse Spark 1.1       | Meta                      | $3.71 |   170 | 1.0M |     0.381 |     0.265 |    0.024 |      0.109 |
|  8 | 0.723 | 0.735 | DeepSeek-V4-Pro-0813 | DeepSeek                  | $0.94 |    49 | 1.0M |     0.377 |     0.272 |    0.024 |      0.061 |
|  9 | 0.718 | 0.724 | Hy3                  | Tencent                   | $0.47 |    61 | 262k |     0.343 |     0.241 |    0.071 |      0.069 |
| 10 | 0.715 | 0.726 | GPT-5.6 Luna         | OpenAI                    | $0.88 |    57 | 1.1M |     0.347 |     0.248 |    0.065 |      0.067 |

## @designer — Design work: visual/UX judgement on image-capable models
eligible: 88 — λ 0.00882 $/quality-point (thinking ×1.857)

|  # | value |     q | model                 | org         |   $/M | tok/s |  ctx | gen 30.6% | code 11.8% | vis 21.2% | tput 15.3% | web 21.2% | agon |
| -: | ----: | ----: | --------------------- | ----------- | ----: | ----: | ---: | --------: | ---------: | --------: | ---------: | --------: | ---: |
|  1 | 0.787 | 0.791 | ★ DeepSeek-V4.1-Flash | DeepSeek    | $0.45 |    87 | 1.0M |     0.272 |      0.092 |     0.134 |      0.097 |     0.195 |    — |
|  2 | 0.767 | 0.800 | ★ Muse Spark 1.3      | Meta        | $3.71 |    81 | 1.0M |     0.282 |      0.090 |     0.123 |      0.094 |     0.211 | 1289 |
|  3 | 0.761 | 0.785 | Gemini 3.8 Flash      | Google      | $2.79 |    99 | 1.0M |     0.266 |      0.084 |     0.142 |      0.103 |     0.190 | 1230 |
|  4 | 0.747 | 0.772 | Gemini 3.7 Flash      | Google      | $2.79 |    99 | 1.0M |     0.259 |      0.079 |     0.138 |      0.103 |     0.193 | 1214 |
|  5 | 0.745 | 0.778 | Muse Spark 1.1        | Meta        | $3.71 |   170 | 1.0M |     0.264 |      0.079 |     0.145 |      0.127 |     0.162 |    — |
|  6 | 0.720 | 0.729 | MiMo-V2.6-Pro         | Xiaomi      | $0.99 |    26 | 1.0M |     0.267 |      0.090 |     0.125 |      0.044 |     0.204 |    — |
|  7 | 0.708 | 0.711 | ★ GLM-5.3-Flash       | Zhipu AI    | $0.36 |    41 | 1.0M |     0.265 |      0.078 |     0.135 |      0.063 |     0.169 |    — |
|  8 | 0.706 | 0.795 | Kimi K3               | Moonshot AI | $10.1 |    47 | 1.0M |     0.277 |      0.091 |     0.148 |      0.069 |     0.209 | 1285 |
|  9 | 0.703 | 0.803 | ★ GPT-5.6 Sol         | OpenAI      | $11.4 |    60 | 1.1M |     0.283 |      0.095 |     0.145 |      0.081 |     0.199 | 1183 |
| 10 | 0.698 | 0.722 | Gemini 3.6 Flash      | Google      | $2.79 |    69 | 1.0M |     0.240 |      0.070 |     0.137 |      0.087 |     0.188 | 1187 |

# Suggested settings.modelRoles (best-fit #1 per role, resolved via the omp catalog).
# Selectors are openrouter/<id>; the omp-llm-role plugin writes this block daily.
modelRoles:
  default: "openrouter/deepseek/deepseek-v4.1-flash"
  smol: "openrouter/meta/muse-spark-1.1"
  slow: "openrouter/z-ai/glm-5.3"
  vision: "openrouter/qwen/qwen3.8-flash"
  plan: "openrouter/qwen/qwen3.8-flash"
  commit: "openrouter/meta/muse-spark-1.1"
  tiny: "openrouter/meta/muse-spark-1.1"
  task: "openrouter/deepseek/deepseek-v4.1-flash"
  advisor: "openrouter/meta/muse-spark-1.3"
  designer: "openrouter/deepseek/deepseek-v4.1-flash"
