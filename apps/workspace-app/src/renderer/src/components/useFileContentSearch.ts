import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { EditorProvider, EditorReplaceOptions, EditorSearchResult } from '@workspace/editor'

const DEBOUNCE_MS = 250

function mergeSearchResults(
  current: EditorSearchResult[],
  updates: EditorSearchResult[]
): EditorSearchResult[] {
  const next = [...current]
  const indexById = new Map(next.map((entry, index) => [entry.item.itemId, index]))
  for (const update of updates) {
    const index = indexById.get(update.item.itemId)
    if (index === undefined) {
      indexById.set(update.item.itemId, next.length)
      next.push(update)
    } else {
      next[index] = update
    }
  }
  return next
}

interface UseFileContentSearchOptions {
  provider: EditorProvider
  supportsContentSearch: boolean
  query: string
  searchOptions: EditorReplaceOptions
  onSearchStart: () => void
}

interface UseFileContentSearchResult {
  results: EditorSearchResult[]
  searching: boolean
  error: string | null
  setError: (error: string | null) => void
  runSearch: (query: string, options: EditorReplaceOptions) => void
}

export function useFileContentSearch({
  provider,
  supportsContentSearch,
  query,
  searchOptions,
  onSearchStart
}: UseFileContentSearchOptions): UseFileContentSearchResult {
  const [results, setResults] = useState<EditorSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const activeControllerRef = useRef<AbortController | null>(null)
  const streamFrameRef = useRef<number | null>(null)
  const streamedResultsRef = useRef(new Map<string, EditorSearchResult>())

  const clearStream = useCallback((): void => {
    if (streamFrameRef.current !== null) cancelAnimationFrame(streamFrameRef.current)
    streamFrameRef.current = null
    streamedResultsRef.current.clear()
  }, [])

  useLayoutEffect(() => {
    activeControllerRef.current?.abort()
    activeControllerRef.current = null
    clearStream()
    // Clear old-query results before paint so they are never displayed for the new query.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResults([])
    setError(null)
    setSearching(Boolean(query))
  }, [
    clearStream,
    query,
    searchOptions.caseSensitive,
    searchOptions.regex,
    searchOptions.wholeWord
  ])

  const runSearch = useCallback(
    (searchQuery: string, options: EditorReplaceOptions): void => {
      activeControllerRef.current?.abort()
      clearStream()
      setResults([])
      setError(null)
      setSearching(false)
      onSearchStart()
      if (!supportsContentSearch) {
        setError('Content search is not supported by this provider.')
        return
      }
      if (!searchQuery) return

      const controller = new AbortController()
      activeControllerRef.current = controller
      setSearching(true)
      void provider
        .search(searchQuery, { ...options, target: 'contents' }, controller.signal, (result) => {
          if (activeControllerRef.current !== controller) return
          streamedResultsRef.current.set(result.item.itemId, result)
          if (streamFrameRef.current !== null) return
          streamFrameRef.current = requestAnimationFrame(() => {
            streamFrameRef.current = null
            const updates = [...streamedResultsRef.current.values()]
            streamedResultsRef.current.clear()
            setResults((current) => mergeSearchResults(current, updates))
          })
        })
        .then((next) => {
          if (activeControllerRef.current !== controller) return
          clearStream()
          setResults(next)
          setSearching(false)
        })
        .catch((cause) => {
          if (activeControllerRef.current !== controller) return
          if (streamFrameRef.current !== null) cancelAnimationFrame(streamFrameRef.current)
          streamFrameRef.current = null
          if (!controller.signal.aborted)
            setError(cause instanceof Error ? cause.message : String(cause))
          const updates = [...streamedResultsRef.current.values()]
          streamedResultsRef.current.clear()
          if (updates.length) setResults((current) => mergeSearchResults(current, updates))
          setSearching(false)
        })
    },
    [clearStream, onSearchStart, provider, supportsContentSearch]
  )

  useEffect(() => {
    const timer = setTimeout(() => runSearch(query, searchOptions), DEBOUNCE_MS)
    return () => clearTimeout(timer)
    // Search runs on query/filter changes only, matching the existing panel contract.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, searchOptions.caseSensitive, searchOptions.regex, searchOptions.wholeWord])

  useEffect(
    () => () => {
      activeControllerRef.current?.abort()
      activeControllerRef.current = null
      clearStream()
    },
    [clearStream]
  )

  return { results, searching, error, setError, runSearch }
}
