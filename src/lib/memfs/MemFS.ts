/**
 * MemFS — Git-backed memory filesystem for privseai.com.
 *
 * Integrates with Letta Code's MemFS pattern: all memory (facts, summaries,
 * canonical ledger, skills, dreams) is stored in a local git repository.
 * This provides full history, branching, and diff capabilities.
 *
 * Storage is local-first. Remote sync is opt-in only.
 *
 * Uses real git when available; falls back to JSGitAdapter (in-memory git
 * compatible API) when git binary is blocked or unavailable (e.g., sandbox).
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

interface GitAdapter {
	init(workDir: string): void;
	isInitialized(workDir: string): boolean;
	stageFile(workDir: string, path: string, content: string): void;
	writeFile(workDir: string, path: string, content: string): void;
	readFile(workDir: string, path: string): string | null;
	fileExists(workDir: string, path: string): boolean;
	commit(workDir: string, message: string): string;
	log(workDir: string, target: string): MemFSHistoryEntry[];
	diff(workDir: string, path: string): MemFSDiffEntry[];
	lsTree(workDir: string, dir: string): string[];
	clear(workDir: string): void;
}

class JSGitAdapter implements GitAdapter {
	private repos = new Map<string, {
		files: Map<string, string>;
		commits: Array<{ hash: string; message: string; timestamp: number; author: string; snapshot: Map<string, string> }>;
	}>();

	private hash(): string {
		return "jsg_" + Math.random().toString(36).substring(2, 12) + Date.now().toString(36).slice(-6);
	}

	private getRepo(workDir: string) {
		const key = normalize(workDir);
		let repo = this.repos.get(key);
		if (!repo) {
			repo = { files: new Map(), commits: [] };
			this.repos.set(key, repo);
		}
		return repo;
	}

	init(_workDir: string): void {
		this.getRepo(_workDir);
	}

 	isInitialized(workDir: string): boolean {
		return this.repos.has(normalize(workDir));
	}

	private getExistingRepo(workDir: string) {
		return this.repos.get(normalize(workDir)) ?? null;
	}

  stageFile(_workDir: string, path: string, content: string): void {
		const repo = this.getRepo(_workDir);
		repo.files.set(path, content);
	}

	writeFile(_workDir: string, path: string, content: string): void {
		const repo = this.getRepo(_workDir);
		repo.files.set(path, content);
	}

	readFile(_workDir: string, path: string): string | null {
		const repo = this.getExistingRepo(_workDir);
		return repo?.files.get(path) ?? null;
	}

	fileExists(_workDir: string, path: string): boolean {
		const repo = this.getExistingRepo(_workDir);
		return repo?.files.has(path) ?? false;
	}

	commit(_workDir: string, message: string): string {
		const repo = this.getRepo(_workDir);
		const hash = this.hash();
		repo.commits.push({
			hash,
			message,
			timestamp: Date.now() / 1000,
			author: GIT_AUTHOR,
			snapshot: new Map(repo.files),
		});
		return hash;
	}

 	log(_workDir: string, target: string): MemFSHistoryEntry[] {
		const repo = this.getExistingRepo(_workDir);
		if (!repo) return [];
		return repo.commits
			.slice()
			.reverse()
			.filter((c) => {
				if (target === ".") return true;
				return c.snapshot.has(target) || Array.from(c.snapshot.keys()).some((f) => f.startsWith(target));
			})
			.map((c) => ({
				hash: c.hash,
				message: c.message,
				timestamp: c.timestamp * 1000,
				author: c.author,
			}));
	}

 	diff(_workDir: string, path: string): MemFSDiffEntry[] {
		const repo = this.getExistingRepo(_workDir);
		if (!repo) return [];
		if (repo.commits.length < 2) return [];
		const latest = repo.commits[repo.commits.length - 1];
		const prev = repo.commits[repo.commits.length - 2];
		const oldContent = prev.snapshot.get(path) ?? null;
		const newContent = latest.snapshot.get(path) ?? null;
		if (oldContent !== newContent) {
			return [{ path, oldContent, newContent }];
		}
		return [];
	}

lsTree(_workDir: string, dir: string): string[] {
		const repo = this.getExistingRepo(_workDir);
		if (!repo) return [];
		return Array.from(repo.files.keys()).filter((f) => f.startsWith(dir));
	}

	clear(_workDir: string): void {
		this.repos.delete(normalize(_workDir));
	}
}

function tryGitInit(workDir: string): boolean {
	try {
		execSync("git init", { cwd: workDir, stdio: "pipe" });
		execSync(`git config user.name "${GIT_AUTHOR}"`, { cwd: workDir, stdio: "pipe" });
		execSync(`git config user.email "${GIT_EMAIL}"`, { cwd: workDir, stdio: "pipe" });
		return true;
	} catch {
		return false;
	}
}

const jsGitAdapter = new JSGitAdapter();

export class MemFS {
	private workDir: string;
	private initialized = false;
	private useGit = false;

	constructor(options?: MemFSInitOptions) {
		const baseDir = options?.workDir ?? MEMFS_PATHS.root;
		this.workDir = normalize(baseDir);
	}

	getWorkDir(): string {
		return this.workDir;
	}

	isInitialized(): boolean {
		if (this.useGit) {
			return this.initialized && existsSync(join(this.workDir, ".git"));
		}
		return jsGitAdapter.isInitialized(this.workDir);
	}

	init(): void {
		if (!existsSync(this.workDir)) {
			mkdirSync(this.workDir, { recursive: true });
		}

		this.useGit = tryGitInit(this.workDir);
		if (!this.useGit) {
			jsGitAdapter.init(this.workDir);
		}
		this.initialized = true;
	}

	commit(path: string, content: string, message: string): MemFSCommitResult {
		const fullPath = join(this.workDir, path);
		const dir = dirname(fullPath);

		if (this.useGit) {
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

		jsGitAdapter.init(this.workDir);
		jsGitAdapter.stageFile(this.workDir, path, content);
		const commitHash = jsGitAdapter.commit(this.workDir, message);
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

		if (this.useGit) {
			if (!existsSync(fullPath)) return null;
			return readFileSync(fullPath, "utf8");
		}

		const staged = jsGitAdapter.readFile(this.workDir, path);
		if (staged !== null) return staged;

		if (existsSync(fullPath)) return readFileSync(fullPath, "utf8");
		return null;
	}

	write(path: string, content: string): void {
		const fullPath = join(this.workDir, path);
		const dir = dirname(fullPath);

		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}

		if (this.useGit) {
			writeFileSync(fullPath, content, "utf8");
		} else {
			jsGitAdapter.writeFile(this.workDir, path, content);
		}
	}

	exists(path: string): boolean {
		const fullPath = join(this.workDir, path);

		if (this.useGit) {
			return existsSync(fullPath);
		}

		return jsGitAdapter.fileExists(this.workDir, path) || existsSync(fullPath);
	}

	list(dir: string): string[] {
		if (this.useGit) {
			const targetDir = join(this.workDir, dir);
			if (!existsSync(targetDir)) return [];
			try {
				return execSync("git ls-tree --name-only HEAD .", {
					cwd: targetDir,
					stdio: "pipe",
				})
					.toString()
					.split("\n")
					.filter(Boolean);
			} catch {
				return [];
			}
		}

		const files = jsGitAdapter.lsTree(this.workDir, dir);
		return files;
	}

	history(path?: string): MemFSHistoryEntry[] {
		const target = path ?? ".";

		if (this.useGit) {
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

		return jsGitAdapter.log(this.workDir, target);
	}

	diff(path: string, commitA?: string, commitB?: string): MemFSDiffEntry[] {
		if (this.useGit) {
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

		return jsGitAdapter.diff(this.workDir, path);
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
		if (this.useGit) {
			const gitDir = join(this.workDir, ".git");
			if (existsSync(gitDir)) {
				rmSync(gitDir, { recursive: true, force: true });
			}
			if (existsSync(this.workDir)) {
				rmSync(this.workDir, { recursive: true, force: true });
			}
		} else {
			jsGitAdapter.clear(this.workDir);
		}
		this.initialized = false;
		this.useGit = false;
	}

	getCommitHash(): string {
		if (this.useGit) {
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
		return "jsgit";
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
