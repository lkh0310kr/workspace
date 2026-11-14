export interface EditorFuzzyMatch<T> {
  item: T
  score: number
}

function scoreMatch(text: string, query: string): number | null {
  if (!query) return 0
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const contiguousIndex = lowerText.indexOf(lowerQuery)
  if (contiguousIndex !== -1) return contiguousIndex

  let textIndex = 0
  let firstMatchIndex = -1
  let lastMatchIndex = -1
  for (let q = 0; q < lowerQuery.length; q++) {
    const found = lowerText.indexOf(lowerQuery[q], textIndex)
    if (found === -1) return null
    if (firstMatchIndex === -1) firstMatchIndex = found
    lastMatchIndex = found
    textIndex = found + 1
  }
  return 1000 + (lastMatchIndex - firstMatchIndex) + firstMatchIndex
}

/** Rank contiguous matches ahead of scattered subsequence matches. */
export function fuzzyEditorSearch<T>(
  items: readonly T[],
  query: string,
  toText: (item: T) => string,
  limit = 100
): T[] {
  if (!query.trim()) return items.slice(0, limit)
  const scored: EditorFuzzyMatch<T>[] = []
  for (const item of items) {
    const score = scoreMatch(toText(item), query)
    if (score !== null) scored.push({ item, score })
  }
  scored.sort((a, b) => a.score - b.score)
  return scored.slice(0, limit).map(({ item }) => item)
}
