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
Throughput + price: OpenRouter per-provider routes under the default price-based routing (weight 1/price² over stable standard-tier providers; p50 tok/s of routed traffic; $/M 3:1 in:out), throughput 151/399, priced 150; models without OpenRouter throughput or a billed route are not ranked.

## @default — Main workhorse: strong general coding-agent quality, sane cost
eligible: 142 — λ 0.00556 $/quality-point

|  # | value |     q | model                 | org         |   $/M | tok/s |  ctx | gen 35.8% | rea 18.9% | code 18.9% | ag 12.6% | tool 10.5% | tput 3.2% |
| -: | ----: | ----: | --------------------- | ----------- | ----: | ----: | ---: | --------: | --------: | ---------: | -------: | ---------: | --------: |
|  1 | 0.810 | 0.821 | ★ Muse Spark 1.3      | Meta        | $2.00 |    58 | 1.0M |     0.331 |     0.169 |      0.145 |    0.094 |      0.066 |     0.016 |
|  2 | 0.809 | 0.810 | ★ DeepSeek-V4.1-Flash | DeepSeek    | $0.23 |    62 | 1.0M |     0.319 |     0.163 |      0.149 |    0.095 |      0.068 |     0.017 |
|  3 | 0.808 | 0.814 | ★ GLM-5.3             | Zhipu AI    | $1.06 |    73 | 1.0M |     0.323 |     0.169 |      0.146 |    0.092 |      0.066 |     0.018 |
|  4 | 0.799 | 0.833 | ★ GPT-5.6 Sol         | OpenAI      | $6.13 |    44 | 1.1M |     0.332 |     0.173 |      0.154 |    0.095 |      0.064 |     0.014 |
|  5 | 0.789 | 0.812 | Kimi K3               | Moonshot AI | $4.15 |    43 | 1.0M |     0.324 |     0.169 |      0.147 |    0.092 |      0.067 |     0.014 |
|  6 | 0.785 | 0.788 | DeepSeek-V4-Pro-0813  | DeepSeek    | $0.51 |    48 | 1.0M |     0.318 |     0.164 |      0.140 |    0.089 |      0.063 |     0.015 |
|  7 | 0.778 | 0.781 | MiMo-V2.6-Pro         | Xiaomi      | $0.54 |    28 | 1.0M |     0.313 |     0.158 |      0.145 |    0.090 |      0.065 |     0.010 |
|  8 | 0.776 | 0.782 | Hy4 preview           | Tencent     | $1.25 |    36 |    — |     0.315 |     0.166 |      0.139 |    0.088 |      0.063 |     0.012 |
|  9 | 0.773 | 0.889 | ★ GPT-6 Astra         | OpenAI      | $20.9 |    38 | 1.1M |     0.355 |     0.183 |      0.163 |    0.104 |      0.072 |     0.012 |
| 10 | 0.769 | 0.780 | Muse Spark 1.1        | Meta        | $2.00 |   208 | 1.0M |     0.309 |     0.165 |      0.127 |    0.085 |      0.065 |     0.028 |

## @smol — Fast lightweight model: cheap and quick, still competent
eligible: 142 — λ 0.02143 $/quality-point

|  # | value |     q | model                        | org                       |   $/M | tok/s |  ctx | tput 40% | gen 28.6% | code 17.1% | tool 14.3% |
| -: | ----: | ----: | ---------------------------- | ------------------------- | ----: | ----: | ---: | -------: | --------: | ---------: | ---------: |
|  1 | 0.764 | 0.807 | ★ Muse Spark 1.1             | Meta                      | $2.00 |   208 | 1.0M |    0.357 |     0.247 |      0.115 |      0.088 |
|  2 | 0.692 | 0.697 | ★ DeepSeek-V4.1-Flash        | DeepSeek                  | $0.23 |    62 | 1.0M |    0.215 |     0.255 |      0.135 |      0.092 |
|  3 | 0.690 | 0.712 | ★ GLM-5.3                    | Zhipu AI                  | $1.06 |    73 | 1.0M |    0.233 |     0.257 |      0.132 |      0.090 |
|  4 | 0.681 | 0.713 | ★ Gemini 3.8 Flash           | Google                    | $1.50 |    95 | 1.0M |    0.265 |     0.249 |      0.123 |      0.077 |
|  5 | 0.676 | 0.708 | Gemini 3.7 Flash             | Google                    | $1.50 |   105 | 1.0M |    0.277 |     0.242 |      0.115 |      0.075 |
|  6 | 0.649 | 0.692 | Muse Spark 1.3               | Meta                      | $2.00 |    58 | 1.0M |    0.207 |     0.264 |      0.131 |      0.090 |
|  7 | 0.648 | 0.658 | DeepSeek-V4-Flash-Vision-Exp | DeepSeek                  | $0.46 |    74 | 1.0M |    0.236 |     0.232 |      0.116 |      0.074 |
|  8 | 0.639 | 0.650 | DeepSeek-V4-Pro-0813         | DeepSeek                  | $0.51 |    48 | 1.0M |    0.185 |     0.254 |      0.127 |      0.085 |
|  9 | 0.636 | 0.641 | ★ Qwen3.8 Flash              | Alibaba Cloud / Qwen Team | $0.23 |    51 | 1.0M |    0.190 |     0.245 |      0.118 |      0.087 |
| 10 | 0.632 | 0.707 | Gemini 3.5 Flash             | Google                    | $3.47 |   115 | 1.0M |    0.287 |     0.223 |      0.108 |      0.088 |

