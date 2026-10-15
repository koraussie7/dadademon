/**
 * ConfidenceModel — Pure functions for calculating confidence scores
 * for memory facts in the CanonicalLedger.
 *
 * Uses Bayesian-style scoring: start neutral, increase on corroboration,
 * decay over time and with contradictions.
 */

export interface ConfidenceFactors {
	corroborations: number;
	contradictions: number;
	ageHours: number;
	source: "user" | "system" | "observation";
}

const BASE_CONFIDENCE = 0.5;
const SOURCE_WEIGHTS: Record<ConfidenceFactors["source"], number> = {
	user: 1.0,
	system: 0.8,
	observation: 0.6,
};

const CORROBORATION_BOOST = 0.2;
const CONTRADICTION_PENALTY = 0.4;

export function calculateConfidence(factors: ConfidenceFactors): number {
	const { corroborations, contradictions, ageHours, source } = factors;
	const sourceWeight = SOURCE_WEIGHTS[source] ?? 0.5;

	let score = BASE_CONFIDENCE * sourceWeight;

	for (let i = 0; i < corroborations; i++) {
		score += (1 - score) * CORROBORATION_BOOST * sourceWeight;
	}

	for (let i = 0; i < contradictions; i++) {
		score -= score * CONTRADICTION_PENALTY * sourceWeight;
	}

	const days = ageHours / 24;
	const decay = Math.pow(0.95, days);
	score = score * decay + BASE_CONFIDENCE * sourceWeight * (1 - decay);

	return Math.max(0, Math.min(1, score));
}

export function decayConfidence(current: number, ageHours: number): number {
	const days = ageHours / 24;
	const decay = Math.pow(0.98, days);
	const result = current * decay + BASE_CONFIDENCE * (1 - decay);
	return Math.max(0, Math.min(1, result));
}

export function isHighConfidence(score: number, threshold = 0.7): boolean {
	return score >= threshold;
}

export function isLowConfidence(score: number, threshold = 0.3): boolean {
	return score < threshold;
}

export const CONFIDENCE_THRESHOLDS = {
	HIGH: 0.7,
	LOW: 0.3,
	DECAY_HALF_LIFE_DAYS: 14,
} as const;
