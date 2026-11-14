import { useEffect, useState } from 'react'
import { editorSupportsSearch, type EditorProvider, type EditorTreeItem } from './provider'

interface Options {
  provider: EditorProvider | null | undefined
  query: string
  enabled?: boolean
  limit?: number
  errorMessage?: string
}

interface SearchState {
  provider: EditorProvider
  query: string
  limit: number | undefined
  status: 'loading' | 'ready' | 'error'
  items: EditorTreeItem[]
  error: string | null
}

interface Result {
  items: EditorTreeItem[]
  loading: boolean
  error: string | null
}

const QUICK_OPEN_DEBOUNCE_MS = 80

/** Shared provider-backed fuzzy name search for the Quick Open dialog. */
export function useEditorQuickOpenSearch({
  provider,
  query,
  enabled = true,
  limit,
  errorMessage = 'Could not search files.'
}: Options): Result {
  const [state, setState] = useState<SearchState | null>(null)
  const supported = editorSupportsSearch(provider, 'names')

  useEffect(() => {
    if (!provider || !enabled || !supported) {
      setState(null)
      return
    }

    let controller: AbortController | undefined
    const timer = setTimeout(() => {
      controller = new AbortController()
      setState({ provider, query, limit, status: 'loading', items: [], error: null })
      void provider
        .search(
          query,
          {
            target: 'names',
            caseSensitive: false,
            regex: false,
            wholeWord: false,
            fuzzy: true,
            limit
          },
          controller.signal
        )
        .then((results) => {
          if (controller?.signal.aborted) return
          setState({
            provider,
            query,
            limit,
            status: 'ready',
            items: results.map(({ item }) => item),
            error: null
          })
        })
        .catch((cause: unknown) => {
          if (controller?.signal.aborted) return
          setState({
            provider,
            query,
            limit,
            status: 'error',
            items: [],
            error: cause instanceof Error ? cause.message : errorMessage
          })
        })
    }, QUICK_OPEN_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller?.abort()
    }
  }, [provider, query, enabled, supported, limit, errorMessage])

  if (!provider || !enabled || !supported) return { items: [], loading: false, error: null }

  const matchesCurrentSearch =
    state?.provider === provider && state.query === query && state.limit === limit
  if (!matchesCurrentSearch) return { items: [], loading: true, error: null }
  return {
    items: state.status === 'ready' ? state.items : [],
    loading: state.status === 'loading',
    error: state.status === 'error' ? state.error : null
  }
}
