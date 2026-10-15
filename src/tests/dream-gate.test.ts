/**
 * Tests for DreamGate — strict opt-in gate for dream engine.
 */

import { DreamGate, getDreamGate, resetDreamGate, isDreamEngineEnabled, DEFAULT_CONFIG } from "@/lib/dream/DreamGate";
import { describe, expect, it, beforeEach, afterEach } from "vitest";

const testStore = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
	value: {
		getItem: (k: string) => testStore.get(k) ?? null,
		setItem: (_k: string, v: string) => void testStore.set(_k, v),
		removeItem: (k: string) => void testStore.delete(k),
		clear: () => void testStore.clear(),
		get length() { return testStore.size; },
		key: (i: number) => Array.from(testStore.keys())[i] ?? null,
	},
	writable: true,
	configurable: true,
});

describe("DreamGate", () => {
	let gate: DreamGate;

	beforeEach(() => {
		testStore.clear();
		resetDreamGate();
		gate = new DreamGate();
	});

	afterEach(() => {
		gate.clear();
		testStore.clear();
	});

	describe("default state", () => {
		it("is disabled by default", () => {
			expect(gate.isEnabled()).toBe(false);
		});

		it("returns default config when none saved", () => {
			const config = gate.getConfig();
			expect(config.enabled).toBe(false);
			expect(config.model).toBe(DEFAULT_CONFIG.model);
			expect(config.maxTokens).toBe(512);
			expect(config.temperature).toBe(0.7);
		});
	});

	describe("requestEnable", () => {
		it("enables with explicit approval", async () => {
			const result = await gate.requestEnable();
			expect(result).toBe(true);
			expect(gate.isEnabled()).toBe(true);
		});

		it("logs audit entry on enable", async () => {
			await gate.requestEnable();
			const audit = gate.getAuditLog();
			expect(audit.length).toBe(1);
			expect(audit[0].action).toBe("enable");
		});

		it("persists enabled state to localStorage", async () => {
			await gate.requestEnable();
			const fresh = new DreamGate();
			expect(fresh.isEnabled()).toBe(true);
		});
	});

	describe("disable", () => {
		it("disables the dream engine", async () => {
			await gate.requestEnable();
			expect(gate.isEnabled()).toBe(true);
			gate.disable();
			expect(gate.isEnabled()).toBe(false);
		});

		it("logs audit entry on disable", async () => {
			await gate.requestEnable();
			gate.disable();
			const audit = gate.getAuditLog();
			expect(audit.some((a) => a.action === "disable")).toBe(true);
		});
	});

	describe("sessions", () => {
		it("starts with no sessions", () => {
			expect(gate.getSessions().length).toBe(0);
		});

		it("stores and retrieves sessions", () => {
			const session = {
				id: "dream-1",
				prompt: "Reflect on user preferences",
				result: "Synthesized insight",
				createdAt: Date.now(),
			};
			gate.addSession(session);
			const sessions = gate.getSessions();
			expect(sessions.length).toBe(1);
			expect(sessions[0].id).toBe("dream-1");
		});

		it("logs audit entry for each dream session", () => {
			gate.addSession({
				id: "dream-1",
				prompt: "test",
				result: "result",
				createdAt: Date.now(),
			});
			const audit = gate.getAuditLog();
			expect(audit.some((a) => a.action === "dream")).toBe(true);
		});
	});

	describe("audit log", () => {
		it("starts empty", () => {
			expect(gate.getAuditLog()).toEqual([]);
		});

		it("tracks enable + dream sequence", async () => {
			await gate.requestEnable();
			gate.addSession({
				id: "d1",
				prompt: "p",
				result: "r",
				createdAt: Date.now(),
			});
			const audit = gate.getAuditLog();
			expect(audit.length).toBe(2);
			expect(audit[0].action).toBe("enable");
			expect(audit[1].action).toBe("dream");
		});
	});

	describe("clear", () => {
		it("clears enabled state, sessions, and audit log", async () => {
			await gate.requestEnable();
			gate.addSession({ id: "d1", prompt: "p", result: "r", createdAt: Date.now() });
			gate.clear();
			expect(gate.isEnabled()).toBe(false);
			expect(gate.getSessions().length).toBe(0);
			expect(gate.getAuditLog().length).toBe(0);
		});
	});

	describe("singleton", () => {
		it("getDreamGate returns same instance", () => {
			resetDreamGate();
			const a = getDreamGate();
			const b = getDreamGate();
			expect(a).toBe(b);
		});

		it("resetDreamGate clears the instance", () => {
			resetDreamGate();
			const instance = getDreamGate();
			expect(instance).toBeDefined();
			resetDreamGate();
		});

		it("isDreamEngineEnabled returns false by default", () => {
			resetDreamGate();
			expect(isDreamEngineEnabled()).toBe(false);
		});
	});
});
