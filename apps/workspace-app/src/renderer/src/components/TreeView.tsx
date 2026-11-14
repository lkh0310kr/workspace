import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type RefObject
} from 'react'
import { DirEntry, revealItemInDir } from '../fileSystem'
import { interactionCoordinator } from '../interaction/InteractionCoordinator'
import { moveFocusToRendererBeforeFocusedWebviewHidden } from '../layout/browserWebviewRegistry'
import { finishPaneDrag } from '../layout/layoutRef'
import { classifyAssetType } from '../../../shared/asset'
import { TextPrompt } from './TextPrompt'
import { ContextMenu, type ContextMenuItem } from './ContextMenu'
import type { AnchorRect } from './Popover'
import { onWorkspaceDismissPortals } from '../workspacePortalDismiss'
import {
  ancestorDirPaths,
  loadExplorerTreeState,
  resetExplorerTreeState,
  resolveExplorerScrollTop,
  saveExplorerExpanded,
  saveExplorerScrollAnchor,
  saveExplorerScrollTop
} from '../explorer/explorerState'
import { dirsToReloadForChange } from '../explorer/treeReload'
import { useExplorerKeyboard } from '../explorer/useExplorerKeyboard'
import {
  confirmDirtyEditorDocumentsInPaths,
  editorSupportsOperation,
  editorTreeItemLabel,
  EditorTreeView,
  EDITOR_TREE_DRAG_MIME_TYPE,
  EDITOR_TREE_ROW_HEIGHT,
  editorTreeSelectionRoots,
  flattenEditorTree,
  isEditorProviderError,
  nextEditorItemNameInDirectory,
  projectEditorTreeRows,
  resolveEditorTreeDirectory,
  resolveEditorTreePath,
  useEditorTreeSelection,
  type EditorItemKind,
  type EditorTreeArrowAction,
  type EditorTreeNavigationRow,
  type EditorTreeProjection,
  type EditorTreeViewItem
} from '@workspace/editor'
import { acquireLocalEditorProvider } from '../editor/localEditorProvider'

interface Props {
  tabId: number
  rootPath: string
  explorerStateKey: string
  scrollContainerRef?: RefObject<HTMLElement | null>
  paneHostRef?: RefObject<HTMLElement | null>
  selectedPath?: string | null
  revealRevision?: number
  paneVisible?: boolean
  explorerModeActive?: boolean
  onOpenFile: (path: string, kind: 'code' | 'markdown' | 'viewer', pin?: boolean) => void
  onPathRenamed?: (from: string, to: string) => void
  onPathDeleted?: (path: string) => void
}

interface DirState {
  entries: EditorDirEntry[]
  loaded: boolean
}

interface EditorDirEntry extends DirEntry {
  editorItemId: string
}

interface MenuState {
  x: number
  y: number
  dir: string
  entry: DirEntry | null
}

export function classifyFile(name: string): 'code' | 'markdown' | 'viewer' {
  const type = classifyAssetType(name)
  if (type === 'markdown') return 'markdown'
  if (type === 'unknown') return 'code'
  return 'viewer'
}

/** Obsidian-style tree label: hide the `.md` suffix for markdown files. */
export function treeEntryDisplayName(name: string): string {
  return editorTreeItemLabel(name, classifyFile(name) === 'markdown' ? 'markdown' : 'code')
}

function dirOf(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx === -1 ? '' : path.slice(0, idx)
}

function baseName(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx === -1 ? path : path.slice(idx + 1)
}

function joinPath(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name
}

function rowAnchor(entry: DirEntry, treeEl: HTMLElement | null): AnchorRect {
  const row = treeEl?.querySelector<HTMLElement>(
    `[data-tree-path="${entry.path.replace(/"/g, '\\"')}"]`
  )
  if (row) {
    const r = row.getBoundingClientRect()
    return {
      left: r.left,
      right: r.right,
      top: r.top,
      bottom: r.bottom,
      width: r.width,
      height: r.height
    }
  }
  return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 }
}

const TREE_DRAG_MIME = EDITOR_TREE_DRAG_MIME_TYPE

