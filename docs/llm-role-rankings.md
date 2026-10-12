llm-stats.com best-fit ranking per omp model role — 408 models, 2026-10-12
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
Throughput + price: OpenRouter per-provider routes under the default price-based routing (weight 1/price² over stable standard-tier providers; p50 tok/s of routed traffic; $/M 3:1 in:out), throughput 150/408, priced 148; models without OpenRouter throughput or a billed route are not ranked.

## @default — Main workhorse: strong general coding-agent quality, sane cost
eligible: 140 — λ 0.00556 $/quality-point (thinking ×1.857)

|  # | value |     q | model                 | org         |   $/M | tok/s |  ctx | gen 54.7% | code 18.9% | ag 12.6% | tool 10.5% | tput 3.2% |
| -: | ----: | ----: | --------------------- | ----------- | ----: | ----: | ---: | --------: | ---------: | -------: | ---------: | --------: |
|  1 | 0.809 | 0.811 | ★ DeepSeek-V4.1-Flash | DeepSeek    | $0.43 |    81 | 1.0M |     0.484 |      0.147 |    0.093 |      0.068 |     0.020 |
|  2 | 0.797 | 0.809 | GLM-5.3               | Zhipu AI    | $2.24 |    93 | 1.0M |     0.489 |      0.143 |    0.091 |      0.066 |     0.021 |
|  3 | 0.796 | 0.817 | ★ Muse Spark 1.3      | Meta        | $3.71 |    76 | 1.0M |     0.498 |      0.143 |    0.092 |      0.065 |     0.019 |
|  4 | 0.778 | 0.784 | MiMo-V2.6-Pro         | Xiaomi      | $1.01 |    28 | 1.0M |     0.478 |      0.142 |    0.090 |      0.065 |     0.010 |
|  5 | 0.776 | 0.790 | DeepSeek-V4-Pro-0813  | DeepSeek    | $2.49 |    69 | 1.0M |     0.483 |      0.139 |    0.088 |      0.062 |     0.018 |
|  6 | 0.766 | 0.829 | ★ GPT-5.6 Sol         | OpenAI      | $11.4 |    68 | 1.1M |     0.503 |      0.151 |    0.094 |      0.064 |     0.018 |
|  7 | 0.765 | 0.809 | GPT-6.1 Sol           | OpenAI      | $7.96 |    35 | 1.1M |     0.506 |      0.143 |    0.093 |      0.056 |     0.012 |
|  8 | 0.762 | 0.764 | ★ GLM-5.3-Flash       | Zhipu AI    | $0.36 |    65 | 1.0M |     0.472 |      0.124 |    0.087 |      0.064 |     0.017 |
|  9 | 0.761 | 0.774 | Hy4 preview           | Tencent     | $2.32 |    32 |    — |     0.477 |      0.137 |    0.087 |      0.062 |     0.011 |
| 10 | 0.759 | 0.808 | Kimi K3               | Moonshot AI | $8.92 |    42 | 1.0M |     0.493 |      0.145 |    0.091 |      0.066 |     0.013 |

## @smol — Fast lightweight model: cheap and quick, still competent
eligible: 140 — λ 0.04091 $/quality-point

|  # | value |     q | model                        | org                       |   $/M | tok/s |  ctx | tput 40% | gen 28.6% | code 17.1% | tool 14.3% |
| -: | ----: | ----: | ---------------------------- | ------------------------- | ----: | ----: | ---: | -------: | --------: | ---------: | ---------: |
|  1 | 0.715 | 0.724 | ★ DeepSeek-V4.1-Flash        | DeepSeek                  | $0.23 |    81 | 1.0M |    0.247 |     0.253 |      0.133 |      0.092 |
|  2 | 0.691 | 0.692 | ★ Ling 3.0 Flash             | InclusionAI               | $0.04 |   169 | 131k |    0.332 |     0.200 |      0.095 |      0.064 |
|  3 | 0.687 | 0.736 | ★ GLM-5.3                    | Zhipu AI                  | $1.20 |    93 | 1.0M |    0.262 |     0.255 |      0.130 |      0.090 |
|  4 | 0.672 | 0.690 | DeepSeek-V4-Flash-Vision-Exp | DeepSeek                  | $0.43 |   100 | 1.0M |    0.270 |     0.231 |      0.115 |      0.074 |
|  5 | 0.658 | 0.666 | GLM-5.3-Flash                | Zhipu AI                  | $0.19 |    65 | 1.0M |    0.221 |     0.246 |      0.113 |      0.086 |
|  6 | 0.650 | 0.676 | Inkling-Small                | Thinking Machines Lab     | $0.64 |   123 | 524k |    0.295 |     0.207 |      0.104 |      0.070 |
|  7 | 0.650 | 0.674 | Qwen3.8-27B                  | Alibaba Cloud / Qwen Team | $0.60 |    95 | 262k |    0.265 |     0.231 |      0.108 |      0.071 |
|  8 | 0.648 | 0.667 | GPT-5.6 Luna                 | OpenAI                    | $0.47 |    80 | 1.1M |    0.245 |     0.229 |      0.117 |      0.076 |
|  9 | 0.634 | 0.716 | Muse Spark 1.3               | Meta                      | $2.00 |    76 | 1.0M |    0.239 |     0.260 |      0.129 |      0.089 |
| 10 | 0.634 | 0.689 | DeepSeek-V4-Pro-0813         | DeepSeek                  | $1.34 |    69 | 1.0M |    0.227 |     0.252 |      0.126 |      0.085 |

