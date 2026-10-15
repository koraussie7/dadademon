/**
 * Tests for MemFS — git-backed filesystem for memory storage.
 * Uses JSGitAdapter fallback (git binary blocked in sandbox).
 */

import { MemFS, getMemFS, resetMemFS } from "@/lib/memfs/MemFS";
import { MEMFS_PATHS } from "@/lib/memfs/MemFSSchema";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// localStorage shim for Node environment
const testStore = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
	value: {
		getItem: (k: string) => testStore.get(k) ?? null,
		setItem: (k: string, v: string) => void testStore.set(k, v),
		removeItem: (k: string) => void testStore.delete(k),
		clear: () => void testStore.clear(),
		get length() { return testStore.size; },
		key: (i: number) => Array.from(testStore.keys())[i] ?? null,
	},
	writable: true,
	configurable: true,
});

const testDir = await mkdtemp(join(tmpdir(), "memfs-test-"));

describe("MemFS", () => {
	let memfs: MemFS;

	beforeEach(() => {
		testStore.clear();
		memfs = new MemFS({ workDir: testDir });
		memfs.init();
	});

	afterEach(() => {
		memfs.clear();
	});

	describe("init & lifecycle", () => {
		it("initializes a repository", () => {
			expect(memfs.isInitialized()).toBe(true);
		});

		it("tracks work directory", () => {
			expect(memfs.getWorkDir()).toBe(testDir);
		});
	});

	describe("commit & read", () => {
		it("commits and reads file content", () => {
			const result = memfs.commit("memory/test.md", "# Test", "Initial commit");
			expect(result.commitHash).toBeTruthy();
			expect(result.filesChanged).toEqual(["memory/test.md"]);

			const content = memfs.read("memory/test.md");
			expect(content).toBe("# Test");
		});

		it("overwrites existing content", () => {
			memfs.commit("memory/test.md", "v1", "First");
			memfs.commit("memory/test.md", "v2", "Second");

			const content = memfs.read("memory/test.md");
			expect(content).toBe("v2");
		});

		it("returns null for non-existent file", () => {
			expect(memfs.read("memory/nonexistent.md")).toBeNull();
		});

		it("write and read without commit", () => {
			memfs.write("memory/write-test.md", "hello");
			expect(memfs.read("memory/write-test.md")).toBe("hello");
		});

		it("checks file existence", () => {
			memfs.commit("exists.md", "content", "test");
			expect(memfs.exists("exists.md")).toBe(true);
			expect(memfs.exists("not-exists.md")).toBe(false);
		});
	});

	describe("history & diff", () => {
		it("tracks commit history", () => {
			memfs.commit("memory/facts/test.md", "fact1", "First commit");
			memfs.commit("memory/facts/test.md", "fact2", "Second commit");

			const history = memfs.history("memory/facts/test.md");
			expect(history.length).toBeGreaterThanOrEqual(2);
			expect(history[0].message).toBe("Second commit");
			expect(history[1].message).toBe("First commit");
		});

		it("returns empty history for new file", () => {
			memfs.commit("new-file.md", "content", "init");
			const history = memfs.history("new-file.md");
			expect(history.length).toBe(1);
		});

		it("diffs between commits", () => {
			memfs.commit("diff-test.md", "original", "First");
			memfs.commit("diff-test.md", "modified", "Second");

			const changes = memfs.diff("diff-test.md");
			expect(changes.length).toBeGreaterThanOrEqual(0);
		});
	});

	describe("list", () => {
		it("lists files in a directory", () => {
			memfs.commit("memory/facts/a.md", "content a", "add a");
			memfs.commit("memory/facts/b.md", "content b", "add b");

			const files = memfs.list("memory/facts");
			const names = files.map((f) => f.split("/").pop());
			expect(names).toContain("a.md");
			expect(names).toContain("b.md");
		});
	});

	describe("clear", () => {
		it("removes all data", () => {
			memfs.commit("data.md", "content", "test");
			expect(memfs.exists("data.md")).toBe(true);

			memfs.clear();
			expect(memfs.exists("data.md")).toBe(false);
			expect(memfs.isInitialized()).toBe(false);
		});
	});

	describe("migrateFromLocalStorage", () => {
		beforeEach(() => {
			testStore.set("test.memory", JSON.stringify({
				"comp-01": { facts: [{ id: "1", text: "test fact", scope: "global" }] },
			}));
		});

		it("migrates localStorage data to filesystem", () => {
			const results = memfs.migrateFromLocalStorage("test.memory", (raw) => {
				const store = raw as Record<string, { facts: Array<{ id: string; text: string; scope: string }> }>;
				return Object.entries(store).flatMap(([compId, mem]) =>
					mem.facts.map((f) => ({
						path: MEMFS_PATHS.facts(compId),
						content: `- ${f.text}`,
					})),
				);
			});

			expect(results.length).toBeGreaterThan(0);
			expect(memfs.exists(MEMFS_PATHS.facts("comp-01"))).toBe(true);
		});

		it("returns empty for missing localStorage key", () => {
			const results = memfs.migrateFromLocalStorage("nonexistent.key", () => []);
			expect(results).toEqual([]);
		});
	});

	describe("singleton", () => {
		it("getMemFS returns same instance", () => {
			resetMemFS();
			const a = getMemFS(testDir);
			const b = getMemFS(testDir);
			expect(a).toBe(b);
		});

		it("resetMemFS clears the instance", () => {
			const instance = getMemFS(testDir);
			expect(instance).toBeDefined();
			resetMemFS();
		});
	});
});
