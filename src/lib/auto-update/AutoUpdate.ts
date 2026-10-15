/**
 * AutoUpdate — Controller for automatic update checks.
 *
 * Auto-update is ON by default (operator-approved). The controller manages
 * whether an update check is permitted to run, on which channel, and whether
 * a discovered update is applied automatically.
 *
 * Local-first guarantee: this module never performs a network call on its
 * own. Callers supply a `resolveLatest` resolver (dependency injection) that
 * knows how to reach a specific update source. With no resolver provided,
 * `checkForUpdate` is a no-op that returns null — so enabling auto-update
 * does NOT, by itself, open any outbound connection.
 */

export interface AutoUpdateConfig {
	enabled: boolean;
	/** Release channel to check, e.g. "stable" | "beta". */
	channel: string;
	/** Minimum interval between checks, in milliseconds. */
	checkIntervalMs: number;
	/** Whether a discovered update is applied automatically. */
	autoApply: boolean;
	currentVersion?: string;
	lastCheckedAt?: number;
	lastAppliedAt?: number;
}

const ONE_HOUR_MS = 60 * 60 * 1000;

const DEFAULT_CONFIG: AutoUpdateConfig = {
	enabled: true,
	channel: "stable",
	checkIntervalMs: 6 * ONE_HOUR_MS,
	autoApply: true,
};

const STORAGE_KEY = "privseai.auto-update.v1";
const AUDIT_LOG_KEY = "privseai.auto-update.audit.v1";

export interface AvailableUpdate {
	version: string;
	changelog?: string;
	url?: string;
}

type AuditAction = "enable" | "disable" | "check" | "apply" | "skip";

interface AuditEntry {
	action: AuditAction;
	timestamp: number;
	version?: string;
}

/**
 * Resolver that returns the latest available update, or null if up to date.
 * Supplied by the caller so the module itself stays offline/local-first.
 */
export type LatestResolver = () => Promise<AvailableUpdate | null>;

export class AutoUpdate {
	private enabled: boolean;

	constructor() {
		this.enabled = this.getConfig().enabled;
	}

	isEnabled(): boolean {
		return this.enabled;
	}

	enable(): void {
		this.enabled = true;
		const config = this.getConfig();
		config.enabled = true;
		this.saveConfig(config);
		this.logAudit("enable");
	}

	disable(): void {
		this.enabled = false;
		const config = this.getConfig();
		config.enabled = false;
		this.saveConfig(config);
		this.logAudit("disable");
	}

	getConfig(): AutoUpdateConfig {
		try {
			const ls = typeof localStorage !== "undefined" ? localStorage : null;
			if (!ls) return { ...DEFAULT_CONFIG };
			const raw = ls.getItem(STORAGE_KEY);
			if (!raw) return { ...DEFAULT_CONFIG };
			return { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as AutoUpdateConfig) };
		} catch {
			return { ...DEFAULT_CONFIG };
		}
	}

	private saveConfig(config: AutoUpdateConfig): void {
		try {
			const ls = typeof localStorage !== "undefined" ? localStorage : null;
			if (!ls) return;
			ls.setItem(STORAGE_KEY, JSON.stringify(config));
		} catch {
			/* quota — skip */
		}
	}

	setChannel(channel: string): void {
		const config = this.getConfig();
		config.channel = channel;
		this.saveConfig(config);
	}

	setCurrentVersion(version: string): void {
		const config = this.getConfig();
		config.currentVersion = version;
		this.saveConfig(config);
	}

	setAutoApply(autoApply: boolean): void {
		const config = this.getConfig();
		config.autoApply = autoApply;
		this.saveConfig(config);
	}

	/**
	 * Check for an update. Returns null when:
	 * - auto-update is disabled, OR
	 * - no resolver was supplied (local-first default — no network), OR
	 * - the resolver reports no newer version.
	 * Otherwise returns the discovered update and records a `check` audit entry.
	 */
	async checkForUpdate(resolveLatest?: LatestResolver): Promise<AvailableUpdate | null> {
		if (!this.enabled) return null;
		const config = this.getConfig();
		config.lastCheckedAt = Date.now();
		this.saveConfig(config);
		this.logAudit("check");

		if (typeof resolveLatest !== "function") return null;

		const latest = await resolveLatest();
		if (!latest) return null;

		const current = this.getConfig().currentVersion;
		if (current && latest.version === current) return null;

		return latest;
	}

	/**
	 * Mark an update as applied. Records an `apply` audit entry and stamps the
	 * applied version + timestamp. Actual installation is left to the caller.
	 */
	markApplied(version: string): void {
		const config = this.getConfig();
		config.currentVersion = version;
		config.lastAppliedAt = Date.now();
		this.saveConfig(config);
		this.logAudit("apply", version);
	}

	getAuditLog(): AuditEntry[] {
		try {
			const ls = typeof localStorage !== "undefined" ? localStorage : null;
			if (!ls) return [];
			const raw = ls.getItem(AUDIT_LOG_KEY);
			if (!raw) return [];
			return JSON.parse(raw) as AuditEntry[];
		} catch {
			return [];
		}
	}

	private logAudit(action: AuditAction, version?: string): void {
		const log = this.getAuditLog();
		log.push({ action, timestamp: Date.now(), version });
		try {
			const ls = typeof localStorage !== "undefined" ? localStorage : null;
			if (!ls) return;
			ls.setItem(AUDIT_LOG_KEY, JSON.stringify(log));
		} catch {
			/* quota — skip */
		}
	}

	clear(): void {
		// Restore to the factory default (currently enabled) and wipe state.
		this.enabled = DEFAULT_CONFIG.enabled;
		try {
			const ls = typeof localStorage !== "undefined" ? localStorage : null;
			if (!ls) return;
			ls.removeItem(STORAGE_KEY);
			ls.removeItem(AUDIT_LOG_KEY);
		} catch {
			/* ignore */
		}
	}
}

let _instance: AutoUpdate | null = null;

export function getAutoUpdate(): AutoUpdate {
	if (!_instance) {
		_instance = new AutoUpdate();
	}
	return _instance;
}

export function resetAutoUpdate(): void {
	if (_instance) {
		_instance.clear();
		_instance = null;
	}
}

export function isAutoUpdateEnabled(): boolean {
	return getAutoUpdate().isEnabled();
}

export { DEFAULT_CONFIG as AUTO_UPDATE_DEFAULT_CONFIG };
