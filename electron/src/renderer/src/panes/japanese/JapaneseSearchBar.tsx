import { forwardRef } from "react";
import { SearchBar, useJapaneseSearch } from "./SearchBar";
import { useJapaneseDb } from "./useJapaneseDb";

interface Props {
  query: string;
  onQueryChange: (query: string) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  hitCount?: number | null;
  loading?: boolean;
}

export const JapaneseSearchBar = forwardRef<HTMLInputElement, Props>(function JapaneseSearchBar(
  { query, onQueryChange, onKeyDown, hitCount, loading },
  ref,
) {
  const { status } = useJapaneseDb();
  return (
    <SearchBar
      ref={ref}
      query={query}
      onQueryChange={onQueryChange}
      onKeyDown={onKeyDown}
      dbStatus={status}
      hitCount={hitCount}
      loading={loading}
    />
  );
});

export { useJapaneseSearch };
