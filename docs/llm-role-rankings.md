llm-stats.com best-fit ranking per omp model role — 408 models, 2026-10-09
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
Throughput + price: OpenRouter per-provider routes under the default price-based routing (weight 1/price² over stable standard-tier providers; p50 tok/s of routed traffic; $/M 3:1 in:out), throughput 155/408, priced 153; models without OpenRouter throughput or a billed route are not ranked.

## @default — Main workhorse: strong general coding-agent quality, sane cost
eligible: 146 — λ 0.00556 $/quality-point (thinking ×1.857)

|  # | value |     q | model                 | org                       |   $/M | tok/s |  ctx | gen 54.7% | code 18.9% | ag 12.6% | tool 10.5% | tput 3.2% |
| -: | ----: | ----: | --------------------- | ------------------------- | ----: | ----: | ---: | --------: | ---------: | -------: | ---------: | --------: |
|  1 | 0.810 | 0.812 | ★ DeepSeek-V4.1-Flash | DeepSeek                  | $0.37 |    91 | 1.0M |     0.484 |      0.147 |    0.093 |      0.068 |     0.021 |
|  2 | 0.795 | 0.816 | ★ Muse Spark 1.3      | Meta                      | $3.71 |    70 | 1.0M |     0.498 |      0.143 |    0.092 |      0.065 |     0.018 |
|  3 | 0.795 | 0.809 | GLM-5.3               | Zhipu AI                  | $2.51 |    87 | 1.0M |     0.489 |      0.143 |    0.091 |      0.066 |     0.020 |
|  4 | 0.779 | 0.784 | MiMo-V2.6-Pro         | Xiaomi                    | $1.01 |    29 | 1.0M |     0.478 |      0.142 |    0.090 |      0.065 |     0.010 |
|  5 | 0.775 | 0.792 | DeepSeek-V4-Pro-0813  | DeepSeek                  | $3.06 |    94 | 1.0M |     0.483 |      0.139 |    0.088 |      0.062 |     0.021 |
|  6 | 0.770 | 0.811 | Kimi K3               | Moonshot AI               | $7.47 |    57 | 1.0M |     0.493 |      0.145 |    0.091 |      0.066 |     0.016 |
|  7 | 0.766 | 0.810 | GPT-6.1 Sol           | OpenAI                    | $7.84 |    37 | 1.1M |     0.506 |      0.143 |    0.093 |      0.056 |     0.012 |
|  8 | 0.765 | 0.829 | ★ GPT-5.6 Sol         | OpenAI                    | $11.4 |    63 | 1.1M |     0.503 |      0.151 |    0.094 |      0.064 |     0.017 |
|  9 | 0.761 | 0.774 | Hy4 preview           | Tencent                   | $2.32 |    32 |    — |     0.477 |      0.137 |    0.087 |      0.062 |     0.011 |
| 10 | 0.757 | 0.759 | Qwen3.8 Flash         | Alibaba Cloud / Qwen Team | $0.43 |    54 | 1.0M |     0.467 |      0.128 |    0.084 |      0.064 |     0.016 |

## @smol — Fast lightweight model: cheap and quick, still competent
eligible: 146 — λ 0.04091 $/quality-point

