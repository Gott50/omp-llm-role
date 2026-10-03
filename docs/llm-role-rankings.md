llm-stats.com best-fit ranking per omp model role — 400 models, 2026-10-03
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
Throughput + price: OpenRouter per-provider routes under the default price-based routing (weight 1/price² over stable standard-tier providers; p50 tok/s of routed traffic; $/M 3:1 in:out), throughput 151/400, priced 150; models without OpenRouter throughput or a billed route are not ranked.

## @default — Main workhorse: strong general coding-agent quality, sane cost
eligible: 142 — λ 0.00556 $/quality-point (thinking ×1.857)

|  # | value |     q | model                 | org                       |   $/M | tok/s |  ctx | gen 54.7% | code 18.9% | ag 12.6% | tool 10.5% | tput 3.2% |
| -: | ----: | ----: | --------------------- | ------------------------- | ----: | ----: | ---: | --------: | ---------: | -------: | ---------: | --------: |
|  1 | 0.815 | 0.818 | ★ DeepSeek-V4.1-Flash | DeepSeek                  | $0.43 |    81 | 1.0M |     0.487 |      0.149 |    0.094 |      0.068 |     0.019 |
|  2 | 0.807 | 0.827 | ★ Muse Spark 1.3      | Meta                      | $3.71 |    64 | 1.0M |     0.505 |      0.145 |    0.094 |      0.066 |     0.017 |
|  3 | 0.802 | 0.816 | GLM-5.3               | Zhipu AI                  | $2.39 |    78 | 1.0M |     0.493 |      0.145 |    0.092 |      0.066 |     0.019 |
|  4 | 0.783 | 0.788 | MiMo-V2.6-Pro         | Xiaomi                    | $1.01 |    29 | 1.0M |     0.478 |      0.144 |    0.091 |      0.065 |     0.010 |
|  5 | 0.781 | 0.793 | DeepSeek-V4-Pro-0813  | DeepSeek                  | $2.10 |    52 | 1.0M |     0.486 |      0.140 |    0.089 |      0.063 |     0.015 |
|  6 | 0.773 | 0.836 | ★ GPT-5.6 Sol         | OpenAI                    | $11.4 |    56 | 1.1M |     0.507 |      0.154 |    0.095 |      0.064 |     0.016 |
|  7 | 0.769 | 0.782 | Hy4 preview           | Tencent                   | $2.32 |    36 |    — |     0.481 |      0.138 |    0.088 |      0.063 |     0.012 |
|  8 | 0.767 | 0.769 | ★ GLM-5.3-Flash       | Zhipu AI                  | $0.36 |    51 | 1.0M |     0.475 |      0.126 |    0.089 |      0.064 |     0.015 |
|  9 | 0.763 | 0.766 | Qwen3.8 Flash         | Alibaba Cloud / Qwen Team | $0.43 |    56 | 1.0M |     0.470 |      0.130 |    0.085 |      0.064 |     0.016 |
| 10 | 0.761 | 0.776 | Gemini 3.8 Flash      | Google                    | $2.79 |   110 | 1.0M |     0.476 |      0.136 |    0.086 |      0.056 |     0.022 |

## @smol — Fast lightweight model: cheap and quick, still competent
eligible: 142 — λ 0.04091 $/quality-point

