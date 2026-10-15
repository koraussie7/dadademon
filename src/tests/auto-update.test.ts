/**
 * Tests for AutoUpdate — controller for automatic update checks (ON by default).
 */

import {
	AutoUpdate,
	getAutoUpdate,
	resetAutoUpdate,
	isAutoUpdateEnabled,
	AUTO_UPDATE_DEFAULT_CONFIG,
} from "@/lib/auto-update/AutoUpdate";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

const testStore = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
	value: {
		getItem: (k: string) => testStore.get(k) ?? null,
		setItem: (_k: string, v: string) => void testStore.set(_k, v),
		removeItem: (k: string) => void testStore.delete(k),
		clear: () => void testStore.clear(),
		get length() {
			return testStore.size;
		},
		key: (i: number) => Array.from(testStore.keys())[i] ?? null,
	},
	writable: true,
	configurable: true,
});

describe("AutoUpdate", () => {
	let au: AutoUpdate;

	beforeEach(() => {
		testStore.clear();
		resetAutoUpdate();
		au = new AutoUpdate();
	});

	afterEach(() => {
		au.clear();
		testStore.clear();
	});

	describe("default state", () => {
		it("is enabled by default", () => {
			expect(au.isEnabled()).toBe(true);
		});

		it("returns default config when none saved", () => {
			const config = au.getConfig();
			expect(config.enabled).toBe(true);
			expect(config.channel).toBe(AUTO_UPDATE_DEFAULT_CONFIG.channel);
			expect(config.autoApply).toBe(true);
		});
	});

	describe("checkForUpdate", () => {
		it("returns null and makes no network call without a resolver", async () => {
			globalThis.fetch = vi.fn();
			const result = await au.checkForUpdate();
			expect(result).toBeNull();
			expect(globalThis.fetch).not.toHaveBeenCalled();
		});

		it("returns null when disabled", async () => {
			au.disable();
			const resolve = vi.fn().mockResolvedValue({ version: "9.9.9" });
			const result = await au.checkForUpdate(resolve);
			expect(result).toBeNull();
			expect(resolve).not.toHaveBeenCalled();
		});

		it("returns the discovered update from a resolver", async () => {
			au.setCurrentVersion("1.0.0");
			const resolve = vi.fn().mockResolvedValue({ version: "1.1.0", url: "http://x" });
			const result = await au.checkForUpdate(resolve);
			expect(result).toEqual({ version: "1.1.0", url: "http://x" });
		});

		it("returns null when resolver reports the same version", async () => {
			au.setCurrentVersion("1.0.0");
			const resolve = vi.fn().mockResolvedValue({ version: "1.0.0" });
			const result = await au.checkForUpdate(resolve);
			expect(result).toBeNull();
		});

		it("logs a check audit entry", async () => {
			await au.checkForUpdate();
			expect(au.getAuditLog().some((a) => a.action === "check")).toBe(true);
		});
	});

	describe("enable/disable", () => {
		it("disable disables auto-update", () => {
			au.disable();
			expect(au.isEnabled()).toBe(false);
		});

		it("enable re-enables after disable", () => {
			au.disable();
			au.enable();
			expect(au.isEnabled()).toBe(true);
		});

		it("persists disabled state to localStorage", () => {
			au.disable();
			const fresh = new AutoUpdate();
			expect(fresh.isEnabled()).toBe(false);
		});
	});

	describe("markApplied", () => {
		it("records applied version + audit entry", () => {
			au.markApplied("2.0.0");
			const config = au.getConfig();
			expect(config.currentVersion).toBe("2.0.0");
			expect(config.lastAppliedAt).toBeGreaterThan(0);
			expect(au.getAuditLog().some((a) => a.action === "apply")).toBe(true);
		});
	});

	describe("clear", () => {
		it("restores default (enabled) state and wipes audit", () => {
			au.disable();
			au.markApplied("2.0.0");
			au.clear();
			expect(au.isEnabled()).toBe(true);
			expect(au.getAuditLog().length).toBe(0);
		});
	});

	describe("singleton", () => {
		it("getAutoUpdate returns same instance", () => {
			resetAutoUpdate();
			expect(getAutoUpdate()).toBe(getAutoUpdate());
		});

		it("isAutoUpdateEnabled returns true by default", () => {
			resetAutoUpdate();
			expect(isAutoUpdateEnabled()).toBe(true);
		});
	});
});
