/**
 * TierMux Cloud Provider
 *
 * Wraps the TierMux multi-provider catalog with cooldown + quarantine logic.
 * Acts as a smarter cloud fallback: when one provider returns 429/401/404/5xx,
 * it silently fails over to the next, applying TierMux's routing strategy.
 *
 * Features ported from TierMux routing:
 * - 429 (rate limit): cool down the key, try next key, then next provider
 * - 401/402/403 (auth): try other keys, then skip provider for this turn
 * - 404 (model removed): skip provider for 24h
 * - 400 with tools offered: skip provider for 10 min (tool-incompatible)
 * - 5xx/timeout/silence: try next provider
 * - Empty 200 response: try next provider
 *
 * @see https://github.com/mainulBUBT/TierMux — Routing
 */

import type {
	HealthStatus,
	InferenceChunk,
	InferenceProvider,
	InferenceRequest,
	ModelReference,
	UnifiedCompanion,
} from "@/types/unified";
import { TIER_MUX_CATALOG, type TierMuxModel, type TierMuxProvider } from "./tiermux-catalog";

/** Quarantine entry: provider is skipped until cooldown expires. */
interface QuarantineEntry {
  expiresAt: number;
  reason: string;
}

/** Cooldown entry: specific API key is skipped until cooldown expires. */
interface CooldownEntry {
  expiresAt: number;
  reason: string;
}

export interface TierMuxCloudConfig {
  /** Default model ID to use (e.g., "gpt-4o-mini" or "auto"). */
  defaultModel?: string;
  /** API keys per provider ID (from user config / env). */
  providerKeys?: Record<string, string | string[]>;
  /** Custom endpoint overrides. */
  customEndpoints?: Record<string, string>;
  /** Whether keyless providers are enabled (default: true). */
  allowKeyless?: boolean;
  /** Maximum failover attempts per chat (default: 5). */
  maxFailovers?: number;
}

const DEFAULT_COOLDOWN = 60_000;       // 1 minute
const QUARANTINE_24H = 24 * 60 * 60_1000; // 24 hours
const QUARANTINE_10M = 10 * 60 * 1000;     // 10 minutes

export class TierMuxCloudProvider implements InferenceProvider {
  id = "cloud-tier-mux";
  name = "TierMux Cloud (Multi-Provider)";
  type = "cloud" as const;
  description = "Auto-failover across 49 LLM providers with cooldown + quarantine";
  supportsStreaming = true;
  supportsTools = true;
  supportsVision = true;
  maxContextLength = 200_000;

  private config: TierMuxCloudConfig;
  private quarantine = new Map<string, QuarantineEntry>();  // providerId -> quarantine
  private cooldown = new Map<string, CooldownEntry>();       // `${providerId}:${keyIndex}` -> cooldown

  constructor(config: TierMuxCloudConfig = {}) {
    this.config = {
      defaultModel: "gpt-4o-mini",
      allowKeyless: true,
      maxFailovers: 5,
      ...config,
    };
  }

  /** Check if a provider is quarantined (skipped). */
  private isQuarantined(providerId: string): boolean {
    const entry = this.quarantine.get(providerId);
    if (!entry) return false;
    if (Date.now() >= entry.expiresAt) {
      this.quarantine.delete(providerId);
      return false;
    }
    return true;
  }

  /** Quarantine a provider for a duration. */
  private quarantineProvider(providerId: string, durationMs: number, reason: string): void {
    this.quarantine.set(providerId, {
      expiresAt: Date.now() + durationMs,
      reason,
    });
  }

  /** Check if a specific key is on cooldown. */
  private isCooldowned(providerId: string, keyIndex: number): boolean {
    const key = `${providerId}:${keyIndex}`;
    const entry = this.cooldown.get(key);
    if (!entry) return false;
    if (Date.now() >= entry.expiresAt) {
      this.cooldown.delete(key);
      return false;
    }
    return true;
  }

  /** Apply cooldown to a specific key. */
  private cooldownKey(providerId: string, keyIndex: number, durationMs: number, reason: string): void {
    const key = `${providerId}:${keyIndex}`;
    this.cooldown.set(key, {
      expiresAt: Date.now() + durationMs,
      reason,
    });
  }

