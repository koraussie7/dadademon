// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * Regression: the conversation thread used to wipe itself the moment the
 * relationship stage advanced. The greeting bootstrap effect depended on the
 * whole `companion` object, and CandyChatPage rebuilds that object whenever
 * `savedStage` changes (to unlock gallery photos) — so the stage-up message
 * re-ran the effect, called setMessages([greeting]) and dropped every earlier
 * turn. Affinity starts at stage*100 + 40 and gains +10 per message, so a
 * stage-0 companion hit the bump on its 6th reply: "채팅이 5번 넘어가면 리셋".
 *
 * The bootstrap is now keyed on companion.id, so a stage advance must leave the
 * transcript untouched.
 */
describe("CandyChat thread survives a stage advance", () => {
	beforeEach(() => {
		// jsdom in this vitest setup has no origin, so localStorage is absent.
		if (typeof globalThis.localStorage === "undefined") {
			const store = new Map<string, string>();
			Object.defineProperty(globalThis, "localStorage", {
				configurable: true,
				value: {
					getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
					setItem: (k: string, v: string) => void store.set(k, String(v)),
					removeItem: (k: string) => void store.delete(k),
					clear: () => store.clear(),
					key: (i: number) => Array.from(store.keys())[i] ?? null,
					get length() {
						return store.size;
					},
				},
			});
		}
		if (typeof globalThis.crypto?.randomUUID !== "function") {
			Object.defineProperty(globalThis, "crypto", {
				configurable: true,
				value: {
					randomUUID: () =>
						`${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`,
				},
			});
		}
		// jsdom implements no layout engine, so scrollIntoView does not exist.
		if (typeof Element.prototype.scrollIntoView !== "function") {
			Element.prototype.scrollIntoView = () => {};
		}
	});

	afterEach(() => {
		cleanup();
	});

	it("keeps every turn after the stage changes", async () => {
		const { CandyChat } = await import("@/components/CandyChat");

		const companion = {
			id: "regression-luna",
			name: "Luna",
			greeting: "Look, the Perseids!",
			stage: 0,
			gallery: [],
			personality: ["Playful"],
			// The profile drawer is open by default, so it renders bio/traits/
			// hobbies/scenarios — the mock has to satisfy every one of them.
			hobbies: ["Astronomy"],
			scenarios: [],
			bio: "Stargazer and night owl.",
			age: 24,
			occupation: "Astronomer",
			avatarUrl: "",
			hasVoice: false,
			isOnline: true,
		} as unknown as Parameters<typeof CandyChat>[0]["companion"];

		const chat = (c: typeof companion) => (
			<MemoryRouter>
				<CandyChat
					companion={c}
					companions={[c]}
					onSelectCompanion={() => {}}
					onSendMessage={async () => "Nice night, isn't it?"}
					onStageProgress={() => {}}
				/>
			</MemoryRouter>
		);

		// The real page passes a *new object* with a higher stage after each
		// stage advance — that identity churn is what used to reset the thread.
		const { rerender } = render(chat(companion));

		const input = screen.getByRole("textbox") as HTMLTextAreaElement;
		const send = (text: string) =>
			act(async () => {
				const setter = Object.getOwnPropertyDescriptor(
					HTMLTextAreaElement.prototype,
					"value",
				)?.set;
				setter?.call(input, text);
				input.dispatchEvent(new Event("input", { bubbles: true }));
			});
		const submit = () =>
			act(async () => {
				input.dispatchEvent(
					new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
				);
			});

		// Six turns: 40 → 100 affinity, which crosses into stage 1.
		for (let turn = 1; turn <= 6; turn++) {
			await send(`turn ${turn}`);
			await submit();
			await waitFor(() => screen.getByText(`turn ${turn}`));
		}

		expect(screen.getByText("turn 1")).toBeDefined();

		// Simulate the stage advance rebuilding the companion object.
		rerender(chat({ ...companion, stage: 1 }));

		for (let turn = 1; turn <= 6; turn++) {
			expect(screen.getByText(`turn ${turn}`)).toBeDefined();
		}
		expect(screen.queryAllByText("Look, the Perseids!").length).toBe(1);
	});
});