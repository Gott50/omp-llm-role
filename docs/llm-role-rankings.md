llm-stats.com best-fit ranking per omp model role — 408 models, 2026-10-18
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
Throughput + price: OpenRouter per-provider routes under the default price-based routing (weight 1/price² over stable standard-tier providers; p50 tok/s of routed traffic; $/M 3:1 in:out), throughput 149/408, priced 148; models without OpenRouter throughput or a billed route are not ranked.

## @default — Main workhorse: strong general coding-agent quality, sane cost
eligible: 140 — λ 0.00556 $/quality-point (thinking ×1.857)

|  # | value |     q | model                 | org         |   $/M | tok/s |  ctx | gen 54.7% | code 18.9% | ag 12.6% | tool 10.5% | tput 3.2% |
| -: | ----: | ----: | --------------------- | ----------- | ----: | ----: | ---: | --------: | ---------: | -------: | ---------: | --------: |
|  1 | 0.807 | 0.809 | ★ DeepSeek-V4.1-Flash | DeepSeek    | $0.45 |    76 | 1.0M |     0.483 |      0.146 |    0.093 |      0.069 |     0.019 |
|  2 | 0.798 | 0.840 | ★ Gemini 4 Argon      | Google      | $7.65 |    33 |    — |     0.516 |      0.149 |    0.096 |      0.068 |     0.011 |
|  3 | 0.794 | 0.807 | GLM-5.3               | Zhipu AI    | $2.30 |    85 | 1.0M |     0.488 |      0.142 |    0.090 |      0.067 |     0.020 |
|  4 | 0.790 | 0.810 | ★ Muse Spark 1.3      | Meta        | $3.71 |    73 | 1.0M |     0.495 |      0.139 |    0.091 |      0.067 |     0.019 |
|  5 | 0.780 | 0.792 | DeepSeek-V4-Pro-0813  | DeepSeek    | $2.20 |    71 | 1.0M |     0.484 |      0.139 |    0.088 |      0.063 |     0.018 |
|  6 | 0.776 | 0.782 | MiMo-V2.6-Pro         | Xiaomi      | $1.01 |    29 | 1.0M |     0.476 |      0.141 |    0.089 |      0.066 |     0.010 |
|  7 | 0.774 | 0.812 | ★ Kimi K3             | Moonshot AI | $6.83 |    58 | 1.0M |     0.494 |      0.144 |    0.091 |      0.067 |     0.016 |
|  8 | 0.766 | 0.768 | ★ GLM-5.3-Flash       | Zhipu AI    | $0.36 |    89 | 1.0M |     0.473 |      0.123 |    0.087 |      0.065 |     0.020 |
|  9 | 0.766 | 0.809 | GPT-6.1 Sol           | OpenAI      | $7.84 |    40 | 1.1M |     0.506 |      0.141 |    0.092 |      0.057 |     0.013 |
| 10 | 0.764 | 0.776 | Hy4 preview           | Tencent     | $2.32 |    35 |    — |     0.478 |      0.137 |    0.087 |      0.063 |     0.012 |

## @smol — Fast lightweight model: cheap and quick, still competent
eligible: 140 — λ 0.04091 $/quality-point