## @slow — Most capable model for hard problems; cost and speed as tiebreakers
eligible: 140 — λ 0.00263 $/quality-point (thinking ×2.714)

|  # | value |     q | model                 | org         |   $/M | tok/s |  ctx | gen 63.2% | code 18.9% | ag 13.7% | tput 4.2% |
| -: | ----: | ----: | --------------------- | ----------- | ----: | ----: | ---: | --------: | ---------: | -------: | --------: |
|  1 | 0.830 | 0.832 | ★ DeepSeek-V4.1-Flash | DeepSeek    | $0.63 |    81 | 1.0M |     0.558 |      0.147 |    0.101 |     0.026 |
|  2 | 0.828 | 0.842 | ★ Muse Spark 1.3      | Meta        | $5.43 |    76 | 1.0M |     0.575 |      0.143 |    0.099 |     0.025 |
|  3 | 0.824 | 0.833 | ★ GLM-5.3             | Zhipu AI    | $3.27 |    93 | 1.0M |     0.564 |      0.143 |    0.098 |     0.028 |
|  4 | 0.812 | 0.856 | ★ GPT-5.6 Sol         | OpenAI      | $16.6 |    68 | 1.1M |     0.580 |      0.151 |    0.101 |     0.024 |
|  5 | 0.812 | 0.843 | ★ GPT-6.1 Sol         | OpenAI      | $11.6 |    35 | 1.1M |     0.584 |      0.143 |    0.100 |     0.015 |
|  6 | 0.805 | 0.815 | DeepSeek-V4-Pro-0813  | DeepSeek    | $3.64 |    69 | 1.0M |     0.557 |      0.139 |    0.095 |     0.024 |
|  7 | 0.799 | 0.803 | MiMo-V2.6-Pro         | Xiaomi      | $1.47 |    28 | 1.0M |     0.551 |      0.142 |    0.097 |     0.013 |
|  8 | 0.796 | 0.830 | Kimi K3               | Moonshot AI |   $13 |    42 | 1.0M |     0.569 |      0.145 |    0.098 |     0.018 |
|  9 | 0.787 | 0.796 | Hy4 preview           | Tencent     | $3.39 |    32 |    — |     0.551 |      0.137 |    0.094 |     0.014 |
| 10 | 0.785 | 0.786 | ★ GLM-5.3-Flash       | Zhipu AI    | $0.53 |    65 | 1.0M |     0.544 |      0.124 |    0.094 |     0.023 |

## @vision — Image understanding: vision index dominates
eligible: 72 — λ 0.00682 $/quality-point (thinking ×1.857)

