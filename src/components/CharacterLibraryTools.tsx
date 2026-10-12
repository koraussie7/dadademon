import type { AIHub } from "@/lib/ai-hub";
import { validatePreset } from "@/lib/model-presets";
import type { CharacterCard } from "@/types/character";
import { useMemo, useState } from "react";

/**
 * Library card tools: export to file, P2P share, recommended-model badge.
 */

interface LibraryCardToolsProps {
	card: CharacterCard;
	hub: AIHub;
	onNotice: (msg: string) => void;
}

export function LibraryCardTools({ card, hub, onNotice }: LibraryCardToolsProps) {
	const [shareBusy, setShareBusy] = useState(false);
	const presetTag = card.data.tags?.find((t) => t.startsWith("model:"));
	const presetInfo = useMemo(() => {
		if (!presetTag) return null;
		try {
			return validatePreset(JSON.parse(atob(presetTag.slice("model:".length))));
		} catch {
			return null;
		}
	}, [presetTag]);

	const exportCard = () => {
		const blob = new Blob([JSON.stringify(card, null, 2)], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `${card.data.name.replace(/[^\w-]+/g, "_")}.card.json`;
		a.click();
		URL.revokeObjectURL(url);
		onNotice(`Exported ${card.data.name}.`);
	};

	const shareCard = async () => {
		setShareBusy(true);
		try {
			const pkg = hub.createPackage({
				card,
				creator: "library",
				baseModel: "external",
				tags: card.data.tags ?? [],
			});
			const result = await hub.sharePackage(pkg);
			if (result.success) {
				onNotice(`${card.data.name} broadcast to peer ${result.peerId ?? ""}.`.trim());
			} else {
				onNotice(`Share failed: ${result.error ?? "unknown error"}`);
			}
		} finally {
			setShareBusy(false);
		}
	};

	return (
		<div className="mt-2 flex items-center gap-2">
			<button
				type="button"
				onClick={exportCard}
				title="Download card as JSON"
				className="rounded-lg bg-white/10 px-2 py-1 text-[10px] text-gray-300 hover:bg-white/15"
			>
				⬇ Export
			</button>
			<button
				type="button"
				onClick={shareCard}
				disabled={shareBusy}
				title="Share this card over P2P"
				className="rounded-lg bg-pink-600/70 px-2 py-1 text-[10px] font-semibold text-white hover:bg-pink-600 disabled:opacity-40"
			>
				{shareBusy ? "Sharing…" : "⇄ Share"}
			</button>
			{presetInfo && (
				<span
					title={`Recommended model: ${presetInfo.name} (${presetInfo.quantization})`}
					className="rounded-lg bg-emerald-500/20 px-2 py-1 text-[10px] text-emerald-300"
				>
					🧠 {presetInfo.name}
				</span>
			)}
		</div>
	);
}

interface LibraryFiltersProps {
	query: string;
	onQuery: (v: string) => void;
	selectedTag: string;
	onTag: (v: string) => void;
	tags: string[];
}

export function LibraryFilters({ query, onQuery, selectedTag, onTag, tags }: LibraryFiltersProps) {
	return (
		<div className="mb-4 flex flex-wrap items-center gap-2">
			<input
				type="text"
				value={query}
				onChange={(e) => onQuery(e.target.value)}
				placeholder="Search by name or description…"
				className="min-w-[220px] flex-1 rounded-xl bg-[#13141f] border border-white/10 px-3 py-2 text-xs text-gray-200 placeholder:text-gray-500 focus:outline-none focus:border-pink-500/40"
			/>
			{tags.length > 0 && (
				<select
					value={selectedTag}
					onChange={(e) => onTag(e.target.value)}
					className="rounded-xl bg-[#13141f] border border-white/10 px-2 py-2 text-xs text-gray-300"
				>
					<option value="">All tags</option>
					{tags.map((t) => (
						<option key={t} value={t}>
							#{t}
						</option>
					))}
				</select>
			)}
		</div>
	);
}

/** Filter cards by query + tag. */
export function filterCards(cards: CharacterCard[], query: string, tag: string): CharacterCard[] {
	const q = query.trim().toLowerCase();
	return cards.filter((card) => {
		const name = card.data.name?.toLowerCase() ?? "";
		const desc = card.data.description?.toLowerCase() ?? "";
		const matchesQuery = !q || name.includes(q) || desc.includes(q);
		const matchesTag = !tag || (card.data.tags ?? []).includes(tag);
		return matchesQuery && matchesTag;
	});
}

/** All unique tags across cards, sorted. */
export function collectTags(cards: CharacterCard[]): string[] {
	const set = new Set<string>();
	for (const card of cards) {
		for (const tag of card.data.tags ?? []) set.add(tag.toLowerCase());
	}
	return [...set].sort();
}
