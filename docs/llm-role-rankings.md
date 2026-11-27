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
eligible: 60 — λ 0.00556 $/quality-point (thinking ×1.857)

|  # | value |     q | model                      | org                       |   $/M | tok/s |  ctx | gen 54.7% | code 18.9% | ag 12.6% | tool 10.5% | tput 3.2% |
| -: | ----: | ----: | -------------------------- | ------------------------- | ----: | ----: | ---: | --------: | ---------: | -------: | ---------: | --------: |
|  1 | 0.797 | 0.798 | ★ DeepSeek-V4.1-Flash-1017 | DeepSeek                  | $0.15 |   122 | 1.0M |     0.477 |      0.139 |    0.091 |      0.066 |     0.024 |
|  2 | 0.790 | 0.792 | DeepSeek-V4.1-Flash        | DeepSeek                  | $0.29 |   144 | 1.0M |     0.467 |      0.138 |    0.089 |      0.068 |     0.030 |
|  3 | 0.769 | 0.770 | MiniMax M3.1 Flash         | MiniMax                   | $0.16 |   150 | 1.0M |     0.460 |      0.134 |    0.086 |      0.062 |     0.028 |
|  4 | 0.762 | 0.765 | MiMo-V2.6-Pro              | Xiaomi                    | $0.42 |    41 | 1.0M |     0.462 |      0.135 |    0.087 |      0.066 |     0.014 |
|  5 | 0.758 | 0.760 | Inkling 2 Small            | Thinking Machines Lab     | $0.29 |   161 | 256k |     0.458 |      0.133 |    0.083 |      0.064 |     0.022 |
|  6 | 0.750 | 0.750 | ★ GLM-5.3-Flash            | Zhipu AI                  | $0.08 |    97 | 1.0M |     0.462 |      0.119 |    0.083 |      0.064 |     0.022 |
|  7 | 0.744 | 0.745 | Qwen3.8 Flash              | Alibaba Cloud / Qwen Team | $0.26 |    50 | 1.0M |     0.458 |      0.123 |    0.081 |      0.065 |     0.019 |
|  8 | 0.720 | 0.721 | MiMo-V2.6-Flash            | Xiaomi                    | $0.15 |    48 | 1.0M |     0.435 |      0.123 |    0.080 |      0.061 |     0.021 |
|  9 | 0.718 | 0.722 | Beam 1.0                   | Reflection AI             | $0.56 |   309 | 1.0M |     0.432 |      0.124 |    0.074 |      0.060 |     0.032 |
| 10 | 0.705 | 0.709 | GPT-5.6 Luna               | OpenAI                    | $0.61 |    91 | 1.1M |     0.430 |      0.123 |    0.076 |      0.056 |     0.024 |

## @smol — Fast lightweight model: cheap and quick, still competent
eligible: 80 — λ 0.04091 $/quality-point

|  # | value |     q | model                      | org                   |   $/M | tok/s |  ctx | tput 40% | gen 28.6% | code 17.1% | tool 14.3% |
| -: | ----: | ----: | -------------------------- | --------------------- | ----: | ----: | ---: | -------: | --------: | ---------: | ---------: |
|  1 | 0.827 | 0.834 | ★ DeepSeek-V4.1-Flash      | DeepSeek              | $0.16 |   144 | 1.0M |    0.373 |     0.244 |      0.125 |      0.092 |
|  2 | 0.807 | 0.819 | Beam 1.0                   | Reflection AI         | $0.30 |   309 | 1.0M |    0.400 |     0.225 |      0.113 |      0.081 |
|  3 | 0.794 | 0.798 | ★ MiniMax M3.1 Flash       | MiniMax               | $0.09 |   150 | 1.0M |    0.352 |     0.240 |      0.121 |      0.085 |
|  4 | 0.770 | 0.774 | ★ DeepSeek-V4.1-Flash-1017 | DeepSeek              | $0.08 |   122 | 1.0M |    0.309 |     0.249 |      0.125 |      0.090 |
|  5 | 0.760 | 0.764 | DeepSeek-V4-Flash-0731     | DeepSeek              | $0.08 |   119 | 1.0M |    0.364 |     0.218 |      0.106 |      0.076 |
|  6 | 0.722 | 0.729 | Inkling 2 Small            | Thinking Machines Lab | $0.16 |   161 | 256k |    0.283 |     0.239 |      0.120 |      0.086 |
|  7 | 0.713 | 0.725 | MiniMax M3                 | MiniMax               | $0.29 |    90 | 1.0M |    0.335 |     0.215 |      0.106 |      0.070 |
|  8 | 0.712 | 0.714 | ★ GLM-5.3-Flash            | Zhipu AI              | $0.04 |    97 | 1.0M |    0.279 |     0.241 |      0.107 |      0.086 |
|  9 | 0.712 | 0.728 | GLM-5.3                    | Zhipu AI              | $0.40 |    95 | 1.0M |    0.268 |     0.247 |      0.124 |      0.089 |
| 10 | 0.707 | 0.723 | Inkling-Small              | Thinking Machines Lab | $0.40 |   194 | 524k |    0.349 |     0.205 |      0.102 |      0.068 |

