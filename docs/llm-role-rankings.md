llm-stats.com best-fit ranking per omp model role — 408 models, 2026-10-25
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
Throughput + price: OpenRouter per-provider routes under the default price-based routing (weight 1/price² over stable standard-tier providers; p50 tok/s of routed traffic; $/M 3:1 in:out), throughput 144/408, priced 144; models without OpenRouter throughput or a billed route are not ranked.

## @default — Main workhorse: strong general coding-agent quality, sane cost
eligible: 137 — λ 0.00556 $/quality-point (thinking ×1.857)

|  # | value |     q | model                 | org         |   $/M | tok/s |  ctx | gen 54.7% | code 18.9% | ag 12.6% | tool 10.5% | tput 3.2% |
| -: | ----: | ----: | --------------------- | ----------- | ----: | ----: | ---: | --------: | ---------: | -------: | ---------: | --------: |
|  1 | 0.811 | 0.814 | ★ DeepSeek-V4.1-Flash | DeepSeek    | $0.46 |   111 | 1.0M |     0.484 |      0.147 |    0.093 |      0.068 |     0.022 |
|  2 | 0.807 | 0.827 | ★ Muse Spark 1.3      | Meta        | $3.71 |   234 | 1.0M |     0.498 |      0.143 |    0.092 |      0.065 |     0.029 |
|  3 | 0.800 | 0.810 | GLM-5.3               | Zhipu AI    | $1.84 |   102 | 1.0M |     0.489 |      0.143 |    0.091 |      0.066 |     0.022 |
|  4 | 0.797 | 0.839 | ★ Gemini 4 Argon      | Google      | $7.65 |    36 |    — |     0.514 |      0.152 |    0.096 |      0.067 |     0.012 |
|  5 | 0.794 | 0.795 | ★ Ling 3.1 Flash      | InclusionAI | $0.21 |    45 |    — |     0.486 |      0.139 |    0.092 |      0.064 |     0.014 |
|  6 | 0.781 | 0.815 | Kimi K3               | Moonshot AI | $5.99 |    80 | 1.0M |     0.493 |      0.145 |    0.091 |      0.066 |     0.019 |
|  7 | 0.780 | 0.785 | MiMo-V2.6-Pro         | Xiaomi      | $1.01 |    32 | 1.0M |     0.478 |      0.142 |    0.090 |      0.065 |     0.011 |
|  8 | 0.779 | 0.791 | DeepSeek-V4-Pro-0813  | DeepSeek    | $2.30 |    83 | 1.0M |     0.483 |      0.139 |    0.088 |      0.062 |     0.020 |
|  9 | 0.767 | 0.811 | GPT-6.1 Sol           | OpenAI      | $7.84 |    41 | 1.1M |     0.506 |      0.143 |    0.093 |      0.056 |     0.013 |
| 10 | 0.764 | 0.777 | Hy4 preview           | Tencent     | $2.32 |    43 |    — |     0.477 |      0.137 |    0.087 |      0.062 |     0.014 |

## @smol — Fast lightweight model: cheap and quick, still competent
eligible: 137 — λ 0.04091 $/quality-point

|  # | value |     q | model                        | org                   |   $/M | tok/s |  ctx | tput 40% | gen 28.6% | code 17.1% | tool 14.3% |
| -: | ----: | ----: | ---------------------------- | --------------------- | ----: | ----: | ---: | -------: | --------: | ---------: | ---------: |
|  1 | 0.767 | 0.848 | ★ Muse Spark 1.3             | Meta                  | $2.00 |   234 | 1.0M |    0.371 |     0.260 |      0.129 |      0.089 |
|  2 | 0.750 | 0.760 | ★ DeepSeek-V4.1-Flash        | DeepSeek              | $0.25 |   111 | 1.0M |    0.283 |     0.253 |      0.133 |      0.092 |
|  3 | 0.743 | 0.825 | Muse Spark 1.1               | Meta                  | $2.00 |   250 | 1.0M |    0.379 |     0.245 |      0.114 |      0.088 |
|  4 | 0.707 | 0.748 | GLM-5.3                      | Zhipu AI              | $0.99 |   102 | 1.0M |    0.273 |     0.255 |      0.130 |      0.090 |
|  5 | 0.690 | 0.716 | Inkling-Small                | Thinking Machines Lab | $0.64 |   172 | 524k |    0.335 |     0.207 |      0.104 |      0.070 |
|  6 | 0.683 | 0.701 | DeepSeek-V4-Flash-Vision-Exp | DeepSeek              | $0.43 |   109 | 1.0M |    0.281 |     0.231 |      0.115 |      0.074 |
|  7 | 0.679 | 0.685 | ★ GLM-5.3-Flash              | Zhipu AI              | $0.16 |    77 | 1.0M |    0.240 |     0.246 |      0.113 |      0.086 |
|  8 | 0.673 | 0.743 | GLM-5.2                      | Zhipu AI              | $1.72 |   159 | 1.0M |    0.326 |     0.232 |      0.115 |      0.071 |
|  9 | 0.671 | 0.752 | Muse Spark 1.2               | Meta                  | $2.00 |   256 | 1.0M |    0.381 |     0.206 |      0.103 |      0.062 |
| 10 | 0.669 | 0.674 | ★ DeepSeek-V4-Flash-0731     | DeepSeek              | $0.12 |    93 | 1.0M |    0.262 |     0.226 |      0.110 |      0.076 |

