llm-stats.com best-fit ranking per omp model role — 398 models, 2026-09-24
Value ranking per role: each metric is cardinal-normalized with fixed anchors
(no ranks): llm-stats index_* affine (v+20)/80 (interval scale, observed −16..+60),
benchmarks chance-anchored pass rates, throughput log-anchored 10..300 tok/s.
q = Σ weight × metric over the quality metrics (weights renormalized excluding
price); value = q − λ·$/M sorts each role. λ = price-weight share ÷ $20, per-role
override via plugin settings roles.<role>.lambda. Metric columns show weighted
contributions and sum to q; — = metric missing (contributes 0).
Abbr: gen=general rea=reasoning math=math ag=agents tool=tool_calling lc=long_context
sea=search vis=vision tput=throughput (code, mrcr as-is).
★ = Pareto-frontier: no eligible model is both cheaper and better (q).
Throughput + price: OpenRouter (p50 tok/s, last 30m routed traffic; standard-route $/M 3:1 in:out), throughput 152/398, priced 151; models without OpenRouter throughput or a billed route are not ranked.

## @default — Main workhorse: strong general coding-agent quality, sane cost
eligible: 143 — λ 0.00263 $/quality-point

|  # | value |     q | model                 | org         |   $/M | tok/s |  ctx | gen 31.6% | code 26.3% | ag 21.1% | tool 10.5% | rea 10.5% |
| -: | ----: | ----: | --------------------- | ----------- | ----: | ----: | ---: | --------: | ---------: | -------: | ---------: | --------: |
|  1 | 0.835 | 0.888 | ★ GPT-6 Astra         | OpenAI      |   $20 |    30 | 1.1M |     0.314 |      0.227 |    0.173 |      0.072 |     0.102 |
|  2 | 0.819 | 0.830 | ★ GPT-5.6 Sol         | OpenAI      | $4.00 |    34 | 1.1M |     0.294 |      0.215 |    0.160 |      0.065 |     0.096 |
|  3 | 0.806 | 0.807 | ★ DeepSeek-V4.1-Flash | DeepSeek    | $0.28 |    24 | 1.0M |     0.282 |      0.208 |    0.158 |      0.069 |     0.090 |
|  4 | 0.804 | 0.809 | ★ Muse Spark 1.3      | Meta        | $2.00 |    95 | 1.0M |     0.291 |      0.202 |    0.157 |      0.066 |     0.094 |
|  5 | 0.799 | 0.802 | GLM-5.3               | Zhipu AI    | $0.86 |    23 | 1.0M |     0.285 |      0.203 |    0.154 |      0.066 |     0.094 |
|  6 | 0.795 | 0.805 | Kimi K3               | Moonshot AI | $3.74 |    24 | 1.0M |     0.286 |      0.205 |    0.153 |      0.067 |     0.094 |
|  7 | 0.782 | 0.808 | Claude Opus 5         | Anthropic   |   $10 |    58 | 1.0M |     0.295 |      0.200 |    0.156 |      0.059 |     0.097 |
|  8 | 0.781 | 0.783 | MiMo-V2.6-Pro         | Xiaomi      | $0.54 |    15 | 1.0M |     0.276 |      0.202 |    0.151 |      0.065 |     0.088 |
|  9 | 0.777 | 0.778 | DeepSeek-V4-Pro-0813  | DeepSeek    | $0.58 |    44 | 1.0M |     0.281 |      0.196 |    0.148 |      0.063 |     0.091 |
| 10 | 0.771 | 0.783 | GPT-5.6 Terra         | OpenAI      | $4.50 |    46 | 1.1M |     0.278 |      0.203 |    0.151 |      0.061 |     0.090 |

## @smol — Fast lightweight model: cheap and quick, still competent
eligible: 143 — λ 0.02143 $/quality-point

