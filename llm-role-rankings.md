llm-stats.com best-fit ranking per omp model role — 392 models, 2026-09-21
Score = Σ weight × percentile per metric (1.0 = best). The columns after | show each
metric's weighted contribution (weight × percentile); they sum to the score. price is
the inverted (cheaper = better) percentile; — = metric missing (contributes 0).
Abbr: gen=general rea=reasoning mat=math ag=agents tool=tool_calling lc=long_context
sea=search vis=vision tput=throughput (code, price, mrcr as-is).
Throughput + price: OpenRouter (p50 tok/s, last 30m routed traffic; standard-route $/M 3:1 in:out), throughput 145/392, priced 144; models without OpenRouter throughput or a billed route are not ranked.

## @default — Main workhorse: strong general coding-agent quality, sane cost
   weights: general:0.3, code:0.25, agents:0.2, tool_calling:0.1, reasoning:0.1, price:0.05 | eligible: 136
   #   score  model                          org            $/M    tok/s   ctx | gen   code  ag    tool  rea   price
    1  0.965  DeepSeek-V4.1-Flash             DeepSeek        $0.21      5   1.0M | 0.290 0.246 0.197 0.099 0.095 0.037
    2  0.951  GPT-6 Astra                     OpenAI          $20.0     33   1.1M | 0.300 0.250 0.200 0.100 0.100 0.001
    3  0.947  GPT-5.6 Sol                     OpenAI          $4.00     31   1.1M | 0.298 0.249 0.198 0.097 0.099 0.005
    4  0.941  GLM-5.3                         Zhipu AI        $1.19     49   1.0M | 0.293 0.244 0.192 0.098 0.099 0.015
    5  0.937  Muse Spark 1.3                  Meta            $2.00     67   1.0M | 0.296 0.242 0.195 0.098 0.098 0.009
    6  0.934  Kimi K3                         Moonshot AI     $3.40     26   1.0M | 0.294 0.245 0.191 0.099 0.098 0.006
    7  0.928  DeepSeek-V4-Pro-0813            DeepSeek        $0.86     50   1.0M | 0.291 0.240 0.187 0.095 0.096 0.019
    8  0.928  GLM-5.3-Flash                   Zhipu AI        $0.12     21   1.0M | 0.286 0.221 0.185 0.097 0.096 0.044
    9  0.924  Claude Fable 5                  Anthropic       $20.0     21   1.0M | 0.295 0.248 0.196 0.087 0.098 0.001
   10  0.922  Claude Opus 5                   Anthropic       $10.0     55   1.0M | 0.297 0.242 0.193 0.089 0.099 0.002

## @smol — Fast lightweight model: cheap and quick, still competent
   weights: price:0.3, throughput:0.25, general:0.2, code:0.15, tool_calling:0.1 | eligible: 136
   #   score  model                          org            $/M    tok/s   ctx | price tput  gen   code  tool 
    1  0.853  DeepSeek-V4-Flash-0731          DeepSeek        $0.07     57   1.0M | 0.287 0.171 0.181 0.130 0.084
    2  0.827  DeepSeek-V4-Flash-Vision-Exp    DeepSeek        $0.32    106   1.0M | 0.199 0.226 0.186 0.134 0.083
    3  0.820  Laguna S 2.1                    Poolside        $0.11     72   1.0M | 0.264 0.196 0.172 0.125 0.063
    4  0.818  Hy3                             Tencent         $0.14     61   262k | 0.252 0.182 0.178 0.131 0.075
    5  0.763  Ling 3.0 Flash                  InclusionAI     $0.03     45   131k | 0.298 0.132 0.159 0.112 0.063
    6  0.756  Ling 3.0 Flash Fin              InclusionAI     $0.09    117   262k | 0.273 0.236 0.177    — 0.070
    7  0.751  Qwen3.8 Flash                   Alibaba Cloud   $0.23     39   1.0M | 0.214 0.118 0.189 0.136 0.094
    8  0.745  Gemini 3.8 Flash                Google          $1.50    177   1.0M | 0.078 0.247 0.191 0.142 0.088
    9  0.735  GLM-5.3-Flash                   Zhipu AI        $0.12     21   1.0M | 0.262 0.053 0.191 0.133 0.097
   10  0.732  Step-3.5-Flash                  StepFun         $0.15     58   66k | 0.244 0.178 0.163 0.096 0.050

