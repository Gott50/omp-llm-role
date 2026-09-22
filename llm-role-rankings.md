llm-stats.com best-fit ranking per omp model role — 395 models, 2026-09-22
Score = Σ weight × percentile per metric (1.0 = best). Each metric column shows that
metric's weighted contribution (weight × percentile); the metric columns of a row sum
to the score. price is the inverted (cheaper = better) percentile; — = metric missing
(contributes 0). Metric column headers show the weight.
Abbr: gen=general rea=reasoning math=math ag=agents tool=tool_calling lc=long_context
sea=search vis=vision tput=throughput (code, price, mrcr as-is).
★ = Pareto-frontier: no eligible model is both cheaper and better (price-free score).
$/score = $/M ÷ (score without price − 0.5), cost per quality point above the median;
— when the price-free score is ≤ 0.5 (price not double-counted: it is excluded there).
Throughput + price: OpenRouter (p50 tok/s, last 30m routed traffic; standard-route $/M 3:1 in:out), throughput 149/395, priced 148; models without OpenRouter throughput or a billed route are not ranked.

## @default — Main workhorse: strong general coding-agent quality, sane cost
eligible: 140

|  # | score | model                 | org         |   $/M | tok/s | $/score |  ctx | gen 30% | code 25% | ag 20% | tool 10% | rea 10% | price 5% |
| -: | ----: | --------------------- | ----------- | ----: | ----: | ------: | ---: | ------: | -------: | -----: | -------: | ------: | -------: |
|  1 | 0.966 | ★ DeepSeek-V4.1-Flash | DeepSeek    | $0.21 |     6 |   $0.44 | 1.0M |   0.290 |    0.246 |  0.197 |    0.099 |   0.095 |    0.038 |
|  2 | 0.951 | ★ GPT-6 Astra         | OpenAI      |   $20 |    18 |     $40 | 1.1M |   0.300 |    0.250 |  0.200 |    0.100 |   0.100 |    0.001 |
|  3 | 0.947 | ★ GPT-5.6 Sol         | OpenAI      | $4.00 |    38 |   $8.13 | 1.1M |   0.298 |    0.249 |  0.199 |    0.096 |   0.099 |    0.005 |
|  4 | 0.942 | GLM-5.3               | Zhipu AI    | $1.01 |    27 |   $2.12 | 1.0M |   0.294 |    0.243 |  0.192 |    0.098 |   0.099 |    0.016 |
|  5 | 0.935 | ★ Kimi K3             | Moonshot AI | $3.00 |    18 |   $6.29 | 1.0M |   0.294 |    0.245 |  0.191 |    0.099 |   0.098 |    0.007 |
|  6 | 0.935 | Muse Spark 1.3        | Meta        | $2.00 |    63 |   $4.22 | 1.0M |   0.295 |    0.241 |  0.195 |    0.097 |   0.098 |    0.009 |
|  7 | 0.923 | MiMo-V2.6-Pro         | Xiaomi      | $0.54 |    31 |   $1.22 | 1.0M |   0.285 |    0.243 |  0.187 |    0.090 |   0.092 |    0.027 |
|  8 | 0.922 | ★ GLM-5.3-Flash       | Zhipu AI    | $0.12 |    23 |   $0.28 | 1.0M |   0.286 |    0.218 |  0.185 |    0.094 |   0.095 |    0.044 |
|  9 | 0.922 | Claude Fable 5        | Anthropic   |   $20 |    48 |   $42.6 | 1.0M |   0.296 |    0.248 |  0.196 |    0.083 |   0.098 |    0.001 |
| 10 | 0.922 | DeepSeek-V4-Pro-0813  | DeepSeek    | $0.84 |    46 |   $1.86 | 1.0M |   0.291 |    0.238 |  0.186 |    0.091 |   0.096 |    0.020 |

## @smol — Fast lightweight model: cheap and quick, still competent
eligible: 140

