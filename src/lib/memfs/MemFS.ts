/**
 * MemFS — Git-backed memory filesystem for privseai.com.
 *
 * Integrates with Letta Code's MemFS pattern: all memory (facts, summaries,
 * canonical ledger, skills, dreams) is stored in a local git repository.
 * This provides full history, branching, and diff capabilities.
 *
 * Storage is local-first. Remote sync is opt-in only.
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import type {
	MemFSCommitResult,
	MemFSDiffEntry,
	MemFSHistoryEntry,
	MemFSInitOptions,
} from "./MemFSSchema";
import { MEMFS_PATHS } from "./MemFSSchema";

const GIT_AUTHOR = "privseai-agent";
const GIT_EMAIL = "agent@privseai.local";

export class MemFS {
	private workDir: string;
	private initialized = false;

	constructor(options?: MemFSInitOptions) {
		const baseDir = options?.workDir ?? MEMFS_PATHS.root;
		this.workDir = normalize(baseDir);
	}

	getWorkDir(): string {
		return this.workDir;
	}

	isInitialized(): boolean {
		return this.initialized && existsSync(join(this.workDir, ".git"));
	}

	init(): void {
		if (!existsSync(this.workDir)) {
			mkdirSync(this.workDir, { recursive: true });
		}
		if (!existsSync(join(this.workDir, ".git"))) {
			execSync("git init", { cwd: this.workDir, stdio: "pipe" });
			execSync(`git config user.name "${GIT_AUTHOR}"`, { cwd: this.workDir, stdio: "pipe" });
			execSync(`git config user.email "${GIT_EMAIL}"`, { cwd: this.workDir, stdio: "pipe" });
		}
		this.initialized = true;
	}

	commit(path: string, content: string, message: string): MemFSCommitResult {
		const fullPath = join(this.workDir, path);
		const dir = dirname(fullPath);
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}
		writeFileSync(fullPath, content, "utf8");
		const commitHash = this.gitCommit(message);

		return {
			commitHash,
			commitMessage: message,
			filesChanged: [path],
			timestamp: Date.now(),
		};
	}

	private gitCommit(message: string): string {
		execSync("git add -A", { cwd: this.workDir, stdio: "pipe" });
		try {
			const hash = execSync(
				`git commit -m "${message.replace(/"/g, "'")}"`,
				{ cwd: this.workDir, stdio: "pipe" },
			).toString();
			const match = hash.match(/\[(\w+)\s/);
			return match ? match[1] : "unknown";
		} catch {
			return "empty";
		}
	}

	read(path: string): string | null {
		const fullPath = join(this.workDir, path);
		if (!existsSync(fullPath)) return null;
		return readFileSync(fullPath, "utf8");
	}

	write(path: string, content: string): void {
		const fullPath = join(this.workDir, path);
		const dir = dirname(fullPath);
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}
		writeFileSync(fullPath, content, "utf8");
	}

	exists(path: string): boolean {
		return existsSync(join(this.workDir, path));
	}

	list(dir: string): string[] {
		if (!this.exists(dir)) return [];
		try {
			return execSync("git ls-tree --name-only HEAD .", {
				cwd: join(this.workDir, dir),
				stdio: "pipe",
			})
				.toString()
				.split("\n")
				.filter(Boolean);
		} catch {
			return [];
		}
	}

	history(path?: string): MemFSHistoryEntry[] {
		const target = path ?? ".";
		try {
			const output = execSync(
				`git log --all --pretty=format:"%H|%s|%ct|%an" -- "${target}"`,
				{ cwd: this.workDir, stdio: "pipe" },
			).toString();

			return output
				.split("\n")
				.filter(Boolean)
				.map((line) => {
					const [hash, message, ts, author] = line.split("|");
					return {
						hash,
						message,
						timestamp: parseInt(ts, 10) * 1000,
						author: author ?? GIT_AUTHOR,
					};
				});
		} catch {
			return [];
		}
	}

	diff(path: string, commitA?: string, commitB?: string): MemFSDiffEntry[] {
		const range = commitB
			? `${commitA ?? "HEAD~1"}..${commitB}`
			: `${commitA ?? "HEAD~1"}..HEAD`;

		try {
			const output = execSync(
				`git diff --name-status ${range} -- "${path}"`,
				{ cwd: this.workDir, stdio: "pipe" },
			).toString();

			return output
				.split("\n")
				.filter(Boolean)
				.map((line) => {
					const [status, filePath] = line.split("\t");
					const oldContent = status.startsWith("D")
						? null
						: this.readAt(filePath, commitA ?? "HEAD~1");
					const newContent = status === "D"
						? null
						: this.readAt(filePath, commitB ?? "HEAD");
					return { path: filePath, oldContent, newContent };
				});
		} catch {
			return [];
		}
	}

	private readAt(path: string, ref: string): string | null {
		try {
			return execSync(`git show ${ref}:${path}`, {
				cwd: this.workDir,
				stdio: "pipe",
			}).toString();
		} catch {
			return null;
		}
	}

	/**
	 * Opt-in remote sync. By default MemFS is local-only.
	 * Requires explicit user approval and remote URL.
	 */
	async sync(_options?: { push?: boolean; pull?: boolean }): Promise<boolean> {
		return false;
	}

	/**
	 * Migrate data from localStorage to git storage. Called once per profile.
	 */
	migrateFromLocalStorage(
		storageKey: string,
		mapper: (raw: Record<string, unknown>) => Array<{ path: string; content: string }>,
	): MemFSCommitResult[] {
		try {
			const raw = localStorage.getItem(storageKey);
			if (!raw) return [];

			const parsed = JSON.parse(raw) as Record<string, unknown>;
			const files = mapper(parsed);
			const results: MemFSCommitResult[] = [];

			for (const file of files) {
				const result = this.commit(file.path, file.content, `Migrate ${storageKey}: ${file.path}`);
				results.push(result);
			}

			return results;
		} catch {
			return [];
		}
	}

	clear(): void {
		const gitDir = join(this.workDir, ".git");
		if (existsSync(gitDir)) {
			rmSync(gitDir, { recursive: true, force: true });
		}
		if (existsSync(this.workDir)) {
			rmSync(this.workDir, { recursive: true, force: true });
		}
		this.initialized = false;
	}

	getCommitHash(): string {
		try {
			return execSync("git rev-parse HEAD", {
				cwd: this.workDir,
				stdio: "pipe",
			})
				.toString()
				.trim();
		} catch {
			return "none";
		}
	}
}

let _instance: MemFS | null = null;

export function getMemFS(rootDir?: string): MemFS {
	if (!_instance) {
		_instance = new MemFS({ workDir: rootDir ?? MEMFS_PATHS.root });
		_instance.init();
	}
	return _instance;
}

export function resetMemFS(): void {
	if (_instance) {
		_instance.clear();
		_instance = null;
	}
}
