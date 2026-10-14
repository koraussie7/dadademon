/**
 * Letta AI (formerly MemGPT) type definitions.
 *
 * Models the REST API surface of Letta OSS (https://github.com/letta-ai/letta).
 * Letta is an open-source framework for building LLM agents with persistent
 * memory. This module maps Letta concepts to privseai.com's unified types.
 *
 * API surface (self-hosted Letta OSS, default port :8281):
 *   POST   /v1/agents/                       — create agent
 *   GET    /v1/agents/{agent_id}             — get agent
 *   GET    /v1/agents/                       — list agents
 *   DELETE /v1/agents/{agent_id}             — delete agent
 *   POST   /v1/agents/{agent_id}/messages    — send message (chat)
 *   GET    /v1/agents/{agent_id}/messages    — list messages
 *   POST   /v1/agents/{agent_id}/state       — upsert agent state
 *   GET    /v1/agents/{agent_id}/state       — get agent state
 *   POST   /v1/agents/{agent_id}/checkpoint  — create checkpoint
 */

export interface LettaConfig {
	baseUrl: string;
	apiKey?: string;
	enabled: boolean;
}

export interface LettaMemoryBlock {
	label: string;
	value: string;
	persisted: boolean;
	type?: "human" | "persona" | "custom" | "system";
}

export interface LettaLLMConfig {
	model: string;
	model_endpoint?: string;
	model_endpoint_type?: "openai" | "anthropic" | "azure" | "ollama" | "bedrock";
	api_key?: string;
	context_window?: number;
	max_tokens?: number;
	temperature?: number;
	top_p?: number;
}

export interface LettaTool {
	name: string;
	description: string;
	parameters: {
		type: "function";
		properties: Record<string, unknown>;
		required?: string[];
	};
}

export interface LettaAgent {
	id: string;
	manager?: string;
	llm_config: LettaLLMConfig;
	memory_blocks: LettaMemoryBlock[];
	tools?: LettaTool[];
	system_prompt?: string;
	metadata?: Record<string, unknown>;
}

export interface LettaMessage {
	id: string;
	actor: "human" | "assistant" | "system" | "tool";
	content: string;
	tool_call?: {
		name: string;
		arguments: Record<string, unknown>;
	};
	tool_result?: {
		status: "success" | "error";
		output: string;
	};
	created_at: string;
}

export interface LettaAgentState {
	messages: LettaMessage[];
	memory_blocks: LettaMemoryBlock[];
	llm_config: LettaLLMConfig;
}

export interface LettaCheckpoint {
	id: string;
	agent_id: string;
	created_at: string;
	metadata?: Record<string, unknown>;
}

export interface LettaCreateAgentRequest {
	name?: string;
	memory_blocks?: LettaMemoryBlock[];
	llm_config: LettaLLMConfig;
	tools?: LettaTool[];
	system_prompt?: string;
	metadata?: Record<string, unknown>;
	identity_id?: string;
	/**
	 * When true, the agent's memory blocks are never auto-summarized or
	 * auto-reorganized by Letta's background consolidation loop. Required
	 * to satisfy GENOME.md's "Dream Engine OFF" invariant: stored memory
	 * must remain verbatim, never rewritten by background LLM processes.
	 */
	memory_guard?: boolean;
}

export interface LettaSendMessageRequest {
	messages: LettaMessage[];
	stream?: boolean;
	step_limit?: number;
	recall_limit?: number;
}

export interface LettaSendMessageResponse {
	messages: LettaMessage[];
	usage?: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
	error?: string;
}

export interface LettaGatewayInfo {
	baseUrl: string;
	agentId: string;
	peerId: string;
	region: string;
	capabilities: {
		models: string[];
		memory: boolean;
		tools: boolean;
	};
	timestamp: number;
	isPublic: boolean;
}