## @slow — Most capable model for hard problems; cost and speed as tiebreakers
eligible: 142 — λ 0.00263 $/quality-point (thinking ×2.714)

|  # | value |     q | model                 | org                       |   $/M | tok/s |  ctx | gen 27.4% | rea 27.4% | code 18.9% | ag 13.7% | math 8.4% | tput 4.2% |
| -: | ----: | ----: | --------------------- | ------------------------- | ----: | ----: | ---: | --------: | --------: | ---------: | -------: | --------: | --------: |
|  1 | 0.818 | 0.825 | ★ GLM-5.3             | Zhipu AI                  | $2.88 |    73 | 1.0M |     0.247 |     0.244 |      0.146 |    0.100 |     0.064 |     0.025 |
|  2 | 0.810 | 0.811 | ★ DeepSeek-V4.1-Flash | DeepSeek                  | $0.63 |    62 | 1.0M |     0.244 |     0.235 |      0.149 |    0.102 |     0.058 |     0.023 |
|  3 | 0.795 | 0.798 | DeepSeek-V4-Pro-0813  | DeepSeek                  | $1.38 |    48 | 1.0M |     0.243 |     0.236 |      0.140 |    0.096 |     0.063 |     0.019 |
|  4 | 0.794 | 0.838 | ★ GPT-5.6 Sol         | OpenAI                    | $16.6 |    44 | 1.1M |     0.254 |     0.250 |      0.154 |    0.103 |     0.058 |     0.018 |
|  5 | 0.791 | 0.820 | Kimi K3               | Moonshot AI               | $11.3 |    43 | 1.0M |     0.248 |     0.244 |      0.147 |    0.100 |     0.064 |     0.018 |
|  6 | 0.785 | 0.794 | Hy4 preview           | Tencent                   | $3.39 |    36 |    — |     0.241 |     0.240 |      0.139 |    0.096 |     0.063 |     0.016 |
|  7 | 0.782 | 0.796 | Muse Spark 1.1        | Meta                      | $5.43 |   208 | 1.0M |     0.237 |     0.238 |      0.128 |    0.092 |     0.064 |     0.038 |
|  8 | 0.770 | 0.844 | ★ Claude Opus 5       | Anthropic                 | $28.4 |    65 | 1.0M |     0.256 |     0.253 |      0.144 |    0.102 |     0.066 |     0.023 |
|  9 | 0.768 | 0.770 | ★ GLM-5.3-Flash       | Zhipu AI                  | $0.47 |    39 | 1.0M |     0.238 |     0.234 |      0.126 |    0.096 |     0.059 |     0.017 |
| 10 | 0.766 | 0.768 | Qwen3.8 Flash         | Alibaba Cloud / Qwen Team | $0.62 |    51 | 1.0M |     0.235 |     0.234 |      0.130 |    0.093 |     0.055 |     0.020 |

## @vision — Image understanding: vision index dominates
eligible: 74 — λ 0.00682 $/quality-point (thinking ×1.857)

