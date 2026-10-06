llm-stats.com best-fit ranking per omp model role — 400 models, 2026-10-06
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
eligible: 143 — λ 0.00556 $/quality-point (thinking ×1.857)

|  # | value |     q | model                 | org                       |   $/M | tok/s |  ctx | gen 54.7% | code 18.9% | ag 12.6% | tool 10.5% | tput 3.2% |
| -: | ----: | ----: | --------------------- | ------------------------- | ----: | ----: | ---: | --------: | ---------: | -------: | ---------: | --------: |
|  1 | 0.811 | 0.817 | ★ DeepSeek-V4.1-Flash | DeepSeek                  | $1.11 |    79 | 1.0M |     0.487 |      0.149 |    0.094 |      0.068 |     0.019 |
|  2 | 0.805 | 0.826 | ★ Muse Spark 1.3      | Meta                      | $3.71 |    56 | 1.0M |     0.505 |      0.145 |    0.094 |      0.066 |     0.016 |
|  3 | 0.790 | 0.815 | GLM-5.3               | Zhipu AI                  | $4.59 |    75 | 1.0M |     0.493 |      0.145 |    0.092 |      0.066 |     0.019 |
|  4 | 0.783 | 0.797 | DeepSeek-V4-Pro-0813  | DeepSeek                  | $2.51 |    86 | 1.0M |     0.486 |      0.140 |    0.089 |      0.063 |     0.020 |
|  5 | 0.783 | 0.788 | ★ MiMo-V2.6-Pro       | Xiaomi                    | $1.01 |    29 | 1.0M |     0.478 |      0.144 |    0.091 |      0.065 |     0.010 |
|  6 | 0.772 | 0.835 | ★ GPT-5.6 Sol         | OpenAI                    | $11.4 |    52 | 1.1M |     0.507 |      0.154 |    0.095 |      0.064 |     0.015 |
|  7 | 0.771 | 0.783 | Hy4 preview           | Tencent                   | $2.32 |    40 |    — |     0.481 |      0.138 |    0.088 |      0.063 |     0.013 |
|  8 | 0.769 | 0.816 | Kimi K3               | Moonshot AI               | $8.49 |    55 | 1.0M |     0.495 |      0.147 |    0.092 |      0.067 |     0.016 |
|  9 | 0.764 | 0.766 | ★ Qwen3.8 Flash       | Alibaba Cloud / Qwen Team | $0.43 |    58 | 1.0M |     0.470 |      0.130 |    0.085 |      0.064 |     0.016 |
| 10 | 0.763 | 0.765 | ★ GLM-5.3-Flash       | Zhipu AI                  | $0.35 |    35 | 1.0M |     0.475 |      0.126 |    0.089 |      0.064 |     0.012 |

## @smol — Fast lightweight model: cheap and quick, still competent
eligible: 143 — λ 0.04091 $/quality-point

|  # | value |     q | model                          | org                       |   $/M | tok/s |  ctx | tput 40% | gen 28.6% | code 17.1% | tool 14.3% |
| -: | ----: | ----: | ------------------------------ | ------------------------- | ----: | ----: | ---: | -------: | --------: | ---------: | ---------: |
|  1 | 0.711 | 0.793 | ★ Muse Spark 1.1               | Meta                      | $2.00 |   185 | 1.0M |    0.343 |     0.247 |      0.115 |      0.088 |
|  2 | 0.700 | 0.724 | ★ DeepSeek-V4.1-Flash          | DeepSeek                  | $0.60 |    79 | 1.0M |    0.243 |     0.254 |      0.135 |      0.092 |
|  3 | 0.663 | 0.718 | DeepSeek-V4-Pro-0813           | DeepSeek                  | $1.35 |    86 | 1.0M |    0.253 |     0.253 |      0.127 |      0.085 |
|  4 | 0.662 | 0.724 | Gemini 3.8 Flash               | Google                    | $1.50 |   105 | 1.0M |    0.276 |     0.248 |      0.123 |      0.077 |
|  5 | 0.657 | 0.718 | Gemini 3.7 Flash               | Google                    | $1.50 |   115 | 1.0M |    0.287 |     0.241 |      0.115 |      0.075 |
|  6 | 0.656 | 0.657 | ★ Ling 3.0 Flash               | InclusionAI               | $0.04 |   124 | 131k |    0.296 |     0.201 |      0.096 |      0.064 |
|  7 | 0.654 | 0.673 | ★ DeepSeek-V4-Flash-Vision-Exp | DeepSeek                  | $0.46 |    85 | 1.0M |    0.251 |     0.232 |      0.116 |      0.074 |
|  8 | 0.650 | 0.669 | GPT-5.6 Luna                   | OpenAI                    | $0.47 |    79 | 1.1M |    0.243 |     0.231 |      0.120 |      0.076 |
|  9 | 0.648 | 0.657 | Qwen3.8 Flash                  | Alibaba Cloud / Qwen Team | $0.23 |    58 | 1.0M |    0.207 |     0.245 |      0.118 |      0.087 |
| 10 | 0.647 | 0.663 | ★ Mercury 2                    | Inception                 | $0.38 |   350 | 128k |    0.400 |     0.155 |      0.070 |      0.038 |

