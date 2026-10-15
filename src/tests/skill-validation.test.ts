/**
 * Tests for SkillValidation and SkillLoader.
 */

import { validateManifest, validateCode, validateSkill, isSkillEnabled, type SkillManifest } from "@/lib/skills/SkillValidation";
import { loadSkill, installSkill, listSkills, getInstalledSkills } from "@/lib/skills/SkillLoader";
import { resetMemFS, getMemFS } from "@/lib/memfs/MemFS";
import { describe, expect, it, beforeEach, afterEach } from "vitest";

const validManifest: SkillManifest = {
	name: "test-skill",
	version: "1.0.0",
	description: "A test skill",
	permissions: ["storage"],
	networks: ["none"],
	entry: "index.ts",
};

const validCode = `export function main() { return "hello"; }`;

const maliciousCode = `eval("console.log('bad')");`;

describe("validateManifest", () => {
	it("passes for valid manifest", () => {
		const result = validateManifest(validManifest);
		expect(result.valid).toBe(true);
		if (result.valid) expect(result.manifest.name).toBe("test-skill");
	});

	it("fails for missing name", () => {
		const result = validateManifest({ ...validManifest, name: "" });
		expect(result.valid).toBe(false);
		if (!result.valid) expect(result.errors.some((e: string) => e.includes("name"))).toBe(true);
	});

	it("fails for missing version", () => {
		const result = validateManifest({ ...validManifest, version: "" });
		expect(result.valid).toBe(false);
	});

	it("fails for unknown permission", () => {
		const result = validateManifest({ ...validManifest, permissions: ["network"] });
		expect(result.valid).toBe(false);
		if (!result.valid) expect(result.errors.some((e: string) => e.includes("network"))).toBe(true);
	});

	it("fails for unknown network", () => {
		const result = validateManifest({ ...validManifest, networks: ["external"] });
		expect(result.valid).toBe(false);
	});

	it("fails for non-object manifest", () => {
		const result = validateManifest("not an object");
		expect(result.valid).toBe(false);
	});
});

describe("validateCode", () => {
	it("passes for clean code", () => {
		const result = validateCode(validCode);
		expect(result.valid).toBe(true);
	});

	it("fails for eval usage", () => {
		const result = validateCode(maliciousCode);
		expect(result.valid).toBe(false);
	});

	it("fails for Function constructor", () => {
		const result = validateCode("const f = new Function('x', 'return x');");
		expect(result.valid).toBe(false);
	});

	it("fails for import.meta.env", () => {
		const result = validateCode("const key = import.meta.env.SECRET;");
		expect(result.valid).toBe(false);
	});
});

describe("validateSkill", () => {
	it("returns manifest result when code is absent", () => {
		const result = validateSkill({ ...validManifest, name: "" });
		expect(result.valid).toBe(false);
	});

	it("returns code validation failure when code is malicious", () => {
		const result = validateSkill(validManifest, maliciousCode);
		expect(result.valid).toBe(false);
	});

	it("passes for valid manifest and code", () => {
		const result = validateSkill(validManifest, validCode);
		expect(result.valid).toBe(true);
	});
});

describe("isSkillEnabled", () => {
	it("returns true for valid permissions", () => {
		expect(isSkillEnabled(validManifest)).toBe(true);
	});

	it("returns true for empty permissions", () => {
		expect(isSkillEnabled({ ...validManifest, permissions: [] })).toBe(true);
	});
});

describe("SkillLoader", () => {
	beforeEach(() => {
		resetMemFS();
	});

	afterEach(() => {
		resetMemFS();
	});

	describe("installSkill", () => {
		it("installs a valid skill", () => {
			const result = installSkill("my-skill", validManifest, validCode);
			expect(result.success).toBe(true);
			expect(result.result.valid).toBe(true);
		});

		it("rejects a skill with invalid manifest", () => {
			const result = installSkill("bad-skill", { ...validManifest, name: "" }, validCode);
			expect(result.success).toBe(false);
		});

		it("rejects a skill with malicious code", () => {
			const result = installSkill("bad-skill", validManifest, maliciousCode);
			expect(result.success).toBe(false);
		});
	});

	describe("loadSkill", () => {
		it("loads an installed skill", () => {
			installSkill("loadable-skill", { ...validManifest, name: "loadable-skill" }, validCode);
			const skill = loadSkill("loadable-skill");
			expect(skill).not.toBeNull();
			expect(skill!.manifest.name).toBe("loadable-skill");
			expect(skill!.code).toBe(validCode);
		});

		it("returns null for non-existent skill", () => {
			expect(loadSkill("nonexistent")).toBeNull();
		});

		it("returns null for skill with corrupted manifest", () => {
			const memfs = getMemFS();
			memfs.commit("skills/corrupt/manifest.json", "not json", "corrupt");
			memfs.commit("skills/corrupt/index.ts", validCode, "code");
			expect(loadSkill("corrupt")).toBeNull();
		});
	});

	describe("listSkills", () => {
		it("lists installed skill names", () => {
			installSkill("skill-a", { ...validManifest, name: "skill-a" }, validCode);
			installSkill("skill-b", { ...validManifest, name: "skill-b" }, validCode);

			const skills = listSkills();
			expect(skills).toContain("skill-a");
			expect(skills).toContain("skill-b");
		});

		it("returns empty when no skills installed", () => {
			expect(listSkills()).toEqual([]);
		});
	});

	describe("getInstalledSkills", () => {
		it("returns all valid installed skills", () => {
			installSkill("valid-skill", { ...validManifest, name: "valid-skill" }, validCode);

			const skills = getInstalledSkills();
			expect(skills.length).toBe(1);
			expect(skills[0].manifest.name).toBe("valid-skill");
		});
	});
});
