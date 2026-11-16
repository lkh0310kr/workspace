import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import styles from './terminal-search.module.css'
import { safeFind } from './safeFind'

const FIND_QUERY_MAX_BYTES = 2 * 1024

function getFindRequestQuery(query: string): string | null {
  const bytes = new TextEncoder().encode(query).length
  return bytes > FIND_QUERY_MAX_BYTES ? null : query
}

function clearTerminalSearch(searchAddon: SearchAddonPort | null): void {
  if (!searchAddon) return
  searchAddon.clearDecorations()
  searchAddon.clearActiveDecoration()
  searchAddon.findNext('')
}

export interface SearchAddonPort {
  clearDecorations(): void
  clearActiveDecoration(): void
  findNext(term: string, options?: SearchOptions): boolean
  findPrevious(term: string, options?: SearchOptions): boolean
}

type SearchOptions = {
  caseSensitive?: boolean
  regex?: boolean
  incremental?: boolean
  decorations?: TerminalSearchDecorations
}

export interface TerminalSearchDecorations {
  matchBackground: string
  matchBorder: string
  matchOverviewRuler: string
  activeMatchBackground: string
  activeMatchBorder: string
  activeMatchColorOverviewRuler: string
}

type Props = {
  isOpen: boolean
  onClose: () => void
  searchAddonRef: RefObject<SearchAddonPort | null>
  decorations: TerminalSearchDecorations
  registerPortal: (id: string, onDismiss: () => void) => () => void
}

export function TerminalSearch({
  isOpen,
  onClose,
  searchAddonRef,
  decorations,
  registerPortal
}: Props) {
  const [query, setQuery] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [regex, setRegex] = useState(false)
  const requestQuery = getFindRequestQuery(query)

  const searchAddon = searchAddonRef.current

  const searchOptions = useCallback(
    (incremental = false) => ({
      caseSensitive,
      regex,
      incremental,
      decorations
    }),
    [caseSensitive, decorations, regex]
  )

  const findNext = useCallback(() => {
    if (searchAddon && requestQuery) {
      safeFind(
        (term, options) => searchAddon.findNext(term, options),
        requestQuery,
        searchOptions()
      )
    }
  }, [searchAddon, requestQuery, searchOptions])

  const findPrevious = useCallback(() => {
    if (searchAddon && requestQuery) {
      safeFind(
        (term, options) => searchAddon.findPrevious(term, options),
        requestQuery,
        searchOptions()
      )
    }
  }, [searchAddon, requestQuery, searchOptions])

  useEffect(() => () => clearTerminalSearch(searchAddon), [searchAddon])

  useEffect(() => {
    if (!isOpen) {
      clearTerminalSearch(searchAddon)
      return
    }
    if (!requestQuery) {
      clearTerminalSearch(searchAddon)
      return
    }
    if (searchAddon) {
      safeFind(
        (term, options) => searchAddon.findNext(term, options),
        requestQuery,
        searchOptions(true)
      )
    }
  }, [requestQuery, searchAddon, isOpen, caseSensitive, regex, searchOptions])

  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Why: an inline onClose prop is a new identity every render; keying this
  // effect on it would re-register the portal every render, and
  // registerPortal's reconcile()+notifyListeners() can feed right back into
  // a re-render (see ContextMenu.tsx's fix for the same class of bug).
  useEffect(() => {
    if (!isOpen) return
    return registerPortal('terminal-search', () => onCloseRef.current())
  }, [isOpen, registerPortal])

  const onKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation()
    if (e.key === 'Escape') {
      onClose()
    } else if (e.key === 'Enter' && e.shiftKey) {
      findPrevious()
    } else if (e.key === 'Enter') {
      findNext()
    }
  }

  if (!isOpen) return null

  return (
    <div className={styles.searchBar} data-terminal-search-root onKeyDown={onKeyDown}>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search"
        autoFocus
      />

      <button
        type="button"
        className={`${styles.searchToggle} ${caseSensitive ? styles.searchToggleActive : ''}`}
        title="Case sensitive"
        onClick={() => setCaseSensitive((v) => !v)}
      >
        Aa
      </button>

      <button
        type="button"
        className={`${styles.searchToggle} ${regex ? styles.searchToggleActive : ''}`}
        title="Regex"
        onClick={() => setRegex((v) => !v)}
      >
        .*
      </button>

      <span className={styles.divider} />

      <button type="button" title="Previous match" onClick={findPrevious}>
        ↑
      </button>
      <button type="button" title="Next match" onClick={findNext}>
        ↓
      </button>

      <span className={styles.divider} />

      <button type="button" title="Close" className={styles.closeButton} onClick={onClose}>
        ×
      </button>
    </div>
  )
}
