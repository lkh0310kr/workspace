import { type DragEvent, type KeyboardEvent, type MouseEvent, type RefObject } from "react";
import { AppIcon } from "./Icons";
import { entryName, parseTreeDragPaths } from "../domain/fileTree";
import type { FileRecord, TreeRow } from "../domain/types";
import { EditorTreeRow, EditorTreeVirtualList, type EditorTreeProjection } from "@workspace/editor";

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
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  onScroll: (scrollTop: number) => void;
  onSetDropTarget: (path: string | null) => void;
  onDropItems: (paths: string[], destination: string) => void;
  onFocusPath: (path: string) => void;
  onDragStart: (file: FileRecord, index: number, event: DragEvent<HTMLButtonElement>) => void;
  onContextMenu: (file: FileRecord, event: MouseEvent<HTMLButtonElement>) => void;
  onSelectRow: (path: string, index: number, additive: boolean, range: boolean) => void;
  onClearSelection: () => void;
  onActivate: (file: FileRecord) => void;
}

const TREE_PATHS_MIME = "application/x-pkms-tree-paths";

export function FileTreeList({
  treeRef,
  projection,
  selectedPaths,
  expandedFolders,
  focusedPath,
  currentFolder,
  activeFileId,
  cutPaths,
  dropTarget,
  loadingFolders,
  busy,
  loading,
  onKeyDown,
  onScroll,
  onSetDropTarget,
  onDropItems,
  onFocusPath,
  onDragStart,
  onContextMenu,
  onSelectRow,
  onClearSelection,
  onActivate,
}: FileTreeListProps) {
  const handleDrop = (event: DragEvent<HTMLElement>, destination: string) => {
    event.preventDefault();
    event.stopPropagation();
    onSetDropTarget(null);
    onDropItems(parseTreeDragPaths(event.dataTransfer.getData(TREE_PATHS_MIME)), destination);
  };

  return (
    <nav
      ref={treeRef}
      className={`file-list file-tree${dropTarget === "" ? " tree-root-drop" : ""}`}
      role="tree"
      aria-multiselectable="true"
      aria-label="Repository files"
      aria-busy={busy}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClearSelection();
      }}
      onScroll={(event) => onScroll(event.currentTarget.scrollTop)}
      onDragOver={(event) => {
        event.preventDefault();
        if (event.target === event.currentTarget) onSetDropTarget("");
      }}
      onDragLeave={(event) => {
        if (event.target === event.currentTarget) onSetDropTarget(null);
      }}
      onDrop={(event) => {
        if (event.target === event.currentTarget) handleDrop(event, "");
      }}
    >
      <EditorTreeVirtualList
        projection={projection}
        itemKey={({ file }) => file.id}
        renderItem={({ file, depth }, index) => (
        <EditorTreeRow
          id={file.id}
          path={file.path}
          name={entryName(file.path)}
          kind={file.kind === "folder" ? "directory" : file.kind}
          depth={depth}
          className={file.kind === "folder" ? "folder-row" : "file-row"}
          icon={<AppIcon name={file.kind === "folder" ? "folder" : file.kind === "markdown" ? "fileText" : "file"} />}
          disclosure={<AppIcon name="chevron" />}
          expandable={file.kind === "folder"}
          expanded={expandedFolders.has(file.path)}
          loading={file.kind === "folder" && loadingFolders.has(file.path)}
          active={(file.path === currentFolder && file.kind === "folder") || activeFileId === file.id}
          selected={selectedPaths.has(file.path)}
          multiSelected={selectedPaths.size > 1 && selectedPaths.has(file.path)}
          cut={cutPaths.has(file.path)}
          dropTarget={dropTarget === file.path}
          tabIndex={focusedPath === file.path || (!focusedPath && index === 0) ? 0 : -1}
          onFocus={() => onFocusPath(file.path)}
          onDragStart={(event) => onDragStart(file, index, event)}
          onDragOver={(event) => {
            if (file.kind !== "folder") return;
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = "move";
            onSetDropTarget(file.path);
          }}
          onDragLeave={(event) => {
            if (file.kind === "folder" && !event.currentTarget.contains(event.relatedTarget as Node)) onSetDropTarget(null);
          }}
          onDrop={(event) => {
            if (file.kind === "folder") handleDrop(event, file.path);
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            event.currentTarget.focus();
            onContextMenu(file, event);
          }}
          onClick={(event) => {
            const additive = event.metaKey || event.ctrlKey;
            if (additive || event.shiftKey) {
              onSelectRow(file.path, index, additive, event.shiftKey);
              return;
            }
            onSelectRow(file.path, index, false, false);
            onActivate(file);
          }}
        />
        )}
        emptyContent={<p className="empty-hint">{loading ? "Loading…" : "Empty folder"}</p>}
      />
    </nav>
  );
}