|  # | value |     q | model                        | org                       |   $/M | tok/s |  ctx | tput 35.7% | gen 28.6% | code 21.4% | tool 14.3% |
| -: | ----: | ----: | ---------------------------- | ------------------------- | ----: | ----: | ---: | ---------: | --------: | ---------: | ---------: |
|  1 | 0.741 | 0.784 | ★ Muse Spark 1.1             | Meta                      | $2.00 |   182 | 1.0M |      0.304 |     0.247 |      0.145 |      0.088 |
|  2 | 0.713 | 0.745 | ★ Gemini 3.8 Flash           | Google                    | $1.50 |   124 | 1.0M |      0.264 |     0.249 |      0.155 |      0.077 |
|  3 | 0.711 | 0.754 | Muse Spark 1.3               | Meta                      | $2.00 |    95 | 1.0M |      0.236 |     0.264 |      0.164 |      0.089 |
|  4 | 0.691 | 0.723 | Gemini 3.7 Flash             | Google                    | $1.50 |   121 | 1.0M |      0.262 |     0.242 |      0.144 |      0.076 |
|  5 | 0.653 | 0.667 | ★ Inkling-Small              | Thinking Machines Lab     | $0.64 |   116 | 524k |      0.257 |     0.208 |      0.131 |      0.070 |
|  6 | 0.651 | 0.656 | ★ Qwen3.8 Flash              | Alibaba Cloud / Qwen Team | $0.23 |    53 | 1.0M |      0.175 |     0.245 |      0.148 |      0.088 |
|  7 | 0.644 | 0.647 | ★ Laguna S 2.1               | Poolside                  | $0.11 |    93 | 1.0M |      0.234 |     0.216 |      0.135 |      0.062 |
|  8 | 0.641 | 0.654 | DeepSeek-V4-Pro-0813         | DeepSeek                  | $0.58 |    44 | 1.0M |      0.156 |     0.254 |      0.159 |      0.085 |
|  9 | 0.633 | 0.640 | DeepSeek-V4-Flash-Vision-Exp | DeepSeek                  | $0.32 |    60 | 1.0M |      0.188 |     0.232 |      0.145 |      0.074 |
| 10 | 0.631 | 0.632 | ★ Ling 3.0 Flash             | InclusionAI               | $0.03 |   104 | 131k |      0.246 |     0.201 |      0.121 |      0.064 |

## @slow — Most capable model for hard problems; cost and speed as tiebreakers
eligible: 143 — λ 0.00155 $/quality-point

|  # | value |     q | model                 | org         |   $/M | tok/s |  ctx | gen 25.8% | rea 25.8% | code 20.6% | ag 15.5% | math 10.3% | tput 2.1% |
| -: | ----: | ----: | --------------------- | ----------- | ----: | ----: | ---: | --------: | --------: | ---------: | -------: | ---------: | --------: |
|  1 | 0.857 | 0.888 | ★ GPT-6 Astra         | OpenAI      |   $20 |    30 | 1.1M |     0.256 |     0.249 |      0.178 |    0.127 |      0.071 |     0.007 |
|  2 | 0.834 | 0.840 | ★ GPT-5.6 Sol         | OpenAI      | $4.00 |    34 | 1.1M |     0.240 |     0.236 |      0.169 |    0.117 |      0.071 |     0.007 |
|  3 | 0.826 | 0.842 | ★ Claude Opus 5       | Anthropic   |   $10 |    58 | 1.0M |     0.241 |     0.238 |      0.157 |    0.115 |      0.081 |     0.011 |
|  4 | 0.816 | 0.818 | ★ GLM-5.3             | Zhipu AI    | $0.86 |    23 | 1.0M |     0.232 |     0.229 |      0.159 |    0.113 |      0.079 |     0.005 |
|  5 | 0.814 | 0.820 | ★ Kimi K3             | Moonshot AI | $3.74 |    24 | 1.0M |     0.234 |     0.230 |      0.161 |    0.113 |      0.078 |     0.005 |
|  6 | 0.806 | 0.807 | ★ DeepSeek-V4.1-Flash | DeepSeek    | $0.28 |    24 | 1.0M |     0.230 |     0.221 |      0.163 |    0.116 |      0.071 |     0.005 |
|  7 | 0.801 | 0.832 | Claude Fable 5        | Anthropic   |   $20 |    15 | 1.0M |     0.238 |     0.230 |      0.167 |    0.116 |      0.079 |     0.002 |
|  8 | 0.799 | 0.800 | DeepSeek-V4-Pro-0813  | DeepSeek    | $0.58 |    44 | 1.0M |     0.229 |     0.222 |      0.153 |    0.109 |      0.077 |     0.009 |
|  9 | 0.795 | 0.797 | Hy4 preview           | Tencent     | $1.25 |    32 |    — |     0.227 |     0.226 |      0.152 |    0.108 |      0.078 |     0.007 |
| 10 | 0.786 | 0.793 | GPT-5.6 Terra         | OpenAI      | $4.50 |    46 | 1.1M |     0.227 |     0.220 |      0.159 |    0.111 |      0.067 |     0.009 |

