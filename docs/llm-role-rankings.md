llm-stats.com best-fit ranking per omp model role — 456 models, 2026-11-28
Value ranking per role: each metric is cardinal-normalized with fixed anchors
(no ranks): llm-stats index_* affine (v+20)/80 (interval scale, observed −16..+60),
benchmarks chance-anchored pass rates, throughput log-anchored 10..300 tok/s.
q = Σ weight × metric over the quality metrics (weights renormalized excluding
price); value = q − λ·$/M sorts each role. λ = w/(1−w) ÷ $20 (w = price weight), per-role
override via plugin settings roles.<role>.lambda. Metric columns show weighted
contributions and sum to q; — = metric missing (contributes 0).
Roles with a thinking level rank on the thinking-adjusted price: each model is
priced at the level it will actually run — the role's pin clamped to the model's
advertised range (the largest level at or below the pin, else the model's lowest;
a non-thinking model runs off) — and the written selector carries that level.
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
Throughput + price: OpenRouter per-provider routes under the default price-based routing (weight 1/price² over stable standard-tier providers; p50 tok/s of routed traffic; $/M 3:1 in:out), throughput 151/456, priced 150; models without OpenRouter throughput or a billed route are not ranked.

## @default — Main workhorse: strong general coding-agent quality, sane cost
eligible: 143 — λ 0.00556 $/quality-point (thinking :medium, clamped per model)

|  # | value |     q | model                      | org         |   $/M | tok/s |  ctx | gen 54.7% | code 18.9% | ag 12.6% | tool 10.5% | tput 3.2% |
| -: | ----: | ----: | -------------------------- | ----------- | ----: | ----: | ---: | --------: | ---------: | -------: | ---------: | --------: |
|  1 | 0.821 | 0.886 | ★ Gemini 4 Neon            | Google      | $11.6 |    77 | 1.0M |     0.537 |      0.151 |    0.103 |      0.076 |     0.019 |
|  2 | 0.814 | 0.857 | ★ Gemini 4 Carbon          | Google      | $7.76 |    37 | 1.0M |     0.523 |      0.153 |    0.100 |      0.070 |     0.012 |
|  3 | 0.809 | 0.830 | ★ Kimi K3.1 Pro            | Moonshot AI | $3.71 |    83 | 1.0M |     0.506 |      0.143 |    0.094 |      0.066 |     0.020 |
|  4 | 0.796 | 0.797 | ★ DeepSeek-V4.1-Flash-1017 | DeepSeek    | $0.23 |   129 | 1.0M |     0.477 |      0.139 |    0.091 |      0.066 |     0.024 |
|  5 | 0.788 | 0.832 | GPT-6.2 Sol                | OpenAI      | $7.83 |    69 | 1.1M |     0.503 |      0.147 |    0.095 |      0.069 |     0.018 |
|  6 | 0.786 | 0.787 | DeepSeek-V4.1-Flash        | DeepSeek    | $0.32 |   152 | 1.0M |     0.467 |      0.138 |    0.089 |      0.068 |     0.025 |
|  7 | 0.777 | 0.784 | GLM-5.3                    | Zhipu AI    | $1.26 |    90 | 1.0M |     0.474 |      0.137 |    0.087 |      0.066 |     0.020 |
|  8 | 0.776 | 0.796 | Muse Spark 1.3             | Meta        | $3.71 |   115 | 1.0M |     0.484 |      0.136 |    0.089 |      0.065 |     0.023 |
|  9 | 0.773 | 0.815 | Gemini 4 Argon             | Google      | $7.65 |    38 | 1.0M |     0.497 |      0.144 |    0.094 |      0.068 |     0.012 |
| 10 | 0.765 | 0.768 | MiniMax M3.1 Flash         | MiniMax     | $0.41 |   149 | 1.0M |     0.460 |      0.134 |    0.086 |      0.062 |     0.025 |

