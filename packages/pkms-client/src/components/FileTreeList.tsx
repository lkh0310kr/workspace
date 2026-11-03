import { Fragment, useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent, type RefObject } from "react";
import { AppIcon } from "./Icons";
import { entryName, parseTreeDragPaths } from "../domain/fileTree";
import type { FileRecord, TreeRow } from "../domain/types";

interface FileTreeListProps {
  treeRef: RefObject<HTMLElement | null>;
  rows: TreeRow[];
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
  creation: { kind: "file" | "folder"; parentPath: string } | null;
  onCreate: (kind: "file" | "folder", parentPath: string, name: string) => void;
  onCancelCreate: () => void;
  renamingPath: string | null;
  onRename: (file: FileRecord, name: string) => void;
  onCancelRename: () => void;
}

const TREE_PATHS_MIME = "application/x-pkms-tree-paths";

function InlineCreationRow({ kind, depth, initialValue = "", onCreate, onCancel }: { kind: "file" | "folder"; depth: number; initialValue?: string; onCreate: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const settled = useRef(false);
  useEffect(() => {
    // Defer so focus restoration from a closing context menu cannot blur (and cancel) the fresh input.
    const frame = requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      if (initialValue) input.setSelectionRange(0, initialValue.lastIndexOf(".") > 0 ? initialValue.lastIndexOf(".") : initialValue.length);
    });
    return () => cancelAnimationFrame(frame);
  }, [initialValue]);
  const settle = (action: () => void) => {
    if (settled.current) return;
    settled.current = true;
    action();
  };
  return <div className="tree-row tree-creation-row" role="treeitem" aria-level={depth + 1} style={{ paddingLeft: 8 + depth * 14 }}>
    <span className="tree-chevron" aria-hidden="true" />
    <span className="file-icon" aria-hidden="true"><AppIcon name={kind === "folder" ? "folder" : "fileText"} /></span>
    <input ref={inputRef} aria-label={kind === "folder" ? "Folder name" : "File name"} placeholder={kind === "folder" ? "New folder name" : "New file name.md"} value={name} onChange={(event) => setName(event.target.value)} onBlur={() => settle(onCancel)} onKeyDown={(event) => {
      event.stopPropagation();
      if (event.key === "Enter") { event.preventDefault(); settle(name.trim() ? () => onCreate(name) : onCancel); }
      if (event.key === "Escape") { event.preventDefault(); settle(onCancel); }
    }} />
  </div>;
}

export function FileTreeList({
  treeRef,
  rows,
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
  creation,
  onCreate,
  onCancelCreate,
  renamingPath,
  onRename,
  onCancelRename,
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
      {creation?.parentPath === "" && <InlineCreationRow key={`create-${creation.kind}-${creation.parentPath}`} kind={creation.kind} depth={0} onCreate={(name) => onCreate(creation.kind, creation.parentPath, name)} onCancel={onCancelCreate} />}
      {rows.map(({ file, depth }, index) => (
        <Fragment key={file.id}>
        {renamingPath === file.path ? <InlineCreationRow key={`rename-${file.path}`} kind={file.kind === "folder" ? "folder" : "file"} depth={depth} initialValue={entryName(file.path)} onCreate={(name) => onRename(file, name)} onCancel={onCancelRename} /> : <button
          type="button"
          role="treeitem"
          data-tree-path={file.path}
          aria-selected={selectedPaths.has(file.path)}
          aria-level={depth + 1}
          aria-expanded={file.kind === "folder" ? expandedFolders.has(file.path) : undefined}
          tabIndex={focusedPath === file.path || (!focusedPath && index === 0) ? 0 : -1}
          draggable
          className={`tree-row ${file.kind === "folder" ? "folder-row" : "file-row"}${file.path === currentFolder && file.kind === "folder" ? " selected" : ""}${activeFileId === file.id ? " selected" : ""}${selectedPaths.has(file.path) ? " multi-selected" : ""}${cutPaths.has(file.path) ? " cut-pending" : ""}${dropTarget === file.path ? " drop-target" : ""}`}
          style={{ paddingLeft: 8 + depth * 14 }}
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
        >
          <span className={`tree-chevron${expandedFolders.has(file.path) ? " expanded" : ""}`} aria-hidden="true">
            {file.kind === "folder" && (loadingFolders.has(file.path) ? <span className="tree-loading-indicator" /> : <AppIcon name="chevron" />)}
          </span>
          <span className="file-icon" aria-hidden="true"><AppIcon name={file.kind === "folder" ? "folder" : file.kind === "markdown" ? "fileText" : "file"} /></span>
          <span className="tree-label">{entryName(file.path)}</span>
        </button>}
        {creation?.parentPath === file.path && file.kind === "folder" && <InlineCreationRow key={`create-${creation.kind}-${creation.parentPath}`} kind={creation.kind} depth={depth + 1} onCreate={(name) => onCreate(creation.kind, creation.parentPath, name)} onCancel={onCancelCreate} />}
        </Fragment>
      ))}
      {!rows.length && <p className="empty-hint">{loading ? "Loading…" : "Empty folder"}</p>}
    </nav>
  );
}
