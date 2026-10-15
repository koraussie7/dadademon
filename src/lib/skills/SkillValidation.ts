/**
 * SkillValidation — Pipeline for validating skills before they are installed/loaded.
 *
 * Each skill is a module with a SKILL.md manifest. The pipeline validates:
 * 1. Manifest schema (required fields)
 * 2. Permission declarations (only known permissions)
 * 3. Code safety (no eval, no Function constructor, no import.meta.env leakage)
 * 4. P2P safety (no network egress unless explicitly declared)
 *
 * Skills are local-first. Remote sync is opt-in only.
 */

export interface SkillManifest {
	name: string;
	version: string;
	description: string;
	permissions: string[];
	networks: string[];
	entry: string;
}

export type ValidationResult =
	| { valid: true; manifest: SkillManifest }
	| { valid: false; errors: string[] };

const ALLOWED_PERMISSIONS = [
	"storage",
	"identity",
	"memory",
	"canvas",
] as const;

const ALLOWED_NETWORKS = ["localhost", "none"] as const;

const FORBIDDEN_PATTERNS = [
	/\beval\s*\(/,
	/\bFunction\s*\(/,
	/import\.meta\.env/,
	/\b__dir\b/,
];

export function validateManifest(manifest: unknown): ValidationResult {
	const errors: string[] = [];

	if (!manifest || typeof manifest !== "object") {
		return { valid: false, errors: ["Manifest must be an object"] };
	}

	const m = manifest as Record<string, unknown>;

	if (typeof m.name !== "string" || !m.name) {
		errors.push("Manifest: 'name' is required and must be a non-empty string");
	}
	if (typeof m.version !== "string" || !m.version) {
		errors.push("Manifest: 'version' is required and must be a non-empty string");
	}
	if (typeof m.description !== "string" || !m.description) {
		errors.push("Manifest: 'description' is required and must be a non-empty string");
	}
	if (!Array.isArray(m.permissions)) {
		errors.push("Manifest: 'permissions' must be an array");
	} else {
		for (const perm of m.permissions) {
			if (!ALLOWED_PERMISSIONS.includes(perm as never)) {
				errors.push(`Manifest: unknown permission '${perm}'`);
			}
		}
	}
	if (!Array.isArray(m.networks)) {
		errors.push("Manifest: 'networks' must be an array");
	} else {
		for (const net of m.networks) {
			if (!ALLOWED_NETWORKS.includes(net as never)) {
				errors.push(`Manifest: unknown network '${net}'`);
			}
		}
	}
	if (typeof m.entry !== "string" || !m.entry) {
		errors.push("Manifest: 'entry' is required and must be a non-empty string");
	}

	if (errors.length > 0) {
		return { valid: false, errors };
	}

	return { valid: true, manifest: m as unknown as SkillManifest };
}

export function validateCode(code: string): { valid: boolean; errors: string[] } {
	const errors: string[] = [];

	for (const pattern of FORBIDDEN_PATTERNS) {
		if (pattern.test(code)) {
			errors.push(`Code: forbidden pattern detected: ${pattern}`);
		}
	}

	return { valid: errors.length === 0, errors };
}

export function validateSkill(manifest: unknown, code?: string): ValidationResult {
	const manifestResult = validateManifest(manifest);
	if (!manifestResult.valid) {
		return manifestResult;
	}

	if (code) {
		const codeResult = validateCode(code);
		if (!codeResult.valid) {
			return { valid: false, errors: codeResult.errors };
		}
	}

	return manifestResult;
}

export function isSkillEnabled(manifest: SkillManifest): boolean {
	return manifest.name !== "" && manifest.permissions.every((p) => ALLOWED_PERMISSIONS.includes(p as never));
}
