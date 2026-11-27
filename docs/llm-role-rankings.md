llm-stats.com best-fit ranking per omp model role — 456 models, 2026-11-27
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
Throughput + price: OpenRouter per-provider routes under the default price-based routing (weight 1/price² over stable standard-tier providers; p50 tok/s of routed traffic; $/M 3:1 in:out), throughput 152/456, priced 151; models without OpenRouter throughput or a billed route are not ranked.

## @default — Main workhorse: strong general coding-agent quality, sane cost
eligible: 144 — λ 0.00556 $/quality-point (thinking ×1.857)

|  # | value |     q | model                      | org         |   $/M | tok/s |  ctx | gen 54.7% | code 18.9% | ag 12.6% | tool 10.5% | tput 3.2% |
| -: | ----: | ----: | -------------------------- | ----------- | ----: | ----: | ---: | --------: | ---------: | -------: | ---------: | --------: |
|  1 | 0.820 | 0.884 | ★ Gemini 4 Neon            | Google      | $11.6 |    67 | 1.0M |     0.537 |      0.151 |    0.103 |      0.076 |     0.018 |
|  2 | 0.816 | 0.859 | ★ Gemini 4 Carbon          | Google      | $7.76 |    46 | 1.0M |     0.523 |      0.153 |    0.100 |      0.070 |     0.014 |
|  3 | 0.804 | 0.831 | ★ Kimi K3.1 Pro            | Moonshot AI | $4.83 |    90 | 1.0M |     0.506 |      0.143 |    0.094 |      0.066 |     0.020 |
|  4 | 0.796 | 0.798 | ★ DeepSeek-V4.1-Flash-1017 | DeepSeek    | $0.35 |   146 | 1.0M |     0.477 |      0.139 |    0.091 |      0.066 |     0.025 |
|  5 | 0.790 | 0.834 | GPT-6.2 Sol                | OpenAI      | $7.89 |    86 | 1.1M |     0.503 |      0.147 |    0.095 |      0.069 |     0.020 |
|  6 | 0.785 | 0.787 | DeepSeek-V4.1-Flash        | DeepSeek    | $0.48 |   152 | 1.0M |     0.467 |      0.138 |    0.089 |      0.068 |     0.025 |
|  7 | 0.777 | 0.798 | Muse Spark 1.3             | Meta        | $3.71 |   128 | 1.0M |     0.484 |      0.136 |    0.089 |      0.065 |     0.024 |
|  8 | 0.775 | 0.784 | GLM-5.3                    | Zhipu AI    | $1.63 |    95 | 1.0M |     0.474 |      0.137 |    0.087 |      0.066 |     0.021 |
|  9 | 0.772 | 0.814 | Gemini 4 Argon             | Google      | $7.65 |    34 | 1.0M |     0.497 |      0.144 |    0.094 |      0.068 |     0.011 |
| 10 | 0.765 | 0.767 | MiniMax M3.1 Flash         | MiniMax     | $0.38 |   145 | 1.0M |     0.460 |      0.134 |    0.086 |      0.062 |     0.025 |

## @smol — Fast lightweight model: cheap and quick, still competent
eligible: 144 — λ 0.04091 $/quality-point

|  # | value |     q | model                      | org                   |   $/M | tok/s |  ctx | tput 40% | gen 28.6% | code 17.1% | tool 14.3% |
| -: | ----: | ----: | -------------------------- | --------------------- | ----: | ----: | ---: | -------: | --------: | ---------: | ---------: |
|  1 | 0.773 | 0.781 | ★ DeepSeek-V4.1-Flash-1017 | DeepSeek              | $0.19 |   146 | 1.0M |    0.316 |     0.249 |      0.125 |      0.090 |
|  2 | 0.771 | 0.781 | ★ DeepSeek-V4.1-Flash      | DeepSeek              | $0.26 |   152 | 1.0M |    0.320 |     0.244 |      0.125 |      0.092 |
|  3 | 0.759 | 0.780 | Beam 1.0                   | Reflection AI         | $0.51 |   216 | 1.0M |    0.361 |     0.225 |      0.113 |      0.081 |
|  4 | 0.757 | 0.772 | Inkling 2 Small            | Thinking Machines Lab | $0.35 |   160 | 256k |    0.326 |     0.239 |      0.120 |      0.086 |
|  5 | 0.752 | 0.761 | MiniMax M3.1 Flash         | MiniMax               | $0.20 |   145 | 1.0M |    0.315 |     0.240 |      0.121 |      0.085 |
|  6 | 0.740 | 0.822 | ★ Muse Spark 1.1           | Meta                  | $2.00 |   258 | 1.0M |    0.382 |     0.241 |      0.110 |      0.089 |
|  7 | 0.697 | 0.702 | ★ GLM-5.3-Flash            | Zhipu AI              | $0.13 |    97 | 1.0M |    0.267 |     0.241 |      0.107 |      0.086 |
|  8 | 0.695 | 0.777 | Muse Spark Open            | Meta                  | $2.00 |   201 | 1.0M |    0.353 |     0.231 |      0.113 |      0.081 |
|  9 | 0.689 | 0.725 | GLM-5.3                    | Zhipu AI              | $0.88 |    95 | 1.0M |    0.265 |     0.247 |      0.124 |      0.089 |
| 10 | 0.687 | 0.723 | MiniMax M2.7               | MiniMax               | $0.90 |   221 | 205k |    0.364 |     0.197 |      0.100 |      0.063 |