## @slow — Most capable model for hard problems; cost and speed as tiebreakers
eligible: 143 — λ 0.00263 $/quality-point (thinking ×2.714)

|  # | value |     q | model                 | org         |   $/M | tok/s |  ctx | gen 63.2% | code 18.9% | ag 13.7% | tput 4.2% |
| -: | ----: | ----: | --------------------- | ----------- | ----: | ----: | ---: | --------: | ---------: | -------: | --------: |
|  1 | 0.836 | 0.850 | ★ Muse Spark 1.3      | Meta        | $5.43 |    56 | 1.0M |     0.582 |      0.145 |    0.102 |     0.021 |
|  2 | 0.834 | 0.839 | ★ DeepSeek-V4.1-Flash | DeepSeek    | $1.63 |    79 | 1.0M |     0.562 |      0.149 |    0.102 |     0.026 |
|  3 | 0.821 | 0.839 | GLM-5.3               | Zhipu AI    | $6.71 |    75 | 1.0M |     0.569 |      0.145 |    0.100 |     0.025 |
|  4 | 0.818 | 0.862 | ★ GPT-5.6 Sol         | OpenAI      | $16.6 |    52 | 1.1M |     0.585 |      0.154 |    0.103 |     0.020 |
|  5 | 0.814 | 0.824 | DeepSeek-V4-Pro-0813  | DeepSeek    | $3.66 |    86 | 1.0M |     0.560 |      0.140 |    0.096 |     0.027 |
|  6 | 0.806 | 0.839 | Kimi K3               | Moonshot AI | $12.4 |    55 | 1.0M |     0.572 |      0.147 |    0.099 |     0.021 |
|  7 | 0.803 | 0.807 | ★ MiMo-V2.6-Pro       | Xiaomi      | $1.47 |    29 | 1.0M |     0.552 |      0.144 |    0.098 |     0.013 |
|  8 | 0.798 | 0.807 | Hy4 preview           | Tencent     | $3.39 |    40 |    — |     0.555 |      0.138 |    0.095 |     0.017 |
|  9 | 0.796 | 0.807 | Gemini 3.8 Flash      | Google      | $4.07 |   105 | 1.0M |     0.549 |      0.136 |    0.093 |     0.029 |
| 10 | 0.794 | 0.824 | GPT-6.1 Sol           | OpenAI      | $11.5 |    40 | 1.1M |     0.569 |      0.138 |    0.099 |     0.017 |

## @vision — Image understanding: vision index dominates
eligible: 75 — λ 0.00682 $/quality-point (thinking ×1.857)

