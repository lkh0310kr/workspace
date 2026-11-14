import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface EditorQuickOpenItem {
  id: string
  label: string
  description?: string
}

interface Props {
  query: string
  items: readonly EditorQuickOpenItem[]
  placeholder?: string
  loading?: boolean
  error?: string | null
  emptyMessage?: string
  onQueryChange: (query: string) => void
  onSelect: (id: string) => void
  onClose: () => void
}

/** Shared Cmd+P dialog behavior; providers own search and result ranking. */
export function EditorQuickOpenDialog({
  query,
  items,
  placeholder = 'Go to file…',
  loading = false,
  error,
  emptyMessage = 'No matching files',
  onQueryChange,
  onSelect,
  onClose
}: Props) {
  const [selection, setSelection] = useState({ query, resultKey: '', index: 0 })
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const resultKey = JSON.stringify(items.map((item) => item.id))
  const selectedIndex =
    selection.query === query && selection.resultKey === resultKey ? selection.index : 0

  useEffect(() => {
    inputRef.current?.focus()
  }, [])
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${selectedIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex, resultKey])

  const selectIndex = (index: number): void => setSelection({ query, resultKey, index })

  return createPortal(
    <div className="quick-open-backdrop" onClick={onClose}>
      <div
        className="quick-open-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Quick open"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="quick-open-input"
          placeholder={placeholder}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              onClose()
            } else if (event.key === 'ArrowDown') {
              event.preventDefault()
              selectIndex(Math.min(selectedIndex + 1, Math.max(items.length - 1, 0)))
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              selectIndex(Math.max(selectedIndex - 1, 0))
            } else if (event.key === 'Enter') {
              event.preventDefault()
              const item = items[selectedIndex]
              if (!loading && item) onSelect(item.id)
            }
          }}
        />
        <div className="quick-open-results" ref={listRef}>
          {error ? (
            <div className="quick-open-empty">Could not load files: {error}</div>
          ) : loading ? (
            <div className="quick-open-empty">Loading files…</div>
          ) : items.length === 0 ? (
            <div className="quick-open-empty">{emptyMessage}</div>
          ) : (
            items.map((item, index) => (
              <button
                type="button"
                key={item.id}
                data-index={index}
                className={`quick-open-row${index === selectedIndex ? ' active' : ''}`}
                onMouseEnter={() => selectIndex(index)}
                onClick={() => onSelect(item.id)}
              >
                <span>{item.label}</span>
                {item.description && <small>{item.description}</small>}
              </button>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
