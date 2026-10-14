/**
 * Tests for SharedProfilePanel and ResetMemoryButton.
 * Covers: rendering global facts, add/delete fact flow, reset all, reset button.
 */

import { SharedProfilePanel } from "@/components/SharedProfilePanel";
import { ResetMemoryButton } from "@/components/ResetMemoryButton";
import {
	addManualFact,
	getAllFacts,
} from "@/lib/companion-memory";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// In-memory localStorage shim
const store = new Map<string, string>();
const mockLocalStorage = {
	getItem: (k: string) => store.get(k) ?? null,
	setItem: (k: string, v: string) => void store.set(k, v),
	removeItem: (k: string) => void store.delete(k),
	clear: () => void store.clear(),
	get length() {
		return store.size;
	},
	key: (i: number) => Array.from(store.keys())[i] ?? null,
};
Object.defineProperty(globalThis, "localStorage", {
	value: mockLocalStorage,
	writable: true,
	configurable: true,
});

beforeEach(() => {
	store.clear();
});

afterEach(() => {
	cleanup();
});

describe("SharedProfilePanel", () => {
	it("renders existing global facts", () => {
		addManualFact("__human__", "My name is Yuki", "global");
		addManualFact("__human__", "I love ramen", "global");

		render(<SharedProfilePanel agentIds={[]} />);

		expect(screen.getByText("My name is Yuki")).toBeTruthy();
		expect(screen.getByText("I love ramen")).toBeTruthy();
	});

	it("shows empty state when no global facts exist", () => {
		render(<SharedProfilePanel agentIds={[]} />);
		expect(screen.getByText(/No global profile facts yet/i)).toBeTruthy();
	});

	it("adds a new fact on Enter key", () => {
		render(<SharedProfilePanel agentIds={[]} />);

		const input = screen.getByPlaceholderText("e.g. My name is Yuki");
		fireEvent.change(input, { target: { value: "I prefer tea over coffee" } });
		fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

		expect(screen.getByText("I prefer tea over coffee")).toBeTruthy();
		expect((input as HTMLInputElement).value).toBe("");
	});

	it("adds a new fact via Add button", () => {
		render(<SharedProfilePanel agentIds={[]} />);

		const input = screen.getByPlaceholderText("e.g. My name is Yuki");
		const addButton = screen.getByRole("button", { name: "Add" });

		fireEvent.change(input, { target: { value: "I am a developer" } });
		fireEvent.click(addButton);

		expect(screen.getByText("I am a developer")).toBeTruthy();
	});

	it("deletes a fact on click", () => {
		addManualFact("__human__", "Fact to delete", "global");
		render(<SharedProfilePanel agentIds={[]} />);

		const deleteButton = screen.getAllByTitle("Delete this fact")[0];
		fireEvent.click(deleteButton);

		expect(screen.queryByText("Fact to delete")).toBeNull();
	});

	it("resets all global facts with confirmation", () => {
		const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
		addManualFact("__human__", "Fact 1", "global");
		addManualFact("__human__", "Fact 2", "global");
		render(<SharedProfilePanel agentIds={[]} />);

		const resetButton = screen.getByText("Reset All Global Facts");
		fireEvent.click(resetButton);

		const facts = getAllFacts("__human__").filter((f) => f.scope === "global");
		expect(facts).toHaveLength(0);
		confirmSpy.mockRestore();
	});

	it("cancels reset when user declines confirmation", () => {
		const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
		addManualFact("__human__", "Fact to keep", "global");
		render(<SharedProfilePanel agentIds={[]} />);

		const resetButton = screen.getByText("Reset All Global Facts");
		fireEvent.click(resetButton);

		const facts = getAllFacts("__human__").filter((f) => f.scope === "global");
		expect(facts).toHaveLength(1);
		expect(facts[0].text).toBe("Fact to keep");
		confirmSpy.mockRestore();
	});

	it("exports profile as JSON", () => {
		addManualFact("__human__", "Export test fact", "global");
		render(<SharedProfilePanel agentIds={[]} />);

		const revoke = URL.revokeObjectURL;
		const create = URL.createObjectURL;
		URL.createObjectURL = (blob: Blob) => `blob:mock/${blob.size}`;
		URL.revokeObjectURL = () => {};

		let clicked = false;
		const originalClick = HTMLAnchorElement.prototype.click;
		HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
			clicked = true;
		};

		const exportButton = screen.getByText("Export");
		fireEvent.click(exportButton);

		expect(clicked).toBe(true);

		URL.createObjectURL = create;
		URL.revokeObjectURL = revoke;
		HTMLAnchorElement.prototype.click = originalClick;
	});
});

describe("ResetMemoryButton", () => {
	it("renders reset button for companion", () => {
		render(
			<ResetMemoryButton
				companionId="luna-01"
				companionName="Luna"
			/>,
		);

		expect(screen.getByText(/Reset Luna's memory/i)).toBeTruthy();
	});

	it("shows confirmation modal on click", () => {
		render(
			<ResetMemoryButton
				companionId="luna-01"
				companionName="Luna"
			/>,
		);

		fireEvent.click(screen.getByText(/Reset Luna's memory/i));

		expect(screen.getByText(/Reset Memory for Luna/i)).toBeTruthy();
		expect(screen.getByText(/Delete the Letta agent/i)).toBeTruthy();
	});

	it("clears local memory on reset without Letta server", async () => {
		addManualFact("luna-01", "Companion fact 1", "companion");
		addManualFact("luna-01", "Companion fact 2", "companion");

		const onReset = vi.fn();
		render(
			<ResetMemoryButton
				companionId="luna-01"
				companionName="Luna"
				onResetComplete={onReset}
			/>,
		);

		fireEvent.click(screen.getByText(/Reset Luna's memory/i));
		fireEvent.click(screen.getByText("Reset Now"));

		// Local memory should be cleared
		const facts = getAllFacts("luna-01");
		expect(facts).toHaveLength(0);
		expect(onReset).toHaveBeenCalledTimes(1);
		expect(screen.getByText(/Memory reset for Luna/i)).toBeTruthy();
	});

	it("shows success state after reset", async () => {
		render(
			<ResetMemoryButton
				companionId="luna-01"
				companionName="Luna"
			/>,
		);

		fireEvent.click(screen.getByText(/Reset Luna's memory/i));
		fireEvent.click(screen.getByText("Reset Now"));

		expect(await screen.findByText(/✓ Memory reset/i)).toBeTruthy();
	});
});
