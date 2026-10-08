llm-stats.com best-fit ranking per omp model role — 400 models, 2026-10-07
Value ranking per role: each metric is cardinal-normalized with fixed anchors
(no ranks): llm-stats index_* affine (v+20)/80 (interval scale, observed −16..+60),
benchmarks chance-anchored pass rates, throughput log-anchored 10..300 tok/s.
q = Σ weight × metric over the quality metrics (weights renormalized excluding
price); value = q − λ·$/M sorts each role. λ = w/(1−w) ÷ $20 (w = price weight), per-role
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
Throughput + price: OpenRouter per-provider routes under the default price-based routing (weight 1/price² over stable standard-tier providers; p50 tok/s of routed traffic; $/M 3:1 in:out), throughput 150/400, priced 149; models without OpenRouter throughput or a billed route are not ranked.

## @default — Main workhorse: strong general coding-agent quality, sane cost
eligible: 142 — λ 0.00556 $/quality-point (thinking ×1.857)

|  # | value |     q | model                 | org                       |   $/M | tok/s |  ctx | gen 54.7% | code 18.9% | ag 12.6% | tool 10.5% | tput 3.2% |
| -: | ----: | ----: | --------------------- | ------------------------- | ----: | ----: | ---: | --------: | ---------: | -------: | ---------: | --------: |
|  1 | 0.813 | 0.816 | ★ DeepSeek-V4.1-Flash | DeepSeek                  | $0.58 |    72 | 1.0M |     0.487 |      0.149 |    0.094 |      0.068 |     0.018 |
|  2 | 0.804 | 0.825 | ★ Muse Spark 1.3      | Meta                      | $3.71 |    50 | 1.0M |     0.505 |      0.145 |    0.094 |      0.066 |     0.015 |
|  3 | 0.801 | 0.815 | GLM-5.3               | Zhipu AI                  | $2.66 |    77 | 1.0M |     0.493 |      0.145 |    0.092 |      0.066 |     0.019 |
|  4 | 0.786 | 0.799 | DeepSeek-V4-Pro-0813  | DeepSeek                  | $2.44 |   103 | 1.0M |     0.486 |      0.140 |    0.089 |      0.063 |     0.022 |
|  5 | 0.783 | 0.789 | MiMo-V2.6-Pro         | Xiaomi                    | $1.01 |    31 | 1.0M |     0.478 |      0.144 |    0.091 |      0.065 |     0.010 |
|  6 | 0.774 | 0.837 | ★ GPT-5.6 Sol         | OpenAI                    | $11.4 |    64 | 1.1M |     0.507 |      0.154 |    0.095 |      0.064 |     0.017 |
|  7 | 0.770 | 0.815 | Kimi K3               | Moonshot AI               | $8.03 |    48 | 1.0M |     0.495 |      0.147 |    0.092 |      0.067 |     0.015 |
|  8 | 0.770 | 0.783 | Hy4 preview           | Tencent                   | $2.32 |    38 |    — |     0.481 |      0.138 |    0.088 |      0.063 |     0.012 |
|  9 | 0.765 | 0.767 | ★ GLM-5.3-Flash       | Zhipu AI                  | $0.35 |    44 | 1.0M |     0.475 |      0.126 |    0.089 |      0.064 |     0.014 |
| 10 | 0.764 | 0.766 | Qwen3.8 Flash         | Alibaba Cloud / Qwen Team | $0.43 |    58 | 1.0M |     0.470 |      0.130 |    0.085 |      0.064 |     0.016 |

## @smol — Fast lightweight model: cheap and quick, still competent
eligible: 142 — λ 0.04091 $/quality-point

