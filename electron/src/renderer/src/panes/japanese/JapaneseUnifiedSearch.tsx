import { forwardRef } from "react";
import { HandwritingCanvas } from "./HandwritingCanvas";
import { SearchBar } from "./SearchBar";
import { useJapaneseSearch } from "./SearchBar";
import { useJapaneseDb } from "./useJapaneseDb";

interface Props {
  query: string;
  onQueryChange: (query: string) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onSelectKanji: (literal: string) => void;
  onHandwritingCandidates: (candidates: { literal: string; score: number }[]) => void;
  loading?: boolean;
  error?: string | null;
  onOpenSettings?: () => void;
}

export const JapaneseUnifiedSearch = forwardRef<HTMLInputElement, Props>(function JapaneseUnifiedSearch(
  {
    query,
    onQueryChange,
    onKeyDown,
    onSelectKanji,
    onHandwritingCandidates,
    loading = false,
    error = null,
    onOpenSettings,
  },
  ref,
) {
  const { status } = useJapaneseDb();

  return (
    <div className="japanese-unified-search">
      <div className="japanese-unified-search-row">
        <SearchBar
          ref={ref}
          query={query}
          onQueryChange={onQueryChange}
          onKeyDown={onKeyDown}
          dbStatus={status}
          loading={loading}
          error={error}
        />
        {status?.ready ? (
          <HandwritingCanvas
            compact
            autoRecognize
            onSelectKanji={onSelectKanji}
            onCandidatesChange={onHandwritingCandidates}
          />
        ) : null}
        {onOpenSettings ? (
          <button
            type="button"
            className="japanese-settings-btn"
            title="Study Assist 설정"
            aria-label="Study Assist 설정"
            onClick={onOpenSettings}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
              <path
                fill="currentColor"
                d="M8 4.75a3.25 3.25 0 1 0 0 6.5 3.25 3.25 0 0 0 0-6.5ZM3.2 8a4.8 4.8 0 0 1 .08-.86l-1.5-.87a.75.75 0 0 1-.28-1.02l1.3-2.25a.75.75 0 0 1 1.02-.28l1.5.87a4.9 4.9 0 0 1 1.48-.86V1.75a.75.75 0 0 1 .75-.75h2.6a.75.75 0 0 1 .75.75v1.38c.53.2 1.02.5 1.48.86l1.5-.87a.75.75 0 0 1 1.02.28l1.3 2.25a.75.75 0 0 1-.28 1.02l-1.5.87c.05.28.08.56.08.86s-.03.58-.08.86l1.5.87a.75.75 0 0 1 .28 1.02l-1.3 2.25a.75.75 0 0 1-1.02.28l-1.5-.87a4.9 4.9 0 0 1-1.48.86v1.38a.75.75 0 0 1-.75.75H9.35a.75.75 0 0 1-.75-.75v-1.38a4.9 4.9 0 0 1-1.48-.86l-1.5.87a.75.75 0 0 1-1.02-.28l-1.3-2.25a.75.75 0 0 1 .28-1.02l1.5-.87A4.8 4.8 0 0 1 3.2 8Z"
              />
            </svg>
          </button>
        ) : null}
      </div>
    </div>
  );
});

export { useJapaneseSearch };
