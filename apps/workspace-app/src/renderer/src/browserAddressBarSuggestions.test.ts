import { describe, it, expect } from "vitest";
import { buildAddressBarSuggestions } from "./browserAddressBarSuggestions";
import type { BrowserHistoryEntry } from "./browserHistory";

function historyEntry(overrides: Partial<BrowserHistoryEntry>): BrowserHistoryEntry {
  return {
    url: "https://example.com/",
    title: "Example",
    visitCount: 1,
    lastVisitedAt: Date.now(),
    ...overrides,
  };
}

describe("buildAddressBarSuggestions", () => {
  it("offers multiple TLD guesses plus search for a bare word with no history", () => {
    const suggestions = buildAddressBarSuggestions([], "google");
    expect(suggestions[0]).toMatchObject({ url: "https://google.com/", isSearch: false });
    expect(suggestions.some((s) => s.url === "https://google.net/")).toBe(true);
    expect(suggestions.some((s) => s.url === "https://google.org/")).toBe(true);
    expect(suggestions.some((s) => s.isSearch)).toBe(true);
  });

  it("completes a word with a trailing dot already typed", () => {
    const suggestions = buildAddressBarSuggestions([], "github.");
    expect(suggestions[0]).toMatchObject({ url: "https://github.com/" });
  });

  it("does not offer TLD guesses for a multi-word query", () => {
    const suggestions = buildAddressBarSuggestions([], "how to center a div");
    expect(suggestions.some((s) => s.url.endsWith(".com/") && !s.isSearch)).toBe(false);
    expect(suggestions[0]?.isSearch).toBe(true);
  });

  it("does not duplicate navigation rows already present in history", () => {
    const history: BrowserHistoryEntry[] = [
      historyEntry({ url: "https://google.com/", title: "Google", visitCount: 5 }),
    ];
    const suggestions = buildAddressBarSuggestions(history, "google");
    expect(suggestions.filter((s) => s.url === "https://google.com/")).toHaveLength(1);
  });

  it("prefers a strong history hostname prefix over fresh TLD guesses", () => {
    const history: BrowserHistoryEntry[] = [
      historyEntry({
        url: "https://github.com/workspace",
        title: "GitHub",
        visitCount: 10,
        lastVisitedAt: Date.now(),
      }),
    ];
    const suggestions = buildAddressBarSuggestions(history, "git");
    expect(suggestions[0]?.url).toBe("https://github.com/workspace");
    expect(suggestions.some((s) => s.url === "https://git.com/")).toBe(false);
  });

  it("navigates directly when the input already has a real domain", () => {
    const suggestions = buildAddressBarSuggestions([], "google.com");
    expect(suggestions[0].url).toBe("https://google.com/");
    expect(suggestions[0].isSearch).toBe(false);
  });

  it("does not turn a rejected scheme into a selectable navigation row", () => {
    expect(buildAddressBarSuggestions([], "javascript:alert(1)")).toEqual([]);
  });

  it("returns recent history for blank input", () => {
    const suggestions = buildAddressBarSuggestions(
      [
        historyEntry({ url: "https://old.example/", title: "Old", lastVisitedAt: 1 }),
        historyEntry({ url: "https://new.example/", title: "New", lastVisitedAt: 2 }),
      ],
      "",
    );
    expect(suggestions.map((s) => s.url)).toEqual(["https://new.example/", "https://old.example/"]);
  });

  it("rejects oversized pasted values", () => {
    const oversized = "x".repeat(3 * 1024);
    expect(buildAddressBarSuggestions([], oversized)).toEqual([]);
  });
});