|  # | value |     q | model               | org                       |   $/M | tok/s |  ctx | vis 54.2% | gen 20.8% | rea 15.6% | code 6.3% | tput 3.1% |
| -: | ----: | ----: | ------------------- | ------------------------- | ----: | ----: | ---: | --------: | --------: | --------: | --------: | --------: |
|  1 | 0.733 | 0.736 | ★ Qwen3.8 Flash     | Alibaba Cloud / Qwen Team | $0.43 |    58 | 1.0M |     0.364 |     0.179 |     0.134 |     0.043 |     0.016 |
|  2 | 0.731 | 0.756 | ★ Muse Spark 1.1    | Meta                      | $3.71 |   185 | 1.0M |     0.371 |     0.180 |     0.136 |     0.042 |     0.027 |
|  3 | 0.723 | 0.731 | DeepSeek-V4.1-Flash | DeepSeek                  | $1.11 |    79 | 1.0M |     0.343 |     0.185 |     0.134 |     0.049 |     0.019 |
|  4 | 0.720 | 0.739 | ★ Gemini 3.8 Flash  | Google                    | $2.79 |   105 | 1.0M |     0.363 |     0.181 |     0.128 |     0.045 |     0.022 |
|  5 | 0.714 | 0.772 | ★ Kimi K3           | Moonshot AI               | $8.49 |    55 | 1.0M |     0.380 |     0.189 |     0.139 |     0.048 |     0.016 |
|  6 | 0.711 | 0.714 | ★ GLM-5.3-Flash     | Zhipu AI                  | $0.35 |    35 | 1.0M |     0.346 |     0.181 |     0.133 |     0.042 |     0.012 |
|  7 | 0.703 | 0.722 | Gemini 3.7 Flash    | Google                    | $2.79 |   115 | 1.0M |     0.354 |     0.176 |     0.128 |     0.042 |     0.022 |
|  8 | 0.697 | 0.709 | Qwen3.8-27B         | Alibaba Cloud / Qwen Team | $1.71 |    61 | 262k |     0.359 |     0.169 |     0.126 |     0.040 |     0.017 |
|  9 | 0.695 | 0.772 | ★ GPT-5.6 Sol       | OpenAI                    | $11.4 |    52 | 1.1M |     0.371 |     0.193 |     0.143 |     0.051 |     0.015 |
| 10 | 0.685 | 0.693 | Qwen3.7-Plus        | Alibaba Cloud / Qwen Team | $1.04 |    48 |    — |     0.353 |     0.163 |     0.123 |     0.039 |     0.014 |

## @plan — Planning: reasoning and long-context coherence, priced so the cheapest capable planner wins
eligible: 143 — λ 0.01667 $/quality-point (thinking ×1.857)

|  # | value |     q | model                | org                       |   $/M | tok/s |  ctx | gen 80% | lc 15.6% | tput 4.4% |
| -: | ----: | ----: | -------------------- | ------------------------- | ----: | ----: | ---: | ------: | -------: | --------: |
|  1 | 0.799 | 0.861 | ★ Muse Spark 1.3     | Meta                      | $3.71 |    56 | 1.0M |   0.737 |    0.101 |     0.023 |
|  2 | 0.782 | 0.789 | ★ Qwen3.8 Flash      | Alibaba Cloud / Qwen Team | $0.43 |    58 | 1.0M |   0.686 |    0.079 |     0.023 |
|  3 | 0.773 | 0.820 | ★ Gemini 3.8 Flash   | Google                    | $2.79 |   105 | 1.0M |   0.696 |    0.093 |     0.031 |
|  4 | 0.761 | 0.808 | Gemini 3.7 Flash     | Google                    | $2.79 |   115 | 1.0M |   0.676 |    0.100 |     0.032 |
|  5 | 0.759 | 0.797 | ★ Hy4 preview        | Tencent                   | $2.32 |    40 |    — |   0.703 |    0.076 |     0.018 |
|  6 | 0.751 | 0.769 | DeepSeek-V4.1-Flash  | DeepSeek                  | $1.11 |    79 | 1.0M |   0.712 |    0.030 |     0.027 |
|  7 | 0.739 | 0.754 | GPT-5.6 Luna         | OpenAI                    | $0.88 |    79 | 1.1M |   0.647 |    0.080 |     0.027 |
|  8 | 0.735 | 0.741 | ★ GLM-5.3-Flash      | Zhipu AI                  | $0.35 |    35 | 1.0M |   0.694 |    0.030 |     0.016 |
|  9 | 0.728 | 0.736 | Hy3                  | Tencent                   | $0.47 |    46 | 262k |   0.629 |    0.088 |     0.020 |
| 10 | 0.727 | 0.768 | DeepSeek-V4-Pro-0813 | DeepSeek                  | $2.51 |    86 | 1.0M |   0.710 |    0.030 |     0.028 |

## @commit — Commit messages: cheap and fast with decent general quality
eligible: 143 — λ 0.04091 $/quality-point

