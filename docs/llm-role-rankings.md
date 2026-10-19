llm-stats.com best-fit ranking per omp model role — 408 models, 2026-10-19
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
|  1 | 0.807 | 0.809 | ★ DeepSeek-V4.1-Flash | DeepSeek    | $0.37 |    75 | 1.0M |     0.483 |      0.146 |    0.093 |      0.069 |     0.019 |
|  2 | 0.799 | 0.841 | ★ Gemini 4 Argon      | Google      | $7.65 |    38 |    — |     0.516 |      0.149 |    0.096 |      0.068 |     0.012 |
|  3 | 0.794 | 0.806 | GLM-5.3               | Zhipu AI    | $2.09 |    73 | 1.0M |     0.488 |      0.142 |    0.090 |      0.067 |     0.018 |
|  4 | 0.789 | 0.810 | ★ Muse Spark 1.3      | Meta        | $3.71 |    70 | 1.0M |     0.495 |      0.139 |    0.091 |      0.067 |     0.018 |
|  5 | 0.776 | 0.793 | DeepSeek-V4-Pro-0813  | DeepSeek    | $3.09 |    78 | 1.0M |     0.484 |      0.139 |    0.088 |      0.063 |     0.019 |
|  6 | 0.776 | 0.781 | MiMo-V2.6-Pro         | Xiaomi      | $1.01 |    29 | 1.0M |     0.476 |      0.141 |    0.089 |      0.066 |     0.010 |
|  7 | 0.773 | 0.811 | ★ Kimi K3             | Moonshot AI | $6.81 |    52 | 1.0M |     0.494 |      0.144 |    0.091 |      0.067 |     0.015 |
|  8 | 0.766 | 0.809 | GPT-6.1 Sol           | OpenAI      | $7.89 |    40 | 1.1M |     0.506 |      0.141 |    0.092 |      0.057 |     0.013 |
|  9 | 0.764 | 0.777 | Hy4 preview           | Tencent     | $2.32 |    37 |    — |     0.478 |      0.137 |    0.087 |      0.063 |     0.012 |
| 10 | 0.763 | 0.765 | ★ GLM-5.3-Flash       | Zhipu AI    | $0.33 |    66 | 1.0M |     0.473 |      0.123 |    0.087 |      0.065 |     0.018 |

## @smol — Fast lightweight model: cheap and quick, still competent
eligible: 140 — λ 0.04091 $/quality-point

|  # | value |     q | model                        | org                   |   $/M | tok/s |  ctx | tput 40% | gen 28.6% | code 17.1% | tool 14.3% |
| -: | ----: | ----: | ---------------------------- | --------------------- | ----: | ----: | ---: | -------: | --------: | ---------: | ---------: |
|  1 | 0.706 | 0.714 | ★ DeepSeek-V4.1-Flash        | DeepSeek              | $0.20 |    75 | 1.0M |    0.237 |     0.252 |      0.132 |      0.094 |
|  2 | 0.687 | 0.713 | Inkling-Small                | Thinking Machines Lab | $0.64 |   167 | 524k |    0.331 |     0.208 |      0.104 |      0.070 |
|  3 | 0.669 | 0.671 | ★ Ling 3.0 Flash             | InclusionAI           | $0.04 |   140 | 131k |    0.310 |     0.200 |      0.096 |      0.065 |
|  4 | 0.662 | 0.744 | ★ Muse Spark 1.1             | Meta                  | $2.00 |   127 | 1.0M |    0.298 |     0.245 |      0.113 |      0.087 |
|  5 | 0.661 | 0.669 | GLM-5.3-Flash                | Zhipu AI              | $0.18 |    66 | 1.0M |    0.223 |     0.247 |      0.112 |      0.088 |
|  6 | 0.661 | 0.707 | GLM-5.3                      | Zhipu AI              | $1.12 |    73 | 1.0M |    0.233 |     0.255 |      0.129 |      0.091 |
|  7 | 0.652 | 0.670 | DeepSeek-V4-Flash-Vision-Exp | DeepSeek              | $0.43 |    83 | 1.0M |    0.249 |     0.231 |      0.115 |      0.075 |
|  8 | 0.652 | 0.733 | Muse Spark 1.2               | Meta                  | $2.00 |   224 | 1.0M |    0.366 |     0.204 |      0.102 |      0.062 |
|  9 | 0.647 | 0.667 | GPT-5.6 Luna                 | OpenAI                | $0.47 |    80 | 1.1M |    0.244 |     0.229 |      0.117 |      0.076 |
| 10 | 0.643 | 0.707 | Gemini 3.8 Flash             | Google                | $1.57 |    95 | 1.0M |    0.264 |     0.247 |      0.119 |      0.076 |

