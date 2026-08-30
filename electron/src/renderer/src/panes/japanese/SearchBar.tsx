import { useEffect, useState } from "react";
import { getJapaneseDbStatus, searchJapanese, type JapaneseDbStatus } from "../../electron";

interface Props {
  query: string;
  onQueryChange: (query: string) => void;
  disabled?: boolean;
}

export function SearchBar({ query, onQueryChange, disabled }: Props) {
  const [dbStatus, setDbStatus] = useState<JapaneseDbStatus | null>(null);

  useEffect(() => {
    getJapaneseDbStatus().then(setDbStatus).catch(() => setDbStatus(null));
  }, []);

  return (
    <div className="japanese-pane-toolbar">
      <input
        className="japanese-pane-search"
        type="search"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="Search words, readings, or glosses…"
        disabled={disabled || !dbStatus?.ready}
        aria-label="Japanese dictionary search"
      />
      {dbStatus && !dbStatus.ready ? (
        <p className="japanese-pane-toolbar-hint">Dictionary not loaded ({dbStatus.path ?? "no path"})</p>
      ) : null}
      {dbStatus?.ready ? (
        <p className="japanese-pane-toolbar-hint">{dbStatus.entryCount.toLocaleString()} entries</p>
      ) : null}
    </div>
  );
}

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
          setHits(result.hits);
          setLoading(false);
        })
        .catch((err) => {
          if (cancelled) return;
          setError(err instanceof Error ? err.message : "search failed");
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