|  # | value |     q | model               | org                       |   $/M | tok/s |  ctx | vis 54.2% | gen 20.8% | rea 15.6% | code 6.3% | tput 3.1% |
| -: | ----: | ----: | ------------------- | ------------------------- | ----: | ----: | ---: | --------: | --------: | --------: | --------: | --------: |
|  1 | 0.732 | 0.735 | ★ Qwen3.8 Flash     | Alibaba Cloud / Qwen Team | $0.43 |    51 | 1.0M |     0.365 |     0.179 |     0.134 |     0.043 |     0.015 |
|  2 | 0.732 | 0.758 | ★ Muse Spark 1.1    | Meta                      | $3.71 |   208 | 1.0M |     0.371 |     0.180 |     0.136 |     0.042 |     0.028 |
|  3 | 0.726 | 0.729 | DeepSeek-V4.1-Flash | DeepSeek                  | $0.43 |    62 | 1.0M |     0.343 |     0.186 |     0.134 |     0.049 |     0.017 |
|  4 | 0.720 | 0.739 | ★ Gemini 3.8 Flash  | Google                    | $2.79 |    95 | 1.0M |     0.363 |     0.181 |     0.128 |     0.045 |     0.021 |
|  5 | 0.717 | 0.770 | ★ Kimi K3           | Moonshot AI               | $7.70 |    43 | 1.0M |     0.380 |     0.189 |     0.139 |     0.048 |     0.013 |
|  6 | 0.712 | 0.715 | ★ GLM-5.3-Flash     | Zhipu AI                  | $0.32 |    39 | 1.0M |     0.346 |     0.181 |     0.133 |     0.042 |     0.012 |
|  7 | 0.702 | 0.721 | Gemini 3.7 Flash    | Google                    | $2.79 |   105 | 1.0M |     0.353 |     0.176 |     0.128 |     0.042 |     0.022 |
|  8 | 0.697 | 0.706 | Qwen3.8-27B         | Alibaba Cloud / Qwen Team | $1.40 |    46 | 262k |     0.359 |     0.169 |     0.126 |     0.040 |     0.014 |
|  9 | 0.697 | 0.774 | ★ GPT-5.6 Sol       | OpenAI                    | $11.4 |    44 | 1.1M |     0.374 |     0.193 |     0.143 |     0.051 |     0.014 |
| 10 | 0.691 | 0.716 | Muse Spark 1.3      | Meta                      | $3.71 |    58 | 1.0M |     0.321 |     0.192 |     0.139 |     0.048 |     0.016 |

## @plan — Planning: reasoning, math, long-context coherence
eligible: 142 — λ 0.00682 $/quality-point (thinking ×1.857)

|  # | value |     q | model                | org                       |   $/M | tok/s |  ctx | rea 35.6% | gen 28.9% | lc 15.6% | math 15.6% | tput 4.4% |
| -: | ----: | ----: | -------------------- | ------------------------- | ----: | ----: | ---: | --------: | --------: | -------: | ---------: | --------: |
|  1 | 0.759 | 0.775 | ★ Hy4 preview        | Tencent                   | $2.32 |    36 |    — |     0.312 |     0.254 |    0.076 |      0.116 |     0.017 |
|  2 | 0.752 | 0.755 | ★ Qwen3.8 Flash      | Alibaba Cloud / Qwen Team | $0.43 |    51 | 1.0M |     0.305 |     0.248 |    0.079 |      0.102 |     0.021 |
|  3 | 0.741 | 0.819 | ★ GPT-5.6 Sol        | OpenAI                    | $11.4 |    44 | 1.1M |     0.325 |     0.268 |    0.099 |      0.107 |     0.019 |
|  4 | 0.720 | 0.723 | Hy3                  | Tencent                   | $0.47 |    49 | 262k |     0.279 |     0.227 |    0.088 |      0.109 |     0.021 |
|  5 | 0.710 | 0.771 | GPT-5.6 Terra        | OpenAI                    | $8.82 |    55 | 1.1M |     0.304 |     0.254 |    0.089 |      0.102 |     0.022 |
|  6 | 0.710 | 0.717 | Qwen3.7-Plus         | Alibaba Cloud / Qwen Team | $1.04 |    14 |    — |     0.280 |     0.226 |    0.091 |      0.116 |     0.004 |
|  7 | 0.709 | 0.722 | GLM-5.3              | Zhipu AI                  | $1.97 |    73 | 1.0M |     0.317 |     0.260 |        — |      0.119 |     0.026 |
|  8 | 0.708 | 0.714 | GPT-5.6 Luna         | OpenAI                    | $0.88 |    58 | 1.1M |     0.282 |     0.234 |    0.080 |      0.095 |     0.023 |
|  9 | 0.697 | 0.707 | Qwen3.6 Plus         | Alibaba Cloud / Qwen Team | $1.36 |    37 | 1.0M |     0.268 |     0.214 |    0.092 |      0.115 |     0.017 |
| 10 | 0.693 | 0.700 | DeepSeek-V4-Pro-0813 | DeepSeek                  | $0.94 |    48 | 1.0M |     0.307 |     0.256 |        — |      0.116 |     0.021 |

