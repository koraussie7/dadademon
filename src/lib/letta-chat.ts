/**
 * Letta AI chat integration — connects to a self-hosted Letta OSS server
 * (https://github.com/letta-ai/letta) for memory-augmented inference.
 *
 * Letta agents maintain persistent memory blocks (human, persona, custom)
 * that are automatically injected into the LLM context. This wrapper
 * bridges Letta's agent-based chat with privseai.com's companion model.
 *
 * Inference chain position: Tier 1d (after Colibri WASM, before Cloud API).
 */

import { LettaClient, generateAgentId } from "@/lib/letta-client";
import type { LettaConfig } from "@/types/letta";

export interface LettaChatResult {
	reply: string | null;
	error?: string;
}

function getLettaConfig(): LettaConfig | null {
	const saved = LettaClient.loadConfig();
	if (saved) return saved;
	return LettaClient.getConfigFromEnv();
}

function getAgentName(companionId: string, companionName: string): string {
	return `${companionName}_${generateAgentId(companionId)}`;
}

/**
 * Try to chat using a Letta agent for the given companion.
 * The agent is auto-created on first use if a Letta server is reachable.
 * Returns { reply: null } if Letta is not configured or offline.
 */
export async function tryLettaChat(
	companionId: string,
	companionName: string,
	text: string,
	systemPrompt: string,
	history: Array<{ role: "user" | "assistant"; content: string }>,
	p2pBaseUrl?: string,
): Promise<LettaChatResult> {
	const localConfig = getLettaConfig();
	if (!localConfig || !localConfig.enabled) {
		return { reply: null, error: "Letta not configured" };
	}

	// Use P2P-discovered peer URL if available, otherwise local config
	const baseUrl = p2pBaseUrl ?? localConfig.baseUrl;
	const client = new LettaClient({ ...localConfig, baseUrl });

	// Check connection first
	const status = await client.checkConnection();
	if (!status.online) {
		return { reply: null, error: status.error ?? "Letta server offline" };
	}

	// Find or create agent for this companion
	let agentId = localStorage.getItem(`privseai_letta_agent_${companionId}`) ?? null;

	if (!agentId) {
		// Create a new agent with the companion's system prompt and memory blocks
		const agent = await client.createAgent({
			name: getAgentName(companionId, companionName),
			memory_blocks: [
				{
					label: "human",
					value: systemPrompt,
					persisted: true,
				},
			],
			system_prompt: systemPrompt,
			llm_config: {
				model: "gpt-4o-mini",
			},
		});

		if (!agent?.id) {
			return { reply: null, error: "Failed to create Letta agent" };
		}

		agentId = agent.id;
		try {
			localStorage.setItem(`privseai_letta_agent_${companionId}`, agentId);
		} catch {
			/* quota — skip */
		}
	}

	// Build messages for Letta
	const messages = [
		{ role: "system" as const, content: systemPrompt },
		...history.map((h) => ({
			role: h.role as "user" | "assistant",
			content: h.content,
		})),
		{ role: "user" as const, content: text },
	];

	const result = await client.sendMessage(agentId, messages, false);

	if (result.error) {
		return { reply: null, error: result.error };
	}

	if (result.reply) {
		return { reply: result.reply.trim() };
	}

	return { reply: null, error: "Empty response from Letta" };
}

/**
 * Streaming chat with Letta agent.
 */
export async function* tryLettaChatStream(
	companionId: string,
	companionName: string,
	text: string,
	systemPrompt: string,
	history: Array<{ role: "user" | "assistant"; content: string }>,
): AsyncGenerator<{ content: string; done: boolean }, void, unknown> {
	const config = getLettaConfig();
	if (!config || !config.enabled) {
		yield { content: "", done: true };
		return;
	}

	const client = new LettaClient(config);

	const status = await client.checkConnection();
	if (!status.online) {
		yield { content: "", done: true };
		return;
	}

	let agentId = localStorage.getItem(`privseai_letta_agent_${companionId}`) ?? null;

	if (!agentId) {
		const agent = await client.createAgent({
			name: getAgentName(companionId, companionName),
			memory_blocks: [{ label: "human", value: systemPrompt, persisted: true }],
			system_prompt: systemPrompt,
			llm_config: { model: "gpt-4o-mini" },
		});
		if (!agent?.id) {
			yield { content: "", done: true };
			return;
		}
		agentId = agent.id;
		try {
			localStorage.setItem(`privseai_letta_agent_${companionId}`, agentId);
		} catch {
			/* quota — skip */
		}
	}

	const messages = [
		{ role: "system" as const, content: systemPrompt },
		...history.map((h) => ({
			role: h.role as "user" | "assistant",
			content: h.content,
		})),
		{ role: "user" as const, content: text },
	];

	const result = await client.sendMessage(agentId, messages, true);

	if (result.error) {
		yield { content: "", done: true };
		return;
	}

	if (result.reply) {
		yield { content: result.reply, done: true };
	} else {
		yield { content: "", done: true };
	}
}
