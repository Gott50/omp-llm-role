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
|  1 | 0.819 | 0.884 | ★ Gemini 4 Neon            | Google      | $11.6 |    64 | 1.0M |     0.537 |      0.151 |    0.103 |      0.076 |     0.017 |
|  2 | 0.814 | 0.858 | ★ Gemini 4 Carbon          | Google      | $7.89 |    42 | 1.0M |     0.523 |      0.153 |    0.100 |      0.070 |     0.013 |
|  3 | 0.804 | 0.831 | ★ Kimi K3.1 Pro            | Moonshot AI | $4.83 |    91 | 1.0M |     0.506 |      0.143 |    0.094 |      0.066 |     0.021 |
|  4 | 0.795 | 0.797 | ★ DeepSeek-V4.1-Flash-1017 | DeepSeek    | $0.34 |   128 | 1.0M |     0.477 |      0.139 |    0.091 |      0.066 |     0.024 |
|  5 | 0.789 | 0.833 | ★ GPT-6.2 Sol              | OpenAI      | $7.83 |    75 | 1.1M |     0.503 |      0.147 |    0.095 |      0.069 |     0.019 |
|  6 | 0.784 | 0.786 | DeepSeek-V4.1-Flash        | DeepSeek    | $0.41 |   137 | 1.0M |     0.467 |      0.138 |    0.089 |      0.068 |     0.024 |
|  7 | 0.777 | 0.798 | ★ Muse Spark 1.3           | Meta        | $3.71 |   136 | 1.0M |     0.484 |      0.136 |    0.089 |      0.065 |     0.024 |
|  8 | 0.775 | 0.784 | GLM-5.3                    | Zhipu AI    | $1.64 |    94 | 1.0M |     0.474 |      0.137 |    0.087 |      0.066 |     0.021 |
|  9 | 0.772 | 0.815 | Gemini 4 Argon             | Google      | $7.76 |    37 | 1.0M |     0.497 |      0.144 |    0.094 |      0.068 |     0.012 |
| 10 | 0.765 | 0.767 | MiniMax M3.1 Flash         | MiniMax     | $0.37 |   140 | 1.0M |     0.460 |      0.134 |    0.086 |      0.062 |     0.025 |

## @smol — Fast lightweight model: cheap and quick, still competent
eligible: 144 — λ 0.04091 $/quality-point

|  # | value |     q | model                      | org                   |   $/M | tok/s |  ctx | tput 40% | gen 28.6% | code 17.1% | tool 14.3% |
| -: | ----: | ----: | -------------------------- | --------------------- | ----: | ----: | ---: | -------: | --------: | ---------: | ---------: |
|  1 | 0.798 | 0.819 | ★ Beam 1.0                 | Reflection AI         | $0.51 |   334 | 1.0M |    0.400 |     0.225 |      0.113 |      0.081 |
|  2 | 0.762 | 0.777 | ★ Inkling 2 Small          | Thinking Machines Lab | $0.37 |   168 | 256k |    0.332 |     0.239 |      0.120 |      0.086 |
|  3 | 0.759 | 0.768 | ★ DeepSeek-V4.1-Flash      | DeepSeek              | $0.22 |   137 | 1.0M |    0.307 |     0.244 |      0.125 |      0.092 |
|  4 | 0.757 | 0.764 | ★ DeepSeek-V4.1-Flash-1017 | DeepSeek              | $0.18 |   128 | 1.0M |    0.299 |     0.249 |      0.125 |      0.090 |
|  5 | 0.748 | 0.756 | MiniMax M3.1 Flash         | MiniMax               | $0.20 |   140 | 1.0M |    0.310 |     0.240 |      0.121 |      0.085 |
|  6 | 0.718 | 0.800 | Muse Spark 1.1             | Meta                  | $2.00 |   215 | 1.0M |    0.361 |     0.241 |      0.110 |      0.089 |
|  7 | 0.708 | 0.734 | Inkling-Small              | Thinking Machines Lab | $0.64 |   213 | 524k |    0.359 |     0.205 |      0.102 |      0.068 |
|  8 | 0.701 | 0.707 | ★ GLM-5.3-Flash            | Zhipu AI              | $0.13 |   101 | 1.0M |    0.271 |     0.241 |      0.107 |      0.086 |
|  9 | 0.689 | 0.771 | Muse Spark 1.3             | Meta                  | $2.00 |   136 | 1.0M |    0.307 |     0.253 |      0.123 |      0.089 |
| 10 | 0.688 | 0.724 | GLM-5.3                    | Zhipu AI              | $0.88 |    94 | 1.0M |    0.264 |     0.247 |      0.124 |      0.089 |