## @commit — Commit messages: cheap and fast with decent general quality
eligible: 142 — λ 0.02692 $/quality-point

|  # | value |     q | model                        | org         |   $/M | tok/s |  ctx | tput 41.5% | gen 43.1% | code 15.4% |
| -: | ----: | ----: | ---------------------------- | ----------- | ----: | ----: | ---: | ---------: | --------: | ---------: |
|  1 | 0.793 | 0.847 | ★ Muse Spark 1.1             | Meta        | $2.00 |   208 | 1.0M |      0.371 |     0.373 |      0.104 |
|  2 | 0.722 | 0.728 | ★ DeepSeek-V4.1-Flash        | DeepSeek    | $0.23 |    62 | 1.0M |      0.223 |     0.384 |      0.121 |
|  3 | 0.720 | 0.749 | ★ GLM-5.3                    | Zhipu AI    | $1.06 |    73 | 1.0M |      0.242 |     0.388 |      0.118 |
|  4 | 0.720 | 0.760 | ★ Gemini 3.8 Flash           | Google      | $1.50 |    95 | 1.0M |      0.275 |     0.375 |      0.111 |
|  5 | 0.714 | 0.754 | Gemini 3.7 Flash             | Google      | $1.50 |   105 | 1.0M |      0.287 |     0.364 |      0.103 |
|  6 | 0.687 | 0.699 | DeepSeek-V4-Flash-Vision-Exp | DeepSeek    | $0.46 |    74 | 1.0M |      0.245 |     0.350 |      0.104 |
|  7 | 0.676 | 0.730 | Muse Spark 1.3               | Meta        | $2.00 |    58 | 1.0M |      0.215 |     0.398 |      0.118 |
|  8 | 0.675 | 0.678 | ★ Laguna S 2.1               | Poolside    | $0.11 |    82 | 1.0M |      0.257 |     0.324 |      0.096 |
|  9 | 0.674 | 0.688 | DeepSeek-V4-Pro-0813         | DeepSeek    | $0.51 |    48 | 1.0M |      0.192 |     0.382 |      0.114 |
| 10 | 0.669 | 0.670 | ★ Ling 3.0 Flash             | InclusionAI | $0.04 |   100 | 131k |      0.281 |     0.303 |      0.086 |

## @tiny — Background tasks (titles, memory): cheapest and fastest wins
eligible: 142 — λ 0.03333 $/quality-point

|  # | value |     q | model                       | org                       |   $/M | tok/s |  ctx | tput 58.3% | gen 41.7% |
| -: | ----: | ----: | --------------------------- | ------------------------- | ----: | ----: | ---: | ---------: | --------: |
|  1 | 0.814 | 0.881 | ★ Muse Spark 1.1            | Meta                      | $2.00 |   208 | 1.0M |      0.521 |     0.360 |
|  2 | 0.774 | 0.776 | ★ Ling 3.0 Flash Fin        | InclusionAI               | $0.07 |   137 | 262k |      0.449 |     0.327 |
|  3 | 0.705 | 0.755 | Gemini 3.7 Flash            | Google                    | $1.50 |   105 | 1.0M |      0.403 |     0.352 |
|  4 | 0.701 | 0.704 | Nemotron 3 Nano (30B A3B)   | NVIDIA                    | $0.09 |   175 | 262k |      0.491 |     0.214 |
|  5 | 0.699 | 0.749 | Gemini 3.8 Flash            | Google                    | $1.50 |    95 | 1.0M |      0.386 |     0.362 |
|  6 | 0.686 | 0.687 | ★ Ling 3.0 Flash            | InclusionAI               | $0.04 |   100 | 131k |      0.395 |     0.293 |
|  7 | 0.685 | 0.698 | Qwen3-Next-80B-A3B-Thinking | Alibaba Cloud / Qwen Team | $0.41 |   155 |    — |      0.470 |     0.228 |
|  8 | 0.680 | 0.716 | GLM-5.3                     | Zhipu AI                  | $1.06 |    73 | 1.0M |      0.340 |     0.375 |
|  9 | 0.677 | 0.685 | DeepSeek-V4.1-Flash         | DeepSeek                  | $0.23 |    62 | 1.0M |      0.313 |     0.371 |
| 10 | 0.676 | 0.679 | Laguna XS 2.1               | Poolside                  | $0.07 |   136 | 262k |      0.448 |     0.231 |

