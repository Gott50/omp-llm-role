llm-stats.com best-fit ranking per omp model role — 416 models, 2026-10-20
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
Throughput + price: OpenRouter per-provider routes under the default price-based routing (weight 1/price² over stable standard-tier providers; p50 tok/s of routed traffic; $/M 3:1 in:out), throughput 151/416, priced 149; models without OpenRouter throughput or a billed route are not ranked.

## @default — Main workhorse: strong general coding-agent quality, sane cost
eligible: 142 — λ 0.00556 $/quality-point (thinking ×1.857)

|  # | value |     q | model                      | org         |   $/M | tok/s |  ctx | gen 54.7% | code 18.9% | ag 12.6% | tool 10.5% | tput 3.2% |
| -: | ----: | ----: | -------------------------- | ----------- | ----: | ----: | ---: | --------: | ---------: | -------: | ---------: | --------: |
|  1 | 0.804 | 0.805 | ★ DeepSeek-V4.1-Flash-1017 | DeepSeek    | $0.31 |    85 | 1.0M |     0.486 |      0.140 |    0.092 |      0.067 |     0.020 |
|  2 | 0.798 | 0.841 | ★ Gemini 4 Argon           | Google      | $7.76 |    53 | 1.0M |     0.513 |      0.148 |    0.096 |      0.068 |     0.016 |
|  3 | 0.797 | 0.798 | ★ DeepSeek-V4.1-Flash      | DeepSeek    | $0.25 |    70 | 1.0M |     0.477 |      0.143 |    0.092 |      0.068 |     0.018 |
|  4 | 0.782 | 0.791 | GLM-5.3                    | Zhipu AI    | $1.68 |    32 | 1.0M |     0.484 |      0.140 |    0.090 |      0.066 |     0.011 |
|  5 | 0.781 | 0.802 | Muse Spark 1.3             | Meta        | $3.71 |    61 | 1.0M |     0.492 |      0.136 |    0.090 |      0.067 |     0.017 |
|  6 | 0.771 | 0.788 | DeepSeek-V4-Pro-0813       | DeepSeek    | $3.09 |    78 | 1.0M |     0.481 |      0.138 |    0.087 |      0.063 |     0.019 |
|  7 | 0.769 | 0.807 | ★ Kimi K3                  | Moonshot AI | $6.73 |    55 | 1.0M |     0.491 |      0.142 |    0.090 |      0.067 |     0.016 |
|  8 | 0.767 | 0.772 | MiMo-V2.6-Pro              | Xiaomi      | $0.90 |    28 | 1.0M |     0.470 |      0.139 |    0.089 |      0.065 |     0.010 |
|  9 | 0.762 | 0.775 | Hy4 preview                | Tencent     | $2.32 |    42 |    — |     0.476 |      0.135 |    0.087 |      0.064 |     0.013 |
| 10 | 0.758 | 0.760 | GLM-5.3-Flash              | Zhipu AI    | $0.34 |    68 | 1.0M |     0.470 |      0.122 |    0.086 |      0.064 |     0.018 |

## @smol — Fast lightweight model: cheap and quick, still competent
eligible: 142 — λ 0.04091 $/quality-point

|  # | value |     q | model                        | org         |   $/M | tok/s |  ctx | tput 40% | gen 28.6% | code 17.1% | tool 14.3% |
| -: | ----: | ----: | ---------------------------- | ----------- | ----: | ----: | ---: | -------: | --------: | ---------: | ---------: |
|  1 | 0.760 | 0.842 | ★ Muse Spark 1.1             | Meta        | $2.00 |   310 | 1.0M |    0.400 |     0.244 |      0.111 |      0.087 |
|  2 | 0.716 | 0.723 | ★ DeepSeek-V4.1-Flash-1017   | DeepSeek    | $0.17 |    85 | 1.0M |    0.252 |     0.254 |      0.127 |      0.091 |
|  3 | 0.694 | 0.699 | ★ DeepSeek-V4.1-Flash        | DeepSeek    | $0.13 |    70 | 1.0M |    0.228 |     0.249 |      0.129 |      0.092 |
|  4 | 0.664 | 0.667 | ★ MiMo-V2.6-Flash            | Xiaomi      | $0.07 |    76 | 1.0M |    0.239 |     0.231 |      0.115 |      0.082 |
|  5 | 0.663 | 0.681 | DeepSeek-V4-Flash-Vision-Exp | DeepSeek    | $0.43 |    94 | 1.0M |    0.264 |     0.229 |      0.113 |      0.075 |
|  6 | 0.660 | 0.668 | GLM-5.3-Flash                | Zhipu AI    | $0.19 |    68 | 1.0M |    0.225 |     0.245 |      0.110 |      0.088 |
|  7 | 0.656 | 0.737 | Muse Spark 1.2               | Meta        | $2.00 |   235 | 1.0M |    0.371 |     0.203 |      0.100 |      0.064 |
|  8 | 0.655 | 0.727 | ★ GLM-5.2                    | Zhipu AI    | $1.76 |   140 | 1.0M |    0.310 |     0.231 |      0.114 |      0.072 |
|  9 | 0.654 | 0.656 | ★ Ling 3.0 Flash             | InclusionAI | $0.04 |   123 | 131k |    0.295 |     0.200 |      0.095 |      0.065 |
| 10 | 0.653 | 0.672 | GPT-5.6 Luna                 | OpenAI      | $0.47 |    85 | 1.1M |    0.251 |     0.229 |      0.115 |      0.077 |

