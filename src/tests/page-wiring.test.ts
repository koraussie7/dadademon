import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards against the exact failure that shipped twice: a page (or a whole
 * component) that is fully written but never mounted, so it is unreachable in
 * the running app. Type-checking cannot catch this — an unused import is valid
 * TypeScript — and neither can a render test, since nothing renders it.
 *
 * The check is static on purpose: it compares the page modules on disk against
 * the modules App.tsx actually routes.
 */
const SRC = path.resolve(import.meta.dirname, "..");
const PAGES_DIR = path.join(SRC, "pages");
const APP = path.join(SRC, "App.tsx");
const SIDEBAR = path.join(SRC, "components/CandySidebar.tsx");

const app = fs.readFileSync(APP, "utf8");
const sidebar = fs.readFileSync(SIDEBAR, "utf8");

/** Every `export function XPage` in a page module. */
function pageModules(): string[] {
	return fs
		.readdirSync(PAGES_DIR)
		.filter((f) => f.endsWith(".tsx"))
		.map((f) => f.replace(/\.tsx$/, ""));
}

/** Route paths declared in App.tsx, from `path="/x"` or `index`. */
function routedPaths(): string[] {
	return [...app.matchAll(/path="([^"]+)"/g)].map((m) => m[1]);
}

/** True when App.tsx declares an `index` route (i.e. the parent's `/`). */
function hasIndexRoute(): boolean {
	return /\bindex\s+(?:element|\/>)/.test(app);
}

/** `to="/x"` targets in the sidebar. */
function sidebarPaths(): string[] {
	return [...sidebar.matchAll(/to="([^"]+)"/g)].map((m) => m[1]);
}

/**
 * Pages that are legitimately not routed. Add an entry only with a reason:
 * anything listed here is unreachable in the running app.
 */
const INTENTIONALLY_UNROUTED: Record<string, string> = {
	// Superseded by CandyChatPage at /chat; kept only as reference for the
	// PersonalityEngine + CompanionChat pairing. Delete once CandyChatPage
	// covers the emotion/personality surface.
	ChatPage: "duplicate of /chat, which CandyChatPage owns",
};

/**
 * Routed paths that are intentionally absent from the sidebar, with a reason.
 */
const INTENTIONALLY_UNLINKED: Record<string, string> = {
	// Reached from the API Keys button in Settings, not the nav.
	"/settings/api-keys": "reached from Settings",
};

describe("page wiring", () => {
	const pages = pageModules().filter((p) => !(p in INTENTIONALLY_UNROUTED));

	it.each(pages)("%s is imported by App.tsx", (page) => {
		expect(app).toContain(`pages/${page}`);
	});

	it.each(pages)("%s is rendered as a route element", (page) => {
		// Pages may take props (`<PricingPage onBack={goHome} />`), so match the
		// opening tag rather than a self-closing one.
		expect(app).toMatch(new RegExp(`<${page}[\\s/>]`));
	});

	it("lists a reason for every unrouted page module", () => {
		const unlisted = pageModules().filter(
			(p) => !INTENTIONALLY_UNROUTED[p] && !app.includes(`pages/${p}`),
		);
		expect(unlisted).toEqual([]);
	});
});

const DRAWER_MARKER = "{/* Mobile Drawer Menu */}";
const ROUTES_MARKER = "{/* Route Screens */}";

describe("navigation wiring", () => {
	const routed = routedPaths();
	const linked = sidebarPaths();

	it("declares routes", () => {
		expect(routed.length).toBeGreaterThan(0);
	});

	it("has no dead sidebar links pointing at unrouted paths", () => {
		// `/` is served by the `index` route, which has no `path=` attribute.
		const known = hasIndexRoute() ? [...routed, "/"] : routed;
		const unrouted = linked.filter((p) => !known.includes(p));
		expect(unrouted).toEqual([]);
	});

	describe("mobile drawer parity", () => {
		/**
		 * The mobile drawer in App.tsx is a hand-maintained copy of the sidebar.
		 * It drifted twice: `/world` and `/settings` existed in the sidebar but had
		 * no drawer entry, so phone users could not reach the P2P cockpit or their
		 * own account settings at all.
		 */
		// Scope to the drawer itself: splitting on the Route Screens comment would
		// also capture the header, whose logo link intentionally has no handler.
		const drawerStart = app.indexOf(DRAWER_MARKER);
		const drawerEnd = app.indexOf(ROUTES_MARKER);
		const drawerSource = app.slice(drawerStart, drawerEnd);
		const drawerPaths = [...drawerSource.matchAll(/to="([^"]+)"/g)].map((m) => m[1]);

		it("offers every sidebar destination", () => {
			// `/login` is a conditional sign-in CTA: the sidebar renders it only for
			// signed-out visitors, who are not browsing the drawer nav.
			const conditional = ["/login"];
			const expected = [...new Set(sidebarPaths())].filter((p) => !conditional.includes(p));
			const missing = expected.filter((p) => !drawerPaths.includes(p));
			expect(missing).toEqual([]);
		});

		it("closes the drawer when a link is clicked", () => {
			// Without the onClick the drawer stays open and covers the screen the
			// user just navigated to.
			const navLinks = drawerSource.match(/<NavLink[\s\S]*?<\/NavLink>/g) ?? [];
			expect(navLinks.length).toBeGreaterThan(0);
			const withoutHandler = navLinks.filter((l) => !/onClick=\{[^}]*setMobileNavOpen/.test(l));
			expect(withoutHandler).toEqual([]);
		});

		it("has no drawer links pointing at unrouted paths", () => {
			const known = hasIndexRoute() ? [...routedPaths(), "/"] : routedPaths();
			const dead = [...new Set(drawerPaths)].filter(
				(p) => !known.includes(p) && !INTENTIONALLY_UNLINKED[p],
			);
			expect(dead).toEqual([]);
		});

		it("treats /settings/api-keys as a sub-route of Settings", () => {
			// Documented in INTENTIONALLY_UNLINKED rather than silently dropped, so
			// an unreachable sub-route cannot appear without a recorded reason.
			expect(INTENTIONALLY_UNLINKED).toHaveProperty("/settings/api-keys");
			expect(routedPaths()).toContain("/settings/api-keys");
			expect(sidebarPaths()).not.toContain("/settings/api-keys");
		});
	});
});