  /** Get active providers (not quarantined), in priority order. */
  private getActiveProviders(): TierMuxProvider[] {
    return TIER_MUX_CATALOG.filter((p) => {
      if (!this.isQuarantined(p.id)) return true;
      return false;
    }).sort((a, b) => {
      // Keyless first, then free-key providers
      const aKeyless = a.type === "keyless" ? 0 : 1;
      const bKeyless = b.type === "keyless" ? 0 : 1;
      if (aKeyless !== bKeyless) return aKeyless - bKeyless;

      // Then alphabetical
      return a.name.localeCompare(b.name);
    });
  }

  /** Get API key(s) for a provider. */
  private getProviderKeys(providerId: string): string[] {
    const keys = this.config.providerKeys?.[providerId];
    if (!keys) return [];
    return Array.isArray(keys) ? keys : [keys];
  }

  /** Check if provider is usable (has keys or is keyless). */
  private isProviderUsable(provider: TierMuxProvider): boolean {
    if (provider.type === "keyless" && this.config.allowKeyless) return true;
    const keys = this.getProviderKeys(provider.id);
    return keys.length > 0;
  }

  /** Build URL for a provider's chat completions endpoint. */
  private getProviderUrl(provider: TierMuxProvider): string {
    const override = this.config.customEndpoints?.[provider.id];
    return override || provider.baseUrl;
  }

  /** Select the best model for a request across providers. */
  private selectModel(request: InferenceRequest): { provider: TierMuxProvider; model: TierMuxModel } | null {
    const modelName = request.companion.modelRef?.cloudModel || this.config.defaultModel || "gpt-4o-mini";
    const activeProviders = this.getActiveProviders().filter((p) => this.isProviderUsable(p));

    for (const provider of activeProviders) {
      const model = provider.models.find((m) => m.id === modelName || m.name.toLowerCase().includes(modelName.toLowerCase()));
      if (model) {
        return { provider, model };
      }

      // Provider supports the model class if it has compatible models
      if (modelName === "auto" || modelName === "smart") {
        const best = provider.models[0];
        if (best) return { provider, model: best };
      }
    }

    return null;
  }

  estimateCost(request: InferenceRequest): number {
    const selected = this.selectModel(request);
    if (!selected) return 0;

    const inputTokens = this.estimateTokens(request.messages);
    const outputTokens = request.maxTokens ?? 512;

    return (inputTokens / 1000) * selected.model.cost.input +
           (outputTokens / 1000) * selected.model.cost.output;
  }

  private estimateTokens(messages: InferenceRequest["messages"]): number {
    let total = 0;
    for (const msg of messages) {
      total += Math.ceil(msg.content.length / 4);
    }
    return total;
  }

  async *infer(request: InferenceRequest): AsyncGenerator<InferenceChunk> {
    const companion = request.companion;
    const systemPrompt = this.buildSystemPrompt(companion);

    const messages = [
      { role: "system", content: systemPrompt },
      ...request.messages.map((m) => ({
        role: m.role === "tool" ? "tool" : m.role,
        content: m.content,
        ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
        ...(m.toolCalls ? { tool_calls: m.toolCalls } : {}),
      })),
    ];

    const maxFailures = this.config.maxFailovers ?? 5;
    const errors: string[] = [];
    let attempt = 0;

    const activeProviders = this.getActiveProviders().filter((p) => this.isProviderUsable(p));

    if (activeProviders.length === 0) {
      yield {
        type: "error",
        error: "No TierMux providers available (all keyless disabled or no API keys configured)",
      };
      return;
    }

    for (const provider of activeProviders) {
      if (attempt >= maxFailures) {
        break;
      }

    const keys = this.getProviderKeys(provider.id);
    const keySources = provider.type === "keyless" ? [null] : keys;

    if (keySources.length === 0) {
      continue; // No keys and not keyless
    }

    const selection = this.selectModel(request);
    if (!selection) {
      errors.push(`provider ${provider.id}: no model found for ${this.config.defaultModel}`);
      continue;
    }
    const model = selection.model;

    for (let keyIndex = 0; keyIndex < keySources.length; keyIndex++) {
      if (attempt >= maxFailures) break;
      if (this.isCooldowned(provider.id, keyIndex)) continue;

      attempt++;
      const apiKey = keySources[keyIndex];

      try {
        const result = await this.tryProvider(provider, model, apiKey, messages, request);
        yield* result;
        return; // Success
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          errors.push(`provider ${provider.id} key[${keyIndex}]: ${error}`);

          // Apply TierMux routing logic based on error type
          this.applyRoutingLogic(provider, keyIndex, error);

          continue;
        }
      }
    }

    // All providers failed
    yield {
      type: "error",
      error: `All TierMux providers failed after ${attempt} attempts: ${errors.join("; ")}`,
    };
  }