## @slow — Most capable model for hard problems; cost and speed as tiebreakers
eligible: 137 — λ 0.00263 $/quality-point (thinking ×2.714)

|  # | value |     q | model                 | org         |   $/M | tok/s |  ctx | gen 63.2% | code 18.9% | ag 13.7% | tput 4.2% |
| -: | ----: | ----: | --------------------- | ----------- | ----: | ----: | ---: | --------: | ---------: | -------: | --------: |
|  1 | 0.842 | 0.856 | ★ Muse Spark 1.3      | Meta        | $5.43 |   234 | 1.0M |     0.575 |      0.143 |    0.099 |     0.039 |
|  2 | 0.834 | 0.864 | ★ Gemini 4 Argon      | Google      | $11.2 |    36 |    — |     0.593 |      0.152 |    0.104 |     0.016 |
|  3 | 0.834 | 0.836 | ★ DeepSeek-V4.1-Flash | DeepSeek    | $0.67 |   111 | 1.0M |     0.558 |      0.147 |    0.101 |     0.030 |
|  4 | 0.827 | 0.834 | GLM-5.3               | Zhipu AI    | $2.69 |   102 | 1.0M |     0.564 |      0.143 |    0.098 |     0.029 |
|  5 | 0.817 | 0.817 | ★ Ling 3.1 Flash      | InclusionAI | $0.31 |    45 |    — |     0.560 |      0.139 |    0.099 |     0.018 |
|  6 | 0.815 | 0.838 | Kimi K3               | Moonshot AI | $8.76 |    80 | 1.0M |     0.569 |      0.145 |    0.098 |     0.026 |
|  7 | 0.815 | 0.845 | GPT-6.1 Sol           | OpenAI      | $11.5 |    41 | 1.1M |     0.584 |      0.143 |    0.100 |     0.018 |
|  8 | 0.808 | 0.817 | DeepSeek-V4-Pro-0813  | DeepSeek    | $3.36 |    83 | 1.0M |     0.557 |      0.139 |    0.095 |     0.026 |
|  9 | 0.801 | 0.805 | MiMo-V2.6-Pro         | Xiaomi      | $1.48 |    32 | 1.0M |     0.551 |      0.142 |    0.097 |     0.015 |
| 10 | 0.795 | 0.856 | GPT-5.6 Sol           | OpenAI      | $22.9 |    66 | 1.1M |     0.580 |      0.151 |    0.101 |     0.023 |

## @vision — Image understanding: vision index dominates
eligible: 71 — λ 0.00682 $/quality-point (thinking ×1.857)

