import type { DragEvent, KeyboardEvent, MouseEvent, ReactNode, RefObject } from 'react'
import { entryName } from '../domain/fileTree'
import type { FileRecord, TreeRow } from '../domain/types'
import { aggregateFolderSyncItemState } from '../domain/syncItemState'
import type { PkmsSyncBridgeStatus } from '../platform/desktopApi'
import {
  EditorTreePane,
  EDITOR_TREE_DRAG_MIME_TYPE,
  editorTreeItemLabel,
  type EditorTreeProjection,
  type EditorTreeViewItem
} from '@workspace/editor'

interface FileTreeListProps {
  header?: ReactNode
  treeRef: RefObject<HTMLElement | null>
  projection: EditorTreeProjection<TreeRow>
  selectedPaths: Set<string>
  expandedFolders: Set<string>
  focusedPath: string | null
  currentFolder: string
  activeFileId: string | null
  inlineEditRow?: {
    mode: 'create' | 'rename'
    id: string
    path: string
    parentPath: string
    name: string
    kind: 'directory' | 'markdown'
    depth: number
    ariaLabel: string
    onChange: (value: string) => void
    onCommit: () => boolean
    onCancel: () => void
  } | null
  syncItemStates?: PkmsSyncBridgeStatus['itemStates']
  cutPaths: Set<string>
  dropTarget: string | null
  loadingFolders: Set<string>
  busy: boolean
  loading: boolean
  canMove: boolean
  canMultiSelect: boolean
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
  onScroll: (scrollTop: number) => void
  onSetDropTarget: (path: string | null) => void
  onDropItems: (paths: string[], destination: string) => void
  onFocusPath: (path: string) => void
  onDragStart?: (file: FileRecord, index: number, event: DragEvent<HTMLButtonElement>) => void
  onContextMenu: (file: FileRecord, event: MouseEvent<HTMLButtonElement>) => void
  onSelectRow: (path: string, index: number, additive: boolean, range: boolean) => void
  onClearSelection: () => void
  onActivate: (file: FileRecord) => void
}

export function FileTreeList(props: FileTreeListProps) {
  const {
    header,
    treeRef,
    projection,
    selectedPaths,
    expandedFolders,
    focusedPath,
    currentFolder,
    activeFileId,
    inlineEditRow = null,
    syncItemStates = {},
    cutPaths,
    dropTarget,
    loadingFolders,
    busy,
    loading,
    canMove,
    canMultiSelect,
    onKeyDown,
    onScroll,
    onSetDropTarget,
    onDropItems,
    onFocusPath,
    onDragStart,
    onContextMenu,
    onSelectRow,
    onClearSelection,
    onActivate
  } = props
  const viewRows: EditorTreeViewItem[] = projection.rows.map(({ file, depth }) => {
      const ownState =
        syncItemStates[file.path] ??
        (/\.local-conflict-[^/]+\.md$/i.test(file.path) ? 'attention' : undefined)
      const descendantState =
        file.kind === 'folder'
          ? aggregateFolderSyncItemState(file.path, syncItemStates, ownState)
          : undefined
      const state = file.kind === 'folder' ? descendantState : ownState
      const stateLabel =
        state === 'synced'
          ? 'Synced'
          : state === 'excluded'
            ? 'Excluded from sync'
            : state === 'attention'
              ? 'Sync needs attention'
              : state === 'syncing'
                ? 'Syncing'
                : 'Waiting to sync'
      const trailingStatus = state ? (
        <>
          <span className={`editor-tree-trailing-status--${state}`} aria-hidden="true">
            {state === 'synced'
              ? '✓'
              : state === 'excluded'
                ? '−'
                : state === 'syncing'
                  ? '↻'
                  : state === 'attention'
                    ? '!'
                    : '•'}
          </span>
        </>
      ) : undefined
      return {
        id: file.id,
        path: file.path,
        name: editorTreeItemLabel(
          entryName(file.path),
          file.kind === 'markdown' ? 'markdown' : 'asset'
        ),
        kind: file.kind === 'folder' ? 'directory' : file.kind,
        depth,
        expandable: file.kind === 'folder',
        expanded: expandedFolders.has(file.path),
        loading: file.kind === 'folder' && loadingFolders.has(file.path),
        active: (file.path === currentFolder && file.kind === 'folder') || activeFileId === file.id,
        selected: selectedPaths.has(file.path),
        multiSelected: selectedPaths.size > 1 && selectedPaths.has(file.path),
        cut: cutPaths.has(file.path),
        dropTarget: dropTarget === file.path,
        trailingStatus,
        trailingStatusLabel: state ? stateLabel : undefined,
        tabIndex:
          focusedPath === file.path ||
          (!focusedPath && projection.startIndex === 0 && file === projection.rows[0]?.file)
            ? 0
            : -1,
        source: file
      }
    })
  if (inlineEditRow) {
    const parentIndex = inlineEditRow.parentPath
      ? viewRows.findIndex((row) => row.path === inlineEditRow.parentPath)
      : -1
    const targetIndex =
      inlineEditRow.mode === 'rename'
        ? viewRows.findIndex((row) => row.path === inlineEditRow.path)
        : parentIndex < 0
          ? -1
          : parentIndex + 1
    if (targetIndex >= 0 || !inlineEditRow.parentPath) {
      viewRows.splice(targetIndex < 0 ? 0 : targetIndex, 0, {
        id: inlineEditRow.id,
        path: inlineEditRow.path,
        name: inlineEditRow.name,
        kind: inlineEditRow.kind,
        depth: inlineEditRow.depth,
        inlineEdit: {
          value: inlineEditRow.name,
          ariaLabel: inlineEditRow.ariaLabel,
          onChange: inlineEditRow.onChange,
          onCommit: inlineEditRow.onCommit,
          onCancel: inlineEditRow.onCancel
        }
      })
    }
  }
  const viewProjection: EditorTreeProjection<EditorTreeViewItem> = {
    ...projection,
    rows: viewRows
  }

  return (
    <EditorTreePane
      ariaLabel="Repository files"
      className="pkms-client-tree-pane"
      header={header}
      tree={{
        rootRef: treeRef,
        projection: viewProjection,
        className: `file-list file-tree${dropTarget === '' ? ' tree-root-drop' : ''}`,
        ariaLabel: 'Repository files',
        ariaBusy: busy,
        canMove,
        canMultiSelect,
        dragMimeType: EDITOR_TREE_DRAG_MIME_TYPE,
        emptyContent: <p className="empty-hint">{loading ? 'Loading…' : 'Empty folder'}</p>,
        onKeyDown,
        onScroll,
        onSetDropTarget,
        onDropItems,
        onFocusPath,
        onClearSelection,
        onSelectRow,
        onDragStart: onDragStart
          ? (item, index, event) => onDragStart(item.source as FileRecord, index, event)
          : undefined,
        onContextMenu: (item, event) => onContextMenu(item.source as FileRecord, event),
        onActivate: (item) => onActivate(item.source as FileRecord)
      }}
    />
  )
}
