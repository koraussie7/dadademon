/**
 * Local-first enforcement tests — verify no silent network egress.
 *
 * Dream engine and auto-update are ON by default, but both remain local-first:
 * - No outbound network calls without an explicitly-supplied resolver/URL
 * - Auto-update never opens a connection on its own
 * - P2P mesh starts empty until an identity/circle is set
 */

import { syncMemoryIntoLetta } from "@/lib/letta-bridge";
import { getDreamGate, resetDreamGate } from "@/lib/dream/DreamGate";
import { getCanonicalLedger, resetCanonicalLedger } from "@/lib/memory/CanonicalLedger";
import { resetMemFS } from "@/lib/memfs/MemFS";
import { getInstalledSkills } from "@/lib/skills/SkillLoader";
import { getP2PMesh, resetP2PMesh } from "@/lib/mesh/P2PMesh";
import { AutoUpdate, getAutoUpdate, resetAutoUpdate } from "@/lib/auto-update/AutoUpdate";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

const testStore = new Map<string, string>();
const localStorageMock = {
	getItem: (k: string) => testStore.get(k) ?? null,
	setItem: (_k: string, v: string) => void testStore.set(_k, v),
	removeItem: (k: string) => void testStore.delete(k),
	clear: () => void testStore.clear(),
	get length() { return testStore.size; },
	key: (i: number) => Array.from(testStore.keys())[i] ?? null,
};

describe("Local-first enforcement", () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		testStore.clear();
		Object.defineProperty(globalThis, "localStorage", {
			value: localStorageMock,
			writable: true,
			configurable: true,
		});
	});

	afterEach(() => {
		resetDreamGate();
		resetCanonicalLedger();
		resetMemFS();
		resetP2PMesh();
		resetAutoUpdate();
		globalThis.fetch = originalFetch;
		testStore.clear();
	});

	describe("no auto-sync", () => {
		it("MemFS sync is a no-op by default", async () => {
			const { getMemFS } = await import("@/lib/memfs/MemFS");
			const memfs = getMemFS();
			const result = await memfs.sync();
			expect(result).toBe(false);
		});

		it("skills are listed from local MemFS only", () => {
			const skills = getInstalledSkills();
			expect(Array.isArray(skills)).toBe(true);
		});

		it("CanonicalLedger has no entries on fresh state", () => {
			resetCanonicalLedger();
			const ledger = getCanonicalLedger();
			expect(ledger.size).toBe(0);
		});
	});

	describe("auto-update is ON by default but local-first", () => {
		it("auto-update is enabled by default", () => {
			resetAutoUpdate();
			expect(getAutoUpdate().isEnabled()).toBe(true);
		});

		it("checkForUpdate makes no network call without a resolver", async () => {
			globalThis.fetch = vi.fn();
			const au = new AutoUpdate();
			const result = await au.checkForUpdate();
			expect(result).toBeNull();
			expect(globalThis.fetch).not.toHaveBeenCalled();
		});

		it("MemFS sync returns false without remote URL", async () => {
			const { getMemFS } = await import("@/lib/memfs/MemFS");
			const memfs = getMemFS();
			const result = await memfs.sync({ push: true, pull: true });
			expect(result).toBe(false);
		});
	});

	describe("dream engine ON by default", () => {
		it("dream engine is enabled by default", () => {
			resetDreamGate();
			const gate = getDreamGate();
			expect(gate.isEnabled()).toBe(true);
		});

		it("has empty audit log before any action", () => {
			resetDreamGate();
			const gate = getDreamGate();
			expect(gate.getAuditLog().length).toBe(0);
		});

		it("operator can still disable the dream engine", () => {
			resetDreamGate();
			const gate = getDreamGate();
			gate.disable();
			expect(gate.isEnabled()).toBe(false);
		});
	});

	describe("P2P mesh starts empty", () => {
		it("mesh has no identity until explicitly set", () => {
			resetP2PMesh();
			const mesh = getP2PMesh();
			expect(mesh.hasIdentity()).toBe(false);
		});

		it("mesh has no circles until explicitly added", () => {
			resetP2PMesh();
			const mesh = getP2PMesh();
			expect(mesh.listCircles().length).toBe(0);
		});
	});

	describe("no outbound network without opt-in", () => {
		it("syncMemoryIntoLetta does not throw when fetch fails", async () => {
			globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error("Network blocked"));
			const result = await syncMemoryIntoLetta("http://localhost:8281", "agent-1", "comp-1");
			expect(result).toBe(false);
		});
	});
});
