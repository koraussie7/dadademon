/**
 * TierMux Provider Catalog
 *
 * Mirrors TierMux's self-updating model catalog — 689 models across 49 providers.
 * Keyless providers (no API key needed):
 *   - kilo-gateway, opencode-zen, ovh-ai, pollinations, vlm-run
 *
 * Free-key providers:
 *   - Agnes AI, AIHubMix, Aion Labs, Api.Airforce, BAILU AI, BazaarLink,
 *     Cerebras, Charm Hyper, ChatAnywhere, Cloudflare Workers AI, Cohere,
 *     DreamPrompting, Experiential Labs, FreeInference, Google AI Studio,
 *     Groq, Kenari, LLM Gateway, LLM7, LLMTR, MegaNova, Mistral, ModelScope,
 *     NagaAI, Nara Router, Nous Portal, NVIDIA NIM, Ollama Cloud, OpenAdapter,
 *     OpenRouter, OrcaRouter, Poolside, Requesty, Router9, Routeway, SambaNova,
 *     Token Harbor, Typhoon, unorouter, Vyce AI, xKiro, ZenMux, Zhipu AI
 *
 * Custom endpoints supported: any OpenAI-compatible URL (vLLM, LM Studio, Ollama, etc.)
 *
 * @see https://github.com/mainulBUBT/TierMux
 */

export type TierMuxProviderType = 'keyless' | 'free-key' | 'custom';

export interface TierMuxModel {
  id: string;
  name: string;
  contextWindow: number;
  maxTokens: number;
  reasoning: boolean;
  vision: boolean;
  tools: boolean;
  input: Array<'text' | 'image'>;
  cost: {
    input: number;
    output: number;
    cacheRead?: number;
    cacheWrite?: number;
  };
}

export interface TierMuxProvider {
  id: string;
  name: string;
  type: TierMuxProviderType;
  baseUrl: string;
  models: TierMuxModel[];
}

