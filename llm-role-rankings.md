llm-stats.com best-fit ranking per omp model role — 398 models, 2026-09-23
Score = Σ weight × percentile per metric (1.0 = best). Each metric column shows that
metric's weighted contribution (weight × percentile); the metric columns of a row sum
to the score. price is the inverted (cheaper = better) percentile; — = metric missing
(contributes 0). Metric column headers show the weight.
Abbr: gen=general rea=reasoning math=math ag=agents tool=tool_calling lc=long_context
sea=search vis=vision tput=throughput (code, price, mrcr as-is).
★ = Pareto-frontier: no eligible model is both cheaper and better (price-free score).
$/score = $/M ÷ (score without price − 0.5), cost per quality point above the median;
— when the price-free score is ≤ 0.5 (price not double-counted: it is excluded there).
Throughput + price: OpenRouter (p50 tok/s, last 30m routed traffic; standard-route $/M 3:1 in:out), throughput 150/398, priced 149; models without OpenRouter throughput or a billed route are not ranked.

## @default — Main workhorse: strong general coding-agent quality, sane cost
eligible: 141

|  # | score | model                 | org         |   $/M | tok/s | $/score |  ctx | gen 30% | code 25% | ag 20% | tool 10% | rea 10% | price 5% |
| -: | ----: | --------------------- | ----------- | ----: | ----: | ------: | ---: | ------: | -------: | -----: | -------: | ------: | -------: |
|  1 | 0.965 | ★ DeepSeek-V4.1-Flash | DeepSeek    | $0.20 |     6 |   $0.42 | 1.0M |   0.290 |    0.245 |  0.197 |    0.099 |   0.096 |    0.037 |
|  2 | 0.949 | ★ GPT-6 Astra         | OpenAI      |   $20 |    23 |   $40.2 | 1.1M |   0.299 |    0.249 |  0.200 |    0.100 |   0.100 |    0.001 |
|  3 | 0.942 | GLM-5.3               | Zhipu AI    | $0.86 |    57 |   $1.83 | 1.0M |   0.293 |    0.244 |  0.192 |    0.097 |   0.098 |    0.019 |
|  4 | 0.940 | ★ GPT-5.6 Sol         | OpenAI      | $4.00 |    37 |   $8.25 | 1.1M |   0.297 |    0.248 |  0.198 |    0.094 |   0.099 |    0.004 |
|  5 | 0.933 | Muse Spark 1.3        | Meta        | $2.00 |    63 |   $4.23 | 1.0M |   0.294 |    0.241 |  0.194 |    0.097 |   0.098 |    0.009 |
|  6 | 0.932 | MiMo-V2.6-Pro         | Xiaomi      | $0.54 |     5 |   $1.20 | 1.0M |   0.286 |    0.241 |  0.188 |    0.096 |   0.093 |    0.027 |
|  7 | 0.930 | Kimi K3               | Moonshot AI | $3.81 |    30 |   $8.06 | 1.0M |   0.294 |    0.244 |  0.190 |    0.098 |   0.098 |    0.005 |
|  8 | 0.923 | DeepSeek-V4-Pro-0813  | DeepSeek    | $0.60 |    46 |   $1.35 | 1.0M |   0.290 |    0.237 |  0.184 |    0.090 |   0.096 |    0.026 |
|  9 | 0.918 | Claude Fable 5        | Anthropic   |   $20 |    28 |   $42.9 | 1.0M |   0.295 |    0.247 |  0.195 |    0.082 |   0.098 |    0.001 |
| 10 | 0.916 | Claude Opus 5         | Anthropic   |   $10 |    54 |   $21.6 | 1.0M |   0.298 |    0.240 |  0.193 |    0.085 |   0.099 |    0.001 |

## @smol — Fast lightweight model: cheap and quick, still competent
eligible: 141