## @vision — Image understanding: vision index dominates
eligible: 74 — λ 0.00155 $/quality-point

|  # | value |     q | model               | org                       |   $/M | tok/s |  ctx | vis 51.5% | gen 20.6% | rea 15.5% | code 10.3% | tput 2.1% |
| -: | ----: | ----: | ------------------- | ------------------------- | ----: | ----: | ---: | --------: | --------: | --------: | ---------: | --------: |
|  1 | 0.809 | 0.840 | ★ GPT-6 Astra       | OpenAI                    |   $20 |    30 | 1.1M |     0.390 |     0.205 |     0.149 |      0.089 |     0.007 |
|  2 | 0.779 | 0.794 | ★ Claude Opus 5     | Anthropic                 |   $10 |    58 | 1.0M |     0.370 |     0.193 |     0.143 |      0.079 |     0.011 |
|  3 | 0.777 | 0.783 | ★ GPT-5.6 Sol       | OpenAI                    | $4.00 |    34 | 1.1M |     0.358 |     0.192 |     0.141 |      0.084 |     0.007 |
|  4 | 0.766 | 0.772 | ★ Kimi K3           | Moonshot AI               | $3.74 |    24 | 1.0M |     0.362 |     0.187 |     0.138 |      0.080 |     0.005 |
|  5 | 0.751 | 0.754 | ★ Muse Spark 1.1    | Meta                      | $2.00 |   182 | 1.0M |     0.353 |     0.178 |     0.135 |      0.070 |     0.018 |
|  6 | 0.744 | 0.775 | Claude Fable 5      | Anthropic                 |   $20 |    15 | 1.0M |     0.361 |     0.191 |     0.138 |      0.084 |     0.002 |
|  7 | 0.740 | 0.742 | ★ Gemini 3.8 Flash  | Google                    | $1.50 |   124 | 1.0M |     0.346 |     0.180 |     0.127 |      0.074 |     0.015 |
|  8 | 0.738 | 0.738 | ★ Qwen3.8 Flash     | Alibaba Cloud / Qwen Team | $0.23 |    53 | 1.0M |     0.347 |     0.177 |     0.133 |      0.071 |     0.010 |
|  9 | 0.730 | 0.731 | DeepSeek-V4.1-Flash | DeepSeek                  | $0.28 |    24 | 1.0M |     0.327 |     0.184 |     0.133 |      0.082 |     0.005 |
| 10 | 0.727 | 0.745 | GPT-5.5             | OpenAI                    | $11.3 |    47 | 1.1M |     0.356 |     0.175 |     0.130 |      0.074 |     0.009 |

## @plan — Planning: reasoning, math, long-context coherence
eligible: 143 — λ 0.00155 $/quality-point