## @slow — Most capable model for hard problems; cost and speed as tiebreakers
eligible: 144 — λ 0.00263 $/quality-point (thinking ×2.714)

|  # | value |     q | model                      | org                       |   $/M | tok/s |  ctx | gen 63.2% | code 18.9% | ag 13.7% | tput 4.2% |
| -: | ----: | ----: | -------------------------- | ------------------------- | ----: | ----: | ---: | --------: | ---------: | -------: | --------: |
|  1 | 0.861 | 0.906 | ★ Gemini 4 Neon            | Google                    |   $17 |    67 | 1.0M |     0.620 |      0.151 |    0.112 |     0.024 |
|  2 | 0.853 | 0.883 | ★ Gemini 4 Carbon          | Google                    | $11.3 |    46 | 1.0M |     0.603 |      0.153 |    0.108 |     0.019 |
|  3 | 0.838 | 0.857 | ★ Kimi K3.1 Pro            | Moonshot AI               | $7.05 |    90 | 1.0M |     0.584 |      0.143 |    0.102 |     0.027 |
|  4 | 0.826 | 0.857 | GPT-6.2 Sol                | OpenAI                    | $11.5 |    86 | 1.1M |     0.581 |      0.147 |    0.103 |     0.027 |
|  5 | 0.820 | 0.821 | ★ DeepSeek-V4.1-Flash-1017 | DeepSeek                  | $0.51 |   146 | 1.0M |     0.551 |      0.139 |    0.098 |     0.033 |
|  6 | 0.808 | 0.822 | ★ Muse Spark 1.3           | Meta                      | $5.43 |   128 | 1.0M |     0.559 |      0.136 |    0.096 |     0.032 |
|  7 | 0.806 | 0.808 | DeepSeek-V4.1-Flash        | DeepSeek                  | $0.71 |   152 | 1.0M |     0.539 |      0.138 |    0.096 |     0.034 |
|  8 | 0.805 | 0.835 | Gemini 4 Argon             | Google                    | $11.2 |    34 | 1.0M |     0.574 |      0.144 |    0.101 |     0.015 |
|  9 | 0.800 | 0.806 | GLM-5.3                    | Zhipu AI                  | $2.39 |    95 | 1.0M |     0.547 |      0.137 |    0.094 |     0.028 |
| 10 | 0.793 | 0.809 | Qwen4-Max                  | Alibaba Cloud / Qwen Team | $5.95 |    75 | 984k |     0.551 |      0.134 |    0.098 |     0.025 |

## @vision — Image understanding: vision index dominates
eligible: 83 — λ 0.00682 $/quality-point (thinking ×1.857)