|  # | value |     q | model                        | org                       |   $/M | tok/s |  ctx | tput 40% | gen 28.6% | code 17.1% | tool 14.3% |
| -: | ----: | ----: | ---------------------------- | ------------------------- | ----: | ----: | ---: | -------: | --------: | ---------: | ---------: |
|  1 | 0.700 | 0.712 | ★ DeepSeek-V4.1-Flash        | DeepSeek                  | $0.31 |    72 | 1.0M |    0.232 |     0.254 |      0.135 |      0.092 |
|  2 | 0.688 | 0.707 | DeepSeek-V4-Flash-Vision-Exp | DeepSeek                  | $0.46 |   113 | 1.0M |    0.285 |     0.232 |      0.116 |      0.074 |
|  3 | 0.686 | 0.739 | ★ DeepSeek-V4-Pro-0813       | DeepSeek                  | $1.31 |   103 | 1.0M |    0.274 |     0.253 |      0.127 |      0.085 |
|  4 | 0.664 | 0.746 | ★ Muse Spark 1.1             | Meta                      | $2.00 |   124 | 1.0M |    0.296 |     0.247 |      0.115 |      0.088 |
|  5 | 0.661 | 0.719 | GLM-5.3                      | Zhipu AI                  | $1.43 |    77 | 1.0M |    0.241 |     0.257 |      0.132 |      0.090 |
|  6 | 0.656 | 0.717 | Gemini 3.7 Flash             | Google                    | $1.50 |   114 | 1.0M |    0.286 |     0.241 |      0.115 |      0.075 |
|  7 | 0.648 | 0.657 | ★ Qwen3.8 Flash              | Alibaba Cloud / Qwen Team | $0.23 |    58 | 1.0M |    0.207 |     0.245 |      0.118 |      0.087 |
|  8 | 0.647 | 0.663 | Mercury 2                    | Inception                 | $0.38 |   314 | 128k |    0.400 |     0.155 |      0.070 |      0.038 |
|  9 | 0.634 | 0.642 | ★ GPT-6 Luna                 | OpenAI                    | $0.21 |    70 | 1.1M |    0.229 |     0.230 |      0.110 |      0.074 |
| 10 | 0.629 | 0.648 | GPT-5.6 Luna                 | OpenAI                    | $0.47 |    66 | 1.1M |    0.222 |     0.231 |      0.120 |      0.076 |

## @slow — Most capable model for hard problems; cost and speed as tiebreakers
eligible: 142 — λ 0.00263 $/quality-point (thinking ×2.714)

|  # | value |     q | model                 | org         |   $/M | tok/s |  ctx | gen 63.2% | code 18.9% | ag 13.7% | tput 4.2% |
| -: | ----: | ----: | --------------------- | ----------- | ----: | ----: | ---: | --------: | ---------: | -------: | --------: |
|  1 | 0.835 | 0.838 | ★ DeepSeek-V4.1-Flash | DeepSeek    | $0.85 |    72 | 1.0M |     0.562 |      0.149 |    0.102 |     0.024 |
|  2 | 0.835 | 0.849 | ★ Muse Spark 1.3      | Meta        | $5.43 |    50 | 1.0M |     0.582 |      0.145 |    0.102 |     0.020 |
|  3 | 0.829 | 0.839 | ★ GLM-5.3             | Zhipu AI    | $3.88 |    77 | 1.0M |     0.569 |      0.145 |    0.100 |     0.025 |
|  4 | 0.821 | 0.864 | ★ GPT-5.6 Sol         | OpenAI      | $16.6 |    64 | 1.1M |     0.585 |      0.154 |    0.103 |     0.023 |
|  5 | 0.816 | 0.826 | DeepSeek-V4-Pro-0813  | DeepSeek    | $3.56 |   103 | 1.0M |     0.560 |      0.140 |    0.096 |     0.029 |
|  6 | 0.806 | 0.837 | Kimi K3               | Moonshot AI | $11.7 |    48 | 1.0M |     0.572 |      0.147 |    0.099 |     0.019 |
|  7 | 0.804 | 0.808 | MiMo-V2.6-Pro         | Xiaomi      | $1.47 |    31 | 1.0M |     0.552 |      0.144 |    0.098 |     0.014 |
|  8 | 0.797 | 0.806 | Hy4 preview           | Tencent     | $3.39 |    38 |    — |     0.555 |      0.138 |    0.095 |     0.016 |
|  9 | 0.794 | 0.824 | GPT-6.1 Sol           | OpenAI      | $11.5 |    40 | 1.1M |     0.569 |      0.138 |    0.099 |     0.017 |
| 10 | 0.792 | 0.803 | Gemini 3.8 Flash      | Google      | $4.07 |    77 | 1.0M |     0.549 |      0.136 |    0.093 |     0.025 |

## @vision — Image understanding: vision index dominates
eligible: 75 — λ 0.00682 $/quality-point (thinking ×1.857)

