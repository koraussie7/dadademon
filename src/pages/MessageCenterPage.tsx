import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Message Center — 카카오 알림톡 / SMS 발송 콘솔.
 *
 * KBizHub Business MCP(`sendgo-mcp`)의 `send_alimtalk` · `send_sms` ·
 * `list_kakao_senders` 세 도구를 UI로 노출한다. 아직 MCP 서버를 붙이지 않은
 * 상태에서도 화면 동선이 끊기지 않도록, 발송은 로컬 큐에 적재하고 실제 전송은
 * 게이트웨이 연동 후 활성화한다.
 *
 * 헤더 라벨은 i18n을 쓰지 않는다(PrivseHeader 와 동일한 기존 규칙).
 */

type Channel = "alimtalk" | "sms";

interface QueuedMessage {
	id: string;
	channel: Channel;
	to: string;
	subject: string;
	body: string;
	senderKey: string;
	createdAt: string;
}

/** MCP `send_alimtalk` / `send_sms` 가 받는 파라미터와 동일한 이름을 쓴다. */
interface Draft {
	channel: Channel;
	kakaoSenderKey: string;
	smsSenderKey: string;
	templateCode: string;
	to: string;
	subject: string;
	body: string;
}

const EMPTY_DRAFT: Draft = {
	channel: "alimtalk",
	kakaoSenderKey: "",
	smsSenderKey: "",
	templateCode: "",
	to: "",
	subject: "",
	body: "",
};

const MCP_TOOL: Record<Channel, string> = {
	alimtalk: "send_alimtalk",
	sms: "send_sms",
};

/** Sendgo 는 LMS 제목 40자, 본문 2000자, 알림톡 본문 1000자 를 상한으로 둔다. */
const LIMIT = {
	smsSubject: 40,
	smsBody: 2000,
	alimtalkBody: 1000,
} as const;

/**
 * 010-1234-5678 / 01012345678 / +821012345678 → 01012345678.
 * `sendgo-mcp` 의 validatePhone 규칙과 동일하게 숫자만 남긴다.
 */
export function normalizePhone(raw: string): string {
	const digits = raw.replace(/\D/g, "");
	if (digits.startsWith("82")) return `0${digits.slice(2)}`;
	return digits;
}

/** sendgo-mcp 의 validatePhone 과 같은 허용 폭 — 10~11자리 국내 번호. */
export function isValidPhone(raw: string): boolean {
	return /^01[016789]\d{7,8}$/.test(normalizePhone(raw));
}

