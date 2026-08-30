import { forwardRef, useEffect, useState } from "react";
import type { JapaneseDbStatus } from "../../electron";
import { searchJapanese } from "../../electron";

interface Props {
  query: string;
  onQueryChange: (query: string) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  dbStatus?: JapaneseDbStatus | null;
  disabled?: boolean;
  hitCount?: number | null;
  loading?: boolean;
}

export const SearchBar = forwardRef<HTMLInputElement, Props>(function SearchBar(
  { query, onQueryChange, onKeyDown, dbStatus = null, disabled, hitCount, loading },
  ref,
) {
  return (
    <div className="japanese-pane-toolbar">
      <input
        ref={ref}
        className="japanese-pane-search"
        type="search"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="단어, 읽기, 로마자 검색…"
        disabled={disabled || !dbStatus?.ready}
        aria-label="일본어 사전 검색"
      />
      {dbStatus && !dbStatus.ready ? (
        <p className="japanese-pane-toolbar-hint">사전이 로드되지 않았습니다 ({dbStatus.path ?? "경로 없음"})</p>
      ) : null}
      {dbStatus?.ready ? (
        <p className="japanese-pane-toolbar-hint">
          {dbStatus.entryCount.toLocaleString()} 단어 · {dbStatus.kanjiCount.toLocaleString()} 한자
          {dbStatus.strokeKanjiCount > 0
            ? ` · 획 ${dbStatus.strokeKanjiCount.toLocaleString()}자`
            : ""}
          {hitCount != null ? (
            <span className="japanese-pane-hit-count">
              {loading ? " · 검색 중…" : ` · 결과 ${hitCount.toLocaleString()}개`}
            </span>
          ) : null}
        </p>
      ) : null}
    </div>
  );
});

export function useJapaneseSearch(query: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hits, setHits] = useState<Awaited<ReturnType<typeof searchJapanese>>["hits"]>([]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setHits([]);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    const timer = window.setTimeout(() => {
      searchJapanese(trimmed)
        .then((result) => {
          if (cancelled) return;
          setHits(Array.isArray(result.hits) ? result.hits : []);
          setLoading(false);
        })
        .catch((err) => {
          if (cancelled) return;
          setError(err instanceof Error ? err.message : "검색 실패");
          setLoading(false);
        });
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  return { hits, loading, error };
}