## @smol — Fast lightweight model: cheap and quick, still competent
eligible: 143 — λ 0.04091 $/quality-point (thinking :off, clamped per model)

|  # | value |     q | model                      | org                   |   $/M | tok/s |  ctx | tput 40% | gen 28.6% | code 17.1% | tool 14.3% |
| -: | ----: | ----: | -------------------------- | --------------------- | ----: | ----: | ---: | -------: | --------: | ---------: | ---------: |
|  1 | 0.798 | 0.819 | ★ Beam 1.0                 | Reflection AI         | $0.51 |   385 | 1.0M |    0.400 |     0.225 |      0.113 |      0.081 |
|  2 | 0.771 | 0.781 | ★ DeepSeek-V4.1-Flash      | DeepSeek              | $0.22 |   152 | 1.0M |    0.320 |     0.244 |      0.125 |      0.092 |
|  3 | 0.759 | 0.765 | ★ DeepSeek-V4.1-Flash-1017 | DeepSeek              | $0.16 |   129 | 1.0M |    0.300 |     0.249 |      0.125 |      0.090 |
|  4 | 0.754 | 0.764 | MiniMax M3.1 Flash         | MiniMax               | $0.22 |   149 | 1.0M |    0.318 |     0.240 |      0.121 |      0.085 |
|  5 | 0.733 | 0.815 | Muse Spark 1.1             | Meta                  | $2.00 |   244 | 1.0M |    0.376 |     0.241 |      0.110 |      0.089 |
|  6 | 0.720 | 0.735 | Inkling 2 Small            | Thinking Machines Lab | $0.37 |   118 | 256k |    0.290 |     0.239 |      0.120 |      0.086 |
|  7 | 0.713 | 0.718 | ★ GLM-5.3-Flash            | Zhipu AI              | $0.12 |   111 | 1.0M |    0.283 |     0.241 |      0.107 |      0.086 |
|  8 | 0.710 | 0.737 | Inkling-Small              | Thinking Machines Lab | $0.64 |   217 | 524k |    0.362 |     0.205 |      0.102 |      0.068 |
|  9 | 0.691 | 0.773 | Muse Spark Open            | Meta                  | $2.00 |   194 | 1.0M |    0.349 |     0.231 |      0.113 |      0.081 |
| 10 | 0.686 | 0.723 | MiniMax M2.7               | MiniMax               | $0.90 |   219 | 205k |    0.363 |     0.197 |      0.100 |      0.063 |

## @slow — Most capable model for hard problems; cost and speed as tiebreakers
eligible: 143 — λ 0.00263 $/quality-point (thinking :high, clamped per model)

|  # | value |     q | model                      | org                       |   $/M | tok/s |  ctx | gen 63.2% | code 18.9% | ag 13.7% | tput 4.2% |
| -: | ----: | ----: | -------------------------- | ------------------------- | ----: | ----: | ---: | --------: | ---------: | -------: | --------: |
|  1 | 0.863 | 0.907 | ★ Gemini 4 Neon            | Google                    |   $17 |    77 | 1.0M |     0.620 |      0.151 |    0.112 |     0.025 |
|  2 | 0.850 | 0.880 | ★ Gemini 4 Carbon          | Google                    | $11.3 |    37 | 1.0M |     0.603 |      0.153 |    0.108 |     0.016 |
|  3 | 0.837 | 0.856 | ★ Kimi K3.1 Pro            | Moonshot AI               | $7.06 |    83 | 1.0M |     0.584 |      0.143 |    0.102 |     0.026 |
|  4 | 0.824 | 0.854 | GPT-6.2 Sol                | OpenAI                    | $11.4 |    69 | 1.1M |     0.581 |      0.147 |    0.103 |     0.024 |
|  5 | 0.818 | 0.819 | ★ DeepSeek-V4.1-Flash-1017 | DeepSeek                  | $0.44 |   129 | 1.0M |     0.551 |      0.139 |    0.098 |     0.032 |
|  6 | 0.807 | 0.836 | Gemini 4 Argon             | Google                    | $11.2 |    38 | 1.0M |     0.574 |      0.144 |    0.101 |     0.017 |
|  7 | 0.806 | 0.821 | ★ Muse Spark 1.3           | Meta                      | $5.43 |   115 | 1.0M |     0.559 |      0.136 |    0.096 |     0.030 |
|  8 | 0.806 | 0.808 | DeepSeek-V4.1-Flash        | DeepSeek                  | $0.61 |   152 | 1.0M |     0.539 |      0.138 |    0.096 |     0.034 |
|  9 | 0.799 | 0.805 | GLM-5.3                    | Zhipu AI                  | $2.39 |    90 | 1.0M |     0.547 |      0.137 |    0.094 |     0.027 |
| 10 | 0.791 | 0.807 | Qwen4-Max                  | Alibaba Cloud / Qwen Team | $5.95 |    65 | 984k |     0.551 |      0.134 |    0.098 |     0.023 |

