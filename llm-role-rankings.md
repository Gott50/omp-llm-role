llm-stats.com best-fit ranking per omp model role — 395 models, 2026-09-27
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
★ = Pareto-frontier: no eligible model is both cheaper and better (q).
Throughput + price: OpenRouter (p50 tok/s, last 30m routed traffic; standard-route $/M 3:1 in:out), throughput 147/395, priced 146; models without OpenRouter throughput or a billed route are not ranked.

## @default — Main workhorse: strong general coding-agent quality, sane cost
eligible: 138 — λ 0.00263 $/quality-point

|  # | value |     q | model                 | org         |   $/M | tok/s |  ctx | gen 35.8% | rea 18.9% | code 18.9% | ag 12.6% | tool 10.5% | tput 3.2% |
| -: | ----: | ----: | --------------------- | ----------- | ----: | ----: | ---: | --------: | --------: | ---------: | -------: | ---------: | --------: |
|  1 | 0.836 | 0.888 | ★ GPT-6 Astra         | OpenAI      |   $20 |    33 | 1.1M |     0.357 |     0.183 |      0.163 |    0.104 |      0.071 |     0.011 |
|  2 | 0.833 | 0.843 | ★ GPT-5.6 Sol         | OpenAI      | $4.00 |    51 | 1.1M |     0.335 |     0.175 |      0.157 |    0.097 |      0.065 |     0.015 |
|  3 | 0.822 | 0.827 | ★ Muse Spark 1.3      | Meta        | $2.00 |    89 | 1.0M |     0.331 |     0.169 |      0.146 |    0.094 |      0.066 |     0.020 |
|  4 | 0.817 | 0.820 | ★ GLM-5.3             | Zhipu AI    | $0.85 |    77 | 1.0M |     0.324 |     0.169 |      0.147 |    0.093 |      0.067 |     0.019 |
|  5 | 0.806 | 0.814 | Kimi K3               | Moonshot AI | $3.00 |    33 | 1.0M |     0.325 |     0.169 |      0.149 |    0.093 |      0.067 |     0.011 |
|  6 | 0.799 | 0.800 | ★ DeepSeek-V4.1-Flash | DeepSeek    | $0.10 |    12 | 1.0M |     0.320 |     0.163 |      0.151 |    0.096 |      0.069 |     0.002 |
|  7 | 0.795 | 0.822 | Claude Opus 5         | Anthropic   |   $10 |    46 | 1.0M |     0.334 |     0.174 |      0.146 |    0.094 |      0.060 |     0.014 |
|  8 | 0.793 | 0.794 | DeepSeek-V4-Pro-0813  | DeepSeek    | $0.37 |    46 | 1.0M |     0.320 |     0.165 |      0.142 |    0.090 |      0.063 |     0.014 |
|  9 | 0.783 | 0.786 | Hy4 preview           | Tencent     | $1.25 |    32 |    — |     0.316 |     0.167 |      0.140 |    0.089 |      0.063 |     0.011 |
| 10 | 0.781 | 0.793 | GPT-5.6 Terra         | OpenAI      | $4.50 |    38 | 1.1M |     0.317 |     0.163 |      0.147 |    0.092 |      0.062 |     0.012 |

## @smol — Fast lightweight model: cheap and quick, still competent
eligible: 138 — λ 0.02143 $/quality-point