|  # | value |     q | model                          | org         |   $/M | tok/s |  ctx | tput 41.5% | gen 43.1% | code 15.4% |
| -: | ----: | ----: | ------------------------------ | ----------- | ----: | ----: | ---: | ---------: | --------: | ---------: |
|  1 | 0.750 | 0.832 | ★ Muse Spark 1.1               | Meta        | $2.00 |   185 | 1.0M |      0.356 |     0.372 |      0.103 |
|  2 | 0.732 | 0.757 | ★ DeepSeek-V4.1-Flash          | DeepSeek    | $0.60 |    79 | 1.0M |      0.253 |     0.383 |      0.121 |
|  3 | 0.710 | 0.771 | ★ Gemini 3.8 Flash             | Google      | $1.50 |   105 | 1.0M |      0.287 |     0.375 |      0.110 |
|  4 | 0.703 | 0.765 | Gemini 3.7 Flash               | Google      | $1.50 |   115 | 1.0M |      0.298 |     0.364 |      0.103 |
|  5 | 0.703 | 0.758 | ★ DeepSeek-V4-Pro-0813         | DeepSeek    | $1.35 |    86 | 1.0M |      0.262 |     0.382 |      0.114 |
|  6 | 0.697 | 0.712 | ★ Mercury 2                    | Inception   | $0.38 |   350 | 128k |      0.415 |     0.234 |      0.063 |
|  7 | 0.696 | 0.715 | ★ DeepSeek-V4-Flash-Vision-Exp | DeepSeek    | $0.46 |    85 | 1.0M |      0.261 |     0.350 |      0.104 |
|  8 | 0.695 | 0.696 | ★ Ling 3.0 Flash               | InclusionAI | $0.04 |   124 | 131k |      0.307 |     0.303 |      0.086 |
|  9 | 0.688 | 0.708 | GPT-5.6 Luna                   | OpenAI      | $0.47 |    79 | 1.1M |      0.252 |     0.348 |      0.108 |
| 10 | 0.686 | 0.695 | GPT-6 Luna                     | OpenAI      | $0.21 |    78 | 1.1M |      0.250 |     0.346 |      0.098 |

## @tiny — Background tasks (titles, memory): cheapest and fastest wins
eligible: 143 — λ 0.03333 $/quality-point

|  # | value |     q | model                       | org         |   $/M | tok/s |  ctx | tput 58.3% | gen 41.7% |
| -: | ----: | ----: | --------------------------- | ----------- | ----: | ----: | ---: | ---------: | --------: |
|  1 | 0.813 | 0.832 | ★ Gemini 3.1 Flash-Lite     | Google      | $0.56 |   273 | 1.0M |      0.567 |     0.265 |
|  2 | 0.798 | 0.810 | ★ Mercury 2                 | Inception   | $0.38 |   350 | 128k |      0.583 |     0.227 |
|  3 | 0.794 | 0.861 | ★ Muse Spark 1.1            | Meta        | $2.00 |   185 | 1.0M |      0.500 |     0.360 |
|  4 | 0.730 | 0.733 | ★ Nemotron 3 Nano (30B A3B) | NVIDIA      | $0.09 |   206 | 262k |      0.519 |     0.214 |
|  5 | 0.723 | 0.724 | ★ Ling 3.0 Flash            | InclusionAI | $0.04 |   124 | 131k |      0.431 |     0.293 |
|  6 | 0.720 | 0.770 | Gemini 3.7 Flash            | Google      | $1.50 |   115 | 1.0M |      0.418 |     0.352 |
|  7 | 0.715 | 0.765 | Gemini 3.8 Flash            | Google      | $1.50 |   105 | 1.0M |      0.402 |     0.362 |
|  8 | 0.715 | 0.717 | Ling 3.0 Flash Fin          | InclusionAI | $0.07 |    97 | 262k |      0.390 |     0.327 |
|  9 | 0.711 | 0.761 | Gemini 3.6 Flash            | Google      | $1.50 |   125 | 1.0M |      0.434 |     0.327 |
| 10 | 0.705 | 0.725 | DeepSeek-V4.1-Flash         | DeepSeek    | $0.60 |    79 | 1.0M |      0.355 |     0.371 |

## @task — Subagents: agentic + tool calling, moderate cost sensitivity
eligible: 143 — λ 0.00747 $/quality-point (thinking ×1.857)