## @slow — Most capable model for hard problems; cost and speed as tiebreakers
eligible: 142 — λ 0.00263 $/quality-point (thinking ×2.714)

|  # | value |     q | model                      | org         |   $/M | tok/s |  ctx | gen 63.2% | code 18.9% | ag 13.7% | tput 4.2% |
| -: | ----: | ----: | -------------------------- | ----------- | ----: | ----: | ---: | --------: | ---------: | -------: | --------: |
|  1 | 0.835 | 0.865 | ★ Gemini 4 Argon           | Google      | $11.3 |    53 | 1.0M |     0.592 |      0.148 |    0.104 |     0.021 |
|  2 | 0.826 | 0.828 | ★ DeepSeek-V4.1-Flash-1017 | DeepSeek    | $0.46 |    85 | 1.0M |     0.561 |      0.140 |    0.100 |     0.026 |
|  3 | 0.816 | 0.817 | ★ DeepSeek-V4.1-Flash      | DeepSeek    | $0.36 |    70 | 1.0M |     0.551 |      0.143 |    0.099 |     0.024 |
|  4 | 0.810 | 0.824 | Muse Spark 1.3             | Meta        | $5.43 |    61 | 1.0M |     0.568 |      0.136 |    0.098 |     0.022 |
|  5 | 0.804 | 0.811 | GLM-5.3                    | Zhipu AI    | $2.45 |    32 | 1.0M |     0.559 |      0.140 |    0.097 |     0.014 |
|  6 | 0.802 | 0.833 | GPT-6.1 Sol                | OpenAI      | $11.5 |    33 | 1.1M |     0.580 |      0.138 |    0.099 |     0.015 |
|  7 | 0.802 | 0.828 | ★ Kimi K3                  | Moonshot AI | $9.84 |    55 | 1.0M |     0.567 |      0.142 |    0.098 |     0.021 |
|  8 | 0.800 | 0.812 | DeepSeek-V4-Pro-0813       | DeepSeek    | $4.51 |    78 | 1.0M |     0.555 |      0.138 |    0.095 |     0.025 |
|  9 | 0.788 | 0.849 | GPT-5.6 Sol                | OpenAI      | $22.9 |    58 | 1.1M |     0.578 |      0.148 |    0.101 |     0.022 |
| 10 | 0.787 | 0.790 | MiMo-V2.6-Pro              | Xiaomi      | $1.32 |    28 | 1.0M |     0.543 |      0.139 |    0.096 |     0.013 |

## @vision — Image understanding: vision index dominates
eligible: 76 — λ 0.00682 $/quality-point (thinking ×1.857)

