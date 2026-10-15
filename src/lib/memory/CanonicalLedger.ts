/**
 * CanonicalLedger — Authoritative, deduplicated memory store with confidence
 * scoring. Acts as a single source of truth in front of Letta blocks.
 *
 * Each entry has a confidence score (0.0–1.0) based on:
 * - Corroboration count (positive signal)
 * - Contradiction count (negative signal)
 * - Age (exponential decay)
 * - Source weight (user > system > observation)
 *
 * Promotes high-confidence facts into Letta memory blocks;
 * demotes low-confidence facts out of active context.
 */

import { calculateConfidence, decayConfidence, isHighConfidence, isLowConfidence } from "./ConfidenceModel";
import type { ConfidenceFactors } from "./ConfidenceModel";

export interface LedgerEntry {
	id: string;
	text: string;
	scope: "global" | "companion";
	source: ConfidenceFactors["source"];
	confidence: number;
	corroborations: number;
	contradictions: number;
	createdAt: number;
	lastAccessedAt: number;
	accessCount: number;
	isActive: boolean;
}

export interface LedgerEntryInput {
	id: string;
	text: string;
	scope: "global" | "companion";
	source: ConfidenceFactors["source"];
}

export interface PromoteResult {
	promoted: LedgerEntry[];
	demoted: LedgerEntry[];
}

export class CanonicalLedger {
	private entries: Map<string, LedgerEntry> = new Map();

	add(input: LedgerEntryInput): LedgerEntry {
		const now = Date.now();
		const existing = this.entries.get(input.id);

		if (existing) {
			if (existing.contradictions > 0) {
				existing.contradictions -= 1;
			}
			existing.text = input.text;
			existing.scope = input.scope;
			existing.source = input.source;
			existing.lastAccessedAt = now;
			existing.accessCount += 1;
			this.entries.set(input.id, existing);
			return { ...existing };
		}

		const confidence = calculateConfidence({
			corroborations: 0,
			contradictions: 0,
			ageHours: 0,
			source: input.source,
		});

		const entry: LedgerEntry = {
			id: input.id,
			text: input.text,
			scope: input.scope,
			source: input.source,
			confidence,
			corroborations: 0,
			contradictions: 0,
			createdAt: now,
			lastAccessedAt: now,
			accessCount: 1,
			isActive: true,
		};

		this.entries.set(input.id, entry);
		return { ...entry };
	}

	corroborate(id: string): LedgerEntry | null {
		const entry = this.entries.get(id);
		if (!entry) return null;

		entry.corroborations += 1;
		entry.lastAccessedAt = Date.now();
		entry.accessCount += 1;
		entry.confidence = this.recalculateConfidence(entry);
		this.entries.set(id, entry);
		return { ...entry };
	}

	contradict(id: string): LedgerEntry | null {
		const entry = this.entries.get(id);
		if (!entry) return null;

		entry.contradictions += 1;
		entry.lastAccessedAt = Date.now();
		entry.accessCount += 1;
		entry.confidence = this.recalculateConfidence(entry);
		this.entries.set(id, entry);
		return { ...entry };
	}

	private recalculateConfidence(entry: LedgerEntry): number {
		const ageHours = (Date.now() - entry.createdAt) / (1000 * 60 * 60);
		let score = calculateConfidence({
			corroborations: entry.corroborations,
			contradictions: entry.contradictions,
			ageHours,
			source: entry.source,
		});

		if (ageHours > 24) {
			score = decayConfidence(score, ageHours);
		}

		return Math.max(0, Math.min(1, score));
	}

	promote(companionId?: string): LedgerEntry[] {
		const toPromote: LedgerEntry[] = [];

		for (const entry of this.entries.values()) {
			entry.confidence = this.recalculateConfidence(entry);

			const matchesCompanion = !companionId || entry.scope === "global" || entry.id.startsWith(`${companionId}-`);
			const shouldBeActive = isHighConfidence(entry.confidence) && matchesCompanion;

			if (shouldBeActive && !entry.isActive) {
				entry.isActive = true;
			}

			if (entry.isActive && isHighConfidence(entry.confidence)) {
				toPromote.push({ ...entry });
			}
		}

		return toPromote;
	}

	demote(): LedgerEntry[] {
		const toDemote: LedgerEntry[] = [];

		for (const entry of this.entries.values()) {
			if (entry.isActive && isLowConfidence(entry.confidence)) {
				entry.isActive = false;
				toDemote.push({ ...entry });
			}
		}

		return toDemote;
	}

	reconcile(): PromoteResult {
		const promoted = this.promote();
		const demoted = this.demote();
		return { promoted, demoted };
	}

	get(id: string): LedgerEntry | undefined {
		return this.entries.get(id);
	}

	getAll(filter?: { scope?: "global" | "companion"; activeOnly?: boolean }): LedgerEntry[] {
		let entries = Array.from(this.entries.values());

		if (filter?.scope) {
			entries = entries.filter((e) => e.scope === filter.scope);
		}

		if (filter?.activeOnly) {
			entries = entries.filter((e) => e.isActive);
		}

		return entries;
	}

	getForScope(companionId: string): LedgerEntry[] {
		const results: LedgerEntry[] = [];
		for (const entry of this.entries.values()) {
			if (entry.scope === "global" || entry.text.includes(companionId)) {
				results.push({ ...entry });
			}
		}
		return results;
	}

	delete(id: string): boolean {
		return this.entries.delete(id);
	}

	clear(): void {
		this.entries.clear();
	}

	get size(): number {
		return this.entries.size;
	}
}

let _instance: CanonicalLedger | null = null;

export function getCanonicalLedger(): CanonicalLedger {
	if (!_instance) {
		_instance = new CanonicalLedger();
	}
	return _instance;
}

export function resetCanonicalLedger(): void {
	if (_instance) {
		_instance.clear();
		_instance = null;
	}
}