|  # | score | model                          | org                       |   $/M | tok/s | $/score |  ctx | price 30% | tput 25% | gen 20% | code 15% | tool 10% |
| -: | ----: | ------------------------------ | ------------------------- | ----: | ----: | ------: | ---: | --------: | -------: | ------: | -------: | -------: |
|  1 | 0.848 | ★ Ling 3.0 Flash               | InclusionAI               | $0.03 |   103 |   $0.11 | 131k |     0.298 |    0.225 |   0.157 |    0.110 |    0.058 |
|  2 | 0.822 | ★ Laguna S 2.1                 | Poolside                  | $0.11 |    86 |   $0.38 | 1.0M |     0.267 |    0.209 |   0.170 |    0.122 |    0.054 |
|  3 | 0.793 | ★ Qwen3.8 Flash                | Alibaba Cloud / Qwen Team | $0.23 |    48 |   $0.71 | 1.0M |     0.217 |    0.157 |   0.189 |    0.136 |    0.094 |
|  4 | 0.784 | MiMo-V2.6-Flash                | Xiaomi                    | $0.18 |    41 |   $0.62 | 1.0M |     0.235 |    0.139 |   0.185 |    0.139 |    0.086 |
|  5 | 0.782 | ★ DeepSeek-V4-Flash-Vision-Exp | DeepSeek                  | $0.32 |    63 |   $0.97 | 1.0M |     0.200 |    0.189 |   0.184 |    0.132 |    0.077 |
|  6 | 0.760 | Ling 3.0 Flash Fin             | InclusionAI               | $0.09 |   127 |   $0.47 | 262k |     0.276 |    0.242 |   0.175 |        — |    0.068 |
|  7 | 0.748 | GLM-5.3-Flash                  | Zhipu AI                  | $0.12 |    23 |   $0.63 | 1.0M |     0.265 |    0.067 |   0.191 |    0.131 |    0.094 |
|  8 | 0.747 | ★ Inkling-Small                | Thinking Machines Lab     | $0.64 |   132 |   $1.81 | 524k |     0.151 |    0.245 |   0.164 |    0.118 |    0.069 |
|  9 | 0.743 | Step-3.5-Flash                 | StepFun                   | $0.15 |    62 |   $0.73 |  66k |     0.250 |    0.186 |   0.162 |    0.095 |    0.051 |
| 10 | 0.725 | ★ Gemini 3.7 Flash             | Google                    | $1.50 |   154 |   $3.53 | 1.0M |     0.078 |    0.248 |   0.188 |    0.133 |    0.079 |

## @slow — Most capable model for hard problems; cost and speed as tiebreakers
eligible: 140

|  # | score | model                  | org         |   $/M | tok/s | $/score |  ctx | gen 25% | rea 25% | code 20% | ag 15% | math 10% | price 3% | tput 2% |
| -: | ----: | ---------------------- | ----------- | ----: | ----: | ------: | ---: | ------: | ------: | -------: | -----: | -------: | -------: | ------: |
|  1 | 0.949 | ★ Claude Fable 5       | Anthropic   |   $20 |    48 |   $41.9 | 1.0M |   0.247 |   0.246 |    0.199 |  0.147 |    0.098 |    0.001 |   0.013 |
|  2 | 0.947 | ★ Claude Opus 5        | Anthropic   |   $10 |    53 |     $21 | 1.0M |   0.247 |   0.248 |    0.193 |  0.145 |    0.099 |    0.001 |   0.013 |
|  3 | 0.946 | ★ GPT-5.6 Sol          | OpenAI      | $4.00 |    38 |   $8.47 | 1.1M |   0.249 |   0.249 |    0.199 |  0.149 |    0.087 |    0.003 |   0.010 |
|  4 | 0.945 | ★ GLM-5.3              | Zhipu AI    | $1.01 |    27 |   $2.17 | 1.0M |   0.245 |   0.247 |    0.195 |  0.144 |    0.098 |    0.010 |   0.007 |
|  5 | 0.941 | GPT-6 Astra            | OpenAI      |   $20 |    18 |   $42.6 | 1.1M |   0.250 |   0.250 |    0.200 |  0.150 |    0.087 |    0.001 |   0.003 |
|  6 | 0.935 | ★ DeepSeek-V4.1-Flash  | DeepSeek    | $0.21 |     6 |   $0.48 | 1.0M |   0.242 |   0.238 |    0.197 |  0.148 |    0.087 |    0.023 |   0.001 |
|  7 | 0.934 | Kimi K3                | Moonshot AI | $3.00 |    18 |   $6.53 | 1.0M |   0.245 |   0.245 |    0.196 |  0.144 |    0.097 |    0.004 |   0.003 |
|  8 | 0.934 | ★ DeepSeek-V4-Pro-0813 | DeepSeek    | $0.84 |    46 |   $1.86 | 1.0M |   0.243 |   0.240 |    0.190 |  0.140 |    0.097 |    0.012 |   0.012 |
|  9 | 0.927 | Hy4 preview            | Tencent     | $1.25 |    40 |   $2.80 |    — |   0.241 |   0.244 |    0.189 |  0.137 |    0.097 |    0.009 |   0.011 |
| 10 | 0.909 | ★ GLM-5.3-Flash        | Zhipu AI    | $0.12 |    23 |   $0.29 | 1.0M |   0.239 |   0.237 |    0.175 |  0.139 |    0.089 |    0.027 |   0.005 |

