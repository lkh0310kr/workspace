import type { DragEvent, KeyboardEvent, MouseEvent, RefObject } from "react";
import { entryName } from "../domain/fileTree";
import type { FileRecord, TreeRow } from "../domain/types";
import { EditorTreeView, EDITOR_TREE_DRAG_MIME_TYPE, editorTreeItemLabel, type EditorTreeProjection, type EditorTreeViewItem } from "@workspace/editor";

interface FileTreeListProps {
  treeRef: RefObject<HTMLElement | null>;
  projection: EditorTreeProjection<TreeRow>;
  selectedPaths: Set<string>;
  expandedFolders: Set<string>;
  focusedPath: string | null;
  currentFolder: string;
  activeFileId: string | null;
  cutPaths: Set<string>;
  dropTarget: string | null;
  loadingFolders: Set<string>;
  busy: boolean;
  loading: boolean;
  canMove: boolean;
  canMultiSelect: boolean;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  onScroll: (scrollTop: number) => void;
  onSetDropTarget: (path: string | null) => void;
  onDropItems: (paths: string[], destination: string) => void;
  onFocusPath: (path: string) => void;
  onDragStart?: (file: FileRecord, index: number, event: DragEvent<HTMLButtonElement>) => void;
  onContextMenu: (file: FileRecord, event: MouseEvent<HTMLButtonElement>) => void;
  onSelectRow: (path: string, index: number, additive: boolean, range: boolean) => void;
  onClearSelection: () => void;
  onActivate: (file: FileRecord) => void;
}

export function FileTreeList(props: FileTreeListProps) {
  const {
    treeRef, projection, selectedPaths, expandedFolders, focusedPath, currentFolder,
    activeFileId, cutPaths, dropTarget, loadingFolders, busy, loading, canMove,
    canMultiSelect, onKeyDown, onScroll, onSetDropTarget, onDropItems, onFocusPath,
    onDragStart, onContextMenu, onSelectRow, onClearSelection, onActivate,
  } = props;
  const viewProjection: EditorTreeProjection<EditorTreeViewItem> = {
    ...projection,
    rows: projection.rows.map(({ file, depth }) => ({
      id: file.id,
      path: file.path,
      name: editorTreeItemLabel(entryName(file.path), file.kind === "markdown" ? "markdown" : "asset"),
      kind: file.kind === "folder" ? "directory" : file.kind,
      depth,
      expandable: file.kind === "folder",
      expanded: expandedFolders.has(file.path),
      loading: file.kind === "folder" && loadingFolders.has(file.path),
      active: (file.path === currentFolder && file.kind === "folder") || activeFileId === file.id,
      selected: selectedPaths.has(file.path),
      multiSelected: selectedPaths.size > 1 && selectedPaths.has(file.path),
      cut: cutPaths.has(file.path),
      dropTarget: dropTarget === file.path,
      tabIndex: focusedPath === file.path || (!focusedPath && projection.startIndex === 0 && file === projection.rows[0]?.file) ? 0 : -1,
      source: file,
    })),
  };

  return (
    <EditorTreeView
      rootRef={treeRef}
      projection={viewProjection}
      className={`file-list file-tree${dropTarget === "" ? " tree-root-drop" : ""}`}
      ariaLabel="Repository files"
      ariaBusy={busy}
      canMove={canMove}
      canMultiSelect={canMultiSelect}
      dragMimeType={EDITOR_TREE_DRAG_MIME_TYPE}
      emptyContent={<p className="empty-hint">{loading ? "Loading…" : "Empty folder"}</p>}
      onKeyDown={onKeyDown}
      onScroll={onScroll}
      onSetDropTarget={onSetDropTarget}
      onDropItems={onDropItems}
      onFocusPath={onFocusPath}
      onClearSelection={onClearSelection}
      onSelectRow={onSelectRow}
      onDragStart={onDragStart ? (item, index, event) => onDragStart(item.source as FileRecord, index, event) : undefined}
      onContextMenu={(item, event) => onContextMenu(item.source as FileRecord, event)}
      onActivate={(item) => onActivate(item.source as FileRecord)}
    />
  );
}