## @slow — Most capable model for hard problems; cost and speed as tiebreakers
eligible: 144 — λ 0.00263 $/quality-point (thinking ×2.714)

|  # | value |     q | model                      | org                       |   $/M | tok/s |  ctx | gen 63.2% | code 18.9% | ag 13.7% | tput 4.2% |
| -: | ----: | ----: | -------------------------- | ------------------------- | ----: | ----: | ---: | --------: | ---------: | -------: | --------: |
|  1 | 0.860 | 0.905 | ★ Gemini 4 Neon            | Google                    |   $17 |    64 | 1.0M |     0.620 |      0.151 |    0.112 |     0.023 |
|  2 | 0.851 | 0.882 | ★ Gemini 4 Carbon          | Google                    | $11.5 |    42 | 1.0M |     0.603 |      0.153 |    0.108 |     0.018 |
|  3 | 0.838 | 0.857 | ★ Kimi K3.1 Pro            | Moonshot AI               | $7.06 |    91 | 1.0M |     0.584 |      0.143 |    0.102 |     0.027 |
|  4 | 0.825 | 0.855 | GPT-6.2 Sol                | OpenAI                    | $11.4 |    75 | 1.1M |     0.581 |      0.147 |    0.103 |     0.025 |
|  5 | 0.818 | 0.819 | ★ DeepSeek-V4.1-Flash-1017 | DeepSeek                  | $0.50 |   128 | 1.0M |     0.551 |      0.139 |    0.098 |     0.032 |
|  6 | 0.808 | 0.823 | ★ Muse Spark 1.3           | Meta                      | $5.43 |   136 | 1.0M |     0.559 |      0.136 |    0.096 |     0.032 |
|  7 | 0.806 | 0.836 | Gemini 4 Argon             | Google                    | $11.3 |    37 | 1.0M |     0.574 |      0.144 |    0.101 |     0.016 |
|  8 | 0.805 | 0.806 | DeepSeek-V4.1-Flash        | DeepSeek                  | $0.60 |   137 | 1.0M |     0.539 |      0.138 |    0.096 |     0.032 |
|  9 | 0.799 | 0.806 | GLM-5.3                    | Zhipu AI                  | $2.39 |    94 | 1.0M |     0.547 |      0.137 |    0.094 |     0.028 |
| 10 | 0.792 | 0.808 | Qwen4-Max                  | Alibaba Cloud / Qwen Team | $5.95 |    69 | 984k |     0.551 |      0.134 |    0.098 |     0.024 |

## @vision — Image understanding: vision index dominates
eligible: 83 — λ 0.00682 $/quality-point (thinking ×1.857)