## @slow — Most capable model for hard problems; cost and speed as tiebreakers
eligible: 55 — λ 0.00263 $/quality-point (thinking ×2.714)

|  # | value |     q | model                      | org                       |   $/M | tok/s |  ctx | gen 63.2% | code 18.9% | ag 13.7% | tput 4.2% |
| -: | ----: | ----: | -------------------------- | ------------------------- | ----: | ----: | ---: | --------: | ---------: | -------: | --------: |
|  1 | 0.820 | 0.820 | ★ DeepSeek-V4.1-Flash-1017 | DeepSeek                  | $0.22 |   122 | 1.0M |     0.551 |      0.139 |    0.098 |     0.032 |
|  2 | 0.812 | 0.813 | DeepSeek-V4.1-Flash        | DeepSeek                  | $0.43 |   144 | 1.0M |     0.539 |      0.138 |    0.096 |     0.039 |
|  3 | 0.795 | 0.795 | MiniMax M3.1 Flash         | MiniMax                   | $0.23 |   150 | 1.0M |     0.531 |      0.134 |    0.093 |     0.037 |
|  4 | 0.780 | 0.781 | Inkling 2 Small            | Thinking Machines Lab     | $0.42 |   161 | 256k |     0.528 |      0.133 |    0.090 |     0.030 |
|  5 | 0.780 | 0.781 | MiMo-V2.6-Pro              | Xiaomi                    | $0.62 |    41 | 1.0M |     0.534 |      0.135 |    0.094 |     0.019 |
|  6 | 0.772 | 0.772 | ★ GLM-5.3-Flash            | Zhipu AI                  | $0.12 |    97 | 1.0M |     0.534 |      0.119 |    0.090 |     0.029 |
|  7 | 0.763 | 0.764 | Qwen3.8 Flash              | Alibaba Cloud / Qwen Team | $0.38 |    50 | 1.0M |     0.529 |      0.123 |    0.088 |     0.025 |
|  8 | 0.743 | 0.745 | Beam 1.0                   | Reflection AI             | $0.81 |   309 | 1.0M |     0.498 |      0.124 |    0.080 |     0.042 |
|  9 | 0.739 | 0.740 | MiMo-V2.6-Flash            | Xiaomi                    | $0.23 |    48 | 1.0M |     0.502 |      0.123 |    0.087 |     0.028 |
| 10 | 0.734 | 0.735 | Qwen3.8-27B                | Alibaba Cloud / Qwen Team | $0.53 |    74 | 262k |     0.499 |      0.114 |    0.082 |     0.040 |

## @vision — Image understanding: vision index dominates
eligible: 34 — λ 0.00682 $/quality-point (thinking ×1.857)