|  # | value |     q | model            | org                       |   $/M | tok/s |  ctx | rea 30.9% | math 15.5% | lc 20.6% | gen 20.6% | mrcr 10.3% | tput 2.1% |
| -: | ----: | ----: | ---------------- | ------------------------- | ----: | ----: | ---: | --------: | ---------: | -------: | --------: | ---------: | --------: |
|  1 | 0.808 | 0.815 | ★ GPT-5.6 Sol    | OpenAI                    | $4.00 |    34 | 1.1M |     0.283 |      0.106 |    0.132 |     0.192 |      0.094 |     0.007 |
|  2 | 0.760 | 0.767 | GPT-5.6 Terra    | OpenAI                    | $4.50 |    46 | 1.1M |     0.264 |      0.101 |    0.119 |     0.181 |      0.092 |     0.009 |
|  3 | 0.721 | 0.738 | GPT-5.5          | OpenAI                    | $11.3 |    47 | 1.1M |     0.260 |      0.112 |    0.106 |     0.175 |      0.076 |     0.009 |
|  4 | 0.711 | 0.714 | ★ Muse Spark 1.3 | Meta                      | $2.00 |    95 | 1.0M |     0.275 |          — |    0.134 |     0.190 |      0.102 |     0.014 |
|  5 | 0.675 | 0.677 | ★ Hy4 preview    | Tencent                   | $1.25 |    32 |    — |     0.272 |      0.117 |    0.100 |     0.181 |          — |     0.007 |
|  6 | 0.673 | 0.675 | Gemini 3.7 Flash | Google                    | $1.50 |   121 | 1.0M |     0.253 |          — |    0.132 |     0.174 |      0.100 |     0.015 |
|  7 | 0.665 | 0.665 | ★ GPT-5.6 Luna   | OpenAI                    | $0.45 |    50 | 1.1M |     0.245 |      0.094 |    0.106 |     0.167 |      0.043 |     0.010 |
|  8 | 0.659 | 0.659 | ★ Qwen3.8 Flash  | Alibaba Cloud / Qwen Team | $0.23 |    53 | 1.0M |     0.265 |      0.102 |    0.105 |     0.177 |          — |     0.010 |
|  9 | 0.648 | 0.655 | Gemini 3.1 Pro   | Google                    | $4.50 |   103 | 1.0M |     0.251 |      0.121 |    0.079 |     0.163 |      0.027 |     0.014 |
| 10 | 0.642 | 0.643 | Qwen3.7-Plus     | Alibaba Cloud / Qwen Team | $0.56 |    16 |    — |     0.243 |      0.115 |    0.120 |     0.161 |          — |     0.003 |

## @commit — Commit messages: cheap and fast with decent general quality
eligible: 143 — λ 0.02692 $/quality-point

|  # | value |     q | model                        | org                       |   $/M | tok/s |  ctx | tput 38.5% | gen 38.5% | code 23.1% |
| -: | ----: | ----: | ---------------------------- | ------------------------- | ----: | ----: | ---: | ---------: | --------: | ---------: |
|  1 | 0.763 | 0.817 | ★ Muse Spark 1.1             | Meta                      | $2.00 |   182 | 1.0M |      0.328 |     0.333 |      0.156 |
|  2 | 0.746 | 0.786 | ★ Gemini 3.8 Flash           | Google                    | $1.50 |   124 | 1.0M |      0.285 |     0.335 |      0.167 |
|  3 | 0.733 | 0.787 | Muse Spark 1.3               | Meta                      | $2.00 |    95 | 1.0M |      0.255 |     0.355 |      0.177 |
|  4 | 0.722 | 0.762 | Gemini 3.7 Flash             | Google                    | $1.50 |   121 | 1.0M |      0.282 |     0.325 |      0.155 |
|  5 | 0.684 | 0.687 | ★ Laguna S 2.1               | Poolside                  | $0.11 |    93 | 1.0M |      0.252 |     0.290 |      0.145 |
|  6 | 0.682 | 0.699 | ★ Inkling-Small              | Thinking Machines Lab     | $0.64 |   116 | 524k |      0.277 |     0.280 |      0.141 |
|  7 | 0.672 | 0.678 | Qwen3.8 Flash                | Alibaba Cloud / Qwen Team | $0.23 |    53 | 1.0M |      0.189 |     0.330 |      0.159 |
|  8 | 0.665 | 0.681 | DeepSeek-V4-Pro-0813         | DeepSeek                  | $0.58 |    44 | 1.0M |      0.168 |     0.342 |      0.172 |
|  9 | 0.664 | 0.665 | ★ Ling 3.0 Flash             | InclusionAI               | $0.03 |   104 | 131k |      0.265 |     0.270 |      0.130 |
| 10 | 0.663 | 0.672 | DeepSeek-V4-Flash-Vision-Exp | DeepSeek                  | $0.32 |    60 | 1.0M |      0.203 |     0.313 |      0.157 |