## @slow — Most capable model for hard problems; cost and speed as tiebreakers
eligible: 140 — λ 0.00263 $/quality-point (thinking ×2.714)

|  # | value |     q | model                 | org         |   $/M | tok/s |  ctx | gen 63.2% | code 18.9% | ag 13.7% | tput 4.2% |
| -: | ----: | ----: | --------------------- | ----------- | ----: | ----: | ---: | --------: | ---------: | -------: | --------: |
|  1 | 0.835 | 0.865 | ★ Gemini 4 Argon      | Google      | $11.2 |    38 |    — |     0.595 |      0.149 |    0.104 |     0.016 |
|  2 | 0.827 | 0.829 | ★ DeepSeek-V4.1-Flash | DeepSeek    | $0.54 |    75 | 1.0M |     0.558 |      0.146 |    0.100 |     0.025 |
|  3 | 0.819 | 0.827 | GLM-5.3               | Zhipu AI    | $3.05 |    73 | 1.0M |     0.563 |      0.142 |    0.098 |     0.025 |
|  4 | 0.818 | 0.833 | ★ Muse Spark 1.3      | Meta        | $5.43 |    70 | 1.0M |     0.572 |      0.139 |    0.099 |     0.024 |
|  5 | 0.812 | 0.842 | GPT-6.1 Sol           | OpenAI      | $11.5 |    40 | 1.1M |     0.584 |      0.141 |    0.100 |     0.017 |
|  6 | 0.806 | 0.833 | Kimi K3               | Moonshot AI | $9.95 |    52 | 1.0M |     0.570 |      0.144 |    0.098 |     0.020 |
|  7 | 0.806 | 0.818 | DeepSeek-V4-Pro-0813  | DeepSeek    | $4.51 |    78 | 1.0M |     0.559 |      0.139 |    0.095 |     0.025 |
|  8 | 0.796 | 0.800 | MiMo-V2.6-Pro         | Xiaomi      | $1.47 |    29 | 1.0M |     0.549 |      0.141 |    0.097 |     0.013 |
|  9 | 0.792 | 0.852 | GPT-5.6 Sol           | OpenAI      | $22.9 |    54 | 1.1M |     0.580 |      0.150 |    0.101 |     0.021 |
| 10 | 0.790 | 0.798 | Hy4 preview           | Tencent     | $3.39 |    37 |    — |     0.552 |      0.137 |    0.094 |     0.016 |

## @vision — Image understanding: vision index dominates
eligible: 73 — λ 0.00682 $/quality-point (thinking ×1.857)

