import { useEffect, type DragEvent, type KeyboardEvent, type MouseEvent, type RefObject, type ReactNode } from "react";
import type { EditorItemKind } from "./provider";
import type { EditorTreeProjection } from "./treeModel";
import { EditorTreeRow } from "./EditorTreeRow";
import { EditorTreeVirtualList } from "./EditorTreeVirtualList";

export const EDITOR_TREE_DRAG_MIME_TYPE = "application/x-workspace-editor-tree-paths";

export interface EditorTreeViewItem {
  id: string;
  path: string;
  name: string;
  kind: EditorItemKind;
  depth: number;
  expandable?: boolean;
  expanded?: boolean;
  loading?: boolean;
  active?: boolean;
  selected?: boolean;
  multiSelected?: boolean;
  cut?: boolean;
  dropTarget?: boolean;
  tabIndex?: number;
  trailingStatus?: ReactNode;
  showGuides?: boolean;
  source?: unknown;
}

export interface EditorTreeViewProps {
  rootRef: RefObject<HTMLElement | null>;
  scrollRef?: RefObject<HTMLElement | null>;
  projection: EditorTreeProjection<EditorTreeViewItem>;
  className: string;
  listClassName?: string;
  ariaLabel: string;
  ariaBusy?: boolean;
  canMove?: boolean;
  canMultiSelect?: boolean;
  dragMimeType?: string;
  tabIndex?: number;
  emptyContent?: ReactNode;
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
  onScroll?: (scrollTop: number) => void;
  onClearSelection?: () => void;
  onSetDropTarget?: (path: string | null) => void;
  onDropItems?: (paths: string[], destination: string) => void;
  onFocusPath?: (path: string) => void;
  onDragStart?: (item: EditorTreeViewItem, index: number, event: DragEvent<HTMLButtonElement>) => void;
  onContextMenu?: (item: EditorTreeViewItem, event: MouseEvent<HTMLButtonElement>) => void;
  onRootContextMenu?: (event: MouseEvent<HTMLElement>) => void;
  onSelectRow?: (path: string, index: number, additive: boolean, range: boolean) => void;
  onActivate?: (item: EditorTreeViewItem, event: MouseEvent<HTMLButtonElement>) => void;
  onDoubleActivate?: (item: EditorTreeViewItem, event: MouseEvent<HTMLButtonElement>) => void;
}

function parentPath(path: string): string {
  const separator = path.lastIndexOf("/");
  return separator < 0 ? "" : path.slice(0, separator);
}

function parsePaths(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((path): path is string => typeof path === "string") : [];
  } catch {
    return [];
  }
}

function TreeDisclosure() {
  return <svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m4 2 4 4-4 4" /></svg>;
}

/** Shared tree shell, virtual rows, pointer selection, context, and drag/drop routing. */
export function EditorTreeView({
  rootRef,
  scrollRef,
  projection,
  className,
  listClassName,
  ariaLabel,
  ariaBusy = false,
  canMove = false,
  canMultiSelect = false,
  dragMimeType = EDITOR_TREE_DRAG_MIME_TYPE,
  tabIndex = 0,
  emptyContent,
  onKeyDown,
  onScroll,
  onClearSelection,
  onSetDropTarget,
  onDropItems,
  onFocusPath,
  onDragStart,
  onContextMenu,
  onRootContextMenu,
  onSelectRow,
  onActivate,
  onDoubleActivate,
}: EditorTreeViewProps) {
  useEffect(() => {
    const element = scrollRef?.current;
    if (!element || !onScroll) return;
    const handleScroll = () => onScroll(element.scrollTop);
    element.addEventListener("scroll", handleScroll, { passive: true });
    return () => element.removeEventListener("scroll", handleScroll);
  }, [scrollRef, onScroll]);

  const acceptsTreeDrag = (event: DragEvent<HTMLElement>) => canMove && event.dataTransfer.types.includes(dragMimeType);
  const drop = (event: DragEvent<HTMLElement>, destination: string) => {
    event.preventDefault();
    event.stopPropagation();
    onSetDropTarget?.(null);
    onDropItems?.(parsePaths(event.dataTransfer.getData(dragMimeType)), destination);
  };

  return (
    <div
      ref={rootRef as RefObject<HTMLDivElement | null>}
      className={className}
      tabIndex={tabIndex}
      role="tree"
      aria-label={ariaLabel}
      aria-multiselectable={canMultiSelect}
      aria-busy={ariaBusy}
      onKeyDown={onKeyDown}
      onClick={onClearSelection}
      onContextMenu={(event) => {
        event.preventDefault();
        onRootContextMenu?.(event);
      }}
      onDragOver={canMove ? (event) => {
        if (!acceptsTreeDrag(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        onSetDropTarget?.("");
      } : undefined}
      onDragLeave={canMove ? (event) => {
        if (event.target === event.currentTarget) onSetDropTarget?.(null);
      } : undefined}
      onDrop={canMove ? (event) => {
        if (event.target === event.currentTarget) drop(event, "");
      } : undefined}
      onScroll={!scrollRef && onScroll ? (event) => onScroll(event.currentTarget.scrollTop) : undefined}
    >
      <EditorTreeVirtualList
        projection={projection}
        itemKey={(item) => item.id}
        className={listClassName}
        emptyContent={emptyContent}
        renderItem={(item, index) => (
          <EditorTreeRow
            id={item.id}
            path={item.path}
            name={item.name}
            trailingStatus={item.trailingStatus}
            kind={item.kind}
            depth={item.depth}
            disclosure={<TreeDisclosure />}
            expandable={item.expandable}
            expanded={item.expanded}
            loading={item.loading}
            active={item.active}
            selected={item.selected}
            multiSelected={item.multiSelected}
            cut={item.cut}
            dropTarget={item.dropTarget}
            tabIndex={item.tabIndex ?? -1}
            showGuides={item.showGuides}
            onFocus={() => onFocusPath?.(item.path)}
            onDragStart={onDragStart ? (event) => onDragStart(item, index, event) : undefined}
            onDragOver={canMove ? (event) => {
              if (!acceptsTreeDrag(event)) return;
              event.preventDefault();
              event.stopPropagation();
              event.dataTransfer.dropEffect = "move";
              onSetDropTarget?.(item.expandable ? item.path : parentPath(item.path));
            } : undefined}
            onDragLeave={canMove ? (event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node)) onSetDropTarget?.(null);
            } : undefined}
            onDrop={canMove ? (event) => {
              if (!acceptsTreeDrag(event)) return;
              drop(event, item.expandable ? item.path : parentPath(item.path));
            } : undefined}
            onContextMenu={onContextMenu ? (event) => {
              event.preventDefault();
              event.stopPropagation();
              event.currentTarget.focus();
              onContextMenu(item, event);
            } : undefined}
            onClick={(event) => {
              event.stopPropagation();
              const additive = canMultiSelect && (event.metaKey || event.ctrlKey);
              const range = canMultiSelect && event.shiftKey;
              onSelectRow?.(item.path, index, additive, range);
              if (!additive && !range) onActivate?.(item, event);
            }}
            onDoubleClick={onDoubleActivate ? (event) => {
              event.stopPropagation();
              onDoubleActivate(item, event);
            } : undefined}
          />
        )}
      />
    </div>
  );
}