## @vision — Image understanding: vision index dominates
eligible: 72

|  # | score | model              | org                       |   $/M | tok/s | $/score |  ctx | vis 50% | gen 20% | rea 15% | code 10% | price 3% | tput 2% |
| -: | ----: | ------------------ | ------------------------- | ----: | ----: | ------: | ---: | ------: | ------: | ------: | -------: | -------: | ------: |
|  1 | 0.952 | ★ GPT-6 Astra      | OpenAI                    |   $20 |    18 |   $41.6 | 1.1M |   0.498 |   0.200 |   0.150 |    0.100 |    0.001 |   0.003 |
|  2 | 0.950 | ★ Claude Opus 5    | Anthropic                 |   $10 |    53 |   $20.9 | 1.0M |   0.493 |   0.198 |   0.149 |    0.097 |    0.001 |   0.013 |
|  3 | 0.949 | ★ GPT-5.6 Sol      | OpenAI                    | $4.00 |    38 |   $8.41 | 1.1M |   0.488 |   0.199 |   0.149 |    0.100 |    0.003 |   0.010 |
|  4 | 0.938 | Claude Fable 5     | Anthropic                 |   $20 |    48 |   $42.9 | 1.0M |   0.481 |   0.197 |   0.148 |    0.099 |    0.001 |   0.013 |
|  5 | 0.932 | ★ Kimi K3          | Moonshot AI               | $3.00 |    18 |   $6.57 | 1.0M |   0.483 |   0.196 |   0.147 |    0.098 |    0.004 |   0.003 |
|  6 | 0.923 | ★ Muse Spark 1.1   | Meta                      | $2.00 |   148 |   $4.48 | 1.0M |   0.476 |   0.190 |   0.145 |    0.088 |    0.005 |   0.020 |
|  7 | 0.923 | ★ Gemini 3.8 Flash | Google                    | $1.50 |   120 |   $3.38 | 1.0M |   0.471 |   0.191 |   0.140 |    0.094 |    0.008 |   0.019 |
|  8 | 0.923 | ★ Qwen3.8 Flash    | Alibaba Cloud / Qwen Team | $0.23 |    48 |   $0.54 | 1.0M |   0.467 |   0.189 |   0.143 |    0.090 |    0.022 |   0.013 |
|  9 | 0.906 | GPT-5.5            | OpenAI                    | $11.3 |    25 |     $26 | 1.1M |   0.478 |   0.187 |   0.141 |    0.093 |    0.001 |   0.006 |
| 10 | 0.900 | Claude Sonnet 5    | Anthropic                 | $4.00 |    49 |   $9.40 | 1.0M |   0.464 |   0.187 |   0.141 |    0.092 |    0.003 |   0.013 |

## @plan — Planning: reasoning, math, long-context coherence
eligible: 140