|  # | value |     q | model                        | org                   |   $/M | tok/s |  ctx | tput 40% | gen 28.6% | code 17.1% | tool 14.3% |
| -: | ----: | ----: | ---------------------------- | --------------------- | ----: | ----: | ---: | -------: | --------: | ---------: | ---------: |
|  1 | 0.717 | 0.727 | ★ DeepSeek-V4.1-Flash        | DeepSeek              | $0.23 |    81 | 1.0M |    0.246 |     0.254 |      0.135 |      0.092 |
|  2 | 0.710 | 0.792 | ★ Muse Spark 1.1             | Meta                  | $2.00 |   183 | 1.0M |    0.342 |     0.247 |      0.115 |      0.088 |
|  3 | 0.672 | 0.691 | DeepSeek-V4-Flash-Vision-Exp | DeepSeek              | $0.46 |    98 | 1.0M |    0.269 |     0.232 |      0.116 |      0.074 |
|  4 | 0.669 | 0.670 | ★ Ling 3.0 Flash             | InclusionAI           | $0.04 |   138 | 131k |    0.309 |     0.201 |      0.096 |      0.064 |
|  5 | 0.668 | 0.730 | ★ Gemini 3.8 Flash           | Google                | $1.50 |   110 | 1.0M |    0.282 |     0.248 |      0.123 |      0.077 |
|  6 | 0.668 | 0.721 | GLM-5.3                      | Zhipu AI              | $1.29 |    78 | 1.0M |    0.242 |     0.257 |      0.132 |      0.090 |
|  7 | 0.667 | 0.686 | GPT-5.6 Luna                 | OpenAI                | $0.47 |    91 | 1.1M |    0.260 |     0.231 |      0.120 |      0.076 |
|  8 | 0.659 | 0.663 | Laguna S 2.1                 | Poolside              | $0.11 |   107 | 1.0M |    0.279 |     0.215 |      0.107 |      0.062 |
|  9 | 0.659 | 0.667 | GPT-6 Luna                   | OpenAI                | $0.21 |    87 | 1.1M |    0.254 |     0.230 |      0.110 |      0.074 |
| 10 | 0.656 | 0.682 | Inkling-Small                | Thinking Machines Lab | $0.64 |   127 | 524k |    0.299 |     0.208 |      0.105 |      0.070 |

## @slow — Most capable model for hard problems; cost and speed as tiebreakers
eligible: 142 — λ 0.00263 $/quality-point (thinking ×2.714)

|  # | value |     q | model                 | org         |   $/M | tok/s |  ctx | gen 63.2% | code 18.9% | ag 13.7% | tput 4.2% |
| -: | ----: | ----: | --------------------- | ----------- | ----: | ----: | ---: | --------: | ---------: | -------: | --------: |
|  1 | 0.838 | 0.852 | ★ Muse Spark 1.3      | Meta        | $5.43 |    64 | 1.0M |     0.582 |      0.145 |    0.102 |     0.023 |
|  2 | 0.837 | 0.839 | ★ DeepSeek-V4.1-Flash | DeepSeek    | $0.64 |    81 | 1.0M |     0.562 |      0.149 |    0.102 |     0.026 |
|  3 | 0.830 | 0.839 | ★ GLM-5.3             | Zhipu AI    | $3.50 |    78 | 1.0M |     0.569 |      0.145 |    0.100 |     0.025 |
|  4 | 0.819 | 0.863 | ★ GPT-5.6 Sol         | OpenAI      | $16.6 |    56 | 1.1M |     0.585 |      0.154 |    0.103 |     0.021 |
|  5 | 0.809 | 0.817 | DeepSeek-V4-Pro-0813  | DeepSeek    | $3.07 |    52 | 1.0M |     0.560 |      0.140 |    0.096 |     0.020 |
|  6 | 0.803 | 0.807 | MiMo-V2.6-Pro         | Xiaomi      | $1.47 |    29 | 1.0M |     0.552 |      0.144 |    0.098 |     0.013 |
|  7 | 0.798 | 0.836 | Kimi K3               | Moonshot AI | $14.4 |    46 | 1.0M |     0.572 |      0.147 |    0.099 |     0.019 |
|  8 | 0.797 | 0.807 | Gemini 3.8 Flash      | Google      | $4.07 |   110 | 1.0M |     0.549 |      0.136 |    0.093 |     0.030 |
|  9 | 0.796 | 0.805 | Hy4 preview           | Tencent     | $3.39 |    36 |    — |     0.555 |      0.138 |    0.095 |     0.016 |
| 10 | 0.791 | 0.821 | GPT-6.1 Sol           | OpenAI      | $11.5 |    32 | 1.1M |     0.569 |      0.138 |    0.099 |     0.014 |

## @vision — Image understanding: vision index dominates
eligible: 75 — λ 0.00682 $/quality-point (thinking ×1.857)

