import { useCallback, useEffect, useState } from "react";
import type { RefObject } from "react";
import type { SearchAddon } from "@xterm/addon-search";
import { interactionCoordinator } from "../interaction/InteractionCoordinator";
import { getCurrentResolvedTheme, subscribeThemeChange } from "../theme";
import { getTerminalSearchDecorations } from "../terminalThemes";
import { safeFind } from "../terminalSearchSafeFind";

const FIND_QUERY_MAX_BYTES = 2 * 1024;

function getFindRequestQuery(query: string): string | null {
  const bytes = new TextEncoder().encode(query).length;
  return bytes > FIND_QUERY_MAX_BYTES ? null : query;
}

function clearTerminalSearch(searchAddon: SearchAddon | null): void {
  if (!searchAddon) return;
  searchAddon.clearDecorations();
  searchAddon.findNext("");
}

type Props = {
  isOpen: boolean;
  onClose: () => void;
  searchAddonRef: RefObject<SearchAddon | null>;
  themeKey: "dark" | "light";
};

export function TerminalSearch({ isOpen, onClose, searchAddonRef, themeKey }: Props) {
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [regex, setRegex] = useState(false);
  const requestQuery = getFindRequestQuery(query);

  const searchAddon = searchAddonRef.current;

  const searchOptions = useCallback(
    (incremental = false) => ({
      caseSensitive,
      regex,
      incremental,
      decorations: getTerminalSearchDecorations(themeKey),
    }),
    [caseSensitive, regex, themeKey],
  );

  const findNext = useCallback(() => {
    if (searchAddon && requestQuery) {
      safeFind((term, options) => searchAddon.findNext(term, options), requestQuery, searchOptions());
    }
  }, [searchAddon, requestQuery, searchOptions]);

  const findPrevious = useCallback(() => {
    if (searchAddon && requestQuery) {
      safeFind((term, options) => searchAddon.findPrevious(term, options), requestQuery, searchOptions());
    }
  }, [searchAddon, requestQuery, searchOptions]);

  useEffect(() => () => clearTerminalSearch(searchAddon), [searchAddon]);

  useEffect(() => {
    if (!isOpen) {
      clearTerminalSearch(searchAddon);
      return;
    }
    if (!requestQuery) {
      clearTerminalSearch(searchAddon);
      return;
    }
    if (searchAddon) {
      safeFind(
        (term, options) => searchAddon.findNext(term, options),
        requestQuery,
        searchOptions(true),
      );
    }
  }, [requestQuery, searchAddon, isOpen, caseSensitive, regex, searchOptions]);

  useEffect(() => {
    if (!isOpen) return;
    return interactionCoordinator.registerPortal("terminal-search", onClose);
  }, [isOpen, onClose]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "Enter" && e.shiftKey) {
      findPrevious();
    } else if (e.key === "Enter") {
      findNext();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="terminal-search-bar" data-terminal-search-root onKeyDown={onKeyDown}>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search"
        autoFocus
      />

      <button
        type="button"
        className={caseSensitive ? "terminal-search-toggle is-active" : "terminal-search-toggle"}
        title="Case sensitive"
        onClick={() => setCaseSensitive((v) => !v)}
      >
        Aa
      </button>

      <button
        type="button"
        className={regex ? "terminal-search-toggle is-active" : "terminal-search-toggle"}
        title="Regex"
        onClick={() => setRegex((v) => !v)}
      >
        .*
      </button>

      <span className="terminal-search-divider" />

      <button type="button" title="Previous match" onClick={findPrevious}>
        ↑
      </button>
      <button type="button" title="Next match" onClick={findNext}>
        ↓
      </button>

      <span className="terminal-search-divider" />

      <button type="button" title="Close" className="terminal-search-close" onClick={onClose}>
        ×
      </button>
    </div>
  );
}

export function useTerminalSearchThemeKey(): "dark" | "light" {
  const [themeKey, setThemeKey] = useState<"dark" | "light">(() => getCurrentResolvedTheme());
  useEffect(() => subscribeThemeChange(setThemeKey), []);
  return themeKey;
}
