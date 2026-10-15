import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Template Studio — 카카오 알림톡 템플릿 검수 콘솔.
 *
 * KBizHub Business MCP(`sendgo-mcp`)의 `list_alimtalk_templates` 를 UI로 노출한다.
 * 알림톡은 카카오 심사 완료된 템플릿만 발송 가능하므로, Message Center 가 의존하는
 * 승인 상태를 이 화면에서 먼저 확인한다.
 *
 * MCP 서버 미연결 상태에서는 안내 문구로 대체한다(화면 동선 유지).
 * 헤더 라벨은 i18n을 쓰지 않는다(기존 사이드바 규칙과 동일).
 */

/** 카카오 알림톡 검수 상태. `sendgo-mcp` 응답의 inspectionStatus 값과 동일. */
type InspectionStatus = "REG" | "REQ" | "APR" | "REJ" | string;

interface Template {
	templateCode: string;
	templateName: string;
	status: InspectionStatus;
	messageType?: string;
	content?: string;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
	APR: { label: "승인", cls: "bg-green-500/15 text-green-300 border-green-500/25" },
	REQ: { label: "검수중", cls: "bg-blue-500/15 text-blue-300 border-blue-500/25" },
	REG: { label: "등록", cls: "bg-gray-500/15 text-gray-400 border-gray-500/25" },
	REJ: { label: "반려", cls: "bg-red-500/15 text-red-300 border-red-500/25" },
};

const STATUS_FILTERS = ["ALL", "APR", "REQ", "REG", "REJ"] as const;

function statusMeta(status: InspectionStatus) {
	return (
		STATUS_META[status] ?? {
			label: status || "알 수 없음",
			cls: "bg-gray-500/15 text-gray-400 border-gray-500/25",
		}
	);
}

/** 본문에 선언된 #{var} 변수만 뽑아낸다 — 치환 인자 안내용. */
export function extractTemplateVars(content: string): string[] {
	const found = new Set<string>();
	const re = /#\{([A-Za-z0-9_]+)\}/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(content)) !== null) found.add(m[1]);
	return [...found];
}