|  # | value |     q | model               | org                       |   $/M | tok/s |  ctx | vis 54.2% | gen 20.8% | rea 15.6% | code 6.3% | tput 3.1% |
| -: | ----: | ----: | ------------------- | ------------------------- | ----: | ----: | ---: | --------: | --------: | --------: | --------: | --------: |
|  1 | 0.733 | 0.736 | ★ Qwen3.8 Flash     | Alibaba Cloud / Qwen Team | $0.43 |    58 | 1.0M |     0.364 |     0.179 |     0.134 |     0.043 |     0.016 |
|  2 | 0.727 | 0.753 | ★ Muse Spark 1.1    | Meta                      | $3.71 |   124 | 1.0M |     0.371 |     0.180 |     0.136 |     0.042 |     0.023 |
|  3 | 0.726 | 0.730 | DeepSeek-V4.1-Flash | DeepSeek                  | $0.58 |    72 | 1.0M |     0.343 |     0.185 |     0.134 |     0.049 |     0.018 |
|  4 | 0.717 | 0.736 | ★ Gemini 3.8 Flash  | Google                    | $2.79 |    77 | 1.0M |     0.363 |     0.181 |     0.128 |     0.045 |     0.019 |
|  5 | 0.716 | 0.770 | ★ Kimi K3           | Moonshot AI               | $8.03 |    48 | 1.0M |     0.380 |     0.189 |     0.139 |     0.048 |     0.014 |
|  6 | 0.713 | 0.716 | ★ GLM-5.3-Flash     | Zhipu AI                  | $0.35 |    44 | 1.0M |     0.346 |     0.181 |     0.133 |     0.042 |     0.014 |
|  7 | 0.703 | 0.722 | Gemini 3.7 Flash    | Google                    | $2.79 |   114 | 1.0M |     0.354 |     0.176 |     0.128 |     0.042 |     0.022 |
|  8 | 0.697 | 0.774 | ★ GPT-5.6 Sol       | OpenAI                    | $11.4 |    64 | 1.1M |     0.371 |     0.193 |     0.143 |     0.051 |     0.017 |
|  9 | 0.695 | 0.708 | Qwen3.8-27B         | Alibaba Cloud / Qwen Team | $1.88 |    53 | 262k |     0.359 |     0.169 |     0.126 |     0.040 |     0.015 |
| 10 | 0.686 | 0.693 | Qwen3.7-Plus        | Alibaba Cloud / Qwen Team | $1.04 |    49 |    — |     0.353 |     0.163 |     0.123 |     0.039 |     0.015 |

## @plan — Planning: reasoning and long-context coherence, priced so the cheapest capable planner wins
eligible: 142 — λ 0.01667 $/quality-point (thinking ×1.857)

|  # | value |     q | model               | org                       |   $/M | tok/s |  ctx | gen 80% | lc 15.6% | tput 4.4% |
| -: | ----: | ----: | ------------------- | ------------------------- | ----: | ----: | ---: | ------: | -------: | --------: |
|  1 | 0.798 | 0.859 | ★ Muse Spark 1.3    | Meta                      | $3.71 |    50 | 1.0M |   0.737 |    0.101 |     0.021 |
|  2 | 0.782 | 0.789 | ★ Qwen3.8 Flash     | Alibaba Cloud / Qwen Team | $0.43 |    58 | 1.0M |   0.686 |    0.079 |     0.023 |
|  3 | 0.769 | 0.816 | ★ Gemini 3.8 Flash  | Google                    | $2.79 |    77 | 1.0M |   0.696 |    0.093 |     0.027 |
|  4 | 0.761 | 0.808 | Gemini 3.7 Flash    | Google                    | $2.79 |   114 | 1.0M |   0.676 |    0.100 |     0.032 |
|  5 | 0.758 | 0.768 | DeepSeek-V4.1-Flash | DeepSeek                  | $0.58 |    72 | 1.0M |   0.712 |    0.030 |     0.026 |
|  6 | 0.758 | 0.796 | ★ Hy4 preview       | Tencent                   | $2.32 |    38 |    — |   0.703 |    0.076 |     0.017 |
|  7 | 0.738 | 0.744 | ★ GLM-5.3-Flash     | Zhipu AI                  | $0.35 |    44 | 1.0M |   0.694 |    0.030 |     0.019 |
|  8 | 0.737 | 0.752 | GPT-5.6 Luna        | OpenAI                    | $0.88 |    66 | 1.1M |   0.647 |    0.080 |     0.025 |
|  9 | 0.733 | 0.777 | GLM-5.3             | Zhipu AI                  | $2.66 |    77 | 1.0M |   0.720 |    0.030 |     0.027 |
| 10 | 0.732 | 0.740 | Hy3                 | Tencent                   | $0.47 |    62 | 262k |   0.629 |    0.088 |     0.024 |