|  # | value |     q | model                      | org                       |   $/M | tok/s |  ctx | vis 54.2% | gen 20.8% | rea 15.6% | code 6.3% | tput 3.1% |
| -: | ----: | ----: | -------------------------- | ------------------------- | ----: | ----: | ---: | --------: | --------: | --------: | --------: | --------: |
|  1 | 0.768 | 0.801 | ★ Kimi K3.1 Pro            | Moonshot AI               | $4.83 |    90 | 1.0M |     0.399 |     0.193 |     0.142 |     0.047 |     0.020 |
|  2 | 0.732 | 0.734 | ★ DeepSeek-V4.1-Flash-1017 | DeepSeek                  | $0.35 |   146 | 1.0M |     0.351 |     0.182 |     0.131 |     0.046 |     0.025 |
|  3 | 0.726 | 0.806 | ★ Gemini 4 Neon            | Google                    | $11.6 |    67 | 1.0M |     0.384 |     0.204 |     0.150 |     0.050 |     0.018 |
|  4 | 0.724 | 0.749 | ★ Muse Spark 1.1           | Meta                      | $3.71 |   258 | 1.0M |     0.370 |     0.176 |     0.134 |     0.040 |     0.030 |
|  5 | 0.720 | 0.723 | Qwen3.8 Flash              | Alibaba Cloud / Qwen Team | $0.43 |    48 | 1.0M |     0.362 |     0.174 |     0.132 |     0.041 |     0.014 |
|  6 | 0.717 | 0.720 | DeepSeek-V4.1-Flash        | DeepSeek                  | $0.48 |   152 | 1.0M |     0.342 |     0.178 |     0.130 |     0.046 |     0.025 |
|  7 | 0.713 | 0.715 | ★ GLM-5.3-Flash            | Zhipu AI                  | $0.24 |    97 | 1.0M |     0.348 |     0.176 |     0.131 |     0.039 |     0.021 |
|  8 | 0.709 | 0.753 | Kimi K3                    | Moonshot AI               | $6.56 |    74 | 1.0M |     0.371 |     0.182 |     0.136 |     0.046 |     0.018 |
|  9 | 0.708 | 0.761 | Gemini 4 Carbon            | Google                    | $7.76 |    46 | 1.0M |     0.354 |     0.199 |     0.143 |     0.050 |     0.014 |
| 10 | 0.706 | 0.758 | Gemini 4 Argon             | Google                    | $7.65 |    34 | 1.0M |     0.373 |     0.189 |     0.137 |     0.048 |     0.011 |

## @plan — Planning: reasoning and long-context coherence, priced so the cheapest capable planner wins
eligible: 144 — λ 0.01667 $/quality-point (thinking ×1.857)

|  # | value |     q | model                      | org                       |   $/M | tok/s |  ctx | gen 80% | lc 15.6% | tput 4.4% |
| -: | ----: | ----: | -------------------------- | ------------------------- | ----: | ----: | ---: | ------: | -------: | --------: |
|  1 | 0.779 | 0.841 | ★ Muse Spark 1.3           | Meta                      | $3.71 |   128 | 1.0M |   0.707 |    0.100 |     0.033 |
|  2 | 0.759 | 0.766 | ★ Qwen3.8 Flash            | Alibaba Cloud / Qwen Team | $0.43 |    48 | 1.0M |   0.670 |    0.076 |     0.020 |
|  3 | 0.757 | 0.763 | ★ DeepSeek-V4.1-Flash-1017 | DeepSeek                  | $0.35 |   146 | 1.0M |   0.698 |    0.030 |     0.035 |
|  4 | 0.752 | 0.768 | ★ Beam 1.0                 | Reflection AI             | $0.95 |   216 | 1.0M |   0.631 |    0.096 |     0.040 |
|  5 | 0.746 | 0.876 | ★ Gemini 4 Carbon          | Google                    | $7.76 |    46 | 1.0M |   0.764 |    0.092 |     0.020 |
|  6 | 0.742 | 0.790 | ★ Gemini 3.8 Flash         | Google                    | $2.87 |    89 | 1.0M |   0.676 |    0.086 |     0.029 |
|  7 | 0.741 | 0.749 | DeepSeek-V4.1-Flash        | DeepSeek                  | $0.48 |   152 | 1.0M |   0.683 |    0.030 |     0.036 |
|  8 | 0.735 | 0.782 | Gemini 3.7 Flash           | Google                    | $2.87 |    82 | 1.0M |   0.659 |    0.096 |     0.027 |
|  9 | 0.732 | 0.736 | ★ GLM-5.3-Flash            | Zhipu AI                  | $0.24 |    97 | 1.0M |   0.676 |    0.030 |     0.030 |
| 10 | 0.732 | 0.738 | MiniMax M3.1 Flash         | MiniMax                   | $0.38 |   145 | 1.0M |   0.673 |    0.030 |     0.035 |

## @commit — Commit messages: cheap and fast with decent general quality
eligible: 144 — λ 0.04091 $/quality-point