|  # | value |     q | model                      | org                       |   $/M | tok/s |  ctx | vis 54.2% | gen 20.8% | rea 15.6% | code 6.3% | tput 3.1% |
| -: | ----: | ----: | -------------------------- | ------------------------- | ----: | ----: | ---: | --------: | --------: | --------: | --------: | --------: |
|  1 | 0.769 | 0.801 | ★ Kimi K3.1 Pro            | Moonshot AI               | $4.83 |    91 | 1.0M |     0.399 |     0.193 |     0.142 |     0.047 |     0.020 |
|  2 | 0.731 | 0.733 | ★ DeepSeek-V4.1-Flash-1017 | DeepSeek                  | $0.34 |   128 | 1.0M |     0.351 |     0.182 |     0.131 |     0.046 |     0.023 |
|  3 | 0.726 | 0.805 | ★ Gemini 4 Neon            | Google                    | $11.6 |    64 | 1.0M |     0.384 |     0.204 |     0.150 |     0.050 |     0.017 |
|  4 | 0.722 | 0.747 | ★ Muse Spark 1.1           | Meta                      | $3.71 |   215 | 1.0M |     0.370 |     0.176 |     0.134 |     0.040 |     0.028 |
|  5 | 0.721 | 0.724 | Qwen3.8 Flash              | Alibaba Cloud / Qwen Team | $0.43 |    52 | 1.0M |     0.362 |     0.174 |     0.132 |     0.041 |     0.015 |
|  6 | 0.716 | 0.719 | DeepSeek-V4.1-Flash        | DeepSeek                  | $0.41 |   137 | 1.0M |     0.342 |     0.178 |     0.130 |     0.046 |     0.024 |
|  7 | 0.714 | 0.715 | ★ GLM-5.3-Flash            | Zhipu AI                  | $0.23 |   101 | 1.0M |     0.348 |     0.176 |     0.131 |     0.039 |     0.021 |
|  8 | 0.710 | 0.755 | Kimi K3                    | Moonshot AI               | $6.56 |    89 | 1.0M |     0.371 |     0.182 |     0.136 |     0.046 |     0.020 |
|  9 | 0.706 | 0.760 | Gemini 4 Carbon            | Google                    | $7.89 |    42 | 1.0M |     0.354 |     0.199 |     0.143 |     0.050 |     0.013 |
| 10 | 0.706 | 0.759 | Gemini 4 Argon             | Google                    | $7.76 |    37 | 1.0M |     0.373 |     0.189 |     0.137 |     0.048 |     0.012 |

## @plan — Planning: reasoning and long-context coherence, priced so the cheapest capable planner wins
eligible: 144 — λ 0.01667 $/quality-point (thinking ×1.857)

|  # | value |     q | model                      | org                       |   $/M | tok/s |  ctx | gen 80% | lc 15.6% | tput 4.4% |
| -: | ----: | ----: | -------------------------- | ------------------------- | ----: | ----: | ---: | ------: | -------: | --------: |
|  1 | 0.780 | 0.842 | ★ Muse Spark 1.3           | Meta                      | $3.71 |   136 | 1.0M |   0.707 |    0.100 |     0.034 |
|  2 | 0.760 | 0.767 | ★ Qwen3.8 Flash            | Alibaba Cloud / Qwen Team | $0.43 |    52 | 1.0M |   0.670 |    0.076 |     0.022 |
|  3 | 0.756 | 0.772 | ★ Beam 1.0                 | Reflection AI             | $0.95 |   334 | 1.0M |   0.631 |    0.096 |     0.044 |
|  4 | 0.756 | 0.761 | ★ DeepSeek-V4.1-Flash-1017 | DeepSeek                  | $0.34 |   128 | 1.0M |   0.698 |    0.030 |     0.033 |
|  5 | 0.743 | 0.874 | ★ Gemini 4 Carbon          | Google                    | $7.89 |    42 | 1.0M |   0.764 |    0.092 |     0.019 |
|  6 | 0.741 | 0.789 | ★ Gemini 3.8 Flash         | Google                    | $2.87 |    80 | 1.0M |   0.676 |    0.086 |     0.027 |
|  7 | 0.741 | 0.748 | DeepSeek-V4.1-Flash        | DeepSeek                  | $0.41 |   137 | 1.0M |   0.683 |    0.030 |     0.034 |
|  8 | 0.734 | 0.782 | Gemini 3.7 Flash           | Google                    | $2.87 |    78 | 1.0M |   0.659 |    0.096 |     0.027 |
|  9 | 0.733 | 0.736 | ★ GLM-5.3-Flash            | Zhipu AI                  | $0.23 |   101 | 1.0M |   0.676 |    0.030 |     0.030 |
| 10 | 0.732 | 0.738 | MiniMax M3.1 Flash         | MiniMax                   | $0.37 |   140 | 1.0M |   0.673 |    0.030 |     0.034 |

## @commit — Commit messages: cheap and fast with decent general quality
eligible: 144 — λ 0.04091 $/quality-point