## @commit — Commit messages: cheap and fast with decent general quality
eligible: 142 — λ 0.04091 $/quality-point

|  # | value |     q | model                          | org                       |   $/M | tok/s |  ctx | tput 41.5% | gen 43.1% | code 15.4% |
| -: | ----: | ----: | ------------------------------ | ------------------------- | ----: | ----: | ---: | ---------: | --------: | ---------: |
|  1 | 0.732 | 0.745 | ★ DeepSeek-V4.1-Flash          | DeepSeek                  | $0.31 |    72 | 1.0M |      0.240 |     0.383 |      0.121 |
|  2 | 0.731 | 0.750 | ★ DeepSeek-V4-Flash-Vision-Exp | DeepSeek                  | $0.46 |   113 | 1.0M |      0.296 |     0.350 |      0.104 |
|  3 | 0.727 | 0.781 | ★ DeepSeek-V4-Pro-0813         | DeepSeek                  | $1.31 |   103 | 1.0M |      0.285 |     0.382 |      0.114 |
|  4 | 0.702 | 0.764 | Gemini 3.7 Flash               | Google                    | $1.50 |   114 | 1.0M |      0.297 |     0.364 |      0.103 |
|  5 | 0.702 | 0.783 | ★ Muse Spark 1.1               | Meta                      | $2.00 |   124 | 1.0M |      0.308 |     0.372 |      0.103 |
|  6 | 0.697 | 0.756 | GLM-5.3                        | Zhipu AI                  | $1.43 |    77 | 1.0M |      0.250 |     0.388 |      0.118 |
|  7 | 0.697 | 0.712 | Mercury 2                      | Inception                 | $0.38 |   314 | 128k |      0.415 |     0.234 |      0.063 |
|  8 | 0.681 | 0.690 | ★ Qwen3.8 Flash                | Alibaba Cloud / Qwen Team | $0.23 |    58 | 1.0M |      0.215 |     0.370 |      0.106 |
|  9 | 0.674 | 0.683 | ★ GPT-6 Luna                   | OpenAI                    | $0.21 |    70 | 1.1M |      0.238 |     0.346 |      0.098 |
| 10 | 0.673 | 0.678 | ★ Laguna S 2.1                 | Poolside                  | $0.11 |    82 | 1.0M |      0.257 |     0.324 |      0.096 |

## @tiny — Background tasks (titles, memory): cheapest and fastest wins
eligible: 142 — λ 0.03333 $/quality-point

|  # | value |     q | model                        | org                       |   $/M | tok/s |  ctx | tput 58.3% | gen 41.7% |
| -: | ----: | ----: | ---------------------------- | ------------------------- | ----: | ----: | ---: | ---------: | --------: |
|  1 | 0.798 | 0.810 | ★ Mercury 2                  | Inception                 | $0.38 |   314 | 128k |      0.583 |     0.227 |
|  2 | 0.785 | 0.788 | ★ Ling 3.0 Flash Fin         | InclusionAI               | $0.07 |   147 | 262k |      0.461 |     0.327 |
|  3 | 0.739 | 0.754 | DeepSeek-V4-Flash-Vision-Exp | DeepSeek                  | $0.46 |   113 | 1.0M |      0.415 |     0.339 |
|  4 | 0.730 | 0.760 | Gemini 3.5 Flash-Lite        | Google                    | $0.89 |   186 | 1.0M |      0.501 |     0.259 |
|  5 | 0.726 | 0.769 | DeepSeek-V4-Pro-0813         | DeepSeek                  | $1.31 |   103 | 1.0M |      0.400 |     0.370 |
|  6 | 0.725 | 0.792 | Muse Spark 1.1               | Meta                      | $2.00 |   124 | 1.0M |      0.432 |     0.360 |
|  7 | 0.719 | 0.769 | Gemini 3.7 Flash             | Google                    | $1.50 |   114 | 1.0M |      0.417 |     0.352 |
|  8 | 0.717 | 0.730 | Qwen3-Next-80B-A3B-Thinking  | Alibaba Cloud / Qwen Team | $0.41 |   187 |    — |      0.502 |     0.228 |
|  9 | 0.712 | 0.731 | Gemini 3.1 Flash-Lite        | Google                    | $0.56 |   151 | 1.0M |      0.466 |     0.265 |
| 10 | 0.702 | 0.708 | Seed 2.0 Mini                | ByteDance                 | $0.17 |   145 | 256k |      0.459 |     0.249 |

