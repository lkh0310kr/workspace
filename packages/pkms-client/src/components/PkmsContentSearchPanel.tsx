import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  editorSupportsSearch,
  type EditorProvider,
  type EditorSearchMatch,
  type EditorSearchResult
} from '@workspace/editor'

interface Props {
  provider: EditorProvider | null
  coverage: { indexedFiles: number; searchableFiles: number; pendingFiles: number } | null
  onCoverageChange: (coverage: Props['coverage']) => void
  onClose: () => void
  onSelect: (result: EditorSearchResult, line: number) => void
}

const DEBOUNCE_MS = 250

function highlightedText(text: string, ranges: EditorSearchMatch['ranges']): ReactNode {
  const parts: ReactNode[] = []
  let cursor = 0
  ranges.forEach((range, index) => {
    if (range.start > cursor) parts.push(text.slice(cursor, range.start))
    parts.push(<mark key={index}>{text.slice(range.start, range.end)}</mark>)
    cursor = range.end
  })
  if (cursor < text.length) parts.push(text.slice(cursor))
  return parts.length ? parts : text
}

export function PkmsContentSearchPanel({
  provider,
  coverage,
  onCoverageChange,
  onClose,
  onSelect
}: Props) {
  const [query, setQuery] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [results, setResults] = useState<EditorSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshIndex, setRefreshIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const supportsSearch = editorSupportsSearch(provider, 'contents')
  const totalMatches = useMemo(
    () => results.reduce((count, result) => count + (result.matches?.length ?? 0), 0),
    [results]
  )

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true })
    return () => controllerRef.current?.abort()
  }, [])

  useEffect(() => {
    controllerRef.current?.abort()
    setResults([])
    setNextCursor(null)
    setHasMore(false)
    setError(null)
    onCoverageChange(null)
    if (!query || !provider || !supportsSearch) {
      setSearching(false)
      return
    }
    setSearching(true)
    const controller = new AbortController()
    controllerRef.current = controller
    const timer = window.setTimeout(() => {
      const searchOptions = {
        target: 'contents' as const,
        caseSensitive,
        regex: false,
        wholeWord: false
      }
      void (provider.searchPage
        ? provider.searchPage(query, searchOptions, controller.signal)
        : provider.search(query, searchOptions, controller.signal).then((results) => ({ results, nextCursor: null, hasMore: false })))
        .then((page) => {
          if (controller.signal.aborted) return
          setResults(page.results)
          setNextCursor(page.nextCursor)
          setHasMore(page.hasMore)
          setSearching(false)
        })
        .catch((cause: unknown) => {
          if (controller.signal.aborted) return
          setError(cause instanceof Error ? cause.message : 'Search failed')
          setSearching(false)
        })
    }, DEBOUNCE_MS)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [caseSensitive, onCoverageChange, provider, query, refreshIndex, supportsSearch])

  const loadMore = async () => {
    const controller = controllerRef.current
    if (!provider?.searchPage || !controller || !nextCursor || !hasMore || loadingMore) return
    setLoadingMore(true)
    try {
      const page = await provider.searchPage(
        query,
        { target: 'contents', caseSensitive, regex: false, wholeWord: false },
        controller.signal,
        nextCursor
      )
      if (controller.signal.aborted) return
      setResults((current) => [...current, ...page.results])
      setNextCursor(page.nextCursor)
      setHasMore(page.hasMore)
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : 'Could not load more search results')
    } finally {
      if (!controller.signal.aborted) setLoadingMore(false)
    }
  }

  useEffect(() => {
    if (!query || !coverage?.pendingFiles || searching) return
    const timer = window.setTimeout(() => setRefreshIndex((current) => current + 1), 15_000)
    return () => window.clearTimeout(timer)
  }, [coverage?.pendingFiles, query, searching])

  return (
    <section className="pkms-search-panel" aria-label="Search in workspace">
      <div className="pkms-search-input-row">
        <input
          ref={inputRef}
          aria-label="Search workspace contents"
          placeholder="Search in workspace"
          value={query}
          maxLength={200}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              onClose()
            } else if (event.key === 'ArrowDown') {
              const first = document.querySelector<HTMLButtonElement>('.pkms-search-match')
              if (first) {
                event.preventDefault()
                first.focus()
              }
            }
          }}
        />
        <button
          type="button"
          className={`pkms-search-case${caseSensitive ? ' is-active' : ''}`}
          aria-label="Match case"
          aria-pressed={caseSensitive}
          title="Match case"
          onClick={() => setCaseSensitive((value) => !value)}
        >
          Aa
        </button>
      </div>
      <div className="pkms-search-status" role="status" aria-live="polite">
        {!supportsSearch
          ? 'Content search is unavailable.'
          : searching
            ? 'Searching…'
            : error
              ? error
              : coverage?.pendingFiles
                ? `Indexing ${coverage.indexedFiles.toLocaleString()} of ${coverage.searchableFiles.toLocaleString()} notes. Results may be incomplete.`
                : query
                  ? `${totalMatches} matching lines in ${results.length} notes`
                  : 'Search all Markdown notes'}
      </div>
      <div className="pkms-search-results">
        {results.map((result) => (
          <section className="pkms-search-file" key={result.item.itemId}>
            <div className="pkms-search-path" title={result.item.path}>
              {result.item.path}
            </div>
            {result.matches?.map((match, index) => (
              <button
                className="pkms-search-match"
                key={`${match.line}:${index}`}
                type="button"
                title={`${result.item.path}:${match.line}`}
                onClick={() => onSelect(result, match.line)}
              >
                <span className="pkms-search-line-number">{match.line}</span>
                <span className="pkms-search-preview">
                  {highlightedText(match.preview, match.ranges)}
                </span>
              </button>
            ))}
          </section>
        ))}
        {hasMore && (
          <button className="pkms-search-load-more" type="button" disabled={loadingMore} onClick={() => void loadMore()}>
            {loadingMore ? 'Loading…' : 'Load more results'}
          </button>
        )}
        {!searching && !error && query && results.length === 0 && (
          <div className="pkms-search-empty">
            {coverage?.pendingFiles ? 'No matches in indexed notes yet.' : 'No results found.'}
          </div>
        )}
      </div>
    </section>
  )
}