|  # | value |     q | model               | org                       |   $/M | tok/s |  ctx | vis 54.2% | gen 20.8% | rea 15.6% | code 6.3% | tput 3.1% |
| -: | ----: | ----: | ------------------- | ------------------------- | ----: | ----: | ---: | --------: | --------: | --------: | --------: | --------: |
|  1 | 0.733 | 0.736 | ★ Qwen3.8 Flash     | Alibaba Cloud / Qwen Team | $0.43 |    56 | 1.0M |     0.364 |     0.179 |     0.134 |     0.043 |     0.016 |
|  2 | 0.731 | 0.756 | ★ Muse Spark 1.1    | Meta                      | $3.71 |   183 | 1.0M |     0.371 |     0.180 |     0.136 |     0.042 |     0.027 |
|  3 | 0.728 | 0.731 | DeepSeek-V4.1-Flash | DeepSeek                  | $0.43 |    81 | 1.0M |     0.343 |     0.185 |     0.134 |     0.049 |     0.019 |
|  4 | 0.721 | 0.739 | ★ Gemini 3.8 Flash  | Google                    | $2.79 |   110 | 1.0M |     0.363 |     0.181 |     0.128 |     0.045 |     0.022 |
|  5 | 0.715 | 0.717 | ★ GLM-5.3-Flash     | Zhipu AI                  | $0.36 |    51 | 1.0M |     0.346 |     0.181 |     0.133 |     0.042 |     0.015 |
|  6 | 0.703 | 0.722 | Gemini 3.7 Flash    | Google                    | $2.79 |   113 | 1.0M |     0.354 |     0.176 |     0.128 |     0.042 |     0.022 |
|  7 | 0.702 | 0.770 | ★ Kimi K3           | Moonshot AI               | $9.89 |    46 | 1.0M |     0.380 |     0.189 |     0.139 |     0.048 |     0.014 |
|  8 | 0.701 | 0.711 | Qwen3.8-27B         | Alibaba Cloud / Qwen Team | $1.41 |    75 | 262k |     0.359 |     0.169 |     0.126 |     0.040 |     0.018 |
|  9 | 0.695 | 0.773 | ★ GPT-5.6 Sol       | OpenAI                    | $11.4 |    56 | 1.1M |     0.371 |     0.193 |     0.143 |     0.051 |     0.016 |
| 10 | 0.686 | 0.693 | Qwen3.7-Plus        | Alibaba Cloud / Qwen Team | $1.04 |    51 |    — |     0.353 |     0.163 |     0.123 |     0.039 |     0.015 |

## @plan — Planning: reasoning and long-context coherence, priced so the cheapest capable planner wins
eligible: 142 — λ 0.01667 $/quality-point (thinking ×1.857)

|  # | value |     q | model               | org                       |   $/M | tok/s |  ctx | gen 80% | lc 15.6% | tput 4.4% |
| -: | ----: | ----: | ------------------- | ------------------------- | ----: | ----: | ---: | ------: | -------: | --------: |
|  1 | 0.801 | 0.863 | ★ Muse Spark 1.3    | Meta                      | $3.71 |    64 | 1.0M |   0.737 |    0.101 |     0.024 |
|  2 | 0.781 | 0.788 | ★ Qwen3.8 Flash     | Alibaba Cloud / Qwen Team | $0.43 |    56 | 1.0M |   0.686 |    0.079 |     0.023 |
|  3 | 0.774 | 0.820 | ★ Gemini 3.8 Flash  | Google                    | $2.79 |   110 | 1.0M |   0.696 |    0.093 |     0.031 |
|  4 | 0.762 | 0.770 | DeepSeek-V4.1-Flash | DeepSeek                  | $0.43 |    81 | 1.0M |   0.712 |    0.030 |     0.027 |
|  5 | 0.761 | 0.808 | Gemini 3.7 Flash    | Google                    | $2.79 |   113 | 1.0M |   0.676 |    0.100 |     0.032 |
|  6 | 0.757 | 0.796 | ★ Hy4 preview       | Tencent                   | $2.32 |    36 |    — |   0.703 |    0.076 |     0.017 |
|  7 | 0.741 | 0.756 | GPT-5.6 Luna        | OpenAI                    | $0.88 |    91 | 1.1M |   0.647 |    0.080 |     0.029 |
|  8 | 0.740 | 0.746 | ★ GLM-5.3-Flash     | Zhipu AI                  | $0.36 |    51 | 1.0M |   0.694 |    0.030 |     0.021 |
|  9 | 0.738 | 0.777 | GLM-5.3             | Zhipu AI                  | $2.39 |    78 | 1.0M |   0.720 |    0.030 |     0.027 |
| 10 | 0.732 | 0.740 | Hy3                 | Tencent                   | $0.47 |    61 | 262k |   0.629 |    0.088 |     0.024 |