## @task — Subagents: agentic + tool calling, moderate cost sensitivity
eligible: 142 — λ 0.00747 $/quality-point

|  # | value |     q | model                 | org         |   $/M | tok/s |  ctx | ag 29.9% | tool 20.7% | code 18.4% | gen 25.3% | tput 5.7% |
| -: | ----: | ----: | --------------------- | ----------- | ----: | ----: | ---: | -------: | ---------: | ---------: | --------: | --------: |
|  1 | 0.757 | 0.758 | ★ DeepSeek-V4.1-Flash | DeepSeek    | $0.23 |    62 | 1.0M |    0.224 |      0.133 |      0.145 |     0.225 |     0.031 |
|  2 | 0.743 | 0.751 | GLM-5.3               | Zhipu AI    | $1.06 |    73 | 1.0M |    0.218 |      0.130 |      0.141 |     0.228 |     0.034 |
|  3 | 0.742 | 0.757 | Muse Spark 1.3        | Meta        | $2.00 |    58 | 1.0M |    0.223 |      0.131 |      0.141 |     0.234 |     0.030 |
|  4 | 0.717 | 0.721 | DeepSeek-V4-Pro-0813  | DeepSeek    | $0.51 |    48 | 1.0M |    0.211 |      0.123 |      0.136 |     0.225 |     0.027 |
|  5 | 0.717 | 0.721 | MiMo-V2.6-Pro         | Xiaomi      | $0.54 |    28 | 1.0M |    0.214 |      0.128 |      0.141 |     0.221 |     0.018 |
|  6 | 0.716 | 0.762 | ★ GPT-5.6 Sol         | OpenAI      | $6.13 |    44 | 1.1M |    0.226 |      0.126 |      0.150 |     0.235 |     0.025 |
|  7 | 0.713 | 0.744 | Kimi K3               | Moonshot AI | $4.15 |    43 | 1.0M |    0.217 |      0.131 |      0.143 |     0.229 |     0.025 |
|  8 | 0.707 | 0.722 | Muse Spark 1.1        | Meta        | $2.00 |   208 | 1.0M |    0.201 |      0.127 |      0.124 |     0.219 |     0.051 |
|  9 | 0.701 | 0.710 | Hy4 preview           | Tencent     | $1.25 |    36 |    — |    0.209 |      0.123 |      0.135 |     0.222 |     0.022 |
| 10 | 0.700 | 0.701 | ★ GLM-5.3-Flash       | Zhipu AI    | $0.17 |    39 | 1.0M |    0.210 |      0.126 |      0.122 |     0.220 |     0.023 |

## @advisor — Advisor/watchdog: deep reasoning over long context
eligible: 142 — λ 0.00682 $/quality-point

|  # | value |     q | model                | org                       |   $/M | tok/s |  ctx | rea 39.1% | gen 32.6% | lc 13% | math 10.9% | tput 4.3% |
| -: | ----: | ----: | -------------------- | ------------------------- | ----: | ----: | ---: | --------: | --------: | -----: | ---------: | --------: |
|  1 | 0.796 | 0.837 | ★ GPT-5.6 Sol        | OpenAI                    | $6.13 |    44 | 1.1M |     0.357 |     0.303 |  0.083 |      0.075 |     0.019 |
|  2 | 0.783 | 0.791 | ★ Hy4 preview        | Tencent                   | $1.25 |    36 |    — |     0.343 |     0.287 |  0.063 |      0.081 |     0.016 |
|  3 | 0.772 | 0.774 | ★ Qwen3.8 Flash      | Alibaba Cloud / Qwen Team | $0.23 |    51 | 1.0M |     0.335 |     0.280 |  0.067 |      0.071 |     0.021 |
|  4 | 0.756 | 0.788 | GPT-5.6 Terra        | OpenAI                    | $4.75 |    55 | 1.1M |     0.334 |     0.286 |  0.075 |      0.071 |     0.022 |
|  5 | 0.744 | 0.751 | GLM-5.3              | Zhipu AI                  | $1.06 |    73 | 1.0M |     0.349 |     0.294 |      — |      0.083 |     0.025 |
|  6 | 0.743 | 0.757 | Muse Spark 1.3       | Meta                      | $2.00 |    58 | 1.0M |     0.349 |     0.301 |  0.085 |          — |     0.022 |
|  7 | 0.732 | 0.733 | Hy3                  | Tencent                   | $0.25 |    49 | 262k |     0.307 |     0.256 |  0.074 |      0.076 |     0.020 |
|  8 | 0.730 | 0.744 | Muse Spark 1.1       | Meta                      | $2.00 |   208 | 1.0M |     0.341 |     0.282 |      — |      0.082 |     0.039 |
|  9 | 0.727 | 0.730 | GPT-5.6 Luna         | OpenAI                    | $0.47 |    58 | 1.1M |     0.310 |     0.264 |  0.067 |      0.066 |     0.023 |
| 10 | 0.725 | 0.728 | DeepSeek-V4-Pro-0813 | DeepSeek                  | $0.51 |    48 | 1.0M |     0.338 |     0.290 |      — |      0.081 |     0.020 |

