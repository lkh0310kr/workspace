import type {
  DragEventHandler,
  KeyboardEventHandler,
  MouseEventHandler,
  PointerEventHandler,
  ReactNode,
} from "react";

export interface EditorTabChipProps {
  id: string;
  label: string;
  icon?: ReactNode;
  active: boolean;
  dirty?: boolean;
  preview?: boolean;
  title?: string;
  className?: string;
  iconClassName?: string;
  labelClassName?: string;
  closeClassName?: string;
  closeLabel?: string;
  tabIndex?: number;
  ref?: (element: HTMLDivElement | null) => void;
  draggable?: boolean;
  onPointerDown?: PointerEventHandler<HTMLDivElement>;
  onClick?: MouseEventHandler<HTMLDivElement>;
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
  onContextMenu?: MouseEventHandler<HTMLDivElement>;
  onDragStart?: DragEventHandler<HTMLDivElement>;
  onDragEnd?: DragEventHandler<HTMLDivElement>;
  onClose?: () => void;
}

/** Shared tab-chip markup; containers retain their own ordering and drag policy. */
export function EditorTabChip({
  id,
  label,
  icon,
  active,
  dirty = false,
  preview = false,
  title,
  className = "",
  iconClassName = "editor-tab-chip-icon",
  labelClassName = "editor-tab-chip-label",
  closeClassName = "editor-tab-chip-close",
  closeLabel = `Close ${label}`,
  tabIndex = 0,
  ref,
  draggable = false,
  onPointerDown,
  onClick,
  onKeyDown,
  onContextMenu,
  onDragStart,
  onDragEnd,
  onClose,
}: EditorTabChipProps) {
  return (
    <div
      ref={ref}
      data-editor-tab-id={id}
      className={`editor-tab-chip${active ? " active" : ""}${preview ? " preview" : ""}${className ? ` ${className}` : ""}`}
      role="tab"
      tabIndex={tabIndex}
      aria-selected={active}
      title={title}
      draggable={draggable}
      onPointerDown={onPointerDown}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onContextMenu={onContextMenu}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      {icon != null && <span className={iconClassName}>{icon}</span>}
      <span className={labelClassName}>{label}</span>
      {dirty && <span className="editor-tab-chip-dirty" aria-label="Unsaved changes">●</span>}
      {onClose && (
        <button
          type="button"
          className={closeClassName}
          aria-label={closeLabel}
          title={closeLabel}
          draggable={false}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
