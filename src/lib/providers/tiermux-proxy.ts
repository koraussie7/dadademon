/**
 * TierMux Proxy Server
 *
 * Runs TierMux's multi-provider routing as an OpenAI-compatible proxy server.
 * Start this on the deployment target (172.20.10.197) to provide a single
 * failover endpoint for privseai-trystero.
 *
 * Usage:
 *   npm run tiermux:proxy            # Start on localhost:11435
 *   npm run tiermux:proxy -- --port 8080   # Custom port
 *   TIERMUX_PROVIDER_KEYS='{"openai":"sk-...","groq":"..."}' npm run tiermux:proxy
 *
 * API keys can be provided via:
 * - Environment: TIERMUX_PROVIDER_KEYS='{"providerId": "key", "providerId2": ["key1","key2"]}'
 * - Or individual env vars: OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.
 */

import http from "node:http";
import { TIER_MUX_CATALOG, type TierMuxProvider, type TierMuxModel } from "./src/lib/providers/tiermux-catalog";
import {
  TierMuxCloudProvider,
  createTierMuxProvider,
} from "./src/lib/providers/TierMuxCloudProvider";

const PORT = process.env.TIERMUX_PROXY_PORT || 11435;
const HOST = process.env.TIERMUX_PROXY_HOST || "0.0.0.0";

interface ProxyConfig {
  providerKeys: Record<string, string | string[]>;
  allowKeyless: boolean;
  maxFailovers: number;
}

function loadConfig(): ProxyConfig {
  const keys: Record<string, string | string[]> = {};

  // Check TIERMUX_PROVIDER_KEYS JSON env var first
  const jsonKeys = process.env.TIERMUX_PROVIDER_KEYS;
  if (jsonKeys) {
    try {
      const parsed = JSON.parse(jsonKeys);
      for (const [k, v] of Object.entries(parsed)) {
        keys[k] = v as string | string[];
      }
    } catch {
      console.error("[tiermux-proxy] Failed to parse TIERMUX_PROVIDER_KEYS, falling back to individual env vars");
    }
  }

  // Also check individual env vars as fallback
  const envMap: Record<string, string> = {
    OPENAI_API_KEY: "openai",
    ANTHROPIC_API_KEY: "anthropic",
    GOOGLE_API_KEY: "google-ai",
    GROQ_API_KEY: "groq",
    TOGETHER_API_KEY: "together",
    OPENROUTER_API_KEY: "openrouter",
    MISTRAL_API_KEY: "mistral",
    CEREBRAS_API_KEY: "cerebras",
    FIREWORKS_API_KEY: "fireworks",
    DEEPSEEK_API_KEY: "deepseek",
    XAI_API_KEY: "xai",
    COHERE_API_KEY: "cohere",
  };

  for (const [envVar, providerId] of Object.entries(envMap)) {
    if (process.env[envVar] && !keys[providerId]) {
      keys[providerId] = process.env[envVar]!;
    }
  }

  return {
    providerKeys: keys,
    allowKeyless: process.env.TIERMUX_ALLOW_KEYLESS !== "false",
    maxFailovers: parseInt(process.env.TIERMUX_MAX_FAILOVERS || "5", 10),
  };
}

