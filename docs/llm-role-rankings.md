llm-stats.com best-fit ranking per omp model role — 407 models, 2026-10-08
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
Throughput + price: OpenRouter per-provider routes under the default price-based routing (weight 1/price² over stable standard-tier providers; p50 tok/s of routed traffic; $/M 3:1 in:out), throughput 155/407, priced 153; models without OpenRouter throughput or a billed route are not ranked.

## @default — Main workhorse: strong general coding-agent quality, sane cost
eligible: 146 — λ 0.00556 $/quality-point (thinking ×1.857)

|  # | value |     q | model                 | org         |   $/M | tok/s |  ctx | gen 54.7% | code 18.9% | ag 12.6% | tool 10.5% | tput 3.2% |
| -: | ----: | ----: | --------------------- | ----------- | ----: | ----: | ---: | --------: | ---------: | -------: | ---------: | --------: |
|  1 | 0.808 | 0.810 | ★ DeepSeek-V4.1-Flash | DeepSeek    | $0.42 |    57 | 1.0M |     0.485 |      0.148 |    0.094 |      0.068 |     0.016 |
|  2 | 0.801 | 0.822 | ★ Muse Spark 1.3      | Meta        | $3.71 |    63 | 1.0M |     0.501 |      0.145 |    0.093 |      0.066 |     0.017 |
|  3 | 0.794 | 0.813 | ★ GLM-5.3             | Zhipu AI    | $3.37 |    89 | 1.0M |     0.490 |      0.144 |    0.091 |      0.066 |     0.020 |
|  4 | 0.782 | 0.787 | MiMo-V2.6-Pro         | Xiaomi      | $1.01 |    30 | 1.0M |     0.479 |      0.143 |    0.090 |      0.065 |     0.010 |
|  5 | 0.777 | 0.793 | DeepSeek-V4-Pro-0813  | DeepSeek    | $2.79 |    85 | 1.0M |     0.483 |      0.139 |    0.088 |      0.062 |     0.020 |
|  6 | 0.774 | 0.818 | GPT-6.1 Sol           | OpenAI      | $7.84 |    39 | 1.1M |     0.508 |      0.146 |    0.094 |      0.057 |     0.013 |
|  7 | 0.772 | 0.814 | Kimi K3               | Moonshot AI | $7.52 |    58 | 1.0M |     0.494 |      0.146 |    0.091 |      0.067 |     0.016 |
|  8 | 0.767 | 0.831 | ★ GPT-5.6 Sol         | OpenAI      | $11.4 |    61 | 1.1M |     0.503 |      0.152 |    0.094 |      0.064 |     0.017 |
|  9 | 0.763 | 0.776 | Hy4 preview           | Tencent     | $2.32 |    33 |    — |     0.478 |      0.137 |    0.087 |      0.062 |     0.011 |
| 10 | 0.759 | 0.762 | ★ GLM-5.3-Flash       | Zhipu AI    | $0.41 |    37 | 1.0M |     0.472 |      0.126 |    0.088 |      0.064 |     0.012 |

## @smol — Fast lightweight model: cheap and quick, still competent
eligible: 146 — λ 0.04091 $/quality-point

|  # | value |     q | model                        | org                       |   $/M | tok/s |  ctx | tput 40% | gen 28.6% | code 17.1% | tool 14.3% |
| -: | ----: | ----: | ---------------------------- | ------------------------- | ----: | ----: | ---: | -------: | --------: | ---------: | ---------: |
|  1 | 0.687 | 0.769 | ★ Muse Spark 1.1             | Meta                      | $2.00 |   154 | 1.0M |    0.322 |     0.245 |      0.114 |      0.088 |
|  2 | 0.675 | 0.684 | ★ DeepSeek-V4.1-Flash        | DeepSeek                  | $0.22 |    57 | 1.0M |    0.205 |     0.253 |      0.134 |      0.092 |
|  3 | 0.659 | 0.733 | ★ GLM-5.3                    | Zhipu AI                  | $1.81 |    89 | 1.0M |    0.256 |     0.256 |      0.131 |      0.090 |
|  4 | 0.656 | 0.675 | DeepSeek-V4-Flash-Vision-Exp | DeepSeek                  | $0.46 |    87 | 1.0M |    0.255 |     0.231 |      0.115 |      0.074 |
|  5 | 0.654 | 0.655 | ★ Ling 3.0 Flash             | InclusionAI               | $0.04 |   124 | 131k |    0.296 |     0.200 |      0.096 |      0.064 |
|  6 | 0.654 | 0.715 | ★ DeepSeek-V4-Pro-0813       | DeepSeek                  | $1.50 |    85 | 1.0M |    0.252 |     0.252 |      0.126 |      0.085 |
|  7 | 0.653 | 0.673 | GPT-5.6 Luna                 | OpenAI                    | $0.47 |    83 | 1.1M |    0.249 |     0.230 |      0.118 |      0.076 |
|  8 | 0.647 | 0.662 | Mercury 2                    | Inception                 | $0.38 |   302 | 128k |    0.400 |     0.155 |      0.069 |      0.038 |
|  9 | 0.643 | 0.652 | Qwen3.8 Flash                | Alibaba Cloud / Qwen Team | $0.23 |    57 | 1.0M |    0.205 |     0.244 |      0.117 |      0.087 |
| 10 | 0.636 | 0.645 | GPT-6 Luna                   | OpenAI                    | $0.21 |    73 | 1.1M |    0.234 |     0.228 |      0.108 |      0.074 |

