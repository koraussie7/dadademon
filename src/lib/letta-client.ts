/**
 * Letta AI client — connects to a self-hosted Letta OSS server
 * (https://github.com/letta-ai/letta).
 *
 * Letta provides persistent-memory LLM agents. This client wraps the REST API
 * and follows the same localStorage-persistence pattern as NexusClient.
 *
 * Inference chain position: Tier 1d (after Colibri WASM, before Cloud API).
 * Letta agents are self-hosted (localhost:8281) — if the server is reachable,
 * the agent's memory-augmented responses take priority over stateless cloud APIs.
 */

import type {
	LettaAgent,
	LettaCheckpoint,
	LettaConfig,
	LettaSendMessageRequest,
	LettaSendMessageResponse,
} from "@/types/letta";

export type { LettaConfig, LettaAgent, LettaCheckpoint, LettaSendMessageResponse };

const STORAGE_KEY_CONFIG = "privseai_letta_config";
const STORAGE_KEY_AGENT = "privseai_letta_agent";

/** Default Letta OSS server URL. */
export const LETTA_DEFAULT_BASE = "http://localhost:8281";

export function generateAgentId(name: string): string {
	return `companion_${name.toLowerCase().replace(/[^a-z0-9]/g, "_")}_${Date.now().toString(36)}`;
}

export function validateLettaUrl(url: string): { valid: boolean; error?: string } {
	try {
		const parsed = new URL(url);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
			return { valid: false, error: "URL must use http or https protocol" };
		}
		if (!parsed.hostname) {
			return { valid: false, error: "URL must include a hostname" };
		}
		return { valid: true };
	} catch {
		return { valid: false, error: "Invalid URL format" };
	}
}

export interface LettaConnectionStatus {
	online: boolean;
	version?: string;
	agents?: string[];
	error?: string;
}

export interface LettaStreamChunk {
	content: string;
	done: boolean;
}

export interface LettaChatResult {
	id: string;
	reply: string;
	usage?: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
	error?: string;
}

export class LettaClient {
	private config: LettaConfig;
	private abortController: AbortController | null = null;

	constructor(config: LettaConfig) {
		this.config = { ...config, baseUrl: config.baseUrl.replace(/\/$/, "") };
	}

	getConfig(): LettaConfig {
		return this.config;
	}