|  # | value |     q | model                        | org                       |   $/M | tok/s |  ctx | tput 40% | gen 28.6% | code 17.1% | tool 14.3% |
| -: | ----: | ----: | ---------------------------- | ------------------------- | ----: | ----: | ---: | -------: | --------: | ---------: | ---------: |
|  1 | 0.729 | 0.738 | ★ DeepSeek-V4.1-Flash        | DeepSeek                  | $0.20 |    91 | 1.0M |    0.260 |     0.253 |      0.133 |      0.092 |
|  2 | 0.707 | 0.789 | ★ Muse Spark 1.1             | Meta                      | $2.00 |   184 | 1.0M |    0.343 |     0.245 |      0.114 |      0.088 |
|  3 | 0.673 | 0.729 | GLM-5.3                      | Zhipu AI                  | $1.35 |    87 | 1.0M |    0.254 |     0.255 |      0.130 |      0.090 |
|  4 | 0.665 | 0.683 | DeepSeek-V4-Flash-Vision-Exp | DeepSeek                  | $0.43 |    94 | 1.0M |    0.263 |     0.231 |      0.115 |      0.074 |
|  5 | 0.659 | 0.726 | DeepSeek-V4-Pro-0813         | DeepSeek                  | $1.65 |    94 | 1.0M |    0.264 |     0.252 |      0.126 |      0.085 |
|  6 | 0.651 | 0.671 | GPT-5.6 Luna                 | OpenAI                    | $0.47 |    83 | 1.1M |    0.248 |     0.229 |      0.117 |      0.076 |
|  7 | 0.649 | 0.650 | ★ Ling 3.0 Flash             | InclusionAI               | $0.04 |   118 | 131k |    0.291 |     0.200 |      0.095 |      0.064 |
|  8 | 0.647 | 0.708 | GLM-5.2                      | Zhipu AI                  | $1.50 |   118 | 1.0M |    0.291 |     0.232 |      0.115 |      0.071 |
|  9 | 0.643 | 0.651 | GPT-6 Luna                   | OpenAI                    | $0.21 |    79 | 1.1M |    0.243 |     0.227 |      0.106 |      0.074 |
| 10 | 0.636 | 0.645 | Qwen3.8 Flash                | Alibaba Cloud / Qwen Team | $0.23 |    54 | 1.0M |    0.198 |     0.244 |      0.116 |      0.088 |

## @slow — Most capable model for hard problems; cost and speed as tiebreakers
eligible: 146 — λ 0.00263 $/quality-point (thinking ×2.714)

|  # | value |     q | model                 | org         |   $/M | tok/s |  ctx | gen 63.2% | code 18.9% | ag 13.7% | tput 4.2% |
| -: | ----: | ----: | --------------------- | ----------- | ----: | ----: | ---: | --------: | ---------: | -------: | --------: |
|  1 | 0.832 | 0.833 | ★ DeepSeek-V4.1-Flash | DeepSeek    | $0.55 |    91 | 1.0M |     0.558 |      0.147 |    0.101 |     0.027 |
|  2 | 0.827 | 0.841 | ★ Muse Spark 1.3      | Meta        | $5.43 |    70 | 1.0M |     0.575 |      0.143 |    0.099 |     0.024 |
|  3 | 0.822 | 0.832 | GLM-5.3               | Zhipu AI    | $3.67 |    87 | 1.0M |     0.564 |      0.143 |    0.098 |     0.027 |
|  4 | 0.813 | 0.843 | ★ GPT-6.1 Sol         | OpenAI      | $11.5 |    37 | 1.1M |     0.584 |      0.143 |    0.100 |     0.016 |
|  5 | 0.811 | 0.855 | ★ GPT-5.6 Sol         | OpenAI      | $16.6 |    63 | 1.1M |     0.580 |      0.151 |    0.101 |     0.023 |
|  6 | 0.807 | 0.819 | DeepSeek-V4-Pro-0813  | DeepSeek    | $4.47 |    94 | 1.0M |     0.557 |      0.139 |    0.095 |     0.028 |
|  7 | 0.805 | 0.834 | Kimi K3               | Moonshot AI | $10.9 |    57 | 1.0M |     0.569 |      0.145 |    0.098 |     0.022 |
|  8 | 0.800 | 0.803 | MiMo-V2.6-Pro         | Xiaomi      | $1.47 |    29 | 1.0M |     0.551 |      0.142 |    0.097 |     0.013 |
|  9 | 0.787 | 0.796 | Hy4 preview           | Tencent     | $3.39 |    32 |    — |     0.551 |      0.137 |    0.094 |     0.014 |
| 10 | 0.780 | 0.795 | Muse Spark 1.1        | Meta        | $5.43 |   184 | 1.0M |     0.542 |      0.126 |    0.091 |     0.036 |

## @vision — Image understanding: vision index dominates
eligible: 75 — λ 0.00682 $/quality-point (thinking ×1.857)