|  # | value |     q | model                      | org                       |   $/M | tok/s |  ctx | vis 54.2% | gen 20.8% | rea 15.6% | code 6.3% | tput 3.1% |
| -: | ----: | ----: | -------------------------- | ------------------------- | ----: | ----: | ---: | --------: | --------: | --------: | --------: | --------: |
|  1 | 0.733 | 0.734 | ★ DeepSeek-V4.1-Flash-1017 | DeepSeek                  | $0.15 |   122 | 1.0M |     0.351 |     0.182 |     0.131 |     0.046 |     0.024 |
|  2 | 0.725 | 0.727 | Qwen3.8 Flash              | Alibaba Cloud / Qwen Team | $0.26 |    50 | 1.0M |     0.362 |     0.174 |     0.132 |     0.041 |     0.018 |
|  3 | 0.722 | 0.724 | DeepSeek-V4.1-Flash        | DeepSeek                  | $0.29 |   144 | 1.0M |     0.342 |     0.178 |     0.130 |     0.046 |     0.029 |
|  4 | 0.715 | 0.716 | ★ GLM-5.3-Flash            | Zhipu AI                  | $0.08 |    97 | 1.0M |     0.348 |     0.176 |     0.131 |     0.039 |     0.022 |
|  5 | 0.702 | 0.704 | Inkling 2 Small            | Thinking Machines Lab     | $0.29 |   161 | 256k |     0.332 |     0.174 |     0.132 |     0.044 |     0.022 |
|  6 | 0.700 | 0.701 | MiniMax M3.1 Flash         | MiniMax                   | $0.16 |   150 | 1.0M |     0.328 |     0.175 |     0.126 |     0.044 |     0.027 |
|  7 | 0.697 | 0.700 | Qwen3.8-27B                | Alibaba Cloud / Qwen Team | $0.56 |    74 | 262k |     0.356 |     0.165 |     0.123 |     0.038 |     0.019 |
|  8 | 0.681 | 0.686 | Qwen3.7-Plus               | Alibaba Cloud / Qwen Team | $0.72 |    50 |    — |     0.352 |     0.160 |     0.121 |     0.038 |     0.015 |
|  9 | 0.681 | 0.683 | MiMo-V2.6-Pro              | Xiaomi                    | $0.42 |    41 | 1.0M |     0.321 |     0.176 |     0.128 |     0.044 |     0.014 |
| 10 | 0.659 | 0.660 | MiMo-V2.6-Flash            | Xiaomi                    | $0.15 |    48 | 1.0M |     0.311 |     0.166 |     0.122 |     0.041 |     0.021 |

## @plan — Planning: reasoning and long-context coherence, priced so the cheapest capable planner wins
eligible: 60 — λ 0.01667 $/quality-point (thinking ×1.857)

|  # | value |     q | model                      | org                       |   $/M | tok/s |  ctx | gen 80% | lc 15.6% | tput 4.4% |
| -: | ----: | ----: | -------------------------- | ------------------------- | ----: | ----: | ---: | ------: | -------: | --------: |
|  1 | 0.767 | 0.771 | ★ Qwen3.8 Flash            | Alibaba Cloud / Qwen Team | $0.26 |    50 | 1.0M |   0.670 |    0.076 |     0.026 |
|  2 | 0.763 | 0.772 | ★ Beam 1.0                 | Reflection AI             | $0.56 |   309 | 1.0M |   0.631 |    0.096 |     0.044 |
|  3 | 0.760 | 0.762 | ★ DeepSeek-V4.1-Flash-1017 | DeepSeek                  | $0.15 |   122 | 1.0M |   0.698 |    0.030 |     0.034 |
|  4 | 0.742 | 0.746 | DeepSeek-V4.1-Flash        | DeepSeek                  | $0.22 |   144 | 1.0M |   0.683 |    0.030 |     0.032 |
|  5 | 0.740 | 0.742 | MiniMax M3.1 Flash         | MiniMax                   | $0.16 |   150 | 1.0M |   0.673 |    0.030 |     0.039 |
|  6 | 0.736 | 0.737 | ★ GLM-5.3-Flash            | Zhipu AI                  | $0.08 |    97 | 1.0M |   0.676 |    0.030 |     0.031 |
|  7 | 0.730 | 0.740 | GPT-5.6 Luna               | OpenAI                    | $0.61 |    91 | 1.1M |   0.629 |    0.078 |     0.033 |
|  8 | 0.726 | 0.731 | Inkling 2 Small            | Thinking Machines Lab     | $0.29 |   161 | 256k |   0.669 |    0.030 |     0.031 |
|  9 | 0.719 | 0.726 | MiMo-V2.6-Pro              | Xiaomi                    | $0.42 |    41 | 1.0M |   0.676 |    0.030 |     0.020 |
| 10 | 0.712 | 0.717 | Hy3                        | Tencent                   | $0.30 |    54 | 262k |   0.615 |    0.079 |     0.022 |

## @commit — Commit messages: cheap and fast with decent general quality
eligible: 80 — λ 0.04091 $/quality-point