## @commit — Commit messages: cheap and fast with decent general quality
eligible: 142 — λ 0.04091 $/quality-point

|  # | value |     q | model                        | org         |   $/M | tok/s |  ctx | tput 41.5% | gen 43.1% | code 15.4% |
| -: | ----: | ----: | ---------------------------- | ----------- | ----: | ----: | ---: | ---------: | --------: | ---------: |
|  1 | 0.750 | 0.760 | ★ DeepSeek-V4.1-Flash        | DeepSeek    | $0.23 |    81 | 1.0M |      0.256 |     0.383 |      0.121 |
|  2 | 0.749 | 0.831 | ★ Muse Spark 1.1             | Meta        | $2.00 |   183 | 1.0M |      0.355 |     0.372 |      0.103 |
|  3 | 0.716 | 0.778 | ★ Gemini 3.8 Flash           | Google      | $1.50 |   110 | 1.0M |      0.293 |     0.375 |      0.110 |
|  4 | 0.714 | 0.733 | DeepSeek-V4-Flash-Vision-Exp | DeepSeek    | $0.46 |    98 | 1.0M |      0.279 |     0.350 |      0.104 |
|  5 | 0.709 | 0.710 | ★ Ling 3.0 Flash             | InclusionAI | $0.04 |   138 | 131k |      0.321 |     0.303 |      0.086 |
|  6 | 0.706 | 0.725 | GPT-5.6 Luna                 | OpenAI      | $0.47 |    91 | 1.1M |      0.270 |     0.348 |      0.108 |
|  7 | 0.706 | 0.710 | Laguna S 2.1                 | Poolside    | $0.11 |   107 | 1.0M |      0.290 |     0.324 |      0.096 |
|  8 | 0.704 | 0.757 | GLM-5.3                      | Zhipu AI    | $1.29 |    78 | 1.0M |      0.251 |     0.388 |      0.118 |
|  9 | 0.702 | 0.763 | Gemini 3.7 Flash             | Google      | $1.50 |   113 | 1.0M |      0.296 |     0.364 |      0.103 |
| 10 | 0.700 | 0.709 | GPT-6 Luna                   | OpenAI      | $0.21 |    87 | 1.1M |      0.264 |     0.346 |      0.098 |

## @tiny — Background tasks (titles, memory): cheapest and fastest wins
eligible: 142 — λ 0.03333 $/quality-point

|  # | value |     q | model                     | org                   |   $/M | tok/s |  ctx | tput 58.3% | gen 41.7% |
| -: | ----: | ----: | ------------------------- | --------------------- | ----: | ----: | ---: | ---------: | --------: |
|  1 | 0.798 | 0.810 | ★ Mercury 2               | Inception             | $0.38 |   308 | 128k |      0.583 |     0.227 |
|  2 | 0.792 | 0.859 | ★ Muse Spark 1.1          | Meta                  | $2.00 |   183 | 1.0M |      0.499 |     0.360 |
|  3 | 0.761 | 0.763 | ★ Ling 3.0 Flash Fin      | InclusionAI           | $0.07 |   128 | 262k |      0.437 |     0.327 |
|  4 | 0.745 | 0.748 | Nemotron 3 Nano (30B A3B) | NVIDIA                | $0.09 |   226 | 262k |      0.535 |     0.214 |
|  5 | 0.742 | 0.744 | ★ Ling 3.0 Flash          | InclusionAI           | $0.04 |   138 | 131k |      0.451 |     0.293 |
|  6 | 0.724 | 0.774 | Gemini 3.8 Flash          | Google                | $1.50 |   110 | 1.0M |      0.411 |     0.362 |
|  7 | 0.722 | 0.730 | DeepSeek-V4.1-Flash       | DeepSeek              | $0.23 |    81 | 1.0M |      0.359 |     0.371 |
|  8 | 0.719 | 0.749 | Gemini 3.5 Flash-Lite     | Google                | $0.89 |   175 | 1.0M |      0.491 |     0.259 |
|  9 | 0.718 | 0.740 | Inkling-Small             | Thinking Machines Lab | $0.64 |   127 | 524k |      0.436 |     0.304 |
| 10 | 0.718 | 0.768 | Gemini 3.7 Flash          | Google                | $1.50 |   113 | 1.0M |      0.416 |     0.352 |

