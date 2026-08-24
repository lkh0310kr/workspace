// Port of ref-proj/orca's src/shared/browser-url.ts, trimmed for a
// single-search-engine personal app: dropped the Kagi session-link search
// (a Kagi-specific feature) and Windows UNC-path handling (this app only
// targets macOS — see the user memory on workspace-app). Everything else
// (URL vs. search-query classification, local-dev-address shorthand,
// absolute-path-to-file-URL) is real "does this look like a URL" logic
// worth having, not something specific to Orca's own product.

const LOCAL_ADDRESS_PATTERN =
  /^(?:localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[[0-9a-f:]+\])(?::\d+)?(?:[/?#].*)?$/i;

// Bare words like "react hooks" should search; inputs that look like domain
// names ("example.com", "foo.bar/path") should navigate directly. A
// single-word input containing a dot with a TLD-like suffix reads as a URL
// attempt, not a search query.
const LOOKS_LIKE_URL_PATTERN = /^[^\s]+\.[a-z]{2,}(\/.*)?$/i;
const UNIX_ABSOLUTE_PATH_PATTERN = /^\/.*$/;

const SEARCH_ENGINE_URL = "https://www.google.com/search?q=";

export function classifySchemeLessLocalDevAddress(rawInput: string): URL | null {
  const trimmed = rawInput.trim();
  if (!LOCAL_ADDRESS_PATTERN.test(trimmed)) return null;
  try {
    return new URL(`http://${trimmed}`);
  } catch {
    return null;
  }
}

export function buildSearchUrl(query: string): string {
  return `${SEARCH_ENGINE_URL}${encodeURIComponent(query)}`;
}

export function looksLikeSearchQuery(input: string): boolean {
  if (input.includes(" ")) return true;
  if (LOOKS_LIKE_URL_PATTERN.test(input)) return false;
  if (input.includes(".") || input.includes(":")) return false;
  return true;
}

function absolutePathToFileUrl(filePath: string): string {
  const segments = filePath.split("/").map((segment) => encodeURIComponent(segment));
  return `file://${segments.join("/")}`;
}

export const BLANK_URL = "about:blank";

// `searchEnabled` (implicitly: whether this is address-bar input vs. a
// programmatic navigation check) mirrors Orca's own split — the address
// bar wants a search fallback for anything that isn't a URL; a raw
// navigation guard (if this app ever validates webview.loadURL targets)
// should reject non-URL text instead of silently turning it into a search.
export function normalizeBrowserNavigationUrl(rawUrl: string, searchFallback: boolean): string | null {
  const trimmed = rawUrl.trim();
  if (trimmed.length === 0 || trimmed === BLANK_URL) return BLANK_URL;

  const localDevAddress = classifySchemeLessLocalDevAddress(trimmed);
  if (localDevAddress) return localDevAddress.toString();

  if (UNIX_ABSOLUTE_PATH_PATTERN.test(trimmed)) return absolutePathToFileUrl(trimmed);

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "file:"
      ? parsed.toString()
      : null;
  } catch {
    try {
      const withScheme = new URL(`https://${trimmed}`);
      if (!searchFallback || !looksLikeSearchQuery(trimmed)) return withScheme.toString();
    } catch {
      // Not a valid URL even with https:// prefixed.
    }
    if (!searchFallback) return null;
    return buildSearchUrl(trimmed);
  }
}