|  # | value |     q | model                      | org                   |   $/M | tok/s |  ctx | tput 41.5% | gen 43.1% | code 15.4% |
| -: | ----: | ----: | -------------------------- | --------------------- | ----: | ----: | ---: | ---------: | --------: | ---------: |
|  1 | 0.861 | 0.867 | ★ DeepSeek-V4.1-Flash      | DeepSeek              | $0.16 |   144 | 1.0M |      0.387 |     0.368 |      0.112 |
|  2 | 0.844 | 0.856 | Beam 1.0                   | Reflection AI         | $0.30 |   309 | 1.0M |      0.415 |     0.340 |      0.101 |
|  3 | 0.833 | 0.836 | ★ MiniMax M3.1 Flash       | MiniMax               | $0.09 |   150 | 1.0M |      0.365 |     0.362 |      0.108 |
|  4 | 0.806 | 0.809 | ★ DeepSeek-V4.1-Flash-1017 | DeepSeek              | $0.08 |   122 | 1.0M |      0.321 |     0.376 |      0.113 |
|  5 | 0.798 | 0.802 | DeepSeek-V4-Flash-0731     | DeepSeek              | $0.08 |   119 | 1.0M |      0.378 |     0.329 |      0.095 |
|  6 | 0.756 | 0.762 | Inkling 2 Small            | Thinking Machines Lab | $0.16 |   161 | 256k |      0.294 |     0.360 |      0.108 |
|  7 | 0.754 | 0.766 | MiniMax M3                 | MiniMax               | $0.29 |    90 | 1.0M |      0.348 |     0.323 |      0.095 |
|  8 | 0.748 | 0.750 | ★ GLM-5.3-Flash            | Zhipu AI              | $0.04 |    97 | 1.0M |      0.290 |     0.364 |      0.096 |
|  9 | 0.746 | 0.763 | GLM-5.3                    | Zhipu AI              | $0.40 |    95 | 1.0M |      0.279 |     0.373 |      0.111 |
| 10 | 0.746 | 0.762 | Inkling-Small              | Thinking Machines Lab | $0.40 |   194 | 524k |      0.362 |     0.308 |      0.092 |

## @tiny — Background tasks (titles, memory): cheapest and fastest wins
eligible: 80 — λ 0.03333 $/quality-point

|  # | value |     q | model                    | org                       |   $/M | tok/s |  ctx | tput 58.3% | gen 41.7% |
| -: | ----: | ----: | ------------------------ | ------------------------- | ----: | ----: | ---: | ---------: | --------: |
|  1 | 0.902 | 0.912 | ★ Beam 1.0               | Reflection AI             | $0.30 |   309 | 1.0M |      0.583 |     0.329 |
|  2 | 0.894 | 0.899 | ★ DeepSeek-V4.1-Flash    | DeepSeek                  | $0.16 |   144 | 1.0M |      0.544 |     0.356 |
|  3 | 0.876 | 0.886 | Inkling 2 Small          | Thinking Machines Lab     | $0.29 |   161 | 256k |      0.538 |     0.348 |
|  4 | 0.866 | 0.884 | Qwen3.8-27B              | Alibaba Cloud / Qwen Team | $0.53 |    74 | 262k |      0.554 |     0.329 |
|  5 | 0.861 | 0.863 | ★ MiniMax M3.1 Flash     | MiniMax                   | $0.09 |   150 | 1.0M |      0.513 |     0.351 |
|  6 | 0.846 | 0.849 | ★ DeepSeek-V4-Flash-0731 | DeepSeek                  | $0.08 |   119 | 1.0M |      0.531 |     0.318 |
|  7 | 0.845 | 0.849 | DeepSeek-V4.1-Flash-1017 | DeepSeek                  | $0.13 |   122 | 1.0M |      0.486 |     0.363 |
|  8 | 0.830 | 0.849 | GLM-5.3                  | Zhipu AI                  | $0.56 |    95 | 1.0M |      0.488 |     0.361 |
|  9 | 0.794 | 0.807 | Inkling-Small            | Thinking Machines Lab     | $0.40 |   194 | 524k |      0.509 |     0.298 |
| 10 | 0.791 | 0.801 | MiniMax M3               | MiniMax                   | $0.29 |    90 | 1.0M |      0.488 |     0.313 |

## @task — Subagents: agentic + tool calling, moderate cost sensitivity
eligible: 60 — λ 0.00747 $/quality-point (thinking ×1.857)