|  # | value |     q | model                 | org                       |   $/M | tok/s |  ctx | vis 54.2% | gen 20.8% | rea 15.6% | code 6.3% | tput 3.1% |
| -: | ----: | ----: | --------------------- | ------------------------- | ----: | ----: | ---: | --------: | --------: | --------: | --------: | --------: |
|  1 | 0.728 | 0.731 | ★ DeepSeek-V4.1-Flash | DeepSeek                  | $0.43 |    81 | 1.0M |     0.346 |     0.184 |     0.133 |     0.048 |     0.019 |
|  2 | 0.728 | 0.731 | ★ Qwen3.8 Flash       | Alibaba Cloud / Qwen Team | $0.43 |    47 | 1.0M |     0.363 |     0.178 |     0.133 |     0.042 |     0.014 |
|  3 | 0.717 | 0.772 | ★ GPT-6.1 Sol         | OpenAI                    | $7.96 |    35 | 1.1M |     0.380 |     0.192 |     0.140 |     0.047 |     0.011 |
|  4 | 0.715 | 0.741 | ★ Muse Spark 1.1      | Meta                      | $3.71 |    48 | 1.0M |     0.371 |     0.179 |     0.135 |     0.041 |     0.014 |
|  5 | 0.712 | 0.715 | ★ GLM-5.3-Flash       | Zhipu AI                  | $0.36 |    65 | 1.0M |     0.344 |     0.179 |     0.132 |     0.041 |     0.017 |
|  6 | 0.711 | 0.730 | Gemini 3.8 Flash      | Google                    | $2.79 |    74 | 1.0M |     0.361 |     0.179 |     0.128 |     0.044 |     0.018 |
|  7 | 0.705 | 0.766 | Kimi K3               | Moonshot AI               | $8.92 |    42 | 1.0M |     0.379 |     0.188 |     0.139 |     0.048 |     0.013 |
|  8 | 0.705 | 0.712 | Qwen3.8-27B           | Alibaba Cloud / Qwen Team | $1.11 |    95 | 262k |     0.358 |     0.168 |     0.126 |     0.039 |     0.021 |
|  9 | 0.695 | 0.714 | Gemini 3.7 Flash      | Google                    | $2.79 |    80 | 1.0M |     0.353 |     0.174 |     0.127 |     0.041 |     0.019 |
| 10 | 0.692 | 0.770 | GPT-5.6 Sol           | OpenAI                    | $11.4 |    68 | 1.1M |     0.369 |     0.191 |     0.142 |     0.050 |     0.018 |

## @plan — Planning: reasoning and long-context coherence, priced so the cheapest capable planner wins
eligible: 140 — λ 0.01667 $/quality-point (thinking ×1.857)

|  # | value |     q | model               | org                       |   $/M | tok/s |  ctx | gen 80% | lc 15.6% | tput 4.4% |
| -: | ----: | ----: | ------------------- | ------------------------- | ----: | ----: | ---: | ------: | -------: | --------: |
|  1 | 0.794 | 0.856 | ★ Muse Spark 1.3    | Meta                      | $3.71 |    76 | 1.0M |   0.728 |    0.101 |     0.026 |
|  2 | 0.775 | 0.782 | ★ Qwen3.8 Flash     | Alibaba Cloud / Qwen Team | $0.43 |    47 | 1.0M |   0.683 |    0.079 |     0.020 |
|  3 | 0.758 | 0.765 | DeepSeek-V4.1-Flash | DeepSeek                  | $0.43 |    81 | 1.0M |   0.707 |    0.030 |     0.027 |
|  4 | 0.758 | 0.804 | ★ Gemini 3.8 Flash  | Google                    | $2.79 |    74 | 1.0M |   0.687 |    0.091 |     0.026 |
|  5 | 0.749 | 0.788 | ★ Hy4 preview       | Tencent                   | $2.32 |    32 |    — |   0.698 |    0.075 |     0.015 |
|  6 | 0.747 | 0.794 | Gemini 3.7 Flash    | Google                    | $2.79 |    80 | 1.0M |   0.669 |    0.098 |     0.027 |
|  7 | 0.738 | 0.744 | ★ GLM-5.3-Flash     | Zhipu AI                  | $0.36 |    65 | 1.0M |   0.689 |    0.030 |     0.025 |
|  8 | 0.737 | 0.774 | GLM-5.3             | Zhipu AI                  | $2.24 |    93 | 1.0M |   0.715 |    0.030 |     0.029 |
|  9 | 0.735 | 0.750 | GPT-5.6 Luna        | OpenAI                    | $0.88 |    80 | 1.1M |   0.642 |    0.080 |     0.027 |
| 10 | 0.725 | 0.742 | MiMo-V2.6-Pro       | Xiaomi                    | $1.01 |    28 | 1.0M |   0.698 |    0.030 |     0.014 |

## @commit — Commit messages: cheap and fast with decent general quality
eligible: 140 — λ 0.04091 $/quality-point