|  # | value |     q | model                      | org                   |   $/M | tok/s |  ctx | tput 41.5% | gen 43.1% | code 15.4% |
| -: | ----: | ----: | -------------------------- | --------------------- | ----: | ----: | ---: | ---------: | --------: | ---------: |
|  1 | 0.808 | 0.816 | ★ DeepSeek-V4.1-Flash-1017 | DeepSeek              | $0.19 |   146 | 1.0M |      0.328 |     0.376 |      0.113 |
|  2 | 0.802 | 0.813 | DeepSeek-V4.1-Flash        | DeepSeek              | $0.26 |   152 | 1.0M |      0.333 |     0.368 |      0.112 |
|  3 | 0.795 | 0.816 | Beam 1.0                   | Reflection AI         | $0.51 |   216 | 1.0M |      0.375 |     0.340 |      0.101 |
|  4 | 0.792 | 0.807 | Inkling 2 Small            | Thinking Machines Lab | $0.35 |   160 | 256k |      0.339 |     0.360 |      0.108 |
|  5 | 0.789 | 0.798 | MiniMax M3.1 Flash         | MiniMax               | $0.20 |   145 | 1.0M |      0.327 |     0.362 |      0.108 |
|  6 | 0.777 | 0.859 | ★ Muse Spark 1.1           | Meta                  | $2.00 |   258 | 1.0M |      0.397 |     0.363 |      0.099 |
|  7 | 0.734 | 0.815 | Muse Spark Open            | Meta                  | $2.00 |   201 | 1.0M |      0.366 |     0.348 |      0.101 |
|  8 | 0.733 | 0.738 | ★ GLM-5.3-Flash            | Zhipu AI              | $0.13 |    97 | 1.0M |      0.278 |     0.364 |      0.096 |
|  9 | 0.728 | 0.764 | MiniMax M2.7               | MiniMax               | $0.90 |   221 | 205k |      0.378 |     0.297 |      0.090 |
| 10 | 0.723 | 0.759 | GLM-5.3                    | Zhipu AI              | $0.88 |    95 | 1.0M |      0.275 |     0.373 |      0.111 |

## @tiny — Background tasks (titles, memory): cheapest and fastest wins
eligible: 144 — λ 0.03333 $/quality-point

|  # | value |     q | model                      | org                   |   $/M | tok/s |  ctx | tput 58.3% | gen 41.7% |
| -: | ----: | ----: | -------------------------- | --------------------- | ----: | ----: | ---: | ---------: | --------: |
|  1 | 0.842 | 0.909 | ★ Muse Spark 1.1           | Meta                  | $2.00 |   258 | 1.0M |      0.557 |     0.351 |
|  2 | 0.838 | 0.855 | ★ Beam 1.0                 | Reflection AI         | $0.51 |   216 | 1.0M |      0.527 |     0.329 |
|  3 | 0.818 | 0.824 | ★ DeepSeek-V4.1-Flash-1017 | DeepSeek              | $0.19 |   146 | 1.0M |      0.460 |     0.363 |
|  4 | 0.814 | 0.823 | DeepSeek-V4.1-Flash        | DeepSeek              | $0.26 |   152 | 1.0M |      0.467 |     0.356 |
|  5 | 0.812 | 0.824 | ★ Inkling 2 Small          | Thinking Machines Lab | $0.35 |   160 | 256k |      0.475 |     0.348 |
|  6 | 0.803 | 0.809 | MiniMax M3.1 Flash         | MiniMax               | $0.20 |   145 | 1.0M |      0.459 |     0.351 |
|  7 | 0.788 | 0.818 | MiniMax M2.7               | MiniMax               | $0.90 |   221 | 205k |      0.531 |     0.287 |
|  8 | 0.784 | 0.851 | Muse Spark Open            | Meta                  | $2.00 |   201 | 1.0M |      0.514 |     0.336 |
|  9 | 0.757 | 0.763 | ★ Particle-1               | Particle AI           | $0.18 |   179 | 1.0M |      0.495 |     0.269 |
| 10 | 0.749 | 0.771 | Inkling-Small              | Thinking Machines Lab | $0.64 |   157 | 524k |      0.472 |     0.298 |

## @task — Subagents: agentic + tool calling, moderate cost sensitivity
eligible: 144 — λ 0.00747 $/quality-point (thinking ×1.857)

