/**
 * SharedProfilePanel — Character.AI-style shared "human" memory block editor.
 *
 * Mirrors the pattern from letta-ai/characterai-memory: a shared profile
 * (👤) that all companions see as their "human" memory block. Users can
 * add/edit/delete global facts that are synced to every Letta agent's
 * human block via syncMemoryIntoLetta().
 *
 * The shared human block uses a sentinel companionId "__human__" so that
 * facts persist independently of any specific character.
 */

import {
	addManualFact,
	clearCompanionMemory,
	deleteFact,
	getAllFacts,
	type MemoryFact,
} from "@/lib/companion-memory";
import { syncMemoryIntoLetta } from "@/lib/letta-bridge";
import { LettaClient } from "@/lib/letta-client";
import { useState } from "react";

const HUMAN_SENTINEL_ID = "__human__";

interface Props {
	lettaBaseUrl?: string;
	agentIds?: Array<{ companionId: string; agentId: string }>;
}

export function SharedProfilePanel({ lettaBaseUrl, agentIds = [] }: Props) {
	const [newFact, setNewFact] = useState("");
	const [isSyncing, setIsSyncing] = useState(false);
	const [syncResult, setSyncResult] = useState<{ ok: boolean; msg: string } | null>(null);

	const globalFacts = getAllFacts(HUMAN_SENTINEL_ID).filter((f) => f.scope === "global");

	const [localFacts, setLocalFacts] = useState<MemoryFact[]>(globalFacts);

	const handleAddFact = () => {
		const trimmed = newFact.trim();
		if (!trimmed) return;
		addManualFact(HUMAN_SENTINEL_ID, trimmed, "global");
		setNewFact("");
		setLocalFacts(getAllFacts(HUMAN_SENTINEL_ID).filter((f) => f.scope === "global"));
	};

	const handleDeleteFact = (factId: string) => {
		deleteFact(HUMAN_SENTINEL_ID, factId);
		setLocalFacts((prev) => prev.filter((f) => f.id !== factId));
	};

	const handleResetAll = () => {
		if (
			!confirm(
				"Delete ALL global profile facts? This affects how all companions see you. Cannot be undone.",
			)
		)
			return;
		clearCompanionMemory(HUMAN_SENTINEL_ID);
		setLocalFacts([]);
	};

	const handleSyncToLetta = async () => {
		if (!lettaBaseUrl || agentIds.length === 0) {
			setSyncResult({ ok: false, msg: "No Letta agents configured" });
			return;
		}
		setIsSyncing(true);
		setSyncResult(null);
		try {
			const config = LettaClient.loadConfig();
			const client = new LettaClient({
				baseUrl: lettaBaseUrl,
				apiKey: config?.apiKey,
				enabled: config?.enabled ?? true,
			});

			const status = await client.checkConnection();
			if (!status.online) {
				setSyncResult({ ok: false, msg: `Letta offline: ${status.error}` });
				return;
			}

			let success = 0;
			let failed = 0;
			for (const { companionId, agentId } of agentIds) {
				const ok = await syncMemoryIntoLetta(lettaBaseUrl, agentId, companionId);
				if (ok) success++;
				else failed++;
			}

			setSyncResult({
				ok: failed === 0,
				msg: `Synced to ${success} agent(s)${failed > 0 ? `, ${failed} failed` : ""}`,
			});
		} catch (err) {
			setSyncResult({
				ok: false,
				msg: err instanceof Error ? err.message : "Sync failed",
			});
		} finally {
			setIsSyncing(false);
		}
	};

	const handleExport = () => {
		const exportData = {
			type: "shared-human-profile",
			exportedAt: Date.now(),
			facts: localFacts.map((f) => ({
				text: f.text,
				source: f.source,
				createdAt: f.createdAt,
			})),
		};
		const blob = new Blob([JSON.stringify(exportData, null, 2)], {
			type: "application/json",
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `human-profile-${Date.now()}.json`;
		a.click();
		URL.revokeObjectURL(url);
	};

	return (
		<div className="bg-[#12141e] border border-white/10 rounded-3xl p-6">
			<div className="flex items-center justify-between mb-4">
				<h2 className="text-lg font-bold text-white flex items-center gap-2">
					👤 Shared Profile (Human Memory Block)
				</h2>
				<button
					type="button"
					onClick={handleExport}
					className="px-2.5 py-1 rounded-lg bg-white/5 text-xs text-gray-300 hover:bg-white/10 transition"
					title="Export profile facts as JSON"
				>
					Export
				</button>
			</div>

			<p className="text-xs text-gray-400 mb-4">
				Facts below are shared across all companions via Letta's "human" memory block.
				These facts are injected into every character's context.
			</p>

			{localFacts.length === 0 ? (
				<div className="text-center py-6 text-gray-500 border border-dashed border-white/10 rounded-2xl mb-4">
					No global profile facts yet. Add one below.
				</div>
			) : (
				<div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
					{localFacts.map((fact) => (
						<div
							key={fact.id}
							className="flex items-start justify-between p-3 bg-[#0e0f17] rounded-xl border border-white/5 group"
						>
							<div className="flex-1">
								<div className="text-sm text-gray-200">{fact.text}</div>
								<div className="flex items-center gap-2 mt-1">
									<span
										className={`text-[10px] px-1.5 py-0.5 rounded ${
											fact.source === "manual"
												? "bg-pink-500/20 text-pink-300"
												: fact.source === "rule"
													? "bg-cyan-500/20 text-cyan-300"
													: "bg-amber-500/20 text-amber-300"
										}`}
									>
										{fact.source}
									</span>
									<span className="text-[10px] text-gray-500">
										{new Date(fact.createdAt).toLocaleDateString()}
									</span>
								</div>
							</div>
							<button
								type="button"
								onClick={() => handleDeleteFact(fact.id)}
								className="ml-2 text-gray-400 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition"
								title="Delete this fact"
							>
								✕
							</button>
						</div>
					))}
				</div>
			)}

			<div className="flex gap-2 mb-4">
				<input
					type="text"
					value={newFact}
					onChange={(e) => setNewFact(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") handleAddFact();
					}}
					placeholder="e.g. My name is Yuki"
					className="flex-1 px-4 py-2.5 bg-[#0e0f17] border border-white/10 rounded-2xl text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-pink-500/50 transition-colors"
				/>
				<button
					type="button"
					onClick={handleAddFact}
					disabled={!newFact.trim()}
					className="px-4 py-2.5 rounded-2xl bg-candy-gradient text-white text-sm font-semibold hover:bg-candy-gradient-hover transition disabled:opacity-40"
				>
					Add
				</button>
			</div>

			<div className="flex items-center justify-between pt-4 border-t border-white/10">
				<button
					type="button"
					onClick={handleSyncToLetta}
					disabled={isSyncing || agentIds.length === 0}
					className="px-4 py-2 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-sm font-semibold hover:bg-cyan-500/25 transition disabled:opacity-40"
				>
					{isSyncing ? "Syncing..." : "Sync to Letta agents"}
				</button>
				{syncResult && (
					<span
						className={`text-xs ${
							syncResult.ok ? "text-emerald-400" : "text-rose-400"
						}`}
					>
						{syncResult.msg}
					</span>
				)}
			</div>

			{localFacts.length > 0 && (
				<button
					type="button"
					onClick={handleResetAll}
					className="w-full mt-3 px-4 py-2 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold hover:bg-rose-500/20 transition"
				>
					Reset All Global Facts
				</button>
			)}
		</div>
	);
}

export const HUMAN_SENTINEL_ID_EXPORTED = HUMAN_SENTINEL_ID;
