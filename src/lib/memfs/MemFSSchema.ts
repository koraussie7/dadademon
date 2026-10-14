/**
 * MemFSSchema — Directory and file layout conventions for the git-backed
 * memory filesystem (MemFS).
 *
 * Inspired by Letta Code's MemFS pattern, adapted for browser-local-first.
 * All paths are relative to the repo root.
 */

export const MEMFS_ROOT = ".memfs";

export const MEMFS_PATHS = {
	root: MEMFS_ROOT,
	memory: `${MEMFS_ROOT}/memory`,
	identity: `${MEMFS_ROOT}/identity`,
	skills: `${MEMFS_ROOT}/skills`,
	dreams: `${MEMFS_ROOT}/dreams`,
	canonical: `${MEMFS_ROOT}/memory/canonical.md`,
	facts: (companionId: string) => `${MEMFS_ROOT}/memory/facts/${companionId}.md`,
	summary: (companionId: string) => `${MEMFS_ROOT}/memory/summary/${companionId}.md`,
	persona: (companionId: string) => `${MEMFS_ROOT}/identity/persona/${companionId}.md`,
	skillManifest: (skillName: string) => `${MEMFS_ROOT}/skills/${skillName}/manifest.json`,
	skillReadme: (skillName: string) => `${MEMFS_ROOT}/skills/${skillName}/SKILL.md`,
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