|  # | score | model            | org                       |   $/M | tok/s | $/score |  ctx | rea 30% | math 15% | lc 20% | gen 20% | mrcr 10% | price 3% | tput 2% |
| -: | ----: | ---------------- | ------------------------- | ----: | ----: | ------: | ---: | ------: | -------: | -----: | ------: | -------: | -------: | ------: |
|  1 | 0.925 | ★ GPT-5.6 Sol    | OpenAI                    | $4.00 |    38 |   $8.88 | 1.1M |   0.298 |    0.130 |  0.197 |   0.199 |    0.088 |    0.003 |   0.010 |
|  2 | 0.869 | GPT-5.6 Terra    | OpenAI                    | $4.50 |    12 |   $11.4 | 1.1M |   0.286 |    0.123 |  0.180 |   0.193 |    0.083 |    0.002 |   0.002 |
|  3 | 0.847 | GPT-5.5          | OpenAI                    | $11.3 |    25 |   $30.2 | 1.1M |   0.282 |    0.138 |  0.159 |   0.187 |    0.075 |    0.001 |   0.006 |
|  4 | 0.811 | ★ Muse Spark 1.3 | Meta                      | $2.00 |    63 |   $6.06 | 1.0M |   0.293 |        — |  0.200 |   0.197 |    0.100 |    0.005 |   0.015 |
|  5 | 0.792 | ★ GPT-5.6 Luna   | OpenAI                    | $0.45 |    28 |   $1.51 | 1.1M |   0.269 |    0.109 |  0.161 |   0.182 |    0.046 |    0.017 |   0.007 |
|  6 | 0.790 | ★ Qwen3.8 Flash  | Alibaba Cloud / Qwen Team | $0.23 |    48 |   $0.79 | 1.0M |   0.287 |    0.124 |  0.156 |   0.189 |        — |    0.022 |   0.013 |
|  7 | 0.789 | ★ Hy4 preview    | Tencent                   | $1.25 |    40 |   $4.11 |    — |   0.293 |    0.145 |  0.139 |   0.192 |        — |    0.009 |   0.011 |
|  8 | 0.788 | Gemini 3.7 Flash | Google                    | $1.50 |   154 |   $4.93 | 1.0M |   0.279 |        — |  0.198 |   0.188 |    0.096 |    0.008 |   0.020 |
|  9 | 0.785 | Qwen3.7-Plus     | Alibaba Cloud / Qwen Team | $0.56 |    11 |   $1.91 |    — |   0.265 |    0.142 |  0.186 |   0.174 |        — |    0.016 |   0.001 |
| 10 | 0.785 | Hy3              | Tencent                   | $0.23 |    35 |   $0.80 | 262k |   0.265 |    0.135 |  0.178 |   0.176 |        — |    0.022 |   0.010 |

## @commit — Commit messages: cheap and fast with decent general quality
eligible: 140

|  # | score | model                          | org                       |   $/M | tok/s | $/score |  ctx | price 35% | tput 25% | gen 25% | code 15% |
| -: | ----: | ------------------------------ | ------------------------- | ----: | ----: | ------: | ---: | --------: | -------: | ------: | -------: |
|  1 | 0.879 | ★ Ling 3.0 Flash               | InclusionAI               | $0.03 |   103 |   $0.10 | 131k |     0.348 |    0.225 |   0.196 |    0.110 |
|  2 | 0.856 | ★ Laguna S 2.1                 | Poolside                  | $0.11 |    86 |   $0.33 | 1.0M |     0.312 |    0.209 |   0.212 |    0.122 |
|  3 | 0.785 | ★ DeepSeek-V4-Flash-Vision-Exp | DeepSeek                  | $0.32 |    63 |   $0.93 | 1.0M |     0.233 |    0.189 |   0.230 |    0.132 |
|  4 | 0.785 | Laguna XS 2.1                  | Poolside                  | $0.07 |   122 |   $0.39 | 262k |     0.335 |    0.236 |   0.139 |    0.075 |
|  5 | 0.783 | MiMo-V2.6-Flash                | Xiaomi                    | $0.18 |    41 |   $0.62 | 1.0M |     0.274 |    0.139 |   0.231 |    0.139 |
|  6 | 0.782 | Qwen3.8 Flash                  | Alibaba Cloud / Qwen Team | $0.23 |    48 |   $0.73 | 1.0M |     0.254 |    0.157 |   0.236 |    0.136 |
|  7 | 0.781 | Ling 3.0 Flash Fin             | InclusionAI               | $0.09 |   127 |   $0.43 | 262k |     0.321 |    0.242 |   0.218 |        — |
|  8 | 0.775 | Step-3.5-Flash                 | StepFun                   | $0.15 |    62 |   $0.62 |  66k |     0.292 |    0.186 |   0.202 |    0.095 |
|  9 | 0.746 | GLM-5.3-Flash                  | Zhipu AI                  | $0.12 |    23 |   $0.69 | 1.0M |     0.310 |    0.067 |   0.239 |    0.131 |
| 10 | 0.744 | ★ Inkling-Small                | Thinking Machines Lab     | $0.64 |   132 |   $1.71 | 524k |     0.176 |    0.245 |   0.205 |    0.118 |

## @tiny — Background tasks (titles, memory): cheapest and fastest wins
eligible: 140