|  # | value |     q | model                        | org         |   $/M | tok/s |  ctx | tput 40% | gen 28.6% | code 17.1% | tool 14.3% |
| -: | ----: | ----: | ---------------------------- | ----------- | ----: | ----: | ---: | -------: | --------: | ---------: | ---------: |
|  1 | 0.706 | 0.716 | ★ DeepSeek-V4.1-Flash        | DeepSeek    | $0.24 |    76 | 1.0M |    0.238 |     0.252 |      0.132 |      0.094 |
|  2 | 0.695 | 0.703 | ★ GLM-5.3-Flash              | Zhipu AI    | $0.19 |    89 | 1.0M |    0.257 |     0.247 |      0.112 |      0.088 |
|  3 | 0.676 | 0.726 | ★ GLM-5.3                    | Zhipu AI    | $1.24 |    85 | 1.0M |    0.252 |     0.255 |      0.129 |      0.091 |
|  4 | 0.669 | 0.751 | ★ Muse Spark 1.1             | Meta        | $2.00 |   134 | 1.0M |    0.305 |     0.245 |      0.113 |      0.087 |
|  5 | 0.666 | 0.683 | DeepSeek-V4-Flash-Vision-Exp | DeepSeek    | $0.43 |    93 | 1.0M |    0.263 |     0.231 |      0.115 |      0.075 |
|  6 | 0.657 | 0.676 | GPT-5.6 Luna                 | OpenAI      | $0.47 |    87 | 1.1M |    0.254 |     0.229 |      0.117 |      0.076 |
|  7 | 0.653 | 0.716 | Gemini 3.8 Flash             | Google      | $1.54 |   103 | 1.0M |    0.274 |     0.247 |      0.119 |      0.076 |
|  8 | 0.653 | 0.723 | GLM-5.2                      | Zhipu AI    | $1.71 |   134 | 1.0M |    0.305 |     0.232 |      0.115 |      0.071 |
|  9 | 0.650 | 0.651 | ★ Ling 3.0 Flash             | InclusionAI | $0.03 |   118 | 131k |    0.290 |     0.200 |      0.096 |      0.065 |
| 10 | 0.647 | 0.662 | Mercury 2                    | Inception   | $0.38 |   308 | 128k |    0.400 |     0.155 |      0.069 |      0.038 |

## @slow — Most capable model for hard problems; cost and speed as tiebreakers
eligible: 140 — λ 0.00263 $/quality-point (thinking ×2.714)

|  # | value |     q | model                 | org         |   $/M | tok/s |  ctx | gen 63.2% | code 18.9% | ag 13.7% | tput 4.2% |
| -: | ----: | ----: | --------------------- | ----------- | ----: | ----: | ---: | --------: | ---------: | -------: | --------: |
|  1 | 0.834 | 0.863 | ★ Gemini 4 Argon      | Google      | $11.2 |    33 |    — |     0.595 |      0.149 |    0.104 |     0.015 |
|  2 | 0.827 | 0.829 | ★ DeepSeek-V4.1-Flash | DeepSeek    | $0.65 |    76 | 1.0M |     0.558 |      0.146 |    0.100 |     0.025 |
|  3 | 0.821 | 0.830 | ★ GLM-5.3             | Zhipu AI    | $3.36 |    85 | 1.0M |     0.563 |      0.142 |    0.098 |     0.027 |
|  4 | 0.819 | 0.833 | ★ Muse Spark 1.3      | Meta        | $5.43 |    73 | 1.0M |     0.572 |      0.139 |    0.099 |     0.025 |
|  5 | 0.812 | 0.842 | GPT-6.1 Sol           | OpenAI      | $11.5 |    40 | 1.1M |     0.584 |      0.141 |    0.100 |     0.017 |
|  6 | 0.809 | 0.817 | DeepSeek-V4-Pro-0813  | DeepSeek    | $3.22 |    71 | 1.0M |     0.559 |      0.139 |    0.095 |     0.024 |
|  7 | 0.808 | 0.834 | ★ Kimi K3             | Moonshot AI | $9.98 |    58 | 1.0M |     0.570 |      0.144 |    0.098 |     0.022 |
|  8 | 0.796 | 0.800 | MiMo-V2.6-Pro         | Xiaomi      | $1.47 |    29 | 1.0M |     0.549 |      0.141 |    0.097 |     0.013 |
|  9 | 0.793 | 0.853 | GPT-5.6 Sol           | OpenAI      | $22.9 |    57 | 1.1M |     0.580 |      0.150 |    0.101 |     0.022 |
| 10 | 0.789 | 0.798 | Hy4 preview           | Tencent     | $3.39 |    35 |    — |     0.552 |      0.137 |    0.094 |     0.016 |

## @vision — Image understanding: vision index dominates
eligible: 73 — λ 0.00682 $/quality-point (thinking ×1.857)