## @slow — Most capable model for hard problems; cost and speed as tiebreakers
eligible: 146 — λ 0.00263 $/quality-point (thinking ×2.714)

|  # | value |     q | model                 | org         |   $/M | tok/s |  ctx | gen 63.2% | code 18.9% | ag 13.7% | tput 4.2% |
| -: | ----: | ----: | --------------------- | ----------- | ----: | ----: | ---: | --------: | ---------: | -------: | --------: |
|  1 | 0.832 | 0.846 | ★ Muse Spark 1.3      | Meta        | $5.43 |    63 | 1.0M |     0.578 |      0.145 |    0.101 |     0.023 |
|  2 | 0.829 | 0.830 | ★ DeepSeek-V4.1-Flash | DeepSeek    | $0.61 |    57 | 1.0M |     0.559 |      0.148 |    0.101 |     0.022 |
|  3 | 0.823 | 0.836 | ★ GLM-5.3             | Zhipu AI    | $4.92 |    89 | 1.0M |     0.566 |      0.144 |    0.099 |     0.027 |
|  4 | 0.821 | 0.851 | ★ GPT-6.1 Sol         | OpenAI      | $11.5 |    39 | 1.1M |     0.586 |      0.146 |    0.101 |     0.017 |
|  5 | 0.814 | 0.857 | ★ GPT-5.6 Sol         | OpenAI      | $16.6 |    61 | 1.1M |     0.581 |      0.152 |    0.102 |     0.022 |
|  6 | 0.808 | 0.819 | DeepSeek-V4-Pro-0813  | DeepSeek    | $4.08 |    85 | 1.0M |     0.558 |      0.139 |    0.095 |     0.027 |
|  7 | 0.807 | 0.836 | Kimi K3               | Moonshot AI |   $11 |    58 | 1.0M |     0.570 |      0.146 |    0.099 |     0.022 |
|  8 | 0.803 | 0.806 | MiMo-V2.6-Pro         | Xiaomi      | $1.47 |    30 | 1.0M |     0.552 |      0.143 |    0.098 |     0.013 |
|  9 | 0.789 | 0.798 | Hy4 preview           | Tencent     | $3.39 |    33 |    — |     0.552 |      0.137 |    0.094 |     0.015 |
| 10 | 0.782 | 0.793 | Gemini 3.8 Flash      | Google      | $4.07 |    78 | 1.0M |     0.543 |      0.134 |    0.091 |     0.025 |

## @vision — Image understanding: vision index dominates
eligible: 75 — λ 0.00682 $/quality-point (thinking ×1.857)