|  # | score | model                          | org                       |   $/M | tok/s | $/score |  ctx | price 30% | tput 25% | gen 20% | code 15% | tool 10% |
| -: | ----: | ------------------------------ | ------------------------- | ----: | ----: | ------: | ---: | --------: | -------: | ------: | -------: | -------: |
|  1 | 0.814 | ★ Laguna S 2.1                 | Poolside                  | $0.11 |    75 |   $0.40 | 1.0M |     0.268 |    0.205 |   0.168 |    0.120 |    0.053 |
|  2 | 0.808 | ★ Hy3                          | Tencent                   | $0.14 |    59 |   $0.50 | 262k |     0.255 |    0.180 |   0.175 |    0.128 |    0.069 |
|  3 | 0.806 | ★ Ling 3.0 Flash               | InclusionAI               | $0.03 |    61 |   $0.14 | 131k |     0.298 |    0.186 |   0.156 |    0.109 |    0.057 |
|  4 | 0.769 | ★ DeepSeek-V4-Flash-Vision-Exp | DeepSeek                  | $0.32 |    59 |   $1.03 | 1.0M |     0.199 |    0.180 |   0.182 |    0.132 |    0.075 |
|  5 | 0.758 | Ling 3.0 Flash Fin             | InclusionAI               | $0.09 |   146 |   $0.48 | 262k |     0.276 |    0.242 |   0.173 |        — |    0.067 |
|  6 | 0.757 | Qwen3.8 Flash                  | Alibaba Cloud / Qwen Team | $0.23 |    42 |   $0.83 | 1.0M |     0.213 |    0.128 |   0.188 |    0.134 |    0.094 |
|  7 | 0.746 | GPT-6 Luna                     | OpenAI                    | $0.20 |    46 |   $0.81 | 1.1M |     0.224 |    0.142 |   0.179 |    0.125 |    0.077 |
|  8 | 0.724 | ★ GLM-5.3                      | Zhipu AI                  | $0.86 |    57 |   $2.31 | 1.0M |     0.112 |    0.173 |   0.195 |    0.146 |    0.097 |
|  9 | 0.722 | ★ Gemini 3.8 Flash             | Google                    | $1.50 |   119 |   $3.55 | 1.0M |     0.077 |    0.234 |   0.190 |    0.141 |    0.080 |
| 10 | 0.722 | DeepSeek-V4-Pro-0813           | DeepSeek                  | $0.60 |    46 |   $1.93 | 1.0M |     0.154 |    0.142 |   0.193 |    0.142 |    0.090 |

## @slow — Most capable model for hard problems; cost and speed as tiebreakers
eligible: 141

|  # | score | model                  | org         |   $/M | tok/s | $/score |  ctx | gen 25% | rea 25% | code 20% | ag 15% | math 10% | price 3% | tput 2% |
| -: | ----: | ---------------------- | ----------- | ----: | ----: | ------: | ---: | ------: | ------: | -------: | -----: | -------: | -------: | ------: |
|  1 | 0.949 | ★ GLM-5.3              | Zhipu AI    | $0.86 |    57 |   $1.85 | 1.0M |   0.244 |   0.245 |    0.195 |  0.144 |    0.097 |    0.011 |   0.014 |
|  2 | 0.946 | ★ Claude Opus 5        | Anthropic   |   $10 |    54 |   $21.1 | 1.0M |   0.249 |   0.248 |    0.192 |  0.144 |    0.099 |    0.001 |   0.013 |
|  3 | 0.941 | GPT-6 Astra            | OpenAI      |   $20 |    23 |   $42.6 | 1.1M |   0.249 |   0.249 |    0.199 |  0.150 |    0.087 |    0.000 |   0.005 |
|  4 | 0.940 | Claude Fable 5         | Anthropic   |   $20 |    28 |   $42.7 | 1.0M |   0.246 |   0.246 |    0.198 |  0.146 |    0.098 |    0.000 |   0.006 |
|  5 | 0.939 | GPT-5.6 Sol            | OpenAI      | $4.00 |    37 |   $8.59 | 1.1M |   0.247 |   0.247 |    0.199 |  0.148 |    0.086 |    0.003 |   0.009 |
|  6 | 0.935 | Kimi K3                | Moonshot AI | $3.81 |    30 |   $8.28 | 1.0M |   0.245 |   0.245 |    0.196 |  0.143 |    0.097 |    0.003 |   0.007 |
|  7 | 0.935 | ★ DeepSeek-V4.1-Flash  | DeepSeek    | $0.20 |     6 |   $0.45 | 1.0M |   0.242 |   0.239 |    0.196 |  0.148 |    0.087 |    0.022 |   0.001 |
|  8 | 0.931 | ★ DeepSeek-V4-Pro-0813 | DeepSeek    | $0.60 |    46 |   $1.35 | 1.0M |   0.241 |   0.240 |    0.190 |  0.138 |    0.095 |    0.015 |   0.011 |
|  9 | 0.920 | Hy4 preview            | Tencent     | $1.25 |    30 |   $2.84 |    — |   0.241 |   0.243 |    0.189 |  0.137 |    0.096 |    0.009 |   0.007 |
| 10 | 0.903 | Muse Spark 1.1         | Meta        | $2.00 |   179 |   $4.70 | 1.0M |   0.236 |   0.240 |    0.175 |  0.130 |    0.097 |    0.005 |   0.020 |

