import { useEffect, type RefObject } from 'react'
import {
  resolveEditorTreeKeyboardAction,
  type EditorTreeArrowAction,
  type EditorTreeNavigationRow
} from './treeNavigation'

export interface EditorTreeKeyboardHandlers<TEntry extends { path: string }> {
  onDelete: () => void
  onRename: () => void
  onEnter: (entry: TEntry) => void
  getFocusedEntry: () => TEntry | null
  getVisibleRows: () => readonly EditorTreeNavigationRow[]
  getExpandedPaths: () => ReadonlySet<string>
  onArrowAction: (action: EditorTreeArrowAction, extendSelection: boolean) => void
}

function isTypingTarget(event: KeyboardEvent): boolean {
  return event.composedPath().some((target) => {
    if (!(target instanceof HTMLElement)) return false
    const tag = target.tagName
    return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable
  })
}

function isOutsideTreeShadowRoot(event: KeyboardEvent, tree: HTMLElement | null): boolean {
  const origin = event.composedPath()[0]
  if (!(origin instanceof Node)) return false
  const root = origin.getRootNode()
  return root instanceof ShadowRoot && !tree?.contains(origin)
}

/** Editor tree keys when the tree (or its pane host) has focus. */
export function useEditorTreeKeyboard<TEntry extends { path: string }>(
  hostRef: RefObject<HTMLElement | null>,
  treeRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  handlers: EditorTreeKeyboardHandlers<TEntry>
): void {
  useEffect(() => {
    if (!enabled) return

    function onKeyDown(e: KeyboardEvent): void {
      const host = hostRef.current
      const tree = treeRef.current
      // Events retargeted outside an embedded Shadow DOM are not tree
      // navigation keys.
      if (isTypingTarget(e) || isOutsideTreeShadowRoot(e, tree)) return
      if (!host?.contains(document.activeElement) && document.activeElement !== tree) return
      if (!tree) return

      const entry = handlers.getFocusedEntry()
      if (!entry && e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return

      const action = resolveEditorTreeKeyboardAction(
        e.key,
        handlers.getVisibleRows(),
        entry?.path ?? null,
        handlers.getExpandedPaths()
      )
      if (!action) return
      if (action.type === 'navigate') {
        e.preventDefault()
        handlers.onArrowAction(action.action, e.shiftKey)
      } else if (action.type === 'delete') {
        e.preventDefault()
        handlers.onDelete()
      } else if (action.type === 'rename') {
        e.preventDefault()
        handlers.onRename()
      } else if (action.type === 'activate' && entry) {
        e.preventDefault()
        handlers.onEnter(entry)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled, hostRef, treeRef, handlers])
}
