import { forwardRef } from "react";
import { HandwritingCanvas } from "./HandwritingCanvas";
import { SearchBar } from "./SearchBar";
import { useJapaneseSearch } from "./SearchBar";
import { useJapaneseDb } from "./useJapaneseDb";

interface Props {
  query: string;
  onQueryChange: (query: string) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  hitCount?: number | null;
  loading?: boolean;
  onSelectKanji: (literal: string) => void;
  onHandwritingCandidates: (candidates: { literal: string; score: number }[]) => void;
}

export const JapaneseUnifiedSearch = forwardRef<HTMLInputElement, Props>(function JapaneseUnifiedSearch(
  {
    query,
    onQueryChange,
    onKeyDown,
    hitCount,
    loading,
    onSelectKanji,
    onHandwritingCandidates,
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
          hitCount={hitCount}
          loading={loading}
        />
        {status?.ready ? (
          <HandwritingCanvas
            compact
            autoRecognize
            onSelectKanji={onSelectKanji}
            onCandidatesChange={onHandwritingCandidates}
          />
        ) : null}
      </div>
      {status?.ready ? (
        <p className="japanese-pane-toolbar-hint japanese-unified-search-hint">
          검색창에 단어·읽기·로마자를 입력하거나 오른쪽에 한자를 써 보세요.
        </p>
      ) : null}
    </div>
  );
});

export { useJapaneseSearch };