|  # | value |     q | model                        | org                       |   $/M | tok/s |  ctx | tput 41.5% | gen 43.1% | code 15.4% |
| -: | ----: | ----: | ---------------------------- | ------------------------- | ----: | ----: | ---: | ---------: | --------: | ---------: |
|  1 | 0.747 | 0.756 | ★ DeepSeek-V4.1-Flash        | DeepSeek                  | $0.23 |    81 | 1.0M |      0.256 |     0.381 |      0.119 |
|  2 | 0.731 | 0.733 | ★ Ling 3.0 Flash             | InclusionAI               | $0.04 |   169 | 131k |      0.345 |     0.302 |      0.086 |
|  3 | 0.724 | 0.773 | ★ GLM-5.3                    | Zhipu AI                  | $1.20 |    93 | 1.0M |      0.272 |     0.385 |      0.116 |
|  4 | 0.715 | 0.732 | DeepSeek-V4-Flash-Vision-Exp | DeepSeek                  | $0.43 |   100 | 1.0M |      0.281 |     0.348 |      0.103 |
|  5 | 0.695 | 0.719 | Qwen3.8-27B                  | Alibaba Cloud / Qwen Team | $0.60 |    95 | 262k |      0.275 |     0.348 |      0.097 |
|  6 | 0.694 | 0.702 | GLM-5.3-Flash                | Zhipu AI                  | $0.19 |    65 | 1.0M |      0.229 |     0.371 |      0.101 |
|  7 | 0.687 | 0.713 | Inkling-Small                | Thinking Machines Lab     | $0.64 |   123 | 524k |      0.307 |     0.313 |      0.093 |
|  8 | 0.686 | 0.706 | GPT-5.6 Luna                 | OpenAI                    | $0.47 |    80 | 1.1M |      0.254 |     0.346 |      0.105 |
|  9 | 0.678 | 0.693 | Mercury 2                    | Inception                 | $0.38 |   258 | 128k |      0.397 |     0.234 |      0.062 |
| 10 | 0.676 | 0.747 | GLM-5.2                      | Zhipu AI                  | $1.72 |   111 | 1.0M |      0.294 |     0.349 |      0.103 |

## @tiny — Background tasks (titles, memory): cheapest and fastest wins
eligible: 140 — λ 0.03333 $/quality-point

|  # | value |     q | model                        | org         |   $/M | tok/s |  ctx | tput 58.3% | gen 41.7% |
| -: | ----: | ----: | ---------------------------- | ----------- | ----: | ----: | ---: | ---------: | --------: |
|  1 | 0.775 | 0.777 | ★ Ling 3.0 Flash             | InclusionAI | $0.04 |   169 | 131k |      0.485 |     0.292 |
|  2 | 0.771 | 0.784 | ★ Mercury 2                  | Inception   | $0.38 |   258 | 128k |      0.557 |     0.226 |
|  3 | 0.766 | 0.768 | Ling 3.0 Flash Fin           | InclusionAI | $0.06 |   132 | 262k |      0.443 |     0.325 |
|  4 | 0.730 | 0.759 | Gemini 3.5 Flash-Lite        | Google      | $0.89 |   187 | 1.0M |      0.502 |     0.258 |
|  5 | 0.728 | 0.746 | Gemini 3.1 Flash-Lite        | Google      | $0.56 |   166 | 1.0M |      0.482 |     0.264 |
|  6 | 0.720 | 0.728 | DeepSeek-V4.1-Flash          | DeepSeek    | $0.23 |    81 | 1.0M |      0.360 |     0.368 |
|  7 | 0.718 | 0.720 | Laguna XS 2.1                | Poolside    | $0.07 |   174 | 262k |      0.490 |     0.231 |
|  8 | 0.717 | 0.731 | DeepSeek-V4-Flash-Vision-Exp | DeepSeek    | $0.43 |   100 | 1.0M |      0.394 |     0.337 |
|  9 | 0.714 | 0.754 | GLM-5.3                      | Zhipu AI    | $1.20 |    93 | 1.0M |      0.382 |     0.372 |
| 10 | 0.713 | 0.716 | Nemotron 3 Nano (30B A3B)    | NVIDIA      | $0.09 |   187 | 262k |      0.502 |     0.213 |

## @task — Subagents: agentic + tool calling, moderate cost sensitivity
eligible: 140 — λ 0.00747 $/quality-point (thinking ×1.857)