|  # | value |     q | model                 | org                       |   $/M | tok/s |  ctx | vis 54.2% | gen 20.8% | rea 15.6% | code 6.3% | tput 3.1% |
| -: | ----: | ----: | --------------------- | ------------------------- | ----: | ----: | ---: | --------: | --------: | --------: | --------: | --------: |
|  1 | 0.730 | 0.732 | ★ DeepSeek-V4.1-Flash | DeepSeek                  | $0.37 |    91 | 1.0M |     0.346 |     0.184 |     0.133 |     0.048 |     0.020 |
|  2 | 0.730 | 0.732 | ★ Qwen3.8 Flash       | Alibaba Cloud / Qwen Team | $0.43 |    54 | 1.0M |     0.363 |     0.178 |     0.133 |     0.042 |     0.015 |
|  3 | 0.728 | 0.753 | ★ Muse Spark 1.1      | Meta                      | $3.71 |   184 | 1.0M |     0.371 |     0.179 |     0.135 |     0.041 |     0.027 |
|  4 | 0.719 | 0.772 | ★ GPT-6.1 Sol         | OpenAI                    | $7.84 |    37 | 1.1M |     0.380 |     0.192 |     0.140 |     0.047 |     0.012 |
|  5 | 0.718 | 0.769 | ★ Kimi K3             | Moonshot AI               | $7.47 |    57 | 1.0M |     0.379 |     0.188 |     0.139 |     0.048 |     0.016 |
|  6 | 0.711 | 0.730 | Gemini 3.8 Flash      | Google                    | $2.79 |    77 | 1.0M |     0.361 |     0.179 |     0.128 |     0.044 |     0.019 |
|  7 | 0.706 | 0.709 | GLM-5.3-Flash         | Zhipu AI                  | $0.46 |    36 | 1.0M |     0.344 |     0.179 |     0.132 |     0.041 |     0.012 |
|  8 | 0.698 | 0.709 | Qwen3.8-27B           | Alibaba Cloud / Qwen Team | $1.52 |    65 | 262k |     0.358 |     0.168 |     0.126 |     0.039 |     0.017 |
|  9 | 0.697 | 0.716 | Gemini 3.7 Flash      | Google                    | $2.79 |    94 | 1.0M |     0.353 |     0.174 |     0.127 |     0.041 |     0.021 |
| 10 | 0.691 | 0.769 | GPT-5.6 Sol           | OpenAI                    | $11.4 |    63 | 1.1M |     0.369 |     0.191 |     0.142 |     0.050 |     0.017 |

## @plan — Planning: reasoning and long-context coherence, priced so the cheapest capable planner wins
eligible: 146 — λ 0.01667 $/quality-point (thinking ×1.857)

|  # | value |     q | model                 | org                       |   $/M | tok/s |  ctx | gen 80% | lc 15.6% | tput 4.4% |
| -: | ----: | ----: | --------------------- | ------------------------- | ----: | ----: | ---: | ------: | -------: | --------: |
|  1 | 0.793 | 0.855 | ★ Muse Spark 1.3      | Meta                      | $3.71 |    70 | 1.0M |   0.728 |    0.101 |     0.025 |
|  2 | 0.776 | 0.783 | ★ Qwen3.8 Flash       | Alibaba Cloud / Qwen Team | $0.43 |    54 | 1.0M |   0.683 |    0.079 |     0.022 |
|  3 | 0.760 | 0.767 | ★ DeepSeek-V4.1-Flash | DeepSeek                  | $0.37 |    91 | 1.0M |   0.707 |    0.030 |     0.029 |
|  4 | 0.758 | 0.805 | ★ Gemini 3.8 Flash    | Google                    | $2.79 |    77 | 1.0M |   0.687 |    0.091 |     0.027 |
|  5 | 0.750 | 0.796 | Gemini 3.7 Flash      | Google                    | $2.79 |    94 | 1.0M |   0.669 |    0.098 |     0.029 |
|  6 | 0.749 | 0.788 | ★ Hy4 preview         | Tencent                   | $2.32 |    32 |    — |   0.698 |    0.075 |     0.015 |
|  7 | 0.736 | 0.750 | GPT-5.6 Luna          | OpenAI                    | $0.88 |    83 | 1.1M |   0.642 |    0.080 |     0.028 |
|  8 | 0.731 | 0.773 | GLM-5.3               | Zhipu AI                  | $2.51 |    87 | 1.0M |   0.715 |    0.030 |     0.028 |
|  9 | 0.729 | 0.736 | GLM-5.3-Flash         | Zhipu AI                  | $0.46 |    36 | 1.0M |   0.689 |    0.030 |     0.017 |
| 10 | 0.726 | 0.735 | Hy3                   | Tencent                   | $0.48 |    61 | 262k |   0.625 |    0.086 |     0.024 |