export function TreeView({
  tabId,
  rootPath,
  explorerStateKey,
  scrollContainerRef,
  paneHostRef,
  selectedPath,
  revealRevision = 0,
  paneVisible = true,
  explorerModeActive = true,
  onOpenFile,
  onPathRenamed,
  onPathDeleted
}: Props) {
  const editorProviderLease = useMemo(() => acquireLocalEditorProvider(tabId), [tabId])
  const editorProvider = editorProviderLease.provider
  const canCreateFile = editorSupportsOperation(editorProvider, 'createFile')
  const canCreateDirectory = editorSupportsOperation(editorProvider, 'createDirectory')
  const canRename = editorSupportsOperation(editorProvider, 'rename')
  const canDelete = editorSupportsOperation(editorProvider, 'delete')
  const canMove =
    editorProvider.capabilities.dragMove && editorSupportsOperation(editorProvider, 'move')
  const canMultiSelect = editorProvider.capabilities.multiSelect
  const treeRef = useRef<HTMLDivElement>(null)
  const [dirs, setDirs] = useState<Map<string, DirState>>(new Map())
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(loadExplorerTreeState(explorerStateKey, rootPath).expanded)
  )
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [prompt, setPrompt] = useState<{
    anchor: AnchorRect
    title: string
    defaultValue: string
    onSubmit: (value: string) => void
  } | null>(null)
  const [dragOverPath, setDragOverPath] = useState<string | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)
  const rootPathRef = useRef(rootPath)
  const editorProviderRef = useRef(editorProvider)
  const loadSequenceRef = useRef(new Map<string, number>())
  const pendingScrollRestoreRef = useRef<{
    scope: string
    scrollTop: number
    anchorPath?: string
    anchorOffset?: number
  } | null>(null)
  const pendingRevealPathRef = useRef<string | null>(null)
  const lastRevealRevisionRef = useRef(revealRevision)
  const scrollAnchorRef = useRef<{ path: string; index: number; offset: number } | null>(null)
  const previousFlatListRef = useRef<Array<{ entry: DirEntry; depth: number }> | null>(null)
  const previousAnchorScopeRef = useRef(`${explorerStateKey}:${tabId}:${rootPath}`)

  useLayoutEffect(() => {
    rootPathRef.current = rootPath
    editorProviderRef.current = editorProvider
  }, [rootPath, editorProvider])

  const loadDir = useCallback(
    (path: string) => {
      const requestRoot = rootPath
      const requestSequence = (loadSequenceRef.current.get(path) ?? 0) + 1
      loadSequenceRef.current.set(path, requestSequence)
      const load = async () => {
        let parent: Awaited<ReturnType<typeof resolveEditorTreeDirectory>>
        try {
          parent = await resolveEditorTreeDirectory(editorProvider, path)
        } catch (error) {
          if (isEditorProviderError(error) && error.code === 'notFound') {
            if (
              rootPathRef.current === requestRoot &&
              editorProviderRef.current === editorProvider &&
              loadSequenceRef.current.get(path) === requestSequence
            ) {
              setDirs((prev) => new Map(prev).set(path, { entries: [], loaded: true }))
            }
            return
          }
          throw error
        }
        const items = await editorProvider.listChildren(parent?.itemId ?? null)
        if (
          rootPathRef.current !== requestRoot ||
          editorProviderRef.current !== editorProvider ||
          loadSequenceRef.current.get(path) !== requestSequence
        )
          return
        const entries: EditorDirEntry[] = items.map((item) => ({
          name: item.name,
          path: item.path,
          is_dir: item.kind === 'directory',
          editorItemId: item.itemId
        }))
        setDirs((prev) => new Map(prev).set(path, { entries, loaded: true }))
      }
      void load().catch(console.error)
    },
    [editorProvider, rootPath]
  )

  useEffect(() => () => editorProviderLease.release(), [editorProviderLease])

  const setExpandedPersisted = useCallback(
    (updater: (prev: Set<string>) => Set<string>) => {
      setExpanded((prev) => {
        const next = updater(prev)
        saveExplorerExpanded(explorerStateKey, rootPath, next)
        return next
      })
    },
    [explorerStateKey, rootPath]
  )

  const prevRootRef = useRef<string | null>(null)

  useEffect(() => {
    if (prevRootRef.current !== null && prevRootRef.current !== rootPath) {
      resetExplorerTreeState(explorerStateKey, rootPath)
    }
    prevRootRef.current = rootPath
    const restored = loadExplorerTreeState(explorerStateKey, rootPath)
    setDirs(new Map())
    setExpanded(new Set(restored.expanded))
    setSelected(new Set())
    setSelectionAnchor(null)
    loadDir('')
    for (const path of restored.expanded) {
      loadDir(path)
    }
  }, [tabId, rootPath, explorerStateKey, loadDir])

  useEffect(() => {
    const el = scrollContainerRef?.current
    if (!el) return
    const restored = loadExplorerTreeState(explorerStateKey, rootPath)
    pendingScrollRestoreRef.current = {
      scope: `${explorerStateKey}:${tabId}:${rootPath}`,
      scrollTop: restored.scrollTop,
      anchorPath: restored.scrollAnchorPath,
      anchorOffset: restored.scrollAnchorOffset
    }
    const onScroll = () => {
      if (pendingScrollRestoreRef.current) return
      setScrollTop(el.scrollTop)
      const rows = previousFlatListRef.current
      const index = Math.min(rows?.length ?? 0, Math.floor(el.scrollTop / EDITOR_TREE_ROW_HEIGHT))
      const row = rows?.[index]
      scrollAnchorRef.current = row
        ? { path: row.entry.path, index, offset: el.scrollTop - index * EDITOR_TREE_ROW_HEIGHT }
        : null
      saveExplorerScrollTop(explorerStateKey, rootPath, el.scrollTop)
      saveExplorerScrollAnchor(
        explorerStateKey,
        rootPath,
        row?.entry.path,
        el.scrollTop - index * EDITOR_TREE_ROW_HEIGHT
      )
    }
    const onResize = () => setViewportHeight(el.clientHeight)
    onResize()
    el.addEventListener('scroll', onScroll, { passive: true })
    const ro = new ResizeObserver(onResize)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', onScroll)
      ro.disconnect()
    }
  }, [scrollContainerRef, explorerStateKey, rootPath, tabId])

  useEffect(() => {
    return editorProvider.subscribeTree((parentIds) => {
      const parentPaths = parentIds.map((parentId) =>
        parentId === null ? '' : (editorProvider.pathForItemId(parentId) ?? '')
      )
      const fullReload = parentPaths.includes('')
      if (fullReload) {
        loadDir('')
        for (const path of expanded) loadDir(path)
        return
      }
      const toReload = new Set<string>()
      for (const p of parentPaths) {
        for (const d of dirsToReloadForChange(p, expanded)) toReload.add(d)
      }
      for (const d of toReload) loadDir(d)
    })
  }, [editorProvider, loadDir, expanded])

  useEffect(() => {
    const clearDrag = () => setDragOverPath(null)
    window.addEventListener('dragend', clearDrag)
    return () => window.removeEventListener('dragend', clearDrag)
  }, [])

  const revealAncestors = useCallback(
    (path: string) => {
      const ancestors = ancestorDirPaths(path)
      if (ancestors.length === 0) return
      setExpandedPersisted((prev) => {
        const next = new Set(prev)
        for (const a of ancestors) next.add(a)
        return next
      })
      for (const a of ancestors) {
        if (!dirs.get(a)?.loaded) loadDir(a)
      }
    },
    [dirs, loadDir, setExpandedPersisted]
  )

  const openFileFromTree = useCallback(
    (path: string, kind: 'code' | 'markdown' | 'viewer', pin?: boolean) => {
      revealAncestors(path)
      onOpenFile(path, kind, pin)
    },
    [onOpenFile, revealAncestors]
  )

  useEffect(() => {
    const dismissOverlayUi = () => {
      setMenu(null)
      setPrompt(null)
    }
    return onWorkspaceDismissPortals(dismissOverlayUi)
  }, [])

  useEffect(() => {
    if (paneVisible) return
    setMenu(null)
    setPrompt(null)
  }, [paneVisible])

  const flatList = useMemo(() => {
    return flattenEditorTree(
      new Map(
        [...dirs].map(([path, state]) => [
          path,
          state.entries.map((entry) => ({
            ...entry,
            name: entry.name,
            directory: entry.is_dir
          }))
        ])
      ),
      expanded
    ).map(({ item, depth }) => ({ entry: item, depth }))
  }, [dirs, expanded])

  useEffect(() => {
    const pending = pendingScrollRestoreRef.current
    if (
      !pending ||
      pending.scope !== `${explorerStateKey}:${tabId}:${rootPath}` ||
      !explorerModeActive ||
      !dirs.get('')?.loaded
    )
      return
    if ([...expanded].some((path) => !dirs.get(path)?.loaded)) return
    const el = scrollContainerRef?.current
    if (!el || el.clientHeight <= 0) return
    const restoredTop = resolveExplorerScrollTop(
      pending,
      flatList.map(({ entry }) => entry.path),
      el.scrollHeight - el.clientHeight,
      EDITOR_TREE_ROW_HEIGHT
    )
    el.scrollTop = restoredTop
    setScrollTop(restoredTop)
    pendingScrollRestoreRef.current = null
    const index = Math.floor(restoredTop / EDITOR_TREE_ROW_HEIGHT)
    const row = flatList[index]
    scrollAnchorRef.current = row
      ? { path: row.entry.path, index, offset: restoredTop - index * EDITOR_TREE_ROW_HEIGHT }
      : null
  }, [
    dirs,
    expanded,
    explorerModeActive,
    explorerStateKey,
    flatList,
    rootPath,
    scrollContainerRef,
    tabId
  ])

  useLayoutEffect(() => {
    const previous = previousFlatListRef.current
    const anchorScope = `${explorerStateKey}:${tabId}:${rootPath}`
    if (previousAnchorScopeRef.current !== anchorScope) {
      previousAnchorScopeRef.current = anchorScope
      scrollAnchorRef.current = null
      previousFlatListRef.current = flatList
      return
    }
    const anchor = scrollAnchorRef.current
    const el = scrollContainerRef?.current
    if (pendingScrollRestoreRef.current?.scope === anchorScope) {
      previousFlatListRef.current = flatList
      return
    }
    if (previous && el && previous !== flatList && previous.length > 0) {
      const oldIndex = anchor?.index ?? Math.floor(el.scrollTop / EDITOR_TREE_ROW_HEIGHT)
      const offset = anchor?.offset ?? el.scrollTop - oldIndex * EDITOR_TREE_ROW_HEIGHT
      const matchingIndex = anchor
        ? flatList.findIndex((row) => row.entry.path === anchor.path)
        : -1
      const index =
        matchingIndex >= 0 ? matchingIndex : Math.min(oldIndex, Math.max(0, flatList.length - 1))
      const nextTop = Math.max(
        0,
        Math.min(index * EDITOR_TREE_ROW_HEIGHT + offset, el.scrollHeight - el.clientHeight)
      )
      if (Math.abs(el.scrollTop - nextTop) > 1) el.scrollTop = nextTop
      const row = flatList[index]
      scrollAnchorRef.current = row ? { path: row.entry.path, index, offset } : null
      saveExplorerScrollTop(explorerStateKey, rootPath, nextTop)
      saveExplorerScrollAnchor(explorerStateKey, rootPath, row?.entry.path, offset)
      setScrollTop(nextTop)
    }
    previousFlatListRef.current = flatList
  }, [flatList, rootPath, tabId, scrollContainerRef, explorerStateKey])

  const treePaths = useMemo(() => flatList.map(({ entry }) => entry.path), [flatList])
  const treeSelection = useEditorTreeSelection(treePaths)
  const selected = treeSelection.selectedPaths
  const setSelected = treeSelection.setSelectedPaths
  const selectionAnchor = treeSelection.anchorPath
  const setSelectionAnchor = treeSelection.setAnchorPath
  const keyboardFocusPath =
    treeSelection.focusedPath && treePaths.includes(treeSelection.focusedPath)
      ? treeSelection.focusedPath
      : null

  useEffect(() => {
    if (!selectedPath || !explorerModeActive) return
    setSelected(new Set([selectedPath]))
    setSelectionAnchor(selectedPath)
    treeSelection.setFocusedPath(selectedPath)
  }, [selectedPath, explorerModeActive, treeSelection.setFocusedPath])

  useEffect(() => {
    if (revealRevision === lastRevealRevisionRef.current) return
    if (!selectedPath || !explorerModeActive) return
    lastRevealRevisionRef.current = revealRevision
    pendingRevealPathRef.current = selectedPath
    revealAncestors(selectedPath)
  }, [explorerModeActive, revealAncestors, revealRevision, selectedPath])

  const projection = useMemo(
    () => projectEditorTreeRows(flatList, scrollTop, viewportHeight),
    [flatList, scrollTop, viewportHeight]
  )
  const treeViewProjection: EditorTreeProjection<EditorTreeViewItem> = {
    ...projection,
    rows: projection.rows.map(({ entry, depth }) => {
      const detected: EditorItemKind = entry.is_dir
        ? 'directory'
        : classifyFile(entry.name) === 'markdown'
          ? 'markdown'
          : classifyFile(entry.name) === 'code'
            ? 'code'
            : 'asset'
      return {
        id: entry.editorItemId,
        path: entry.path,
        name: editorTreeItemLabel(entry.name, detected),
        kind: detected,
        depth,
        expandable: entry.is_dir,
        expanded: expanded.has(entry.path),
        active: entry.path === selectedPath,
        selected: selected.has(entry.path),
        multiSelected: selected.size > 1 && selected.has(entry.path),
        isIgnored: entry.is_ignored ?? false,
        dropTarget: dragOverPath === entry.path,
        showGuides: true,
        tabIndex:
          (keyboardFocusPath ??
            selectionAnchor ??
            selectedPath ??
            [...selected][0] ??
            flatList[0]?.entry.path) === entry.path
            ? 0
            : -1,
        source: entry
      }
    })
  }

  const toggle = (path: string) => {
    setExpandedPersisted((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
        if (!dirs.get(path)?.loaded) loadDir(path)
      }
      return next
    })
  }

  const refresh = (dir: string) => loadDir(dir)

  const focusedEntry = useCallback((): DirEntry | null => {
    const path = keyboardFocusPath ?? selectionAnchor ?? selectedPath ?? [...selected][0] ?? null
    if (!path) return flatList[0]?.entry ?? null
    return flatList.find((r) => r.entry.path === path)?.entry ?? flatList[0]?.entry ?? null
  }, [keyboardFocusPath, selectionAnchor, selectedPath, selected, flatList])

  const scrollRowIntoView = (path: string) => {
    treeRef.current
      ?.querySelector<HTMLElement>(`[data-tree-path="${path.replace(/"/g, '\\"')}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }

  useEffect(() => {
    const path = pendingRevealPathRef.current
    if (!path || !explorerModeActive) return
    const index = treePaths.indexOf(path)
    const el = scrollContainerRef?.current
    if (index < 0 || !el || el.clientHeight <= 0) return
    pendingRevealPathRef.current = null
    const nextTop = Math.max(
      0,
      Math.min(index * EDITOR_TREE_ROW_HEIGHT, el.scrollHeight - el.clientHeight)
    )
    el.scrollTop = nextTop
    setScrollTop(nextTop)
  }, [explorerModeActive, scrollContainerRef, treePaths])

  const newFile = async (dir: string) => {
    setMenu(null)
    let name: string
    try {
      const result = await nextEditorItemNameInDirectory(editorProvider, dir, 'untitled', '.md')
      name = result.name
      const parent = result.parent
      if (!editorSupportsOperation(editorProvider, 'createFile'))
        throw new Error('File creation is not supported by this provider')
      await editorProvider.create!(parent?.itemId ?? null, 'file', name)
    } catch (err) {
      window.alert(String(err))
      return
    }
    const path = joinPath(dir, name)
    openFileFromTree(path, 'markdown')
    refresh(dir)
  }

  const newFolder = (dir: string, anchor: AnchorRect) => {
    setMenu(null)
    setPrompt({
      anchor,
      title: 'Folder name',
      defaultValue: '',
      onSubmit: async (name) => {
        try {
          const parent = await resolveEditorTreeDirectory(
            editorProvider,
            dir,
            'Parent directory no longer exists'
          )
          if (!editorSupportsOperation(editorProvider, 'createDirectory'))
            throw new Error('Folder creation is not supported by this provider')
          await editorProvider.create!(parent?.itemId ?? null, 'directory', name)
          setExpandedPersisted((prev) => new Set(prev).add(dir))
          refresh(dir)
        } catch (error) {
          window.alert(String(error))
        }
      }
    })
  }

  const rename = (entry: DirEntry, anchor: AnchorRect) => {
    setMenu(null)
    setPrompt({
      anchor,
      title: 'Rename to',
      defaultValue: entry.name,
      onSubmit: async (name) => {
        if (name === entry.name) return
        const to = joinPath(dirOf(entry.path), name)
        try {
          const ref = await resolveEditorTreePath(editorProvider, entry.path)
          if (!ref) throw new Error('Item no longer exists')
          if (!editorSupportsOperation(editorProvider, 'rename'))
            throw new Error('Renaming is not supported by this provider')
          await editorProvider.rename!(ref, name)
        } catch (err) {
          window.alert(String(err))
          return
        }
        onPathRenamed?.(entry.path, to)
        refresh(dirOf(entry.path))
      }
    })
  }

  const selectionRootPaths = (paths: readonly string[]): string[] => {
    const selectedPaths = new Set(paths)
    const knownEntries = new Map(
      [...dirs.values()].flatMap((state) => state.entries).map((entry) => [entry.path, entry])
    )
    const candidates = paths.map(
      (path) =>
        knownEntries.get(path) ?? { path, is_dir: false, name: path.split('/').at(-1) ?? path }
    )
    return editorTreeSelectionRoots(candidates, selectedPaths, (item) => item.is_dir).map(
      (item) => item.path
    )
  }

  const targetPaths = (entry: DirEntry): string[] => {
    const paths = selected.has(entry.path) && selected.size > 1 ? [...selected] : [entry.path]
    return selectionRootPaths(paths)
  }

  const remove = async (entry: DirEntry) => {
    setMenu(null)
    const paths = targetPaths(entry)
    const label =
      paths.length > 1
        ? `${paths.length} items`
        : `this ${entry.is_dir ? 'folder (and everything in it)' : 'file'}`
    const scrollEl = scrollContainerRef?.current
    const prevScroll = scrollEl?.scrollTop ?? 0

    const confirmed = window.confirm(`Delete ${label}?\n\n${paths.join('\n')}`)
    if (!confirmed) return
    if (!confirmDirtyEditorDocumentsInPaths(paths, (message) => window.confirm(message))) return

    const deleted: string[] = []
    for (const p of paths) {
      try {
        const ref = await resolveEditorTreePath(editorProvider, p)
        if (!ref) throw new Error('Item no longer exists')
        if (!editorSupportsOperation(editorProvider, 'delete'))
          throw new Error('Deletion is not supported by this provider')
        await editorProvider.delete!([ref])
        deleted.push(p)
        onPathDeleted?.(p)
      } catch (err) {
        window.alert(String(err))
        break
      }
    }
    if (deleted.length === 0) return
    for (const d of new Set(deleted.map(dirOf))) refresh(d)
    const remaining = paths.filter((path) => !deleted.includes(path))
    setSelected(new Set(remaining))
    if (selectionAnchor && deleted.includes(selectionAnchor)) {
      setSelectionAnchor(remaining[0] ?? null)
    }
    if (treeSelection.focusedPath && deleted.includes(treeSelection.focusedPath)) {
      treeSelection.setFocusedPath(remaining[0] ?? null)
    }
    moveFocusToRendererBeforeFocusedWebviewHidden()
    interactionCoordinator.reconcile('tree-delete-complete')
    finishPaneDrag()
    requestAnimationFrame(() => {
      if (scrollEl) {
        scrollEl.scrollTop = Math.min(
          prevScroll,
          Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight)
        )
      }
    })
  }

  const copyPath = (entry: DirEntry, relative: boolean) => {
    setMenu(null)
    const paths = targetPaths(entry)
    const text = paths
      .map((p) => (relative ? p : `${rootPath.replace(/\/+$/, '')}/${p}`))
      .join('\n')
    navigator.clipboard.writeText(text).catch(console.error)
  }

  const reveal = (entry: DirEntry) => {
    setMenu(null)
    revealItemInDir(`${rootPath.replace(/\/+$/, '')}/${entry.path}`).catch(console.error)
  }

  const moveEntries = async (paths: string[], targetDir: string) => {
    if (!canMove) return
    paths = selectionRootPaths(paths)
    const moved: string[] = []
    for (const p of paths) {
      if (dirOf(p) === targetDir) continue
      if (targetDir === p || targetDir.startsWith(`${p}/`)) continue
      const to = joinPath(targetDir, baseName(p))
      try {
        const ref = await resolveEditorTreePath(editorProvider, p)
        if (!ref) throw new Error('Item no longer exists')
        const parent = await resolveEditorTreeDirectory(
          editorProvider,
          targetDir,
          'Destination directory no longer exists'
        )
        if (!editorSupportsOperation(editorProvider, 'move'))
          throw new Error('Moving is not supported by this provider')
        await editorProvider.move!([ref], parent?.itemId ?? null)
      } catch (err) {
        window.alert(String(err))
        continue
      }
      moved.push(p)
      onPathRenamed?.(p, to)
    }
    if (moved.length === 0) return
    for (const d of new Set([...moved.map(dirOf), targetDir])) refresh(d)
    setSelected((prev) => new Set([...prev].filter((path) => !moved.includes(path))))
  }

  const onEntryDragStart = (e: DragEvent, entry: DirEntry) => {
    if (!canMove) return
    const paths = selected.has(entry.path) && selected.size > 1 ? [...selected] : [entry.path]
    e.dataTransfer.setData(TREE_DRAG_MIME, JSON.stringify(paths))
    e.dataTransfer.effectAllowed = 'move'
  }

  const keyboardHandlers = useMemo(
    () => ({
      getFocusedEntry: focusedEntry,
      onDelete: () => {
        if (!canDelete) return
        const entry = focusedEntry()
        if (entry) void remove(entry)
      },
      onRename: () => {
        if (!canRename) return
        const entry = focusedEntry()
        if (entry) rename(entry, rowAnchor(entry, treeRef.current))
      },
      onEnter: (entry: DirEntry) => {
        if (entry.is_dir) toggle(entry.path)
        else openFileFromTree(entry.path, classifyFile(entry.name), true)
      },
      getVisibleRows: (): EditorTreeNavigationRow[] =>
        flatList.map(({ entry, depth }) => ({
          path: entry.path,
          kind: entry.is_dir
            ? 'directory'
            : classifyFile(entry.name) === 'markdown'
              ? 'markdown'
              : 'code',
          depth
        })),
      getExpandedPaths: () => expanded,
      onArrowAction: (action: EditorTreeArrowAction, extendSelection: boolean) => {
        if (action.type === 'focus') {
          const next = flatList[action.index]
          if (!next) return
          treeSelection.select(action.path, focusedEntry()?.path ?? null, {
            range: canMultiSelect && extendSelection
          })
          scrollRowIntoView(next.entry.path)
          requestAnimationFrame(() =>
            treeRef.current
              ?.querySelector<HTMLElement>(`[data-tree-path="${CSS.escape(next.entry.path)}"]`)
              ?.focus()
          )
          return
        }
        const path = action.path
        if (action.type === 'collapse') {
          setExpandedPersisted((prev) => {
            const next = new Set(prev)
            next.delete(path)
            return next
          })
          return
        }
        setExpandedPersisted((prev) => new Set(prev).add(path))
        if (!dirs.get(path)?.loaded) loadDir(path)
      }
    }),
    [
      focusedEntry,
      flatList,
      openFileFromTree,
      dirs,
      loadDir,
      setExpandedPersisted,
      expanded,
      selectionAnchor,
      selected,
      canDelete,
      canRename
    ]
  )

  useExplorerKeyboard(
    paneHostRef ?? { current: null },
    treeRef,
    paneVisible && explorerModeActive,
    keyboardHandlers
  )

  const menuItems = useMemo((): ContextMenuItem[] => {
    if (!menu) return []
    const clickAnchor: AnchorRect = {
      left: menu.x,
      right: menu.x,
      top: menu.y,
      bottom: menu.y,
      width: 0,
      height: 0
    }
    const items: ContextMenuItem[] = []
    if (canCreateFile)
      items.push({ type: 'button', label: 'New File', onClick: () => void newFile(menu.dir) })
    if (canCreateDirectory)
      items.push({
        type: 'button',
        label: 'New Folder',
        onClick: () => newFolder(menu.dir, clickAnchor)
      })
    if (!menu.entry) return items

    items.push({ type: 'separator' })
    if (canRename && selected.size <= 1) {
      items.push({
        type: 'button',
        label: 'Rename',
        onClick: () => rename(menu.entry!, clickAnchor)
      })
    }
    if (canDelete)
      items.push({
        type: 'button',
        label: selected.size > 1 ? `Delete ${selected.size} items` : 'Delete',
        onClick: () => void remove(menu.entry!)
      })
    items.push({ type: 'separator' })
    items.push({
      type: 'button',
      label: 'Copy Path',
      onClick: () => copyPath(menu.entry!, false)
    })
    items.push({
      type: 'button',
      label: 'Copy Relative Path',
      onClick: () => copyPath(menu.entry!, true)
    })
    if (selected.size <= 1) {
      items.push({
        type: 'button',
        label: 'Reveal in Finder',
        onClick: () => void reveal(menu.entry!)
      })
    }
    return items
  }, [
    menu,
    selected,
    tabId,
    rootPath,
    dirs,
    canCreateFile,
    canCreateDirectory,
    canRename,
    canDelete
  ])

  return (
    <>
      <EditorTreeView
        rootRef={treeRef}
        scrollRef={scrollContainerRef}
        projection={treeViewProjection}
        className={`tree-view${dragOverPath === '' ? ' drag-over-root' : ''}`}
        listClassName="tree-view-rows"
        ariaLabel="Files"
        canMove={canMove}
        canMultiSelect={canMultiSelect}
        dragMimeType={TREE_DRAG_MIME}
        onClearSelection={treeSelection.clear}
        onSetDropTarget={setDragOverPath}
        onDropItems={(paths, destination) => void moveEntries(paths, destination)}
        onFocusPath={treeSelection.setFocusedPath}
        onKeyDown={(event) => {
          if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return
          event.preventDefault()
          const entry = focusedEntry()
          const rect = entry ? rowAnchor(entry, treeRef.current) : null
          setMenu({
            x: rect?.left ?? 0,
            y: rect?.bottom ?? 0,
            dir: entry ? (entry.is_dir ? entry.path : dirOf(entry.path)) : '',
            entry
          })
        }}
        onRootContextMenu={(event) =>
          setMenu({ x: event.clientX, y: event.clientY, dir: '', entry: null })
        }
        onSelectRow={(path, _index, additive, range) => {
          treeRef.current?.focus()
          treeSelection.select(path, focusedEntry()?.path ?? null, { additive, range })
        }}
        onActivate={(item) => {
          const entry = item.source as DirEntry
          if (entry.is_dir) toggle(entry.path)
          else openFileFromTree(entry.path, classifyFile(entry.name), false)
        }}
        onDoubleActivate={(item) => {
          const entry = item.source as DirEntry
          if (!entry.is_dir) openFileFromTree(entry.path, classifyFile(entry.name), true)
        }}
        onDragStart={(item, _index, event) => onEntryDragStart(event, item.source as DirEntry)}
        onContextMenu={(item, event) => {
          const entry = item.source as DirEntry
          if (!selected.has(entry.path))
            treeSelection.select(entry.path, focusedEntry()?.path ?? null)
          setMenu({
            x: event.clientX,
            y: event.clientY,
            dir: entry.is_dir ? entry.path : dirOf(entry.path),
            entry
          })
          if (entry.is_dir && !dirs.get(entry.path)?.loaded) loadDir(entry.path)
        }}
      />
      {menu ? (
        <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />
      ) : null}
      {prompt && (
        <TextPrompt
          anchorRect={prompt.anchor}
          title={prompt.title}
          defaultValue={prompt.defaultValue}
          onSubmit={prompt.onSubmit}
          onClose={() => setPrompt(null)}
        />
      )}
    </>
  )
}