## @vision — Image understanding: vision index dominates
eligible: 83 — λ 0.00682 $/quality-point (thinking :medium, clamped per model)

|  # | value |     q | model                      | org                       |   $/M | tok/s |  ctx | vis 54.2% | gen 20.8% | rea 15.6% | code 6.3% | tput 3.1% |
| -: | ----: | ----: | -------------------------- | ------------------------- | ----: | ----: | ---: | --------: | --------: | --------: | --------: | --------: |
|  1 | 0.775 | 0.801 | ★ Kimi K3.1 Pro            | Moonshot AI               | $3.71 |    83 | 1.0M |     0.399 |     0.193 |     0.142 |     0.047 |     0.019 |
|  2 | 0.732 | 0.733 | ★ DeepSeek-V4.1-Flash-1017 | DeepSeek                  | $0.23 |   129 | 1.0M |     0.351 |     0.182 |     0.131 |     0.046 |     0.023 |
|  3 | 0.728 | 0.807 | ★ Gemini 4 Neon            | Google                    | $11.6 |    77 | 1.0M |     0.384 |     0.204 |     0.150 |     0.050 |     0.019 |
|  4 | 0.724 | 0.727 | Qwen3.8 Flash              | Alibaba Cloud / Qwen Team | $0.43 |    73 | 1.0M |     0.362 |     0.174 |     0.132 |     0.041 |     0.018 |
|  5 | 0.723 | 0.749 | ★ Muse Spark 1.1           | Meta                      | $3.71 |   244 | 1.0M |     0.370 |     0.176 |     0.134 |     0.040 |     0.029 |
|  6 | 0.720 | 0.754 | Kimi K3                    | Moonshot AI               | $4.89 |    78 | 1.0M |     0.371 |     0.182 |     0.136 |     0.046 |     0.019 |
|  7 | 0.718 | 0.720 | DeepSeek-V4.1-Flash        | DeepSeek                  | $0.32 |   152 | 1.0M |     0.342 |     0.178 |     0.130 |     0.046 |     0.025 |
|  8 | 0.715 | 0.716 | ★ GLM-5.3-Flash            | Zhipu AI                  | $0.18 |   111 | 1.0M |     0.348 |     0.176 |     0.131 |     0.039 |     0.022 |
|  9 | 0.707 | 0.759 | Gemini 4 Argon             | Google                    | $7.65 |    38 | 1.0M |     0.373 |     0.189 |     0.137 |     0.048 |     0.012 |
| 10 | 0.706 | 0.759 | Gemini 4 Carbon            | Google                    | $7.76 |    37 | 1.0M |     0.354 |     0.199 |     0.143 |     0.050 |     0.012 |

## @plan — Planning: reasoning and long-context coherence, priced so the cheapest capable planner wins
eligible: 143 — λ 0.01667 $/quality-point (thinking :medium, clamped per model)