|  # | value |     q | model                      | org                       |   $/M | tok/s |  ctx | ag 29.9% | tool 20.7% | code 18.4% | gen 25.3% | tput 5.7% |
| -: | ----: | ----: | -------------------------- | ------------------------- | ----: | ----: | ---: | -------: | ---------: | ---------: | --------: | --------: |
|  1 | 0.744 | 0.747 | ★ DeepSeek-V4.1-Flash      | DeepSeek                  | $0.29 |   144 | 1.0M |    0.210 |      0.133 |      0.134 |     0.216 |     0.054 |
|  2 | 0.744 | 0.745 | ★ DeepSeek-V4.1-Flash-1017 | DeepSeek                  | $0.15 |   122 | 1.0M |    0.215 |      0.131 |      0.135 |     0.221 |     0.044 |
|  3 | 0.718 | 0.719 | MiniMax M3.1 Flash         | MiniMax                   | $0.16 |   150 | 1.0M |    0.203 |      0.123 |      0.130 |     0.213 |     0.051 |
|  4 | 0.703 | 0.706 | MiMo-V2.6-Pro              | Xiaomi                    | $0.42 |    41 | 1.0M |    0.205 |      0.130 |      0.131 |     0.214 |     0.026 |
|  5 | 0.701 | 0.703 | Inkling 2 Small            | Thinking Machines Lab     | $0.29 |   161 | 256k |    0.197 |      0.125 |      0.129 |     0.211 |     0.041 |
|  6 | 0.690 | 0.691 | ★ GLM-5.3-Flash            | Zhipu AI                  | $0.08 |    97 | 1.0M |    0.197 |      0.125 |      0.115 |     0.214 |     0.040 |
|  7 | 0.682 | 0.684 | Qwen3.8 Flash              | Alibaba Cloud / Qwen Team | $0.26 |    50 | 1.0M |    0.192 |      0.128 |      0.119 |     0.212 |     0.034 |
|  8 | 0.668 | 0.669 | MiMo-V2.6-Flash            | Xiaomi                    | $0.15 |    48 | 1.0M |    0.189 |      0.121 |      0.120 |     0.201 |     0.038 |
|  9 | 0.666 | 0.670 | Beam 1.0                   | Reflection AI             | $0.56 |   309 | 1.0M |    0.175 |      0.118 |      0.121 |     0.200 |     0.057 |
| 10 | 0.646 | 0.651 | GPT-5.6 Luna               | OpenAI                    | $0.61 |    91 | 1.1M |    0.180 |      0.110 |      0.119 |     0.199 |     0.043 |

## @advisor — Advisor/watchdog: deep reasoning over long context
eligible: 60 — λ 0.01250 $/quality-point (thinking ×1.857)

|  # | value |     q | model                      | org                       |   $/M | tok/s |  ctx | gen 74.3% | lc 12.6% | tput 13.1% |
| -: | ----: | ----: | -------------------------- | ------------------------- | ----: | ----: | ---: | --------: | -------: | ---------: |
|  1 | 0.789 | 0.796 | ★ Beam 1.0                 | Reflection AI             | $0.56 |   309 | 1.0M |     0.587 |    0.078 |      0.131 |
|  2 | 0.778 | 0.781 | ★ DeepSeek-V4.1-Flash      | DeepSeek                  | $0.29 |   144 | 1.0M |     0.635 |    0.024 |      0.122 |
|  3 | 0.772 | 0.774 | ★ DeepSeek-V4.1-Flash-1017 | DeepSeek                  | $0.15 |   122 | 1.0M |     0.648 |    0.024 |      0.101 |
|  4 | 0.763 | 0.765 | MiniMax M3.1 Flash         | MiniMax                   | $0.16 |   150 | 1.0M |     0.625 |    0.024 |      0.115 |
|  5 | 0.757 | 0.760 | Qwen3.8 Flash              | Alibaba Cloud / Qwen Team | $0.26 |    50 | 1.0M |     0.622 |    0.061 |      0.077 |
|  6 | 0.743 | 0.744 | ★ GLM-5.3-Flash            | Zhipu AI                  | $0.08 |    97 | 1.0M |     0.628 |    0.024 |      0.091 |
|  7 | 0.738 | 0.746 | GPT-5.6 Luna               | OpenAI                    | $0.61 |    91 | 1.1M |     0.584 |    0.063 |      0.098 |
|  8 | 0.735 | 0.739 | Inkling 2 Small            | Thinking Machines Lab     | $0.29 |   161 | 256k |     0.622 |    0.024 |      0.093 |
|  9 | 0.709 | 0.711 | DeepSeek-V4-Flash-0731     | DeepSeek                  | $0.16 |   119 | 1.0M |     0.567 |    0.024 |      0.119 |
| 10 | 0.706 | 0.711 | MiMo-V2.6-Pro              | Xiaomi                    | $0.42 |    41 | 1.0M |     0.628 |    0.024 |      0.059 |

