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
}

export const JapaneseUnifiedSearch = forwardRef<HTMLInputElement, Props>(function JapaneseUnifiedSearch(
  { query, onQueryChange, onKeyDown, onSelectKanji, onHandwritingCandidates },
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
    </div>
  );
});

export { useJapaneseSearch };