|  # | value |     q | model                      | org                   |   $/M | tok/s |  ctx | ag 29.9% | tool 20.7% | code 18.4% | gen 25.3% | tput 5.7% |
| -: | ----: | ----: | -------------------------- | --------------------- | ----: | ----: | ---: | -------: | ---------: | ---------: | --------: | --------: |
|  1 | 0.743 | 0.746 | ★ DeepSeek-V4.1-Flash-1017 | DeepSeek              | $0.35 |   146 | 1.0M |    0.215 |      0.131 |      0.135 |     0.221 |     0.045 |
|  2 | 0.736 | 0.739 | DeepSeek-V4.1-Flash        | DeepSeek              | $0.48 |   152 | 1.0M |    0.210 |      0.133 |      0.134 |     0.216 |     0.046 |
|  3 | 0.732 | 0.819 | ★ Gemini 4 Neon            | Google                | $11.6 |    67 | 1.0M |    0.244 |      0.149 |      0.146 |     0.248 |     0.032 |
|  4 | 0.730 | 0.788 | ★ Gemini 4 Carbon          | Google                | $7.76 |    46 | 1.0M |    0.236 |      0.137 |      0.148 |     0.241 |     0.026 |
|  5 | 0.728 | 0.764 | ★ Kimi K3.1 Pro            | Moonshot AI           | $4.83 |    90 | 1.0M |    0.224 |      0.130 |      0.139 |     0.234 |     0.037 |
|  6 | 0.712 | 0.771 | GPT-6.2 Sol                | OpenAI                | $7.89 |    86 | 1.1M |    0.224 |      0.136 |      0.143 |     0.232 |     0.036 |
|  7 | 0.712 | 0.725 | GLM-5.3                    | Zhipu AI              | $1.63 |    95 | 1.0M |    0.206 |      0.129 |      0.133 |     0.219 |     0.038 |
|  8 | 0.711 | 0.714 | MiniMax M3.1 Flash         | MiniMax               | $0.38 |   145 | 1.0M |    0.203 |      0.123 |      0.130 |     0.213 |     0.045 |
|  9 | 0.709 | 0.737 | Muse Spark 1.3             | Meta                  | $3.71 |   128 | 1.0M |    0.210 |      0.128 |      0.132 |     0.224 |     0.043 |
| 10 | 0.705 | 0.710 | Inkling 2 Small            | Thinking Machines Lab | $0.66 |   160 | 256k |    0.197 |      0.125 |      0.129 |     0.211 |     0.047 |

## @advisor — Advisor/watchdog: deep reasoning over long context
eligible: 144 — λ 0.01250 $/quality-point (thinking ×1.857)

|  # | value |     q | model                      | org                       |   $/M | tok/s |  ctx | gen 74.3% | lc 12.6% | tput 13.1% |
| -: | ----: | ----: | -------------------------- | ------------------------- | ----: | ----: | ---: | --------: | -------: | ---------: |
|  1 | 0.790 | 0.837 | ★ Muse Spark 1.3           | Meta                      | $3.71 |   128 | 1.0M |     0.657 |    0.081 |      0.098 |
|  2 | 0.772 | 0.776 | ★ DeepSeek-V4.1-Flash-1017 | DeepSeek                  | $0.35 |   146 | 1.0M |     0.648 |    0.024 |      0.103 |
|  3 | 0.771 | 0.783 | ★ Beam 1.0                 | Reflection AI             | $0.95 |   216 | 1.0M |     0.587 |    0.078 |      0.118 |
|  4 | 0.758 | 0.764 | DeepSeek-V4.1-Flash        | DeepSeek                  | $0.48 |   152 | 1.0M |     0.635 |    0.024 |      0.105 |
|  5 | 0.748 | 0.753 | MiniMax M3.1 Flash         | MiniMax                   | $0.38 |   145 | 1.0M |     0.625 |    0.024 |      0.103 |
|  6 | 0.746 | 0.843 | ★ Gemini 4 Carbon          | Google                    | $7.76 |    46 | 1.0M |     0.710 |    0.074 |      0.059 |
|  7 | 0.746 | 0.782 | Gemini 3.8 Flash           | Google                    | $2.87 |    89 | 1.0M |     0.628 |    0.069 |      0.084 |
|  8 | 0.745 | 0.753 | Inkling 2 Small            | Thinking Machines Lab     | $0.66 |   160 | 256k |     0.622 |    0.024 |      0.107 |
|  9 | 0.738 | 0.744 | Qwen3.8 Flash              | Alibaba Cloud / Qwen Team | $0.43 |    48 | 1.0M |     0.622 |    0.061 |      0.060 |
| 10 | 0.737 | 0.740 | ★ GLM-5.3-Flash            | Zhipu AI                  | $0.24 |    97 | 1.0M |     0.628 |    0.024 |      0.088 |