## @vision — Image understanding: vision index dominates
eligible: 74

|  # | score | model                 | org                       |   $/M | tok/s | $/score |  ctx | vis 50% | gen 20% | rea 15% | code 10% | price 3% | tput 2% |
| -: | ----: | --------------------- | ------------------------- | ----: | ----: | ------: | ---: | ------: | ------: | ------: | -------: | -------: | ------: |
|  1 | 0.952 | ★ GPT-6 Astra         | OpenAI                    |   $20 |    23 |   $41.6 | 1.1M |   0.498 |   0.199 |   0.150 |    0.100 |    0.000 |   0.005 |
|  2 | 0.946 | ★ Claude Opus 5       | Anthropic                 |   $10 |    54 |   $21.1 | 1.0M |   0.488 |   0.199 |   0.149 |    0.096 |    0.001 |   0.013 |
|  3 | 0.936 | ★ GPT-5.6 Sol         | OpenAI                    | $4.00 |    37 |   $8.66 | 1.1M |   0.479 |   0.198 |   0.148 |    0.099 |    0.003 |   0.009 |
|  4 | 0.934 | ★ Kimi K3             | Moonshot AI               | $3.81 |    30 |   $8.30 | 1.0M |   0.483 |   0.196 |   0.147 |    0.098 |    0.003 |   0.007 |
|  5 | 0.931 | Claude Fable 5        | Anthropic                 |   $20 |    28 |   $43.6 | 1.0M |   0.481 |   0.197 |   0.148 |    0.099 |    0.000 |   0.006 |
|  6 | 0.920 | ★ Muse Spark 1.1      | Meta                      | $2.00 |   179 |   $4.52 | 1.0M |   0.474 |   0.189 |   0.144 |    0.088 |    0.005 |   0.020 |
|  7 | 0.918 | ★ Qwen3.8 Flash       | Alibaba Cloud / Qwen Team | $0.23 |    42 |   $0.54 | 1.0M |   0.467 |   0.188 |   0.143 |    0.089 |    0.021 |   0.010 |
|  8 | 0.913 | ★ Gemini 3.8 Flash    | Google                    | $1.50 |   119 |   $3.46 | 1.0M |   0.463 |   0.190 |   0.139 |    0.094 |    0.008 |   0.019 |
|  9 | 0.903 | GPT-5.5               | OpenAI                    | $11.3 |    26 |   $26.2 | 1.1M |   0.476 |   0.186 |   0.141 |    0.093 |    0.001 |   0.006 |
| 10 | 0.892 | ★ DeepSeek-V4.1-Flash | DeepSeek                  | $0.20 |     6 |   $0.50 | 1.0M |   0.434 |   0.194 |   0.143 |    0.098 |    0.022 |   0.001 |

## @plan — Planning: reasoning, math, long-context coherence
eligible: 141