|  # | score | model                        | org                       |   $/M | tok/s | $/score |  ctx | price 40% | tput 35% | gen 25% |
| -: | ----: | ---------------------------- | ------------------------- | ----: | ----: | ------: | ---: | --------: | -------: | ------: |
|  1 | 0.924 | ★ Ling 3.0 Flash Fin         | InclusionAI               | $0.09 |   127 |   $0.21 | 262k |     0.367 |    0.338 |   0.218 |
|  2 | 0.908 | ★ Ling 3.0 Flash             | InclusionAI               | $0.03 |   103 |   $0.09 | 131k |     0.397 |    0.315 |   0.196 |
|  3 | 0.862 | Laguna S 2.1                 | Poolside                  | $0.11 |    86 |   $0.33 | 1.0M |     0.356 |    0.293 |   0.212 |
|  4 | 0.852 | Laguna XS 2.1                | Poolside                  | $0.07 |   122 |   $0.26 | 262k |     0.382 |    0.331 |   0.139 |
|  5 | 0.796 | Step-3.5-Flash               | StepFun                   | $0.15 |    62 |   $0.55 |  66k |     0.333 |    0.260 |   0.202 |
|  6 | 0.775 | IBM Granite 4.2 8B           | IBM                       | $0.11 |    94 |   $0.56 | 131k |     0.359 |    0.302 |   0.114 |
|  7 | 0.762 | DeepSeek-V4-Flash-Vision-Exp | DeepSeek                  | $0.32 |    63 |   $0.99 | 1.0M |     0.267 |    0.265 |   0.230 |
|  8 | 0.749 | Inkling-Small                | Thinking Machines Lab     | $0.64 |   132 |   $1.54 | 524k |     0.201 |    0.343 |   0.205 |
|  9 | 0.746 | Qwen3.8 Flash                | Alibaba Cloud / Qwen Team | $0.23 |    48 |   $0.89 | 1.0M |     0.290 |    0.220 |   0.236 |
| 10 | 0.739 | MiMo-V2.6-Flash              | Xiaomi                    | $0.18 |    41 |   $0.83 | 1.0M |     0.313 |    0.195 |   0.231 |

## @task — Subagents: agentic + tool calling, moderate cost sensitivity
eligible: 140

|  # | score | model                 | org                       |   $/M | tok/s | $/score |  ctx | ag 30% | tool 20% | code 20% | gen 15% | price 10% | tput 5% |
| -: | ----: | --------------------- | ------------------------- | ----: | ----: | ------: | ---: | -----: | -------: | -------: | ------: | --------: | ------: |
|  1 | 0.913 | ★ DeepSeek-V4.1-Flash | DeepSeek                  | $0.21 |     6 |   $0.49 | 1.0M |  0.295 |    0.199 |    0.197 |   0.145 |     0.076 |   0.001 |
|  2 | 0.885 | ★ GLM-5.3-Flash       | Zhipu AI                  | $0.12 |    23 |   $0.31 | 1.0M |  0.277 |    0.188 |    0.175 |   0.143 |     0.088 |   0.013 |
|  3 | 0.882 | ★ Muse Spark 1.3      | Meta                      | $2.00 |    63 |   $4.34 | 1.0M |  0.292 |    0.195 |    0.193 |   0.148 |     0.018 |   0.038 |
|  4 | 0.878 | Qwen3.8 Flash         | Alibaba Cloud / Qwen Team | $0.23 |    48 |   $0.58 | 1.0M |  0.263 |    0.189 |    0.181 |   0.142 |     0.072 |   0.031 |
|  5 | 0.876 | ★ GLM-5.3             | Zhipu AI                  | $1.01 |    27 |   $2.30 | 1.0M |  0.289 |    0.196 |    0.195 |   0.147 |     0.033 |   0.017 |
|  6 | 0.875 | ★ GPT-5.6 Sol         | OpenAI                    | $4.00 |    38 |   $8.66 | 1.1M |  0.298 |    0.193 |    0.199 |   0.149 |     0.009 |   0.026 |
|  7 | 0.870 | MiMo-V2.6-Pro         | Xiaomi                    | $0.54 |    31 |   $1.33 | 1.0M |  0.281 |    0.180 |    0.194 |   0.143 |     0.053 |   0.020 |
|  8 | 0.867 | DeepSeek-V4-Pro-0813  | DeepSeek                  | $0.84 |    46 |   $2.00 | 1.0M |  0.279 |    0.182 |    0.190 |   0.146 |     0.040 |   0.030 |
|  9 | 0.861 | MiMo-V2.6-Flash       | Xiaomi                    | $0.18 |    41 |   $0.47 | 1.0M |  0.260 |    0.171 |    0.185 |   0.139 |     0.078 |   0.028 |
| 10 | 0.860 | GPT-6 Astra           | OpenAI                    |   $20 |    18 |   $44.1 | 1.1M |  0.300 |    0.200 |    0.200 |   0.150 |     0.002 |   0.009 |