|  # | value |     q | model                      | org                       |   $/M | tok/s |  ctx | vis 54.2% | gen 20.8% | rea 15.6% | code 6.3% | tput 3.1% |
| -: | ----: | ----: | -------------------------- | ------------------------- | ----: | ----: | ---: | --------: | --------: | --------: | --------: | --------: |
|  1 | 0.736 | 0.739 | ★ DeepSeek-V4.1-Flash-1017 | DeepSeek                  | $0.31 |    85 | 1.0M |     0.354 |     0.185 |     0.134 |     0.046 |     0.020 |
|  2 | 0.736 | 0.789 | ★ Gemini 4 Argon           | Google                    | $7.76 |    53 | 1.0M |     0.387 |     0.195 |     0.143 |     0.049 |     0.015 |
|  3 | 0.730 | 0.755 | ★ Muse Spark 1.1           | Meta                      | $3.71 |   310 | 1.0M |     0.371 |     0.178 |     0.135 |     0.041 |     0.031 |
|  4 | 0.728 | 0.731 | Qwen3.8 Flash              | Alibaba Cloud / Qwen Team | $0.43 |    45 | 1.0M |     0.365 |     0.177 |     0.134 |     0.042 |     0.014 |
|  5 | 0.722 | 0.768 | ★ Kimi K3                  | Moonshot AI               | $6.73 |    55 | 1.0M |     0.379 |     0.187 |     0.139 |     0.047 |     0.016 |
|  6 | 0.719 | 0.721 | ★ DeepSeek-V4.1-Flash      | DeepSeek                  | $0.25 |    70 | 1.0M |     0.342 |     0.182 |     0.132 |     0.047 |     0.018 |
|  7 | 0.712 | 0.765 | GPT-6.1 Sol                | OpenAI                    | $7.84 |    33 | 1.1M |     0.378 |     0.191 |     0.140 |     0.046 |     0.011 |
|  8 | 0.711 | 0.713 | GLM-5.3-Flash              | Zhipu AI                  | $0.34 |    68 | 1.0M |     0.344 |     0.179 |     0.132 |     0.040 |     0.018 |
|  9 | 0.710 | 0.730 | Gemini 3.8 Flash           | Google                    | $2.87 |    73 | 1.0M |     0.361 |     0.179 |     0.130 |     0.042 |     0.018 |
| 10 | 0.702 | 0.707 | Qwen3.8-27B                | Alibaba Cloud / Qwen Team | $0.75 |    55 | 262k |     0.359 |     0.168 |     0.125 |     0.039 |     0.016 |

## @plan — Planning: reasoning and long-context coherence, priced so the cheapest capable planner wins
eligible: 142 — λ 0.01667 $/quality-point (thinking ×1.857)

|  # | value |     q | model                      | org                       |   $/M | tok/s |  ctx | gen 80% | lc 15.6% | tput 4.4% |
| -: | ----: | ----: | -------------------------- | ------------------------- | ----: | ----: | ---: | ------: | -------: | --------: |
|  1 | 0.782 | 0.844 | ★ Muse Spark 1.3           | Meta                      | $3.71 |    61 | 1.0M |   0.719 |    0.101 |     0.024 |
|  2 | 0.771 | 0.778 | ★ Qwen3.8 Flash            | Alibaba Cloud / Qwen Team | $0.43 |    45 | 1.0M |   0.680 |    0.079 |     0.020 |
|  3 | 0.763 | 0.769 | ★ DeepSeek-V4.1-Flash-1017 | DeepSeek                  | $0.31 |    85 | 1.0M |   0.710 |    0.030 |     0.028 |
|  4 | 0.758 | 0.805 | ★ Gemini 3.8 Flash         | Google                    | $2.87 |    73 | 1.0M |   0.688 |    0.091 |     0.026 |
|  5 | 0.753 | 0.801 | Gemini 3.7 Flash           | Google                    | $2.91 |    85 | 1.0M |   0.675 |    0.098 |     0.028 |
|  6 | 0.750 | 0.788 | ★ Hy4 preview              | Tencent                   | $2.32 |    42 |    — |   0.696 |    0.074 |     0.019 |
|  7 | 0.749 | 0.753 | ★ DeepSeek-V4.1-Flash      | DeepSeek                  | $0.25 |    70 | 1.0M |   0.698 |    0.030 |     0.025 |
|  8 | 0.741 | 0.870 | ★ Gemini 4 Argon           | Google                    | $7.76 |    53 | 1.0M |   0.750 |    0.098 |     0.022 |
|  9 | 0.736 | 0.742 | GLM-5.3-Flash              | Zhipu AI                  | $0.34 |    68 | 1.0M |   0.686 |    0.030 |     0.025 |
| 10 | 0.734 | 0.749 | GPT-5.6 Luna               | OpenAI                    | $0.88 |    85 | 1.1M |   0.641 |    0.080 |     0.028 |