## @designer — Design work: visual/UX judgement on image-capable models
eligible: 87 — λ 0.00882 $/quality-point (thinking ×1.857)

|  # | value |     q | model                 | org         |   $/M | tok/s |  ctx | gen 30.6% | code 11.8% | vis 21.2% | tput 15.3% | web 21.2% | agon |
| -: | ----: | ----: | --------------------- | ----------- | ----: | ----: | ---: | --------: | ---------: | --------: | ---------: | --------: | ---: |
|  1 | 0.775 | 0.779 | ★ DeepSeek-V4.1-Flash | DeepSeek    | $0.43 |    62 | 1.0M |     0.273 |      0.093 |     0.134 |      0.082 |     0.197 |    — |
|  2 | 0.759 | 0.784 | ★ Gemini 3.8 Flash    | Google      | $2.79 |    95 | 1.0M |     0.266 |      0.085 |     0.142 |      0.101 |     0.190 | 1247 |
|  3 | 0.756 | 0.789 | ★ Muse Spark 1.1      | Meta        | $3.71 |   208 | 1.0M |     0.265 |      0.079 |     0.145 |      0.136 |     0.164 |    — |
|  4 | 0.755 | 0.788 | Muse Spark 1.3        | Meta        | $3.71 |    58 | 1.0M |     0.283 |      0.090 |     0.125 |      0.079 |     0.211 | 1303 |
|  5 | 0.752 | 0.776 | Gemini 3.7 Flash      | Google      | $2.79 |   105 | 1.0M |     0.259 |      0.079 |     0.138 |      0.106 |     0.195 | 1232 |
|  6 | 0.725 | 0.734 | MiMo-V2.6-Pro         | Xiaomi      | $1.01 |    28 | 1.0M |     0.267 |      0.090 |     0.125 |      0.047 |     0.206 |    — |
|  7 | 0.722 | 0.789 | ★ Kimi K3             | Moonshot AI | $7.70 |    43 | 1.0M |     0.277 |      0.091 |     0.149 |      0.065 |     0.207 |    — |
|  8 | 0.706 | 0.709 | ★ GLM-5.3-Flash       | Zhipu AI    | $0.32 |    39 | 1.0M |     0.266 |      0.078 |     0.135 |      0.061 |     0.169 |    — |
|  9 | 0.705 | 0.729 | Gemini 3.6 Flash      | Google      | $2.79 |    80 | 1.0M |     0.240 |      0.070 |     0.137 |      0.094 |     0.188 | 1205 |
| 10 | 0.693 | 0.793 | ★ GPT-5.6 Sol         | OpenAI      | $11.4 |    44 | 1.1M |     0.284 |      0.096 |     0.146 |      0.067 |     0.200 | 1200 |

# Suggested settings.modelRoles (best-fit #1 per role, resolved via the omp catalog).
# Selectors are openrouter/<id>; the omp-llm-role plugin writes this block daily.
modelRoles:
  default: "openrouter/meta/muse-spark-1.3"
  smol: "openrouter/meta/muse-spark-1.1"
  slow: "openrouter/z-ai/glm-5.3"
  vision: "openrouter/qwen/qwen3.8-flash"
  plan: "openrouter/tencent/hy4-preview"
  commit: "openrouter/meta/muse-spark-1.1"
  tiny: "openrouter/meta/muse-spark-1.1"
  task: "openrouter/deepseek/deepseek-v4.1-flash"
  advisor: "openrouter/openai/gpt-5.6-sol"
  designer: "openrouter/deepseek/deepseek-v4.1-flash"