export function TemplateStudioPage() {
	const [templates, setTemplates] = useState<Template[]>([]);
	const [loading, setLoading] = useState(false);
	const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("ALL");
	const [query, setQuery] = useState("");
	const [selected, setSelected] = useState<Template | null>(null);
	const [error, setError] = useState<string | null>(null);

	/** MCP 게이트웨이가 붙으면 이 콜백을 실제 tools/call 로 교체한다. */
	const loadTemplates = useCallback(() => {
		setLoading(true);
		setTemplates([]);
		setError(
			"list_alimtalk_templates 는 MCP 게이트웨이 연동 후 동작합니다. " +
				"카카오 심사 상태는 sendgo 콘솔에서도 확인할 수 있습니다.",
		);
		setLoading(false);
	}, []);

	useEffect(() => {
		loadTemplates();
	}, [loadTemplates]);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		return templates.filter((t) => {
			if (statusFilter !== "ALL" && t.status !== statusFilter) return false;
			if (!q) return true;
			return (
				t.templateCode.toLowerCase().includes(q) ||
				t.templateName.toLowerCase().includes(q) ||
				(t.content ?? "").toLowerCase().includes(q)
			);
		});
	}, [templates, statusFilter, query]);

	const selectedVars = useMemo(
		() => extractTemplateVars(selected?.content ?? ""),
		[selected?.content],
	);

	const inputCls =
		"w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-pink-500/50";
	const labelCls = "block text-xs font-semibold text-gray-400 mb-1.5";

	return (
		<div className="flex-1 flex flex-col min-w-0 h-full overflow-y-auto p-6 md:p-8">
			<div className="max-w-5xl mx-auto">
				<div className="flex flex-col gap-2 mb-8">
					<h1 className="text-2xl font-extrabold text-white tracking-tight">Template Studio</h1>
					<p className="text-gray-400 text-sm">
						카카오 알림톡 템플릿 · 검수 상태 — KBizHub Business MCP(
						<code>list_alimtalk_templates</code>) 연동
					</p>
				</div>

				{error && (
					<div className="mb-4 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm">
						{error}
					</div>
				)}

				{/* 필터 바 */}
				<div className="flex flex-col md:flex-row gap-3 mb-6">
					<div className="flex items-center gap-2">
						<label className={labelCls} htmlFor="ts-status">
							검수 상태
						</label>
						<select
							id="ts-status"
							className={`${inputCls} w-auto`}
							value={statusFilter}
							onChange={(e) =>
								setStatusFilter(e.target.value as (typeof STATUS_FILTERS)[number])
							}
						>
							{STATUS_FILTERS.map((s) => (
								<option key={s} value={s} className="bg-[#0e0f17]">
									{s === "ALL" ? "전체" : statusMeta(s).label}
								</option>
							))}
						</select>
					</div>
					<input
						className={inputCls}
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="템플릿 코드·이름·본문 검색"
						aria-label="템플릿 검색"
					/>
					<button
						type="button"
						onClick={loadTemplates}
						disabled={loading}
						className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-gray-300 hover:bg-white/10 disabled:opacity-50 transition-colors"
					>
						{loading ? "조회 중…" : "새로고침"}
					</button>
				</div>

				{loading ? (
					<div className="bg-[#0e0f17] rounded-2xl border border-white/5 p-10 text-center text-gray-500 text-sm">
						템플릿을 불러오는 중…
					</div>
				) : filtered.length === 0 ? (
					<div className="bg-[#0e0f17] rounded-2xl border border-white/5 p-10 text-center">
						<p className="text-gray-400 text-sm">
							{templates.length === 0
								? "연동된 템플릿이 없습니다. MCP 게이트웨이 연결 후 list_alimtalk_templates 가 채워집니다."
								: "조건에 맞는 템플릿이 없습니다."}
						</p>
					</div>
				) : (
					<div className="grid md:grid-cols-[1fr_1.2fr] gap-6">
						{/* 목록 */}
						<div className="bg-[#0e0f17] rounded-2xl border border-white/5 divide-y divide-white/5">
							{filtered.map((t) => {
								const meta = statusMeta(t.status);
								const active = selected?.templateCode === t.templateCode;
								return (
									<button
										key={t.templateCode}
										type="button"
										onClick={() => setSelected(t)}
										className={`w-full text-left px-4 py-3 transition-colors ${
											active ? "bg-white/5" : "hover:bg-white/[0.03]"
										}`}
									>
										<div className="flex items-center justify-between gap-2 mb-1">
											<code className="text-xs text-gray-300 truncate">{t.templateCode}</code>
											<span
												className={`shrink-0 px-2 py-0.5 rounded-md border text-[11px] font-semibold ${meta.cls}`}
											>
												{meta.label}
											</span>
										</div>
										<p className="text-sm text-white truncate">{t.templateName}</p>
										{t.messageType && (
											<p className="text-xs text-gray-600 mt-0.5">{t.messageType}</p>
										)}
									</button>
								);
							})}
						</div>

						{/* 상세 */}
						<div className="bg-[#0e0f17] rounded-2xl border border-white/5 p-6">
							{selected ? (
								<>
									<div className="flex items-center gap-2 mb-4">
										<h2 className="text-lg font-bold text-white truncate">
											{selected.templateName}
										</h2>
										<span
											className={`shrink-0 px-2 py-0.5 rounded-md border text-[11px] font-semibold ${
												statusMeta(selected.status).cls
											}`}
										>
											{statusMeta(selected.status).label}
										</span>
									</div>

									<dl className="space-y-3 text-sm mb-6">
										<div>
											<dt className={labelCls}>templateCode</dt>
											<dd>
												<code className="text-xs text-pink-300">{selected.templateCode}</code>
											</dd>
										</div>
										{selected.messageType && (
											<div>
												<dt className={labelCls}>메시지 유형</dt>
												<dd className="text-gray-300">{selected.messageType}</dd>
											</div>
										)}
									</dl>

									{selected.content && (
										<div className="mb-6">
											<p className={labelCls}>본문</p>
											<pre className="whitespace-pre-wrap break-words rounded-xl bg-black/40 border border-white/5 p-3 text-xs text-gray-300 font-sans">
												{selected.content}
											</pre>
										</div>
									)}

									<div>
										<p className={labelCls}>
											치환 변수 ({selectedVars.length})
										</p>
										{selectedVars.length === 0 ? (
											<p className="text-xs text-gray-600">선언된 변수가 없습니다.</p>
										) : (
											<div className="flex flex-wrap gap-2">
												{selectedVars.map((v) => (
													<code
														key={v}
														className="px-2 py-1 rounded-md bg-pink-500/10 border border-pink-500/20 text-xs text-pink-200"
													>
														{`#{${v}}`}
													</code>
												))}
											</div>
										)}
										<p className="mt-2 text-xs text-gray-600">
											Message Center 에서 발송 시 위 변수를 값으로 채워야 합니다.
										</p>
									</div>
								</>
							) : (
								<div className="h-full flex items-center justify-center text-gray-600 text-sm py-16">
									왼쪽에서 템플릿을 선택하면 상세가 표시됩니다.
								</div>
							)}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