## @commit — Commit messages: cheap and fast with decent general quality
eligible: 142 — λ 0.04091 $/quality-point

|  # | value |     q | model                        | org         |   $/M | tok/s |  ctx | tput 41.5% | gen 43.1% | code 15.4% |
| -: | ----: | ----: | ---------------------------- | ----------- | ----: | ----: | ---: | ---------: | --------: | ---------: |
|  1 | 0.801 | 0.882 | ★ Muse Spark 1.1             | Meta        | $2.00 |   310 | 1.0M |      0.415 |     0.367 |      0.100 |
|  2 | 0.751 | 0.757 | ★ DeepSeek-V4.1-Flash-1017   | DeepSeek    | $0.17 |    85 | 1.0M |      0.261 |     0.382 |      0.114 |
|  3 | 0.723 | 0.729 | ★ DeepSeek-V4.1-Flash        | DeepSeek    | $0.13 |    70 | 1.0M |      0.237 |     0.376 |      0.116 |
|  4 | 0.703 | 0.721 | DeepSeek-V4-Flash-Vision-Exp | DeepSeek    | $0.43 |    94 | 1.0M |      0.274 |     0.345 |      0.101 |
|  5 | 0.701 | 0.773 | ★ GLM-5.2                    | Zhipu AI    | $1.76 |   140 | 1.0M |      0.322 |     0.349 |      0.102 |
|  6 | 0.699 | 0.781 | Muse Spark 1.2               | Meta        | $2.00 |   235 | 1.0M |      0.386 |     0.306 |      0.089 |
|  7 | 0.697 | 0.699 | ★ MiMo-V2.6-Flash            | Xiaomi      | $0.07 |    76 | 1.0M |      0.248 |     0.348 |      0.103 |
|  8 | 0.694 | 0.702 | GLM-5.3-Flash                | Zhipu AI    | $0.19 |    68 | 1.0M |      0.234 |     0.370 |      0.099 |
|  9 | 0.694 | 0.699 | Laguna S 2.1                 | Poolside    | $0.11 |   103 | 1.0M |      0.285 |     0.320 |      0.094 |
| 10 | 0.692 | 0.694 | ★ Ling 3.0 Flash             | InclusionAI | $0.04 |   123 | 131k |      0.306 |     0.302 |      0.086 |

## @tiny — Background tasks (titles, memory): cheapest and fastest wins
eligible: 142 — λ 0.03333 $/quality-point

|  # | value |     q | model                        | org         |   $/M | tok/s |  ctx | tput 58.3% | gen 41.7% |
| -: | ----: | ----: | ---------------------------- | ----------- | ----: | ----: | ---: | ---------: | --------: |
|  1 | 0.872 | 0.939 | ★ Muse Spark 1.1             | Meta        | $2.00 |   310 | 1.0M |      0.583 |     0.355 |
|  2 | 0.781 | 0.794 | ★ Mercury 2                  | Inception   | $0.38 |   274 | 128k |      0.568 |     0.226 |
|  3 | 0.776 | 0.795 | ★ Gemini 3.1 Flash-Lite      | Google      | $0.56 |   221 | 1.0M |      0.531 |     0.264 |
|  4 | 0.770 | 0.837 | Muse Spark 1.2               | Meta        | $2.00 |   235 | 1.0M |      0.541 |     0.296 |
|  5 | 0.731 | 0.737 | ★ DeepSeek-V4.1-Flash-1017   | DeepSeek    | $0.17 |    85 | 1.0M |      0.367 |     0.370 |
|  6 | 0.731 | 0.790 | GLM-5.2                      | Zhipu AI    | $1.76 |   140 | 1.0M |      0.452 |     0.337 |
|  7 | 0.721 | 0.722 | ★ Ling 3.0 Flash             | InclusionAI | $0.04 |   123 | 131k |      0.430 |     0.292 |
|  8 | 0.706 | 0.710 | Laguna S 2.1                 | Poolside    | $0.11 |   103 | 1.0M |      0.400 |     0.310 |
|  9 | 0.704 | 0.719 | DeepSeek-V4-Flash-Vision-Exp | DeepSeek    | $0.43 |    94 | 1.0M |      0.385 |     0.333 |
| 10 | 0.702 | 0.704 | Laguna XS 2.1                | Poolside    | $0.07 |   159 | 262k |      0.474 |     0.230 |

