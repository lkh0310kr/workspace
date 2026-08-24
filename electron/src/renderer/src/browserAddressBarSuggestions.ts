import { buildSearchUrl, looksLikeSearchQuery, normalizeBrowserNavigationUrl } from "./browserUrl";
import type { BrowserHistoryEntry } from "./browserHistory";

// Port of ref-proj/orca's browser-address-bar-suggestions.ts, minus the
// Kagi-specific session-search branch and the query-byte-length guard
// (Orca's exists for a remote/streamed-browser payload-size limit this
// app doesn't have).

export const MAX_ADDRESS_BAR_SUGGESTIONS = 8;

export interface AddressBarSuggestion {
  url: string;
  title: string;
  subtitle: string;
  isSearch: boolean;
}

function scoreSuggestion(entry: BrowserHistoryEntry, query: string): number {
  const lowerQuery = query.toLowerCase();
  const lowerUrl = entry.url.toLowerCase();
  const lowerTitle = entry.title.toLowerCase();
  if (!lowerUrl.includes(lowerQuery) && !lowerTitle.includes(lowerQuery)) return -1;

  let score = 0;
  if (lowerUrl.startsWith(lowerQuery) || lowerUrl.startsWith(`https://${lowerQuery}`)) score += 100;
  score += Math.min(entry.visitCount, 50);
  const ageHours = (Date.now() - entry.lastVisitedAt) / (1000 * 60 * 60);
  score += Math.max(0, 24 - ageHours);
  return score;
}

export function buildAddressBarSuggestions(
  history: readonly BrowserHistoryEntry[],
  value: string,
): AddressBarSuggestion[] {
  const trimmed = value.trim();

  if (trimmed === "" || trimmed === "about:blank") {
    if (history.length === 0) return [];
    return [...history]
      .sort((a, b) => b.lastVisitedAt - a.lastVisitedAt)
      .slice(0, MAX_ADDRESS_BAR_SUGGESTIONS)
      .map((entry) => ({ url: entry.url, title: entry.title, subtitle: entry.url, isSearch: false }));
  }

  const historySuggestions: AddressBarSuggestion[] =
    history.length > 0
      ? history
          .map((entry) => ({ entry, score: scoreSuggestion(entry, trimmed) }))
          .filter((item) => item.score >= 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, MAX_ADDRESS_BAR_SUGGESTIONS - 1)
          .map((item) => ({
            url: item.entry.url,
            title: item.entry.title,
            subtitle: item.entry.url,
            isSearch: false,
          }))
      : [];

  const isQuery = looksLikeSearchQuery(trimmed);
  let topAction: AddressBarSuggestion | null;
  if (isQuery) {
    topAction = { url: buildSearchUrl(trimmed), title: trimmed, subtitle: "Google Search", isSearch: true };
  } else {
    const normalizedUrl = normalizeBrowserNavigationUrl(trimmed, true);
    topAction = normalizedUrl ? { url: normalizedUrl, title: trimmed, subtitle: "", isSearch: false } : null;
  }

  if (!topAction) return historySuggestions.slice(0, MAX_ADDRESS_BAR_SUGGESTIONS);

  const duplicateIdx = historySuggestions.findIndex((h) => h.url === topAction!.url);
  if (duplicateIdx !== -1) return historySuggestions.slice(0, MAX_ADDRESS_BAR_SUGGESTIONS);

  return [topAction, ...historySuggestions].slice(0, MAX_ADDRESS_BAR_SUGGESTIONS);
}