## @tiny — Background tasks (titles, memory): cheapest and fastest wins
eligible: 143 — λ 0.03333 $/quality-point

|  # | value |     q | model                | org                   |   $/M | tok/s |  ctx | tput 58.3% | gen 41.7% |
| -: | ----: | ----: | -------------------- | --------------------- | ----: | ----: | ---: | ---------: | --------: |
|  1 | 0.791 | 0.858 | ★ Muse Spark 1.1     | Meta                  | $2.00 |   182 | 1.0M |      0.497 |     0.361 |
|  2 | 0.772 | 0.775 | ★ Ling 3.0 Flash Fin | InclusionAI           | $0.09 |   136 | 262k |      0.448 |     0.327 |
|  3 | 0.745 | 0.795 | ★ Gemini 3.8 Flash   | Google                | $1.50 |   124 | 1.0M |      0.432 |     0.363 |
|  4 | 0.730 | 0.780 | Gemini 3.7 Flash     | Google                | $1.50 |   121 | 1.0M |      0.428 |     0.352 |
|  5 | 0.729 | 0.741 | Mercury 2            | Inception             | $0.38 |   201 | 128k |      0.515 |     0.227 |
|  6 | 0.711 | 0.714 | ★ Laguna XS 2.1      | Poolside              | $0.07 |   167 | 262k |      0.483 |     0.231 |
|  7 | 0.704 | 0.771 | Muse Spark 1.3       | Meta                  | $2.00 |    95 | 1.0M |      0.386 |     0.385 |
|  8 | 0.703 | 0.724 | Inkling-Small        | Thinking Machines Lab | $0.64 |   116 | 524k |      0.420 |     0.304 |
|  9 | 0.694 | 0.695 | ★ Ling 3.0 Flash     | InclusionAI           | $0.03 |   104 | 131k |      0.402 |     0.293 |
| 10 | 0.693 | 0.697 | Laguna S 2.1         | Poolside              | $0.11 |    93 | 1.0M |      0.382 |     0.314 |

## @task — Subagents: agentic + tool calling, moderate cost sensitivity
eligible: 143 — λ 0.00556 $/quality-point

|  # | value |     q | model                 | org         |   $/M | tok/s |  ctx | ag 33.3% | tool 22.2% | code 22.2% | gen 16.7% | tput 5.6% |
| -: | ----: | ----: | --------------------- | ----------- | ----: | ----: | ---: | -------: | ---------: | ---------: | --------: | --------: |
|  1 | 0.737 | 0.748 | ★ Muse Spark 1.3      | Meta        | $2.00 |    95 | 1.0M |    0.248 |      0.139 |      0.170 |     0.154 |     0.037 |
|  2 | 0.733 | 0.734 | ★ DeepSeek-V4.1-Flash | DeepSeek    | $0.28 |    24 | 1.0M |    0.250 |      0.145 |      0.176 |     0.149 |     0.014 |
|  3 | 0.724 | 0.746 | GPT-5.6 Sol           | OpenAI      | $4.00 |    34 | 1.1M |    0.253 |      0.136 |      0.182 |     0.155 |     0.020 |
|  4 | 0.714 | 0.719 | GLM-5.3               | Zhipu AI    | $0.86 |    23 | 1.0M |    0.244 |      0.140 |      0.172 |     0.150 |     0.014 |
|  5 | 0.702 | 0.705 | DeepSeek-V4-Pro-0813  | DeepSeek    | $0.58 |    44 | 1.0M |    0.235 |      0.132 |      0.165 |     0.148 |     0.024 |
|  6 | 0.701 | 0.722 | Kimi K3               | Moonshot AI | $3.74 |    24 | 1.0M |    0.243 |      0.141 |      0.173 |     0.151 |     0.014 |
|  7 | 0.698 | 0.701 | MiMo-V2.6-Pro         | Xiaomi      | $0.54 |    15 | 1.0M |    0.240 |      0.138 |      0.170 |     0.146 |     0.007 |
|  8 | 0.693 | 0.704 | Muse Spark 1.1        | Meta        | $2.00 |   182 | 1.0M |    0.225 |      0.137 |      0.150 |     0.144 |     0.047 |
|  9 | 0.690 | 0.801 | ★ GPT-6 Astra         | OpenAI      |   $20 |    30 | 1.1M |    0.274 |      0.152 |      0.192 |     0.166 |     0.018 |
| 10 | 0.687 | 0.694 | Hy4 preview           | Tencent     | $1.25 |    32 |    — |    0.233 |      0.132 |      0.163 |     0.147 |     0.019 |

