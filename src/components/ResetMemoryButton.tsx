/**
 * ResetMemoryButton — Character.AI-style per-companion memory reset (🔁).
 *
 * Deletes the Letta agent for a companion and clears local companion memory,
 * giving the user a fresh start with that character. This mirrors the
 * characterai-memory "reset" pattern.
 *
 * WARNING: This is irreversible. The Letta agent and all its persistent
 * memory blocks are deleted.
 */

import { clearCompanionMemory } from "@/lib/companion-memory";
import { LettaClient } from "@/lib/letta-client";
import { useState } from "react";

interface Props {
	companionId: string;
	companionName: string;
	lettaBaseUrl?: string;
	onResetComplete?: () => void;
}

export function ResetMemoryButton({
	companionId,
	companionName,
	lettaBaseUrl: explicitBaseUrl,
	onResetComplete,
}: Props) {
	const [showConfirm, setShowConfirm] = useState(false);
	const [isResetting, setIsResetting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState(false);

	const getAgentId = (): string | null => {
		try {
			return localStorage.getItem(`privseai_letta_agent_${companionId}`);
		} catch {
			return null;
		}
	};

	const handleReset = async () => {
		setIsResetting(true);
		setError(null);
		setSuccess(false);

		const agentId = getAgentId();
		if (!agentId) {
			clearCompanionMemory(companionId);
			setSuccess(true);
			setShowConfirm(false);
			onResetComplete?.();
			return;
		}

		const baseUrl = explicitBaseUrl ?? LettaClient.loadConfig()?.baseUrl;

		if (baseUrl) {
			try {
				const config = LettaClient.loadConfig();
				const client = new LettaClient({
					baseUrl,
					apiKey: config?.apiKey,
					enabled: config?.enabled ?? true,
				});
				const deleted = await client.deleteAgent(agentId);
				if (!deleted) {
					setError("Could not reach Letta server. Local memory will be cleared but the agent persists on the server.");
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : "Letta server error");
			}
		}

		try {
			localStorage.removeItem(`privseai_letta_agent_${companionId}`);
		} catch {}

		clearCompanionMemory(companionId);
		setSuccess(true);
		setShowConfirm(false);
		onResetComplete?.();
		setIsResetting(false);
	};

	if (success) {
		return (
			<div className="px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300">
				✓ Memory reset for {companionName}
			</div>
		);
	}

	return (
		<>
			<button
				type="button"
				onClick={() => setShowConfirm(true)}
				className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 hover:bg-rose-500/20 transition"
			>
				<span>🔁</span> Reset {companionName}'s memory
			</button>

			{showConfirm && (
				<div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
					<div className="bg-[#12141e] border border-white/10 rounded-3xl p-6 max-w-md w-full">
						<h3 className="text-lg font-bold text-white mb-3">
							Reset Memory for {companionName}?
						</h3>
						<p className="text-sm text-gray-300 mb-4">
							This will delete the Letta agent and clear all conversation
							facts for {companionName}. This action cannot be undone.
						</p>
						{error && (
							<div className="mb-3 p-2 bg-rose-500/10 border border-rose-500/30 rounded text-xs text-rose-300">
								{error}
							</div>
						)}
						<div className="flex gap-3">
							<button
								type="button"
								onClick={() => setShowConfirm(false)}
								disabled={isResetting}
								className="flex-1 px-4 py-2 rounded-xl bg-white/5 text-gray-300 hover:bg-white/10 text-sm transition"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={handleReset}
								disabled={isResetting}
								className="flex-1 px-4 py-2 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-300 font-semibold hover:bg-rose-500/30 text-sm transition disabled:opacity-50"
							>
								{isResetting ? "Resetting..." : "Reset Now"}
							</button>
						</div>
					</div>
				</div>
			)}
		</>
	);
}