## @designer — Design work: visual/UX judgement on image-capable models
eligible: 100 — λ 0.01024 $/quality-point (thinking ×1.857)

|  # | value |     q | model                      | org         |   $/M | tok/s |  ctx | gen 31.3% | code 7.2% | vis 21.7% | tput 18.1% | web 21.7% | agon |
| -: | ----: | ----: | -------------------------- | ----------- | ----: | ----: | ---: | --------: | --------: | --------: | ---------: | --------: | ---: |
|  1 | 0.787 | 0.790 | ★ DeepSeek-V4.1-Flash-1017 | DeepSeek    | $0.35 |   146 | 1.0M |     0.273 |     0.053 |     0.141 |      0.143 |     0.181 |    — |
|  2 | 0.769 | 0.818 | ★ Kimi K3.1 Pro            | Moonshot AI | $4.83 |    90 | 1.0M |     0.290 |     0.055 |     0.160 |      0.117 |     0.198 | 1295 |
|  3 | 0.766 | 0.804 | ★ Muse Spark 1.3           | Meta        | $3.71 |   128 | 1.0M |     0.277 |     0.052 |     0.127 |      0.135 |     0.213 | 1266 |
|  4 | 0.748 | 0.786 | Muse Spark 1.1             | Meta        | $3.71 |   258 | 1.0M |     0.264 |     0.046 |     0.148 |      0.173 |     0.155 |    — |
|  5 | 0.747 | 0.785 | Muse Spark Open            | Meta        | $3.71 |   201 | 1.0M |     0.253 |     0.048 |     0.138 |      0.159 |     0.187 |    — |
|  6 | 0.723 | 0.791 | Kimi K3                    | Moonshot AI | $6.56 |    74 | 1.0M |     0.274 |     0.053 |     0.149 |      0.107 |     0.208 | 1267 |
|  7 | 0.721 | 0.750 | Gemini 3.8 Flash           | Google      | $2.87 |    89 | 1.0M |     0.265 |     0.048 |     0.144 |      0.116 |     0.178 | 1206 |
|  8 | 0.710 | 0.713 | ★ GLM-5.3-Flash            | Zhipu AI    | $0.24 |    97 | 1.0M |     0.265 |     0.045 |     0.140 |      0.121 |     0.142 |    — |
|  9 | 0.708 | 0.737 | Gemini 3.7 Flash           | Google      | $2.87 |    82 | 1.0M |     0.258 |     0.045 |     0.140 |      0.112 |     0.182 | 1197 |
| 10 | 0.705 | 0.824 | ★ Gemini 4 Neon            | Google      | $11.6 |    67 | 1.0M |     0.307 |     0.058 |     0.154 |      0.101 |     0.204 |    — |
focus: website — coverage 141/456 (30.9%) ok; dispersion 0.993 ok; composition ok; freshness 0.0mo ok; trust unknown; modality unknown; maintenance unknown; provenance unknown; cross-source unknown

# Suggested settings.modelRoles (best-fit #1 per role, resolved via the omp catalog).
# Selectors are <provider>/<id> (openrouter unless a provider priority is set); the omp-llm-role plugin writes this block daily.
modelRoles:
  default: "openrouter/moonshotai/kimi-k3.1-pro:auto"
  smol: "openrouter/deepseek/deepseek-v4.1-flash-1017:off"
  slow: "openrouter/moonshotai/kimi-k3.1-pro:high"
  vision: "openrouter/moonshotai/kimi-k3.1-pro:auto"
  plan: "openrouter/deepseek/deepseek-v4.1-flash-1017:auto"
  commit: "openrouter/deepseek/deepseek-v4.1-flash-1017:off"
  tiny: "openrouter/reflection/beam-1.0-501b-a23b:off"
  task: "openrouter/deepseek/deepseek-v4.1-flash-1017:auto"
  advisor: "openrouter/deepseek/deepseek-v4.1-flash-1017:auto"
  designer: "openrouter/deepseek/deepseek-v4.1-flash-1017:auto"