## @commit — Commit messages: cheap and fast with decent general quality
eligible: 146 — λ 0.04091 $/quality-point

|  # | value |     q | model                        | org         |   $/M | tok/s |  ctx | tput 41.5% | gen 43.1% | code 15.4% |
| -: | ----: | ----: | ---------------------------- | ----------- | ----: | ----: | ---: | ---------: | --------: | ---------: |
|  1 | 0.762 | 0.770 | ★ DeepSeek-V4.1-Flash        | DeepSeek    | $0.20 |    91 | 1.0M |      0.270 |     0.381 |      0.119 |
|  2 | 0.746 | 0.828 | ★ Muse Spark 1.1             | Meta        | $2.00 |   184 | 1.0M |      0.356 |     0.370 |      0.102 |
|  3 | 0.710 | 0.765 | GLM-5.3                      | Zhipu AI    | $1.35 |    87 | 1.0M |      0.264 |     0.385 |      0.116 |
|  4 | 0.707 | 0.725 | DeepSeek-V4-Flash-Vision-Exp | DeepSeek    | $0.43 |    94 | 1.0M |      0.274 |     0.348 |      0.103 |
|  5 | 0.700 | 0.767 | DeepSeek-V4-Pro-0813         | DeepSeek    | $1.65 |    94 | 1.0M |      0.274 |     0.380 |      0.113 |
|  6 | 0.693 | 0.754 | GLM-5.2                      | Zhipu AI    | $1.50 |   118 | 1.0M |      0.302 |     0.349 |      0.103 |
|  7 | 0.690 | 0.709 | GPT-5.6 Luna                 | OpenAI      | $0.47 |    83 | 1.1M |      0.258 |     0.346 |      0.105 |
|  8 | 0.687 | 0.689 | ★ Ling 3.0 Flash             | InclusionAI | $0.04 |   118 | 131k |      0.302 |     0.302 |      0.086 |
|  9 | 0.682 | 0.691 | GPT-6 Luna                   | OpenAI      | $0.21 |    79 | 1.1M |      0.253 |     0.343 |      0.095 |
| 10 | 0.679 | 0.694 | Mercury 2                    | Inception   | $0.38 |   260 | 128k |      0.398 |     0.234 |      0.062 |

## @tiny — Background tasks (titles, memory): cheapest and fastest wins
eligible: 146 — λ 0.03333 $/quality-point

|  # | value |     q | model                        | org         |   $/M | tok/s |  ctx | tput 58.3% | gen 41.7% |
| -: | ----: | ----: | ---------------------------- | ----------- | ----: | ----: | ---: | ---------: | --------: |
|  1 | 0.791 | 0.857 | ★ Muse Spark 1.1             | Meta        | $2.00 |   184 | 1.0M |      0.499 |     0.358 |
|  2 | 0.773 | 0.785 | ★ Mercury 2                  | Inception   | $0.38 |   260 | 128k |      0.559 |     0.226 |
|  3 | 0.741 | 0.748 | ★ DeepSeek-V4.1-Flash        | DeepSeek    | $0.20 |    91 | 1.0M |      0.379 |     0.368 |
|  4 | 0.716 | 0.773 | Sakana Namazu                | Sakana AI   | $1.71 |   138 | 256k |      0.450 |     0.323 |
|  5 | 0.714 | 0.716 | ★ Ling 3.0 Flash             | InclusionAI | $0.04 |   118 | 131k |      0.424 |     0.292 |
|  6 | 0.712 | 0.761 | GLM-5.2                      | Zhipu AI    | $1.50 |   118 | 1.0M |      0.424 |     0.338 |
|  7 | 0.708 | 0.727 | Gemini 3.1 Flash-Lite        | Google      | $0.56 |   148 | 1.0M |      0.462 |     0.264 |
|  8 | 0.707 | 0.721 | DeepSeek-V4-Flash-Vision-Exp | DeepSeek    | $0.43 |    94 | 1.0M |      0.384 |     0.337 |
|  9 | 0.706 | 0.708 | Ling 3.0 Flash Fin           | InclusionAI | $0.07 |    93 | 262k |      0.383 |     0.325 |
| 10 | 0.698 | 0.743 | GLM-5.3                      | Zhipu AI    | $1.35 |    87 | 1.0M |      0.371 |     0.372 |

## @task — Subagents: agentic + tool calling, moderate cost sensitivity
eligible: 146 — λ 0.00747 $/quality-point (thinking ×1.857)

