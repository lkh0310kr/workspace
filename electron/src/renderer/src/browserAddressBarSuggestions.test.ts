import { describe, it, expect } from "vitest";
import { buildAddressBarSuggestions } from "./browserAddressBarSuggestions";
import type { BrowserHistoryEntry } from "./browserHistory";

describe("buildAddressBarSuggestions", () => {
  it("offers a .com guess plus a search suggestion for a bare word with no history match", () => {
    const suggestions = buildAddressBarSuggestions([], "google");
    expect(suggestions[0]).toMatchObject({ url: "https://google.com", isSearch: false });
    expect(suggestions.some((s) => s.isSearch)).toBe(true);
  });

  it("also completes a word with a trailing dot already typed", () => {
    const suggestions = buildAddressBarSuggestions([], "github.");
    expect(suggestions[0]).toMatchObject({ url: "https://github.com" });
  });

  it("does not offer a .com guess for a multi-word query", () => {
    const suggestions = buildAddressBarSuggestions([], "how to center a div");
    expect(suggestions.some((s) => s.url.endsWith(".com") && !s.isSearch)).toBe(false);
  });

  it("does not duplicate the .com guess if it's also in history", () => {
    const history: BrowserHistoryEntry[] = [
      { url: "https://google.com", title: "Google", visitCount: 5, lastVisitedAt: Date.now() },
    ];
    const suggestions = buildAddressBarSuggestions(history, "google");
    expect(suggestions.filter((s) => s.url === "https://google.com")).toHaveLength(1);
  });

  it("still navigates directly when the input already has a real domain", () => {
    const suggestions = buildAddressBarSuggestions([], "google.com");
    expect(suggestions[0].url).toBe("https://google.com/");
  });
});