## @slow — Most capable model for hard problems; cost and speed as tiebreakers
   weights: general:0.25, reasoning:0.25, code:0.2, agents:0.15, math:0.1, price:0.03, throughput:0.02 | eligible: 136
   #   score  model                          org            $/M    tok/s   ctx | gen   rea   code  ag    math  price tput 
    1  0.949  GLM-5.3                         Zhipu AI        $1.19     49   1.0M | 0.245 0.247 0.195 0.144 0.098 0.009 0.012
    2  0.947  Claude Opus 5                   Anthropic       $10.0     55   1.0M | 0.247 0.248 0.194 0.145 0.099 0.001 0.013
    3  0.946  GPT-6 Astra                     OpenAI          $20.0     33   1.1M | 0.250 0.250 0.200 0.150 0.087 0.001 0.008
    4  0.942  GPT-5.6 Sol                     OpenAI          $4.00     31   1.1M | 0.249 0.249 0.199 0.148 0.087 0.003 0.007
    5  0.940  Claude Fable 5                  Anthropic       $20.0     21   1.0M | 0.246 0.246 0.198 0.147 0.098 0.001 0.004
    6  0.936  DeepSeek-V4-Pro-0813            DeepSeek        $0.86     50   1.0M | 0.243 0.240 0.192 0.140 0.097 0.012 0.012
    7  0.935  Kimi K3                         Moonshot AI     $3.40     26   1.0M | 0.245 0.244 0.196 0.143 0.097 0.004 0.006
    8  0.934  DeepSeek-V4.1-Flash             DeepSeek        $0.21      5   1.0M | 0.242 0.238 0.197 0.148 0.087 0.022 0.000
    9  0.928  Hy4 preview                     Tencent         $1.25     41   — | 0.241 0.244 0.190 0.138 0.097 0.009 0.010
   10  0.912  GLM-5.3-Flash                   Zhipu AI        $0.12     21   1.0M | 0.238 0.239 0.177 0.139 0.089 0.026 0.004

## @vision — Image understanding: vision index dominates
   weights: vision:0.5, general:0.2, reasoning:0.15, code:0.1, price:0.03, throughput:0.02 | eligible: 70
   #   score  model                          org            $/M    tok/s   ctx | vis   gen   rea   code  price tput 
    1  0.956  GPT-6 Astra                     OpenAI          $20.0     33   1.1M | 0.498 0.200 0.150 0.100 0.001 0.008
    2  0.950  Claude Opus 5                   Anthropic       $10.0     55   1.0M | 0.493 0.198 0.149 0.097 0.001 0.013
    3  0.945  GPT-5.6 Sol                     OpenAI          $4.00     31   1.1M | 0.488 0.199 0.149 0.100 0.003 0.007
    4  0.934  Kimi K3                         Moonshot AI     $3.40     26   1.0M | 0.483 0.196 0.147 0.098 0.004 0.006
    5  0.929  Claude Fable 5                  Anthropic       $20.0     21   1.0M | 0.481 0.197 0.147 0.099 0.001 0.004
    6  0.925  Muse Spark 1.1                  Meta            $2.00    190   1.0M | 0.476 0.190 0.145 0.089 0.005 0.020
    7  0.925  Gemini 3.8 Flash                Google          $1.50    177   1.0M | 0.471 0.191 0.140 0.095 0.008 0.020
    8  0.919  Qwen3.8 Flash                   Alibaba Cloud   $0.23     39   1.0M | 0.466 0.189 0.142 0.091 0.021 0.009
    9  0.912  GPT-5.5                         OpenAI          $11.3     45   1.1M | 0.478 0.188 0.141 0.094 0.001 0.010
   10  0.901  Claude Sonnet 5                 Anthropic       $4.00     49   1.0M | 0.464 0.188 0.141 0.093 0.003 0.012

