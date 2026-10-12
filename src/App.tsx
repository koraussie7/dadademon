import { AuthGate } from "@/components/AuthGate";
import { CandyDiscover } from "@/components/CandyDiscover";
import { CandySidebar } from "@/components/CandySidebar";
import { CreateCompanionModal } from "@/components/CreateCompanionModal";
import { RequireAuth } from "@/components/RequireAuth";
import { CANDY_PRESETS, type CandyCompanion, loadAllCandyPresets } from "@/data/candyPresets";
import { useAuth } from "@/hooks/useAuth";
import { useColibriGatewayAdvert, useTrystero } from "@/hooks/useTrysteroP2P";
import { useI18n } from "@/lib/i18n";
import { IntegrationProvider } from "@/lib/integration/PrivseAIAdapter";
import { LoginPage } from "@/pages/LoginPage";

import { Suspense, lazy, useEffect, useState } from "react";
import { NavLink, Navigate, Route, BrowserRouter as Router, Routes } from "react-router-dom";

// Route-level code splitting. Without this, every page is bundled into the main
// entry, so a first-time visitor downloads the chat page, the studio, the AI hub
// and the whole P2P ledger just to render the landing screen.
//
// LoginPage, CandyDiscover, CandySidebar and AuthGate stay eager — they are on
// the entry path and splitting them would add a flash of the suspense fallback
// before anything meaningful paints.
const CandyChatPage = lazy(() =>
	import("@/pages/CandyChatPage").then((m) => ({ default: m.CandyChatPage })),
);
const CandyCollection = lazy(() =>
	import("@/components/CandyCollection").then((m) => ({ default: m.CandyCollection })),
);
const CharacterLibraryPage = lazy(() =>
	import("@/pages/CharacterLibraryPage").then((m) => ({ default: m.CharacterLibraryPage })),
);
const WorldCockpit = lazy(() =>
	import("@/components/WorldCockpit").then((m) => ({ default: m.WorldCockpit })),
);
const AIHubPage = lazy(() => import("@/pages/AIHubPage").then((m) => ({ default: m.AIHubPage })));
const LiveEvents = lazy(() =>
	import("@/components/LiveEvents").then((m) => ({ default: m.LiveEvents })),
);
const ForecastLedger = lazy(() =>
	import("@/components/ForecastLedger").then((m) => ({ default: m.ForecastLedger })),
);
const EvidenceExplorer = lazy(() =>
	import("@/components/EvidenceExplorer").then((m) => ({ default: m.EvidenceExplorer })),
);
const ImpactAnalysis = lazy(() =>
	import("@/components/ImpactAnalysis").then((m) => ({ default: m.ImpactAnalysis })),
);
const StudioPage = lazy(() =>
	import("@/pages/StudioPage").then((m) => ({ default: m.StudioPage })),
);
const MarketplacePage = lazy(() =>
	import("@/pages/MarketplacePage").then((m) => ({ default: m.MarketplacePage })),
);
const MyNeuroPage = lazy(() =>
	import("@/pages/MyNeuroPage").then((m) => ({ default: m.MyNeuroPage })),
);
const PricingPage = lazy(() =>
	import("@/pages/PricingPage").then((m) => ({ default: m.PricingPage })),
);
const AccountSettingsPage = lazy(() =>
	import("@/pages/AccountSettingsPage").then((m) => ({ default: m.AccountSettingsPage })),
);
const ImageEditPage = lazy(() =>
	import("@/pages/ImageEditPage").then((m) => ({ default: m.ImageEditPage })),
);
const APIKeysPage = lazy(() =>
	import("@/pages/APIKeysPage").then((m) => ({ default: m.APIKeysPage })),
);

/** Shown while a lazily-loaded route chunk is in flight. */
function RouteFallback() {
	return (
		<div className="flex-1 flex items-center justify-center">
			<div className="flex flex-col items-center gap-3">
				<div className="w-8 h-8 rounded-full border-2 border-pink-500/30 border-t-pink-500 animate-spin" />
				<p className="text-sm text-gray-500">Loading…</p>
			</div>
		</div>
	);
}

const STORAGE_CUSTOM = "privseai_candy-custom_companions";