## @task — Subagents: agentic + tool calling, moderate cost sensitivity
eligible: 142 — λ 0.00747 $/quality-point (thinking ×1.857)

|  # | value |     q | model                 | org                       |   $/M | tok/s |  ctx | ag 29.9% | tool 20.7% | code 18.4% | gen 25.3% | tput 5.7% |
| -: | ----: | ----: | --------------------- | ------------------------- | ----: | ----: | ---: | -------: | ---------: | ---------: | --------: | --------: |
|  1 | 0.758 | 0.761 | ★ DeepSeek-V4.1-Flash | DeepSeek                  | $0.43 |    81 | 1.0M |    0.223 |      0.133 |      0.145 |     0.225 |     0.035 |
|  2 | 0.734 | 0.752 | GLM-5.3               | Zhipu AI                  | $2.39 |    78 | 1.0M |    0.218 |      0.130 |      0.141 |     0.228 |     0.035 |
|  3 | 0.730 | 0.758 | Muse Spark 1.3        | Meta                      | $3.71 |    64 | 1.0M |    0.222 |      0.131 |      0.141 |     0.233 |     0.031 |
|  4 | 0.714 | 0.722 | MiMo-V2.6-Pro         | Xiaomi                    | $1.01 |    29 | 1.0M |    0.214 |      0.128 |      0.140 |     0.221 |     0.018 |
|  5 | 0.706 | 0.722 | DeepSeek-V4-Pro-0813  | DeepSeek                  | $2.10 |    52 | 1.0M |    0.210 |      0.123 |      0.136 |     0.224 |     0.028 |
|  6 | 0.702 | 0.705 | ★ GLM-5.3-Flash       | Zhipu AI                  | $0.36 |    51 | 1.0M |    0.210 |      0.126 |      0.122 |     0.219 |     0.027 |
|  7 | 0.698 | 0.701 | Qwen3.8 Flash         | Alibaba Cloud / Qwen Team | $0.43 |    56 | 1.0M |    0.202 |      0.126 |      0.126 |     0.217 |     0.029 |
|  8 | 0.693 | 0.710 | Hy4 preview           | Tencent                   | $2.32 |    36 |    — |    0.208 |      0.123 |      0.134 |     0.222 |     0.022 |
|  9 | 0.692 | 0.720 | Muse Spark 1.1        | Meta                      | $3.71 |   183 | 1.0M |    0.201 |      0.127 |      0.124 |     0.219 |     0.049 |
| 10 | 0.685 | 0.706 | Gemini 3.8 Flash      | Google                    | $2.79 |   110 | 1.0M |    0.203 |      0.111 |      0.132 |     0.220 |     0.041 |

## @advisor — Advisor/watchdog: deep reasoning over long context
eligible: 142 — λ 0.01250 $/quality-point (thinking ×1.857)

|  # | value |     q | model               | org                       |   $/M | tok/s |  ctx | gen 74.3% | lc 12.6% | tput 13.1% |
| -: | ----: | ----: | ------------------- | ------------------------- | ----: | ----: | ---: | --------: | -------: | ---------: |
|  1 | 0.792 | 0.838 | ★ Muse Spark 1.3    | Meta                      | $3.71 |    64 | 1.0M |     0.685 |    0.081 |      0.072 |
|  2 | 0.779 | 0.814 | ★ Gemini 3.8 Flash  | Google                    | $2.79 |   110 | 1.0M |     0.646 |    0.075 |      0.092 |
|  3 | 0.768 | 0.802 | Gemini 3.7 Flash    | Google                    | $2.79 |   113 | 1.0M |     0.628 |    0.080 |      0.093 |
|  4 | 0.763 | 0.768 | ★ Qwen3.8 Flash     | Alibaba Cloud / Qwen Team | $0.43 |    56 | 1.0M |     0.638 |    0.064 |      0.066 |
|  5 | 0.761 | 0.767 | DeepSeek-V4.1-Flash | DeepSeek                  | $0.43 |    81 | 1.0M |     0.662 |    0.024 |      0.081 |
|  6 | 0.743 | 0.773 | ★ GLM-5.3           | Zhipu AI                  | $2.39 |    78 | 1.0M |     0.669 |    0.024 |      0.079 |
|  7 | 0.740 | 0.751 | GPT-5.6 Luna        | OpenAI                    | $0.88 |    91 | 1.1M |     0.601 |    0.065 |      0.085 |
|  8 | 0.735 | 0.764 | Hy4 preview         | Tencent                   | $2.32 |    36 |    — |     0.654 |    0.061 |      0.049 |
|  9 | 0.733 | 0.779 | Muse Spark 1.1      | Meta                      | $3.71 |   183 | 1.0M |     0.643 |    0.024 |      0.112 |
| 10 | 0.728 | 0.732 | ★ GLM-5.3-Flash     | Zhipu AI                  | $0.36 |    51 | 1.0M |     0.645 |    0.024 |      0.063 |

