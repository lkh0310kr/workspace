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
  const actions: AddressBarSuggestion[] = [];

  // A bare single word — "google" (no dot yet) or "google." (the dot
  // just typed, nothing after it) — has no real TLD for
  // normalizeBrowserNavigationUrl to resolve to yet, and looksLikeSearchQuery
  // treats it as a search query either way (no-dot) or a literal
  // trailing-dot hostname (dot-but-nothing-after, which is technically
  // valid DNS root notation but never what anyone means to type here).
  // Every mainstream browser offers the ".com" guess for exactly this
  // input shape regardless — not a history match, a live heuristic —
  // so this is checked independently of isQuery/looksLikeSearchQuery's
  // own dot-based branching below.
  const bareWord = /^[a-zA-Z0-9-]+\.?$/.test(trimmed);
  if (bareWord) {
    const domain = `${trimmed.replace(/\.$/, "")}.com`;
    actions.push({ url: `https://${domain}`, title: domain, subtitle: "Go to website", isSearch: false });
  }

  if (isQuery) {
    actions.push({ url: buildSearchUrl(trimmed), title: trimmed, subtitle: "Google Search", isSearch: true });
  } else if (!bareWord) {
    const normalizedUrl = normalizeBrowserNavigationUrl(trimmed, true);
    if (normalizedUrl) actions.push({ url: normalizedUrl, title: trimmed, subtitle: "", isSearch: false });
  }

  if (actions.length === 0) return historySuggestions.slice(0, MAX_ADDRESS_BAR_SUGGESTIONS);

  const actionUrls = new Set(actions.map((a) => a.url));
  const dedupedHistory = historySuggestions.filter((h) => !actionUrls.has(h.url));

  return [...actions, ...dedupedHistory].slice(0, MAX_ADDRESS_BAR_SUGGESTIONS);
}
