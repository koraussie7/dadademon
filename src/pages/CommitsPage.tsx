import { useState } from "react";
import { useI18n } from "@/lib/i18n";

interface Commit {
	hash: string;
	date: string;
	message: string;
	author: string;
	lines: number;
}

const COMMITS: Commit[] = [
	{hash: "497aedd", date: "2026-10-12", message: "fix: BYOK 채팅 및 통합 타입 보완", author: "Brian Y <koraussie@gmail.com>", lines: 860},
	{hash: "6208df6", date: "2026-10-12", message: "test: 테스트 스위트 추가", author: "Brian Y <koraussie@gmail.com>", lines: 908},
	{hash: "3ed3445", date: "2026-10-12", message: "feat(ui): UI 컴포넌트 및 페이지 추가", author: "Brian Y <koraussie@gmail.com>", lines: 13185},
	{hash: "13bf703", date: "2026-10-12", message: "feat(integration): 통합 어댑터 추가", author: "Brian Y <koraussie@gmail.com>", lines: 689},
	{hash: "df8f48c", date: "2026-10-12", message: "feat(ai): AI 모델 통합 및 클라이언트 추가", author: "Brian Y <koraussie@gmail.com>", lines: 803},
	{hash: "86a059e", date: "2026-10-12", message: "feat(p2p): P2P 네트워킹 인프라 구축", author: "Brian Y <koraussie@gmail.com>", lines: 4612},
	{hash: "bf81c4e", date: "2026-10-12", message: "feat(image): 이미지 처리 및 캐시 추가", author: "Brian Y <koraussie@gmail.com>", lines: 687},
	{hash: "c0809c8", date: "2026-10-12", message: "feat(companion): 동반자 시스템 구현", author: "Brian Y <koraussie@gmail.com>", lines: 1217},
	{hash: "530761b", date: "2026-10-12", message: "feat(auth): 인증 및 보안 시스템 추가", author: "Brian Y <koraussie@gmail.com>", lines: 456},
	{hash: "c3c4d4e", date: "2026-10-12", message: "feat(nsfw): Qwen NSFW Image Editor with age verification", author: "Brian Y <koraussie@gmail.com>", lines: 403},
	{hash: "da517b1", date: "2026-10-12", message: "feat(letta): Letta AI integration (Tier 1d)", author: "Brian Y <koraussie@gmail.com>", lines: 1469},
	{hash: "9e2ddaf", date: "2026-10-11", message: "feat(nav): expand sidebar navigation + i18n locale refresh", author: "Brian Y <koraussie@gmail.com>", lines: 211},
	{hash: "3ac03ef", date: "2026-10-11", message: "feat(library): search/filter, card export & P2P share", author: "Brian Y <koraussie@gmail.com>", lines: 612},
	{hash: "2b05abb", date: "2026-10-11", message: "fix(sync): correct hook contract, dedupe nav, unhide panel", author: "Brian Y <koraussie@gmail.com>", lines: 156},
	{hash: "56d7912", date: "2026-10-11", message: "feat(models): WebGPU in-browser preset for Qwen3.5 9B RP", author: "Brian Y <koraussie@gmail.com>", lines: 67},
	{hash: "63a6c06", date: "2026-10-11", message: "fix(sync): real useP2PSync hook; add studio + character pages", author: "Brian Y <koraussie@gmail.com>", lines: 95},
	{hash: "aba7b3a", date: "2026-10-11", message: "feat(colibri): add gateway advertisement hook", author: "Brian Y <koraussie@gmail.com>", lines: 48},
	{hash: "f90bb2c", date: "2026-10-11", message: "chore: add dev auth server, align proxy port", author: "Brian Y <koraussie@gmail.com>", lines: 23},
	{hash: "b22a2b1", date: "2026-10-11", message: "chore(colibri): drop expired Nostr relays, advertise gateway", author: "Brian Y <koraussie@gmail.com>", lines: 21},
	{hash: "06c5a63", date: "2026-10-11", message: "Add /integrations page, menu entry and tests", author: "Brian Y <koraussie@gmail.com>", lines: 0},
	{hash: "0ac869f", date: "2026-10-11", message: "Wire my-neuro bridges into UI", author: "Brian Y <koraussie@gmail.com>", lines: 0},
	{hash: "7384215", date: "2026-10-11", message: "Add my-neuro interop bridges", author: "Brian Y <koraussie@gmail.com>", lines: 0},
	{hash: "e9c4b56", date: "2026-10-10", message: "Wire unified inference library into the app", author: "Brian Y <koraussie@gmail.com>", lines: 0},
	{hash: "b6a85d1", date: "2026-10-10", message: "feat(webllm): in-browser Qwen3.5 9B RP via WebGPU", author: "Brian Y <koraussie@gmail.com>", lines: 0},
	{hash: "27a8bf5", date: "2026-10-10", message: "feat(models): P2P-shareable local model presets with age-gate", author: "Brian Y <koraussie@gmail.com>", lines: 0},
	{hash: "29dd4cf", date: "2026-10-10", message: "Replace placeholder art with real photos for 108 companions", author: "Brian Y <koraussie@gmail.com>", lines: 0},
	{hash: "176af7e", date: "2026-10-10", message: "feat(guest): 3-message trial chat without signup", author: "Brian Y <koraussie@gmail.com>", lines: 0},
	{hash: "a553495", date: "2026-10-10", message: "feat(server): guest trial chat via freellmpool", author: "Brian Y <koraussie@gmail.com>", lines: 0},
	{hash: "51153b5", date: "2026-10-10", message: "Use real portrait photos for 8 new companions", author: "Brian Y <koraussie@gmail.com>", lines: 0},
	{hash: "ca4782c", date: "2026-10-10", message: "feat(server): character-card task for one-click companion", author: "Brian Y <koraussie@gmail.com>", lines: 0},
];

