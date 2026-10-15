/**
 * MemFSSchema — Directory and file layout conventions for the git-backed
 * memory filesystem (MemFS).
 *
 * Inspired by Letta Code's MemFS pattern, adapted for browser-local-first.
 * All paths are relative to the repo root.
 */

export const MEMFS_ROOT = ".memfs";

/**
 * Per-worker isolation for the MemFS root.
 *
 * Vitest runs test files in parallel workers that share one filesystem, so
 * every worker used to fight over `.memfs`: one worker's `clear()` deleted the
 * directory while another was mid-`init()`, which surfaced as a flaky
 * `ENOTEMPTY .memfs/.git`. Under a test runner, namespace the root by worker id
 * so each worker owns its own tree. Production keeps the plain `.memfs` path.
 */
function resolveRoot(): string {
	const workerId = process.env.VITEST_WORKER_ID ?? process.env.VITEST_POOL_ID;
	if (workerId) {
		return `${MEMFS_ROOT}-test-${workerId}`;
	}
	return MEMFS_ROOT;
}

const RESOLVED_ROOT = resolveRoot();

export const MEMFS_PATHS = {
	root: RESOLVED_ROOT,
	memory: `${RESOLVED_ROOT}/memory`,
	identity: `${RESOLVED_ROOT}/identity`,
	skills: `${RESOLVED_ROOT}/skills`,
	dreams: `${RESOLVED_ROOT}/dreams`,
	canonical: `${RESOLVED_ROOT}/memory/canonical.md`,
	facts: (companionId: string) => `${RESOLVED_ROOT}/memory/facts/${companionId}.md`,
	summary: (companionId: string) => `${RESOLVED_ROOT}/memory/summary/${companionId}.md`,
	persona: (companionId: string) => `${RESOLVED_ROOT}/identity/persona/${companionId}.md`,
	skillManifest: (skillName: string) => `${RESOLVED_ROOT}/skills/${skillName}/manifest.json`,
	skillReadme: (skillName: string) => `${RESOLVED_ROOT}/skills/${skillName}/SKILL.md`,
} as const;

export const MEMORY_VERSION = 1;

export interface MemFSInitOptions {
	workDir?: string;
	bare?: boolean;
	remoteUrl?: string;
}

export interface MemFSCommitResult {
	commitHash: string;
	commitMessage: string;
	filesChanged: string[];
	timestamp: number;
}

export interface MemFSHistoryEntry {
	hash: string;
	message: string;
	timestamp: number;
	author: string;
}

export interface MemFSDiffEntry {
	path: string;
	oldContent: string | null;
	newContent: string | null;
}