## @designer — Design work: visual/UX judgement on image-capable models
eligible: 37 — λ 0.00882 $/quality-point (thinking ×1.857)

|  # | value |     q | model                      | org                       |   $/M | tok/s |  ctx | gen 30.6% | code 11.8% | vis 21.2% | tput 15.3% | web 21.2% | agon |
| -: | ----: | ----: | -------------------------- | ------------------------- | ----: | ----: | ---: | --------: | ---------: | --------: | ---------: | --------: | ---: |
|  1 | 0.792 | 0.794 | ★ DeepSeek-V4.1-Flash-1017 | DeepSeek                  | $0.25 |   122 | 1.0M |     0.267 |      0.086 |     0.137 |      0.127 |     0.176 |    — |
|  2 | 0.721 | 0.725 | MiMo-V2.6-Pro              | Xiaomi                    | $0.42 |    41 | 1.0M |     0.258 |      0.084 |     0.126 |      0.069 |     0.188 |    — |
|  3 | 0.713 | 0.714 | ★ GLM-5.3-Flash            | Zhipu AI                  | $0.08 |    97 | 1.0M |     0.258 |      0.074 |     0.136 |      0.107 |     0.139 |    — |
|  4 | 0.691 | 0.693 | Inkling 2 Mini             | Thinking Machines Lab     | $0.13 |    81 | 1.0M |     0.227 |      0.071 |     0.116 |      0.119 |     0.160 |    — |
|  5 | 0.682 | 0.686 | MiniMax M3                 | MiniMax                   | $0.54 |    90 | 1.0M |     0.230 |      0.073 |     0.122 |      0.128 |     0.134 | 1180 |
|  6 | 0.679 | 0.681 | GPT-6 Luna                 | OpenAI                    | $0.26 |    91 | 1.1M |     0.235 |      0.069 |     0.109 |      0.111 |     0.155 | 1141 |
|  7 | 0.673 | 0.679 | GPT-5.6 Luna               | OpenAI                    | $0.61 |    91 | 1.1M |     0.240 |      0.076 |     0.116 |      0.115 |     0.131 |    — |
|  8 | 0.662 | 0.665 | ~ DeepSeek-V4.1-Flash      | DeepSeek                  | $0.29 |   144 | 1.0M |     0.261 |      0.086 |     0.134 |      0.143 |     0.041 |    — |
|  9 | 0.656 | 0.663 | Qwen3.7-Plus               | Alibaba Cloud / Qwen Team | $0.72 |    50 |    — |     0.234 |      0.072 |     0.138 |      0.072 |     0.146 |    — |
| 10 | 0.643 | 0.644 | ~ MiniMax M3.1 Flash       | MiniMax                   | $0.16 |   150 | 1.0M |     0.257 |      0.083 |     0.128 |      0.134 |     0.041 |    — |
focus: website — coverage 141/456 (30.9%) ok; dispersion 0.993 ok; composition ok; freshness 0.0mo ok; trust unknown; modality unknown; maintenance unknown; provenance unknown; cross-source unknown

# Suggested settings.modelRoles (best-fit #1 per role, resolved via the omp catalog).
# Selectors are <provider>/<id> (openrouter unless a provider priority is set); the omp-llm-role plugin writes this block daily.
modelRoles:
  default: "openrouter/deepseek/deepseek-v4.1-flash-1017:auto"
  smol: "openrouter/deepseek/deepseek-v4.1-flash:off"
  slow: "openrouter/deepseek/deepseek-v4.1-flash-1017:high"
  vision: "openrouter/deepseek/deepseek-v4.1-flash-1017:auto"
  plan: # no catalog match for qwen3.8-flash
  commit: "openrouter/deepseek/deepseek-v4.1-flash:off"
  tiny: "openrouter/reflection/beam-1.0-501b-a23b:off"
  task: "openrouter/deepseek/deepseek-v4.1-flash:auto"
  advisor: "openrouter/reflection/beam-1.0-501b-a23b:auto"
  designer: "openrouter/deepseek/deepseek-v4.1-flash-1017:auto"