|  # | value |     q | model                 | org                       |   $/M | tok/s |  ctx | vis 54.2% | gen 20.8% | rea 15.6% | code 6.3% | tput 3.1% |
| -: | ----: | ----: | --------------------- | ------------------------- | ----: | ----: | ---: | --------: | --------: | --------: | --------: | --------: |
|  1 | 0.733 | 0.786 | ★ Gemini 4 Argon      | Google                    | $7.65 |    38 |    — |     0.385 |     0.196 |     0.143 |     0.049 |     0.012 |
|  2 | 0.728 | 0.731 | ★ Qwen3.8 Flash       | Alibaba Cloud / Qwen Team | $0.43 |    47 | 1.0M |     0.363 |     0.178 |     0.133 |     0.042 |     0.014 |
|  3 | 0.727 | 0.730 | ★ DeepSeek-V4.1-Flash | DeepSeek                  | $0.37 |    75 | 1.0M |     0.345 |     0.184 |     0.134 |     0.048 |     0.018 |
|  4 | 0.724 | 0.750 | ★ Muse Spark 1.1      | Meta                      | $3.71 |   127 | 1.0M |     0.371 |     0.179 |     0.136 |     0.041 |     0.023 |
|  5 | 0.722 | 0.768 | ★ Kimi K3             | Moonshot AI               | $6.81 |    52 | 1.0M |     0.378 |     0.188 |     0.139 |     0.048 |     0.015 |
|  6 | 0.715 | 0.769 | GPT-6.1 Sol           | OpenAI                    | $7.89 |    40 | 1.1M |     0.377 |     0.193 |     0.140 |     0.047 |     0.013 |
|  7 | 0.714 | 0.734 | ★ Gemini 3.8 Flash    | Google                    | $2.91 |    95 | 1.0M |     0.361 |     0.180 |     0.129 |     0.043 |     0.021 |
|  8 | 0.713 | 0.715 | ★ GLM-5.3-Flash       | Zhipu AI                  | $0.33 |    66 | 1.0M |     0.344 |     0.180 |     0.133 |     0.041 |     0.017 |
|  9 | 0.702 | 0.707 | Qwen3.8-27B           | Alibaba Cloud / Qwen Team | $0.72 |    55 | 262k |     0.358 |     0.168 |     0.126 |     0.039 |     0.016 |
| 10 | 0.697 | 0.717 | Gemini 3.7 Flash      | Google                    | $2.87 |    86 | 1.0M |     0.353 |     0.176 |     0.127 |     0.041 |     0.020 |

## @plan — Planning: reasoning and long-context coherence, priced so the cheapest capable planner wins
eligible: 140 — λ 0.01667 $/quality-point (thinking ×1.857)

|  # | value |     q | model                 | org                       |   $/M | tok/s |  ctx | gen 80% | lc 15.6% | tput 4.4% |
| -: | ----: | ----: | --------------------- | ------------------------- | ----: | ----: | ---: | ------: | -------: | --------: |
|  1 | 0.789 | 0.851 | ★ Muse Spark 1.3      | Meta                      | $3.71 |    70 | 1.0M |   0.724 |    0.101 |     0.025 |
|  2 | 0.774 | 0.781 | ★ Qwen3.8 Flash       | Alibaba Cloud / Qwen Team | $0.43 |    47 | 1.0M |   0.682 |    0.079 |     0.020 |
|  3 | 0.764 | 0.813 | ★ Gemini 3.8 Flash    | Google                    | $2.91 |    95 | 1.0M |   0.692 |    0.091 |     0.029 |
|  4 | 0.757 | 0.763 | ★ DeepSeek-V4.1-Flash | DeepSeek                  | $0.37 |    75 | 1.0M |   0.707 |    0.030 |     0.026 |
|  5 | 0.755 | 0.802 | ★ Gemini 3.7 Flash    | Google                    | $2.87 |    86 | 1.0M |   0.676 |    0.098 |     0.028 |
|  6 | 0.752 | 0.790 | ★ Hy4 preview         | Tencent                   | $2.32 |    37 |    — |   0.699 |    0.075 |     0.017 |
|  7 | 0.742 | 0.870 | ★ Gemini 4 Argon      | Google                    | $7.65 |    38 |    — |   0.754 |    0.098 |     0.017 |
|  8 | 0.740 | 0.746 | ★ GLM-5.3-Flash       | Zhipu AI                  | $0.33 |    66 | 1.0M |   0.691 |    0.030 |     0.025 |
|  9 | 0.735 | 0.749 | GPT-5.6 Luna          | OpenAI                    | $0.88 |    80 | 1.1M |   0.642 |    0.080 |     0.027 |
| 10 | 0.735 | 0.769 | GLM-5.3               | Zhipu AI                  | $2.09 |    73 | 1.0M |   0.713 |    0.030 |     0.026 |