## @task — Subagents: agentic + tool calling, moderate cost sensitivity
eligible: 142 — λ 0.00747 $/quality-point (thinking ×1.857)

|  # | value |     q | model                      | org         |   $/M | tok/s |  ctx | ag 29.9% | tool 20.7% | code 18.4% | gen 25.3% | tput 5.7% |
| -: | ----: | ----: | -------------------------- | ----------- | ----: | ----: | ---: | -------: | ---------: | ---------: | --------: | --------: |
|  1 | 0.745 | 0.747 | ★ DeepSeek-V4.1-Flash-1017 | DeepSeek    | $0.31 |    85 | 1.0M |    0.219 |      0.132 |      0.136 |     0.225 |     0.036 |
|  2 | 0.741 | 0.743 | ★ DeepSeek-V4.1-Flash      | DeepSeek    | $0.25 |    70 | 1.0M |    0.217 |      0.134 |      0.139 |     0.221 |     0.033 |
|  3 | 0.713 | 0.771 | ★ Gemini 4 Argon           | Google      | $7.76 |    53 | 1.0M |    0.228 |      0.134 |      0.143 |     0.237 |     0.028 |
|  4 | 0.710 | 0.722 | GLM-5.3                    | Zhipu AI    | $1.68 |    32 | 1.0M |    0.212 |      0.130 |      0.136 |     0.224 |     0.020 |
|  5 | 0.707 | 0.735 | Muse Spark 1.3             | Meta        | $3.71 |    61 | 1.0M |    0.214 |      0.131 |      0.132 |     0.227 |     0.031 |
|  6 | 0.700 | 0.707 | MiMo-V2.6-Pro              | Xiaomi      | $0.90 |    28 | 1.0M |    0.210 |      0.128 |      0.135 |     0.217 |     0.017 |
|  7 | 0.698 | 0.721 | DeepSeek-V4-Pro-0813       | DeepSeek    | $3.09 |    78 | 1.0M |    0.206 |      0.124 |      0.134 |     0.222 |     0.035 |
|  8 | 0.696 | 0.698 | GLM-5.3-Flash              | Zhipu AI    | $0.34 |    68 | 1.0M |    0.204 |      0.127 |      0.118 |     0.217 |     0.032 |
|  9 | 0.689 | 0.739 | Kimi K3                    | Moonshot AI | $6.73 |    55 | 1.0M |    0.214 |      0.132 |      0.138 |     0.227 |     0.029 |
| 10 | 0.688 | 0.706 | Hy4 preview                | Tencent     | $2.32 |    42 |    — |    0.205 |      0.126 |      0.131 |     0.220 |     0.024 |

## @advisor — Advisor/watchdog: deep reasoning over long context
eligible: 142 — λ 0.01250 $/quality-point (thinking ×1.857)

|  # | value |     q | model                      | org                       |   $/M | tok/s |  ctx | gen 74.3% | lc 12.6% | tput 13.1% |
| -: | ----: | ----: | -------------------------- | ------------------------- | ----: | ----: | ---: | --------: | -------: | ---------: |
|  1 | 0.773 | 0.820 | ★ Muse Spark 1.3           | Meta                      | $3.71 |    61 | 1.0M |     0.668 |    0.082 |      0.070 |
|  2 | 0.763 | 0.767 | ★ DeepSeek-V4.1-Flash-1017 | DeepSeek                  | $0.31 |    85 | 1.0M |     0.660 |    0.024 |      0.082 |
|  3 | 0.754 | 0.790 | ★ Gemini 3.8 Flash         | Google                    | $2.87 |    73 | 1.0M |     0.640 |    0.073 |      0.077 |
|  4 | 0.752 | 0.789 | Gemini 3.7 Flash           | Google                    | $2.91 |    85 | 1.0M |     0.627 |    0.079 |      0.082 |
|  5 | 0.748 | 0.753 | Qwen3.8 Flash              | Alibaba Cloud / Qwen Team | $0.43 |    45 | 1.0M |     0.632 |    0.063 |      0.058 |
|  6 | 0.745 | 0.748 | ★ DeepSeek-V4.1-Flash      | DeepSeek                  | $0.25 |    70 | 1.0M |     0.648 |    0.024 |      0.075 |
|  7 | 0.743 | 0.840 | ★ Gemini 4 Argon           | Google                    | $7.76 |    53 | 1.0M |     0.697 |    0.079 |      0.064 |
|  8 | 0.743 | 0.790 | Muse Spark 1.1             | Meta                      | $3.71 |   310 | 1.0M |     0.634 |    0.024 |      0.131 |
|  9 | 0.732 | 0.761 | Hy4 preview                | Tencent                   | $2.32 |    42 |    — |     0.646 |    0.060 |      0.055 |
| 10 | 0.732 | 0.743 | GPT-5.6 Luna               | OpenAI                    | $0.88 |    85 | 1.1M |     0.596 |    0.065 |      0.082 |