|  # | score | model            | org                       |   $/M | tok/s | $/score |  ctx | rea 30% | math 15% | lc 20% | gen 20% | mrcr 10% | price 3% | tput 2% |
| -: | ----: | ---------------- | ------------------------- | ----: | ----: | ------: | ---: | ------: | -------: | -----: | ------: | -------: | -------: | ------: |
|  1 | 0.920 | ★ GPT-5.6 Sol    | OpenAI                    | $4.00 |    37 |   $8.98 | 1.1M |   0.297 |    0.129 |  0.197 |   0.198 |    0.088 |    0.003 |   0.009 |
|  2 | 0.866 | GPT-5.6 Terra    | OpenAI                    | $4.50 |    17 |   $11.5 | 1.1M |   0.285 |    0.122 |  0.180 |   0.192 |    0.083 |    0.002 |   0.003 |
|  3 | 0.846 | GPT-5.5          | OpenAI                    | $11.3 |    26 |   $30.3 | 1.1M |   0.282 |    0.137 |  0.159 |   0.186 |    0.075 |    0.001 |   0.006 |
|  4 | 0.810 | ★ Muse Spark 1.3 | Meta                      | $2.00 |    63 |   $6.08 | 1.0M |   0.293 |        — |  0.200 |   0.196 |    0.100 |    0.005 |   0.015 |
|  5 | 0.793 | ★ GPT-5.6 Luna   | OpenAI                    | $0.45 |    41 |   $1.50 | 1.1M |   0.268 |    0.109 |  0.161 |   0.182 |    0.046 |    0.017 |   0.010 |
|  6 | 0.787 | ★ Hy3            | Tencent                   | $0.14 |    59 |   $0.51 | 262k |   0.263 |    0.132 |  0.178 |   0.175 |        — |    0.026 |   0.014 |
|  7 | 0.784 | ★ Qwen3.8 Flash  | Alibaba Cloud / Qwen Team | $0.23 |    42 |   $0.80 | 1.0M |   0.285 |    0.124 |  0.156 |   0.188 |        — |    0.021 |   0.010 |
|  8 | 0.783 | Qwen3.7-Plus     | Alibaba Cloud / Qwen Team | $0.56 |    14 |   $1.93 |    — |   0.263 |    0.142 |  0.186 |   0.173 |        — |    0.016 |   0.002 |
|  9 | 0.782 | Hy4 preview      | Tencent                   | $1.25 |    30 |   $4.20 |    — |   0.292 |    0.144 |  0.139 |   0.193 |        — |    0.009 |   0.007 |
| 10 | 0.782 | Gemini 3.7 Flash | Google                    | $1.50 |   135 |   $5.03 | 1.0M |   0.276 |        — |  0.198 |   0.186 |    0.096 |    0.008 |   0.019 |

## @commit — Commit messages: cheap and fast with decent general quality
eligible: 141

|  # | score | model                          | org                       |   $/M | tok/s | $/score |  ctx | price 35% | tput 25% | gen 25% | code 15% |
| -: | ----: | ------------------------------ | ------------------------- | ----: | ----: | ------: | ---: | --------: | -------: | ------: | -------: |
|  1 | 0.848 | ★ Laguna S 2.1                 | Poolside                  | $0.11 |    75 |   $0.35 | 1.0M |     0.312 |    0.205 |   0.211 |    0.120 |
|  2 | 0.838 | ★ Ling 3.0 Flash               | InclusionAI               | $0.03 |    61 |   $0.12 | 131k |     0.348 |    0.186 |   0.195 |    0.109 |
|  3 | 0.825 | Hy3                            | Tencent                   | $0.14 |    59 |   $0.46 | 262k |     0.298 |    0.180 |   0.218 |    0.128 |
|  4 | 0.783 | Laguna XS 2.1                  | Poolside                  | $0.07 |   123 |   $0.39 | 262k |     0.335 |    0.237 |   0.138 |    0.074 |
|  5 | 0.780 | Ling 3.0 Flash Fin             | InclusionAI               | $0.09 |   146 |   $0.44 | 262k |     0.322 |    0.242 |   0.217 |        — |
|  6 | 0.772 | ★ DeepSeek-V4-Flash-Vision-Exp | DeepSeek                  | $0.32 |    59 |   $0.97 | 1.0M |     0.232 |    0.180 |   0.228 |    0.132 |
|  7 | 0.751 | GPT-6 Luna                     | OpenAI                    | $0.20 |    46 |   $0.79 | 1.1M |     0.261 |    0.142 |   0.224 |    0.125 |
|  8 | 0.745 | Qwen3.8 Flash                  | Alibaba Cloud / Qwen Team | $0.23 |    42 |   $0.87 | 1.0M |     0.248 |    0.128 |   0.235 |    0.134 |
|  9 | 0.745 | Step-3.5-Flash                 | StepFun                   | $0.15 |    52 |   $0.75 |  66k |     0.290 |    0.159 |   0.201 |    0.094 |
| 10 | 0.727 | Muse Glimmer-30B               | Meta                      | $0.50 |   166 |   $1.57 | 131k |     0.194 |    0.244 |   0.186 |    0.102 |