|  # | value |     q | model                          | org                       |   $/M | tok/s |  ctx | tput 40% | gen 28.6% | code 17.1% | tool 14.3% |
| -: | ----: | ----: | ------------------------------ | ------------------------- | ----: | ----: | ---: | -------: | --------: | ---------: | ---------: |
|  1 | 0.750 | 0.793 | ★ Muse Spark 1.1               | Meta                      | $2.00 |   181 | 1.0M |    0.341 |     0.248 |      0.117 |      0.088 |
|  2 | 0.731 | 0.763 | ★ Gemini 3.8 Flash             | Google                    | $1.50 |   141 | 1.0M |    0.311 |     0.250 |      0.125 |      0.077 |
|  3 | 0.708 | 0.740 | Gemini 3.7 Flash               | Google                    | $1.50 |   131 | 1.0M |    0.303 |     0.244 |      0.117 |      0.076 |
|  4 | 0.705 | 0.723 | ★ GLM-5.3                      | Zhipu AI                  | $0.85 |    77 | 1.0M |    0.240 |     0.259 |      0.133 |      0.091 |
|  5 | 0.701 | 0.743 | Muse Spark 1.3                 | Meta                      | $2.00 |    89 | 1.0M |    0.257 |     0.264 |      0.132 |      0.090 |
|  6 | 0.695 | 0.702 | ★ DeepSeek-V4-Flash-Vision-Exp | DeepSeek                  | $0.32 |   105 | 1.0M |    0.277 |     0.234 |      0.117 |      0.075 |
|  7 | 0.664 | 0.736 | Gemini 3.5 Flash               | Google                    | $3.38 |   146 | 1.0M |    0.315 |     0.223 |      0.110 |      0.088 |
|  8 | 0.647 | 0.652 | ★ Qwen3.8 Flash                | Alibaba Cloud / Qwen Team | $0.23 |    54 | 1.0M |    0.198 |     0.246 |      0.119 |      0.088 |
|  9 | 0.647 | 0.647 | ★ Ling 3.0 Flash               | InclusionAI               | $0.03 |   113 | 131k |    0.285 |     0.201 |      0.097 |      0.064 |
| 10 | 0.641 | 0.649 | DeepSeek-V4-Pro-0813           | DeepSeek                  | $0.37 |    46 | 1.0M |    0.179 |     0.256 |      0.128 |      0.086 |

## @slow — Most capable model for hard problems; cost and speed as tiebreakers
eligible: 138 — λ 0.00263 $/quality-point (thinking ×7.857)

|  # | value |     q | model                  | org                       |   $/M | tok/s |  ctx | gen 27.4% | rea 27.4% | code 18.9% | ag 13.7% | math 8.4% | tput 4.2% |
| -: | ----: | ----: | ---------------------- | ------------------------- | ----: | ----: | ---: | --------: | --------: | ---------: | -------: | --------: | --------: |
|  1 | 0.813 | 0.830 | ★ GLM-5.3              | Zhipu AI                  | $6.67 |    77 | 1.0M |     0.248 |     0.245 |      0.147 |    0.101 |     0.064 |     0.025 |
|  2 | 0.798 | 0.805 | ★ DeepSeek-V4-Pro-0813 | DeepSeek                  | $2.88 |    46 | 1.0M |     0.245 |     0.238 |      0.142 |    0.098 |     0.064 |     0.019 |
|  3 | 0.793 | 0.795 | ★ DeepSeek-V4.1-Flash  | DeepSeek                  | $0.78 |    12 | 1.0M |     0.245 |     0.235 |      0.151 |    0.104 |     0.058 |     0.002 |
|  4 | 0.772 | 0.798 | Hy4 preview            | Tencent                   | $9.83 |    32 |    — |     0.242 |     0.241 |      0.140 |    0.096 |     0.064 |     0.014 |
|  5 | 0.769 | 0.773 | Qwen3.8 Flash          | Alibaba Cloud / Qwen Team | $1.81 |    54 | 1.0M |     0.236 |     0.235 |      0.132 |    0.094 |     0.055 |     0.021 |
|  6 | 0.766 | 0.848 | ★ GPT-5.6 Sol          | OpenAI                    | $31.4 |    51 | 1.1M |     0.256 |     0.252 |      0.157 |    0.105 |     0.058 |     0.020 |
|  7 | 0.759 | 0.761 | ★ GLM-5.3-Flash        | Zhipu AI                  | $0.54 |    13 | 1.0M |     0.239 |     0.235 |      0.128 |    0.097 |     0.059 |     0.003 |
|  8 | 0.759 | 0.821 | Kimi K3                | Moonshot AI               | $23.6 |    33 | 1.0M |     0.249 |     0.244 |      0.149 |    0.100 |     0.064 |     0.015 |
|  9 | 0.757 | 0.799 | Muse Spark 1.1         | Meta                      | $15.7 |   181 | 1.0M |     0.238 |     0.239 |      0.129 |    0.093 |     0.064 |     0.036 |
| 10 | 0.734 | 0.749 | GLM-5.2                | Zhipu AI                  | $5.90 |    63 | 1.0M |     0.224 |     0.222 |      0.131 |    0.085 |     0.065 |     0.023 |

## @vision — Image understanding: vision index dominates
eligible: 70 — λ 0.00208 $/quality-point (thinking ×1.857)