export function CommitsPage() {
	const { t } = useI18n();
	const [visible, setVisible] = useState(10);

	return (
<div className="flex-1 flex flex-col min-w-0 h-full overflow-y-auto p-6 md:p-8">
			<div className="max-w-4xl mx-auto">
				<div className="flex flex-col gap-2 mb-8">
					<h1 className="text-2xl font-extrabold text-white tracking-tight">
						{t("commits.title")}
					</h1>
					<p className="text-gray-400 text-sm">
						{t("commits.subtitle")}
					</p>
				</div>

				<div className="bg-[#0e0f17] rounded-2xl border border-white/5 p-6 md:p-8">
					<div className="flex items-center gap-3 mb-6">
						<h2 className="text-lg font-bold text-white">
							{t("commits.recentCommits")}
						</h2>
						<span className="text-xs text-gray-500">
							{COMMITS.length} commits
						</span>
					</div>

				<div className="space-y-3">
						{COMMITS.slice(0, visible).map((commit) => (
							<div
								key={commit.hash}
								className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors"
							>
								<div className="flex items-center gap-4 flex-1 min-w-0">
									<div className="w-10 h-10 rounded-lg bg-gradient-to-br from-pink-500/20 to-purple-500/20 flex-shrink-0 flex items-center justify-center text-sm font-bold text-pink-300">
										{commit.hash.slice(0, 7)}
									</div>
									<div className="min-w-0 flex-1">
										<div className="flex flex-wrap items-center gap-2">
											<span className="font-semibold text-white text-sm">
												{commit.hash.slice(0, 7)}
											</span>
											<span className="text-xs text-gray-500">
												{commit.date}
											</span>
										</div>
										<p className="text-sm text-gray-300 truncate">
											{commit.message}
										</p>
									</div>
								</div>
								<div className="flex items-center gap-4 text-xs text-gray-500 shrink-0">
									<span className="flex items-center gap-1">
										<span className="w-2 h-2 rounded-full bg-green-500" />
										{commit.lines} lines
									</span>
									<span className="text-gray-600">
										{commit.author}
									</span>
								</div>
							</div>
						))}

						{COMMITS.length > visible && (
							<div className="mt-6 text-center">
								<button
									onClick={() => setVisible((v) => v + 10)}
									className="px-4 py-2 rounded-xl bg-pink-500/10 border border-pink-500/20 text-pink-300 text-sm font-semibold hover:bg-pink-500/20 transition-colors"
								>
									{t("commits.loadMore")}
								</button>
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