|  # | value |     q | model                      | org                       |   $/M | tok/s |  ctx | gen 80% | lc 15.6% | tput 4.4% |
| -: | ----: | ----: | -------------------------- | ------------------------- | ----: | ----: | ---: | ------: | -------: | --------: |
|  1 | 0.778 | 0.840 | ★ Muse Spark 1.3           | Meta                      | $3.71 |   115 | 1.0M |   0.707 |    0.100 |     0.032 |
|  2 | 0.764 | 0.771 | ★ Qwen3.8 Flash            | Alibaba Cloud / Qwen Team | $0.43 |    73 | 1.0M |   0.670 |    0.076 |     0.026 |
|  3 | 0.758 | 0.761 | ★ DeepSeek-V4.1-Flash-1017 | DeepSeek                  | $0.23 |   129 | 1.0M |   0.698 |    0.030 |     0.033 |
|  4 | 0.756 | 0.772 | ★ Beam 1.0                 | Reflection AI             | $0.95 |   385 | 1.0M |   0.631 |    0.096 |     0.044 |
|  5 | 0.744 | 0.749 | DeepSeek-V4.1-Flash        | DeepSeek                  | $0.32 |   152 | 1.0M |   0.683 |    0.030 |     0.036 |
|  6 | 0.743 | 0.873 | ★ Gemini 4 Carbon          | Google                    | $7.76 |    37 | 1.0M |   0.764 |    0.092 |     0.017 |
|  7 | 0.740 | 0.788 | ★ Gemini 3.8 Flash         | Google                    | $2.87 |    73 | 1.0M |   0.676 |    0.086 |     0.026 |
|  8 | 0.738 | 0.769 | Hy4 preview                | Tencent                   | $1.90 |    47 |    — |   0.678 |    0.072 |     0.020 |
|  9 | 0.736 | 0.798 | Kimi K3.1 Pro              | Moonshot AI               | $3.71 |    83 | 1.0M |   0.740 |    0.030 |     0.028 |
| 10 | 0.735 | 0.783 | Gemini 3.7 Flash           | Google                    | $2.87 |    84 | 1.0M |   0.659 |    0.096 |     0.028 |

## @commit — Commit messages: cheap and fast with decent general quality
eligible: 143 — λ 0.04091 $/quality-point (thinking :off, clamped per model)

|  # | value |     q | model                      | org                   |   $/M | tok/s |  ctx | tput 41.5% | gen 43.1% | code 15.4% |
| -: | ----: | ----: | -------------------------- | --------------------- | ----: | ----: | ---: | ---------: | --------: | ---------: |
|  1 | 0.835 | 0.856 | ★ Beam 1.0                 | Reflection AI         | $0.51 |   385 | 1.0M |      0.415 |     0.340 |      0.101 |
|  2 | 0.803 | 0.812 | ★ DeepSeek-V4.1-Flash      | DeepSeek              | $0.22 |   152 | 1.0M |      0.332 |     0.368 |      0.112 |
|  3 | 0.794 | 0.800 | ★ DeepSeek-V4.1-Flash-1017 | DeepSeek              | $0.16 |   129 | 1.0M |      0.312 |     0.376 |      0.113 |
|  4 | 0.792 | 0.801 | ★ MiniMax M3.1 Flash       | MiniMax               | $0.22 |   149 | 1.0M |      0.330 |     0.362 |      0.108 |
|  5 | 0.770 | 0.852 | Muse Spark 1.1             | Meta                  | $2.00 |   244 | 1.0M |      0.390 |     0.363 |      0.099 |
|  6 | 0.754 | 0.769 | Inkling 2 Small            | Thinking Machines Lab | $0.37 |   118 | 256k |      0.301 |     0.360 |      0.108 |
|  7 | 0.750 | 0.776 | Inkling-Small              | Thinking Machines Lab | $0.64 |   217 | 524k |      0.376 |     0.308 |      0.092 |
|  8 | 0.749 | 0.754 | ★ GLM-5.3-Flash            | Zhipu AI              | $0.12 |   111 | 1.0M |      0.294 |     0.364 |      0.096 |
|  9 | 0.729 | 0.811 | Muse Spark Open            | Meta                  | $2.00 |   194 | 1.0M |      0.362 |     0.348 |      0.101 |
| 10 | 0.727 | 0.764 | MiniMax M2.7               | MiniMax               | $0.90 |   219 | 205k |      0.377 |     0.297 |      0.090 |