export function App() {
	const { t } = useI18n();
	const [companions, setCompanions] = useState<CandyCompanion[]>(() => {
		const saved = localStorage.getItem(STORAGE_CUSTOM);
		if (saved) {
			try {
				const custom = JSON.parse(saved);
				return [...CANDY_PRESETS, ...custom];
			} catch {
				return CANDY_PRESETS;
			}
		}
		return CANDY_PRESETS;
	});

	// Lazily load the full 100-entry preset list on mount so the JSON
	// chunk stays out of the initial bundle. The eager CANDY_PRESETS
	// (6 featured entries) is rendered immediately, then this effect
	// swaps in the full list a moment later.
	useEffect(() => {
		let cancelled = false;
		loadAllCandyPresets().then((all) => {
			if (cancelled) return;
			setCompanions((current) => {
				const known = new Set(current.map((c) => c.id));
				const merged = [...current, ...all.filter((p) => !known.has(p.id))];
				return merged;
			});
		});
		// Preload IndexedDB-cached images so the next AIHubPage mount
		// can restore previously generated portraits without waiting
		// for the first ComfyUI round-trip.
		void import("@/lib/image-cache").then(({ getAllCachedImages }) =>
			getAllCachedImages().catch(() => []),
		);
		// Preload the user's locale JSON chunk so the first paint of the
		// sidebar shows translated strings instead of falling back to keys.
		void import("@/lib/i18n").then(({ preloadI18n }) => preloadI18n().catch(() => undefined));
		return () => {
			cancelled = true;
		};
	}, []);

	const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
	const [editingCompanion, setEditingCompanion] = useState<CandyCompanion | null>(null);
	const [mobileNavOpen, setMobileNavOpen] = useState(false);

	const isCustomCompanion = (companion: CandyCompanion) =>
		!CANDY_PRESETS.some((preset) => preset.id === companion.id);

	const persistCustomCompanions = (list: CandyCompanion[]) => {
		const customOnly = list.filter((c) => isCustomCompanion(c));
		localStorage.setItem(STORAGE_CUSTOM, JSON.stringify(customOnly));
	};
	useEffect(() => {
		try {
			const progress = JSON.parse(
				localStorage.getItem("privseai_candy_relationship_progress") || "{}",
			) as Record<string, { stage?: number }>;
			setCompanions((current) =>
				current.map((companion) => {
					const stage = Math.max(companion.stage, progress[companion.id]?.stage ?? 0);
					return {
						...companion,
						stage,
						gallery: companion.gallery.map((photo) => ({
							...photo,
							isUnlocked: photo.isUnlocked || (photo.requiredStage ?? 0) <= stage,
						})),
					};
				}),
			);
		} catch {
			localStorage.removeItem("privseai_candy_relationship_progress");
		}
	}, []);

	const { colibriPeers, network } = useTrystero();
	// Advertise this peer's Colibri gateway so peers can discover it for
	// distributed inference. No-op unless VITE_COLIBRI_ADVERT_ENABLED=true and
	// VITE_FELLOWSHIP_URL is a publicly reachable origin.
	const { state: colibriGatewayState } = useColibriGatewayAdvert();
	// A gateway that is currently advertising counts toward the visible mesh:
	// it is a live, reachable node even before any peer has answered.
	const peerCount =
		(network?.peers.length ?? 0) +
		colibriPeers.length +
		(colibriGatewayState === "advertising" ? 1 : 0);
	const { user, logout } = useAuth();

	const handleCreateCompanion = (newComp: CandyCompanion) => {
		const updated = [newComp, ...companions];
		setCompanions(updated);
		persistCustomCompanions(updated);
	};

	const handleUpdateCompanion = (updatedComp: CandyCompanion) => {
		const updated = companions.map((c) => (c.id === updatedComp.id ? updatedComp : c));
		setCompanions(updated);
		persistCustomCompanions(updated);
	};

	const handleDeleteCompanion = (id: string) => {
		const target = companions.find((c) => c.id === id);
		if (!target || !isCustomCompanion(target)) return;
		if (!window.confirm(`"${target.name}" 캐릭터를 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)) {
			return;
		}
		const updated = companions.filter((c) => c.id !== id);
		setCompanions(updated);
		persistCustomCompanions(updated);
	};

	const goHome = () => {
		window.location.href = "/";
	};
	const goSettings = () => {
		window.location.href = "/settings";
	};

	return (
		<Router>
			<IntegrationProvider autoInitLocal={false}>
				<div className="flex h-screen w-screen overflow-hidden bg-[#090a0f] text-gray-100 font-sans selection:bg-pink-500 selection:text-white">
					{/* Candy Styled Desktop Sidebar */}
					<CandySidebar
						onOpenCreateModal={() => setIsCreateModalOpen(true)}
						peerCount={peerCount}
						user={user}
						onLogout={() => {
							logout();
							window.location.href = "/login";
						}}
					/>

					{/* Main Content Layout */}
					<div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
						{/* Mobile Top Header */}
						<header className="md:hidden flex h-14 items-center justify-between px-4 border-b border-white/10 bg-[#0e0f17] shrink-0 z-30">
							<NavLink to="/" className="flex items-center gap-2">
								<span className="w-8 h-8 rounded-xl bg-candy-gradient flex items-center justify-center text-sm shadow-md shadow-pink-500/20">
									🍬
								</span>
								<span className="font-extrabold text-sm tracking-wide candy-text-gradient">
									PRIVSEAI CANDY
								</span>
							</NavLink>

							<div className="flex items-center gap-2">
								<button
									type="button"
									onClick={() => setIsCreateModalOpen(true)}
									className="px-2.5 py-1 rounded-xl bg-candy-gradient text-xs font-bold text-white shadow-sm"
								>
									+ Create
								</button>
								<button
									type="button"
									onClick={() => setMobileNavOpen((v) => !v)}
									className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-gray-300"
								>
									{mobileNavOpen ? "✕" : "☰"}
								</button>
							</div>
						</header>

						{/* Mobile Drawer Menu */}
						{mobileNavOpen && (
							<div className="md:hidden bg-[#0e0f17] border-b border-white/10 p-4 space-y-2 z-30 shrink-0">
								<NavLink
									to="/"
									onClick={() => setMobileNavOpen(false)}
									className="block px-3 py-2 rounded-xl text-sm font-semibold hover:bg-white/5"
								>
									🔥 Discover
								</NavLink>
								<NavLink
									to="/chat"
									onClick={() => setMobileNavOpen(false)}
									className="block px-3 py-2 rounded-xl text-sm font-semibold hover:bg-white/5"
								>
									💬 Chat
								</NavLink>
								<NavLink
									to="/collection"
									onClick={() => setMobileNavOpen(false)}
									className="block px-3 py-2 rounded-xl text-sm font-semibold hover:bg-white/5"
								>
									📸 Gallery & Memories
								</NavLink>
								<NavLink
									to="/library"
									onClick={() => setMobileNavOpen(false)}
									className="block px-3 py-2 rounded-xl text-sm font-semibold hover:bg-white/5"
								>
									🗂️ Character Library
								</NavLink>
								<NavLink
									to="/hub"
									onClick={() => setMobileNavOpen(false)}
									className="block px-3 py-2 rounded-xl text-sm font-semibold hover:bg-white/5"
								>
									🧠 AI Hub
								</NavLink>
								<NavLink
									to="/image-edit"
									onClick={() => setMobileNavOpen(false)}
									className="block px-3 py-2 rounded-xl text-sm font-semibold hover:bg-white/5"
								>
									🎨 Qwen NSFW Editor
								</NavLink>
								<NavLink
									to="/pricing"
									onClick={() => setMobileNavOpen(false)}
									className="block px-3 py-2 rounded-xl text-sm font-semibold hover:bg-white/5"
								>
									💎 Pricing
								</NavLink>
								<NavLink
									to="/marketplace"
									onClick={() => setMobileNavOpen(false)}
									className="block px-3 py-2 rounded-xl text-sm font-semibold hover:bg-white/5"
								>
									🛍️ {t("marketplace.menu")}
								</NavLink>
								<NavLink
									to="/integrations"
									onClick={() => setMobileNavOpen(false)}
									className="block px-3 py-2 rounded-xl text-sm font-semibold hover:bg-white/5"
								>
									🔌 Integrations
								</NavLink>
								<NavLink
									to="/studio"
									onClick={() => setMobileNavOpen(false)}
									className="block px-3 py-2 rounded-xl text-sm font-semibold hover:bg-white/5"
								>
									🔬 Studio
								</NavLink>
								<NavLink
									to="/events"
									onClick={() => setMobileNavOpen(false)}
									className="block px-3 py-2 rounded-xl text-sm font-semibold hover:bg-white/5"
								>
									📡 Live Events
								</NavLink>
								<NavLink
									to="/forecasts"
									onClick={() => setMobileNavOpen(false)}
									className="block px-3 py-2 rounded-xl text-sm font-semibold hover:bg-white/5"
								>
									🔮 Forecasts
								</NavLink>
								<NavLink
									to="/evidence"
									onClick={() => setMobileNavOpen(false)}
									className="block px-3 py-2 rounded-xl text-sm font-semibold hover:bg-white/5"
								>
									🗃 Evidence
								</NavLink>
								<NavLink
									to="/impact"
									onClick={() => setMobileNavOpen(false)}
									className="block px-3 py-2 rounded-xl text-sm font-semibold hover:bg-white/5"
								>
									💥 Impact
								</NavLink>
								<NavLink
									to="/settings"
									onClick={() => setMobileNavOpen(false)}
									className="block px-3 py-2 rounded-xl text-sm font-semibold hover:bg-white/5"
								>
									⚙️ Settings
								</NavLink>
								<NavLink
									to="/world"
									onClick={() => setMobileNavOpen(false)}
									className="block px-3 py-2 rounded-xl text-sm font-semibold hover:bg-white/5"
								>
									🌐 P2P Mesh
								</NavLink>
								{!user && (
									<>
										<NavLink
											to="/login"
											onClick={() => setMobileNavOpen(false)}
											className="block px-3 py-2 rounded-xl text-sm font-semibold hover:bg-white/5"
										>
											🔐 Log in
										</NavLink>
										<NavLink
											to="/register"
											onClick={() => setMobileNavOpen(false)}
											className="block px-3 py-2 rounded-xl text-sm font-semibold text-pink-300 hover:bg-white/5"
										>
											🞥 Sign up free
										</NavLink>
									</>
								)}
							</div>
						)}

						{/* Route Screens */}
						<main className="flex-1 flex min-h-0 w-full overflow-hidden relative">
							<Suspense fallback={<RouteFallback />}>
								<Routes>
									<Route
										path="/login"
										element={<LoginPage onAuthSuccess={() => window.location.reload()} />}
									/>
									<Route
										path="/register"
										element={
											<LoginPage
												initialMode="signup"
												onAuthSuccess={() => window.location.reload()}
											/>
										}
									/>
									<Route
										index
										element={
											<AuthGate>
												<CandyDiscover
													companions={companions}
													onOpenCreate={() => setIsCreateModalOpen(true)}
												/>
											</AuthGate>
										}
									/>
									<Route
										path="/chat"
										element={
											<AuthGate>
												<CandyChatPage />
											</AuthGate>
										}
									/>
									<Route
										path="/chat/:companionId"
										element={
											<AuthGate>
												<CandyChatPage />
											</AuthGate>
										}
									/>
									<Route
										path="/collection"
										element={
											<AuthGate>
												<CandyCollection
													companions={companions}
													onEdit={setEditingCompanion}
													onDelete={handleDeleteCompanion}
												/>
											</AuthGate>
										}
									/>
									{/* Character card import + gallery. Shares the
						    `privseai_companion_cards` key that Chat reads, so cards
						    imported here become selectable companions. */}
									<Route
										path="/library"
										element={
											<AuthGate>
												<CharacterLibraryPage />
											</AuthGate>
										}
									/>
									{/* Preserve original P2P utility routes for ecosystem compatibility */}
									<Route
										path="/world"
										element={
											<AuthGate>
												<WorldCockpit />
											</AuthGate>
										}
									/>
									<Route
										path="/hub"
										element={
											<AuthGate>
												<AIHubPage />
											</AuthGate>
										}
									/>
									<Route
										path="/events"
										element={
											<AuthGate>
												<LiveEvents />
											</AuthGate>
										}
									/>
									<Route
										path="/forecasts"
										element={
											<AuthGate>
												<ForecastLedger />
											</AuthGate>
										}
									/>
									<Route
										path="/evidence"
										element={
											<AuthGate>
												<EvidenceExplorer />
											</AuthGate>
										}
									/>
									<Route
										path="/impact"
										element={
											<AuthGate>
												<ImpactAnalysis />
											</AuthGate>
										}
									/>
									{/* Single entry point + tab bar for the four ledgers above.
						    /events, /evidence, /forecasts and /impact were routable
						    but unlinked, so this is the only discoverable way in. */}
									<Route
										path="/studio"
										element={
											<AuthGate>
												<StudioPage />
											</AuthGate>
										}
									/>
									<Route path="/pricing" element={<PricingPage onBack={goHome} />} />
									<Route
										path="/marketplace"
										element={
											<AuthGate>
												<MarketplacePage />
											</AuthGate>
										}
									/>
									<Route
										path="/integrations"
										element={
											<AuthGate>
												<MyNeuroPage />
											</AuthGate>
										}
									/>
									<Route
										path="/settings"
										element={
											<RequireAuth>
												<AccountSettingsPage onBack={goHome} />
											</RequireAuth>
										}
									/>
									<Route
										path="/settings/api-keys"
										element={
											<RequireAuth>
												<APIKeysPage onBack={goSettings} />
											</RequireAuth>
										}
									/>
									<Route
										path="/image-edit"
										element={
											<AuthGate>
												<ImageEditPage />
											</AuthGate>
										}
									/>
									<Route path="*" element={<Navigate to="/collection" replace />} />
								</Routes>
							</Suspense>
						</main>
					</div>

					{/* Create / Edit Character Modal */}
					<CreateCompanionModal
						isOpen={isCreateModalOpen || editingCompanion !== null}
						editingCompanion={editingCompanion}
						onClose={() => {
							setIsCreateModalOpen(false);
							setEditingCompanion(null);
						}}
						onCreate={handleCreateCompanion}
						onUpdate={handleUpdateCompanion}
					/>
				</div>
			</IntegrationProvider>
		</Router>
	);
}