|  # | value |     q | model                 | org                       |   $/M | tok/s |  ctx | vis 54.2% | gen 20.8% | rea 15.6% | code 6.3% | tput 3.1% |
| -: | ----: | ----: | --------------------- | ------------------------- | ----: | ----: | ---: | --------: | --------: | --------: | --------: | --------: |
|  1 | 0.732 | 0.784 | ★ Gemini 4 Argon      | Google                    | $7.65 |    33 |    — |     0.385 |     0.196 |     0.143 |     0.049 |     0.011 |
|  2 | 0.727 | 0.730 | ★ DeepSeek-V4.1-Flash | DeepSeek                  | $0.45 |    76 | 1.0M |     0.345 |     0.184 |     0.134 |     0.048 |     0.019 |
|  3 | 0.727 | 0.729 | ★ Qwen3.8 Flash       | Alibaba Cloud / Qwen Team | $0.43 |    41 | 1.0M |     0.363 |     0.178 |     0.133 |     0.042 |     0.013 |
|  4 | 0.725 | 0.750 | ★ Muse Spark 1.1      | Meta                      | $3.71 |   134 | 1.0M |     0.371 |     0.179 |     0.136 |     0.041 |     0.024 |
|  5 | 0.723 | 0.769 | ★ Kimi K3             | Moonshot AI               | $6.83 |    58 | 1.0M |     0.378 |     0.188 |     0.139 |     0.048 |     0.016 |
|  6 | 0.716 | 0.718 | ★ GLM-5.3-Flash       | Zhipu AI                  | $0.36 |    89 | 1.0M |     0.344 |     0.180 |     0.133 |     0.041 |     0.020 |
|  7 | 0.715 | 0.769 | GPT-6.1 Sol           | OpenAI                    | $7.84 |    40 | 1.1M |     0.377 |     0.193 |     0.140 |     0.047 |     0.013 |
|  8 | 0.715 | 0.735 | ★ Gemini 3.8 Flash    | Google                    | $2.87 |   103 | 1.0M |     0.361 |     0.180 |     0.129 |     0.043 |     0.021 |
|  9 | 0.702 | 0.707 | Qwen3.8-27B           | Alibaba Cloud / Qwen Team | $0.72 |    57 | 262k |     0.358 |     0.168 |     0.126 |     0.039 |     0.016 |
| 10 | 0.698 | 0.717 | Gemini 3.7 Flash      | Google                    | $2.87 |    89 | 1.0M |     0.353 |     0.176 |     0.127 |     0.041 |     0.020 |

## @plan — Planning: reasoning and long-context coherence, priced so the cheapest capable planner wins
eligible: 140 — λ 0.01667 $/quality-point (thinking ×1.857)

|  # | value |     q | model               | org                       |   $/M | tok/s |  ctx | gen 80% | lc 15.6% | tput 4.4% |
| -: | ----: | ----: | ------------------- | ------------------------- | ----: | ----: | ---: | ------: | -------: | --------: |
|  1 | 0.789 | 0.851 | ★ Muse Spark 1.3    | Meta                      | $3.71 |    73 | 1.0M |   0.724 |    0.101 |     0.026 |
|  2 | 0.772 | 0.779 | ★ Qwen3.8 Flash     | Alibaba Cloud / Qwen Team | $0.43 |    41 | 1.0M |   0.682 |    0.079 |     0.018 |
|  3 | 0.766 | 0.814 | ★ Gemini 3.8 Flash  | Google                    | $2.87 |   103 | 1.0M |   0.692 |    0.091 |     0.030 |
|  4 | 0.756 | 0.763 | DeepSeek-V4.1-Flash | DeepSeek                  | $0.45 |    76 | 1.0M |   0.707 |    0.030 |     0.026 |
|  5 | 0.755 | 0.803 | Gemini 3.7 Flash    | Google                    | $2.87 |    89 | 1.0M |   0.676 |    0.098 |     0.029 |
|  6 | 0.751 | 0.790 | ★ Hy4 preview       | Tencent                   | $2.32 |    35 |    — |   0.699 |    0.075 |     0.016 |
|  7 | 0.744 | 0.750 | ★ GLM-5.3-Flash     | Zhipu AI                  | $0.36 |    89 | 1.0M |   0.691 |    0.030 |     0.029 |
|  8 | 0.740 | 0.868 | ★ Gemini 4 Argon    | Google                    | $7.65 |    33 |    — |   0.754 |    0.098 |     0.015 |
|  9 | 0.736 | 0.751 | GPT-5.6 Luna        | OpenAI                    | $0.88 |    87 | 1.1M |   0.642 |    0.080 |     0.028 |
| 10 | 0.733 | 0.772 | GLM-5.3             | Zhipu AI                  | $2.30 |    85 | 1.0M |   0.713 |    0.030 |     0.028 |

## @commit — Commit messages: cheap and fast with decent general quality
eligible: 140 — λ 0.04091 $/quality-point

