import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import { Popover, type AnchorRect } from '@workspace/ui'
import type { BrowserNavHistoryEntry } from './browserNavigationTypes'

interface Props {
  registerPortal: (id: string, onDismiss: () => void) => () => void
  onDismissPortals: (handler: () => void) => () => void
  fetchHistory: (
    webContentsId: number
  ) => Promise<{ entries: BrowserNavHistoryEntry[]; activeIndex: number } | null>
  goToHistoryIndex: (webContentsId: number, index: number) => Promise<void>
  direction: 'back' | 'forward'
  disabled: boolean
  active: boolean
  webContentsId: number | null
  onNavigate: () => void
  onNavigateAction: () => void
}

function labelForEntry(url: string, title: string): string {
  if (title && title !== url) return title
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

export function BrowserNavButton({
  direction,
  registerPortal,
  onDismissPortals,
  fetchHistory,
  goToHistoryIndex,
  disabled,
  active,
  webContentsId,
  onNavigate,
  onNavigateAction
}: Props) {
  const [anchor, setAnchor] = useState<AnchorRect | null>(null)
  const [historyItems, setHistoryItems] = useState<BrowserNavHistoryEntry[]>([])
  const [historyIndices, setHistoryIndices] = useState<number[]>([])
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressTriggeredRef = useRef(false)

  const clearLongPress = useCallback(() => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current)
      longPressRef.current = null
    }
  }, [])

  const closeHistory = useCallback(() => {
    clearLongPress()
    setAnchor(null)
    setHistoryItems([])
    setHistoryIndices([])
  }, [clearLongPress])

  // Popover is portaled to document.body — if this button stays mounted
  // while hidden (PaneGroup keeps inactive tabs alive), a left-open history
  // dropdown's full-screen click-catcher blocks the entire app.
  useEffect(() => {
    if (!active) closeHistory()
  }, [active, closeHistory])

  useEffect(() => onDismissPortals(closeHistory), [onDismissPortals, closeHistory])

  const openHistory = useCallback(
    async (rect: AnchorRect) => {
      if (!webContentsId || disabled) return
      const history = await fetchHistory(webContentsId)
      if (!history || history.entries.length <= 1) return

      const { entries, activeIndex } = history
      const items =
        direction === 'back'
          ? entries.slice(0, activeIndex).reverse()
          : entries.slice(activeIndex + 1)
      const indices =
        direction === 'back'
          ? Array.from({ length: activeIndex }, (_, i) => activeIndex - 1 - i)
          : entries.map((_, i) => activeIndex + 1 + i).filter((i) => i < entries.length)

      if (items.length === 0) return
      setHistoryItems(items)
      setHistoryIndices(indices)
      setAnchor(rect)
    },
    [webContentsId, disabled, direction, fetchHistory]
  )

  const navigate = useCallback(() => {
    if (disabled || !webContentsId) return
    onNavigateAction()
    onNavigate()
  }, [disabled, onNavigate, onNavigateAction, webContentsId])

  const handlePointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (disabled || !webContentsId) return
    longPressTriggeredRef.current = false
    clearLongPress()
    const rect = e.currentTarget.getBoundingClientRect()
    longPressRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true
      void openHistory(rect)
    }, 450)
  }

  const handlePointerUp = () => {
    clearLongPress()
    if (longPressTriggeredRef.current) return
    if (disabled) return
    if (!webContentsId) return
    void navigate()
  }

  const handlePointerLeave = () => {
    clearLongPress()
  }

  return (
    <>
      <button
        type="button"
        className="browser-nav-btn"
        title={direction === 'back' ? 'Back (hold for history)' : 'Forward (hold for history)'}
        disabled={disabled}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onPointerCancel={handlePointerLeave}
        onClick={(e) => e.preventDefault()}
      >
        {direction === 'back' ? '‹' : '›'}
      </button>
      {anchor && historyItems.length > 0 && (
        <Popover
          anchorRect={anchor}
          onClose={closeHistory}
          registerPortal={registerPortal}
          className="browser-nav-history-popover"
        >
          <div className="browser-nav-history-list scroll-region">
            {historyItems.map((entry, i) => {
              const index = historyIndices[i]
              return (
                <button
                  key={`${index}-${entry.url}`}
                  type="button"
                  className="browser-nav-history-item"
                  onClick={() => {
                    if (webContentsId) void goToHistoryIndex(webContentsId, index)
                    closeHistory()
                    onNavigate()
                  }}
                >
                  <span className="browser-nav-history-title">
                    {labelForEntry(entry.url, entry.title)}
                  </span>
                  <span className="browser-nav-history-url">{entry.url}</span>
                </button>
              )
            })}
          </div>
        </Popover>
      )}
    </>
  )
}