export function MessageCenterPage() {
	const [senders, setSenders] = useState<string[]>([]);
	const [sendersLoaded, setSendersLoaded] = useState(false);
	const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
	const [queue, setQueue] = useState<QueuedMessage[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);

	// `list_kakao_senders` 결과를 로컬 저장소에 캐시해 둔다. MCP 미연결 상태에서도
	// 이전에 등록한 발신프로필이 사라지지 않게 하기 위함.
	useEffect(() => {
		try {
			const raw = window.localStorage.getItem("kbizhub_kakao_senders");
			if (raw) {
				const parsed: unknown = JSON.parse(raw);
				if (Array.isArray(parsed)) {
					setSenders(parsed.filter((v): v is string => typeof v === "string"));
				}
			}
		} catch {
			// 손상된 캐시는 무시 — 재조회하면 된다.
		}
		setSendersLoaded(true);
	}, []);

	/** MCP 게이트웨이가 붙으면 이 콜백을 실제 tools/call 로 교체한다. */
	const refreshSenders = useCallback(() => {
		setError(
			"list_kakao_senders 는 MCP 게이트웨이 연동 후 동작합니다. " +
				"지금은 발신프로필 키를 직접 붙여넣어 사용할 수 있습니다.",
		);
	}, []);

	const bodyLimit = draft.channel === "sms" ? LIMIT.smsBody : LIMIT.alimtalkBody;
	const activeSenderKey = draft.channel === "alimtalk" ? draft.kakaoSenderKey : draft.smsSenderKey;

	const validation = useMemo(() => {
		if (!activeSenderKey.trim()) {
			return draft.channel === "alimtalk"
				? "발신프로필(kakaoSenderKey) 이 필요합니다."
				: "발신번호(smsSenderKey) 가 필요합니다.";
		}
		if (draft.channel === "alimtalk" && !draft.templateCode.trim()) {
			return "알림톡은 승인된 templateCode 가 필요합니다.";
		}
		if (!isValidPhone(draft.to)) {
			return "수신번호가 올바르지 않습니다. 예: 010-1234-5678";
		}
		if (!draft.body.trim()) {
			return draft.channel === "sms" ? "SMS 본문이 비어 있습니다." : "알림톡 본문이 비어 있습니다.";
		}
		return null;
	}, [activeSenderKey, draft]);

	const enqueue = () => {
		if (validation) {
			setError(validation);
			setNotice(null);
			return;
		}
		const message: QueuedMessage = {
			id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
			channel: draft.channel,
			to: normalizePhone(draft.to),
			subject: draft.subject.trim(),
			body: draft.body.trim(),
			senderKey: activeSenderKey.trim(),
			createdAt: new Date().toLocaleString("ko-KR"),
		};
		setQueue((prev) => [message, ...prev]);
		setError(null);
		setNotice(`${MCP_TOOL[draft.channel]} 큐에 적재했습니다 (전송 대기).`);
		setDraft((prev) => ({ ...prev, to: "", subject: "", body: "", templateCode: "" }));
	};

	const patch = (key: keyof Draft, value: string) => {
		setDraft((prev) => ({ ...prev, [key]: value }));
		if (error) setError(null);
	};


	const inputCls =
		"w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-pink-500/50";
	const labelCls = "block text-xs font-semibold text-gray-400 mb-1.5";

	return (
		<div className="flex-1 flex flex-col min-w-0 h-full overflow-y-auto p-6 md:p-8">
			<div className="max-w-4xl mx-auto">
				<div className="flex flex-col gap-2 mb-8">
					<h1 className="text-2xl font-extrabold text-white tracking-tight">Message Center</h1>
					<p className="text-gray-400 text-sm">
						카카오 알림톡 · SMS 발송 콘솔 — KBizHub Business MCP(<code>sendgo-mcp</code>) 연동
					</p>
				</div>

				{notice && (
					<div className="mb-4 px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-300 text-sm">
						{notice}
					</div>
				)}
				{error && (
					<div className="mb-4 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm">
						{error}
					</div>
				)}

				<div className="grid md:grid-cols-2 gap-6">
					{/* 발송 폼 */}
					<div className="bg-[#0e0f17] rounded-2xl border border-white/5 p-6">
						<div className="flex items-center gap-2 mb-5">
							{(["alimtalk", "sms"] as Channel[]).map((ch) => (
								<button
									key={ch}
									type="button"
									onClick={() => patch("channel", ch)}
									className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${
										draft.channel === ch
											? "bg-pink-500/20 border border-pink-500/40 text-pink-200"
											: "bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10"
									}`}
								>
									{ch === "alimtalk" ? "💬 알림톡" : "📱 SMS"}
								</button>
							))}
						</div>


					<div className="space-y-4">
						{draft.channel === "alimtalk" ? (
							<>
								<div>
									<label className={labelCls} htmlFor="mc-kakao-key">
										kakaoSenderKey <span className="text-red-400">*</span>
									</label>
									<input
										id="mc-kakao-key"
										className={inputCls}
										value={draft.kakaoSenderKey}
										onChange={(e) => patch("kakaoSenderKey", e.target.value)}
										placeholder="발신프로필 키"
										list="mc-senders"
									/>
									{senders.length > 0 && (
										<datalist id="mc-senders">
											{senders.map((s) => (
												<option key={s} value={s} />
											))}
										</datalist>
									)}
								</div>
								<div>
									<label className={labelCls} htmlFor="mc-template">
										templateCode <span className="text-red-400">*</span>
									</label>
									<input
										id="mc-template"
										className={inputCls}
										value={draft.templateCode}
										onChange={(e) => patch("templateCode", e.target.value)}
										placeholder="승인된 알림톡 템플릿 코드"
									/>
									<p className="mt-1.5 text-xs text-gray-600">
										카카오 심사 완료된 템플릿만 발송됩니다. 본문은 템플릿 변수와 맞춰야 합니다.
									</p>
								</div>
							</>
						) : (
							<div>
								<label className={labelCls} htmlFor="mc-sms-key">
									smsSenderKey <span className="text-red-400">*</span>
								</label>
								<input
									id="mc-sms-key"
									className={inputCls}
									value={draft.smsSenderKey}
									onChange={(e) => patch("smsSenderKey", e.target.value)}
									placeholder="사전 등록된 발신번호"
								/>
							</div>
						)}

						<div>
							<label className={labelCls} htmlFor="mc-to">
								수신번호 <span className="text-red-400">*</span>
							</label>
							<input
								id="mc-to"
								className={inputCls}
								value={draft.to}
								onChange={(e) => patch("to", e.target.value)}
								placeholder="010-1234-5678"
								inputMode="tel"
							/>
							{draft.to && !isValidPhone(draft.to) && (
								<p className="mt-1.5 text-xs text-amber-400">국내 휴대폰 번호 형식이 아닙니다.</p>
							)}
						</div>

						{draft.channel === "sms" && (
							<div>
								<label className={labelCls} htmlFor="mc-subject">
									제목 (LMS 전용)
								</label>
								<input
									id="mc-subject"
									className={inputCls}
									value={draft.subject}
									onChange={(e) => patch("subject", e.target.value)}
									placeholder="장문 문자 제목"
									maxLength={LIMIT.smsSubject}
								/>
								<p className="mt-1.5 text-xs text-gray-600">
									{draft.subject.length}/{LIMIT.smsSubject}
								</p>
							</div>
						)}

						<div>
							<label className={labelCls} htmlFor="mc-body">
								본문 <span className="text-red-400">*</span>
							</label>
							<textarea
								id="mc-body"
								className={`${inputCls} resize-y min-h-[120px]`}
								value={draft.body}
								onChange={(e) => patch("body", e.target.value)}
								placeholder={
									draft.channel === "sms"
										? "90자 이하는 단문(SMS), 이후는 장문(LMS)으로 자동 분기됩니다."
										: "템플릿 변수에 맞춰 작성하세요."
								}
							/>
							<p
								className={`mt-1.5 text-xs ${
									draft.body.length > bodyLimit ? "text-red-400" : "text-gray-600"
								}`}
							>
								{draft.body.length}/{bodyLimit}
								{draft.channel === "sms" &&
									draft.body.length > 0 &&
									draft.body.length <= 90 &&
									" · 단문(SMS)"}
							</p>
						</div>

						<button
							type="button"
							onClick={enqueue}
							disabled={Boolean(validation) || draft.body.length > bodyLimit}
							className="w-full py-2.5 rounded-xl text-sm font-bold bg-pink-500/20 border border-pink-500/40 text-pink-200 hover:bg-pink-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
						>
							큐에 적재 · <code className="text-xs">{MCP_TOOL[draft.channel]}</code>
						</button>
					</div>
				</div>

				{/* 발송 큐 */}
				<div className="bg-[#0e0f17] rounded-2xl border border-white/5 p-6">
					<div className="flex items-center justify-between mb-4">
						<h2 className="text-sm font-bold text-white">발송 큐 ({queue.length})</h2>
						<div className="flex items-center gap-2">
							<button
								type="button"
								onClick={refreshSenders}
								className="text-xs text-gray-400 hover:text-white transition-colors"
							>
								발신프로필 조회
							</button>
							{queue.length > 0 && (
								<button
									type="button"
									onClick={() => setQueue([])}
									className="text-xs text-red-400 hover:text-red-300 transition-colors"
								>
									비우기
								</button>
							)}
						</div>
					</div>

					{sendersLoaded && senders.length === 0 && (
						<p className="mb-4 text-xs text-gray-600">
							등록된 발신프로필이 없습니다. <code>list_kakao_senders</code> 연동 후 자동으로 채워집니다.
						</p>
					)}

					{queue.length === 0 ? (
						<p className="text-sm text-gray-600">대기 중인 메시지가 없습니다.</p>
					) : (
						<ul className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
							{queue.map((m) => (
								<li
									key={m.id}
									className="px-3 py-2.5 rounded-xl bg-white/5 border border-white/5"
								>
									<div className="flex items-center gap-2 mb-1">
										<span
											className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
												m.channel === "alimtalk"
													? "bg-yellow-400/15 text-yellow-300"
													: "bg-blue-400/15 text-blue-300"
											}`}
										>
											{m.channel === "alimtalk" ? "알림톡" : "SMS"}
										</span>
										<span className="text-xs text-white font-mono">{m.to}</span>
										<span className="ml-auto text-[10px] text-gray-600">{m.createdAt}</span>
									</div>
									<p className="text-xs text-gray-400 whitespace-pre-wrap break-words line-clamp-2">
										{m.body}
									</p>
								</li>
							))}
						</ul>
					)}
				</div>
			</div>
		</div>
	</div>
	);
}

