import { SearchBar } from "./SearchBar";
import { useJapaneseDb } from "./useJapaneseDb";

interface Props {
  query: string;
  onQueryChange: (query: string) => void;
}

export function JapaneseSearchBar({ query, onQueryChange }: Props) {
  const { status } = useJapaneseDb();
  return <SearchBar query={query} onQueryChange={onQueryChange} dbStatus={status} />;
}
