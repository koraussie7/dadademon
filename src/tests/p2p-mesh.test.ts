/**
 * Tests for P2P Mesh network — 2-layer personal + circle architecture.
 */

import { P2PMeshNetwork, getP2PMesh, resetP2PMesh } from "@/lib/mesh/P2PMesh";
import type { Circle, DeviceKey } from "@/lib/mesh/P2PMesh";
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

const testDeviceKey: DeviceKey = { id: "dev-1", publicKey: "pk-1", signedAt: Date.now() };
const testCircle: Circle = {
	id: "circle-1",
	name: "Family",
	peerIds: ["peer-1", "peer-2"],
	joinedAt: Date.now(),
	permissions: { readMemory: true, writeMemory: false, shareSkills: true },
};

describe("P2PMeshNetwork", () => {
	let mesh: P2PMeshNetwork;

	beforeEach(() => {
		testStore.clear();
		mesh = new P2PMeshNetwork();
		mesh.initialize();
	});

	afterEach(() => {
		mesh.clear();
		testStore.clear();
	});

	describe("identity", () => {
		it("starts without identity", () => {
			expect(mesh.hasIdentity()).toBe(false);
			expect(mesh.getIdentity()).toBeNull();
		});

		it("sets identity and persists", () => {
			mesh.setIdentity(testDeviceKey);
			expect(mesh.hasIdentity()).toBe(true);
			expect(mesh.getIdentity()?.deviceKey.id).toBe("dev-1");
		});

		it("loads identity from localStorage", () => {
			mesh.setIdentity(testDeviceKey);
			const fresh = new P2PMeshNetwork();
			fresh.initialize();
			expect(fresh.hasIdentity()).toBe(true);
			expect(fresh.getIdentity()?.deviceKey.id).toBe("dev-1");
		});
	});

	describe("circles", () => {
		it("adds a circle", () => {
			mesh.addCircle(testCircle);
			const circles = mesh.listCircles();
			expect(circles.length).toBe(1);
			expect(circles[0].name).toBe("Family");
		});

		it("prevents duplicate circles", () => {
			mesh.addCircle(testCircle);
			mesh.addCircle(testCircle);
			expect(mesh.listCircles().length).toBe(1);
		});

		it("finds circle by id", () => {
			mesh.addCircle(testCircle);
			const circle = mesh.getCircle("circle-1");
			expect(circle?.name).toBe("Family");
		});

		it("returns undefined for non-existent circle", () => {
			expect(mesh.getCircle("nope")).toBeUndefined();
		});

		it("removes circle", () => {
			mesh.addCircle(testCircle);
			expect(mesh.removeCircle("circle-1")).toBe(true);
			expect(mesh.listCircles().length).toBe(0);
		});

		it("returns false for non-existent circle removal", () => {
			expect(mesh.removeCircle("nope")).toBe(false);
		});
	});

	describe("broadcast personal", () => {
		it("broadcasts personal message with layer set", () => {
			mesh.setIdentity(testDeviceKey);
			const msg = mesh.broadcastPersonal({
				type: "memory",
				payload: { key: "value" },
				timestamp: Date.now(),
			});
			expect(msg.layer).toBe("personal");
			expect(msg.originDeviceId).toBe("dev-1");
			expect(msg.type).toBe("memory");
		});

		it("stores message in personal messages", () => {
			mesh.setIdentity(testDeviceKey);
			mesh.broadcastPersonal({
				type: "memory",
				payload: "test",
				timestamp: Date.now(),
			});
			const personal = mesh.getPersonalMessages();
			expect(personal.length).toBe(1);
		});
	});

	describe("broadcast to circle", () => {
		it("broadcasts to existing circle", () => {
			mesh.setIdentity(testDeviceKey);
			mesh.addCircle(testCircle);
			const msg = mesh.broadcastToCircle("circle-1", {
				type: "skill",
				payload: "code",
				timestamp: Date.now(),
			});
			expect(msg).not.toBeNull();
			expect(msg!.layer).toBe("circle");
			expect(msg!.circleId).toBe("circle-1");
		});

		it("returns null for non-existent circle", () => {
			const msg = mesh.broadcastToCircle("nope", {
				type: "skill",
				payload: "code",
				timestamp: Date.now(),
			});
			expect(msg).toBeNull();
		});

		it("stores message in circle messages", () => {
			mesh.setIdentity(testDeviceKey);
			mesh.addCircle(testCircle);
			mesh.broadcastToCircle("circle-1", {
				type: "memory",
				payload: "fact",
				timestamp: Date.now(),
			});
			const circleMsgs = mesh.getMessagesForCircle("circle-1");
			expect(circleMsgs.length).toBe(1);
		});
	});

	describe("clear", () => {
		it("clears identity, circles, and messages", () => {
			mesh.setIdentity(testDeviceKey);
			mesh.addCircle(testCircle);
			mesh.broadcastPersonal({ type: "memory", payload: "x", timestamp: Date.now() });
			mesh.clear();
			expect(mesh.hasIdentity()).toBe(false);
			expect(mesh.listCircles().length).toBe(0);
			expect(mesh.getPersonalMessages().length).toBe(0);
		});
	});

	describe("singleton", () => {
		it("getP2PMesh returns same instance", () => {
			resetP2PMesh();
			const a = getP2PMesh();
			const b = getP2PMesh();
			expect(a).toBe(b);
		});

		it("resetP2PMesh clears the instance", () => {
			resetP2PMesh();
			const instance = getP2PMesh();
			expect(instance).toBeDefined();
			resetP2PMesh();
		});
	});
});