## @designer — Design work: visual/UX judgement on image-capable models
eligible: 89 — λ 0.01024 $/quality-point (thinking ×1.857)

|  # | value |     q | model                      | org         |   $/M | tok/s |  ctx | gen 31.3% | code 7.2% | vis 21.7% | tput 18.1% | web 21.7% | agon |
| -: | ----: | ----: | -------------------------- | ----------- | ----: | ----: | ---: | --------: | --------: | --------: | ---------: | --------: | ---: |
|  1 | 0.776 | 0.779 | ★ DeepSeek-V4.1-Flash-1017 | DeepSeek    | $0.31 |    85 | 1.0M |     0.278 |     0.053 |     0.142 |      0.114 |     0.192 |    — |
|  2 | 0.766 | 0.804 | ★ Muse Spark 1.1           | Meta        | $3.71 |   310 | 1.0M |     0.267 |     0.047 |     0.148 |      0.181 |     0.161 |    — |
|  3 | 0.731 | 0.769 | Muse Spark 1.3             | Meta        | $3.71 |    61 | 1.0M |     0.282 |     0.052 |     0.126 |      0.096 |     0.213 | 1296 |
|  4 | 0.725 | 0.755 | Gemini 3.7 Flash           | Google      | $2.91 |    85 | 1.0M |     0.264 |     0.046 |     0.141 |      0.114 |     0.189 | 1221 |
|  5 | 0.725 | 0.754 | Gemini 3.8 Flash           | Google      | $2.87 |    73 | 1.0M |     0.270 |     0.049 |     0.144 |      0.106 |     0.186 | 1237 |
|  6 | 0.719 | 0.787 | Kimi K3                    | Moonshot AI | $6.73 |    55 | 1.0M |     0.281 |     0.054 |     0.152 |      0.091 |     0.209 | 1294 |
|  7 | 0.717 | 0.720 | GLM-5.3-Flash              | Zhipu AI    | $0.34 |    68 | 1.0M |     0.269 |     0.046 |     0.138 |      0.102 |     0.166 |    — |
|  8 | 0.717 | 0.796 | Gemini 4 Argon             | Google      | $7.76 |    53 | 1.0M |     0.294 |     0.056 |     0.155 |      0.089 |     0.203 |    — |
|  9 | 0.710 | 0.740 | Gemini 3.6 Flash           | Google      | $2.87 |   103 | 1.0M |     0.244 |     0.042 |     0.142 |      0.124 |     0.187 | 1196 |
| 10 | 0.704 | 0.742 | Muse Spark Open            | Meta        | $3.71 |    70 | 1.0M |     0.254 |     0.048 |     0.139 |      0.103 |     0.198 |    — |
focus: website — coverage 129/416 (31.0%) ok; dispersion 0.992 ok; composition ok; freshness 0.1mo ok; trust unknown; modality unknown; maintenance unknown; provenance unknown; cross-source unknown

# Suggested settings.modelRoles (best-fit #1 per role, resolved via the omp catalog).
# Selectors are openrouter/<id>; the omp-llm-role plugin writes this block daily.
modelRoles:
  default: "openrouter/deepseek/deepseek-v4.1-flash-1017"
  smol: "openrouter/meta/muse-spark-1.1"
  slow: "openrouter/google/gemini-4-argon"
  vision: "openrouter/deepseek/deepseek-v4.1-flash-1017"
  plan: "openrouter/meta/muse-spark-1.3"
  commit: "openrouter/meta/muse-spark-1.1"
  tiny: "openrouter/meta/muse-spark-1.1"
  task: "openrouter/deepseek/deepseek-v4.1-flash-1017"
  advisor: "openrouter/meta/muse-spark-1.3"
  designer: "openrouter/deepseek/deepseek-v4.1-flash-1017"