## @plan — Planning: reasoning, math, long-context coherence
   weights: reasoning:0.3, math:0.15, long_context:0.2, general:0.2, mrcr:0.1, price:0.03, throughput:0.02 | eligible: 136
   #   score  model                          org            $/M    tok/s   ctx | rea   math  lc    gen   mrcr  price tput 
    1  0.921  GPT-5.6 Sol                     OpenAI          $4.00     31   1.1M | 0.298 0.130 0.197 0.199 0.088 0.003 0.007
    2  0.873  GPT-5.6 Terra                   OpenAI          $4.50     22   1.1M | 0.288 0.123 0.180 0.192 0.083 0.002 0.005
    3  0.852  GPT-5.5                         OpenAI          $11.3     45   1.1M | 0.282 0.138 0.159 0.188 0.075 0.001 0.010
    4  0.813  Muse Spark 1.3                  Meta            $2.00     67   1.0M | 0.295    — 0.200 0.197 0.100 0.005 0.016
    5  0.798  GPT-5.6 Luna                    OpenAI          $0.45     46   1.1M | 0.271 0.109 0.161 0.183 0.046 0.017 0.011
    6  0.797  Hy3                             Tencent         $0.14     61   262k | 0.266 0.135 0.178 0.178    — 0.025 0.015
    7  0.788  Hy4 preview                     Tencent         $1.25     41   — | 0.293 0.145 0.139 0.193    — 0.009 0.010
    8  0.788  Gemini 3.7 Flash                Google          $1.50    110   1.0M | 0.279    — 0.198 0.189 0.096 0.008 0.019
    9  0.788  Qwen3.7-Plus                    Alibaba Cloud   $0.56     16   — | 0.265 0.142 0.186 0.176    — 0.016 0.003
   10  0.784  Qwen3.8 Flash                   Alibaba Cloud   $0.23     39   1.0M | 0.284 0.124 0.156 0.189    — 0.021 0.009

## @commit — Commit messages: cheap and fast with decent general quality
   weights: price:0.35, throughput:0.25, general:0.25, code:0.15 | eligible: 136
   #   score  model                          org            $/M    tok/s   ctx | price tput  gen   code 
    1  0.862  DeepSeek-V4-Flash-0731          DeepSeek        $0.07     57   1.0M | 0.335 0.171 0.226 0.130
    2  0.844  Laguna S 2.1                    Poolside        $0.11     72   1.0M | 0.308 0.196 0.215 0.125
    3  0.830  Hy3                             Tencent         $0.14     61   262k | 0.294 0.182 0.223 0.131
    4  0.824  DeepSeek-V4-Flash-Vision-Exp    DeepSeek        $0.32    106   1.0M | 0.233 0.226 0.232 0.134
    5  0.790  Ling 3.0 Flash                  InclusionAI     $0.03     45   131k | 0.348 0.132 0.198 0.112
    6  0.789  Laguna XS 2.1                   Poolside        $0.07    156   262k | 0.332 0.241 0.140 0.076
    7  0.775  Ling 3.0 Flash Fin              InclusionAI     $0.09    117   262k | 0.318 0.236 0.221    —
    8  0.763  Step-3.5-Flash                  StepFun         $0.15     58   66k | 0.285 0.178 0.204 0.096
    9  0.741  Qwen3.8 Flash                   Alibaba Cloud   $0.23     39   1.0M | 0.250 0.118 0.236 0.136
   10  0.730  GLM-5.3-Flash                   Zhipu AI        $0.12     21   1.0M | 0.306 0.053 0.238 0.133

## @tiny — Background tasks (titles, memory): cheapest and fastest wins
   weights: price:0.4, throughput:0.35, general:0.25 | eligible: 136
   #   score  model                          org            $/M    tok/s   ctx | price tput  gen  
    1  0.915  Ling 3.0 Flash Fin              InclusionAI     $0.09    117   262k | 0.364 0.331 0.221
    2  0.856  Laguna XS 2.1                   Poolside        $0.07    156   262k | 0.379 0.338 0.140
    3  0.849  DeepSeek-V4-Flash-0731          DeepSeek        $0.07     57   1.0M | 0.383 0.239 0.226
    4  0.842  Laguna S 2.1                    Poolside        $0.11     72   1.0M | 0.352 0.275 0.215
    5  0.841  Nemotron 3 Nano (30B A3B)       NVIDIA          $0.09    184   262k | 0.372 0.348 0.122
    6  0.814  DeepSeek-V4-Flash-Vision-Exp    DeepSeek        $0.32    106   1.0M | 0.266 0.316 0.232
    7  0.814  Hy3                             Tencent         $0.14     61   262k | 0.336 0.255 0.223
    8  0.780  Ling 3.0 Flash                  InclusionAI     $0.03     45   131k | 0.397 0.185 0.198
    9  0.779  Step-3.5-Flash                  StepFun         $0.15     58   66k | 0.326 0.249 0.204
   10  0.749  Muse Glimmer-30B                Meta            $0.50    130   131k | 0.224 0.335 0.190

