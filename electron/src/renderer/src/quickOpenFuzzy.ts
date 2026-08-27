// Pure fuzzy filter/scoring for Quick Open (Cmd+P) — no fuzzy-scoring
// library is a dependency in this project and this scope doesn't need one:
// a contiguous-substring match scores higher than a scattered subsequence
// match, both case-insensitive, which is enough to make "todo" surface
// "TODO.md" above "src/tool/order.ts".

export interface FuzzyMatch<T> {
  item: T;
  score: number;
}

/** Returns null if `text` doesn't contain every character of `query` in
 * order (case-insensitive); otherwise a score where lower is a better
 * match — a contiguous run of the whole query beats a scattered one, and
 * matching earlier in the string beats matching later. */
function scoreMatch(text: string, query: string): number | null {
  if (!query) return 0;
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();

  const contiguousIndex = lowerText.indexOf(lowerQuery);
  if (contiguousIndex !== -1) {
    return contiguousIndex;
  }

  let textIndex = 0;
  let firstMatchIndex = -1;
  let lastMatchIndex = -1;
  for (let q = 0; q < lowerQuery.length; q++) {
    const found = lowerText.indexOf(lowerQuery[q], textIndex);
    if (found === -1) return null;
    if (firstMatchIndex === -1) firstMatchIndex = found;
    lastMatchIndex = found;
    textIndex = found + 1;
  }
  // Why +1000: a scattered subsequence match is always a worse (higher)
  // score than any contiguous match, however late that contiguous match
  // starts — a scattered match spanning the whole string still shouldn't
  // outrank a contiguous one near the end.
  return 1000 + (lastMatchIndex - firstMatchIndex) + firstMatchIndex;
}

export function fuzzyFilter<T>(
  items: T[],
  query: string,
  toText: (item: T) => string,
  limit = 100,
): T[] {
  if (!query.trim()) return items.slice(0, limit);
  const scored: FuzzyMatch<T>[] = [];
  for (const item of items) {
    const score = scoreMatch(toText(item), query);
    if (score !== null) scored.push({ item, score });
  }
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, limit).map((m) => m.item);
}