|  # | value |     q | model              | org                       |   $/M | tok/s |  ctx | vis 54.2% | gen 20.8% | rea 15.6% | code 6.3% | tput 3.1% |
| -: | ----: | ----: | ------------------ | ------------------------- | ----: | ----: | ---: | --------: | --------: | --------: | --------: | --------: |
|  1 | 0.773 | 0.789 | ★ GPT-5.6 Sol      | OpenAI                    | $7.43 |    51 | 1.1M |     0.383 |     0.195 |     0.144 |     0.052 |     0.015 |
|  2 | 0.764 | 0.841 | ★ GPT-6 Astra      | OpenAI                    | $37.1 |    33 | 1.1M |     0.418 |     0.208 |     0.151 |     0.054 |     0.011 |
|  3 | 0.758 | 0.770 | ★ Kimi K3          | Moonshot AI               | $5.57 |    33 | 1.0M |     0.381 |     0.189 |     0.139 |     0.049 |     0.011 |
|  4 | 0.753 | 0.792 | ★ Claude Opus 5    | Anthropic                 | $18.6 |    46 | 1.0M |     0.392 |     0.194 |     0.143 |     0.048 |     0.014 |
|  5 | 0.750 | 0.758 | ★ Muse Spark 1.1   | Meta                      | $3.71 |   181 | 1.0M |     0.371 |     0.181 |     0.137 |     0.043 |     0.027 |
|  6 | 0.742 | 0.748 | ★ Gemini 3.8 Flash | Google                    | $2.79 |   141 | 1.0M |     0.366 |     0.183 |     0.129 |     0.045 |     0.024 |
|  7 | 0.738 | 0.739 | ★ Qwen3.8 Flash    | Alibaba Cloud / Qwen Team | $0.43 |    54 | 1.0M |     0.366 |     0.180 |     0.134 |     0.044 |     0.015 |
|  8 | 0.725 | 0.731 | Gemini 3.7 Flash   | Google                    | $2.79 |   131 | 1.0M |     0.358 |     0.178 |     0.129 |     0.043 |     0.024 |
|  9 | 0.717 | 0.733 | Claude Sonnet 5    | Anthropic                 | $7.43 |    57 | 1.0M |     0.363 |     0.177 |     0.132 |     0.044 |     0.016 |
| 10 | 0.715 | 0.723 | Muse Spark 1.3     | Meta                      | $3.71 |    89 | 1.0M |     0.322 |     0.193 |     0.139 |     0.048 |     0.020 |

## @plan — Planning: reasoning, math, long-context coherence
eligible: 138 — λ 0.00556 $/quality-point (thinking ×2.714)

|  # | value |     q | model                | org                       |   $/M | tok/s |  ctx | rea 35.6% | gen 28.9% | lc 15.6% | math 15.6% | tput 4.4% |
| -: | ----: | ----: | -------------------- | ------------------------- | ----: | ----: | ---: | --------: | --------: | -------: | ---------: | --------: |
|  1 | 0.766 | 0.826 | ★ GPT-5.6 Sol        | OpenAI                    | $10.9 |    51 | 1.1M |     0.328 |     0.271 |    0.099 |      0.107 |     0.021 |
|  2 | 0.759 | 0.778 | ★ Hy4 preview        | Tencent                   | $3.39 |    32 |    — |     0.313 |     0.255 |    0.076 |      0.119 |     0.015 |
|  3 | 0.755 | 0.758 | ★ Qwen3.8 Flash      | Alibaba Cloud / Qwen Team | $0.62 |    54 | 1.0M |     0.306 |     0.249 |    0.079 |      0.102 |     0.022 |
|  4 | 0.712 | 0.725 | GLM-5.3              | Zhipu AI                  | $2.30 |    77 | 1.0M |     0.318 |     0.262 |        — |      0.119 |     0.027 |
|  5 | 0.710 | 0.718 | Qwen3.7-Plus         | Alibaba Cloud / Qwen Team | $1.52 |    15 |    — |     0.280 |     0.226 |    0.091 |      0.116 |     0.005 |
|  6 | 0.708 | 0.711 | Hy3                  | Tencent                   | $0.62 |    15 | 262k |     0.280 |     0.228 |    0.088 |      0.111 |     0.005 |
|  7 | 0.708 | 0.715 | GPT-5.6 Luna         | OpenAI                    | $1.22 |    47 | 1.1M |     0.284 |     0.236 |    0.080 |      0.095 |     0.020 |
|  8 | 0.702 | 0.770 | GPT-5.6 Terra        | OpenAI                    | $12.2 |    38 | 1.1M |     0.306 |     0.256 |    0.089 |      0.102 |     0.017 |
|  9 | 0.701 | 0.706 | DeepSeek-V4-Pro-0813 | DeepSeek                  | $0.99 |    46 | 1.0M |     0.309 |     0.258 |        — |      0.119 |     0.020 |
| 10 | 0.697 | 0.708 | Qwen3.6 Plus         | Alibaba Cloud / Qwen Team | $1.98 |    38 | 1.0M |     0.269 |     0.215 |    0.092 |      0.115 |     0.017 |