|  # | value |     q | model                        | org         |   $/M | tok/s |  ctx | tput 41.5% | gen 43.1% | code 15.4% |
| -: | ----: | ----: | ---------------------------- | ----------- | ----: | ----: | ---: | ---------: | --------: | ---------: |
|  1 | 0.736 | 0.746 | ★ DeepSeek-V4.1-Flash        | DeepSeek    | $0.24 |    76 | 1.0M |      0.247 |     0.380 |      0.118 |
|  2 | 0.731 | 0.739 | ★ GLM-5.3-Flash              | Zhipu AI    | $0.19 |    89 | 1.0M |      0.267 |     0.372 |      0.100 |
|  3 | 0.711 | 0.761 | ★ GLM-5.3                    | Zhipu AI    | $1.24 |    85 | 1.0M |      0.262 |     0.384 |      0.115 |
|  4 | 0.707 | 0.724 | DeepSeek-V4-Flash-Vision-Exp | DeepSeek    | $0.43 |    93 | 1.0M |      0.273 |     0.348 |      0.103 |
|  5 | 0.706 | 0.788 | ★ Muse Spark 1.1             | Meta        | $2.00 |   134 | 1.0M |      0.317 |     0.370 |      0.101 |
|  6 | 0.701 | 0.764 | ★ Gemini 3.8 Flash           | Google      | $1.54 |   103 | 1.0M |      0.285 |     0.373 |      0.106 |
|  7 | 0.700 | 0.770 | ★ GLM-5.2                    | Zhipu AI    | $1.71 |   134 | 1.0M |      0.317 |     0.349 |      0.104 |
|  8 | 0.696 | 0.712 | Mercury 2                    | Inception   | $0.38 |   308 | 128k |      0.415 |     0.234 |      0.062 |
|  9 | 0.695 | 0.714 | GPT-5.6 Luna                 | OpenAI      | $0.47 |    87 | 1.1M |      0.264 |     0.346 |      0.105 |
| 10 | 0.688 | 0.689 | ★ Ling 3.0 Flash             | InclusionAI | $0.03 |   118 | 131k |      0.301 |     0.302 |      0.086 |

## @tiny — Background tasks (titles, memory): cheapest and fastest wins
eligible: 140 — λ 0.03333 $/quality-point

|  # | value |     q | model                 | org         |   $/M | tok/s |  ctx | tput 58.3% | gen 41.7% |
| -: | ----: | ----: | --------------------- | ----------- | ----: | ----: | ---: | ---------: | --------: |
|  1 | 0.797 | 0.810 | ★ Mercury 2           | Inception   | $0.38 |   308 | 128k |      0.583 |     0.227 |
|  2 | 0.772 | 0.791 | Gemini 3.1 Flash-Lite | Google      | $0.56 |   215 | 1.0M |      0.526 |     0.265 |
|  3 | 0.754 | 0.783 | Gemini 3.5 Flash-Lite | Google      | $0.89 |   214 | 1.0M |      0.525 |     0.258 |
|  4 | 0.736 | 0.803 | Muse Spark 1.1        | Meta        | $2.00 |   134 | 1.0M |      0.445 |     0.358 |
|  5 | 0.729 | 0.732 | ★ Laguna XS 2.1       | Poolside    | $0.07 |   186 | 262k |      0.501 |     0.231 |
|  6 | 0.728 | 0.734 | ★ GLM-5.3-Flash       | Zhipu AI    | $0.19 |    89 | 1.0M |      0.375 |     0.360 |
|  7 | 0.726 | 0.783 | GLM-5.2               | Zhipu AI    | $1.71 |   134 | 1.0M |      0.445 |     0.338 |
|  8 | 0.718 | 0.770 | Gemini 3.6 Flash      | Google      | $1.54 |   134 | 1.0M |      0.444 |     0.325 |
|  9 | 0.714 | 0.715 | ★ Ling 3.0 Flash      | InclusionAI | $0.03 |   118 | 131k |      0.423 |     0.292 |
| 10 | 0.709 | 0.760 | Gemini 3.8 Flash      | Google      | $1.54 |   103 | 1.0M |      0.400 |     0.361 |

## @task — Subagents: agentic + tool calling, moderate cost sensitivity
eligible: 140 — λ 0.00747 $/quality-point (thinking ×1.857)

