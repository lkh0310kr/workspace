import { buildSearchUrl, looksLikeSearchQuery, normalizeBrowserNavigationUrl } from "./browserUrl";
import type { BrowserHistoryEntry } from "./browserHistory";

// Port of ref-proj/orca's browser-address-bar-suggestions.ts, extended with
// Firefox-style multi-TLD hostname guesses and hostname-aware history ranking.

export const MAX_ADDRESS_BAR_SUGGESTIONS = 8;
const QUERY_MAX_BYTES = 2 * 1024;
const COMMON_TLDS = ["com", "net", "org", "io"] as const;
const MIN_TLD_GUESS_STEM_LENGTH = 3;

export interface AddressBarSuggestion {
  url: string;
  title: string;
  subtitle: string;
  isSearch: boolean;
}

function isQueryTooLarge(query: string): boolean {
  return new TextEncoder().encode(query).length > QUERY_MAX_BYTES;
}

function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function isBareHostnameStem(trimmed: string): boolean {
  return /^[a-zA-Z0-9-]+\.?$/.test(trimmed);
}

function hostnameStem(trimmed: string): string {
  return trimmed.replace(/\.$/, "").toLowerCase();
}

function scoreSuggestion(entry: BrowserHistoryEntry, query: string): number {
  const lowerQuery = query.toLowerCase();
  const lowerUrl = entry.url.toLowerCase();
  const lowerTitle = entry.title.toLowerCase();
  const host = hostnameFromUrl(entry.url);

  let matched = false;
  let score = 0;

  if (host.startsWith(lowerQuery)) {
    score += 220;
    matched = true;
  } else if (host.includes(lowerQuery)) {
    score += 90;
    matched = true;
  }
  if (lowerUrl.startsWith(lowerQuery) || lowerUrl.startsWith(`https://${lowerQuery}`)) {
    score += 100;
    matched = true;
  } else if (lowerUrl.includes(lowerQuery)) {
    score += 40;
    matched = true;
  }
  if (lowerTitle.includes(lowerQuery)) {
    score += 30;
    matched = true;
  }
  if (!matched) return -1;

  score += Math.min(entry.visitCount, 50);
  const ageHours = (Date.now() - entry.lastVisitedAt) / (1000 * 60 * 60);
  score += Math.max(0, 24 - ageHours);
  return score;
}

function buildHistorySuggestions(
  history: readonly BrowserHistoryEntry[],
  trimmed: string,
  limit: number,
): AddressBarSuggestion[] {
  if (history.length === 0 || limit <= 0) return [];
  return history
    .map((entry) => ({ entry, score: scoreSuggestion(entry, trimmed) }))
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => ({
      url: item.entry.url,
      title: item.entry.title,
      subtitle: item.entry.url,
      isSearch: false,
    }));
}

function buildTldGuesses(trimmed: string): AddressBarSuggestion[] {
  const stem = hostnameStem(trimmed);
  if (!isBareHostnameStem(trimmed) || stem.length < MIN_TLD_GUESS_STEM_LENGTH) {
    return [];
  }

  return COMMON_TLDS.map((tld) => {
    const domain = `${stem}.${tld}`;
    return {
      url: `https://${domain}/`,
      title: domain,
      subtitle: "웹사이트 방문",
      isSearch: false,
    };
  });
}

function shouldOfferTldGuesses(
  trimmed: string,
  historySuggestions: readonly AddressBarSuggestion[],
): boolean {
  if (!isBareHostnameStem(trimmed)) return false;
  const stem = hostnameStem(trimmed);
  if (stem.length < MIN_TLD_GUESS_STEM_LENGTH) return false;

  const hasStrongHistoryPrefix = historySuggestions.some((suggestion) => {
    const host = hostnameFromUrl(suggestion.url);
    return host.startsWith(stem);
  });
  return !hasStrongHistoryPrefix;
}

function dedupeSuggestions(suggestions: AddressBarSuggestion[]): AddressBarSuggestion[] {
  const seen = new Set<string>();
  const out: AddressBarSuggestion[] = [];
  for (const suggestion of suggestions) {
    if (seen.has(suggestion.url)) continue;
    seen.add(suggestion.url);
    out.push(suggestion);
  }
  return out;
}

export function buildAddressBarSuggestions(
  history: readonly BrowserHistoryEntry[],
  value: string,
): AddressBarSuggestion[] {
  if (isQueryTooLarge(value)) return [];

  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "about:blank" || trimmed.startsWith("data:")) {
    if (history.length === 0) return [];
    return [...history]
      .sort((a, b) => b.lastVisitedAt - a.lastVisitedAt)
      .slice(0, MAX_ADDRESS_BAR_SUGGESTIONS)
      .map((entry) => ({ url: entry.url, title: entry.title, subtitle: entry.url, isSearch: false }));
  }

  const historySuggestions = buildHistorySuggestions(
    history,
    trimmed,
    MAX_ADDRESS_BAR_SUGGESTIONS - 1,
  );

  const stem = hostnameStem(trimmed);
  const strongHistory = historySuggestions.filter((entry) =>
    hostnameFromUrl(entry.url).startsWith(stem),
  );
  const otherHistory = historySuggestions.filter(
    (entry) => !hostnameFromUrl(entry.url).startsWith(stem),
  );

  const isQuery = looksLikeSearchQuery(trimmed);
  const actions: AddressBarSuggestion[] = [];

  if (!isQuery && !trimmed.endsWith(".")) {
    const normalizedUrl = normalizeBrowserNavigationUrl(trimmed, false);
    if (normalizedUrl) {
      actions.push({ url: normalizedUrl, title: trimmed, subtitle: "", isSearch: false });
    }
  }

  if (shouldOfferTldGuesses(trimmed, historySuggestions)) {
    actions.push(...buildTldGuesses(trimmed));
  }

  const searchAction: AddressBarSuggestion | null =
    isQuery || isBareHostnameStem(trimmed)
      ? {
          url: buildSearchUrl(trimmed),
          title: trimmed,
          subtitle: "Google 검색",
          isSearch: true,
        }
      : null;

  if (actions.length === 0 && strongHistory.length === 0 && !searchAction) {
    return otherHistory.slice(0, MAX_ADDRESS_BAR_SUGGESTIONS);
  }

  const actionUrls = new Set(actions.map((action) => action.url));
  if (searchAction) actionUrls.add(searchAction.url);
  const dedupedOtherHistory = otherHistory.filter((entry) => !actionUrls.has(entry.url));
  const dedupedStrongHistory = strongHistory.filter((entry) => !actionUrls.has(entry.url));

  const merged = [
    ...dedupedStrongHistory,
    ...actions,
    ...(searchAction ? [searchAction] : []),
    ...dedupedOtherHistory,
  ];

  return dedupeSuggestions(merged).slice(0, MAX_ADDRESS_BAR_SUGGESTIONS);
}
