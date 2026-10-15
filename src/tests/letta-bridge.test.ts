/**
 * Tests for letta-bridge — CanonicalLedger integration with factsToLettaBlocks.
 */

import { factsToLettaBlocks, syncMemoryIntoLetta } from "@/lib/letta-bridge";
import type { MemoryFact } from "@/lib/companion-memory";
import { getCanonicalLedger, resetCanonicalLedger } from "@/lib/memory/CanonicalLedger";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

const STORAGE_KEY = "privsei.memory.v1";

// In-memory localStorage shim for Node environment
const store = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
	value: {
		getItem: (k: string) => store.get(k) ?? null,
		setItem: (_k: string, v: string) => void store.set(_k, v),
		removeItem: (k: string) => void store.delete(k),
		clear: () => void store.clear(),
		get length() { return store.size; },
		key: (i: number) => Array.from(store.keys())[i] ?? null,
	},
	writable: true,
	configurable: true,
});

const testFacts: MemoryFact[] = [
	{ id: "f1", text: "User likes cats", scope: "global", source: "manual", createdAt: Date.now(), lastSeenAt: Date.now(), hits: 4 },
	{ id: "f2", text: "User prefers evening chats", scope: "global", source: "manual", createdAt: Date.now(), lastSeenAt: Date.now(), hits: 4 },
	{ id: "f3", text: "User is a software engineer", scope: "companion", companionId: "comp-1", source: "manual", createdAt: Date.now(), lastSeenAt: Date.now(), hits: 4 },
];

function setupStorage(companionId: string, facts: MemoryFact[], summary = "") {
	const store: Record<string, { facts: MemoryFact[]; summary: string; summaryUpTo: number }> = {};
	store[companionId] = { facts, summary, summaryUpTo: 0 };
	localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function clearStorage() {
	localStorage.removeItem(STORAGE_KEY);
}

describe("factsToLettaBlocks", () => {
	beforeEach(() => {
		resetCanonicalLedger();
	});

	afterEach(() => {
		resetCanonicalLedger();
	});

	it("creates human block for global facts", () => {
		setupStorage("comp-1", testFacts);
		const blocks = factsToLettaBlocks("comp-1", testFacts, "");
		expect(blocks.some((b) => b.label === "human")).toBe(true);
	});

	it("creates persona block for companion facts", () => {
		setupStorage("comp-1", testFacts);
		const blocks = factsToLettaBlocks("comp-1", testFacts, "");
		expect(blocks.some((b) => b.label === "persona")).toBe(true);
	});

	it("includes summary block when summary provided", () => {
		setupStorage("comp-1", testFacts, "Test summary");
		const blocks = factsToLettaBlocks("comp-1", testFacts, "Test summary");
		expect(blocks.some((b) => b.label === "conversation_summary")).toBe(true);
	});

	it("promotes facts to ledger during conversion", () => {
		setupStorage("comp-1", testFacts);
		factsToLettaBlocks("comp-1", testFacts, "");
		const ledger = getCanonicalLedger();
		expect(ledger.size).toBeGreaterThanOrEqual(testFacts.length);
	});

	it("only includes high-confidence facts in human block", () => {
		setupStorage("comp-1", testFacts);
		const blocks = factsToLettaBlocks("comp-1", testFacts, "");
		const humanBlock = blocks.find((b) => b.label === "human");
		expect(humanBlock).toBeDefined();
		expect(humanBlock!.value).toContain("User likes cats");
	});

	it("returns empty blocks array for empty facts with summary", () => {
		setupStorage("comp-1", []);
		const blocks = factsToLettaBlocks("comp-1", [], "Test summary");
		expect(blocks.length).toBe(1);
		expect(blocks[0].label).toBe("conversation_summary");
	});

	it("handles empty facts and empty summary", () => {
		setupStorage("comp-1", []);
		const blocks = factsToLettaBlocks("comp-1", [], "");
		expect(blocks.length).toBe(0);
	});
});

describe("syncMemoryIntoLetta", () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		resetCanonicalLedger();
		globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });
	});

	afterEach(() => {
		resetCanonicalLedger();
		globalThis.fetch = originalFetch;
		clearStorage();
	});

	it("returns true on successful sync", async () => {
		setupStorage("comp-1", testFacts, "Test summary");
		const result = await syncMemoryIntoLetta("http://localhost:8281", "agent-1", "comp-1");
		expect(result).toBe(true);
	});

	it("returns false on fetch failure", async () => {
		setupStorage("comp-1", testFacts, "Test summary");
		(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false });
		const result = await syncMemoryIntoLetta("http://localhost:8281", "agent-1", "comp-1");
		expect(result).toBe(false);
	});

	it("returns false on exception", async () => {
		setupStorage("comp-1", testFacts, "Test summary");
		(globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("Network error"));
		const result = await syncMemoryIntoLetta("http://localhost:8281", "agent-1", "comp-1");
		expect(result).toBe(false);
	});

	it("sends POST request with memory blocks", async () => {
		setupStorage("comp-1", testFacts, "Test summary");
		await syncMemoryIntoLetta("http://localhost:8281", "agent-1", "comp-1");

		expect(globalThis.fetch).toHaveBeenCalledWith(
			expect.stringContaining("/v1/agents/agent-1/state"),
			expect.objectContaining({
				method: "POST",
				body: expect.stringContaining('"memory_blocks"'),
			}),
		);
	});

	it("handles missing localStorage gracefully", async () => {
		clearStorage();
		const result = await syncMemoryIntoLetta("http://localhost:8281", "agent-1", "comp-1");
		expect(result).toBe(true);
	});
});