|  # | value |     q | model                 | org                       |   $/M | tok/s |  ctx | ag 29.9% | tool 20.7% | code 18.4% | gen 25.3% | tput 5.7% |
| -: | ----: | ----: | --------------------- | ------------------------- | ----: | ----: | ---: | -------: | ---------: | ---------: | --------: | --------: |
|  1 | 0.750 | 0.753 | ★ DeepSeek-V4.1-Flash | DeepSeek                  | $0.45 |    76 | 1.0M |    0.219 |      0.136 |      0.141 |     0.223 |     0.034 |
|  2 | 0.727 | 0.745 | GLM-5.3               | Zhipu AI                  | $2.30 |    85 | 1.0M |    0.213 |      0.131 |      0.138 |     0.225 |     0.036 |
|  3 | 0.716 | 0.744 | Muse Spark 1.3        | Meta                      | $3.71 |    73 | 1.0M |    0.215 |      0.132 |      0.134 |     0.229 |     0.034 |
|  4 | 0.707 | 0.715 | MiMo-V2.6-Pro         | Xiaomi                    | $1.01 |    29 | 1.0M |    0.211 |      0.129 |      0.137 |     0.220 |     0.018 |
|  5 | 0.707 | 0.724 | DeepSeek-V4-Pro-0813  | DeepSeek                  | $2.20 |    71 | 1.0M |    0.208 |      0.124 |      0.135 |     0.224 |     0.033 |
|  6 | 0.707 | 0.764 | ★ Gemini 4 Argon      | Google                    | $7.65 |    33 |    — |    0.228 |      0.134 |      0.145 |     0.238 |     0.020 |
|  7 | 0.705 | 0.708 | ★ GLM-5.3-Flash       | Zhipu AI                  | $0.36 |    89 | 1.0M |    0.206 |      0.127 |      0.120 |     0.218 |     0.037 |
|  8 | 0.694 | 0.745 | Kimi K3               | Moonshot AI               | $6.83 |    58 | 1.0M |    0.215 |      0.132 |      0.140 |     0.228 |     0.030 |
|  9 | 0.687 | 0.704 | Hy4 preview           | Tencent                   | $2.32 |    35 |    — |    0.205 |      0.124 |      0.133 |     0.221 |     0.021 |
| 10 | 0.685 | 0.688 | Qwen3.8 Flash         | Alibaba Cloud / Qwen Team | $0.43 |    41 | 1.0M |    0.198 |      0.127 |      0.124 |     0.216 |     0.024 |

## @advisor — Advisor/watchdog: deep reasoning over long context
eligible: 140 — λ 0.01250 $/quality-point (thinking ×1.857)

|  # | value |     q | model                 | org                       |   $/M | tok/s |  ctx | gen 74.3% | lc 12.6% | tput 13.1% |
| -: | ----: | ----: | --------------------- | ------------------------- | ----: | ----: | ---: | --------: | -------: | ---------: |
|  1 | 0.785 | 0.831 | ★ Muse Spark 1.3      | Meta                      | $3.71 |    73 | 1.0M |     0.673 |    0.082 |      0.077 |
|  2 | 0.771 | 0.806 | ★ Gemini 3.8 Flash    | Google                    | $2.87 |   103 | 1.0M |     0.643 |    0.073 |      0.090 |
|  3 | 0.756 | 0.792 | Gemini 3.7 Flash      | Google                    | $2.87 |    89 | 1.0M |     0.628 |    0.079 |      0.084 |
|  4 | 0.754 | 0.759 | ★ DeepSeek-V4.1-Flash | DeepSeek                  | $0.45 |    76 | 1.0M |     0.657 |    0.024 |      0.078 |
|  5 | 0.746 | 0.750 | ★ GLM-5.3-Flash       | Zhipu AI                  | $0.36 |    89 | 1.0M |     0.642 |    0.024 |      0.084 |
|  6 | 0.746 | 0.751 | ★ Qwen3.8 Flash       | Alibaba Cloud / Qwen Team | $0.43 |    41 | 1.0M |     0.634 |    0.063 |      0.054 |
|  7 | 0.741 | 0.770 | ★ GLM-5.3             | Zhipu AI                  | $2.30 |    85 | 1.0M |     0.663 |    0.024 |      0.083 |
|  8 | 0.734 | 0.745 | GPT-5.6 Luna          | OpenAI                    | $0.88 |    87 | 1.1M |     0.597 |    0.065 |      0.083 |
|  9 | 0.730 | 0.757 | DeepSeek-V4-Pro-0813  | DeepSeek                  | $2.20 |    71 | 1.0M |     0.658 |    0.024 |      0.075 |
| 10 | 0.730 | 0.825 | Gemini 4 Argon        | Google                    | $7.65 |    33 |    — |     0.700 |    0.079 |      0.045 |