|  # | value |     q | model                 | org                       |   $/M | tok/s |  ctx | ag 29.9% | tool 20.7% | code 18.4% | gen 25.3% | tput 5.7% |
| -: | ----: | ----: | --------------------- | ------------------------- | ----: | ----: | ---: | -------: | ---------: | ---------: | --------: | --------: |
|  1 | 0.752 | 0.755 | ★ DeepSeek-V4.1-Flash | DeepSeek                  | $0.43 |    81 | 1.0M |    0.220 |      0.134 |      0.142 |     0.224 |     0.035 |
|  2 | 0.730 | 0.746 | GLM-5.3               | Zhipu AI                  | $2.24 |    93 | 1.0M |    0.214 |      0.130 |      0.139 |     0.226 |     0.038 |
|  3 | 0.721 | 0.748 | Muse Spark 1.3        | Meta                      | $3.71 |    76 | 1.0M |    0.217 |      0.128 |      0.139 |     0.230 |     0.034 |
|  4 | 0.709 | 0.716 | MiMo-V2.6-Pro         | Xiaomi                    | $1.01 |    28 | 1.0M |    0.212 |      0.128 |      0.138 |     0.221 |     0.018 |
|  5 | 0.701 | 0.720 | DeepSeek-V4-Pro-0813  | DeepSeek                  | $2.49 |    69 | 1.0M |    0.207 |      0.122 |      0.135 |     0.223 |     0.033 |
|  6 | 0.698 | 0.701 | ★ GLM-5.3-Flash       | Zhipu AI                  | $0.36 |    65 | 1.0M |    0.206 |      0.125 |      0.121 |     0.218 |     0.032 |
|  7 | 0.688 | 0.692 | Qwen3.8 Flash         | Alibaba Cloud / Qwen Team | $0.43 |    47 | 1.0M |    0.199 |      0.127 |      0.124 |     0.216 |     0.026 |
|  8 | 0.683 | 0.700 | Hy4 preview           | Tencent                   | $2.32 |    32 |    — |    0.205 |      0.123 |      0.133 |     0.221 |     0.019 |
|  9 | 0.674 | 0.759 | ★ GPT-5.6 Sol         | OpenAI                    | $11.4 |    68 | 1.1M |    0.222 |      0.126 |      0.146 |     0.232 |     0.032 |
| 10 | 0.671 | 0.738 | Kimi K3               | Moonshot AI               | $8.92 |    42 | 1.0M |    0.215 |      0.131 |      0.141 |     0.228 |     0.024 |

## @advisor — Advisor/watchdog: deep reasoning over long context
eligible: 140 — λ 0.01250 $/quality-point (thinking ×1.857)

|  # | value |     q | model                 | org                       |   $/M | tok/s |  ctx | gen 74.3% | lc 12.6% | tput 13.1% |
| -: | ----: | ----: | --------------------- | ------------------------- | ----: | ----: | ---: | --------: | -------: | ---------: |
|  1 | 0.790 | 0.837 | ★ Muse Spark 1.3      | Meta                      | $3.71 |    76 | 1.0M |     0.677 |    0.082 |      0.078 |
|  2 | 0.757 | 0.763 | ★ DeepSeek-V4.1-Flash | DeepSeek                  | $0.43 |    81 | 1.0M |     0.657 |    0.024 |      0.081 |
|  3 | 0.754 | 0.789 | ★ Gemini 3.8 Flash    | Google                    | $2.79 |    74 | 1.0M |     0.638 |    0.073 |      0.077 |
|  4 | 0.752 | 0.758 | ★ Qwen3.8 Flash       | Alibaba Cloud / Qwen Team | $0.43 |    47 | 1.0M |     0.635 |    0.063 |      0.060 |
|  5 | 0.746 | 0.774 | ★ GLM-5.3             | Zhipu AI                  | $2.24 |    93 | 1.0M |     0.664 |    0.024 |      0.086 |
|  6 | 0.746 | 0.780 | Gemini 3.7 Flash      | Google                    | $2.79 |    80 | 1.0M |     0.621 |    0.079 |      0.080 |
|  7 | 0.733 | 0.737 | ★ GLM-5.3-Flash       | Zhipu AI                  | $0.36 |    65 | 1.0M |     0.640 |    0.024 |      0.072 |
|  8 | 0.731 | 0.742 | GPT-5.6 Luna          | OpenAI                    | $0.88 |    80 | 1.1M |     0.597 |    0.065 |      0.080 |
|  9 | 0.724 | 0.753 | Hy4 preview           | Tencent                   | $2.32 |    32 |    — |     0.649 |    0.060 |      0.044 |
| 10 | 0.723 | 0.755 | DeepSeek-V4-Pro-0813  | DeepSeek                  | $2.49 |    69 | 1.0M |     0.656 |    0.024 |      0.074 |