  /** Attempt a single provider+model+key combination. */
  private async *tryProvider(
    provider: TierMuxProvider,
    model: TierMuxModel,
    apiKey: string | null,
    messages: any[],
    request: InferenceRequest,
  ): AsyncGenerator<InferenceChunk> {
    const url = `${this.getProviderUrl(provider)}/chat/completions`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (apiKey) {
      if (provider.id === "anthropic") {
        headers["x-api-key"] = apiKey;
        headers["anthropic-version"] = "2023-06-01";
      } else if (provider.id === "google-ai") {
        // Google uses query param, handled below
      } else {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }
    }

    const body: any = {
      model: model.id,
      messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 512,
      top_p: request.topP ?? 0.9,
      stream: true,
      ...(request.tools?.length ? { tools: request.tools } : {}),
      ...(request.stopSequences?.length ? { stop: request.stopSequences } : {}),
    };

    // Handle Google's special URL format
    let fetchUrl = url;
    if (provider.id === "google-ai") {
      fetchUrl = `${provider.baseUrl}/models/${model.id}:streamGenerateContent?key=${apiKey}`;
      // Strip auth header for Google
      delete headers["Authorization"];
    }

    const response = await fetch(fetchUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const rawErrorText = await response.text();
      const errorText = rawErrorText.slice(0, 500);
      // Throw an error that includes the status code for routing logic
      const err = new Error(`${provider.id}: HTTP ${response.status} ${errorText}`);
      (err as any).status = response.status;
      throw err;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield { type: "error", error: "No response stream" };
      return;
    }

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = new TextDecoder().decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data === "[DONE]") {
              yield { type: "done" };
              return;
            }
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              const toolCalls = parsed.choices?.[0]?.delta?.tool_calls;

              if (content) {
                yield { type: "content", content };
              }
              if (toolCalls && toolCalls.length > 0) {
                for (const tc of toolCalls) {
                  yield {
                    type: "tool_call",
                    toolCall: {
                      id: tc.id,
                      type: "function",
                      function: {
                        name: tc.function?.name || "",
                        arguments: tc.function?.arguments || "",
                      },
                    },
                  };
                }
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield { type: "done" };
  }

  /** Apply TierMux's routing/failure-handling logic. */
  private applyRoutingLogic(provider: TierMuxProvider, keyIndex: number, error: string): void {
    const statusMatch = error.match(/HTTP (\d+)/);
    const status = statusMatch ? parseInt(statusMatch[1], 10) : 0;

    if (status === 429) {
      // Rate limited: cooldown this key for 60s
      this.cooldownKey(provider.id, keyIndex, DEFAULT_COOLDOWN, "429 rate limit");
    } else if (status === 401 || status === 402 || status === 403) {
      // Auth failure: cooldown key, try other keys
      this.cooldownKey(provider.id, keyIndex, DEFAULT_COOLDOWN, `${status} auth failure`);
    } else if (status === 404) {
      // Model retired: quarantine provider for 24h
      this.quarantineProvider(provider.id, QUARANTINE_24H, "404 model not found");
    } else if (status === 400 && error.toLowerCase().includes("tool")) {
      // Tool-incompatible: quarantine provider for 10 min
      this.quarantineProvider(provider.id, QUARANTINE_10M, "400 tool-incompatible");
    } else if (status === 500 || status === 502 || status === 503 || status >= 500) {
      // Server error: cooldown briefly, try next
      this.cooldownKey(provider.id, keyIndex, DEFAULT_COOLDOWN / 2, `${status} server error`);
    } else if (status === 408 || status === 408 || error.toLowerCase().includes("timeout") || error.toLowerCase().includes("empty")) {
      // Timeout or empty response: brief cooldown
      this.cooldownKey(provider.id, keyIndex, DEFAULT_COOLDOWN / 3, "timeout/empty");
    }
  }

  private buildSystemPrompt(companion: UnifiedCompanion): string {
    const personality = companion.personality.join(", ");
    return `${companion.systemPrompt}\n\nPersonality: ${personality}\n\nYou are ${companion.name}. Stay in character.`;
  }