## @task — Subagents: agentic + tool calling, moderate cost sensitivity
eligible: 142 — λ 0.00747 $/quality-point (thinking ×1.857)

|  # | value |     q | model                 | org                       |   $/M | tok/s |  ctx | ag 29.9% | tool 20.7% | code 18.4% | gen 25.3% | tput 5.7% |
| -: | ----: | ----: | --------------------- | ------------------------- | ----: | ----: | ---: | -------: | ---------: | ---------: | --------: | --------: |
|  1 | 0.755 | 0.759 | ★ DeepSeek-V4.1-Flash | DeepSeek                  | $0.58 |    72 | 1.0M |    0.223 |      0.133 |      0.145 |     0.225 |     0.033 |
|  2 | 0.732 | 0.751 | GLM-5.3               | Zhipu AI                  | $2.66 |    77 | 1.0M |    0.218 |      0.130 |      0.141 |     0.228 |     0.035 |
|  3 | 0.726 | 0.754 | Muse Spark 1.3        | Meta                      | $3.71 |    50 | 1.0M |    0.222 |      0.131 |      0.141 |     0.233 |     0.027 |
|  4 | 0.715 | 0.733 | DeepSeek-V4-Pro-0813  | DeepSeek                  | $2.44 |   103 | 1.0M |    0.210 |      0.123 |      0.136 |     0.224 |     0.039 |
|  5 | 0.715 | 0.723 | MiMo-V2.6-Pro         | Xiaomi                    | $1.01 |    31 | 1.0M |    0.214 |      0.128 |      0.140 |     0.221 |     0.019 |
|  6 | 0.700 | 0.702 | ★ GLM-5.3-Flash       | Zhipu AI                  | $0.35 |    44 | 1.0M |    0.210 |      0.126 |      0.122 |     0.219 |     0.025 |
|  7 | 0.698 | 0.702 | Qwen3.8 Flash         | Alibaba Cloud / Qwen Team | $0.43 |    58 | 1.0M |    0.202 |      0.126 |      0.126 |     0.217 |     0.030 |
|  8 | 0.693 | 0.711 | Hy4 preview           | Tencent                   | $2.32 |    38 |    — |    0.208 |      0.123 |      0.134 |     0.222 |     0.022 |
|  9 | 0.686 | 0.746 | Kimi K3               | Moonshot AI               | $8.03 |    48 | 1.0M |    0.217 |      0.131 |      0.142 |     0.229 |     0.026 |
| 10 | 0.686 | 0.713 | Muse Spark 1.1        | Meta                      | $3.71 |   124 | 1.0M |    0.201 |      0.127 |      0.124 |     0.219 |     0.043 |

## @advisor — Advisor/watchdog: deep reasoning over long context
eligible: 142 — λ 0.01250 $/quality-point (thinking ×1.857)

|  # | value |     q | model                  | org                       |   $/M | tok/s |  ctx | gen 74.3% | lc 12.6% | tput 13.1% |
| -: | ----: | ----: | ---------------------- | ------------------------- | ----: | ----: | ---: | --------: | -------: | ---------: |
|  1 | 0.782 | 0.829 | ★ Muse Spark 1.3       | Meta                      | $3.71 |    50 | 1.0M |     0.685 |    0.081 |      0.062 |
|  2 | 0.768 | 0.803 | ★ Gemini 3.7 Flash     | Google                    | $2.79 |   114 | 1.0M |     0.628 |    0.080 |      0.094 |
|  3 | 0.766 | 0.800 | Gemini 3.8 Flash       | Google                    | $2.79 |    77 | 1.0M |     0.646 |    0.075 |      0.079 |
|  4 | 0.764 | 0.770 | ★ Qwen3.8 Flash        | Alibaba Cloud / Qwen Team | $0.43 |    58 | 1.0M |     0.638 |    0.064 |      0.068 |
|  5 | 0.755 | 0.762 | DeepSeek-V4.1-Flash    | DeepSeek                  | $0.58 |    72 | 1.0M |     0.662 |    0.024 |      0.076 |
|  6 | 0.744 | 0.774 | ★ DeepSeek-V4-Pro-0813 | DeepSeek                  | $2.44 |   103 | 1.0M |     0.660 |    0.024 |      0.090 |
|  7 | 0.739 | 0.773 | GLM-5.3                | Zhipu AI                  | $2.66 |    77 | 1.0M |     0.669 |    0.024 |      0.079 |
|  8 | 0.737 | 0.766 | Hy4 preview            | Tencent                   | $2.32 |    38 |    — |     0.654 |    0.061 |      0.051 |
|  9 | 0.727 | 0.738 | GPT-5.6 Luna           | OpenAI                    | $0.88 |    66 | 1.1M |     0.601 |    0.065 |      0.073 |
| 10 | 0.722 | 0.726 | ★ GLM-5.3-Flash        | Zhipu AI                  | $0.35 |    44 | 1.0M |     0.645 |    0.024 |      0.057 |