|  # | value |     q | model                 | org                       |   $/M | tok/s |  ctx | vis 54.2% | gen 20.8% | rea 15.6% | code 6.3% | tput 3.1% |
| -: | ----: | ----: | --------------------- | ------------------------- | ----: | ----: | ---: | --------: | --------: | --------: | --------: | --------: |
|  1 | 0.731 | 0.734 | ★ Qwen3.8 Flash       | Alibaba Cloud / Qwen Team | $0.43 |    57 | 1.0M |     0.364 |     0.178 |     0.133 |     0.042 |     0.016 |
|  2 | 0.727 | 0.752 | ★ Muse Spark 1.1      | Meta                      | $3.71 |   154 | 1.0M |     0.371 |     0.179 |     0.135 |     0.042 |     0.025 |
|  3 | 0.727 | 0.729 | ★ DeepSeek-V4.1-Flash | DeepSeek                  | $0.42 |    57 | 1.0M |     0.347 |     0.184 |     0.134 |     0.049 |     0.016 |
|  4 | 0.721 | 0.774 | ★ GPT-6.1 Sol         | OpenAI                    | $7.84 |    39 | 1.1M |     0.379 |     0.193 |     0.141 |     0.048 |     0.012 |
|  5 | 0.719 | 0.770 | ★ Kimi K3             | Moonshot AI               | $7.52 |    58 | 1.0M |     0.379 |     0.188 |     0.139 |     0.048 |     0.016 |
|  6 | 0.715 | 0.734 | ★ Gemini 3.8 Flash    | Google                    | $2.79 |    78 | 1.0M |     0.365 |     0.179 |     0.128 |     0.044 |     0.019 |
|  7 | 0.708 | 0.710 | ★ GLM-5.3-Flash       | Zhipu AI                  | $0.41 |    37 | 1.0M |     0.344 |     0.180 |     0.133 |     0.041 |     0.012 |
|  8 | 0.701 | 0.720 | Gemini 3.7 Flash      | Google                    | $2.79 |    91 | 1.0M |     0.355 |     0.175 |     0.128 |     0.042 |     0.020 |
|  9 | 0.697 | 0.707 | Qwen3.8-27B           | Alibaba Cloud / Qwen Team | $1.48 |    52 | 262k |     0.359 |     0.168 |     0.125 |     0.039 |     0.015 |
| 10 | 0.693 | 0.771 | GPT-5.6 Sol           | OpenAI                    | $11.4 |    61 | 1.1M |     0.370 |     0.192 |     0.142 |     0.050 |     0.017 |

## @plan — Planning: reasoning and long-context coherence, priced so the cheapest capable planner wins
eligible: 146 — λ 0.01667 $/quality-point (thinking ×1.857)

|  # | value |     q | model                 | org                       |   $/M | tok/s |  ctx | gen 80% | lc 15.6% | tput 4.4% |
| -: | ----: | ----: | --------------------- | ------------------------- | ----: | ----: | ---: | ------: | -------: | --------: |
|  1 | 0.795 | 0.857 | ★ Muse Spark 1.3      | Meta                      | $3.71 |    63 | 1.0M |   0.732 |    0.101 |     0.024 |
|  2 | 0.779 | 0.786 | ★ Qwen3.8 Flash       | Alibaba Cloud / Qwen Team | $0.43 |    57 | 1.0M |   0.683 |    0.079 |     0.023 |
|  3 | 0.761 | 0.807 | ★ Gemini 3.8 Flash    | Google                    | $2.79 |    78 | 1.0M |   0.687 |    0.093 |     0.027 |
|  4 | 0.755 | 0.762 | ★ DeepSeek-V4.1-Flash | DeepSeek                  | $0.42 |    57 | 1.0M |   0.709 |    0.030 |     0.023 |
|  5 | 0.754 | 0.801 | Gemini 3.7 Flash      | Google                    | $2.79 |    91 | 1.0M |   0.672 |    0.100 |     0.029 |
|  6 | 0.751 | 0.790 | ★ Hy4 preview         | Tencent                   | $2.32 |    33 |    — |   0.699 |    0.076 |     0.015 |
|  7 | 0.737 | 0.751 | GPT-5.6 Luna          | OpenAI                    | $0.88 |    83 | 1.1M |   0.644 |    0.080 |     0.028 |
|  8 | 0.731 | 0.738 | ★ GLM-5.3-Flash       | Zhipu AI                  | $0.41 |    37 | 1.0M |   0.690 |    0.030 |     0.017 |
|  9 | 0.727 | 0.744 | MiMo-V2.6-Pro         | Xiaomi                    | $1.01 |    30 | 1.0M |   0.699 |    0.030 |     0.014 |
| 10 | 0.725 | 0.733 | Hy3                   | Tencent                   | $0.47 |    52 | 262k |   0.626 |    0.086 |     0.021 |

## @commit — Commit messages: cheap and fast with decent general quality
eligible: 146 — λ 0.04091 $/quality-point