function createServer() {
  const config = loadConfig();
  const provider = new TierMuxCloudProvider({
    defaultModel: process.env.TIERMUX_DEFAULT_MODEL || "gpt-4o-mini",
    providerKeys: config.providerKeys,
    allowKeyless: config.allowKeyless,
    maxFailovers: config.maxFailovers,
  });

  const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const path = url.pathname;

    // Health check
    if (path === "/health") {
      const health = await provider.checkHealth();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        status: health.healthy ? "ok" : "degraded",
        ...health,
        routingState: provider.getRoutingState(),
      }));
      return;
    }

    // List models (OpenAI-compatible)
    if (path === "/v1/models") {
      const models = await provider.getAvailableModels();
      const modelList = models.map((m) => ({
        id: `${m.cloudProvider}:${m.cloudModel}`,
        object: "model",
        owned_by: m.cloudProvider,
        permission: null,
        created: 0,
      }));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ object: "list", data: modelList }));
      return;
    }

    // Chat completions endpoint (OpenAI-compatible, streaming)
    if (path === "/v1/chat/completions" || path === "/chat/completions") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
        // Limit body size to 1MB
        if (body.length > 1024 * 1024) {
          res.writeHead(413, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Request body too large" }));
          req.destroy();
        }
      });

      await new Promise<void>((resolve) => {
        req.on("end", async () => {
          try {
            const parsed = JSON.parse(body || "{}");
            const messages = parsed.messages || [];
            const stream = parsed.stream ?? true;
            const model = parsed.model || "gpt-4o-mini";
            const temperature = parsed.temperature ?? 0.7;
            const maxTokens = parsed.max_tokens || parsed.max_completion_tokens || 512;

            if (!stream) {
              // Non-streaming: collect all chunks
              let fullText = "";
              let chunkCount = 0;

              try {
                for await (const chunk of provider.infer({
                  companion: {
                    name: "TierMux Proxy",
                    personality: [],
                    systemPrompt: parsed.system || "",
                    modelRef: { type: "cloud", cloudProvider: model.split(":")[0] || "auto", cloudModel: model },
                    contextLength: 128000,
                  },
                  messages: messages.map((m: any) => ({
                    role: m.role,
                    content: m.content,
                  })),
                  temperature,
                  maxTokens,
                  tools: parsed.tools,
                  topP: parsed.top_p,
                  stopSequences: parsed.stop,
                })) {
                  chunkCount++;
                  if (chunk.type === "content") {
                    fullText += chunk.content;
                  } else if (chunk.type === "tool_call") {
                    // Tool calls in non-streaming mode: append to output
                    fullText += `\n[Tool call: ${chunk.toolCall.function?.name || "unknown"}]\n`;
                  } else if (chunk.type === "error") {
                    res.writeHead(500, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: { message: chunk.error } }));
                    resolve();
                    return;
                  }
                }

                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({
                  id: `chatcmpl-${Date.now()}`,
                  object: "chat.completion",
                  created: Math.floor(Date.now() / 1000),
                  model: model,
                  choices: [{
                    index: 0,
                    message: { role: "assistant", content: fullText },
                    finish_reason: "stop",
                  }],
                  usage: {
                    prompt_tokens: Math.ceil(messages.join(" ").length / 4),
                    completion_tokens: Math.ceil(fullText.length / 4),
                    total_tokens: Math.ceil((messages.join(" ").length + fullText.length) / 4),
                  },
                }));
              } catch (err) {
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: { message: err instanceof Error ? err.message : String(err) } }));
              }
              resolve();
              return;
            }

            // Streaming response
            res.writeHead(200, {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              "Connection": "keep-alive",
            });

            const sendChunk = (data: any) => {
              res.write(`data: ${JSON.stringify(data)}\n\n`);
            };

            sendChunk({
              id: `chatcmpl-${Date.now()}`,
              object: "chat.completion.chunk",
              created: Math.floor(Date.now() / 1000),
              model,
              choices: [{ index: 0, delta: { role: "assistant", content: "" } }],
            });

            try {
              for await (const chunk of provider.infer({
                companion: {
                  name: "TierMux Proxy",
                  personality: [],
                  systemPrompt: parsed.system || "",
                  modelRef: { type: "cloud", cloudProvider: model.split(":")[0] || "auto", cloudModel: model },
                  contextLength: 128000,
                },
                messages: messages.map((m: any) => ({
                  role: m.role,
                  content: m.content,
                })),
                temperature,
                maxTokens,
                tools: parsed.tools,
                topP: parsed.top_p,
                stopSequences: parsed.stop,
              })) {
                if (chunk.type === "content") {
                  sendChunk({
                    choices: [{ index: 0, delta: { content: chunk.content } }],
                  });
                } else if (chunk.type === "tool_call") {
                  sendChunk({
                    choices: [{
                      index: 0,
                      delta: {
                        tool_calls: [chunk.toolCall],
                      },
                    }],
                  });
                } else if (chunk.type === "done") {
                  sendChunk({
                    choices: [{ index: 0, finish_reason: "stop", delta: {} }],
                  });
                  res.end();
                  resolve();
                  return;
                } else if (chunk.type === "error") {
                  sendChunk({
                    choices: [{
                      index: 0,
                      finish_reason: "error",
                      delta: { content: "" },
                    }],
                    error: { message: chunk.error },
                  });
                  res.end();
                  resolve();
                  return;
                }
              }
            } catch (err) {
              sendChunk({
                choices: [{ index: 0, finish_reason: "error", delta: { content: "" } }],
                error: { message: err instanceof Error ? err.message : String(err) },
              });
              res.end();
            }

            res.end();
            resolve();
          } catch (parseErr) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: { message: "Invalid JSON body" } }));
            resolve();
          }
        });
      });

      return;
    }

    // Unknown endpoint
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: "Not found" } }));
  });

  return { server, provider };
}

// Start server
const { server, provider } = createServer();

server.listen(parseInt(PORT as string), HOST, () => {
  const health = provider.getRoutingState();
  console.log(`[tiermux-proxy] TierMux proxy server running on http://${HOST}:${PORT}`);
  console.log(`[tiermux-proxy] OpenAI-compatible endpoints:`);
  console.log(`  - GET  /health          (health check + routing state)`);
  console.log(`  - GET  /v1/models       (list available models)`);
  console.log(`  - POST /v1/chat/completions`);
  console.log(`[tiermux-proxy] Configured providers: ${Object.keys(loadConfig().providerKeys).join(", ") || "keyless only"}`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("[tiermux-proxy] Shutting down...");
  server.close(() => {
    provider.resetRoutingState();
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("\n[tiermux-proxy] Shutting down...");
  server.close(() => {
    provider.resetRoutingState();
    process.exit(0);
  });
});