## @commit — Commit messages: cheap and fast with decent general quality
eligible: 138 — λ 0.02692 $/quality-point

|  # | value |     q | model                          | org                       |   $/M | tok/s |  ctx | tput 41.5% | gen 43.1% | code 15.4% |
| -: | ----: | ----: | ------------------------------ | ------------------------- | ----: | ----: | ---: | ---------: | --------: | ---------: |
|  1 | 0.779 | 0.833 | ★ Muse Spark 1.1               | Meta                      | $2.00 |   181 | 1.0M |      0.354 |     0.374 |      0.105 |
|  2 | 0.772 | 0.812 | ★ Gemini 3.8 Flash             | Google                    | $1.50 |   141 | 1.0M |      0.323 |     0.377 |      0.112 |
|  3 | 0.746 | 0.787 | Gemini 3.7 Flash               | Google                    | $1.50 |   131 | 1.0M |      0.314 |     0.367 |      0.105 |
|  4 | 0.736 | 0.745 | ★ DeepSeek-V4-Flash-Vision-Exp | DeepSeek                  | $0.32 |   105 | 1.0M |      0.287 |     0.353 |      0.105 |
|  5 | 0.736 | 0.759 | ★ GLM-5.3                      | Zhipu AI                  | $0.85 |    77 | 1.0M |      0.249 |     0.390 |      0.120 |
|  6 | 0.730 | 0.784 | Muse Spark 1.3                 | Meta                      | $2.00 |    89 | 1.0M |      0.267 |     0.399 |      0.119 |
|  7 | 0.686 | 0.686 | ★ Ling 3.0 Flash               | InclusionAI               | $0.03 |   113 | 131k |      0.296 |     0.303 |      0.087 |
|  8 | 0.679 | 0.685 | Qwen3.8 Flash                  | Alibaba Cloud / Qwen Team | $0.23 |    54 | 1.0M |      0.206 |     0.372 |      0.107 |
|  9 | 0.677 | 0.687 | DeepSeek-V4-Pro-0813           | DeepSeek                  | $0.37 |    46 | 1.0M |      0.186 |     0.385 |      0.115 |
| 10 | 0.672 | 0.763 | Gemini 3.5 Flash               | Google                    | $3.38 |   146 | 1.0M |      0.327 |     0.337 |      0.098 |

## @tiny — Background tasks (titles, memory): cheapest and fastest wins
eligible: 138 — λ 0.03333 $/quality-point

|  # | value |     q | model                        | org                   |   $/M | tok/s |  ctx | tput 58.3% | gen 41.7% |
| -: | ----: | ----: | ---------------------------- | --------------------- | ----: | ----: | ---: | ---------: | --------: |
|  1 | 0.792 | 0.858 | ★ Muse Spark 1.1             | Meta                  | $2.00 |   181 | 1.0M |      0.497 |     0.362 |
|  2 | 0.777 | 0.780 | ★ Ling 3.0 Flash Fin         | InclusionAI           | $0.09 |   140 | 262k |      0.453 |     0.328 |
|  3 | 0.769 | 0.819 | ★ Gemini 3.8 Flash           | Google                | $1.50 |   141 | 1.0M |      0.454 |     0.365 |
|  4 | 0.747 | 0.797 | Gemini 3.7 Flash             | Google                | $1.50 |   131 | 1.0M |      0.441 |     0.355 |
|  5 | 0.734 | 0.745 | DeepSeek-V4-Flash-Vision-Exp | DeepSeek              | $0.32 |   105 | 1.0M |      0.403 |     0.341 |
|  6 | 0.709 | 0.722 | Mercury 2                    | Inception             | $0.38 |   179 | 128k |      0.495 |     0.227 |
|  7 | 0.708 | 0.709 | ★ Ling 3.0 Flash             | InclusionAI           | $0.03 |   113 | 131k |      0.416 |     0.293 |
|  8 | 0.699 | 0.727 | GLM-5.3                      | Zhipu AI              | $0.85 |    77 | 1.0M |      0.350 |     0.377 |
|  9 | 0.694 | 0.760 | Muse Spark 1.3               | Meta                  | $2.00 |    89 | 1.0M |      0.375 |     0.385 |
| 10 | 0.674 | 0.696 | Inkling-Small                | Thinking Machines Lab | $0.64 |    98 | 524k |      0.391 |     0.304 |