## @commit — Commit messages: cheap and fast with decent general quality
eligible: 140 — λ 0.04091 $/quality-point

|  # | value |     q | model                        | org                   |   $/M | tok/s |  ctx | tput 41.5% | gen 43.1% | code 15.4% |
| -: | ----: | ----: | ---------------------------- | --------------------- | ----: | ----: | ---: | ---------: | --------: | ---------: |
|  1 | 0.736 | 0.745 | ★ DeepSeek-V4.1-Flash        | DeepSeek              | $0.20 |    75 | 1.0M |      0.246 |     0.380 |      0.118 |
|  2 | 0.724 | 0.750 | ★ Inkling-Small              | Thinking Machines Lab | $0.64 |   167 | 524k |      0.344 |     0.313 |      0.094 |
|  3 | 0.709 | 0.710 | ★ Ling 3.0 Flash             | InclusionAI           | $0.04 |   140 | 131k |      0.322 |     0.302 |      0.086 |
|  4 | 0.699 | 0.781 | ★ Muse Spark 1.1             | Meta                  | $2.00 |   127 | 1.0M |      0.310 |     0.370 |      0.101 |
|  5 | 0.697 | 0.779 | Muse Spark 1.2               | Meta                  | $2.00 |   224 | 1.0M |      0.380 |     0.308 |      0.091 |
|  6 | 0.696 | 0.703 | GLM-5.3-Flash                | Zhipu AI              | $0.18 |    66 | 1.0M |      0.231 |     0.372 |      0.100 |
|  7 | 0.695 | 0.741 | GLM-5.3                      | Zhipu AI              | $1.12 |    73 | 1.0M |      0.242 |     0.384 |      0.115 |
|  8 | 0.692 | 0.710 | DeepSeek-V4-Flash-Vision-Exp | DeepSeek              | $0.43 |    83 | 1.0M |      0.259 |     0.348 |      0.103 |
|  9 | 0.690 | 0.754 | ★ Gemini 3.8 Flash           | Google                | $1.57 |    95 | 1.0M |      0.275 |     0.373 |      0.106 |
| 10 | 0.685 | 0.704 | GPT-5.6 Luna                 | OpenAI                | $0.47 |    80 | 1.1M |      0.254 |     0.346 |      0.105 |

## @tiny — Background tasks (titles, memory): cheapest and fastest wins
eligible: 140 — λ 0.03333 $/quality-point

|  # | value |     q | model                         | org                       |   $/M | tok/s |  ctx | tput 58.3% | gen 41.7% |
| -: | ----: | ----: | ----------------------------- | ------------------------- | ----: | ----: | ---: | ---------: | --------: |
|  1 | 0.769 | 0.782 | ★ Mercury 2                   | Inception                 | $0.38 |   255 | 128k |      0.555 |     0.227 |
|  2 | 0.765 | 0.831 | ★ Muse Spark 1.2              | Meta                      | $2.00 |   224 | 1.0M |      0.533 |     0.298 |
|  3 | 0.764 | 0.786 | ★ Inkling-Small               | Thinking Machines Lab     | $0.64 |   167 | 524k |      0.483 |     0.303 |
|  4 | 0.743 | 0.745 | ★ Ling 3.0 Flash              | InclusionAI               | $0.04 |   140 | 131k |      0.453 |     0.292 |
|  5 | 0.738 | 0.756 | Gemini 3.1 Flash-Lite         | Google                    | $0.56 |   176 | 1.0M |      0.492 |     0.265 |
|  6 | 0.726 | 0.793 | Muse Spark 1.1                | Meta                      | $2.00 |   127 | 1.0M |      0.435 |     0.358 |
|  7 | 0.717 | 0.768 | Gemini 3.6 Flash              | Google                    | $1.54 |   132 | 1.0M |      0.443 |     0.325 |
|  8 | 0.707 | 0.713 | DeepSeek-V4.1-Flash           | DeepSeek                  | $0.20 |    75 | 1.0M |      0.345 |     0.368 |
|  9 | 0.705 | 0.707 | Laguna XS 2.1                 | Poolside                  | $0.07 |   161 | 262k |      0.477 |     0.231 |
| 10 | 0.702 | 0.743 | Qwen3-235B-A22B-Thinking-2507 | Alibaba Cloud / Qwen Team | $1.21 |   177 |    — |      0.493 |     0.250 |

