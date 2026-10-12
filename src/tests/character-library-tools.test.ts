import { collectTags, filterCards } from "@/components/CharacterLibraryTools";
import type { CharacterCard } from "@/types/character";
import { describe, expect, it } from "vitest";

function card(name: string, description: string, tags: string[]): CharacterCard {
	return {
		spec: "chara_card_v2",
		data: {
			name,
			description,
			personality: "x",
			scenario: "y",
			first_mes: "z",
			system_prompt: "s",
			tags,
		},
	} as unknown as CharacterCard;
}

const CARDS = [
	card("Luna", "witty astronomer", ["astronomy", "nsfw"]),
	card("Mina", "quiet librarian", ["books"]),
	card("Hoshi", "star chef", ["astronomy", "cooking"]),
];

describe("filterCards", () => {
	it("filters by name (case-insensitive)", () => {
		expect(filterCards(CARDS, "luna", "").map((c) => c.data.name)).toEqual(["Luna"]);
	});
	it("filters by description text", () => {
		expect(filterCards(CARDS, "librarian", "").map((c) => c.data.name)).toEqual(["Mina"]);
	});
	it("filters by tag", () => {
		expect(filterCards(CARDS, "", "astronomy").map((c) => c.data.name)).toEqual(["Luna", "Hoshi"]);
	});
	it("combines query + tag", () => {
		expect(filterCards(CARDS, "chef", "astronomy").map((c) => c.data.name)).toEqual(["Hoshi"]);
	});
	it("returns all with empty filters", () => {
		expect(filterCards(CARDS, "", "")).toHaveLength(3);
	});
});

describe("collectTags", () => {
	it("dedupes, lowercases, sorts", () => {
		expect(collectTags(CARDS)).toEqual(["astronomy", "books", "cooking", "nsfw"]);
	});
});