|  # | value |     q | model                      | org                   |   $/M | tok/s |  ctx | tput 41.5% | gen 43.1% | code 15.4% |
| -: | ----: | ----: | -------------------------- | --------------------- | ----: | ----: | ---: | ---------: | --------: | ---------: |
|  1 | 0.835 | 0.856 | ★ Beam 1.0                 | Reflection AI         | $0.51 |   334 | 1.0M |      0.415 |     0.340 |      0.101 |
|  2 | 0.798 | 0.813 | ★ Inkling 2 Small          | Thinking Machines Lab | $0.37 |   168 | 256k |      0.344 |     0.360 |      0.108 |
|  3 | 0.792 | 0.799 | ★ DeepSeek-V4.1-Flash-1017 | DeepSeek              | $0.18 |   128 | 1.0M |      0.311 |     0.376 |      0.113 |
|  4 | 0.790 | 0.799 | ★ DeepSeek-V4.1-Flash      | DeepSeek              | $0.22 |   137 | 1.0M |      0.319 |     0.368 |      0.112 |
|  5 | 0.785 | 0.793 | MiniMax M3.1 Flash         | MiniMax               | $0.20 |   140 | 1.0M |      0.322 |     0.362 |      0.108 |
|  6 | 0.755 | 0.837 | Muse Spark 1.1             | Meta                  | $2.00 |   215 | 1.0M |      0.375 |     0.363 |      0.099 |
|  7 | 0.747 | 0.773 | Inkling-Small              | Thinking Machines Lab | $0.64 |   213 | 524k |      0.373 |     0.308 |      0.092 |
|  8 | 0.737 | 0.742 | ★ GLM-5.3-Flash            | Zhipu AI              | $0.13 |   101 | 1.0M |      0.282 |     0.364 |      0.096 |
|  9 | 0.728 | 0.765 | MiniMax M2.7               | MiniMax               | $0.90 |   221 | 205k |      0.378 |     0.297 |      0.090 |
| 10 | 0.728 | 0.810 | Muse Spark 1.3             | Meta                  | $2.00 |   136 | 1.0M |      0.318 |     0.381 |      0.110 |

## @tiny — Background tasks (titles, memory): cheapest and fastest wins
eligible: 144 — λ 0.03333 $/quality-point

|  # | value |     q | model                      | org                   |   $/M | tok/s |  ctx | tput 58.3% | gen 41.7% |
| -: | ----: | ----: | -------------------------- | --------------------- | ----: | ----: | ---: | ---------: | --------: |
|  1 | 0.895 | 0.912 | ★ Beam 1.0                 | Reflection AI         | $0.51 |   334 | 1.0M |      0.583 |     0.329 |
|  2 | 0.820 | 0.832 | ★ Inkling 2 Small          | Thinking Machines Lab | $0.37 |   168 | 256k |      0.483 |     0.348 |
|  3 | 0.811 | 0.878 | Muse Spark 1.1             | Meta                  | $2.00 |   215 | 1.0M |      0.526 |     0.351 |
|  4 | 0.801 | 0.823 | Inkling-Small              | Thinking Machines Lab | $0.64 |   213 | 524k |      0.524 |     0.298 |
|  5 | 0.797 | 0.804 | ★ DeepSeek-V4.1-Flash      | DeepSeek              | $0.22 |   137 | 1.0M |      0.448 |     0.356 |
|  6 | 0.796 | 0.803 | ★ MiniMax M3.1 Flash       | MiniMax               | $0.20 |   140 | 1.0M |      0.452 |     0.351 |
|  7 | 0.794 | 0.800 | ★ DeepSeek-V4.1-Flash-1017 | DeepSeek              | $0.18 |   128 | 1.0M |      0.437 |     0.363 |
|  8 | 0.788 | 0.818 | MiniMax M2.7               | MiniMax               | $0.90 |   221 | 205k |      0.531 |     0.287 |
|  9 | 0.749 | 0.816 | Muse Spark 1.3             | Meta                  | $2.00 |   136 | 1.0M |      0.447 |     0.368 |
| 10 | 0.744 | 0.748 | ★ GLM-5.3-Flash            | Zhipu AI              | $0.13 |   101 | 1.0M |      0.396 |     0.352 |

## @task — Subagents: agentic + tool calling, moderate cost sensitivity
eligible: 144 — λ 0.00747 $/quality-point (thinking ×1.857)