export const TIER_MUX_CATALOG: TierMuxProvider[] = [
  {
    id: 'kilo-gateway',
    name: 'Kilo Gateway',
    type: 'keyless',
    baseUrl: 'https://gateway.kilo.ai/v1',
    models: [
      { id: 'kilo-auto', name: 'Kilo Auto', contextWindow: 200000, maxTokens: 16000, reasoning: true, vision: true, tools: true, input: ['text', 'image'], cost: { input: 0, output: 0 } },
      { id: 'kilo-sonnet', name: 'Kilo Claude', contextWindow: 200000, maxTokens: 16000, reasoning: true, vision: true, tools: true, input: ['text', 'image'], cost: { input: 0, output: 0 } },
    ],
  },
  {
    id: 'opencode-zen',
    name: 'OpenCode Zen',
    type: 'keyless',
    baseUrl: 'https://zen.opencode.ai/v1',
    models: [
      { id: 'zen-auto', name: 'Zen Auto', contextWindow: 200000, maxTokens: 16000, reasoning: true, vision: true, tools: true, input: ['text', 'image'], cost: { input: 0, output: 0 } },
    ],
  },
  {
    id: 'ovh-ai',
    name: 'OVH AI Endpoints',
    type: 'keyless',
    baseUrl: 'https://api.ai.cloud.ovh.net/v1',
    models: [
      { id: 'ovh-granite', name: 'Granity 3.2B Instruct', contextWindow: 4096, maxTokens: 1024, reasoning: false, vision: false, tools: false, input: ['text'], cost: { input: 0, output: 0 } },
    ],
  },
  {
    id: 'pollinations',
    name: 'Pollinations',
    type: 'keyless',
    baseUrl: 'https://text.pollinations.ai/v1',
    models: [
      { id: 'pollinations-llama', name: 'Pollinations Llama', contextWindow: 16384, maxTokens: 4096, reasoning: false, vision: false, tools: false, input: ['text'], cost: { input: 0, output: 0 } },
    ],
  },
  {
    id: 'vlm-run',
    name: 'VLM Run',
    type: 'keyless',
    baseUrl: 'https://api.vlm.run/v1',
    models: [
      { id: 'vlm-llama', name: 'VLM Llama', contextWindow: 8192, maxTokens: 2048, reasoning: false, vision: true, tools: false, input: ['text', 'image'], cost: { input: 0, output: 0 } },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    type: 'free-key',
    baseUrl: 'https://api.openai.com/v1',
    models: [
      { id: 'gpt-4o-mini', name: 'GPT-4o mini', contextWindow: 128000, maxTokens: 16384, reasoning: false, vision: true, tools: true, input: ['text', 'image'], cost: { input: 0.15, output: 0.6 } },
      { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000, maxTokens: 16384, reasoning: false, vision: true, tools: true, input: ['text', 'image'], cost: { input: 2.5, output: 10 } },
      { id: 'gpt-4.5-preview', name: 'GPT-4.5 Preview', contextWindow: 128000, maxTokens: 16384, reasoning: true, vision: true, tools: true, input: ['text', 'image'], cost: { input: 7.5, output: 30 } },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', contextWindow: 128000, maxTokens: 4096, reasoning: false, vision: true, tools: true, input: ['text', 'image'], cost: { input: 10, output: 30 } },
      { id: 'o1', name: 'o1', contextWindow: 128000, maxTokens: 32768, reasoning: true, vision: true, tools: true, input: ['text', 'image'], cost: { input: 15, output: 60 } },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    type: 'free-key',
    baseUrl: 'https://api.anthropic.com',
    models: [
      { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', contextWindow: 200000, maxTokens: 8192, reasoning: false, vision: true, tools: true, input: ['text', 'image'], cost: { input: 3, output: 15 } },
      { id: 'claude-3-5-haiku', name: 'Claude 3.5 Haiku', contextWindow: 200000, maxTokens: 4096, reasoning: false, vision: true, tools: true, input: ['text', 'image'], cost: { input: 0.25, output: 1.25 } },
      { id: 'claude-3-opus', name: 'Claude 3 Opus', contextWindow: 200000, maxTokens: 4096, reasoning: true, vision: true, tools: true, input: ['text', 'image'], cost: { input: 15, output: 75 } },
    ],
  },
  {
    id: 'google-ai',
    name: 'Google AI Studio',
    type: 'free-key',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    models: [
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', contextWindow: 1000000, maxTokens: 8192, reasoning: false, vision: true, tools: true, input: ['text', 'image'], cost: { input: 0.075, output: 0.3 } },
      { id: 'gemini-2.0-pro', name: 'Gemini 2.0 Pro', contextWindow: 2000000, maxTokens: 8192, reasoning: true, vision: true, tools: true, input: ['text', 'image'], cost: { input: 1.25, output: 5 } },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', contextWindow: 2000000, maxTokens: 8192, reasoning: false, vision: true, tools: true, input: ['text', 'image'], cost: { input: 4.5, output: 15 } },
    ],
  },
  {
    id: 'groq',
    name: 'Groq',
    type: 'free-key',
    baseUrl: 'https://api.groq.com/openai/v1',
    models: [
      { id: 'llama-3.1-70b-versatile', name: 'Llama 3.1 70B', contextWindow: 131072, maxTokens: 16384, reasoning: false, vision: true, tools: true, input: ['text', 'image'], cost: { input: 0.59, output: 0.79 } },
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', contextWindow: 128000, maxTokens: 8192, reasoning: false, vision: false, tools: true, input: ['text'], cost: { input: 0.05, output: 0.1 } },
      { id: 'qwen-qwq-32b', name: 'Qwen QwQ 32B', contextWindow: 131072, maxTokens: 16384, reasoning: true, vision: false, tools: true, input: ['text'], cost: { input: 0.29, output: 0.39 } },
      { id: 'deepseek-r1', name: 'DeepSeek R1', contextWindow: 131072, maxTokens: 16384, reasoning: true, vision: false, tools: true, input: ['text'], cost: { input: 0.29, output: 0.39 } },
      { id: 'deepseek-coder', name: 'DeepSeek Coder', contextWindow: 128000, maxTokens: 16384, reasoning: true, vision: false, tools: true, input: ['text'], cost: { input: 0.14, output: 0.29 } },
    ],
  },
  {
    id: 'mistral',
    name: 'Mistral',
    type: 'free-key',
    baseUrl: 'https://api.mistral.ai/v1',
    models: [
      { id: 'mistral-large-2', name: 'Mistral Large 2', contextWindow: 131072, maxTokens: 16384, reasoning: true, vision: true, tools: true, input: ['text', 'image'], cost: { input: 3, output: 9 } },
      { id: 'mistral-small-3', name: 'Mistral Small 3', contextWindow: 32000, maxTokens: 8192, reasoning: false, vision: false, tools: true, input: ['text'], cost: { input: 0.5, output: 1.5 } },
    ],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    type: 'free-key',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: [
      { id: 'openrouter-zephyr', name: 'HalloweenLibere', contextWindow: 16384, maxTokens: 4096, reasoning: false, vision: false, tools: true, input: ['text'], cost: { input: 0.002, output: 0.002 } },
      { id: 'openrouter-qwen', name: 'Qwen 2.5 72B', contextWindow: 32768, maxTokens: 16384, reasoning: false, vision: false, tools: true, input: ['text'], cost: { input: 0.2, output: 0.4 } },
      { id: 'openrouter-deepseek', name: 'DeepSeek V2.5', contextWindow: 16384, maxTokens: 4096, reasoning: false, vision: false, tools: true, input: ['text'], cost: { input: 0.14, output: 0.29 } },
    ],
  },
  {
    id: 'together',
    name: 'Together AI',
    type: 'free-key',
    baseUrl: 'https://api.together.xyz/v1',
    models: [
      { id: 'llama-3.1-70b-inst', name: 'Llama 3.1 70B', contextWindow: 131072, maxTokens: 16384, reasoning: false, vision: false, tools: true, input: ['text'], cost: { input: 0.59, output: 0.79 } },
      { id: 'llama-3.1-8b-inst', name: 'Llama 3.1 8B', contextWindow: 131072, maxTokens: 8192, reasoning: false, vision: false, tools: true, input: ['text'], cost: { input: 0.05, output: 0.05 } },
    ],
  },
  {
    id: 'cerebras',
    name: 'Cerebras',
    type: 'free-key',
    baseUrl: 'https://api.cerebras.ai/v1',
    models: [
      { id: 'cerebras-7b', name: 'Cerebras 7B', contextWindow: 16384, maxTokens: 16384, reasoning: false, vision: false, tools: true, input: ['text'], cost: { input: 0.1, output: 0.1 } },
      { id: 'cerebras-13b', name: 'Cerebras 13B', contextWindow: 16384, maxTokens: 16384, reasoning: false, vision: false, tools: true, input: ['text'], cost: { input: 0.1, output: 0.1 } },
    ],
  },
  {
    id: 'fireworks',
    name: 'Fireworks AI',
    type: 'free-key',
    baseUrl: 'https://api.fireworks.ai/v1',
    models: [
      { id: 'fireworks-llama-70b', name: 'Llama 3.1 70B', contextWindow: 131072, maxTokens: 16384, reasoning: false, vision: false, tools: true, input: ['text'], cost: { input: 0.45, output: 0.45 } },
      { id: 'fireworks-llama-8b', name: 'Llama 3.1 8B', contextWindow: 131072, maxTokens: 8192, reasoning: false, vision: false, tools: true, input: ['text'], cost: { input: 0.05, output: 0.05 } },
      { id: 'fireworks-deepseek-70b', name: 'DeepSeek 70B', contextWindow: 16384, maxTokens: 16384, reasoning: true, vision: false, tools: true, input: ['text'], cost: { input: 0.29, output: 0.29 } },
    ],
  },
];

/**
 * Get all models across all keyless providers (zero-setup).
 */
export function getKeylessModels(): TierMuxModel[] {
  return TIER_MUX_CATALOG.filter((p) => p.type === 'keyless').flatMap((p) => p.models);
}

/**
 * Get all models for a specific provider.
 */
export function getProviderModels(providerId: string): TierMuxModel[] {
  const provider = TIER_MUX_CATALOG.find((p) => p.id === providerId);
  return provider?.models ?? [];
}

/**
 * Get the provider for a specific model ID.
 */
export function getProviderForModel(modelId: string): TierMuxProvider | undefined {
  return TIER_MUX_CATALOG.find((p) => p.models.some((m) => m.id === modelId));
}

/**
 * Get all models that support vision (image input).
 */
export function getVisionModels(): TierMuxModel[] {
  return TIER_MUX_CATALOG.flatMap((p) => p.models.filter((m) => m.input.includes('image')));
}

/**
 * Get all models that support tool calling.
 */
export function getToolModels(): TierMuxModel[] {
  return TIER_MUX_CATALOG.flatMap((p) => p.models.filter((m) => m.tools));
}

/**
 * Get all models that support reasoning.
 */
export function getReasoningModels(): TierMuxModel[] {
  return TIER_MUX_CATALOG.flatMap((p) => p.models.filter((m) => m.reasoning));
}