|  # | value |     q | model                 | org                       |   $/M | tok/s |  ctx | vis 54.2% | gen 20.8% | rea 15.6% | code 6.3% | tput 3.1% |
| -: | ----: | ----: | --------------------- | ------------------------- | ----: | ----: | ---: | --------: | --------: | --------: | --------: | --------: |
|  1 | 0.731 | 0.772 | ★ Kimi K3             | Moonshot AI               | $5.99 |    80 | 1.0M |     0.379 |     0.188 |     0.139 |     0.048 |     0.019 |
|  2 | 0.731 | 0.734 | ★ DeepSeek-V4.1-Flash | DeepSeek                  | $0.46 |   111 | 1.0M |     0.346 |     0.184 |     0.133 |     0.048 |     0.022 |
|  3 | 0.731 | 0.783 | ★ Gemini 4 Argon      | Google                    | $7.65 |    36 |    — |     0.384 |     0.196 |     0.141 |     0.050 |     0.012 |
|  4 | 0.731 | 0.756 | ★ Muse Spark 1.1      | Meta                      | $3.71 |   250 | 1.0M |     0.371 |     0.179 |     0.135 |     0.041 |     0.030 |
|  5 | 0.730 | 0.732 | ★ Qwen3.8 Flash       | Alibaba Cloud / Qwen Team | $0.43 |    54 | 1.0M |     0.363 |     0.178 |     0.133 |     0.042 |     0.015 |
|  6 | 0.720 | 0.773 | GPT-6.1 Sol           | OpenAI                    | $7.84 |    41 | 1.1M |     0.380 |     0.192 |     0.140 |     0.047 |     0.013 |
|  7 | 0.714 | 0.716 | ★ GLM-5.3-Flash       | Zhipu AI                  | $0.30 |    77 | 1.0M |     0.344 |     0.179 |     0.132 |     0.041 |     0.019 |
|  8 | 0.710 | 0.730 | Gemini 3.8 Flash      | Google                    | $2.91 |    75 | 1.0M |     0.361 |     0.179 |     0.128 |     0.044 |     0.019 |
|  9 | 0.702 | 0.708 | Qwen3.8-27B           | Alibaba Cloud / Qwen Team | $0.75 |    57 | 262k |     0.358 |     0.168 |     0.126 |     0.039 |     0.016 |
| 10 | 0.696 | 0.716 | Gemini 3.7 Flash      | Google                    | $2.87 |    94 | 1.0M |     0.353 |     0.174 |     0.127 |     0.041 |     0.021 |

## @plan — Planning: reasoning and long-context coherence, priced so the cheapest capable planner wins
eligible: 137 — λ 0.01667 $/quality-point (thinking ×1.857)

|  # | value |     q | model               | org                       |   $/M | tok/s |  ctx | gen 80% | lc 15.6% | tput 4.4% |
| -: | ----: | ----: | ------------------- | ------------------------- | ----: | ----: | ---: | ------: | -------: | --------: |
|  1 | 0.809 | 0.871 | ★ Muse Spark 1.3    | Meta                      | $3.71 |   234 | 1.0M |   0.728 |    0.101 |     0.041 |
|  2 | 0.776 | 0.783 | ★ Qwen3.8 Flash     | Alibaba Cloud / Qwen Team | $0.43 |    54 | 1.0M |   0.683 |    0.079 |     0.022 |
|  3 | 0.762 | 0.769 | DeepSeek-V4.1-Flash | DeepSeek                  | $0.46 |   111 | 1.0M |   0.707 |    0.030 |     0.031 |
|  4 | 0.756 | 0.760 | ★ Ling 3.1 Flash    | InclusionAI               | $0.21 |    45 |    — |   0.710 |    0.030 |     0.020 |
|  5 | 0.756 | 0.804 | ★ Gemini 3.8 Flash  | Google                    | $2.91 |    75 | 1.0M |   0.687 |    0.091 |     0.026 |
|  6 | 0.753 | 0.792 | ★ Hy4 preview       | Tencent                   | $2.32 |    43 |    — |   0.698 |    0.075 |     0.019 |
|  7 | 0.748 | 0.796 | ★ Gemini 3.7 Flash  | Google                    | $2.87 |    94 | 1.0M |   0.669 |    0.098 |     0.029 |
|  8 | 0.744 | 0.775 | GLM-5.3             | Zhipu AI                  | $1.84 |   102 | 1.0M |   0.715 |    0.030 |     0.030 |
|  9 | 0.741 | 0.746 | GLM-5.3-Flash       | Zhipu AI                  | $0.30 |    77 | 1.0M |   0.689 |    0.030 |     0.027 |
| 10 | 0.738 | 0.866 | Gemini 4 Argon      | Google                    | $7.65 |    36 |    — |   0.751 |    0.098 |     0.017 |

## @commit — Commit messages: cheap and fast with decent general quality
eligible: 137 — λ 0.04091 $/quality-point