## @tiny — Background tasks (titles, memory): cheapest and fastest wins
eligible: 143 — λ 0.03333 $/quality-point (thinking :off, clamped per model)

|  # | value |     q | model                      | org                   |   $/M | tok/s |  ctx | tput 58.3% | gen 41.7% |
| -: | ----: | ----: | -------------------------- | --------------------- | ----: | ----: | ---: | ---------: | --------: |
|  1 | 0.895 | 0.912 | ★ Beam 1.0                 | Reflection AI         | $0.51 |   385 | 1.0M |      0.583 |     0.329 |
|  2 | 0.833 | 0.899 | Muse Spark 1.1             | Meta                  | $2.00 |   244 | 1.0M |      0.548 |     0.351 |
|  3 | 0.815 | 0.822 | ★ DeepSeek-V4.1-Flash      | DeepSeek              | $0.22 |   152 | 1.0M |      0.466 |     0.356 |
|  4 | 0.806 | 0.814 | ★ MiniMax M3.1 Flash       | MiniMax               | $0.22 |   149 | 1.0M |      0.463 |     0.351 |
|  5 | 0.805 | 0.826 | Inkling-Small              | Thinking Machines Lab | $0.64 |   217 | 524k |      0.528 |     0.298 |
|  6 | 0.796 | 0.801 | ★ DeepSeek-V4.1-Flash-1017 | DeepSeek              | $0.16 |   129 | 1.0M |      0.438 |     0.363 |
|  7 | 0.786 | 0.816 | MiniMax M2.7               | MiniMax               | $0.90 |   219 | 205k |      0.529 |     0.287 |
|  8 | 0.784 | 0.790 | Particle-1                 | Particle AI           | $0.18 |   209 | 1.0M |      0.521 |     0.269 |
|  9 | 0.778 | 0.845 | Muse Spark Open            | Meta                  | $2.00 |   194 | 1.0M |      0.508 |     0.336 |
| 10 | 0.761 | 0.765 | ★ GLM-5.3-Flash            | Zhipu AI              | $0.12 |   111 | 1.0M |      0.413 |     0.352 |

## @task — Subagents: agentic + tool calling, moderate cost sensitivity
eligible: 143 — λ 0.00747 $/quality-point (thinking :medium, clamped per model)