|  # | value |     q | model                 | org                       |   $/M | tok/s |  ctx | ag 29.9% | tool 20.7% | code 18.4% | gen 25.3% | tput 5.7% |
| -: | ----: | ----: | --------------------- | ------------------------- | ----: | ----: | ---: | -------: | ---------: | ---------: | --------: | --------: |
|  1 | 0.753 | 0.761 | ★ DeepSeek-V4.1-Flash | DeepSeek                  | $1.11 |    79 | 1.0M |    0.223 |      0.133 |      0.145 |     0.225 |     0.035 |
|  2 | 0.728 | 0.756 | Muse Spark 1.3        | Meta                      | $3.71 |    56 | 1.0M |    0.222 |      0.131 |      0.141 |     0.233 |     0.029 |
|  3 | 0.717 | 0.751 | GLM-5.3               | Zhipu AI                  | $4.59 |    75 | 1.0M |    0.218 |      0.130 |      0.141 |     0.228 |     0.034 |
|  4 | 0.714 | 0.722 | ★ MiMo-V2.6-Pro       | Xiaomi                    | $1.01 |    29 | 1.0M |    0.214 |      0.128 |      0.140 |     0.221 |     0.018 |
|  5 | 0.711 | 0.730 | DeepSeek-V4-Pro-0813  | DeepSeek                  | $2.51 |    86 | 1.0M |    0.210 |      0.123 |      0.136 |     0.224 |     0.036 |
|  6 | 0.698 | 0.702 | ★ Qwen3.8 Flash       | Alibaba Cloud / Qwen Team | $0.43 |    58 | 1.0M |    0.202 |      0.126 |      0.126 |     0.217 |     0.030 |
|  7 | 0.696 | 0.698 | ★ GLM-5.3-Flash       | Zhipu AI                  | $0.35 |    35 | 1.0M |    0.210 |      0.126 |      0.122 |     0.219 |     0.021 |
|  8 | 0.695 | 0.712 | Hy4 preview           | Tencent                   | $2.32 |    40 |    — |    0.208 |      0.123 |      0.134 |     0.222 |     0.024 |
|  9 | 0.692 | 0.720 | Muse Spark 1.1        | Meta                      | $3.71 |   185 | 1.0M |    0.201 |      0.127 |      0.124 |     0.219 |     0.049 |
| 10 | 0.685 | 0.748 | Kimi K3               | Moonshot AI               | $8.49 |    55 | 1.0M |    0.217 |      0.131 |      0.142 |     0.229 |     0.029 |

## @advisor — Advisor/watchdog: deep reasoning over long context
eligible: 143 — λ 0.01250 $/quality-point (thinking ×1.857)

|  # | value |     q | model                | org                       |   $/M | tok/s |  ctx | gen 74.3% | lc 12.6% | tput 13.1% |
| -: | ----: | ----: | -------------------- | ------------------------- | ----: | ----: | ---: | --------: | -------: | ---------: |
|  1 | 0.787 | 0.833 | ★ Muse Spark 1.3     | Meta                      | $3.71 |    56 | 1.0M |     0.685 |    0.081 |      0.066 |
|  2 | 0.777 | 0.812 | ★ Gemini 3.8 Flash   | Google                    | $2.79 |   105 | 1.0M |     0.646 |    0.075 |      0.090 |
|  3 | 0.768 | 0.803 | Gemini 3.7 Flash     | Google                    | $2.79 |   115 | 1.0M |     0.628 |    0.080 |      0.094 |
|  4 | 0.764 | 0.770 | ★ Qwen3.8 Flash      | Alibaba Cloud / Qwen Team | $0.43 |    58 | 1.0M |     0.638 |    0.064 |      0.068 |
|  5 | 0.752 | 0.766 | DeepSeek-V4.1-Flash  | DeepSeek                  | $1.11 |    79 | 1.0M |     0.662 |    0.024 |      0.080 |
|  6 | 0.740 | 0.769 | Hy4 preview          | Tencent                   | $2.32 |    40 |    — |     0.654 |    0.061 |      0.054 |
|  7 | 0.736 | 0.767 | DeepSeek-V4-Pro-0813 | DeepSeek                  | $2.51 |    86 | 1.0M |     0.660 |    0.024 |      0.083 |
|  8 | 0.734 | 0.745 | GPT-5.6 Luna         | OpenAI                    | $0.88 |    79 | 1.1M |     0.601 |    0.065 |      0.080 |
|  9 | 0.733 | 0.780 | Muse Spark 1.1       | Meta                      | $3.71 |   185 | 1.0M |     0.643 |    0.024 |      0.112 |
| 10 | 0.714 | 0.771 | GLM-5.3              | Zhipu AI                  | $4.59 |    75 | 1.0M |     0.669 |    0.024 |      0.078 |

