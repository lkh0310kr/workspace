import React, {
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent,
  type KeyboardEvent
} from 'react'
import styles from './treeView.module.css'

void React

export const EDITOR_TREE_DEFAULT_WIDTH = 262
export const EDITOR_TREE_MIN_WIDTH = 180
export const EDITOR_TREE_MAX_WIDTH = 480

export interface EditorTreeResizeHandleProps {
  width: number
  minWidth?: number
  maxWidth?: number
  collapseBelow?: number
  onWidthChange: (width: number) => void
  onCollapse?: () => void
  ariaLabel?: string
}

/** Shared pointer and keyboard resize behavior for editor tree sidebars. */
export function EditorTreeResizeHandle({
  width,
  minWidth = EDITOR_TREE_MIN_WIDTH,
  maxWidth = EDITOR_TREE_MAX_WIDTH,
  collapseBelow,
  onWidthChange,
  onCollapse,
  ariaLabel = 'Resize file tree'
}: EditorTreeResizeHandleProps) {
  const drag = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null)
  const clamp = (next: number) => Math.max(minWidth, Math.min(maxWidth, Math.round(next)))
  const applyWidth = (startWidth: number, startX: number, clientX: number) => {
    const next = startWidth + clientX - startX
    if (collapseBelow !== undefined && next < collapseBelow) {
      onCollapse?.()
      return
    }
    onWidthChange(clamp(next))
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse') return
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: width }
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    applyWidth(current.startWidth, current.startX, event.clientX)
  }

  const onMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    const startX = event.clientX
    const startWidth = width
    const onMouseMove = (moveEvent: MouseEvent) => applyWidth(startWidth, startX, moveEvent.clientX)
    const stop = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', stop)
      window.removeEventListener('blur', stop)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', stop)
    window.addEventListener('blur', stop)
  }

  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    let next: number | undefined
    if (event.key === 'ArrowLeft') next = width - 16
    if (event.key === 'ArrowRight') next = width + 16
    if (event.key === 'Home') next = minWidth
    if (event.key === 'End') next = maxWidth
    if (next === undefined) return
    event.preventDefault()
    if (collapseBelow !== undefined && next < collapseBelow) onCollapse?.()
    else onWidthChange(clamp(next))
  }

  return (
    <div
      className={styles.resizeHandle}
      data-editor-tree-resizer=""
      role="separator"
      aria-label={ariaLabel}
      aria-orientation="vertical"
      aria-valuemin={minWidth}
      aria-valuemax={maxWidth}
      aria-valuenow={Math.round(width)}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onMouseDown={onMouseDown}
      onKeyDown={onKeyDown}
    />
  )
}