|  # | value |     q | model                      | org                   |   $/M | tok/s |  ctx | ag 29.9% | tool 20.7% | code 18.4% | gen 25.3% | tput 5.7% |
| -: | ----: | ----: | -------------------------- | --------------------- | ----: | ----: | ---: | -------: | ---------: | ---------: | --------: | --------: |
|  1 | 0.742 | 0.744 | ★ DeepSeek-V4.1-Flash-1017 | DeepSeek              | $0.23 |   129 | 1.0M |    0.215 |      0.131 |      0.135 |     0.221 |     0.043 |
|  2 | 0.737 | 0.739 | DeepSeek-V4.1-Flash        | DeepSeek              | $0.32 |   152 | 1.0M |    0.210 |      0.133 |      0.134 |     0.216 |     0.046 |
|  3 | 0.735 | 0.822 | ★ Gemini 4 Neon            | Google                | $11.6 |    77 | 1.0M |    0.244 |      0.149 |      0.146 |     0.248 |     0.035 |
|  4 | 0.735 | 0.762 | ★ Kimi K3.1 Pro            | Moonshot AI           | $3.71 |    83 | 1.0M |    0.224 |      0.130 |      0.139 |     0.234 |     0.036 |
|  5 | 0.726 | 0.785 | ★ Gemini 4 Carbon          | Google                | $7.76 |    37 | 1.0M |    0.236 |      0.137 |      0.148 |     0.241 |     0.022 |
|  6 | 0.714 | 0.724 | GLM-5.3                    | Zhipu AI              | $1.26 |    90 | 1.0M |    0.206 |      0.129 |      0.133 |     0.219 |     0.037 |
|  7 | 0.711 | 0.714 | MiniMax M3.1 Flash         | MiniMax               | $0.41 |   149 | 1.0M |    0.203 |      0.123 |      0.130 |     0.213 |     0.046 |
|  8 | 0.709 | 0.768 | GPT-6.2 Sol                | OpenAI                | $7.83 |    69 | 1.1M |    0.224 |      0.136 |      0.143 |     0.232 |     0.033 |
|  9 | 0.707 | 0.735 | Muse Spark 1.3             | Meta                  | $3.71 |   115 | 1.0M |    0.210 |      0.128 |      0.132 |     0.224 |     0.041 |
| 10 | 0.699 | 0.704 | Inkling 2 Small            | Thinking Machines Lab | $0.68 |   118 | 256k |    0.197 |      0.125 |      0.129 |     0.211 |     0.042 |

## @advisor — Advisor/watchdog: deep reasoning over long context
eligible: 143 — λ 0.01250 $/quality-point (thinking :medium, clamped per model)

|  # | value |     q | model                      | org                       |   $/M | tok/s |  ctx | gen 74.3% | lc 12.6% | tput 13.1% |
| -: | ----: | ----: | -------------------------- | ------------------------- | ----: | ----: | ---: | --------: | -------: | ---------: |
|  1 | 0.786 | 0.832 | ★ Muse Spark 1.3           | Meta                      | $3.71 |   115 | 1.0M |     0.657 |    0.081 |      0.094 |
|  2 | 0.784 | 0.796 | ★ Beam 1.0                 | Reflection AI             | $0.95 |   385 | 1.0M |     0.587 |    0.078 |      0.131 |
|  3 | 0.768 | 0.771 | ★ DeepSeek-V4.1-Flash-1017 | DeepSeek                  | $0.23 |   129 | 1.0M |     0.648 |    0.024 |      0.098 |
|  4 | 0.760 | 0.764 | DeepSeek-V4.1-Flash        | DeepSeek                  | $0.32 |   152 | 1.0M |     0.635 |    0.024 |      0.105 |
|  5 | 0.754 | 0.760 | Qwen3.8 Flash              | Alibaba Cloud / Qwen Team | $0.43 |    73 | 1.0M |     0.622 |    0.061 |      0.076 |
|  6 | 0.749 | 0.754 | MiniMax M3.1 Flash         | MiniMax                   | $0.41 |   149 | 1.0M |     0.625 |    0.024 |      0.104 |
|  7 | 0.747 | 0.794 | Kimi K3.1 Pro              | Moonshot AI               | $3.71 |    83 | 1.0M |     0.687 |    0.024 |      0.082 |
|  8 | 0.743 | 0.745 | ★ GLM-5.3-Flash            | Zhipu AI                  | $0.18 |   111 | 1.0M |     0.628 |    0.024 |      0.093 |
|  9 | 0.742 | 0.888 | ★ Gemini 4 Neon            | Google                    | $11.6 |    77 | 1.0M |     0.729 |    0.079 |      0.079 |
| 10 | 0.738 | 0.774 | Gemini 3.8 Flash           | Google                    | $2.87 |    73 | 1.0M |     0.628 |    0.069 |      0.076 |

## @designer — Design work: visual/UX judgement on image-capable models
eligible: 100 — λ 0.01024 $/quality-point (thinking :medium, clamped per model)

