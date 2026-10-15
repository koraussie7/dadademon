/**
 * Letta ↔ Companion memory bridge.
 *
 * Bridges Letta AI's memory blocks (human, persona, custom) with
 * privseai.com's MemoryEntry type (used by P2PMemorySync and companion-memory).
 *
 * This enables:
 * 1. Exporting companion facts → Letta memory blocks (human block)
 * 2. Importing Letta agent memory → companion memory entries for P2P sync
 * 3. Two-way memory sync between localStorage facts and Letta agent state
 */

import { type MemoryFact, getAllFacts } from "@/lib/companion-memory";
import { getCanonicalLedger } from "@/lib/memory/CanonicalLedger";
import { type LedgerEntryInput } from "@/lib/memory/CanonicalLedger";
import type { LettaAgentState, LettaMemoryBlock } from "@/types/letta";
import type { MemoryEntry } from "@/types/unified";

/**
 * Convert privseai.com companion facts (from localStorage) into Letta memory
 * blocks suitable for agent creation.
 *
 * Maps:
 * - Global facts → "human" block (user preferences, traits)
 * - Companion facts → "persona" block (relationship-specific info)
 * - Auto-summary → "summary" block
 */
export function factsToLettaBlocks(
	companionId: string,
	facts: MemoryFact[],
	summary: string,
): LettaMemoryBlock[] {
	const ledger = getCanonicalLedger();

	for (const fact of facts) {
		const input: LedgerEntryInput = {
			id: `${companionId}-${fact.id}`,
			text: fact.text,
			scope: fact.scope,
			source: "user",
		};
		ledger.add(input);
		for (let i = 0; i < fact.hits; i++) {
			ledger.corroborate(input.id);
		}
	}

	const highConfidence = ledger.promote(companionId);
	const humanFacts = highConfidence.filter((e) => e.scope === "global");
		const companionFacts = highConfidence.filter(
		(e) => e.scope === "companion" && e.id.startsWith(`${companionId}-`),
	);

	const blocks: LettaMemoryBlock[] = [];

	if (humanFacts.length > 0) {
		blocks.push({
			label: "human",
			value: humanFacts.map((f) => `- ${f.text}`).join("\n"),
			persisted: true,
			type: "human",
		});
	}

	if (companionFacts.length > 0) {
		blocks.push({
			label: "persona",
			value: companionFacts.map((f) => `- ${f.text}`).join("\n"),
			persisted: true,
			type: "persona",
		});
	}

	if (summary) {
		blocks.push({
			label: "conversation_summary",
			value: summary,
			persisted: true,
			type: "custom",
		});
	}

	return blocks;
}

/**
 * Convert Letta agent memory blocks into privseai.com MemoryEntry[] so they
 * can participate in P2P sync via P2PMemorySync.
 */
export function lettaBlocksToMemoryEntries(
	agentId: string,
	blocks: LettaMemoryBlock[],
): MemoryEntry[] {
	return blocks.flatMap((block) => {
		const lines = block.value
			.split("\n")
			.map((l) => l.trim())
			.filter(Boolean);

		return lines.map((line, idx) => ({
			id: `${agentId}-${block.label}-${idx}-${Date.now()}`,
			type: blockToMemoryType(block.label),
			content: line,
			importance: block.label === "human" ? 10 : block.label === "persona" ? 8 : 5,
			tags: [block.label, block.type ?? "custom"],
			createdAt: Date.now(),
			lastAccessedAt: Date.now(),
			accessCount: 0,
			source: "system" as const,
			relatedCompanionId: agentId,
		}));
	});
}

function blockToMemoryType(label: string): MemoryEntry["type"] {
	switch (label) {
		case "human":
			return "fact";
		case "persona":
			return "preference";
		default:
			return "fact";
	}
}

/**
 * Sync privseai.com companion memory (localStorage) into a Letta agent's
 * human/persona memory blocks via the Letta state upsert API.
 */
export async function syncMemoryIntoLetta(
	lettaBaseUrl: string,
	agentId: string,
	companionId: string,
): Promise<boolean> {
	try {
		const safeLocalStorage = typeof localStorage !== "undefined" ? localStorage : null;
		const facts = getAllFacts(companionId);
		const store = safeLocalStorage
			? JSON.parse(safeLocalStorage.getItem("privsei.memory.v1") ?? "{}") as Record<
					string,
					{ summary: string }
				>
			: {};
		const summary = store[companionId]?.summary ?? "";

		const blocks = factsToLettaBlocks(companionId, facts, summary);

		const response = await fetch(`${lettaBaseUrl.replace(/\/$/, "")}/v1/agents/${agentId}/state`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				memory_blocks: blocks,
			}),
		});

		return response.ok;
	} catch {
		return false;
	}
}

/**
 * Pull memory from a Letta agent state and merge into companion memory
 * (localStorage facts). Useful for importing memories created in Letta
 * back into the privseai.com P2P sync system.
 */
export async function syncLettaToMemory(
	lettaBaseUrl: string,
	apiKey: string | undefined,
	companionId: string,
	_companionName?: string,
): Promise<MemoryEntry[]> {
	try {
		const stored = localStorage.getItem(`privseai_letta_agent_${companionId}`);
		if (!stored) return [];

		const headers: Record<string, string> = { "Content-Type": "application/json" };
		if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

		const res = await fetch(`${lettaBaseUrl.replace(/\/$/, "")}/v1/agents/${stored}/state`, {
			method: "GET",
			headers,
			signal: AbortSignal.timeout(10000),
		});

		if (!res.ok) return [];

		const state = (await res.json().catch(() => null)) as LettaAgentState | null;
		if (!state?.memory_blocks) return [];

		const entries = lettaBlocksToMemoryEntries(stored, state.memory_blocks);

		// Store in localStorage for P2PMemorySync consumption
		try {
			const existing = JSON.parse(
				localStorage.getItem("privsei.letta_memory.v1") ?? "{}",
			) as Record<string, MemoryEntry[]>;
			existing[companionId] = [...(existing[companionId] ?? []), ...entries];
			localStorage.setItem("privsei.letta_memory.v1", JSON.stringify(existing));
		} catch {
			/* quota — skip */
		}

		return entries;
	} catch {
		return [];
	}
}

/**
 * Extract a brief companion description from Letta agent's memory blocks
 * for display in UI.
 */
export function getLettaCompanionSummary(blocks: LettaMemoryBlock[]): {
	persona?: string;
	lastSummary?: string;
} {
	const persona = blocks.find((b) => b.label === "persona");
	const summary =
		blocks.find((b) => b.label === "conversation_summary") ??
		blocks.find((b) => b.label === "summary");

	return {
		persona: persona?.value.slice(0, 200),
		lastSummary: summary?.value.slice(0, 200),
	};
}