## @designer — Design work: visual/UX judgement on image-capable models
eligible: 88 — λ 0.01024 $/quality-point (thinking ×1.857)

|  # | value |     q | model                 | org         |   $/M | tok/s |  ctx | gen 31.3% | code 7.2% | vis 21.7% | tput 18.1% | web 21.7% | agon |
| -: | ----: | ----: | --------------------- | ----------- | ----: | ----: | ---: | --------: | --------: | --------: | ---------: | --------: | ---: |
|  1 | 0.773 | 0.784 | ★ DeepSeek-V4.1-Flash | DeepSeek    | $1.11 |    79 | 1.0M |     0.279 |     0.057 |     0.137 |      0.110 |     0.202 |    — |
|  2 | 0.762 | 0.790 | ★ Gemini 3.8 Flash    | Google      | $2.79 |   105 | 1.0M |     0.272 |     0.052 |     0.145 |      0.125 |     0.196 | 1231 |
|  3 | 0.754 | 0.783 | Gemini 3.7 Flash      | Google      | $2.79 |   115 | 1.0M |     0.265 |     0.048 |     0.142 |      0.130 |     0.198 | 1214 |
|  4 | 0.751 | 0.789 | Muse Spark 1.1        | Meta        | $3.71 |   185 | 1.0M |     0.271 |     0.049 |     0.149 |      0.155 |     0.166 |    — |
|  5 | 0.740 | 0.778 | Muse Spark 1.3        | Meta        | $3.71 |    56 | 1.0M |     0.289 |     0.055 |     0.126 |      0.092 |     0.216 | 1289 |
|  6 | 0.728 | 0.757 | Gemini 3.6 Flash      | Google      | $2.79 |   125 | 1.0M |     0.246 |     0.043 |     0.140 |      0.134 |     0.193 | 1187 |
|  7 | 0.709 | 0.796 | ★ Kimi K3             | Moonshot AI | $8.49 |    55 | 1.0M |     0.284 |     0.056 |     0.152 |      0.090 |     0.214 | 1285 |
|  8 | 0.708 | 0.718 | ★ MiMo-V2.6-Pro       | Xiaomi      | $1.01 |    29 | 1.0M |     0.274 |     0.055 |     0.128 |      0.057 |     0.205 |    — |
|  9 | 0.693 | 0.696 | ★ GLM-5.3-Flash       | Zhipu AI    | $0.35 |    35 | 1.0M |     0.272 |     0.048 |     0.139 |      0.067 |     0.171 |    — |
| 10 | 0.691 | 0.695 | GPT-6 Luna            | OpenAI      | $0.39 |    78 | 1.1M |     0.252 |     0.046 |     0.114 |      0.109 |     0.175 |    — |
focus: website — coverage 121/400 (30.3%) ok; dispersion 0.992 ok; composition ok; freshness 0.2mo ok

# Suggested settings.modelRoles (best-fit #1 per role, resolved via the omp catalog).
# Selectors are openrouter/<id>; the omp-llm-role plugin writes this block daily.
modelRoles:
  default: "openrouter/deepseek/deepseek-v4.1-flash"
  smol: "openrouter/meta/muse-spark-1.1"
  slow: "openrouter/meta/muse-spark-1.3"
  vision: "openrouter/qwen/qwen3.8-flash"
  plan: "openrouter/meta/muse-spark-1.3"
  commit: "openrouter/meta/muse-spark-1.1"
  tiny: "openrouter/google/gemini-3.1-flash-lite-preview"
  task: "openrouter/deepseek/deepseek-v4.1-flash"
  advisor: "openrouter/meta/muse-spark-1.3"
  designer: "openrouter/deepseek/deepseek-v4.1-flash"