## @designer — Design work: visual/UX judgement on image-capable models
eligible: 87 — λ 0.01024 $/quality-point (thinking ×1.857)

|  # | value |     q | model                 | org         |   $/M | tok/s |  ctx | gen 31.3% | code 7.2% | vis 21.7% | tput 18.1% | web 21.7% | agon |
| -: | ----: | ----: | --------------------- | ----------- | ----: | ----: | ---: | --------: | --------: | --------: | ---------: | --------: | ---: |
|  1 | 0.780 | 0.784 | ★ DeepSeek-V4.1-Flash | DeepSeek    | $0.43 |    81 | 1.0M |     0.279 |     0.057 |     0.137 |      0.111 |     0.200 |    — |
|  2 | 0.763 | 0.791 | ★ Gemini 3.8 Flash    | Google      | $2.79 |   110 | 1.0M |     0.272 |     0.052 |     0.145 |      0.127 |     0.194 | 1230 |
|  3 | 0.753 | 0.782 | Gemini 3.7 Flash      | Google      | $2.79 |   113 | 1.0M |     0.265 |     0.048 |     0.142 |      0.129 |     0.198 | 1214 |
|  4 | 0.750 | 0.788 | Muse Spark 1.1        | Meta        | $3.71 |   183 | 1.0M |     0.271 |     0.049 |     0.149 |      0.154 |     0.166 |    — |
|  5 | 0.747 | 0.785 | Muse Spark 1.3        | Meta        | $3.71 |    64 | 1.0M |     0.289 |     0.055 |     0.126 |      0.099 |     0.216 | 1289 |
|  6 | 0.714 | 0.742 | Gemini 3.6 Flash      | Google      | $2.79 |    96 | 1.0M |     0.246 |     0.043 |     0.140 |      0.120 |     0.193 | 1187 |
|  7 | 0.712 | 0.716 | ★ GLM-5.3-Flash       | Zhipu AI    | $0.36 |    51 | 1.0M |     0.272 |     0.048 |     0.139 |      0.086 |     0.171 |    — |
|  8 | 0.711 | 0.722 | MiMo-V2.6-Pro         | Xiaomi      | $1.01 |    29 | 1.0M |     0.274 |     0.055 |     0.128 |      0.057 |     0.209 |    — |
|  9 | 0.696 | 0.700 | GPT-6 Luna            | OpenAI      | $0.39 |    87 | 1.1M |     0.252 |     0.046 |     0.114 |      0.115 |     0.173 |    — |
| 10 | 0.685 | 0.786 | Kimi K3               | Moonshot AI | $9.89 |    46 | 1.0M |     0.284 |     0.056 |     0.152 |      0.081 |     0.214 | 1285 |

# Suggested settings.modelRoles (best-fit #1 per role, resolved via the omp catalog).
# Selectors are openrouter/<id>; the omp-llm-role plugin writes this block daily.
modelRoles:
  default: "openrouter/deepseek/deepseek-v4.1-flash"
  smol: "openrouter/deepseek/deepseek-v4.1-flash"
  slow: "openrouter/meta/muse-spark-1.3"
  vision: "openrouter/qwen/qwen3.8-flash"
  plan: "openrouter/meta/muse-spark-1.3"
  commit: "openrouter/deepseek/deepseek-v4.1-flash"
  tiny: "openrouter/inception/mercury-2"
  task: "openrouter/deepseek/deepseek-v4.1-flash"
  advisor: "openrouter/meta/muse-spark-1.3"
  designer: "openrouter/deepseek/deepseek-v4.1-flash"