|  # | value |     q | model                          | org         |   $/M | tok/s |  ctx | tput 41.5% | gen 43.1% | code 15.4% |
| -: | ----: | ----: | ------------------------------ | ----------- | ----: | ----: | ---: | ---------: | --------: | ---------: |
|  1 | 0.725 | 0.807 | ★ Muse Spark 1.1               | Meta        | $2.00 |   154 | 1.0M |      0.334 |     0.370 |      0.103 |
|  2 | 0.705 | 0.715 | ★ DeepSeek-V4.1-Flash          | DeepSeek    | $0.22 |    57 | 1.0M |      0.213 |     0.382 |      0.120 |
|  3 | 0.697 | 0.716 | ★ DeepSeek-V4-Flash-Vision-Exp | DeepSeek    | $0.46 |    87 | 1.0M |      0.264 |     0.349 |      0.104 |
|  4 | 0.696 | 0.711 | Mercury 2                      | Inception   | $0.38 |   302 | 128k |      0.415 |     0.234 |      0.062 |
|  5 | 0.695 | 0.770 | ★ GLM-5.3                      | Zhipu AI    | $1.81 |    89 | 1.0M |      0.266 |     0.386 |      0.117 |
|  6 | 0.694 | 0.755 | ★ DeepSeek-V4-Pro-0813         | DeepSeek    | $1.50 |    85 | 1.0M |      0.262 |     0.380 |      0.113 |
|  7 | 0.693 | 0.695 | ★ Ling 3.0 Flash               | InclusionAI | $0.04 |   124 | 131k |      0.307 |     0.302 |      0.086 |
|  8 | 0.692 | 0.711 | GPT-5.6 Luna                   | OpenAI      | $0.47 |    83 | 1.1M |      0.259 |     0.347 |      0.106 |
|  9 | 0.680 | 0.684 | Laguna S 2.1                   | Poolside    | $0.11 |    89 | 1.0M |      0.267 |     0.322 |      0.095 |
| 10 | 0.676 | 0.685 | GPT-6 Luna                     | OpenAI      | $0.21 |    73 | 1.1M |      0.243 |     0.344 |      0.097 |

## @tiny — Background tasks (titles, memory): cheapest and fastest wins
eligible: 146 — λ 0.03333 $/quality-point

|  # | value |     q | model                        | org                       |   $/M | tok/s |  ctx | tput 58.3% | gen 41.7% |
| -: | ----: | ----: | ---------------------------- | ------------------------- | ----: | ----: | ---: | ---------: | --------: |
|  1 | 0.797 | 0.810 | ★ Mercury 2                  | Inception                 | $0.38 |   302 | 128k |      0.583 |     0.226 |
|  2 | 0.765 | 0.767 | ★ Ling 3.0 Flash Fin         | InclusionAI               | $0.07 |   131 | 262k |      0.441 |     0.326 |
|  3 | 0.760 | 0.827 | ★ Muse Spark 1.1             | Meta                      | $2.00 |   154 | 1.0M |      0.469 |     0.358 |
|  4 | 0.722 | 0.723 | ★ Ling 3.0 Flash             | InclusionAI               | $0.04 |   124 | 131k |      0.431 |     0.292 |
|  5 | 0.697 | 0.716 | Gemini 3.1 Flash-Lite        | Google                    | $0.56 |   139 | 1.0M |      0.451 |     0.264 |
|  6 | 0.695 | 0.745 | Gemini 3.6 Flash             | Google                    | $1.50 |   115 | 1.0M |      0.419 |     0.326 |
|  7 | 0.693 | 0.708 | DeepSeek-V4-Flash-Vision-Exp | DeepSeek                  | $0.46 |    87 | 1.0M |      0.371 |     0.337 |
|  8 | 0.687 | 0.701 | Qwen3-Next-80B-A3B-Thinking  | Alibaba Cloud / Qwen Team | $0.41 |   158 |    — |      0.473 |     0.228 |
|  9 | 0.687 | 0.747 | GLM-5.3                      | Zhipu AI                  | $1.81 |    89 | 1.0M |      0.374 |     0.373 |
| 10 | 0.686 | 0.692 | Seed 2.0 Mini                | ByteDance                 | $0.17 |   131 | 256k |      0.441 |     0.250 |