## @task — Subagents: agentic + tool calling, moderate cost sensitivity
eligible: 138 — λ 0.00747 $/quality-point

|  # | value |     q | model                 | org                       |   $/M | tok/s |  ctx | ag 29.9% | tool 20.7% | code 18.4% | gen 25.3% | tput 5.7% |
| -: | ----: | ----: | --------------------- | ------------------------- | ----: | ----: | ---: | -------: | ---------: | ---------: | --------: | --------: |
|  1 | 0.752 | 0.758 | ★ GLM-5.3             | Zhipu AI                  | $0.85 |    77 | 1.0M |    0.220 |      0.131 |      0.143 |     0.229 |     0.034 |
|  2 | 0.751 | 0.766 | ★ Muse Spark 1.3      | Meta                      | $2.00 |    89 | 1.0M |    0.223 |      0.130 |      0.142 |     0.234 |     0.037 |
|  3 | 0.743 | 0.773 | ★ GPT-5.6 Sol         | OpenAI                    | $4.00 |    51 | 1.1M |    0.229 |      0.128 |      0.152 |     0.237 |     0.028 |
|  4 | 0.736 | 0.737 | ★ DeepSeek-V4.1-Flash | DeepSeek                  | $0.10 |    12 | 1.0M |    0.226 |      0.135 |      0.147 |     0.226 |     0.003 |
|  5 | 0.724 | 0.727 | DeepSeek-V4-Pro-0813  | DeepSeek                  | $0.37 |    46 | 1.0M |    0.213 |      0.124 |      0.138 |     0.226 |     0.026 |
|  6 | 0.723 | 0.745 | Kimi K3               | Moonshot AI               | $3.00 |    33 | 1.0M |    0.219 |      0.132 |      0.144 |     0.230 |     0.020 |
|  7 | 0.715 | 0.719 | MiMo-V2.6-Pro         | Xiaomi                    | $0.54 |    28 | 1.0M |    0.215 |      0.124 |      0.142 |     0.221 |     0.017 |
|  8 | 0.709 | 0.724 | Muse Spark 1.1        | Meta                      | $2.00 |   181 | 1.0M |    0.203 |      0.127 |      0.125 |     0.220 |     0.049 |
|  9 | 0.706 | 0.717 | Gemini 3.8 Flash      | Google                    | $1.50 |   141 | 1.0M |    0.206 |      0.112 |      0.134 |     0.222 |     0.045 |
| 10 | 0.705 | 0.706 | Qwen3.8 Flash         | Alibaba Cloud / Qwen Team | $0.23 |    54 | 1.0M |    0.205 |      0.127 |      0.128 |     0.218 |     0.028 |

## @advisor — Advisor/watchdog: deep reasoning over long context
eligible: 138 — λ 0.00435 $/quality-point

|  # | value |     q | model                | org                       |   $/M | tok/s |  ctx | rea 39.1% | gen 32.6% | lc 13% | math 10.9% | tput 4.3% |
| -: | ----: | ----: | -------------------- | ------------------------- | ----: | ----: | ---: | --------: | --------: | -----: | ---------: | --------: |
|  1 | 0.828 | 0.845 | ★ GPT-5.6 Sol        | OpenAI                    | $4.00 |    51 | 1.1M |     0.361 |     0.305 |  0.083 |      0.075 |     0.021 |
|  2 | 0.789 | 0.794 | ★ Hy4 preview        | Tencent                   | $1.25 |    32 |    — |     0.345 |     0.288 |  0.063 |      0.083 |     0.015 |
|  3 | 0.776 | 0.777 | ★ Qwen3.8 Flash      | Alibaba Cloud / Qwen Team | $0.23 |    54 | 1.0M |     0.336 |     0.281 |  0.067 |      0.071 |     0.022 |
|  4 | 0.769 | 0.788 | GPT-5.6 Terra        | OpenAI                    | $4.50 |    38 | 1.1M |     0.336 |     0.289 |  0.075 |      0.071 |     0.017 |
|  5 | 0.755 | 0.763 | Muse Spark 1.3       | Meta                      | $2.00 |    89 | 1.0M |     0.349 |     0.302 |  0.085 |          — |     0.028 |
|  6 | 0.751 | 0.754 | GLM-5.3              | Zhipu AI                  | $0.85 |    77 | 1.0M |     0.350 |     0.295 |      — |      0.083 |     0.026 |
|  7 | 0.736 | 0.744 | Muse Spark 1.1       | Meta                      | $2.00 |   181 | 1.0M |     0.342 |     0.283 |      — |      0.082 |     0.037 |
|  8 | 0.733 | 0.734 | DeepSeek-V4-Pro-0813 | DeepSeek                  | $0.37 |    46 | 1.0M |     0.340 |     0.292 |      — |      0.083 |     0.020 |
|  9 | 0.732 | 0.781 | GPT-5.5              | OpenAI                    | $11.3 |    91 | 1.1M |     0.330 |     0.277 |  0.067 |      0.079 |     0.028 |
| 10 | 0.730 | 0.743 | Kimi K3              | Moonshot AI               | $3.00 |    33 | 1.0M |     0.349 |     0.296 |      — |      0.083 |     0.015 |

