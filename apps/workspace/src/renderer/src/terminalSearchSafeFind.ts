import type { SearchAddon } from "@xterm/addon-search";

type SearchOptions = Parameters<SearchAddon["findNext"]>[1];

// Port of ref-proj/orca/src/renderer/src/components/terminal-search-safe-find.ts —
// swallows xterm decoration width errors on narrow viewports instead of crashing React.
export function safeFind(
  search: (term: string, options?: SearchOptions) => boolean,
  term: string,
  options?: SearchOptions,
): boolean {
  try {
    return search(term, options);
  } catch (error) {
    if (error instanceof Error && /only accepts positive integers/i.test(error.message)) {
      return false;
    }
    throw error;
  }
}
