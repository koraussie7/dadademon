/**
 * DreamGate — Gate for the dream engine.
 *
 * Dream Engine is ON by default (operator-approved). Dreams are offline
 * reflection sessions that synthesize memory into new insights via the LLM.
 * They run locally and never make external network calls without explicit
 * user consent. The operator can disable the engine at any time; every
 * enable/disable/dream action is recorded in an audit trail.
 */

export interface DreamConfig {
	enabled: boolean;
	model: string;
	maxTokens: number;
	temperature: number;
	lastEnabledAt?: number;
}

const DEFAULT_CONFIG: DreamConfig = {
	enabled: true,
	model: "gpt-4o-mini",
	maxTokens: 512,
	temperature: 0.7,
};

export interface DreamSession {
	id: string;
	prompt: string;
	result: string;
	createdAt: number;
}

const DREAM_STORAGE_KEY = "privseai.dream.v1";
const AUDIT_LOG_KEY = "privseai.dream.audit.v1";

interface AuditEntry {
	action: "enable" | "disable" | "dream";
	timestamp: number;
	sessionId?: string;
}

export class DreamGate {
	private enabled: boolean;

	constructor() {
		this.enabled = this.getConfig().enabled;
	}

	isEnabled(): boolean {
		return this.enabled;
	}

	async requestEnable(): Promise<boolean> {
		if (typeof confirm === "function") {
			const approved = confirm(
				"DREAM ENGINE\n\nThis will enable offline reflection sessions that synthesize your memory into new insights.\n\nDreams run locally. They do NOT auto-update or make external network calls.\n\nEnable dream engine?",
			);
			if (!approved) return false;
		}

		this.enabled = true;
		const config = this.getConfig();
		config.enabled = true;
		config.lastEnabledAt = Date.now();
		this.saveConfig(config);
		this.logAudit("enable");
		return true;
	}

	disable(): void {
		this.enabled = false;
		const config = this.getConfig();
		config.enabled = false;
		this.saveConfig(config);
		this.logAudit("disable");
	}

	getConfig(): DreamConfig {
		try {
			const ls = typeof localStorage !== "undefined" ? localStorage : null;
			if (!ls) return { ...DEFAULT_CONFIG };
			const raw = ls.getItem(DREAM_STORAGE_KEY);
			if (!raw) return { ...DEFAULT_CONFIG };
			return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
		} catch {
			return { ...DEFAULT_CONFIG };
		}
	}

	private saveConfig(config: DreamConfig): void {
		try {
			const ls = typeof localStorage !== "undefined" ? localStorage : null;
			if (!ls) return;
			ls.setItem(DREAM_STORAGE_KEY, JSON.stringify(config));
		} catch {
			/* quota — skip */
		}
	}

	getSessions(): DreamSession[] {
		try {
			const ls = typeof localStorage !== "undefined" ? localStorage : null;
			if (!ls) return [];
			const raw = ls.getItem(`${DREAM_STORAGE_KEY}.sessions`);
			if (!raw) return [];
			return JSON.parse(raw) as DreamSession[];
		} catch {
			return [];
		}
	}

	addSession(session: DreamSession): void {
		const sessions = this.getSessions();
		sessions.push(session);
		try {
			const ls = typeof localStorage !== "undefined" ? localStorage : null;
			if (!ls) return;
			ls.setItem(`${DREAM_STORAGE_KEY}.sessions`, JSON.stringify(sessions));
		} catch {
			/* quota — skip */
		}
		this.logAudit("dream", session.id);
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

	private logAudit(action: AuditEntry["action"], sessionId?: string): void {
		const log = this.getAuditLog();
		log.push({ action, timestamp: Date.now(), sessionId });
		try {
			const ls = typeof localStorage !== "undefined" ? localStorage : null;
			if (!ls) return;
			ls.setItem(AUDIT_LOG_KEY, JSON.stringify(log));
		} catch {
			/* quota — skip */
		}
	}

	clear(): void {
		// Restore to the factory default (currently enabled). This wipes any
		// saved config, sessions, and audit trail.
		this.enabled = DEFAULT_CONFIG.enabled;
		try {
			const ls = typeof localStorage !== "undefined" ? localStorage : null;
			if (!ls) return;
			ls.removeItem(DREAM_STORAGE_KEY);
			ls.removeItem(`${DREAM_STORAGE_KEY}.sessions`);
			ls.removeItem(AUDIT_LOG_KEY);
		} catch {
			/* ignore */
		}
	}
}

let _instance: DreamGate | null = null;

export function getDreamGate(): DreamGate {
	if (!_instance) {
		_instance = new DreamGate();
	}
	return _instance;
}

export function resetDreamGate(): void {
	if (_instance) {
		_instance.clear();
		_instance = null;
	}
}

export function isDreamEngineEnabled(): boolean {
	return getDreamGate().isEnabled();
}

export { DEFAULT_CONFIG };