|  # | value |     q | model                        | org                   |   $/M | tok/s |  ctx | tput 41.5% | gen 43.1% | code 15.4% |
| -: | ----: | ----: | ---------------------------- | --------------------- | ----: | ----: | ---: | ---------: | --------: | ---------: |
|  1 | 0.811 | 0.893 | ★ Muse Spark 1.3             | Meta                  | $2.00 |   234 | 1.0M |      0.385 |     0.392 |      0.116 |
|  2 | 0.784 | 0.794 | ★ DeepSeek-V4.1-Flash        | DeepSeek              | $0.25 |   111 | 1.0M |      0.294 |     0.381 |      0.119 |
|  3 | 0.783 | 0.865 | Muse Spark 1.1               | Meta                  | $2.00 |   250 | 1.0M |      0.393 |     0.370 |      0.102 |
|  4 | 0.744 | 0.785 | GLM-5.3                      | Zhipu AI              | $0.99 |   102 | 1.0M |      0.284 |     0.385 |      0.116 |
|  5 | 0.727 | 0.754 | Inkling-Small                | Thinking Machines Lab | $0.64 |   172 | 524k |      0.348 |     0.313 |      0.093 |
|  6 | 0.726 | 0.744 | DeepSeek-V4-Flash-Vision-Exp | DeepSeek              | $0.43 |   109 | 1.0M |      0.292 |     0.348 |      0.103 |
|  7 | 0.720 | 0.791 | GLM-5.2                      | Zhipu AI              | $1.72 |   159 | 1.0M |      0.338 |     0.349 |      0.103 |
|  8 | 0.717 | 0.799 | Muse Spark 1.2               | Meta                  | $2.00 |   256 | 1.0M |      0.396 |     0.311 |      0.092 |
|  9 | 0.715 | 0.722 | ★ GLM-5.3-Flash              | Zhipu AI              | $0.16 |    77 | 1.0M |      0.249 |     0.371 |      0.101 |
| 10 | 0.708 | 0.716 | GPT-6 Luna                   | OpenAI                | $0.21 |    97 | 1.1M |      0.278 |     0.343 |      0.095 |

## @tiny — Background tasks (titles, memory): cheapest and fastest wins
eligible: 137 — λ 0.03333 $/quality-point

|  # | value |     q | model                        | org                   |   $/M | tok/s |  ctx | tput 58.3% | gen 41.7% |
| -: | ----: | ----: | ---------------------------- | --------------------- | ----: | ----: | ---: | ---------: | --------: |
|  1 | 0.853 | 0.920 | ★ Muse Spark 1.3             | Meta                  | $2.00 |   234 | 1.0M |      0.541 |     0.379 |
|  2 | 0.843 | 0.910 | Muse Spark 1.1               | Meta                  | $2.00 |   250 | 1.0M |      0.552 |     0.358 |
|  3 | 0.790 | 0.857 | Muse Spark 1.2               | Meta                  | $2.00 |   256 | 1.0M |      0.556 |     0.301 |
|  4 | 0.773 | 0.781 | ★ DeepSeek-V4.1-Flash        | DeepSeek              | $0.25 |   111 | 1.0M |      0.412 |     0.368 |
|  5 | 0.769 | 0.790 | ★ Inkling-Small              | Thinking Machines Lab | $0.64 |   172 | 524k |      0.488 |     0.302 |
|  6 | 0.756 | 0.769 | Mercury 2                    | Inception             | $0.38 |   236 | 128k |      0.542 |     0.226 |
|  7 | 0.755 | 0.813 | ★ GLM-5.2                    | Zhipu AI              | $1.72 |   159 | 1.0M |      0.475 |     0.338 |
|  8 | 0.738 | 0.771 | GLM-5.3                      | Zhipu AI              | $0.99 |   102 | 1.0M |      0.399 |     0.372 |
|  9 | 0.733 | 0.747 | DeepSeek-V4-Flash-Vision-Exp | DeepSeek              | $0.43 |   109 | 1.0M |      0.410 |     0.337 |
| 10 | 0.723 | 0.774 | Gemini 3.6 Flash             | Google                | $1.54 |   137 | 1.0M |      0.449 |     0.325 |

## @task — Subagents: agentic + tool calling, moderate cost sensitivity
eligible: 137 — λ 0.00747 $/quality-point (thinking ×1.857)

