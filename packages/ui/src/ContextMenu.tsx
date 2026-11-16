import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { MenuList, type MenuListItem } from './MenuList'
import type { RegisterPortal } from './Popover'
import './context-menu.css'

export type ContextMenuItem =
  | { type: 'separator' }
  | {
      type: 'button'
      label: string
      icon?: string
      active?: boolean
      disabled?: boolean
      onClick: () => void
    }
  | {
      type: 'submenu'
      label: string
      items: ContextMenuItem[]
    }

export interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  ariaLabel?: string
  onClose: () => void
  host: ContextMenuHost
}

export interface ContextMenuHost {
  registerPortal: RegisterPortal
  renderIcon?: (icon: string) => ReactNode
}

function clampPosition(x: number, y: number, width: number, height: number) {
  const margin = 4
  return {
    left: Math.min(Math.max(x, margin), window.innerWidth - width - margin),
    top: Math.min(Math.max(y, margin), window.innerHeight - height - margin)
  }
}

function ContextMenuPanel({
  items,
  style,
  onClose,
  flyout = false,
  ariaLabel,
  renderIcon
}: {
  items: ContextMenuItem[]
  style?: CSSProperties
  onClose: () => void
  flyout?: boolean
  ariaLabel?: string
  renderIcon?: (icon: string) => ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [openSubmenu, setOpenSubmenu] = useState<number | null>(null)
  const [flipLeft, setFlipLeft] = useState(false)
  const [position, setPosition] = useState(style ?? {})

  useLayoutEffect(() => {
    if (!flyout)
      panelRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  }, [flyout])

  useLayoutEffect(() => {
    if (flyout || !panelRef.current || style?.left === undefined || style?.top === undefined) return
    const rect = panelRef.current.getBoundingClientRect()
    setPosition(clampPosition(style.left as number, style.top as number, rect.width, rect.height))
  }, [flyout, style?.left, style?.top])

  useLayoutEffect(() => {
    if (!flyout || !panelRef.current) return
    const rect = panelRef.current.getBoundingClientRect()
    setFlipLeft(rect.right > window.innerWidth - 4)
  }, [flyout, items, openSubmenu])

  const runButton = (item: Extract<ContextMenuItem, { type: 'button' }>) => {
    if (item.disabled) return
    item.onClick()
    onClose()
  }

  if (!items.some((item) => item.type === 'submenu')) {
    const sharedItems: MenuListItem[] = items.map((item, index) => {
      if (item.type === 'separator') return { type: 'separator' }
      const button = item as Extract<ContextMenuItem, { type: 'button' }>
      return {
        type: 'item',
        id: `${index}:${button.label}`,
        label: button.label,
        disabled: button.disabled,
        active: button.active,
        icon: button.icon,
        onSelect: () => runButton(button)
      }
    })
    return (
      <MenuList
        ref={panelRef}
        items={sharedItems}
        className={`context-menu${flyout ? ' context-menu-flyout' : ''}${flipLeft ? ' context-menu-flyout-left' : ''}`}
        ariaLabel={ariaLabel}
        itemClassName="context-menu-item"
        activeClassName="active"
        separatorClassName="context-menu-sep"
        iconClassName="context-menu-icon"
        labelClassName="context-menu-label"
        renderIcon={renderIcon}
        style={flyout ? style : position}
        onClick={(event) => event.stopPropagation()}
      />
    )
  }

  return (
    <div
      ref={panelRef}
      className={`context-menu${flyout ? ' context-menu-flyout' : ''}${flipLeft ? ' context-menu-flyout-left' : ''}`}
      role="menu"
      data-menu-list=""
      aria-label={ariaLabel}
      style={flyout ? style : position}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item, index) => {
        if (item.type === 'separator') {
          return <div key={index} className="context-menu-sep" />
        }

        if (item.type === 'button') {
          return (
            <button
              key={index}
              type="button"
              className={`context-menu-item${item.active ? ' active' : ''}`}
              disabled={item.disabled}
              onClick={() => runButton(item)}
            >
              {item.icon ? (
                <span className="context-menu-icon">
                  {renderIcon ? renderIcon(item.icon) : item.icon}
                </span>
              ) : null}
              <span className="context-menu-label">{item.label}</span>
            </button>
          )
        }

        const open = openSubmenu === index
        return (
          <div
            key={index}
            data-submenu-index={index}
            className="context-menu-submenu-row"
            onMouseEnter={() => setOpenSubmenu(index)}
            onMouseLeave={(e) => {
              const related = e.relatedTarget as Node | null
              if (!e.currentTarget.contains(related)) setOpenSubmenu(null)
            }}
          >
            <div className={`context-menu-item context-menu-submenu-trigger${open ? ' open' : ''}`}>
              <span className="context-menu-label">{item.label}</span>
              <span className="context-menu-chevron">›</span>
            </div>
            {open ? (
              <ContextMenuPanel
                items={item.items}
                onClose={onClose}
                flyout
                style={{ left: '100%', top: 0 }}
                renderIcon={renderIcon}
              />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

export function ContextMenu({ x, y, items, ariaLabel, onClose, host }: ContextMenuProps) {
  const portalId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  // Why: callers routinely pass an inline `() => setX(null)` onClose, a new
  // identity every render. registerPortal's cleanup+re-register on identity
  // change can notify host subscribers and force a re-render — feeding
  // right back into a new onClose identity. A ref keeps every effect below
  // mount-stable regardless of the caller's callback stability (STA "Maximum
  // update depth exceeded" on TreeView right-click).
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useLayoutEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])

  useLayoutEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return
      onCloseRef.current()
    }
    const timer = window.setTimeout(() => {
      document.addEventListener('pointerdown', onPointerDown, true)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [])

  useLayoutEffect(() => {
    return host.registerPortal(portalId, () => onCloseRef.current())
  }, [host.registerPortal, portalId])

  return createPortal(
    <div ref={rootRef}>
      <ContextMenuPanel
        items={items}
        ariaLabel={ariaLabel}
        style={{ left: x, top: y }}
        onClose={onClose}
        renderIcon={host.renderIcon}
      />
    </div>,
    document.body
  )
}