## @advisor — Advisor/watchdog: deep reasoning over long context
eligible: 140

|  # | score | model             | org                       |   $/M | tok/s | $/score |  ctx | rea 35% | gen 25% | lc 20% | math 10% | sea 5% | price 3% | tput 2% |
| -: | ----: | ----------------- | ------------------------- | ----: | ----: | ------: | ---: | ------: | ------: | -----: | -------: | -----: | -------: | ------: |
|  1 | 0.941 | ★ GPT-5.6 Sol     | OpenAI                    | $4.00 |    38 |   $8.56 | 1.1M |   0.348 |   0.249 |  0.197 |    0.087 |  0.048 |    0.003 |   0.010 |
|  2 | 0.887 | GPT-5.6 Terra     | OpenAI                    | $4.50 |    12 |   $10.9 | 1.1M |   0.334 |   0.241 |  0.180 |    0.082 |  0.046 |    0.002 |   0.002 |
|  3 | 0.884 | ★ Hy4 preview     | Tencent                   | $1.25 |    40 |   $3.10 |    — |   0.341 |   0.241 |  0.139 |    0.097 |  0.047 |    0.009 |   0.011 |
|  4 | 0.872 | ★ Hy3             | Tencent                   | $0.23 |    35 |   $0.61 | 262k |   0.309 |   0.220 |  0.178 |    0.090 |  0.044 |    0.022 |   0.010 |
|  5 | 0.860 | GPT-5.5           | OpenAI                    | $11.3 |    25 |   $29.2 | 1.1M |   0.329 |   0.233 |  0.159 |    0.092 |  0.040 |    0.001 |   0.006 |
|  6 | 0.846 | Qwen3.6 Plus      | Alibaba Cloud / Qwen Team | $0.73 |    34 |   $2.04 | 1.0M |   0.299 |   0.210 |  0.188 |    0.094 |  0.033 |    0.014 |   0.009 |
|  7 | 0.844 | Qwen3.8 Flash     | Alibaba Cloud / Qwen Team | $0.23 |    48 |   $0.66 | 1.0M |   0.335 |   0.236 |  0.156 |    0.083 |      — |    0.022 |   0.013 |
|  8 | 0.843 | Muse Spark 1.3    | Meta                      | $2.00 |    63 |   $5.50 | 1.0M |   0.342 |   0.246 |  0.200 |        — |  0.034 |    0.005 |   0.015 |
|  9 | 0.838 | GPT-5.6 Luna      | OpenAI                    | $0.45 |    28 |   $1.30 | 1.1M |   0.314 |   0.228 |  0.161 |    0.073 |  0.038 |    0.017 |   0.007 |
| 10 | 0.829 | Qwen3.5-397B-A17B | Alibaba Cloud / Qwen Team | $0.88 |    61 |   $2.56 | 262k |   0.290 |   0.206 |  0.181 |    0.089 |  0.037 |    0.011 |   0.015 |

# Suggested settings.modelRoles (best-fit #1 per role, resolved via the omp catalog).
# Selectors are openrouter/<id>; the omp-llm-role plugin writes this block daily.
modelRoles:
  default: "openrouter/deepseek/deepseek-v4.1-flash"
  smol: "openrouter/inclusionai/ling-3.0-flash"
  slow: "openrouter/anthropic/claude-fable-5"
  vision: "openrouter/openai/gpt-6-astra"
  plan: "openrouter/openai/gpt-5.6-sol"
  commit: "openrouter/inclusionai/ling-3.0-flash"
  tiny: "openrouter/inclusionai/ling-3.0-flash-fin"
  task: "openrouter/deepseek/deepseek-v4.1-flash"
  advisor: "openrouter/openai/gpt-5.6-sol"