|  # | value |     q | model                      | org                   |   $/M | tok/s |  ctx | ag 29.9% | tool 20.7% | code 18.4% | gen 25.3% | tput 5.7% |
| -: | ----: | ----: | -------------------------- | --------------------- | ----: | ----: | ---: | -------: | ---------: | ---------: | --------: | --------: |
|  1 | 0.741 | 0.743 | ★ DeepSeek-V4.1-Flash-1017 | DeepSeek              | $0.34 |   128 | 1.0M |    0.215 |      0.131 |      0.135 |     0.221 |     0.043 |
|  2 | 0.734 | 0.737 | DeepSeek-V4.1-Flash        | DeepSeek              | $0.41 |   137 | 1.0M |    0.210 |      0.133 |      0.134 |     0.216 |     0.044 |
|  3 | 0.731 | 0.818 | ★ Gemini 4 Neon            | Google                | $11.6 |    64 | 1.0M |    0.244 |      0.149 |      0.146 |     0.248 |     0.031 |
|  4 | 0.728 | 0.764 | ★ Kimi K3.1 Pro            | Moonshot AI           | $4.83 |    91 | 1.0M |    0.224 |      0.130 |      0.139 |     0.234 |     0.037 |
|  5 | 0.728 | 0.787 | ★ Gemini 4 Carbon          | Google                | $7.89 |    42 | 1.0M |    0.236 |      0.137 |      0.148 |     0.241 |     0.024 |
|  6 | 0.712 | 0.724 | GLM-5.3                    | Zhipu AI              | $1.64 |    94 | 1.0M |    0.206 |      0.129 |      0.133 |     0.219 |     0.038 |
|  7 | 0.711 | 0.769 | ★ GPT-6.2 Sol              | OpenAI                | $7.83 |    75 | 1.1M |    0.224 |      0.136 |      0.143 |     0.232 |     0.034 |
|  8 | 0.710 | 0.713 | MiniMax M3.1 Flash         | MiniMax               | $0.37 |   140 | 1.0M |    0.203 |      0.123 |      0.130 |     0.213 |     0.045 |
|  9 | 0.710 | 0.738 | Muse Spark 1.3             | Meta                  | $3.71 |   136 | 1.0M |    0.210 |      0.128 |      0.132 |     0.224 |     0.044 |
| 10 | 0.705 | 0.710 | Inkling 2 Small            | Thinking Machines Lab | $0.68 |   168 | 256k |    0.197 |      0.125 |      0.129 |     0.211 |     0.048 |

## @advisor — Advisor/watchdog: deep reasoning over long context
eligible: 144 — λ 0.01250 $/quality-point (thinking ×1.857)

|  # | value |     q | model                      | org                       |   $/M | tok/s |  ctx | gen 74.3% | lc 12.6% | tput 13.1% |
| -: | ----: | ----: | -------------------------- | ------------------------- | ----: | ----: | ---: | --------: | -------: | ---------: |
|  1 | 0.792 | 0.839 | ★ Muse Spark 1.3           | Meta                      | $3.71 |   136 | 1.0M |     0.657 |    0.081 |      0.100 |
|  2 | 0.784 | 0.796 | ★ Beam 1.0                 | Reflection AI             | $0.95 |   334 | 1.0M |     0.587 |    0.078 |      0.131 |
|  3 | 0.767 | 0.771 | ★ DeepSeek-V4.1-Flash-1017 | DeepSeek                  | $0.34 |   128 | 1.0M |     0.648 |    0.024 |      0.098 |
|  4 | 0.755 | 0.760 | DeepSeek-V4.1-Flash        | DeepSeek                  | $0.41 |   137 | 1.0M |     0.635 |    0.024 |      0.101 |
|  5 | 0.747 | 0.752 | MiniMax M3.1 Flash         | MiniMax                   | $0.37 |   140 | 1.0M |     0.625 |    0.024 |      0.102 |
|  6 | 0.746 | 0.755 | Inkling 2 Small            | Thinking Machines Lab     | $0.68 |   168 | 256k |     0.622 |    0.024 |      0.109 |
|  7 | 0.742 | 0.778 | Gemini 3.8 Flash           | Google                    | $2.87 |    80 | 1.0M |     0.628 |    0.069 |      0.080 |
|  8 | 0.742 | 0.747 | Qwen3.8 Flash              | Alibaba Cloud / Qwen Team | $0.43 |    52 | 1.0M |     0.622 |    0.061 |      0.064 |
|  9 | 0.741 | 0.839 | ★ Gemini 4 Carbon          | Google                    | $7.89 |    42 | 1.0M |     0.710 |    0.074 |      0.056 |
| 10 | 0.739 | 0.742 | ★ GLM-5.3-Flash            | Zhipu AI                  | $0.23 |   101 | 1.0M |     0.628 |    0.024 |      0.089 |

