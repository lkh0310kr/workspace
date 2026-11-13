import type {
  DragEventHandler,
  KeyboardEventHandler,
  MouseEventHandler,
  ReactNode,
} from "react";
import type { EditorItemKind } from "./provider";

export interface EditorTreeRowProps {
  id: string;
  path: string;
  name: string;
  trailingStatus?: ReactNode;
  kind: EditorItemKind;
  depth: number;
  disclosure?: ReactNode;
  expandable?: boolean;
  expanded?: boolean;
  loading?: boolean;
  className?: string;
  active?: boolean;
  selected?: boolean;
  multiSelected?: boolean;
  cut?: boolean;
  dropTarget?: boolean;
  tabIndex?: number;
  showGuides?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  onDoubleClick?: MouseEventHandler<HTMLButtonElement>;
  onFocus?: React.FocusEventHandler<HTMLButtonElement>;
  onKeyDown?: KeyboardEventHandler<HTMLButtonElement>;
  onContextMenu?: MouseEventHandler<HTMLButtonElement>;
  onDragStart?: DragEventHandler<HTMLButtonElement>;
  onDragOver?: DragEventHandler<HTMLButtonElement>;
  onDragLeave?: DragEventHandler<HTMLButtonElement>;
  onDrop?: DragEventHandler<HTMLButtonElement>;
}

/** Shared tree-row structure and interaction semantics for local and PKMS trees. */
export function EditorTreeRow({
  id,
  path,
  name,
  trailingStatus,
  kind,
  depth,
  disclosure,
  expandable = false,
  expanded = false,
  loading = false,
  className,
  active = false,
  selected = false,
  multiSelected = false,
  cut = false,
  dropTarget = false,
  tabIndex = -1,
  showGuides = false,
  onClick,
  onDoubleClick,
  onFocus,
  onKeyDown,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
}: EditorTreeRowProps) {
  const classes = [
    "editor-tree-item",
    className,
    active && "is-active",
    selected && "is-selected",
    multiSelected && "is-multi-selected",
    cut && "is-cut",
    dropTarget && "is-drop-target",
    expanded && "is-expanded",
    `editor-tree-item--${kind}`,
  ].filter(Boolean).join(" ");

  return (
    <button
      type="button"
      role="treeitem"
      data-tree-path={path}
      data-editor-item-id={id}
      aria-selected={selected || multiSelected}
      aria-level={depth + 1}
      aria-expanded={expandable ? expanded : undefined}
      tabIndex={tabIndex}
      draggable={Boolean(onDragStart)}
      className={classes}
      style={{ paddingInlineStart: 8 + depth * 14 }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      onContextMenu={onContextMenu}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {showGuides && Array.from({ length: depth }, (_, level) => (
        <span key={level} className="editor-tree-guide" style={{ insetInlineStart: level * 14 + 14 }} />
      ))}
      <span className={`editor-tree-disclosure${expanded ? " is-expanded" : ""}`} aria-hidden="true">
        {loading ? <span className="editor-tree-loading" /> : expandable ? disclosure : null}
      </span>
      <span className="editor-tree-name">{name}</span>
      {trailingStatus && <span className="editor-tree-trailing-status">{trailingStatus}</span>}
    </button>
  );
}