|  # | value |     q | model                 | org                       |   $/M | tok/s |  ctx | ag 29.9% | tool 20.7% | code 18.4% | gen 25.3% | tput 5.7% |
| -: | ----: | ----: | --------------------- | ------------------------- | ----: | ----: | ---: | -------: | ---------: | ---------: | --------: | --------: |
|  1 | 0.754 | 0.757 | ★ DeepSeek-V4.1-Flash | DeepSeek                  | $0.37 |    91 | 1.0M |    0.220 |      0.134 |      0.142 |     0.224 |     0.037 |
|  2 | 0.727 | 0.745 | GLM-5.3               | Zhipu AI                  | $2.51 |    87 | 1.0M |    0.214 |      0.130 |      0.139 |     0.226 |     0.037 |
|  3 | 0.719 | 0.747 | Muse Spark 1.3        | Meta                      | $3.71 |    70 | 1.0M |    0.217 |      0.128 |      0.139 |     0.230 |     0.033 |
|  4 | 0.709 | 0.717 | MiMo-V2.6-Pro         | Xiaomi                    | $1.01 |    29 | 1.0M |    0.212 |      0.128 |      0.138 |     0.221 |     0.018 |
|  5 | 0.703 | 0.725 | DeepSeek-V4-Pro-0813  | DeepSeek                  | $3.06 |    94 | 1.0M |    0.207 |      0.122 |      0.135 |     0.223 |     0.038 |
|  6 | 0.691 | 0.694 | Qwen3.8 Flash         | Alibaba Cloud / Qwen Team | $0.43 |    54 | 1.0M |    0.199 |      0.127 |      0.124 |     0.216 |     0.028 |
|  7 | 0.687 | 0.691 | GLM-5.3-Flash         | Zhipu AI                  | $0.46 |    36 | 1.0M |    0.206 |      0.125 |      0.121 |     0.218 |     0.022 |
|  8 | 0.687 | 0.743 | Kimi K3               | Moonshot AI               | $7.47 |    57 | 1.0M |    0.215 |      0.131 |      0.141 |     0.228 |     0.029 |
|  9 | 0.685 | 0.713 | Muse Spark 1.1        | Meta                      | $3.71 |   184 | 1.0M |    0.198 |      0.127 |      0.122 |     0.217 |     0.049 |
| 10 | 0.683 | 0.701 | Hy4 preview           | Tencent                   | $2.32 |    32 |    — |    0.205 |      0.123 |      0.133 |     0.221 |     0.020 |

## @advisor — Advisor/watchdog: deep reasoning over long context
eligible: 146 — λ 0.01250 $/quality-point (thinking ×1.857)

|  # | value |     q | model                 | org                       |   $/M | tok/s |  ctx | gen 74.3% | lc 12.6% | tput 13.1% |
| -: | ----: | ----: | --------------------- | ------------------------- | ----: | ----: | ---: | --------: | -------: | ---------: |
|  1 | 0.787 | 0.833 | ★ Muse Spark 1.3      | Meta                      | $3.71 |    70 | 1.0M |     0.677 |    0.082 |      0.075 |
|  2 | 0.762 | 0.767 | ★ DeepSeek-V4.1-Flash | DeepSeek                  | $0.37 |    91 | 1.0M |     0.657 |    0.024 |      0.085 |
|  3 | 0.758 | 0.763 | Qwen3.8 Flash         | Alibaba Cloud / Qwen Team | $0.43 |    54 | 1.0M |     0.635 |    0.063 |      0.065 |
|  4 | 0.756 | 0.790 | ★ Gemini 3.8 Flash    | Google                    | $2.79 |    77 | 1.0M |     0.638 |    0.073 |      0.079 |
|  5 | 0.752 | 0.787 | Gemini 3.7 Flash      | Google                    | $2.79 |    94 | 1.0M |     0.621 |    0.079 |      0.086 |
|  6 | 0.740 | 0.772 | ★ GLM-5.3             | Zhipu AI                  | $2.51 |    87 | 1.0M |     0.664 |    0.024 |      0.083 |
|  7 | 0.732 | 0.743 | GPT-5.6 Luna          | OpenAI                    | $0.88 |    83 | 1.1M |     0.597 |    0.065 |      0.081 |
|  8 | 0.729 | 0.775 | Muse Spark 1.1        | Meta                      | $3.71 |   184 | 1.0M |     0.638 |    0.024 |      0.112 |
|  9 | 0.729 | 0.767 | DeepSeek-V4-Pro-0813  | DeepSeek                  | $3.06 |    94 | 1.0M |     0.656 |    0.024 |      0.087 |
| 10 | 0.725 | 0.754 | Hy4 preview           | Tencent                   | $2.32 |    32 |    — |     0.649 |    0.060 |      0.045 |