|  # | value |     q | model                 | org                       |   $/M | tok/s |  ctx | ag 29.9% | tool 20.7% | code 18.4% | gen 25.3% | tput 5.7% |
| -: | ----: | ----: | --------------------- | ------------------------- | ----: | ----: | ---: | -------: | ---------: | ---------: | --------: | --------: |
|  1 | 0.757 | 0.760 | ★ DeepSeek-V4.1-Flash | DeepSeek                  | $0.46 |   111 | 1.0M |    0.220 |      0.134 |      0.142 |     0.224 |     0.041 |
|  2 | 0.740 | 0.767 | ★ Muse Spark 1.3      | Meta                      | $3.71 |   234 | 1.0M |    0.217 |      0.128 |      0.139 |     0.230 |     0.053 |
|  3 | 0.734 | 0.748 | GLM-5.3               | Zhipu AI                  | $1.84 |   102 | 1.0M |    0.214 |      0.130 |      0.139 |     0.226 |     0.039 |
|  4 | 0.726 | 0.728 | ★ Ling 3.1 Flash      | InclusionAI               | $0.21 |    45 |    — |    0.217 |      0.127 |      0.135 |     0.224 |     0.025 |
|  5 | 0.711 | 0.719 | MiMo-V2.6-Pro         | Xiaomi                    | $1.01 |    32 | 1.0M |    0.212 |      0.128 |      0.138 |     0.221 |     0.020 |
|  6 | 0.706 | 0.723 | DeepSeek-V4-Pro-0813  | DeepSeek                  | $2.30 |    83 | 1.0M |    0.207 |      0.122 |      0.135 |     0.223 |     0.036 |
|  7 | 0.706 | 0.763 | Gemini 4 Argon        | Google                    | $7.65 |    36 |    — |    0.226 |      0.131 |      0.147 |     0.237 |     0.021 |
|  8 | 0.704 | 0.749 | Kimi K3               | Moonshot AI               | $5.99 |    80 | 1.0M |    0.215 |      0.131 |      0.141 |     0.228 |     0.035 |
|  9 | 0.702 | 0.704 | GLM-5.3-Flash         | Zhipu AI                  | $0.30 |    77 | 1.0M |    0.206 |      0.125 |      0.121 |     0.218 |     0.034 |
| 10 | 0.691 | 0.694 | Qwen3.8 Flash         | Alibaba Cloud / Qwen Team | $0.43 |    54 | 1.0M |    0.199 |      0.127 |      0.124 |     0.216 |     0.028 |

## @advisor — Advisor/watchdog: deep reasoning over long context
eligible: 137 — λ 0.01250 $/quality-point (thinking ×1.857)

|  # | value |     q | model                 | org                       |   $/M | tok/s |  ctx | gen 74.3% | lc 12.6% | tput 13.1% |
| -: | ----: | ----: | --------------------- | ------------------------- | ----: | ----: | ---: | --------: | -------: | ---------: |
|  1 | 0.834 | 0.880 | ★ Muse Spark 1.3      | Meta                      | $3.71 |   234 | 1.0M |     0.677 |    0.082 |      0.122 |
|  2 | 0.769 | 0.775 | ★ DeepSeek-V4.1-Flash | DeepSeek                  | $0.46 |   111 | 1.0M |     0.657 |    0.024 |      0.093 |
|  3 | 0.758 | 0.763 | ★ Qwen3.8 Flash       | Alibaba Cloud / Qwen Team | $0.43 |    54 | 1.0M |     0.635 |    0.063 |      0.065 |
|  4 | 0.755 | 0.778 | ★ GLM-5.3             | Zhipu AI                  | $1.84 |   102 | 1.0M |     0.664 |    0.024 |      0.090 |
|  5 | 0.753 | 0.789 | ★ Gemini 3.8 Flash    | Google                    | $2.91 |    75 | 1.0M |     0.638 |    0.073 |      0.078 |
|  6 | 0.751 | 0.787 | ★ Gemini 3.7 Flash    | Google                    | $2.87 |    94 | 1.0M |     0.621 |    0.079 |      0.087 |
|  7 | 0.740 | 0.787 | Muse Spark 1.1        | Meta                      | $3.71 |   250 | 1.0M |     0.638 |    0.024 |      0.124 |
|  8 | 0.740 | 0.744 | ★ GLM-5.3-Flash       | Zhipu AI                  | $0.30 |    77 | 1.0M |     0.640 |    0.024 |      0.079 |
|  9 | 0.739 | 0.742 | ★ Ling 3.1 Flash      | InclusionAI               | $0.21 |    45 |    — |     0.660 |    0.024 |      0.058 |
| 10 | 0.736 | 0.765 | Hy4 preview           | Tencent                   | $2.32 |    43 |    — |     0.649 |    0.060 |      0.057 |