## @tiny — Background tasks (titles, memory): cheapest and fastest wins
eligible: 141

|  # | score | model                     | org         |   $/M | tok/s | $/score |  ctx | price 40% | tput 35% | gen 25% |
| -: | ----: | ------------------------- | ----------- | ----: | ----: | ------: | ---: | --------: | -------: | ------: |
|  1 | 0.922 | ★ Ling 3.0 Flash Fin      | InclusionAI | $0.09 |   146 |   $0.21 | 262k |     0.368 |    0.338 |   0.217 |
|  2 | 0.854 | Laguna S 2.1              | Poolside    | $0.11 |    75 |   $0.34 | 1.0M |     0.357 |    0.287 |   0.211 |
|  3 | 0.853 | ★ Ling 3.0 Flash          | InclusionAI | $0.03 |    61 |   $0.12 | 131k |     0.397 |    0.261 |   0.195 |
|  4 | 0.851 | ★ Laguna XS 2.1           | Poolside    | $0.07 |   123 |   $0.27 | 262k |     0.382 |    0.331 |   0.138 |
|  5 | 0.837 | Nemotron 3 Nano (30B A3B) | NVIDIA      | $0.09 |   166 |   $0.33 | 262k |     0.376 |    0.342 |   0.120 |
|  6 | 0.811 | Hy3                       | Tencent     | $0.14 |    59 |   $0.51 | 262k |     0.341 |    0.253 |   0.218 |
|  7 | 0.755 | Step-3.5-Flash            | StepFun     | $0.15 |    52 |   $0.72 |  66k |     0.331 |    0.223 |   0.201 |
|  8 | 0.750 | Muse Glimmer-30B          | Meta        | $0.50 |   166 |   $1.31 | 131k |     0.222 |    0.342 |   0.186 |
|  9 | 0.749 | Seed 2.0 Mini             | ByteDance   | $0.17 |    72 |   $0.76 | 256k |     0.312 |    0.282 |   0.155 |
| 10 | 0.747 | Step 3.7 Flash            | StepFun     | $0.35 |   112 |   $1.12 | 262k |     0.259 |    0.322 |   0.166 |

## @task — Subagents: agentic + tool calling, moderate cost sensitivity
eligible: 141

|  # | score | model                 | org                       |   $/M | tok/s | $/score |  ctx | ag 30% | tool 20% | code 20% | gen 15% | price 10% | tput 5% |
| -: | ----: | --------------------- | ------------------------- | ----: | ----: | ------: | ---: | -----: | -------: | -------: | ------: | --------: | ------: |
|  1 | 0.911 | ★ DeepSeek-V4.1-Flash | DeepSeek                  | $0.20 |     6 |   $0.47 | 1.0M |  0.295 |    0.198 |    0.196 |   0.145 |     0.075 |   0.002 |
|  2 | 0.896 | ★ GLM-5.3             | Zhipu AI                  | $0.86 |    57 |   $1.90 | 1.0M |  0.287 |    0.195 |    0.195 |   0.146 |     0.038 |   0.035 |
|  3 | 0.881 | ★ Muse Spark 1.3      | Meta                      | $2.00 |    63 |   $4.36 | 1.0M |  0.290 |    0.194 |    0.193 |   0.147 |     0.018 |   0.038 |
|  4 | 0.871 | DeepSeek-V4-Pro-0813  | DeepSeek                  | $0.60 |    46 |   $1.46 | 1.0M |  0.276 |    0.181 |    0.190 |   0.145 |     0.051 |   0.028 |
|  5 | 0.867 | ★ GLM-5.3-Flash       | Zhipu AI                  | $0.12 |     9 |   $0.33 | 1.0M |  0.275 |    0.186 |    0.173 |   0.142 |     0.089 |   0.003 |
|  6 | 0.866 | MiMo-V2.6-Pro         | Xiaomi                    | $0.54 |     5 |   $1.35 | 1.0M |  0.283 |    0.193 |    0.193 |   0.143 |     0.053 |   0.001 |
|  7 | 0.865 | Qwen3.8 Flash         | Alibaba Cloud / Qwen Team | $0.23 |    42 |   $0.60 | 1.0M |  0.262 |    0.187 |    0.179 |   0.141 |     0.071 |   0.026 |
|  8 | 0.863 | GPT-6 Astra           | OpenAI                    |   $20 |    23 |   $43.7 | 1.1M |  0.300 |    0.200 |    0.199 |   0.150 |     0.001 |   0.013 |
|  9 | 0.862 | GPT-5.6 Sol           | OpenAI                    | $4.00 |    37 |   $8.92 | 1.1M |  0.297 |    0.187 |    0.199 |   0.148 |     0.009 |   0.022 |
| 10 | 0.851 | Kimi K3               | Moonshot AI               | $3.81 |    30 |   $8.79 | 1.0M |  0.286 |    0.196 |    0.196 |   0.147 |     0.010 |   0.016 |