## @task — Subagents: agentic + tool calling, moderate cost sensitivity
eligible: 140 — λ 0.00747 $/quality-point (thinking ×1.857)

|  # | value |     q | model                 | org                       |   $/M | tok/s |  ctx | ag 29.9% | tool 20.7% | code 18.4% | gen 25.3% | tput 5.7% |
| -: | ----: | ----: | --------------------- | ------------------------- | ----: | ----: | ---: | -------: | ---------: | ---------: | --------: | --------: |
|  1 | 0.750 | 0.753 | ★ DeepSeek-V4.1-Flash | DeepSeek                  | $0.37 |    75 | 1.0M |    0.219 |      0.136 |      0.141 |     0.223 |     0.034 |
|  2 | 0.726 | 0.742 | GLM-5.3               | Zhipu AI                  | $2.09 |    73 | 1.0M |    0.213 |      0.131 |      0.138 |     0.225 |     0.033 |
|  3 | 0.716 | 0.743 | Muse Spark 1.3        | Meta                      | $3.71 |    70 | 1.0M |    0.215 |      0.132 |      0.134 |     0.229 |     0.033 |
|  4 | 0.710 | 0.767 | ★ Gemini 4 Argon      | Google                    | $7.65 |    38 |    — |    0.228 |      0.134 |      0.145 |     0.238 |     0.022 |
|  5 | 0.707 | 0.715 | MiMo-V2.6-Pro         | Xiaomi                    | $1.01 |    29 | 1.0M |    0.211 |      0.129 |      0.137 |     0.220 |     0.018 |
|  6 | 0.702 | 0.725 | DeepSeek-V4-Pro-0813  | DeepSeek                  | $3.09 |    78 | 1.0M |    0.208 |      0.124 |      0.135 |     0.224 |     0.035 |
|  7 | 0.700 | 0.703 | ★ GLM-5.3-Flash       | Zhipu AI                  | $0.33 |    66 | 1.0M |    0.206 |      0.127 |      0.120 |     0.218 |     0.032 |
|  8 | 0.692 | 0.743 | Kimi K3               | Moonshot AI               | $6.81 |    52 | 1.0M |    0.215 |      0.132 |      0.140 |     0.228 |     0.028 |
|  9 | 0.688 | 0.691 | Qwen3.8 Flash         | Alibaba Cloud / Qwen Team | $0.43 |    47 | 1.0M |    0.198 |      0.127 |      0.124 |     0.216 |     0.026 |
| 10 | 0.687 | 0.705 | Hy4 preview           | Tencent                   | $2.32 |    37 |    — |    0.205 |      0.124 |      0.133 |     0.221 |     0.022 |

## @advisor — Advisor/watchdog: deep reasoning over long context
eligible: 140 — λ 0.01250 $/quality-point (thinking ×1.857)