## @designer — Design work: visual/UX judgement on image-capable models
eligible: 84 — λ 0.01024 $/quality-point (thinking ×1.857)

|  # | value |     q | model                 | org         |   $/M | tok/s |  ctx | gen 31.3% | code 7.2% | vis 21.7% | tput 18.1% | web 21.7% | agon |
| -: | ----: | ----: | --------------------- | ----------- | ----: | ----: | ---: | --------: | --------: | --------: | ---------: | --------: | ---: |
|  1 | 0.810 | 0.848 | ★ Muse Spark 1.3      | Meta        | $3.71 |   234 | 1.0M |     0.285 |     0.054 |     0.125 |      0.168 |     0.216 | 1297 |
|  2 | 0.792 | 0.796 | ★ DeepSeek-V4.1-Flash | DeepSeek    | $0.46 |   111 | 1.0M |     0.277 |     0.056 |     0.139 |      0.128 |     0.197 |    — |
|  3 | 0.767 | 0.805 | Muse Spark 1.1        | Meta        | $3.71 |   250 | 1.0M |     0.269 |     0.048 |     0.148 |      0.171 |     0.168 |    — |
|  4 | 0.753 | 0.814 | Kimi K3               | Moonshot AI | $5.99 |    80 | 1.0M |     0.282 |     0.055 |     0.152 |      0.111 |     0.214 | 1295 |
|  5 | 0.734 | 0.764 | Gemini 3.7 Flash      | Google      | $2.87 |    94 | 1.0M |     0.262 |     0.048 |     0.141 |      0.119 |     0.194 | 1222 |
|  6 | 0.732 | 0.761 | Gemini 3.8 Flash      | Google      | $2.91 |    75 | 1.0M |     0.269 |     0.051 |     0.144 |      0.107 |     0.190 | 1238 |
|  7 | 0.731 | 0.734 | ★ GLM-5.3-Flash       | Zhipu AI    | $0.30 |    77 | 1.0M |     0.270 |     0.047 |     0.138 |      0.108 |     0.170 |    — |
|  8 | 0.729 | 0.758 | Gemini 3.6 Flash      | Google      | $2.87 |   137 | 1.0M |     0.245 |     0.042 |     0.140 |      0.139 |     0.192 | 1197 |
|  9 | 0.702 | 0.713 | MiMo-V2.6-Pro         | Xiaomi      | $1.01 |    32 | 1.0M |     0.273 |     0.054 |     0.127 |      0.062 |     0.196 |    — |
| 10 | 0.701 | 0.779 | Gemini 4 Argon        | Google      | $7.65 |    36 |    — |     0.294 |     0.058 |     0.154 |      0.067 |     0.206 |    — |
focus: website — coverage 127/408 (31.1%) ok; dispersion 0.992 ok; composition ok; freshness 0.0mo ok; trust unknown; modality unknown; maintenance unknown; provenance unknown; cross-source unknown

# Suggested settings.modelRoles (best-fit #1 per role, resolved via the omp catalog).
# Selectors are openrouter/<id>; the omp-llm-role plugin writes this block daily.
modelRoles:
  default: "openrouter/deepseek/deepseek-v4.1-flash"
  smol: "openrouter/meta/muse-spark-1.3"
  slow: "openrouter/meta/muse-spark-1.3"
  vision: "openrouter/moonshotai/kimi-k3"
  plan: "openrouter/meta/muse-spark-1.3"
  commit: "openrouter/meta/muse-spark-1.3"
  tiny: "openrouter/meta/muse-spark-1.3"
  task: "openrouter/deepseek/deepseek-v4.1-flash"
  advisor: "openrouter/meta/muse-spark-1.3"
  designer: "openrouter/meta/muse-spark-1.3"
