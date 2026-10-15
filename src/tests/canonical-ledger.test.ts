/**
 * Tests for CanonicalLedger — confidence-scored memory store.
 */

import { CanonicalLedger, getCanonicalLedger, resetCanonicalLedger, type LedgerEntryInput } from "@/lib/memory/CanonicalLedger";
import { describe, expect, it, beforeEach, afterEach } from "vitest";

const makeInput = (id: string, text: string, source: LedgerEntryInput["source"] = "user"): LedgerEntryInput => ({
	id,
	text,
	scope: "global",
	source,
});

describe("CanonicalLedger", () => {
	let ledger: CanonicalLedger;

	beforeEach(() => {
		resetCanonicalLedger();
		ledger = new CanonicalLedger();
	});

	afterEach(() => {
		ledger.clear();
	});

	describe("add", () => {
		it("adds a new entry with initial confidence", () => {
			const entry = ledger.add(makeInput("1", "Test fact"));
			expect(entry.id).toBe("1");
			expect(entry.text).toBe("Test fact");
			expect(entry.confidence).toBeGreaterThanOrEqual(0.4);
			expect(entry.confidence).toBeLessThanOrEqual(1.0);
			expect(entry.isActive).toBe(true);
			expect(entry.corroborations).toBe(0);
			expect(entry.contradictions).toBe(0);
		});

		it("deduplicates by id and increments access count", () => {
			const first = ledger.add(makeInput("1", "Original"));
			const second = ledger.add(makeInput("1", "Updated"));

			expect(second.text).toBe("Updated");
			expect(second.accessCount).toBe(2);
			expect(second.createdAt).toBe(first.createdAt);
		});
	});

	describe("corroborate", () => {
		it("increases confidence and access count", () => {
			ledger.add(makeInput("1", "Test fact"));
			const entry = ledger.corroborate("1");

			expect(entry).not.toBeNull();
			expect(entry!.corroborations).toBe(1);
			expect(entry!.accessCount).toBe(2);
			expect(entry!.confidence).toBeGreaterThan(0.5);
		});

		it("returns null for non-existent id", () => {
			expect(ledger.corroborate("nonexistent")).toBeNull();
		});
	});

	describe("contradict", () => {
		it("decreases confidence and may deactivate", () => {
			ledger.add(makeInput("1", "Test fact", "observation"));
			const entry = ledger.contradict("1");

			expect(entry).not.toBeNull();
			expect(entry!.contradictions).toBe(1);
			expect(entry!.accessCount).toBe(2);
		});
	});

	describe("promote", () => {
		it("returns high-confidence active entries", () => {
			ledger.add(makeInput("1", "Fact 1"));
			ledger.corroborate("1");
			ledger.corroborate("1");
			ledger.corroborate("1");

			const promoted = ledger.promote();
			expect(promoted.some((e) => e.id === "1")).toBe(true);
		});

		it("filters by companionId for companion scope", () => {
			ledger.add({ id: "global-1", text: "Global fact", scope: "global", source: "user" });
			ledger.add({ id: "comp-1", text: "Companion fact for abc", scope: "companion", source: "user" });

			ledger.corroborate("global-1");
			ledger.corroborate("global-1");
			ledger.corroborate("global-1");
			ledger.corroborate("comp-1");
			ledger.corroborate("comp-1");
			ledger.corroborate("comp-1");

			const promoted = ledger.promote("abc");
			expect(promoted.some((e) => e.id === "global-1")).toBe(true);
			expect(promoted.some((e) => e.id === "comp-1")).toBe(true);
		});
	});

	describe("demote", () => {
		it("returns low-confidence entries that were active", () => {
			ledger.add(makeInput("1", "Test fact", "observation"));
			ledger.contradict("1");
			ledger.contradict("1");
			ledger.contradict("1");

			const demoted = ledger.demote();
			expect(demoted.length).toBeGreaterThanOrEqual(1);
			const entry = ledger.get("1");
			expect(entry?.isActive).toBe(false);
		});
	});

	describe("reconcile", () => {
		it("returns both promoted and demoted entries", () => {
			ledger.add(makeInput("high", "High conf fact"));
			ledger.corroborate("high");
			ledger.corroborate("high");
			ledger.corroborate("high");
			ledger.corroborate("high");

			ledger.add(makeInput("low", "Low conf fact", "observation"));
			ledger.contradict("low");
			ledger.contradict("low");
			ledger.contradict("low");

			const result = ledger.reconcile();
			expect(result.promoted.some((e) => e.id === "high")).toBe(true);
			expect(result.demoted.some((e) => e.id === "low")).toBe(true);
		});
	});

	describe("get & getAll", () => {
		it("gets entry by id", () => {
			ledger.add(makeInput("1", "Fact"));
			const entry = ledger.get("1");
			expect(entry?.text).toBe("Fact");
		});

		it("returns undefined for non-existent", () => {
			expect(ledger.get("nope")).toBeUndefined();
		});

		it("filters getAll by scope and activeOnly", () => {
			ledger.add({ id: "1", text: "Global fact", scope: "global", source: "user" });
			ledger.add({ id: "2", text: "Companion fact", scope: "companion", source: "user" });

			const global = ledger.getAll({ scope: "global" });
			expect(global.length).toBe(1);
			expect(global[0].scope).toBe("global");

			const all = ledger.getAll({ activeOnly: true });
			expect(all.length).toBe(2);
		});
	});

	describe("delete & clear", () => {
		it("deletes by id and returns true", () => {
			ledger.add(makeInput("1", "Fact"));
			expect(ledger.delete("1")).toBe(true);
			expect(ledger.get("1")).toBeUndefined();
		});

		it("returns false for non-existent delete", () => {
			expect(ledger.delete("nope")).toBe(false);
		});

		it("clear removes all entries", () => {
			ledger.add(makeInput("1", "Fact 1"));
			ledger.add(makeInput("2", "Fact 2"));
			ledger.clear();
			expect(ledger.size).toBe(0);
		});
	});

	describe("singleton", () => {
		it("getCanonicalLedger returns same instance", () => {
			const a = getCanonicalLedger();
			const b = getCanonicalLedger();
			expect(a).toBe(b);
		});

		it("resetCanonicalLedger clears the instance", () => {
			const instance = getCanonicalLedger();
			instance.add(makeInput("1", "Fact"));
			resetCanonicalLedger();
			const fresh = getCanonicalLedger();
			expect(fresh.size).toBe(0);
		});
	});
});