|  # | value |     q | model                 | org                       |   $/M | tok/s |  ctx | gen 74.3% | lc 12.6% | tput 13.1% |
| -: | ----: | ----: | --------------------- | ------------------------- | ----: | ----: | ---: | --------: | -------: | ---------: |
|  1 | 0.783 | 0.830 | ★ Muse Spark 1.3      | Meta                      | $3.71 |    70 | 1.0M |     0.673 |    0.082 |      0.075 |
|  2 | 0.767 | 0.803 | ★ Gemini 3.8 Flash    | Google                    | $2.91 |    95 | 1.0M |     0.643 |    0.073 |      0.087 |
|  3 | 0.755 | 0.790 | ★ Gemini 3.7 Flash    | Google                    | $2.87 |    86 | 1.0M |     0.628 |    0.079 |      0.083 |
|  4 | 0.754 | 0.759 | ★ DeepSeek-V4.1-Flash | DeepSeek                  | $0.37 |    75 | 1.0M |     0.657 |    0.024 |      0.078 |
|  5 | 0.752 | 0.757 | Qwen3.8 Flash         | Alibaba Cloud / Qwen Team | $0.43 |    47 | 1.0M |     0.634 |    0.063 |      0.060 |
|  6 | 0.737 | 0.764 | ★ GLM-5.3             | Zhipu AI                  | $2.09 |    73 | 1.0M |     0.663 |    0.024 |      0.076 |
|  7 | 0.735 | 0.831 | ★ Gemini 4 Argon      | Google                    | $7.65 |    38 |    — |     0.700 |    0.079 |      0.051 |
|  8 | 0.735 | 0.739 | ★ GLM-5.3-Flash       | Zhipu AI                  | $0.33 |    66 | 1.0M |     0.642 |    0.024 |      0.073 |
|  9 | 0.731 | 0.760 | Hy4 preview           | Tencent                   | $2.32 |    37 |    — |     0.649 |    0.060 |      0.050 |
| 10 | 0.730 | 0.741 | GPT-5.6 Luna          | OpenAI                    | $0.88 |    80 | 1.1M |     0.597 |    0.065 |      0.080 |

## @designer — Design work: visual/UX judgement on image-capable models
eligible: 87 — λ 0.01024 $/quality-point (thinking ×1.857)

|  # | value |     q | model                 | org         |   $/M | tok/s |  ctx | gen 31.3% | code 7.2% | vis 21.7% | tput 18.1% | web 21.7% | agon |
| -: | ----: | ----: | --------------------- | ----------- | ----: | ----: | ---: | --------: | --------: | --------: | ---------: | --------: | ---: |
|  1 | 0.771 | 0.775 | ★ DeepSeek-V4.1-Flash | DeepSeek    | $0.37 |    75 | 1.0M |     0.277 |     0.056 |     0.138 |      0.107 |     0.197 |    — |
|  2 | 0.744 | 0.774 | Gemini 3.8 Flash      | Google      | $2.91 |    95 | 1.0M |     0.271 |     0.050 |     0.144 |      0.119 |     0.189 | 1236 |
|  3 | 0.741 | 0.779 | ★ Muse Spark 1.3      | Meta        | $3.71 |    70 | 1.0M |     0.283 |     0.053 |     0.125 |      0.103 |     0.214 | 1296 |
|  4 | 0.730 | 0.760 | Gemini 3.7 Flash      | Google      | $2.87 |    86 | 1.0M |     0.265 |     0.047 |     0.141 |      0.114 |     0.192 | 1223 |
|  5 | 0.727 | 0.765 | Muse Spark 1.1        | Meta        | $3.71 |   127 | 1.0M |     0.269 |     0.048 |     0.148 |      0.135 |     0.165 |    — |
|  6 | 0.725 | 0.755 | Gemini 3.6 Flash      | Google      | $2.87 |   132 | 1.0M |     0.244 |     0.042 |     0.140 |      0.137 |     0.190 | 1194 |
|  7 | 0.721 | 0.724 | ★ GLM-5.3-Flash       | Zhipu AI    | $0.33 |    66 | 1.0M |     0.270 |     0.047 |     0.138 |      0.101 |     0.168 |    — |
|  8 | 0.718 | 0.788 | ★ Kimi K3             | Moonshot AI | $6.81 |    52 | 1.0M |     0.283 |     0.055 |     0.152 |      0.088 |     0.211 | 1292 |
|  9 | 0.702 | 0.781 | Gemini 4 Argon        | Google      | $7.65 |    38 |    — |     0.295 |     0.057 |     0.154 |      0.070 |     0.204 |    — |
| 10 | 0.698 | 0.709 | MiMo-V2.6-Pro         | Xiaomi      | $1.01 |    29 | 1.0M |     0.272 |     0.054 |     0.127 |      0.056 |     0.199 |    — |
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