## @designer — Design work: visual/UX judgement on image-capable models
eligible: 86 — λ 0.01024 $/quality-point (thinking ×1.857)

|  # | value |     q | model                 | org         |   $/M | tok/s |  ctx | gen 31.3% | code 7.2% | vis 21.7% | tput 18.1% | web 21.7% | agon |
| -: | ----: | ----: | --------------------- | ----------- | ----: | ----: | ---: | --------: | --------: | --------: | ---------: | --------: | ---: |
|  1 | 0.781 | 0.785 | ★ DeepSeek-V4.1-Flash | DeepSeek    | $0.43 |    81 | 1.0M |     0.277 |     0.056 |     0.139 |      0.111 |     0.202 |    — |
|  2 | 0.751 | 0.789 | ★ Muse Spark 1.3      | Meta        | $3.71 |    76 | 1.0M |     0.285 |     0.054 |     0.125 |      0.108 |     0.216 | 1289 |
|  3 | 0.735 | 0.763 | Gemini 3.8 Flash      | Google      | $2.79 |    74 | 1.0M |     0.269 |     0.051 |     0.144 |      0.106 |     0.193 | 1231 |
|  4 | 0.727 | 0.756 | Gemini 3.7 Flash      | Google      | $2.79 |    80 | 1.0M |     0.262 |     0.048 |     0.141 |      0.110 |     0.195 | 1215 |
|  5 | 0.721 | 0.724 | ★ GLM-5.3-Flash       | Zhipu AI    | $0.36 |    65 | 1.0M |     0.270 |     0.047 |     0.138 |      0.100 |     0.169 |    — |
|  6 | 0.713 | 0.742 | Gemini 3.6 Flash      | Google      | $2.79 |   101 | 1.0M |     0.245 |     0.042 |     0.140 |      0.123 |     0.192 | 1188 |
|  7 | 0.697 | 0.707 | MiMo-V2.6-Pro         | Xiaomi      | $1.01 |    28 | 1.0M |     0.273 |     0.054 |     0.127 |      0.055 |     0.197 |    — |
|  8 | 0.688 | 0.770 | GPT-6.1 Sol           | OpenAI      | $7.96 |    35 | 1.1M |     0.289 |     0.055 |     0.152 |      0.066 |     0.207 |    — |
|  9 | 0.688 | 0.779 | Kimi K3               | Moonshot AI | $8.92 |    42 | 1.0M |     0.282 |     0.055 |     0.152 |      0.076 |     0.214 | 1285 |
| 10 | 0.678 | 0.795 | ★ GPT-5.6 Sol         | OpenAI      | $11.4 |    68 | 1.1M |     0.288 |     0.058 |     0.148 |      0.102 |     0.200 | 1184 |
focus: website — coverage 125/408 (30.6%) ok; dispersion 0.992 ok; composition ok; freshness 0.0mo ok; trust unknown; modality unknown; maintenance unknown; provenance unknown; cross-source unknown

# Suggested settings.modelRoles (best-fit #1 per role, resolved via the omp catalog).
# Selectors are openrouter/<id>; the omp-llm-role plugin writes this block daily.
modelRoles:
  default: "openrouter/deepseek/deepseek-v4.1-flash"
  smol: "openrouter/deepseek/deepseek-v4.1-flash"
  slow: "openrouter/deepseek/deepseek-v4.1-flash"
  vision: "openrouter/deepseek/deepseek-v4.1-flash"
  plan: "openrouter/meta/muse-spark-1.3"
  commit: "openrouter/deepseek/deepseek-v4.1-flash"
  tiny: "openrouter/inclusionai/ling-3.0-flash"
  task: "openrouter/deepseek/deepseek-v4.1-flash"
  advisor: "openrouter/meta/muse-spark-1.3"
  designer: "openrouter/deepseek/deepseek-v4.1-flash"