## @advisor — Advisor/watchdog: deep reasoning over long context
eligible: 141

|  # | score | model          | org                       |   $/M | tok/s | $/score |  ctx | rea 35% | gen 25% | lc 20% | math 10% | sea 5% | price 3% | tput 2% |
| -: | ----: | -------------- | ------------------------- | ----: | ----: | ------: | ---: | ------: | ------: | -----: | -------: | -----: | -------: | ------: |
|  1 | 0.936 | ★ GPT-5.6 Sol  | OpenAI                    | $4.00 |    37 |   $8.66 | 1.1M |   0.346 |   0.247 |  0.197 |    0.086 |  0.048 |    0.003 |   0.009 |
|  2 | 0.884 | GPT-5.6 Terra  | OpenAI                    | $4.50 |    17 |     $11 | 1.1M |   0.332 |   0.240 |  0.180 |    0.081 |  0.046 |    0.002 |   0.003 |
|  3 | 0.878 | ★ Hy4 preview  | Tencent                   | $1.25 |    30 |   $3.15 |    — |   0.340 |   0.241 |  0.139 |    0.096 |  0.047 |    0.009 |   0.007 |
|  4 | 0.874 | ★ Hy3          | Tencent                   | $0.14 |    59 |   $0.38 | 262k |   0.306 |   0.218 |  0.178 |    0.088 |  0.044 |    0.026 |   0.014 |
|  5 | 0.859 | GPT-5.5        | OpenAI                    | $11.3 |    26 |   $29.3 | 1.1M |   0.329 |   0.233 |  0.159 |    0.091 |  0.040 |    0.001 |   0.006 |
|  6 | 0.843 | Qwen3.6 Plus   | Alibaba Cloud / Qwen Team | $0.73 |    36 |   $2.06 | 1.0M |   0.298 |   0.209 |  0.188 |    0.093 |  0.033 |    0.014 |   0.008 |
|  7 | 0.842 | Muse Spark 1.3 | Meta                      | $2.00 |    63 |   $5.52 | 1.0M |   0.341 |   0.245 |  0.200 |        — |  0.034 |    0.005 |   0.015 |
|  8 | 0.838 | GPT-5.6 Luna   | OpenAI                    | $0.45 |    41 |   $1.30 | 1.1M |   0.313 |   0.227 |  0.161 |    0.072 |  0.038 |    0.017 |   0.010 |
|  9 | 0.838 | Qwen3.8 Flash  | Alibaba Cloud / Qwen Team | $0.23 |    42 |   $0.67 | 1.0M |   0.333 |   0.235 |  0.156 |    0.083 |      — |    0.021 |   0.010 |
| 10 | 0.823 | Kimi K2.5      | Moonshot AI               | $0.90 |    23 |   $2.67 |    — |   0.289 |   0.206 |  0.183 |    0.089 |  0.039 |    0.011 |   0.005 |

# Suggested settings.modelRoles (best-fit #1 per role, resolved via the omp catalog).
# Selectors are openrouter/<id>; the omp-llm-role plugin writes this block daily.
modelRoles:
  default: "openrouter/deepseek/deepseek-v4.1-flash"
  smol: "openrouter/poolside/laguna-s-2.1"
  slow: "openrouter/z-ai/glm-5.3"
  vision: "openrouter/openai/gpt-6-astra"
  plan: "openrouter/openai/gpt-5.6-sol"
  commit: "openrouter/poolside/laguna-s-2.1"
  tiny: "openrouter/inclusionai/ling-3.0-flash-fin"
  task: "openrouter/deepseek/deepseek-v4.1-flash"
  advisor: "openrouter/openai/gpt-5.6-sol"