## @task — Subagents: agentic + tool calling, moderate cost sensitivity
eligible: 146 — λ 0.00747 $/quality-point (thinking ×1.857)

|  # | value |     q | model                 | org                       |   $/M | tok/s |  ctx | ag 29.9% | tool 20.7% | code 18.4% | gen 25.3% | tput 5.7% |
| -: | ----: | ----: | --------------------- | ------------------------- | ----: | ----: | ---: | -------: | ---------: | ---------: | --------: | --------: |
|  1 | 0.749 | 0.752 | ★ DeepSeek-V4.1-Flash | DeepSeek                  | $0.42 |    57 | 1.0M |    0.222 |      0.134 |      0.143 |     0.224 |     0.029 |
|  2 | 0.725 | 0.750 | GLM-5.3               | Zhipu AI                  | $3.37 |    89 | 1.0M |    0.216 |      0.130 |      0.140 |     0.227 |     0.037 |
|  3 | 0.724 | 0.752 | Muse Spark 1.3        | Meta                      | $3.71 |    63 | 1.0M |    0.220 |      0.129 |      0.141 |     0.231 |     0.031 |
|  4 | 0.713 | 0.720 | MiMo-V2.6-Pro         | Xiaomi                    | $1.01 |    30 | 1.0M |    0.214 |      0.129 |      0.139 |     0.221 |     0.018 |
|  5 | 0.705 | 0.726 | DeepSeek-V4-Pro-0813  | DeepSeek                  | $2.79 |    85 | 1.0M |    0.208 |      0.123 |      0.135 |     0.223 |     0.036 |
|  6 | 0.693 | 0.696 | Qwen3.8 Flash         | Alibaba Cloud / Qwen Team | $0.43 |    57 | 1.0M |    0.200 |      0.126 |      0.125 |     0.216 |     0.029 |
|  7 | 0.692 | 0.695 | ★ GLM-5.3-Flash       | Zhipu AI                  | $0.41 |    37 | 1.0M |    0.207 |      0.125 |      0.122 |     0.218 |     0.022 |
|  8 | 0.690 | 0.746 | Kimi K3               | Moonshot AI               | $7.52 |    58 | 1.0M |    0.216 |      0.131 |      0.141 |     0.228 |     0.030 |
|  9 | 0.686 | 0.703 | Hy4 preview           | Tencent                   | $2.32 |    33 |    — |    0.206 |      0.123 |      0.133 |     0.221 |     0.020 |
| 10 | 0.684 | 0.712 | Muse Spark 1.1        | Meta                      | $3.71 |   154 | 1.0M |    0.199 |      0.127 |      0.123 |     0.217 |     0.046 |

## @advisor — Advisor/watchdog: deep reasoning over long context
eligible: 146 — λ 0.01250 $/quality-point (thinking ×1.857)

|  # | value |     q | model                 | org                       |   $/M | tok/s |  ctx | gen 74.3% | lc 12.6% | tput 13.1% |
| -: | ----: | ----: | --------------------- | ------------------------- | ----: | ----: | ---: | --------: | -------: | ---------: |
|  1 | 0.786 | 0.833 | ★ Muse Spark 1.3      | Meta                      | $3.71 |    63 | 1.0M |     0.680 |    0.081 |      0.071 |
|  2 | 0.761 | 0.766 | ★ Qwen3.8 Flash       | Alibaba Cloud / Qwen Team | $0.43 |    57 | 1.0M |     0.635 |    0.064 |      0.067 |
|  3 | 0.758 | 0.793 | ★ Gemini 3.8 Flash    | Google                    | $2.79 |    78 | 1.0M |     0.639 |    0.075 |      0.079 |
|  4 | 0.755 | 0.790 | Gemini 3.7 Flash      | Google                    | $2.79 |    91 | 1.0M |     0.624 |    0.080 |      0.085 |
|  5 | 0.745 | 0.750 | ★ DeepSeek-V4.1-Flash | DeepSeek                  | $0.42 |    57 | 1.0M |     0.658 |    0.024 |      0.067 |
|  6 | 0.733 | 0.744 | GPT-5.6 Luna          | OpenAI                    | $0.88 |    83 | 1.1M |     0.598 |    0.065 |      0.082 |
|  7 | 0.733 | 0.775 | GLM-5.3               | Zhipu AI                  | $3.37 |    89 | 1.0M |     0.666 |    0.024 |      0.084 |
|  8 | 0.728 | 0.763 | DeepSeek-V4-Pro-0813  | DeepSeek                  | $2.79 |    85 | 1.0M |     0.656 |    0.024 |      0.083 |
|  9 | 0.727 | 0.756 | Hy4 preview           | Tencent                   | $2.32 |    33 |    — |     0.649 |    0.061 |      0.045 |
| 10 | 0.722 | 0.769 | Muse Spark 1.1        | Meta                      | $3.71 |   154 | 1.0M |     0.639 |    0.024 |      0.105 |

