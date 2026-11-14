import {
  forwardRef,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEventHandler,
  type ReactNode
} from 'react'

export type EditorMenuItem =
  | { type: 'separator' }
  | {
      type: 'item'
      id: string
      label: string
      disabled?: boolean
      active?: boolean
      danger?: boolean
      icon?: string
      onSelect: () => void
    }

interface EditorMenuListProps {
  items: readonly EditorMenuItem[]
  className: string
  itemClassName?: string
  separatorClassName?: string
  iconClassName?: string
  labelClassName?: string
  dangerClassName?: string
  activeClassName?: string
  renderIcon?: (icon: string) => ReactNode
  ariaLabel?: string
  style?: CSSProperties
  onClick?: MouseEventHandler<HTMLDivElement>
  onClose?: () => void
}

/** Shared accessible menu item list; hosts keep ownership of menu actions and dismissal lifecycle. */
export const EditorMenuList = forwardRef<HTMLDivElement, EditorMenuListProps>(
  function EditorMenuList(
    {
      items,
      className,
      itemClassName = '',
      separatorClassName = '',
      iconClassName = '',
      labelClassName = '',
      dangerClassName = '',
      activeClassName = '',
      renderIcon,
      ariaLabel,
      style,
      onClick,
      onClose
    },
    ref
  ) {
    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
      if (
        event.key !== 'ArrowDown' &&
        event.key !== 'ArrowUp' &&
        event.key !== 'Home' &&
        event.key !== 'End'
      )
        return
      const buttons = [
        ...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
      ]
      if (!buttons.length) return
      event.preventDefault()
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? buttons.length - 1
            : event.key === 'ArrowDown'
              ? (current + 1 + buttons.length) % buttons.length
              : (current <= 0 ? buttons.length : current) - 1
      buttons[next]?.focus()
    }

    return (
      <div
        ref={ref}
        role="menu"
        aria-label={ariaLabel}
        className={className}
        style={style}
        onClick={onClick}
        onKeyDown={handleKeyDown}
      >
        {items.map((item, index) =>
          item.type === 'separator' ? (
            <div key={`separator-${index}`} role="separator" className={separatorClassName} />
          ) : (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className={
                [
                  itemClassName,
                  item.active ? activeClassName : '',
                  item.danger ? dangerClassName : ''
                ]
                  .filter(Boolean)
                  .join(' ') || undefined
              }
              disabled={item.disabled}
              onClick={() => {
                item.onSelect()
                onClose?.()
              }}
            >
              {item.icon && (
                <span className={iconClassName || undefined}>{renderIcon?.(item.icon)}</span>
              )}
              <span className={labelClassName || undefined}>{item.label}</span>
            </button>
          )
        )}
      </div>
    )
  }
)