## @task — Subagents: agentic + tool calling, moderate cost sensitivity
   weights: agents:0.3, tool_calling:0.2, code:0.2, general:0.15, price:0.1, throughput:0.05 | eligible: 136
   #   score  model                          org            $/M    tok/s   ctx | ag    tool  code  gen   price tput 
    1  0.911  DeepSeek-V4.1-Flash             DeepSeek        $0.21      5   1.0M | 0.295 0.199 0.197 0.145 0.074 0.001
    2  0.889  GLM-5.3-Flash                   Zhipu AI        $0.12     21   1.0M | 0.277 0.194 0.177 0.143 0.087 0.011
    3  0.886  Muse Spark 1.3                  Meta            $2.00     67   1.0M | 0.292 0.197 0.193 0.148 0.017 0.039
    4  0.886  GLM-5.3                         Zhipu AI        $1.19     49   1.0M | 0.289 0.196 0.195 0.147 0.029 0.030
    5  0.877  DeepSeek-V4-Pro-0813            DeepSeek        $0.86     50   1.0M | 0.280 0.191 0.192 0.146 0.038 0.030
    6  0.874  Qwen3.8 Flash                   Alibaba Cloud   $0.23     39   1.0M | 0.267 0.188 0.182 0.142 0.071 0.024
    7  0.871  GPT-6 Astra                     OpenAI          $20.0     33   1.1M | 0.300 0.200 0.200 0.150 0.002 0.019
    8  0.867  GPT-5.6 Sol                     OpenAI          $4.00     31   1.1M | 0.297 0.195 0.199 0.149 0.009 0.018
    9  0.857  DeepSeek-V4-Flash-0731          DeepSeek        $0.07     57   1.0M | 0.251 0.168 0.173 0.136 0.096 0.034
   10  0.856  DeepSeek-V4-Flash-Vision-Exp    DeepSeek        $0.32    106   1.0M | 0.261 0.166 0.178 0.139 0.066 0.045

## @advisor — Advisor/watchdog: deep reasoning over long context
   weights: reasoning:0.35, general:0.25, long_context:0.2, math:0.1, search:0.05, price:0.03, throughput:0.02 | eligible: 136
   #   score  model                          org            $/M    tok/s   ctx | rea   gen   lc    math  sea   price tput 
    1  0.938  GPT-5.6 Sol                     OpenAI          $4.00     31   1.1M | 0.348 0.249 0.197 0.087 0.048 0.003 0.007
    2  0.890  GPT-5.6 Terra                   OpenAI          $4.50     22   1.1M | 0.335 0.240 0.180 0.082 0.046 0.002 0.005
    3  0.885  Hy3                             Tencent         $0.14     61   262k | 0.310 0.223 0.178 0.090 0.044 0.025 0.015
    4  0.884  Hy4 preview                     Tencent         $1.25     41   — | 0.341 0.241 0.139 0.097 0.047 0.009 0.010
    5  0.865  GPT-5.5                         OpenAI          $11.3     45   1.1M | 0.329 0.234 0.159 0.092 0.040 0.001 0.010
    6  0.848  Qwen3.6 Plus                    Alibaba Cloud   $0.73     35   1.0M | 0.301 0.211 0.188 0.094 0.033 0.014 0.008
    7  0.845  Muse Spark 1.3                  Meta            $2.00     67   1.0M | 0.344 0.247 0.200    — 0.034 0.005 0.016
    8  0.844  GPT-5.6 Luna                    OpenAI          $0.45     46   1.1M | 0.316 0.229 0.161 0.073 0.038 0.017 0.011
    9  0.838  Qwen3.8 Flash                   Alibaba Cloud   $0.23     39   1.0M | 0.332 0.236 0.156 0.083    — 0.021 0.009
   10  0.832  Qwen3.5-397B-A17B               Alibaba Cloud   $0.88     63   262k | 0.291 0.208 0.181 0.089 0.037 0.011 0.015

# Suggested settings.modelRoles (best-fit #1 per role).
# provider/model_id is best-effort: llm-stats org -> omp provider;
# bare model_id means pick the provider yourself (OpenRouter etc.).
modelRoles:
  default: "deepseek/deepseek-v4.1-flash"
  smol: "deepseek/deepseek-v4-flash-0731"
  slow: "glm-5.3"  # org: Zhipu AI
  vision: "openai/gpt-6-astra"
  plan: "openai/gpt-5.6-sol"
  commit: "deepseek/deepseek-v4-flash-0731"
  tiny: "ling-3.0-flash-fin"  # org: InclusionAI
  task: "deepseek/deepseek-v4.1-flash"
  advisor: "openai/gpt-5.6-sol"