## @designer — Design work: visual/UX judgement on image-capable models
eligible: 100 — λ 0.01024 $/quality-point (thinking ×1.857)

|  # | value |     q | model                      | org         |   $/M | tok/s |  ctx | gen 31.3% | code 7.2% | vis 21.7% | tput 18.1% | web 21.7% | agon |
| -: | ----: | ----: | -------------------------- | ----------- | ----: | ----: | ---: | --------: | --------: | --------: | ---------: | --------: | ---: |
|  1 | 0.779 | 0.783 | ★ DeepSeek-V4.1-Flash-1017 | DeepSeek    | $0.34 |   128 | 1.0M |     0.273 |     0.053 |     0.141 |      0.135 |     0.181 |    — |
|  2 | 0.770 | 0.819 | ★ Kimi K3.1 Pro            | Moonshot AI | $4.83 |    91 | 1.0M |     0.290 |     0.055 |     0.160 |      0.117 |     0.198 | 1296 |
|  3 | 0.767 | 0.805 | ★ Muse Spark 1.3           | Meta        | $3.71 |   136 | 1.0M |     0.277 |     0.052 |     0.127 |      0.138 |     0.211 | 1266 |
|  4 | 0.738 | 0.776 | Muse Spark 1.1             | Meta        | $3.71 |   215 | 1.0M |     0.264 |     0.046 |     0.148 |      0.163 |     0.155 |    — |
|  5 | 0.733 | 0.800 | Kimi K3                    | Moonshot AI | $6.56 |    89 | 1.0M |     0.274 |     0.053 |     0.149 |      0.116 |     0.208 | 1267 |
|  6 | 0.730 | 0.768 | Muse Spark Open            | Meta        | $3.71 |   140 | 1.0M |     0.253 |     0.048 |     0.138 |      0.140 |     0.188 |    — |
|  7 | 0.715 | 0.745 | Gemini 3.8 Flash           | Google      | $2.87 |    80 | 1.0M |     0.265 |     0.048 |     0.144 |      0.111 |     0.178 | 1206 |
|  8 | 0.712 | 0.714 | ★ GLM-5.3-Flash            | Zhipu AI    | $0.23 |   101 | 1.0M |     0.265 |     0.045 |     0.140 |      0.123 |     0.142 |    — |
|  9 | 0.705 | 0.734 | Gemini 3.7 Flash           | Google      | $2.87 |    78 | 1.0M |     0.258 |     0.045 |     0.140 |      0.109 |     0.182 | 1197 |
| 10 | 0.702 | 0.713 | MiMo-V2.6-Pro              | Xiaomi      | $1.01 |    41 | 1.0M |     0.265 |     0.051 |     0.129 |      0.075 |     0.193 |    — |
focus: website — coverage 141/456 (30.9%) ok; dispersion 0.993 ok; composition ok; freshness 0.0mo ok; trust unknown; modality unknown; maintenance unknown; provenance unknown; cross-source unknown

# Suggested settings.modelRoles (best-fit #1 per role, resolved via the omp catalog).
# Selectors are <provider>/<id> (openrouter unless a provider priority is set); the omp-llm-role plugin writes this block daily.
modelRoles:
  default: "openrouter/moonshotai/kimi-k3.1-pro:auto"
  smol: "openrouter/reflection/beam-1.0-501b-a23b:off"
  slow: "openrouter/moonshotai/kimi-k3.1-pro:high"
  vision: "openrouter/moonshotai/kimi-k3.1-pro:auto"
  plan: "openrouter/reflection/beam-1.0-501b-a23b:auto"
  commit: "openrouter/reflection/beam-1.0-501b-a23b:off"
  tiny: "openrouter/reflection/beam-1.0-501b-a23b:off"
  task: "openrouter/deepseek/deepseek-v4.1-flash-1017:auto"
  advisor: "openrouter/reflection/beam-1.0-501b-a23b:auto"
  designer: "openrouter/deepseek/deepseek-v4.1-flash-1017:auto"