## @designer — Design work: visual/UX judgement on image-capable models
eligible: 87 — λ 0.01024 $/quality-point (thinking ×1.857)

|  # | value |     q | model                 | org         |   $/M | tok/s |  ctx | gen 31.3% | code 7.2% | vis 21.7% | tput 18.1% | web 21.7% | agon |
| -: | ----: | ----: | --------------------- | ----------- | ----: | ----: | ---: | --------: | --------: | --------: | ---------: | --------: | ---: |
|  1 | 0.773 | 0.779 | ★ DeepSeek-V4.1-Flash | DeepSeek    | $0.58 |    72 | 1.0M |     0.279 |     0.057 |     0.137 |      0.105 |     0.202 |    — |
|  2 | 0.754 | 0.782 | ★ Gemini 3.7 Flash    | Google      | $2.79 |   114 | 1.0M |     0.265 |     0.048 |     0.142 |      0.129 |     0.198 | 1215 |
|  3 | 0.746 | 0.774 | Gemini 3.8 Flash      | Google      | $2.79 |    77 | 1.0M |     0.272 |     0.052 |     0.145 |      0.108 |     0.196 | 1231 |
|  4 | 0.733 | 0.772 | Muse Spark 1.3        | Meta        | $3.71 |    50 | 1.0M |     0.289 |     0.055 |     0.126 |      0.086 |     0.216 | 1289 |
|  5 | 0.731 | 0.769 | Muse Spark 1.1        | Meta        | $3.71 |   124 | 1.0M |     0.271 |     0.049 |     0.149 |      0.134 |     0.168 |    — |
|  6 | 0.723 | 0.752 | Gemini 3.6 Flash      | Google      | $2.79 |   115 | 1.0M |     0.246 |     0.043 |     0.140 |      0.130 |     0.193 | 1187 |
|  7 | 0.709 | 0.720 | MiMo-V2.6-Pro         | Xiaomi      | $1.01 |    31 | 1.0M |     0.274 |     0.055 |     0.128 |      0.060 |     0.203 |    — |
|  8 | 0.707 | 0.789 | ★ Kimi K3             | Moonshot AI | $8.03 |    48 | 1.0M |     0.284 |     0.056 |     0.152 |      0.083 |     0.214 | 1285 |
|  9 | 0.704 | 0.708 | ★ GLM-5.3-Flash       | Zhipu AI    | $0.35 |    44 | 1.0M |     0.272 |     0.048 |     0.139 |      0.078 |     0.171 |    — |
| 10 | 0.686 | 0.690 | GPT-6 Luna            | OpenAI      | $0.39 |    70 | 1.1M |     0.252 |     0.046 |     0.114 |      0.104 |     0.175 |    — |
focus: website — coverage 121/400 (30.3%) ok; dispersion 0.992 ok; composition ok; freshness 0.2mo ok; trust unknown; modality unknown; maintenance unknown; provenance unknown; cross-source unknown

# Suggested settings.modelRoles (best-fit #1 per role, resolved via the omp catalog).
# Selectors are openrouter/<id>; the omp-llm-role plugin writes this block daily.
modelRoles:
  default: "openrouter/deepseek/deepseek-v4.1-flash"
  smol: "openrouter/deepseek/deepseek-v4.1-flash"
  slow: "openrouter/deepseek/deepseek-v4.1-flash"
  vision: "openrouter/qwen/qwen3.8-flash"
  plan: "openrouter/meta/muse-spark-1.3"
  commit: "openrouter/deepseek/deepseek-v4.1-flash"
  tiny: "openrouter/inception/mercury-2"
  task: "openrouter/deepseek/deepseek-v4.1-flash"
  advisor: "openrouter/meta/muse-spark-1.3"
  designer: "openrouter/deepseek/deepseek-v4.1-flash"