|  # | value |     q | model                      | org         |   $/M | tok/s |  ctx | gen 31.3% | code 7.2% | vis 21.7% | tput 18.1% | web 21.7% | agon |
| -: | ----: | ----: | -------------------------- | ----------- | ----: | ----: | ---: | --------: | --------: | --------: | ---------: | --------: | ---: |
|  1 | 0.781 | 0.783 | ★ DeepSeek-V4.1-Flash-1017 | DeepSeek    | $0.23 |   129 | 1.0M |     0.273 |     0.053 |     0.141 |      0.136 |     0.181 |    — |
|  2 | 0.776 | 0.814 | ★ Kimi K3.1 Pro            | Moonshot AI | $3.71 |    83 | 1.0M |     0.290 |     0.055 |     0.160 |      0.113 |     0.198 | 1296 |
|  3 | 0.758 | 0.796 | ★ Muse Spark 1.3           | Meta        | $3.71 |   115 | 1.0M |     0.277 |     0.052 |     0.127 |      0.130 |     0.211 | 1266 |
|  4 | 0.746 | 0.785 | Muse Spark 1.1             | Meta        | $3.71 |   244 | 1.0M |     0.264 |     0.046 |     0.148 |      0.170 |     0.156 |    — |
|  5 | 0.744 | 0.782 | Muse Spark Open            | Meta        | $3.71 |   194 | 1.0M |     0.253 |     0.048 |     0.138 |      0.158 |     0.185 |    — |
|  6 | 0.743 | 0.793 | Kimi K3                    | Moonshot AI | $4.89 |    78 | 1.0M |     0.274 |     0.053 |     0.149 |      0.109 |     0.208 | 1267 |
|  7 | 0.718 | 0.720 | ★ GLM-5.3-Flash            | Zhipu AI    | $0.18 |   111 | 1.0M |     0.265 |     0.045 |     0.140 |      0.128 |     0.142 |    — |
|  8 | 0.712 | 0.831 | ★ Gemini 4 Neon            | Google      | $11.6 |    77 | 1.0M |     0.307 |     0.058 |     0.154 |      0.109 |     0.204 |    — |
|  9 | 0.710 | 0.739 | Gemini 3.8 Flash           | Google      | $2.87 |    73 | 1.0M |     0.265 |     0.048 |     0.144 |      0.105 |     0.178 | 1206 |
| 10 | 0.709 | 0.739 | Gemini 3.7 Flash           | Google      | $2.87 |    84 | 1.0M |     0.258 |     0.045 |     0.140 |      0.113 |     0.182 | 1197 |
focus: website — coverage 141/456 (30.9%) ok; dispersion 0.993 ok; composition ok; freshness 0.0mo ok; trust unknown; modality unknown; maintenance unknown; provenance unknown; cross-source unknown

# Suggested settings.modelRoles (best-fit #1 per role, resolved via the omp catalog).
# Selectors are <provider>/<id> (openrouter unless a provider priority is set); the omp-llm-role plugin writes this block daily.
modelRoles:
  default: "openrouter/moonshotai/kimi-k3.1-pro:low"
  smol: "openrouter/reflection/beam-1.0-501b-a23b:off"
  slow: "openrouter/moonshotai/kimi-k3.1-pro:high"
  vision: "openrouter/moonshotai/kimi-k3.1-pro:low"
  plan: "openrouter/deepseek/deepseek-v4.1-flash-1017:low"
  commit: "openrouter/reflection/beam-1.0-501b-a23b:off"
  tiny: "openrouter/reflection/beam-1.0-501b-a23b:off"
  task: "openrouter/deepseek/deepseek-v4.1-flash-1017:low"
  advisor: "openrouter/reflection/beam-1.0-501b-a23b:medium"
  designer: "openrouter/deepseek/deepseek-v4.1-flash-1017:low"
