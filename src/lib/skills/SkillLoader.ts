/**
 * SkillLoader — Loads, validates, and manages skills in MemFS.
 *
 * Skills are stored in MemFS under /skills/<name>/.
 * On load: validate manifest + code, only persist if valid.
 */

import { getMemFS } from "@/lib/memfs/MemFS";
import { validateSkill, type SkillManifest, type ValidationResult } from "./SkillValidation";

export interface LoadedSkill {
	manifest: SkillManifest;
	code: string;
	commitHash: string;
}

export function loadSkill(name: string): LoadedSkill | null {
	const memfs = getMemFS();

	const manifestPath = `skills/${name}/manifest.json`;
	const entryPath = `skills/${name}/index.ts`;

	const manifestRaw = memfs.read(manifestPath);
	const codeRaw = memfs.read(entryPath);

	if (!manifestRaw || !codeRaw) return null;

	let manifest: SkillManifest;
	try {
		manifest = JSON.parse(manifestRaw) as SkillManifest;
	} catch {
		return null;
	}

	const validation = validateSkill(manifest, codeRaw);
	if (!validation.valid) {
		return null;
	}

	return {
		manifest: validation.manifest,
		code: codeRaw,
		commitHash: memfs.getCommitHash(),
	};
}

export function installSkill(name: string, manifest: SkillManifest, code: string): { success: boolean; result: ValidationResult } {
	const memfs = getMemFS();

	const validation = validateSkill(manifest, code);
	if (!validation.valid) {
		return { success: false, result: validation };
	}

	memfs.commit(`skills/${name}/manifest.json`, JSON.stringify(manifest, null, 2), `Install skill ${name}`);
	memfs.commit(`skills/${name}/SKILL.md`, "# Skill: " + name, `Create readme for ${name}`);
	memfs.commit(`skills/${name}/index.ts`, code, `Add code for ${name}`);

	return { success: true, result: validation };
}

export function listSkills(): string[] {
	const memfs = getMemFS();

	const files = memfs.list("skills");
	const dirs = new Set<string>();

	for (const file of files) {
		const parts = file.split("/");
		if (parts.length >= 3 && parts[0] === "skills") {
			dirs.add(parts[1]);
		}
	}

	return Array.from(dirs);
}

export function getInstalledSkills(): LoadedSkill[] {
	return listSkills()
		.map((name) => loadSkill(name))
		.filter((s): s is LoadedSkill => s !== null);
}
