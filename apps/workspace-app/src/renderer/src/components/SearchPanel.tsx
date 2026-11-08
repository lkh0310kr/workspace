import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  type EditorProvider,
  type EditorSearchMatch,
  type EditorSearchResult,
  type EditorReplaceOptions,
} from "@workspace/editor";
import { acquireLocalEditorProvider } from "../editor/localEditorProvider";

// VSCode-parity Find/Replace in Files, backed by the ripgrep IPC in
// src/main/search.ts. Swapped into PaneGroup.tsx's .obsidian-explorer
// sidebar region in place of TreeView (Cmd+Shift+F), not a separate window.
interface Props {
  tabId: number;
  onJumpToResult: (path: string, kind: "code" | "markdown" | "viewer", line: number) => void;
  onClose: () => void;
}

const DEBOUNCE_MS = 250;

function highlightLine(lineText: string, ranges: EditorSearchMatch["ranges"]): ReactNode {
  if (ranges.length === 0) return lineText;
  const parts: ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((r, i) => {
    if (r.start > cursor) parts.push(lineText.slice(cursor, r.start));
    parts.push(<mark key={i}>{lineText.slice(r.start, r.end)}</mark>);
    cursor = r.end;
  });
  if (cursor < lineText.length) parts.push(lineText.slice(cursor));
  return parts;
}

export function SearchPanel({ tabId, onJumpToResult, onClose }: Props) {
  const providerLease = useMemo(() => acquireLocalEditorProvider(tabId), [tabId]);
  const provider: EditorProvider = providerLease.provider;
  const [query, setQuery] = useState("");
  const [replaceQuery, setReplaceQuery] = useState("");
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [regex, setRegex] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [results, setResults] = useState<EditorSearchResult[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replaceSummary, setReplaceSummary] = useState<string | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryInputRef = useRef<HTMLInputElement>(null);

  const opts = useMemo<EditorReplaceOptions>(
    () => ({ caseSensitive, regex, wholeWord }),
    [caseSensitive, regex, wholeWord],
  );

  useLayoutEffect(() => {
    queryInputRef.current?.focus();
  }, []);

  const runSearch = useCallback(
    (q: string, searchOpts: EditorReplaceOptions) => {
      searchAbortRef.current?.abort();
      setResults([]);
      setError(null);
      setReplaceSummary(null);
      if (!q) {
        setSearching(false);
        return;
      }
      const controller = new AbortController();
      searchAbortRef.current = controller;
      setSearching(true);
      void provider.search(q, { ...searchOpts, target: "contents" }, controller.signal, (result) => {
        if (searchAbortRef.current !== controller) return;
        setResults((current) => {
          const index = current.findIndex((entry) => entry.item.itemId === result.item.itemId);
          if (index < 0) return [...current, result];
          const next = [...current];
          next[index] = result;
          return next;
        });
      })
        .then((next) => {
          if (searchAbortRef.current !== controller) return;
          setResults(next);
          setSearching(false);
        })
        .catch((cause) => {
          if (searchAbortRef.current !== controller) return;
          if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause));
          setSearching(false);
        });
    },
    [provider],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(query, opts), DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, caseSensitive, regex, wholeWord]);

  useEffect(() => {
    return () => {
      searchAbortRef.current?.abort();
      providerLease.release();
    };
  }, [providerLease]);

  const totalMatches = results.reduce((sum, result) => sum + (result.matches?.length ?? 0), 0);

  const replaceInFile = useCallback(
    async (result: EditorSearchResult) => {
      if (!provider.replaceContents) return false;
      const expectedMatchCount = (result.matches ?? []).reduce((count, match) => count + match.ranges.length, 0);
      try {
        return await provider.replaceContents(
          { providerId: result.item.providerId, itemId: result.item.itemId },
          query,
          replaceQuery,
          opts,
          expectedMatchCount,
        );
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        return false;
      }
    },
    [provider, query, opts, replaceQuery],
  );

  const replaceAll = useCallback(async () => {
    let ok = 0;
    let skipped = 0;
    for (const file of results) {
      const succeeded = await replaceInFile(file);
      if (succeeded) ok++;
      else skipped++;
    }
    setReplaceSummary(
      skipped > 0
        ? `Replaced in ${ok} file${ok === 1 ? "" : "s"}, ${skipped} skipped (changed or unsaved)`
        : `Replaced in ${ok} file${ok === 1 ? "" : "s"}`,
    );
    runSearch(query, opts);
  }, [results, replaceInFile, runSearch, query, opts]);

  return (
    <div className="search-panel">
      <div className="search-panel-header">
        <span className="search-panel-title">Search</span>
        <button type="button" className="obsidian-topbar-icon" title="Close search" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="search-panel-query-row">
        <input
          ref={queryInputRef}
          className="search-panel-input"
          placeholder="Search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
          }}
        />
        <button
          type="button"
          className="search-panel-toggle-replace"
          title="Toggle replace"
          onClick={() => setReplaceOpen((v) => !v)}
        >
          {replaceOpen ? "▾" : "▸"}
        </button>
      </div>
      {replaceOpen && (
        <div className="search-panel-query-row">
          <input
            className="search-panel-input"
            placeholder="Replace"
            value={replaceQuery}
            onChange={(e) => setReplaceQuery(e.target.value)}
          />
          <button
            type="button"
            className="search-panel-replace-all"
            disabled={results.length === 0 || !provider.capabilities.replaceContents || !provider.replaceContents}
            onClick={() => void replaceAll()}
          >
            Replace All
          </button>
        </div>
      )}
      <div className="search-panel-toggles">
        <button
          type="button"
          className={`search-panel-toggle${caseSensitive ? " active" : ""}`}
          title="Match case"
          onClick={() => setCaseSensitive((v) => !v)}
        >
          Aa
        </button>
        <button
          type="button"
          className={`search-panel-toggle${wholeWord ? " active" : ""}`}
          title="Match whole word"
          onClick={() => setWholeWord((v) => !v)}
        >
          Ab
        </button>
        <button
          type="button"
          className={`search-panel-toggle${regex ? " active" : ""}`}
          title="Use regular expression"
          onClick={() => setRegex((v) => !v)}
        >
          .*
        </button>
      </div>
      <div className="search-panel-status">
        {searching
          ? "Searching…"
          : error
            ? error
            : replaceSummary
              ? replaceSummary
              : query
                ? `${totalMatches} result${totalMatches === 1 ? "" : "s"} in ${results.length} file${results.length === 1 ? "" : "s"}`
                : ""}
      </div>
      <div className="search-panel-results">
        {results.map((result) => (
          <div key={result.item.itemId} className="search-panel-file">
            <div
              className="search-panel-file-header"
              onClick={() => setCollapsed((prev) => ({ ...prev, [result.item.path]: !prev[result.item.path] }))}
            >
              <span className="search-panel-file-caret">{collapsed[result.item.path] ? "▸" : "▾"}</span>
              <span className="search-panel-file-path" title={result.item.path}>
                {result.item.path}
              </span>
              <span className="search-panel-file-count">{result.matches?.length ?? 0}</span>
            </div>
            {!collapsed[result.item.path] &&
              (result.matches ?? []).map((match, i) => (
                <div
                  key={i}
                  className="search-panel-match"
                  onClick={() => onJumpToResult(result.item.path, result.item.kind === "markdown" ? "markdown" : result.item.kind === "asset" ? "viewer" : "code", match.line)}
                >
                  <span className="search-panel-match-line">{match.line}</span>
                  <span className="search-panel-match-text">{highlightLine(match.preview, match.ranges)}</span>
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}