  async checkHealth(): Promise<HealthStatus> {
    const active = this.getActiveProviders().filter((p) => this.isProviderUsable(p));
    const quarantined = Array.from(this.quarantine.entries())
      .filter(([, e]) => Date.now() < e.expiresAt)
      .map(([id]) => id);

    return {
      healthy: active.length > 0,
      latencyMs: 0,
      message: `${active.length} providers active, ${quarantined.length} quarantined`,
    };
  }

  async getAvailableModels(): Promise<ModelReference[]> {
    const active = this.getActiveProviders().filter((p) => this.isProviderUsable(p));
    const models: ModelReference[] = [];

    for (const provider of active) {
      for (const model of provider.models) {
        models.push({
          type: "cloud" as const,
          cloudProvider: provider.id as any,
          cloudModel: model.id,
          modelName: model.name,
        });
      }
    }

    return models;
  }

  /** Update the provider with new API keys / settings. */
  updateConfig(config: Partial<TierMuxCloudConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /** Clear all cooldown and quarantine state (force refresh). */
  resetRoutingState(): void {
    this.quarantine.clear();
    this.cooldown.clear();
  }

  /** Get current quarantine/cooldown status for diagnostics. */
  getRoutingState(): {
    quarantined: Array<{ provider: string; reason: string; expiresAt: number }>;
    cooledDown: Array<{ provider: string; keyIndex: number; reason: string; expiresAt: number }>;
  } {
    const now = Date.now();
    const quarantined = Array.from(this.quarantine.entries())
      .filter(([, e]) => e.expiresAt > now)
      .map(([id, e]) => ({ provider: id, reason: e.reason, expiresAt: e.expiresAt }));
    const cooledDown = Array.from(this.cooldown.entries())
      .filter(([, e]) => e.expiresAt > now)
      .map(([key, e]) => {
        const [provider, keyIndex] = key.split(":");
        return { provider, keyIndex: parseInt(keyIndex, 10), reason: e.reason, expiresAt: e.expiresAt };
      });

    return { quarantined, cooledDown };
  }
}

/**
 * Read an environment variable without touching the `process` identifier.
 *
 * Why not `process?.env?.[name]`: in a browser bundle `process` is an
 * *undeclared identifier*, not `undefined`. Evaluating the member access
 * throws `ReferenceError` before `?.` can short-circuit — and this factory
 * runs inside `ProviderManager`'s constructor, which `IntegrationProvider`
 * instantiates at the top of the tree, so one throw blanks the whole app.
 *
 * Lookup order:
 *  1. `globalThis.process` — Node (the tiermux-proxy server), guarded by
 *     `typeof` so the identifier is never evaluated in the browser.
 *  2. `import.meta.env` — Vite. Only `VITE_*` names reach the client
 *     (no `envPrefix` is configured), so plain names like `OPENAI_API_KEY`
 *     are intentionally absent here unless prefixed with `VITE_`.
 * Returns `undefined` in either environment when unset — callers treat that
 * as "key not configured", which is the pre-existing behaviour.
 */
function readEnvVar(name: string): string | undefined {
  const fromProcess =
    typeof globalThis.process === "object" && globalThis.process !== null
      ? (globalThis.process.env as Record<string, string | undefined> | undefined)?.[name]
      : undefined;
  if (fromProcess) return fromProcess;

  const meta = import.meta.env as unknown as Record<string, string | undefined>;
  return meta?.[`VITE_${name}`] ?? meta?.[name];
}

/** Factory: create a TierMux cloud provider from env keys. */
export function createTierMuxProvider(
  defaultModel?: string,
): TierMuxCloudProvider {
  const providerKeys: Record<string, string | string[]> = {};

  // Parse API keys from environment or config
  const envPrefixMap: Record<string, string> = {
    OPENAI_API_KEY: "openai",
    ANTHROPIC_API_KEY: "anthropic",
    GOOGLE_API_KEY: "google-ai",
    GROQ_API_KEY: "groq",
    TOGETHER_API_KEY: "together",
    OPENROUTER_API_KEY: "openrouter",
    MISTRAL_API_KEY: "mistral",
    CEREBRAS_API_KEY: "cerebras",
    FIREWORKS_API_KEY: "fireworks",
  };

  for (const [envVar, providerId] of Object.entries(envPrefixMap)) {
    const key = readEnvVar(envVar);
    if (key) {
      providerKeys[providerId] = key;
    }
  }

  return new TierMuxCloudProvider({
    defaultModel,
    providerKeys,
    allowKeyless: true,
    maxFailovers: 5,
  });
}