	get headers(): Record<string, string> {
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};
		if (this.config.apiKey) {
			headers.Authorization = `Bearer ${this.config.apiKey}`;
		}
		return headers;
	}

	get abortSignal(): AbortSignal | undefined {
		return this.abortController?.signal;
	}

	private buildUrl(path: string): string {
		return `${this.config.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
	}

	async checkConnection(): Promise<LettaConnectionStatus> {
		try {
			const res = await fetch(this.buildUrl("/v1/agents/"), {
				method: "GET",
				headers: this.headers,
				signal: AbortSignal.timeout(5000),
			});

			if (!res.ok) {
				const body = await res.text().catch(() => "");
				return { online: false, error: `HTTP ${res.status}: ${body}` };
			}

			const data = (await res.json().catch(() => [])) as LettaAgent[];
			const agentIds = Array.isArray(data) ? data.map((a) => a.id) : [];

			return { online: true, agents: agentIds };
		} catch (err) {
			return {
				online: false,
				error: err instanceof Error ? err.message : String(err),
			};
		}
	}

	async createAgent(request: {
		name?: string;
		memory_blocks?: Array<{
			label: string;
			value: string;
			persisted?: boolean;
		}>;
		system_prompt?: string;
		llm_config?: {
			model: string;
			model_endpoint?: string;
			model_endpoint_type?: string;
			api_key?: string;
		};
		memory_guard?: boolean;
		identity_id?: string;
	}): Promise<LettaAgent | null> {
		try {
			const res = await fetch(this.buildUrl("/v1/agents/"), {
				method: "POST",
				headers: this.headers,
				signal: AbortSignal.timeout(10000),
				body: JSON.stringify({
					name: request.name,
					memory_blocks: request.memory_blocks?.map((b) => ({
						label: b.label,
						value: b.value,
						persisted: b.persisted ?? true,
					})),
					system_prompt: request.system_prompt,
					llm_config: request.llm_config,
					metadata: {
						memory_guard: request.memory_guard ?? true,
						...(request.identity_id
							? { identity_id: request.identity_id }
							: {}),
					},
				}),
			});

			if (!res.ok) return null;

			const agent = (await res.json().catch(() => null)) as LettaAgent | null;
			if (agent?.id) {
				this.saveActiveAgent(agent.id);
			}
			return agent;
		} catch {
			return null;
		}
	}

	async getAgent(agentId: string): Promise<LettaAgent | null> {
		try {
			const res = await fetch(this.buildUrl(`/v1/agents/${agentId}`), {
				method: "GET",
				headers: this.headers,
				signal: AbortSignal.timeout(5000),
			});

			if (!res.ok) return null;
			return (await res.json().catch(() => null)) as LettaAgent | null;
		} catch {
			return null;
		}
	}

	async listAgents(): Promise<LettaAgent[]> {
		try {
			const res = await fetch(this.buildUrl("/v1/agents/"), {
				method: "GET",
				headers: this.headers,
				signal: AbortSignal.timeout(5000),
			});

			if (!res.ok) return [];
			const data = (await res.json().catch(() => [])) as unknown;
			return Array.isArray(data) ? (data as LettaAgent[]) : [];
		} catch {
			return [];
		}
	}

	async sendMessage(
		agentId: string,
		messages: Array<{ role: string; content: string }>,
		stream = false,
	): Promise<LettaChatResult> {
		const requestBody: LettaSendMessageRequest = {
			messages: messages.map((m) => ({
				id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
				actor: m.role as LettaSendMessageRequest["messages"][number]["actor"],
				content: m.content,
				created_at: new Date().toISOString(),
			})),
			stream,
		};

		if (stream) {
			return this.sendMessageStream(agentId, requestBody);
		}

		try {
			const res = await fetch(this.buildUrl(`/v1/agents/${agentId}/messages`), {
				method: "POST",
				headers: this.headers,
				signal: AbortSignal.timeout(30000),
				body: JSON.stringify(requestBody),
			});

			if (!res.ok) {
				const body = await res.text().catch(() => "");
				return { id: "", reply: "", error: `HTTP ${res.status}: ${body}` };
			}

			const data = (await res.json().catch(() => null)) as LettaSendMessageResponse | null;

			if (!data) {
				return { id: "", reply: "", error: "Empty response" };
			}

			const reply = data.messages?.[data.messages.length - 1]?.content ?? "";
			return {
				id: data.messages?.[data.messages.length - 1]?.id ?? "",
				reply,
				usage: data.usage,
			};
		} catch (err) {
			return {
				id: "",
				reply: "",
				error: err instanceof Error ? err.message : String(err),
			};
		}
	}

	private async sendMessageStream(
		agentId: string,
		requestBody: LettaSendMessageRequest,
	): Promise<LettaChatResult> {
		try {
			const res = await fetch(this.buildUrl(`/v1/agents/${agentId}/messages`), {
				method: "POST",
				headers: this.headers,
				signal: AbortSignal.timeout(30000),
				body: JSON.stringify({ ...requestBody, stream: true }),
			});

			if (!res.ok) {
				const body = await res.text().catch(() => "");
				return { id: "", reply: "", error: `HTTP ${res.status}: ${body}` };
			}

			if (!res.body) {
				return { id: "", reply: "", error: "No response body" };
			}

			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";
			let reply = "";
			let messageId = "";

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split("\n");
				buffer = lines.pop() ?? "";

				for (const line of lines) {
					const trimmed = line.trim();
					if (!trimmed) continue;
					if (trimmed.startsWith(":")) continue;

					const prefix = trimmed.startsWith("data: ") ? trimmed.slice(6) : trimmed;
					if (prefix === "[DONE]" || prefix === "") continue;

					try {
						const chunk = JSON.parse(prefix) as {
							id?: string;
							content?: string;
							choices?: Array<{ delta?: { content?: string } }>;
						};

						if (chunk.id && !messageId) messageId = chunk.id;
						const delta = chunk.choices?.[0]?.delta?.content;
						if (delta) reply += delta;
					} catch {
						/* skip unparseable SSE lines */
					}
				}
			}

			return { id: messageId, reply };
		} catch (err) {
			return {
				id: "",
				reply: "",
				error: err instanceof Error ? err.message : String(err),
			};
		}
	}

	async createCheckpoint(agentId: string): Promise<LettaCheckpoint | null> {
		try {
			const res = await fetch(this.buildUrl(`/v1/agents/${agentId}/checkpoint`), {
				method: "POST",
				headers: this.headers,
				signal: AbortSignal.timeout(10000),
			});

			if (!res.ok) return null;
			return (await res.json().catch(() => null)) as LettaCheckpoint | null;
		} catch {
			return null;
		}
	}

	async deleteAgent(agentId: string): Promise<boolean> {
		try {
			const res = await fetch(this.buildUrl(`/v1/agents/${agentId}`), {
				method: "DELETE",
				headers: this.headers,
				signal: AbortSignal.timeout(5000),
			});
			return res.ok;
		} catch {
			return false;
		}
	}

	saveActiveAgent(agentId: string): void {
		const ls = typeof globalThis.localStorage !== "undefined" ? globalThis.localStorage : null;
		if (!ls) return;
		try {
			ls.setItem(STORAGE_KEY_AGENT, agentId);
		} catch {
			/* quota — skip */
		}
	}

	getActiveAgent(): string | null {
		const ls = typeof globalThis.localStorage !== "undefined" ? globalThis.localStorage : null;
		if (!ls) return null;
		try {
			return ls.getItem(STORAGE_KEY_AGENT);
		} catch {
			return null;
		}
	}

	saveConfig(config: LettaConfig): void {
		this.config = { ...config, baseUrl: config.baseUrl.replace(/\/$/, "") };
		const ls = typeof globalThis.localStorage !== "undefined" ? globalThis.localStorage : null;
		if (!ls) return;
		try {
			ls.setItem(STORAGE_KEY_CONFIG, JSON.stringify(this.config));
		} catch {
			/* quota — skip */
		}
	}

	static loadConfig(): LettaConfig | null {
		const ls = typeof globalThis.localStorage !== "undefined" ? globalThis.localStorage : null;
		if (!ls) return null;
		const raw = ls.getItem(STORAGE_KEY_CONFIG);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as LettaConfig;
		return { ...parsed, baseUrl: parsed.baseUrl.replace(/\/$/, "") };
	}

	static getConfigFromEnv(): LettaConfig {
		const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env ?? {};
		return {
			baseUrl: env.VITE_LETTA_URL ?? LETTA_DEFAULT_BASE,
			apiKey: env.VITE_LETTA_API_KEY,
			enabled: env.VITE_LETTA_ENABLED !== "false",
		};
	}
}