## @designer — Design work: visual/UX judgement on image-capable models
eligible: 89 — λ 0.01024 $/quality-point (thinking ×1.857)

|  # | value |     q | model                 | org         |   $/M | tok/s |  ctx | gen 31.3% | code 7.2% | vis 21.7% | tput 18.1% | web 21.7% | agon |
| -: | ----: | ----: | --------------------- | ----------- | ----: | ----: | ---: | --------: | --------: | --------: | ---------: | --------: | ---: |
|  1 | 0.787 | 0.791 | ★ DeepSeek-V4.1-Flash | DeepSeek    | $0.37 |    91 | 1.0M |     0.277 |     0.056 |     0.139 |      0.118 |     0.202 |    — |
|  2 | 0.747 | 0.785 | Muse Spark 1.1        | Meta        | $3.71 |   184 | 1.0M |     0.269 |     0.048 |     0.148 |      0.155 |     0.165 |    — |
|  3 | 0.746 | 0.784 | Muse Spark 1.3        | Meta        | $3.71 |    70 | 1.0M |     0.285 |     0.054 |     0.125 |      0.103 |     0.216 | 1289 |
|  4 | 0.737 | 0.766 | Gemini 3.8 Flash      | Google      | $2.79 |    77 | 1.0M |     0.269 |     0.051 |     0.144 |      0.108 |     0.193 | 1231 |
|  5 | 0.736 | 0.764 | Gemini 3.7 Flash      | Google      | $2.79 |    94 | 1.0M |     0.262 |     0.048 |     0.141 |      0.119 |     0.195 | 1214 |
|  6 | 0.719 | 0.796 | ★ Kimi K3             | Moonshot AI | $7.47 |    57 | 1.0M |     0.282 |     0.055 |     0.152 |      0.092 |     0.214 | 1285 |
|  7 | 0.712 | 0.741 | Gemini 3.6 Flash      | Google      | $2.79 |   103 | 1.0M |     0.245 |     0.042 |     0.140 |      0.124 |     0.190 | 1187 |
|  8 | 0.700 | 0.710 | MiMo-V2.6-Pro         | Xiaomi      | $1.01 |    29 | 1.0M |     0.273 |     0.054 |     0.127 |      0.057 |     0.198 |    — |
|  9 | 0.693 | 0.774 | GPT-6.1 Sol           | OpenAI      | $7.84 |    37 | 1.1M |     0.289 |     0.055 |     0.152 |      0.070 |     0.207 |    — |
| 10 | 0.687 | 0.691 | GLM-5.3-Flash         | Zhipu AI    | $0.46 |    36 | 1.0M |     0.270 |     0.047 |     0.138 |      0.068 |     0.168 |    — |
focus: website — coverage 123/408 (30.1%) ok; dispersion 0.992 ok; composition ok; freshness 0.3mo ok; trust unknown; modality unknown; maintenance unknown; provenance unknown; cross-source unknown

# Suggested settings.modelRoles (best-fit #1 per role, resolved via the omp catalog).
# Selectors are openrouter/<id>; the omp-llm-role plugin writes this block daily.
modelRoles:
  default: "openrouter/deepseek/deepseek-v4.1-flash"
  smol: "openrouter/deepseek/deepseek-v4.1-flash"
  slow: "openrouter/deepseek/deepseek-v4.1-flash"
  vision: "openrouter/deepseek/deepseek-v4.1-flash"
  plan: "openrouter/meta/muse-spark-1.3"
  commit: "openrouter/deepseek/deepseek-v4.1-flash"
  tiny: "openrouter/meta/muse-spark-1.1"
  task: "openrouter/deepseek/deepseek-v4.1-flash"
  advisor: "openrouter/meta/muse-spark-1.3"
  designer: "openrouter/deepseek/deepseek-v4.1-flash"