## @designer — Design work: visual/UX judgement on image-capable models
eligible: 89 — λ 0.01024 $/quality-point (thinking ×1.857)

|  # | value |     q | model                 | org         |   $/M | tok/s |  ctx | gen 31.3% | code 7.2% | vis 21.7% | tput 18.1% | web 21.7% | agon |
| -: | ----: | ----: | --------------------- | ----------- | ----: | ----: | ---: | --------: | --------: | --------: | ---------: | --------: | ---: |
|  1 | 0.761 | 0.765 | ★ DeepSeek-V4.1-Flash | DeepSeek    | $0.42 |    57 | 1.0M |     0.277 |     0.056 |     0.139 |      0.093 |     0.200 |    — |
|  2 | 0.745 | 0.783 | ★ Muse Spark 1.3      | Meta        | $3.71 |    63 | 1.0M |     0.287 |     0.055 |     0.127 |      0.098 |     0.216 | 1289 |
|  3 | 0.741 | 0.770 | ★ Gemini 3.8 Flash    | Google      | $2.79 |    78 | 1.0M |     0.269 |     0.051 |     0.146 |      0.109 |     0.195 | 1231 |
|  4 | 0.739 | 0.767 | Gemini 3.7 Flash      | Google      | $2.79 |    91 | 1.0M |     0.263 |     0.048 |     0.142 |      0.117 |     0.197 | 1214 |
|  5 | 0.736 | 0.774 | Muse Spark 1.1        | Meta        | $3.71 |   154 | 1.0M |     0.269 |     0.048 |     0.148 |      0.145 |     0.163 |    — |
|  6 | 0.721 | 0.798 | ★ Kimi K3             | Moonshot AI | $7.52 |    58 | 1.0M |     0.283 |     0.056 |     0.152 |      0.094 |     0.214 | 1284 |
|  7 | 0.719 | 0.747 | Gemini 3.6 Flash      | Google      | $2.79 |   115 | 1.0M |     0.245 |     0.043 |     0.140 |      0.130 |     0.190 | 1187 |
|  8 | 0.705 | 0.715 | MiMo-V2.6-Pro         | Xiaomi      | $1.01 |    30 | 1.0M |     0.274 |     0.055 |     0.128 |      0.057 |     0.202 |    — |
|  9 | 0.690 | 0.694 | ★ GLM-5.3-Flash       | Zhipu AI    | $0.41 |    37 | 1.0M |     0.270 |     0.048 |     0.138 |      0.070 |     0.168 |    — |
| 10 | 0.683 | 0.764 | GPT-6.1 Sol           | OpenAI      | $7.84 |    39 | 1.1M |     0.291 |     0.056 |     0.152 |      0.072 |     0.193 |    — |
focus: website — coverage 123/407 (30.2%) ok; dispersion 0.992 ok; composition ok; freshness 0.3mo ok; trust unknown; modality unknown; maintenance unknown; provenance unknown; cross-source unknown

# Suggested settings.modelRoles (best-fit #1 per role, resolved via the omp catalog).
# Selectors are openrouter/<id>; the omp-llm-role plugin writes this block daily.
modelRoles:
  default: "openrouter/deepseek/deepseek-v4.1-flash"
  smol: "openrouter/meta/muse-spark-1.1"
  slow: "openrouter/meta/muse-spark-1.3"
  vision: "openrouter/qwen/qwen3.8-flash"
  plan: "openrouter/meta/muse-spark-1.3"
  commit: "openrouter/meta/muse-spark-1.1"
  tiny: "openrouter/inception/mercury-2"
  task: "openrouter/deepseek/deepseek-v4.1-flash"
  advisor: "openrouter/meta/muse-spark-1.3"
  designer: "openrouter/deepseek/deepseek-v4.1-flash"
