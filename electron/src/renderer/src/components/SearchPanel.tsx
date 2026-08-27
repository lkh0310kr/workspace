import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  cancelSearch,
  onSearchDone,
  onSearchResult,
  readFile,
  searchInFiles,
  writeFile,
  type SearchFileResult,
  type SearchOptions,
} from "../electron";
import { classifyFile } from "./TreeView";

// VSCode-parity Find/Replace in Files, backed by the ripgrep IPC in
// src/main/search.ts. Swapped into PaneGroup.tsx's .obsidian-explorer
// sidebar region in place of TreeView (Cmd+Shift+F), not a separate window.
interface Props {
  tabId: number;
  onJumpToResult: (path: string, kind: "code" | "markdown" | "viewer" | "vector", line: number) => void;
  onClose: () => void;
}

const DEBOUNCE_MS = 250;

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** For Replace: builds the same regex the search used, so occurrence counts
 * (for the stale-file-skip check) and the actual substitution agree with
 * what the search matched. */
function buildReplaceRegex(query: string, opts: SearchOptions): RegExp {
  const source = opts.regex ? query : escapeRegExp(query);
  const bounded = opts.wholeWord ? `\\b(?:${source})\\b` : source;
  return new RegExp(bounded, `g${opts.caseSensitive ? "" : "i"}`);
}

function highlightLine(lineText: string, ranges: { start: number; end: number }[]): ReactNode {
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
  const [query, setQuery] = useState("");
  const [replaceQuery, setReplaceQuery] = useState("");
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [regex, setRegex] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [results, setResults] = useState<SearchFileResult[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replaceSummary, setReplaceSummary] = useState<string | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryInputRef = useRef<HTMLInputElement>(null);

  const opts = useMemo<SearchOptions>(
    () => ({ caseSensitive, regex, wholeWord }),
    [caseSensitive, regex, wholeWord],
  );

  useEffect(() => {
    queryInputRef.current?.focus();
  }, []);

  useEffect(() => {
    const offResult = onSearchResult((requestId, result) => {
      if (requestId !== requestIdRef.current) return;
      setResults((prev) => {
        const idx = prev.findIndex((r) => r.path === result.path);
        if (idx === -1) return [...prev, result];
        const next = [...prev];
        next[idx] = result;
        return next;
      });
    });
    const offDone = onSearchDone((requestId, err) => {
      if (requestId !== requestIdRef.current) return;
      setSearching(false);
      if (err) setError(err);
    });
    return () => {
      offResult();
      offDone();
    };
  }, []);

  const runSearch = useCallback(
    (q: string, searchOpts: SearchOptions) => {
      if (requestIdRef.current) cancelSearch(requestIdRef.current);
      setResults([]);
      setError(null);
      setReplaceSummary(null);
      if (!q) {
        requestIdRef.current = null;
        setSearching(false);
        return;
      }
      const requestId = crypto.randomUUID();
      requestIdRef.current = requestId;
      setSearching(true);
      searchInFiles(requestId, tabId, q, searchOpts);
    },
    [tabId],
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
      if (requestIdRef.current) cancelSearch(requestIdRef.current);
    };
  }, []);

  const totalMatches = results.reduce((sum, r) => sum + r.matches.length, 0);

  const replaceInFile = useCallback(
    async (file: SearchFileResult) => {
      const current = await readFile(tabId, file.path).catch(() => null);
      if (current == null) return false;
      const re = buildReplaceRegex(query, opts);
      const currentCount = (current.match(re) ?? []).length;
      if (currentCount !== file.matches.reduce((n, m) => n + m.ranges.length, 0)) {
        return false;
      }
      const next = current.replace(re, replaceQuery);
      if (next === current) return true;
      await writeFile(tabId, file.path, next);
      return true;
    },
    [tabId, query, opts, replaceQuery],
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
        ? `Replaced in ${ok} file${ok === 1 ? "" : "s"}, ${skipped} skipped (changed since search)`
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
            disabled={results.length === 0}
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
        {results.map((file) => (
          <div key={file.path} className="search-panel-file">
            <div
              className="search-panel-file-header"
              onClick={() => setCollapsed((prev) => ({ ...prev, [file.path]: !prev[file.path] }))}
            >
              <span className="search-panel-file-caret">{collapsed[file.path] ? "▸" : "▾"}</span>
              <span className="search-panel-file-path" title={file.path}>
                {file.path}
              </span>
              <span className="search-panel-file-count">{file.matches.length}</span>
            </div>
            {!collapsed[file.path] &&
              file.matches.map((m, i) => (
                <div
                  key={i}
                  className="search-panel-match"
                  onClick={() => onJumpToResult(file.path, classifyFile(file.path), m.lineNumber)}
                >
                  <span className="search-panel-match-line">{m.lineNumber}</span>
                  <span className="search-panel-match-text">{highlightLine(m.lineText, m.ranges)}</span>
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}