## @designer — Design work: visual/UX judgement on image-capable models
eligible: 82 — λ 0.00882 $/quality-point (thinking ×2.714)

|  # | value |     q | model                        | org                       |   $/M | tok/s |  ctx | gen 35.3% | code 23.5% | vis 23.5% | tput 17.6% |
| -: | ----: | ----: | ---------------------------- | ------------------------- | ----: | ----: | ---: | --------: | ---------: | --------: | ---------: |
|  1 | 0.741 | 0.777 | ★ Gemini 3.8 Flash           | Google                    | $4.07 |   141 | 1.0M |     0.309 |      0.171 |     0.159 |      0.137 |
|  2 | 0.730 | 0.778 | ★ Muse Spark 1.1             | Meta                      | $5.43 |   181 | 1.0M |     0.306 |      0.160 |     0.161 |      0.150 |
|  3 | 0.715 | 0.751 | Gemini 3.7 Flash             | Google                    | $4.07 |   131 | 1.0M |     0.301 |      0.161 |     0.155 |      0.133 |
|  4 | 0.714 | 0.761 | Muse Spark 1.3               | Meta                      | $5.43 |    89 | 1.0M |     0.327 |      0.181 |     0.140 |      0.113 |
|  5 | 0.709 | 0.715 | ★ Qwen3.8 Flash              | Alibaba Cloud / Qwen Team | $0.62 |    54 | 1.0M |     0.304 |      0.164 |     0.159 |      0.087 |
|  6 | 0.688 | 0.696 | DeepSeek-V4-Flash-Vision-Exp | DeepSeek                  | $0.88 |   105 | 1.0M |     0.289 |      0.161 |     0.124 |      0.122 |
|  7 | 0.680 | 0.776 | GPT-5.6 Sol                  | OpenAI                    | $10.9 |    51 | 1.1M |     0.331 |      0.195 |     0.166 |      0.085 |
|  8 | 0.669 | 0.682 | MiMo-V2.6-Pro                | Xiaomi                    | $1.48 |    28 | 1.0M |     0.308 |      0.182 |     0.139 |      0.053 |
|  9 | 0.661 | 0.733 | Kimi K3                      | Moonshot AI               | $8.14 |    33 | 1.0M |     0.321 |      0.185 |     0.165 |      0.062 |
| 10 | 0.657 | 0.668 | GPT-5.6 Luna                 | OpenAI                    | $1.22 |    47 | 1.1M |     0.288 |      0.167 |     0.132 |      0.080 |

# Suggested settings.modelRoles (best-fit #1 per role, resolved via the omp catalog).
# Selectors are openrouter/<id>; the omp-llm-role plugin writes this block daily.
modelRoles:
  default: "openrouter/openai/gpt-6-astra"
  smol: "openrouter/meta/muse-spark-1.1"
  slow: "openrouter/z-ai/glm-5.3"
  vision: "openrouter/openai/gpt-5.6-sol"
  plan: "openrouter/openai/gpt-5.6-sol"
  commit: "openrouter/meta/muse-spark-1.1"
  tiny: "openrouter/meta/muse-spark-1.1"
  task: "openrouter/z-ai/glm-5.3"
  advisor: "openrouter/openai/gpt-5.6-sol"
  designer: "openrouter/google/gemini-3.8-flash"