## @advisor — Advisor/watchdog: deep reasoning over long context
eligible: 143 — λ 0.00155 $/quality-point

|  # | value |     q | model           | org                       |   $/M | tok/s |  ctx | rea 36.1% | gen 25.8% | lc 20.6% | math 10.3% | sea 5.2% | tput 2.1% |
| -: | ----: | ----: | --------------- | ------------------------- | ----: | ----: | ---: | --------: | --------: | -------: | ---------: | -------: | --------: |
|  1 | 0.805 | 0.811 | ★ GPT-5.6 Sol   | OpenAI                    | $4.00 |    34 | 1.1M |     0.330 |     0.240 |    0.132 |      0.071 |    0.031 |     0.007 |
|  2 | 0.758 | 0.760 | ★ Hy4 preview   | Tencent                   | $1.25 |    32 |    — |     0.317 |     0.227 |    0.100 |      0.078 |    0.031 |     0.007 |
|  3 | 0.753 | 0.760 | GPT-5.6 Terra   | OpenAI                    | $4.50 |    46 | 1.1M |     0.308 |     0.227 |    0.119 |      0.067 |    0.030 |     0.009 |
|  4 | 0.728 | 0.731 | Muse Spark 1.3  | Meta                      | $2.00 |    95 | 1.0M |     0.321 |     0.238 |    0.134 |          — |    0.025 |     0.014 |
|  5 | 0.722 | 0.739 | GPT-5.5         | OpenAI                    | $11.3 |    47 | 1.1M |     0.304 |     0.218 |    0.106 |      0.075 |    0.027 |     0.009 |
|  6 | 0.713 | 0.714 | ★ Qwen3.8 Flash | Alibaba Cloud / Qwen Team | $0.23 |    53 | 1.0M |     0.309 |     0.221 |    0.105 |      0.068 |        — |     0.010 |
|  7 | 0.711 | 0.711 | Hy3             | Tencent                   | $0.23 |    30 | 262k |     0.284 |     0.203 |    0.116 |      0.073 |    0.029 |     0.007 |
|  8 | 0.699 | 0.699 | GPT-5.6 Luna    | OpenAI                    | $0.45 |    50 | 1.1M |     0.286 |     0.209 |    0.106 |      0.063 |    0.025 |     0.010 |
|  9 | 0.692 | 0.693 | Qwen3.6 Plus    | Alibaba Cloud / Qwen Team | $0.73 |    36 | 1.0M |     0.272 |     0.191 |    0.122 |      0.076 |    0.024 |     0.008 |
| 10 | 0.691 | 0.698 | Gemini 3.1 Pro  | Google                    | $4.50 |   103 | 1.0M |     0.293 |     0.204 |    0.079 |      0.080 |    0.029 |     0.014 |

# Suggested settings.modelRoles (best-fit #1 per role, resolved via the omp catalog).
# Selectors are openrouter/<id>; the omp-llm-role plugin writes this block daily.
modelRoles:
  default: "openrouter/openai/gpt-6-astra"
  smol: "openrouter/meta/muse-spark-1.1"
  slow: "openrouter/openai/gpt-6-astra"
  vision: "openrouter/openai/gpt-6-astra"
  plan: "openrouter/openai/gpt-5.6-sol"
  commit: "openrouter/meta/muse-spark-1.1"
  tiny: "openrouter/meta/muse-spark-1.1"
  task: "openrouter/meta/muse-spark-1.3"
  advisor: "openrouter/openai/gpt-5.6-sol"