## @designer — Design work: visual/UX judgement on image-capable models
eligible: 87 — λ 0.01024 $/quality-point (thinking ×1.857)

|  # | value |     q | model                 | org         |   $/M | tok/s |  ctx | gen 31.3% | code 7.2% | vis 21.7% | tput 18.1% | web 21.7% | agon |
| -: | ----: | ----: | --------------------- | ----------- | ----: | ----: | ---: | --------: | --------: | --------: | ---------: | --------: | ---: |
|  1 | 0.772 | 0.777 | ★ DeepSeek-V4.1-Flash | DeepSeek    | $0.45 |    76 | 1.0M |     0.277 |     0.056 |     0.138 |      0.108 |     0.199 |    — |
|  2 | 0.749 | 0.778 | ★ Gemini 3.8 Flash    | Google      | $2.87 |   103 | 1.0M |     0.271 |     0.050 |     0.144 |      0.124 |     0.189 | 1235 |
|  3 | 0.744 | 0.782 | ★ Muse Spark 1.3      | Meta        | $3.71 |    73 | 1.0M |     0.283 |     0.053 |     0.125 |      0.106 |     0.214 | 1293 |
|  4 | 0.734 | 0.738 | ★ GLM-5.3-Flash       | Zhipu AI    | $0.36 |    89 | 1.0M |     0.270 |     0.047 |     0.138 |      0.116 |     0.166 |    — |
|  5 | 0.732 | 0.761 | Gemini 3.7 Flash      | Google      | $2.87 |    89 | 1.0M |     0.265 |     0.047 |     0.141 |      0.116 |     0.192 | 1219 |
|  6 | 0.728 | 0.766 | Muse Spark 1.1        | Meta        | $3.71 |   134 | 1.0M |     0.269 |     0.048 |     0.148 |      0.138 |     0.163 |    — |
|  7 | 0.726 | 0.755 | Gemini 3.6 Flash      | Google      | $2.87 |   134 | 1.0M |     0.244 |     0.042 |     0.140 |      0.138 |     0.190 | 1193 |
|  8 | 0.723 | 0.793 | ★ Kimi K3             | Moonshot AI | $6.83 |    58 | 1.0M |     0.283 |     0.055 |     0.152 |      0.093 |     0.211 | 1289 |
|  9 | 0.695 | 0.705 | MiMo-V2.6-Pro         | Xiaomi      | $1.01 |    29 | 1.0M |     0.272 |     0.054 |     0.127 |      0.057 |     0.194 |    — |
| 10 | 0.694 | 0.774 | GPT-6.1 Sol           | OpenAI      | $7.84 |    40 | 1.1M |     0.290 |     0.054 |     0.151 |      0.074 |     0.206 |    — |
focus: website — coverage 127/408 (31.1%) ok; dispersion 0.992 ok; composition ok; freshness 0.0mo ok; trust unknown; modality unknown; maintenance unknown; provenance unknown; cross-source unknown

# Suggested settings.modelRoles (best-fit #1 per role, resolved via the omp catalog).
# Selectors are openrouter/<id>; the omp-llm-role plugin writes this block daily.
modelRoles:
  default: "openrouter/deepseek/deepseek-v4.1-flash"
  smol: "openrouter/deepseek/deepseek-v4.1-flash"
  slow: "openrouter/google/gemini-4-argon"
  vision: "openrouter/google/gemini-4-argon"
  plan: "openrouter/meta/muse-spark-1.3"
  commit: "openrouter/deepseek/deepseek-v4.1-flash"
  tiny: "openrouter/inception/mercury-2"
  task: "openrouter/deepseek/deepseek-v4.1-flash"
  advisor: "openrouter/meta/muse-spark-1.3"
  designer: "openrouter/deepseek/deepseek-v4.1-flash"
