import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from 'react'
import {
  EditorMarkdownEditor,
  EditorAssetPreview,
  EditorMarkdownTitle,
  EditorBreadcrumbs,
  editorCodeMirrorHostExtensions,
  EditorTreeFrame,
  EditorTreePane,
  EditorTreeToolbar,
  EditorTreeCreateActions,
  EditorTreeResizeHandle,
  editorAssetContentType,
  EDITOR_TREE_DRAG_MIME_TYPE,
  EditorQuickOpenDialog,
  EDITOR_TREE_ROW_HEIGHT,
  EDITOR_TREE_DEFAULT_WIDTH,
  buildRenamedPath,
  fuzzyEditorSearch,
  editorMarkdownParserExtensions,
  flattenEditorTree,
  markdownTitleFor,
  validateTitleInput,
  projectEditorTreeRows,
  resolveEditorRelativeLink,
  resolveEditorWikiLink,
  useEditorQuickOpenSearch,
  useEditorDocumentSnapshot,
  type EditorProvider,
  type EditorSearchResult,
  type EditorDocumentSession,
  type EditorBreadcrumbEntry,
  type EditorSyncPhase,
  type EditorTreeItem,
  type EditorTreeViewItem
} from '@workspace/editor'
import { PKMS_QUICK_OPEN_EVENT } from '@pkms/client/hostEvents'
import { ContextMenu, type ContextMenuItem } from '../../components/ContextMenu'
import type { GoogleDriveWorkspaceEntry } from '@pkms/google-drive'
import driveStyles from '@pkms/google-drive/workspace.module.css'

interface RootOption {
  id: string
  name: string
}

type GoogleDriveDialogRequest = {
  kind: 'confirm'
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
}

function driveEntryToEditorItem(rootId: string, entry: GoogleDriveWorkspaceEntry): EditorTreeItem {
  return {
    providerId: `pkms-google-drive:${rootId}`,
    itemId: entry.id,
    parentId: entry.parents?.[0] ?? null,
    name: entry.name,
    path: entry.path,
    kind: entry.kind === 'folder' ? 'directory' : entry.kind === 'markdown' ? 'markdown' : 'asset',
    readOnly: entry.kind === 'asset'
  }
}

function createSession(
  rootId: string,
  file: GoogleDriveWorkspaceEntry,
  initialText: string,
  initialRevision: string
): EditorDocumentSession {
  const providerId = `pkms-google-drive:${rootId}`
  let item: EditorTreeItem = {
    providerId,
    itemId: file.id,
    parentId: file.parents?.[0] ?? null,
    name: file.name,
    path: file.path,
    kind: 'markdown',
    readOnly: false
  }
  const listeners = new Set<(snapshot: ReturnType<EditorDocumentSession['snapshot']>) => void>()
  let content = initialText
  let revision = initialRevision
  let phase: 'clean' | 'dirty' | 'saving' | 'conflict' | 'error' = 'clean'
  let syncPhase: EditorSyncPhase = 'synced'
  let localRevision = 0
  let closed = false
  let message: string | undefined
  let deferredSyncTimer: number | undefined
  let autoSaveTimer: number | undefined
  let saveTail: Promise<void> = Promise.resolve()
  const snapshot = () => ({
    content: { type: 'text' as const, text: content },
    revision,
    savePhase: phase,
    syncPhase,
    ...(message ? { message } : {})
  })
  const emit = () => {
    const current = snapshot()
    listeners.forEach((listener) => listener(current))
  }

  const save = (options: { flushSync?: boolean } = {}) => {
    if (autoSaveTimer !== undefined) {
      window.clearTimeout(autoSaveTimer)
      autoSaveTimer = undefined
    }
    const operation = saveTail.then(async () => {
      if (closed) throw new Error('Document session is closed')
      const requestedRevision = localRevision
      phase = 'saving'
      syncPhase = 'pending'
      message = undefined
      emit()
      try {
        const flushSync = options.flushSync !== false
        if (flushSync && deferredSyncTimer) {
          window.clearTimeout(deferredSyncTimer)
          deferredSyncTimer = undefined
        }
        const result = await window.pkmsDesktop.saveGoogleDriveMarkdown(
          rootId,
          file.id,
          content,
          flushSync
        )
        revision = result.revision
        phase = localRevision === requestedRevision ? 'clean' : 'dirty'
        syncPhase = result.sync.pendingOperations ? 'pending' : 'synced'
        if (!flushSync) {
          if (deferredSyncTimer) window.clearTimeout(deferredSyncTimer)
          deferredSyncTimer = window.setTimeout(() => {
            deferredSyncTimer = undefined
            void window.pkmsDesktop
              .syncGoogleDriveWorkspace(rootId)
              .then((sync) => {
                syncPhase = sync.pendingOperations ? 'pending' : 'synced'
                if (syncPhase === 'synced' && localRevision === requestedRevision) phase = 'clean'
                message = undefined
              })
              .catch((cause) => {
                syncPhase = 'blocked'
                message = cause instanceof Error ? cause.message : 'Google Drive sync failed.'
              })
              .finally(emit)
          }, 1_250)
        }
      } catch (cause) {
        phase = 'error'
        syncPhase = 'blocked'
        message = cause instanceof Error ? cause.message : 'Google Drive sync failed.'
      }
      emit()
      return snapshot()
    })
    saveTail = operation.then(
      () => undefined,
      () => undefined
    )
    return operation
  }

  return {
    get item() {
      return item
    },
    readOnly: false,
    updateItem(next) {
      if (next.providerId === item.providerId && next.itemId === item.itemId) item = next
    },
    snapshot,
    subscribe(listener) {
      listeners.add(listener)
      listener(snapshot())
      return () => listeners.delete(listener)
    },
    async replaceText(nextText, baseRevision) {
      if (closed) throw new Error('Document session is closed')
      if (baseRevision !== revision) {
        phase = 'conflict'
        syncPhase = 'blocked'
        message = 'The document changed while this edit was being applied.'
        emit()
        throw new Error(message)
      }
      if (nextText === content) return
      content = nextText
      localRevision += 1
      revision = `${revision}:${localRevision}`
      phase = 'dirty'
      syncPhase = 'pending'
      message = undefined
      emit()
      // Persist edits automatically while batching Drive sync away from each keystroke.
      if (autoSaveTimer !== undefined) window.clearTimeout(autoSaveTimer)
      autoSaveTimer = window.setTimeout(() => {
        autoSaveTimer = undefined
        void save({ flushSync: false })
      }, 500)
    },
    save,
    async close() {
      if (autoSaveTimer !== undefined) {
        window.clearTimeout(autoSaveTimer)
        autoSaveTimer = undefined
      }
      if (phase === 'conflict')
        throw new Error(
          message ?? 'The document changed elsewhere. Resolve the conflict before closing it.'
        )
      if (
        phase === 'dirty' ||
        phase === 'saving' ||
        phase === 'error' ||
        deferredSyncTimer !== undefined
      ) {
        // The native outbox is durable before this resolves; Drive upload can continue after close.
        const saved = await save({ flushSync: false })
        if (saved.savePhase !== 'clean')
          throw new Error(saved.message ?? 'Could not save the document before closing it.')
      }
      closed = true
      listeners.clear()
    }
  }
}

export function PkmsGoogleDrivePane({
  treeOpen = true,
  searchRequest = 0
}: {
  treeOpen?: boolean
  searchRequest?: number
}): React.JSX.Element {
  const [connection, setConnection] = useState({ credentialStored: false, clientConfigured: false })
  const [roots, setRoots] = useState<RootOption[]>([])
  const [root, setRoot] = useState<RootOption | null>(null)
  const [treeBranches, setTreeBranches] = useState<Map<string, GoogleDriveWorkspaceEntry[]>>(
    () => new Map()
  )
  const treeBranchesRef = useRef(treeBranches)
  treeBranchesRef.current = treeBranches
  const deferredFolderBranches = useRef(new Set<string>())
  const treeBranchGeneration = useRef(new Map<string, number>())
  const workspaceGeneration = useRef(0)
  const invalidateTreeBranch = (path: string) => {
    treeBranchGeneration.current.set(path, (treeBranchGeneration.current.get(path) ?? 0) + 1)
  }
  const [treeSyncStates, setTreeSyncStates] = useState<
    Map<string, 'pending' | 'syncing' | 'synced' | 'attention'>
  >(() => new Map())
  const treeSyncStatesRef = useRef(treeSyncStates)
  const updateTreeSyncStates = (
    update: (
      current: Map<string, 'pending' | 'syncing' | 'synced' | 'attention'>
    ) => Map<string, 'pending' | 'syncing' | 'synced' | 'attention'>
  ) => {
    const next = update(treeSyncStatesRef.current)
    treeSyncStatesRef.current = next
    setTreeSyncStates(next)
  }
  const [treeEdit, setTreeEdit] = useState<
    | {
        mode: 'create'
        kind: 'markdown' | 'folder'
        parentPath: string
        name: string
        path: string
      }
    | { mode: 'rename'; entry: GoogleDriveWorkspaceEntry; name: string; path: string }
    | null
  >(null)
  const treeEditCommitRef = useRef<(() => boolean) | null>(null)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set())
  const [loadingFolders, setLoadingFolders] = useState<Set<string>>(() => new Set())
  const [treeScrollTop, setTreeScrollTop] = useState(0)
  const [treeViewportHeight, setTreeViewportHeight] = useState(600)
  const [focusedTreePath, setFocusedTreePath] = useState<string | null>(null)
  const [treeWidth, setTreeWidth] = useState(() => {
    try {
      const stored = Number(window.localStorage.getItem('pkms-google-drive-tree-width'))
      return Number.isFinite(stored) && stored >= 180 && stored <= 480
        ? stored
        : EDITOR_TREE_DEFAULT_WIDTH
    } catch {
      return EDITOR_TREE_DEFAULT_WIDTH
    }
  })
  const [treeDropTarget, setTreeDropTarget] = useState<string | null>(null)
  const treeRootRef = useRef<HTMLDivElement>(null)
  const treeScrollContainerRef = useRef<HTMLDivElement>(null)
  const driveSearchInputRef = useRef<HTMLInputElement>(null)
  const openGeneration = useRef(0)
  const [directory, setDirectory] = useState({
    id: null as string | null,
    path: '',
    ancestors: [] as Array<{ id: string | null; path: string; name: string }>
  })
  const [activeFile, setActiveFile] = useState<GoogleDriveWorkspaceEntry | null>(null)
  const [assetPreviewUrl, setAssetPreviewUrl] = useState<string | null>(null)
  const [assetPreviewType, setAssetPreviewType] = useState('')
  const [assetPreviewError, setAssetPreviewError] = useState<string | null>(null)
  const [openingFileId, setOpeningFileId] = useState<string | null>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const titleCaretPositionRef = useRef<number | null>(null)
  const [titleEditing, setTitleEditing] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [titleError, setTitleError] = useState<string | null>(null)
  const [treeContextMenu, setTreeContextMenu] = useState<{
    entry: GoogleDriveWorkspaceEntry | null
    x: number
    y: number
  } | null>(null)
  const [dialogRequest, setDialogRequest] = useState<GoogleDriveDialogRequest | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<GoogleDriveWorkspaceEntry[]>([])
  const [searchPageToken, setSearchPageToken] = useState<string | undefined>()
  const [searching, setSearching] = useState(false)
  const searchGeneration = useRef(0)

  useEffect(() => {
    try {
      window.localStorage.setItem('pkms-google-drive-tree-width', String(treeWidth))
    } catch {
      // The tree remains resizable when storage is unavailable.
    }
  }, [treeWidth])
  const [session, setSession] = useState<EditorDocumentSession | null>(null)
  const sessionRef = useRef(session)
  sessionRef.current = session
  const sessionSnapshot = useEditorDocumentSnapshot(session)

  useEffect(() => {
    if (!assetPreviewUrl) return
    return () => URL.revokeObjectURL(assetPreviewUrl)
  }, [assetPreviewUrl])
  const [busy, setBusy] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [status, setStatus] = useState('Connecting to Google Drive…')
  const [error, setError] = useState('')
  const [quickOpen, setQuickOpen] = useState(false)
  const [quickQuery, setQuickQuery] = useState('')

  useEffect(() => {
    if (!titleEditing) return
    const input = titleInputRef.current
    if (!input) return
    input.focus()
    const caretPosition = titleCaretPositionRef.current
    if (caretPosition !== null) {
      const position = Math.max(0, Math.min(caretPosition, input.value.length))
      input.setSelectionRange(position, position)
      titleCaretPositionRef.current = null
    }
  }, [titleEditing])

  useEffect(() => {
    setTitleEditing(false)
    setTitleError(null)
  }, [activeFile?.id])

  const quickOpenProvider = useMemo<EditorProvider | null>(() => {
    if (!root) return null
    return {
      id: `pkms-google-drive:${root.id}:quick-open`,
      capabilities: {
        operations: new Set(),
        searchNames: true,
        searchContents: false,
        replaceContents: false,
        multiSelect: false,
        dragMove: false,
        codeLanguages: new Set(),
        collaborativeDocuments: false
      },
      async listChildren(parentId) {
        return (await window.pkmsDesktop.listGoogleDriveDirectory(root.id, parentId)).map((entry) =>
          driveEntryToEditorItem(root.id, entry)
        )
      },
      subscribeTree: () => () => undefined,
      async openDocument() {
        throw new Error('Quick Open does not open documents directly.')
      },
      async search(query, options, signal) {
        if (options.target !== 'names' || query.trim().length < 2) return []
        const page = await window.pkmsDesktop.searchGoogleDriveWorkspace(root.id, query.trim())
        if (signal?.aborted) throw new DOMException('The operation was aborted', 'AbortError')
        const candidates = page.entries.map((entry) => driveEntryToEditorItem(root.id, entry))
        const matches = options.fuzzy
          ? fuzzyEditorSearch(candidates, query, (item) => item.name, options.limit)
          : candidates.filter((item) =>
              item.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())
            )
        return matches.map((item): EditorSearchResult => ({ item, matches: [] }))
      }
    }
  }, [root])
  const {
    items: quickOpenMatches,
    loading: quickOpenLoading,
    error: quickOpenError
  } = useEditorQuickOpenSearch({
    provider: quickOpenProvider,
    query: quickQuery,
    enabled: quickOpen,
    errorMessage: 'Could not search Google Drive files.'
  })

  useEffect(() => {
    const openQuickOpen = () => {
      setQuickQuery('')
      setQuickOpen(true)
    }
    window.addEventListener(PKMS_QUICK_OPEN_EVENT, openQuickOpen)
    return () => window.removeEventListener(PKMS_QUICK_OPEN_EVENT, openQuickOpen)
  }, [])

  const setConnected = useCallback(
    async (nextRoot: RootOption, initialEntries?: GoogleDriveWorkspaceEntry[]) => {
      const generation = ++workspaceGeneration.current
      setBusy(true)
      setError('')
      try {
        const result = initialEntries
          ? { entries: initialEntries }
          : await window.pkmsDesktop.connectGoogleDriveWorkspace(nextRoot.id)
        if (generation !== workspaceGeneration.current) return
        await sessionRef.current?.close()
        if (generation !== workspaceGeneration.current) return
        setSession(null)
        sessionRef.current = null
        setActiveFile(null)
        setDirectory({ id: null, path: '', ancestors: [] })
        setRoot(nextRoot)
        setTreeBranches(new Map([['', result.entries]]))
        updateTreeSyncStates(() => new Map(result.entries.map((entry) => [entry.path, 'synced'])))
        setExpandedFolders(new Set())
        setLoadingFolders(new Set())
        setFocusedTreePath(null)
        setStatus(`Connected to ${nextRoot.name}`)
      } catch (cause) {
        if (generation === workspaceGeneration.current) {
          setError(cause instanceof Error ? cause.message : 'Could not connect to Google Drive.')
          setStatus('Google Drive needs attention')
        }
      } finally {
        if (generation === workspaceGeneration.current) setBusy(false)
      }
    },
    []
  )

  const discoverWorkspaces = useCallback(async () => {
    const found = await window.pkmsDesktop.listGoogleDriveWorkspaces()
    setRoots(found.map(({ id, name }) => ({ id, name })))
    setStatus(found.length ? 'Select a PKMS Google Drive workspace' : 'Create a PKMS workspace')
    if (found.length === 1) await setConnected({ id: found[0].id, name: found[0].name })
  }, [setConnected])

  useEffect(() => {
    let active = true
    void window.pkmsDesktop
      .googleDriveOAuthStatus()
      .then(async (next) => {
        if (!active) return
        setConnection(next)
        if (!next.clientConfigured) {
          setStatus('Desktop Google OAuth client is not configured')
          return
        }
        if (next.credentialStored) await discoverWorkspaces()
        else setStatus('Connect Google Drive to continue')
      })
      .catch((cause) => {
        if (active)
          setError(cause instanceof Error ? cause.message : 'Could not load Drive status.')
      })
    return () => {
      active = false
    }
  }, [discoverWorkspaces])

  const connect = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      const next = await window.pkmsDesktop.connectGoogleDrive()
      setConnection(next)
      await discoverWorkspaces()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Google Drive authorization failed.')
    } finally {
      setBusy(false)
    }
  }, [discoverWorkspaces])

  const refreshDirectory = useCallback(async () => {
    if (!root) return
    const generation = (treeBranchGeneration.current.get(directory.path) ?? 0) + 1
    treeBranchGeneration.current.set(directory.path, generation)
    const rootId = root.id
    const workspaceVersion = workspaceGeneration.current
    const nextEntries = await window.pkmsDesktop.listGoogleDriveDirectory(root.id, directory.id)
    if (
      rootId !== root.id ||
      workspaceVersion !== workspaceGeneration.current ||
      treeBranchGeneration.current.get(directory.path) !== generation
    )
      return
    setTreeBranches((current) => {
      const refreshed = new Map(current)
      const optimisticIds = new Set(
        [...current.values()]
          .flat()
          .filter((entry) => treeSyncStatesRef.current.has(entry.path))
          .map((entry) => entry.id)
      )
      const optimistic = (current.get(directory.path) ?? []).filter((entry) =>
        treeSyncStatesRef.current.has(entry.path)
      )
      refreshed.set(directory.path, [
        ...nextEntries.filter((entry) => !optimisticIds.has(entry.id)),
        ...optimistic
      ])
      return refreshed
    })
    updateTreeSyncStates((current) => {
      const next = new Map(current)
      nextEntries.forEach((entry) => {
        if (!next.has(entry.path)) next.set(entry.path, 'synced')
      })
      return next
    })
  }, [directory.id, directory.path, root])

  const refreshEntryParent = useCallback(
    async (entry: GoogleDriveWorkspaceEntry) => {
      if (!root) return
      const parentPath = entry.path.split('/').slice(0, -1).join('/')
      const parentId = entry.parents?.[0] ?? null
      const nextEntries = await window.pkmsDesktop.listGoogleDriveDirectory(root.id, parentId)
      setTreeBranches((current) => new Map(current).set(parentPath, nextEntries))
    },
    [root]
  )

  useEffect(() => {
    const element = treeScrollContainerRef.current
    if (!element) return
    const updateSize = () => setTreeViewportHeight(element.clientHeight)
    const updateScroll = () => setTreeScrollTop(element.scrollTop)
    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(element)
    element.addEventListener('scroll', updateScroll, { passive: true })
    return () => {
      observer.disconnect()
      element.removeEventListener('scroll', updateScroll)
    }
  }, [root, treeOpen, searchOpen])

  useEffect(() => {
    if (!searchRequest) return
    setSearchOpen(true)
  }, [searchRequest])

  useEffect(() => {
    if (!searchOpen) return
    const frame = window.requestAnimationFrame(() => {
      driveSearchInputRef.current?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [searchOpen])

  useEffect(() => {
    if (treeOpen && treeScrollContainerRef.current)
      treeScrollContainerRef.current.scrollTop = treeScrollTop
  }, [treeOpen, treeScrollTop])

  const toggleFolder = useCallback(
    async (entry: GoogleDriveWorkspaceEntry) => {
      if (!root || entry.kind !== 'folder') return
      setDirectory({ id: entry.id, path: entry.path, ancestors: [] })
      setExpandedFolders((current) => {
        const next = new Set(current)
        if (next.has(entry.path)) next.delete(entry.path)
        else next.add(entry.path)
        return next
      })
      const branchIsPending = ['pending', 'syncing'].includes(
        treeSyncStatesRef.current.get(entry.path) ?? ''
      )
      if (branchIsPending) {
        deferredFolderBranches.current.add(entry.path)
        setTreeBranches((current) =>
          current.has(entry.path) ? current : new Map(current).set(entry.path, [])
        )
        return
      }
      if (treeBranches.has(entry.path) && !deferredFolderBranches.current.has(entry.path)) return
      const generation = (treeBranchGeneration.current.get(entry.path) ?? 0) + 1
      treeBranchGeneration.current.set(entry.path, generation)
      const rootId = root.id
      const workspaceVersion = workspaceGeneration.current
      setLoadingFolders((current) => new Set(current).add(entry.path))
      try {
        const children = await window.pkmsDesktop.listGoogleDriveDirectory(root.id, entry.id)
        if (
          rootId !== root.id ||
          workspaceVersion !== workspaceGeneration.current ||
          treeBranchGeneration.current.get(entry.path) !== generation
        )
          return
        setTreeBranches((current) => new Map(current).set(entry.path, children))
        deferredFolderBranches.current.delete(entry.path)
        updateTreeSyncStates((current) => {
          const next = new Map(current)
          children.forEach((child) => {
            if (!next.has(child.path)) next.set(child.path, 'synced')
          })
          return next
        })
        // Warm one level beneath the opened folder so the next expansion is immediate.
        const childFolders = children.filter((child) => child.kind === 'folder')
        const warmed = await Promise.all(
          childFolders.map(async (child) => ({
            path: child.path,
            entries: await window.pkmsDesktop.listGoogleDriveDirectory(root.id, child.id)
          }))
        )
        setTreeBranches((current) => {
          const next = new Map(current)
          warmed.forEach(({ path, entries: childEntries }) => next.set(path, childEntries))
          return next
        })
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not load this folder.')
      } finally {
        setLoadingFolders((current) => {
          const next = new Set(current)
          next.delete(entry.path)
          return next
        })
      }
    },
    [root, treeBranches]
  )

  const treeRows = useMemo(() => {
    const branches = new Map(
      [...treeBranches].map(([path, children]) => [
        path,
        children.map((entry) => ({ ...entry, directory: entry.kind === 'folder' }))
      ])
    )
    const stateForEntry = (entry: GoogleDriveWorkspaceEntry) => {
      const own = treeSyncStates.get(entry.path)
      if (own) return own
      if (entry.kind === 'folder') {
        const descendants = [...treeSyncStates]
          .filter(([path]) => path.startsWith(`${entry.path}/`))
          .map(([, state]) => state)
        if (descendants.includes('attention')) return 'attention'
        if (descendants.includes('syncing')) return 'syncing'
        if (descendants.includes('pending')) return 'pending'
        if (descendants.includes('synced')) return 'synced'
      }
      return activeFile?.id === entry.id
        ? sessionSnapshot?.syncPhase === 'blocked'
          ? 'attention'
          : sessionSnapshot?.syncPhase === 'pending'
            ? 'pending'
            : sessionSnapshot?.syncPhase === 'synced'
              ? 'synced'
              : undefined
        : undefined
    }
    const visible = flattenEditorTree(branches, expandedFolders, '').map(
      ({ item, depth }, rowIndex) => ({
        id: item.id,
        path: item.path,
        name: item.name.replace(/\.(?:md|markdown)$/i, ''),
        kind: item.kind === 'folder' ? 'directory' : item.kind,
        depth,
        expandable: item.kind === 'folder',
        expanded: expandedFolders.has(item.path),
        loading: loadingFolders.has(item.path),
        active: activeFile?.id === item.id || openingFileId === item.id || directory.id === item.id,
        selected: activeFile?.id === item.id || openingFileId === item.id,
        dropTarget: treeDropTarget === item.path,
        trailingStatus: (() => {
          const state = stateForEntry(item)
          if (!state) return undefined
          const attention = state === 'attention'
          const glyph = state === 'synced' ? '✓' : state === 'syncing' ? '↻' : attention ? '!' : '•'
          const label =
            state === 'synced'
              ? 'Synced'
              : state === 'syncing'
                ? 'Uploading'
                : attention
                  ? 'Sync needs attention'
                  : 'Waiting to upload'
          return (
            <span
              title={label}
              className={`editor-tree-trailing-status--${attention ? 'attention' : state}`}
              aria-hidden="true"
            >
              {glyph}
            </span>
          )
        })(),
        trailingStatusLabel: (() => {
          const state = stateForEntry(item)
          return state === 'synced'
            ? 'Synced'
            : state === 'syncing'
              ? 'Uploading'
              : state === 'attention'
                ? 'Sync needs attention'
                : state
                  ? 'Waiting to upload'
                  : undefined
        })(),
        tabIndex: focusedTreePath === item.path || (!focusedTreePath && rowIndex === 0) ? 0 : -1,
        source: item,
        ...(treeEdit?.mode === 'rename' && treeEdit.entry.id === item.id
          ? {
              inlineEdit: {
                value: treeEdit.name,
                ariaLabel: `Rename ${item.name}`,
                onChange: (name: string) => setTreeEdit({ ...treeEdit, name }),
                onCommit: () => treeEditCommitRef.current?.() ?? false,
                onCancel: () => setTreeEdit(null)
              }
            }
          : {})
      })
    ) as EditorTreeViewItem[]
    if (treeEdit?.mode === 'create') {
      const parentIndex = treeEdit.parentPath
        ? visible.findIndex((row) => row.path === treeEdit.parentPath)
        : -1
      if (!treeEdit.parentPath || parentIndex >= 0) {
        const depth = parentIndex < 0 ? 0 : visible[parentIndex].depth + 1
        let insertAt = parentIndex < 0 ? 0 : parentIndex + 1
        while (
          parentIndex >= 0 &&
          insertAt < visible.length &&
          visible[insertAt].path.startsWith(`${treeEdit.parentPath}/`)
        )
          insertAt += 1
        visible.splice(insertAt, 0, {
          id: `inline-create:${treeEdit.parentPath}`,
          path: treeEdit.path,
          name: treeEdit.name,
          kind: treeEdit.kind === 'folder' ? 'directory' : 'markdown',
          depth,
          inlineEdit: {
            value: treeEdit.name,
            ariaLabel: treeEdit.kind === 'folder' ? 'New folder name' : 'New file name',
            onChange: (name) =>
              setTreeEdit({
                ...treeEdit,
                name,
                path: treeEdit.parentPath ? `${treeEdit.parentPath}/${name}` : name
              }),
            onCommit: () => treeEditCommitRef.current?.() ?? false,
            onCancel: () => setTreeEdit(null)
          }
        })
      }
    }
    return visible
  }, [
    treeBranches,
    expandedFolders,
    loadingFolders,
    activeFile,
    openingFileId,
    directory.id,
    focusedTreePath,
    treeSyncStates,
    sessionSnapshot,
    treeEdit,
    treeDropTarget
  ])
  const treeProjection = useMemo(
    () => projectEditorTreeRows(treeRows, treeScrollTop, treeViewportHeight),
    [treeRows, treeScrollTop, treeViewportHeight]
  )
  const documentSaving =
    sessionSnapshot?.savePhase === 'saving' || sessionSnapshot?.savePhase === 'dirty'
  const documentNeedsAttention =
    sessionSnapshot?.savePhase === 'error' ||
    sessionSnapshot?.savePhase === 'conflict' ||
    sessionSnapshot?.syncPhase === 'blocked'
  const documentSyncing = syncing || sessionSnapshot?.syncPhase === 'pending'

  const focusTreeRow = useCallback(
    (path: string) => {
      setFocusedTreePath(path)
      const index = treeRows.findIndex((row) => row.path === path)
      const viewport = treeScrollContainerRef.current
      if (index >= 0 && viewport) {
        const rowTop = index * EDITOR_TREE_ROW_HEIGHT
        const rowBottom = rowTop + EDITOR_TREE_ROW_HEIGHT
        if (rowTop < viewport.scrollTop) viewport.scrollTop = rowTop
        else if (rowBottom > viewport.scrollTop + viewport.clientHeight) {
          viewport.scrollTop = rowBottom - viewport.clientHeight
        }
      }
      window.requestAnimationFrame(() => {
        const rows = [
          ...(treeRootRef.current?.querySelectorAll<HTMLButtonElement>('[role="treeitem"]') ?? [])
        ]
        rows.find((row) => row.dataset.treePath === path)?.focus({ preventScroll: true })
      })
    },
    [treeRows]
  )

  const handleTreeKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      const rows = treeRows
      const target = (event.target as HTMLElement).closest<HTMLButtonElement>('[role="treeitem"]')
      const path = target?.dataset.treePath ?? focusedTreePath
      const index = rows.findIndex((row) => row.path === path)
      if (index < 0) return
      const current = rows[index]
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const next =
          rows[Math.max(0, Math.min(rows.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))]
        if (next) focusTreeRow(next.path)
      } else if (event.key === 'ArrowRight' && current.expandable && !current.expanded) {
        event.preventDefault()
        void toggleFolder(current.source as GoogleDriveWorkspaceEntry)
      } else if (event.key === 'ArrowLeft' && current.expandable && current.expanded) {
        event.preventDefault()
        void toggleFolder(current.source as GoogleDriveWorkspaceEntry)
      }
    },
    [focusedTreePath, focusTreeRow, toggleFolder, treeRows]
  )

  useEffect(() => {
    const generation = ++searchGeneration.current
    if (!root || !searchOpen) {
      setSearching(false)
      return
    }
    const query = searchQuery.trim()
    setSearchResults([])
    setSearchPageToken(undefined)
    if (query.length < 2) {
      setSearching(false)
      return
    }
    setSearching(true)
    const timer = window.setTimeout(() => {
      void window.pkmsDesktop
        .searchGoogleDriveWorkspace(root.id, query)
        .then((page) => {
          if (generation !== searchGeneration.current) return
          setSearchResults(page.entries)
          setSearchPageToken(page.nextPageToken)
        })
        .catch((cause) => {
          if (generation === searchGeneration.current)
            setError(cause instanceof Error ? cause.message : 'Google Drive search failed.')
        })
        .finally(() => {
          if (generation === searchGeneration.current) setSearching(false)
        })
    }, 250)
    return () => window.clearTimeout(timer)
  }, [root, searchOpen, searchQuery])

  useEffect(() => {
    if (!root) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || !event.shiftKey || event.key.toLowerCase() !== 'f')
        return
      event.preventDefault()
      setSearchOpen(true)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [root])

  const loadMoreSearchResults = useCallback(async () => {
    if (!root || !searchPageToken || searching) return
    const generation = searchGeneration.current
    setSearching(true)
    try {
      const page = await window.pkmsDesktop.searchGoogleDriveWorkspace(
        root.id,
        searchQuery.trim(),
        searchPageToken
      )
      if (generation !== searchGeneration.current) return
      setSearchResults((current) => [...current, ...page.entries])
      setSearchPageToken(page.nextPageToken)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Google Drive search failed.')
    } finally {
      if (generation === searchGeneration.current) setSearching(false)
    }
  }, [root, searchPageToken, searchQuery, searching])

  const syncNow = useCallback(async () => {
    if (!root) return
    setSyncing(true)
    updateTreeSyncStates((current) => new Map([...current.keys()].map((path) => [path, 'syncing'])))
    try {
      const result = await window.pkmsDesktop.syncGoogleDriveWorkspace(root.id)
      await refreshDirectory()
      setStatus(
        result.pendingOperations
          ? `${result.pendingOperations} change(s) waiting for Drive`
          : 'Google Drive is up to date'
      )
      updateTreeSyncStates(
        (current) =>
          new Map(
            [...current.keys()].map((path) => [
              path,
              result.pendingOperations ? 'pending' : 'synced'
            ])
          )
      )
      if (result.pendingOperations === 0) {
        for (const path of [...deferredFolderBranches.current]) {
          const entry = [...treeBranchesRef.current.values()]
            .flat()
            .find((candidate) => candidate.path === path && candidate.kind === 'folder')
          if (!entry) {
            deferredFolderBranches.current.delete(path)
            continue
          }
          try {
            const children = await window.pkmsDesktop.listGoogleDriveDirectory(root.id, entry.id)
            setTreeBranches((current) => new Map(current).set(path, children))
            deferredFolderBranches.current.delete(path)
          } catch {
            // Keep the branch deferred so the next successful sync can retry it.
          }
        }
      }
      setError('')
    } catch (cause) {
      updateTreeSyncStates(
        (current) => new Map([...current.keys()].map((path) => [path, 'attention']))
      )
      setError(cause instanceof Error ? cause.message : 'Google Drive sync failed.')
      setStatus('Google Drive sync is waiting')
    } finally {
      setSyncing(false)
    }
  }, [refreshDirectory, root])

  useEffect(() => {
    if (!root) return
    const catchUp = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) void syncNow()
    }
    const timer = window.setInterval(() => {
      catchUp()
    }, 60_000)
    document.addEventListener('visibilitychange', catchUp)
    window.addEventListener('online', catchUp)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', catchUp)
      window.removeEventListener('online', catchUp)
    }
  }, [root, syncNow])

  const openEntry = useCallback(
    async (entry: GoogleDriveWorkspaceEntry) => {
      if (!root) return
      if (entry.kind === 'folder') {
        await toggleFolder(entry)
        return
      }
      const generation = ++openGeneration.current
      setError('')
      setFocusedTreePath(entry.path)
      setOpeningFileId(entry.id)

      if (entry.kind === 'asset') {
        const previous = sessionRef.current
        sessionRef.current = null
        setSession(null)
        setActiveFile(entry)
        setAssetPreviewUrl(null)
        setAssetPreviewType('')
        setAssetPreviewError(null)
        try {
          await previous?.close()
          if (generation !== openGeneration.current) return
          const opened = await window.pkmsDesktop.readGoogleDriveAsset(root.id, entry.id)
          if (generation !== openGeneration.current) return
          const contentType = editorAssetContentType(opened.entry.path, opened.contentType)
          const bytes = new Uint8Array(opened.bytes.byteLength)
          bytes.set(opened.bytes)
          const url = URL.createObjectURL(new Blob([bytes], { type: contentType }))
          setActiveFile(opened.entry)
          setAssetPreviewType(contentType)
          setAssetPreviewUrl(url)
          setOpeningFileId(null)
        } catch (cause) {
          if (generation === openGeneration.current) {
            const message =
              cause instanceof Error ? cause.message : 'Could not open the attachment.'
            setOpeningFileId(null)
            setAssetPreviewError(message)
            setError(message)
          }
        }
        return
      }
      setAssetPreviewUrl(null)
      setAssetPreviewType('')
      setAssetPreviewError(null)
      try {
        const opened = await window.pkmsDesktop.openGoogleDriveMarkdown(root.id, entry.id, entry)
        if (generation !== openGeneration.current) return
        const next = createSession(root.id, opened.entry, opened.text, opened.revision)
        const previous = sessionRef.current
        await previous?.close()
        if (generation !== openGeneration.current) return
        sessionRef.current = next
        setSession(next)
        setActiveFile(opened.entry)
        setOpeningFileId(null)
      } catch (cause) {
        if (generation === openGeneration.current) {
          setOpeningFileId(null)
          setError(cause instanceof Error ? cause.message : 'Could not open the Markdown file.')
        }
      }
    },
    [root, toggleFolder]
  )

  const resolveDrivePath = useCallback(
    async (path: string): Promise<GoogleDriveWorkspaceEntry | null> => {
      if (!root) return null
      const segments = path.split('/').filter(Boolean)
      if (!segments.length) return null
      let parentId: string | null = null
      let resolved: GoogleDriveWorkspaceEntry | null = null
      let currentPath = ''
      for (const [index, name] of segments.entries()) {
        currentPath = currentPath ? `${currentPath}/${name}` : name
        const entries = await window.pkmsDesktop.listGoogleDriveDirectory(root.id, parentId)
        resolved = entries.find((entry) => entry.path === currentPath) ?? null
        if (!resolved) return null
        if (index < segments.length - 1 && resolved.kind !== 'folder') return null
        parentId = resolved.id
      }
      return resolved
    },
    [root]
  )

  const revealDriveEntry = useCallback(
    async (entry: GoogleDriveWorkspaceEntry) => {
      if (!root) return
      let parentId: string | null = null
      let directoryPath = ''
      const folderPaths: string[] = []
      const branches: Array<[string, GoogleDriveWorkspaceEntry[]]> = []
      for (const name of entry.path.split('/').slice(0, -1)) {
        const entries = await window.pkmsDesktop.listGoogleDriveDirectory(root.id, parentId)
        branches.push([directoryPath, entries])
        const folder = entries.find(
          (candidate) => candidate.name === name && candidate.kind === 'folder'
        )
        if (!folder) return
        parentId = folder.id
        directoryPath = folder.path
        folderPaths.push(folder.path)
      }
      const siblings = await window.pkmsDesktop.listGoogleDriveDirectory(root.id, parentId)
      branches.push([directoryPath, siblings])
      setTreeBranches((current) => {
        const next = new Map(current)
        branches.forEach(([path, entries]) => next.set(path, entries))
        return next
      })
      setExpandedFolders((current) => new Set([...current, ...folderPaths]))
      setFocusedTreePath(entry.path)
      window.requestAnimationFrame(() => {
        const row = [
          ...(treeRootRef.current?.querySelectorAll<HTMLElement>('[data-tree-path]') ?? [])
        ].find((candidate) => candidate.dataset.treePath === entry.path)
        row?.scrollIntoView({ block: 'nearest' })
        row?.focus({ preventScroll: true })
      })
    },
    [root]
  )

  const activateDriveLink = useCallback(
    (link: { kind: 'markdown' | 'wikilink'; target: string }): boolean => {
      if (!root || !activeFile) return false
      if (link.kind === 'wikilink') {
        void resolveEditorWikiLink(
          {
            listChildren: async (parentId) => {
              const entries = await window.pkmsDesktop.listGoogleDriveDirectory(root.id, parentId)
              return entries.map((entry) => driveEntryToEditorItem(root.id, entry))
            },
            createFileAtRoot: async (name) => {
              const created = await window.pkmsDesktop.createGoogleDriveItem(
                root.id,
                '',
                'markdown',
                name,
                undefined,
                root.id
              )
              setTreeBranches((current) =>
                new Map(current).set('', [...(current.get('') ?? []), created])
              )
              return driveEntryToEditorItem(root.id, created)
            }
          },
          link.target
        )
          .then(async (item) => {
            const entry = await resolveDrivePath(item.path)
            if (!entry || entry.kind !== 'markdown') {
              setError(`Could not find linked file: ${item.path}`)
              return
            }
            await openEntry(entry)
          })
          .catch((cause) =>
            setError(cause instanceof Error ? cause.message : 'Could not resolve wikilink.')
          )
        return true
      }
      const path = resolveEditorRelativeLink(activeFile.path, link.target)
      if (!path) return false
      void resolveDrivePath(path)
        .then(async (entry) => {
          if (!entry || entry.kind !== 'markdown') {
            setError(`Could not find linked file: ${path}`)
            return
          }
          await openEntry(entry)
        })
        .catch((cause) =>
          setError(cause instanceof Error ? cause.message : 'Could not open linked file.')
        )
      return true
    },
    [activeFile, openEntry, resolveDrivePath, root, setError]
  )

  const loadBreadcrumbChildren = useCallback(
    async (directoryPath: string): Promise<EditorBreadcrumbEntry[]> => {
      if (!root) return []
      const parent = directoryPath ? await resolveDrivePath(directoryPath) : null
      if (directoryPath && parent?.kind !== 'folder') return []
      const entries = await window.pkmsDesktop.listGoogleDriveDirectory(root.id, parent?.id ?? null)
      return entries.map((entry) => ({
        name: entry.name,
        path: entry.path,
        kind:
          entry.kind === 'folder' ? 'directory' : entry.kind === 'markdown' ? 'markdown' : 'viewer'
      }))
    },
    [resolveDrivePath, root]
  )

  const openBreadcrumbFile = useCallback(
    (path: string) => {
      void resolveDrivePath(path)
        .then((entry) => {
          if (!entry) {
            setError(`Could not find file: ${path}`)
            return
          }
          void openEntry(entry)
        })
        .catch((cause) =>
          setError(cause instanceof Error ? cause.message : 'Could not open the file.')
        )
    },
    [openEntry, resolveDrivePath]
  )

  const createItem = useCallback(
    async (kind: 'markdown' | 'folder', parentPath: string, name: string) => {
      if (!root) return
      try {
        const path = parentPath ? `${parentPath}/${name}` : name
        invalidateTreeBranch(parentPath)
        const itemId = crypto.randomUUID()
        const parentItemId = parentPath
          ? ([...treeBranches.values()].flat().find((entry) => entry.path === parentPath)?.id ??
            root.id)
          : root.id
        const optimistic: GoogleDriveWorkspaceEntry = {
          id: itemId,
          name,
          mimeType: kind === 'folder' ? 'application/vnd.google-apps.folder' : 'text/markdown',
          appProperties: { pkmsWorkspaceRootId: root.id, pkmsItemId: itemId },
          parents: [parentItemId],
          path,
          kind
        }
        setTreeBranches((current) =>
          new Map(current).set(parentPath, [
            ...(current.get(parentPath) ?? []).filter((entry) => entry.name !== name),
            optimistic
          ])
        )
        updateTreeSyncStates((current) => new Map(current).set(path, 'pending'))
        const created = await window.pkmsDesktop.createGoogleDriveItem(
          root.id,
          parentPath,
          kind,
          name,
          itemId,
          parentItemId
        )
        setTreeBranches((current) => {
          const next = new Map(current)
          const siblings = next.get(parentPath) ?? []
          if (!siblings.some((entry) => entry.id === created.id))
            next.set(parentPath, [...siblings, created])
          return next
        })
        setStatus(`Saving ${path} to Google Drive…`)
        if (kind === 'markdown') void openEntry(created)
        window.setTimeout(() => void syncNow(), 900)
      } catch (cause) {
        updateTreeSyncStates((current) =>
          new Map(current).set(parentPath ? `${parentPath}/${name}` : name, 'attention')
        )
        setError(cause instanceof Error ? cause.message : 'Could not create the item.')
      }
    },
    [openEntry, root, syncNow]
  )

  const requestCreateItem = useCallback(
    (kind: 'markdown' | 'folder', parentPath = directory.path) => {
      setTreeContextMenu(null)
      if (parentPath) {
        const folder = [...treeBranches.values()]
          .flat()
          .find((entry) => entry.path === parentPath && entry.kind === 'folder')
        if (folder && !expandedFolders.has(parentPath)) void toggleFolder(folder)
      }
      const name = kind === 'markdown' ? 'Untitled.md' : 'New Folder'
      setTreeEdit({
        mode: 'create',
        kind,
        parentPath,
        name,
        path: parentPath ? `${parentPath}/${name}` : name
      })
    },
    [createItem, directory.path, expandedFolders, toggleFolder, treeBranches]
  )

  const commitRenameEntry = useCallback(
    async (entry: GoogleDriveWorkspaceEntry, name: string) => {
      if (!root) throw new Error('No connected Google Drive workspace.')
      if (name === entry.name) return
      try {
        const parentPath = entry.path.split('/').slice(0, -1).join('/')
        const optimistic = { ...entry, name, path: parentPath ? `${parentPath}/${name}` : name }
        invalidateTreeBranch(parentPath)
        setTreeBranches((current) =>
          new Map(current).set(
            parentPath,
            (current.get(parentPath) ?? []).map((item) =>
              item.id === entry.id ? optimistic : item
            )
          )
        )
        updateTreeSyncStates((current) => {
          const next = new Map(current)
          next.delete(entry.path)
          next.set(optimistic.path, 'pending')
          return next
        })
        if (activeFile?.id === entry.id) {
          setActiveFile(optimistic)
          session?.updateItem?.({
            providerId: `pkms-google-drive:${root.id}`,
            itemId: optimistic.id,
            parentId: optimistic.parents?.[0] ?? null,
            name: optimistic.name,
            path: optimistic.path,
            kind: 'markdown',
            readOnly: false
          })
        }
        await window.pkmsDesktop.renameGoogleDriveItem(root.id, entry.id, name, entry)
        void syncNow()
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'Could not rename the item.'
        setError(message)
        throw new Error(message)
      }
    },
    [activeFile, root, session, syncNow]
  )

  const renameEntry = useCallback(
    (entry: GoogleDriveWorkspaceEntry) => {
      setTreeContextMenu(null)
      setTreeEdit({ mode: 'rename', entry, name: entry.name, path: entry.path })
    },
    [commitRenameEntry]
  )

  treeEditCommitRef.current = () => {
    const edit = treeEdit
    if (!edit) return false
    const name = edit.name.trim()
    if (!name || name.includes('/') || name === '.' || name === '..') {
      setError('Enter a valid file or folder name.')
      return false
    }
    setTreeEdit(null)
    if (edit.mode === 'create') void createItem(edit.kind, edit.parentPath, name)
    else void commitRenameEntry(edit.entry, name).catch(() => undefined)
    return true
  }

  const beginTitleEdit = (caretPosition: number) => {
    if (!activeFile || activeFile.kind !== 'markdown') return
    titleCaretPositionRef.current = caretPosition
    setTitleDraft(markdownTitleFor(activeFile.path))
    setTitleError(null)
    setTitleEditing(true)
  }

  const commitTitleRename = async () => {
    const current = activeFile
    if (!current || current.kind !== 'markdown' || !root) return
    const validation = validateTitleInput(titleDraft)
    if ('error' in validation) {
      if (validation.error === 'empty') {
        setTitleEditing(false)
        setTitleError(null)
        return
      }
      setTitleError('Title can’t contain "/" or "\\".')
      titleInputRef.current?.focus()
      return
    }
    if (validation.title === markdownTitleFor(current.path)) {
      setTitleEditing(false)
      setTitleError(null)
      return
    }

    try {
      const nextPath = buildRenamedPath(current.path, validation.title)
      const nextName = nextPath.split('/').at(-1) ?? nextPath
      const parentPath = current.path.split('/').slice(0, -1).join('/')
      const siblings = treeBranches.get(parentPath) ?? []
      const collision = siblings.some(
        (item) =>
          item.id !== current.id && item.name.toLocaleLowerCase() === nextName.toLocaleLowerCase()
      )
      if (collision) throw new Error(`"${validation.title}" already exists.`)
      if (session?.snapshot().savePhase !== 'clean') {
        const saved = await session?.save({ flushSync: false })
        if (saved?.savePhase !== 'clean')
          throw new Error(saved?.message ?? 'Could not save the document before renaming it.')
      }
      await commitRenameEntry(current, nextName)
      setTitleEditing(false)
      setTitleError(null)
    } catch (cause) {
      setTitleError(cause instanceof Error ? cause.message : String(cause))
      titleInputRef.current?.focus()
    }
  }

  const confirmTrashEntry = useCallback(
    async (entry: GoogleDriveWorkspaceEntry) => {
      if (!root) return
      setBusy(true)
      try {
        if (activeFile?.id === entry.id && session?.snapshot().savePhase !== 'clean') {
          const saved = await session?.save({ flushSync: false })
          if (saved?.savePhase !== 'clean')
            throw new Error(
              saved?.message ?? 'Could not preserve the document before moving it to trash.'
            )
        }
        await window.pkmsDesktop.trashGoogleDriveItem(root.id, entry.id)
        invalidateTreeBranch(entry.path.split('/').slice(0, -1).join('/'))
        if (activeFile?.id === entry.id) {
          await session?.close()
          setSession(null)
          setActiveFile(null)
        }
        if (entry.kind === 'folder') {
          const parentPath = entry.path.split('/').slice(0, -1).join('/')
          const parentId = entry.parents?.[0] ?? null
          if (directory.path === entry.path || directory.path.startsWith(`${entry.path}/`)) {
            setDirectory({
              id: parentId === root.id ? null : parentId,
              path: parentPath,
              ancestors: []
            })
          }
          setExpandedFolders((current) => {
            const next = new Set(current)
            for (const path of next) {
              if (path === entry.path || path.startsWith(`${entry.path}/`)) next.delete(path)
            }
            return next
          })
          setTreeBranches((current) => {
            const next = new Map(current)
            for (const path of next.keys()) {
              if (path === entry.path || path.startsWith(`${entry.path}/`)) next.delete(path)
            }
            return next
          })
          setLoadingFolders((current) => {
            const next = new Set(current)
            for (const path of next) {
              if (path === entry.path || path.startsWith(`${entry.path}/`)) next.delete(path)
            }
            return next
          })
        }
        const parentPath = entry.path.split('/').slice(0, -1).join('/')
        const removeTrashedEntry = (branches: Map<string, GoogleDriveWorkspaceEntry[]>) => {
          const next = new Map(branches)
          next.set(
            parentPath,
            (next.get(parentPath) ?? []).filter(
              (item) => item.id !== entry.id && item.path !== entry.path
            )
          )
          return next
        }
        setTreeBranches(removeTrashedEntry)
        updateTreeSyncStates((current) => {
          const next = new Map(current)
          for (const path of next.keys())
            if (path === entry.path || path.startsWith(`${entry.path}/`)) next.delete(path)
          return next
        })
        let refreshed = true
        try {
          await refreshEntryParent(entry)
          // Drive listings can briefly return the item after the trash write succeeds.
          setTreeBranches(removeTrashedEntry)
        } catch {
          refreshed = false
          setError('Moved to Google Drive trash. The tree will refresh on the next sync.')
        }
        if (refreshed) setError('')
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not trash the item.')
      } finally {
        setBusy(false)
      }
    },
    [activeFile, directory.path, refreshEntryParent, root, session]
  )

  const trashEntry = useCallback(
    (entry: GoogleDriveWorkspaceEntry) => {
      setTreeContextMenu(null)
      setDialogRequest({
        kind: 'confirm',
        title: 'Move to trash?',
        message: `Move “${entry.name}” to Google Drive trash? You can restore it from Drive trash.`,
        confirmLabel: 'Move to trash',
        onConfirm: () => void confirmTrashEntry(entry)
      })
    },
    [confirmTrashEntry]
  )

  const openTreeContextMenu = useCallback(
    (entry: GoogleDriveWorkspaceEntry | null, x: number, y: number) => {
      const height = entry?.kind === 'folder' ? 210 : entry ? 150 : 112
      setTreeContextMenu({
        entry,
        x: Math.max(8, Math.min(x, window.innerWidth - 200)),
        y: Math.max(8, Math.min(y, window.innerHeight - height - 8))
      })
    },
    []
  )

  const moveTreeItems = useCallback(
    async (paths: string[], destinationPath: string) => {
      if (!root) return
      const allEntries = [...treeBranches.values()].flat()
      const sourceEntries = paths
        .map((path) => allEntries.find((entry) => entry.path === path))
        .filter((entry): entry is GoogleDriveWorkspaceEntry => Boolean(entry))
        .filter(
          (entry) =>
            !paths.some((other) => other !== entry.path && entry.path.startsWith(`${other}/`))
        )
      const target = destinationPath
        ? allEntries.find((entry) => entry.path === destinationPath)
        : null
      if (destinationPath && target?.kind !== 'folder') return
      const destinationId = target?.id ?? root.id
      if (
        sourceEntries.some(
          (entry) =>
            entry.kind === 'folder' &&
            (destinationPath === entry.path || destinationPath.startsWith(`${entry.path}/`))
        )
      )
        return
      const moved = sourceEntries.map((entry) => {
        const nextPath = destinationPath ? `${destinationPath}/${entry.name}` : entry.name
        return { ...entry, path: nextPath, parents: [destinationId] }
      })
      if (moved.some((entry, index) => entry.path === sourceEntries[index].path)) return
      invalidateTreeBranch(destinationPath)
      sourceEntries.forEach((entry) => {
        invalidateTreeBranch(entry.path.split('/').slice(0, -1).join('/'))
        invalidateTreeBranch(entry.path)
        if (entry.kind === 'folder')
          for (const path of treeBranches.keys())
            if (path.startsWith(`${entry.path}/`)) invalidateTreeBranch(path)
      })
      setTreeBranches((current) => {
        const next = new Map(current)
        for (const entry of sourceEntries) {
          const parent = entry.path.split('/').slice(0, -1).join('/')
          next.set(
            parent,
            (next.get(parent) ?? []).filter((item) => item.id !== entry.id)
          )
          if (entry.kind === 'folder') {
            for (const [branchPath, children] of current) {
              if (branchPath !== entry.path && !branchPath.startsWith(`${entry.path}/`)) continue
              const branchNextPath =
                moved.find((item) => item.id === entry.id)!.path +
                branchPath.slice(entry.path.length)
              next.delete(branchPath)
              next.set(
                branchNextPath,
                children.map((child) => ({
                  ...child,
                  path:
                    moved.find((item) => item.id === entry.id)!.path +
                    child.path.slice(entry.path.length)
                }))
              )
            }
          }
        }
        next.set(destinationPath, [...(next.get(destinationPath) ?? []), ...moved])
        return next
      })
      setExpandedFolders((current) => {
        const next = new Set(current)
        sourceEntries.forEach((entry) => {
          if (entry.kind !== 'folder') return
          const newPath = moved.find((item) => item.id === entry.id)!.path
          for (const path of current)
            if (path === entry.path || path.startsWith(`${entry.path}/`)) {
              next.delete(path)
              next.add(newPath + path.slice(entry.path.length))
            }
        })
        return next
      })
      moved.forEach((entry) =>
        updateTreeSyncStates((current) => new Map(current).set(entry.path, 'pending'))
      )
      if (activeFile && sourceEntries.some((entry) => entry.id === activeFile.id)) {
        const renamed = moved.find((entry) => entry.id === activeFile.id)
        if (renamed) {
          setActiveFile(renamed)
          session?.updateItem?.({
            providerId: `pkms-google-drive:${root.id}`,
            itemId: renamed.id,
            parentId: destinationId,
            name: renamed.name,
            path: renamed.path,
            kind: 'markdown',
            readOnly: false
          })
        }
      }
      try {
        await window.pkmsDesktop.moveGoogleDriveItems(
          root.id,
          sourceEntries.map((entry) => entry.id),
          destinationPath
        )
        setStatus('Saving moved items to Google Drive…')
        void syncNow()
      } catch (cause) {
        updateTreeSyncStates((current) => {
          const next = new Map(current)
          moved.forEach((entry) => next.set(entry.path, 'attention'))
          return next
        })
        setError(cause instanceof Error ? cause.message : 'Could not move the items.')
      }
    },
    [activeFile, root, session, syncNow, treeBranches]
  )

  const contextMenuItems: ContextMenuItem[] = treeContextMenu
    ? [
        ...(treeContextMenu.entry
          ? [
              {
                type: 'button' as const,
                label: treeContextMenu.entry.kind === 'folder' ? 'Open folder' : 'Open',
                onClick: () => void openEntry(treeContextMenu.entry!)
              }
            ]
          : []),
        ...(treeContextMenu.entry?.kind === 'folder' || !treeContextMenu.entry
          ? [
              {
                type: 'button' as const,
                label: 'New File',
                onClick: () => requestCreateItem('markdown', treeContextMenu.entry?.path ?? '')
              },
              {
                type: 'button' as const,
                label: 'New Folder',
                onClick: () => requestCreateItem('folder', treeContextMenu.entry?.path ?? '')
              }
            ]
          : []),
        ...(treeContextMenu.entry
          ? [
              {
                type: 'button' as const,
                label: 'Rename',
                onClick: () => void renameEntry(treeContextMenu.entry!)
              },
              {
                type: 'button' as const,
                label: 'Move to trash',
                onClick: () => void trashEntry(treeContextMenu.entry!)
              }
            ]
          : []),
        {
          type: 'button',
          label: 'Sync now',
          disabled: busy,
          onClick: () => void syncNow()
        }
      ]
    : []

  return (
    <main
      className={`${driveStyles['pkms-google-drive-root']} ${driveStyles['is-desktop']}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        minHeight: 0
      }}
    >
      {!root && (
        <header
          className={driveStyles['pkms-google-drive-header']}
          style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: 12 }}
        >
          <div>
            <div className={driveStyles['pkms-google-drive-eyebrow']}>PKMS</div>
            <p style={{ margin: '4px 0' }}>{status}</p>
          </div>
          {!root && (
            <button
              data-drive-control=""
              type="button"
              onClick={() => void connect()}
              disabled={busy || !connection.clientConfigured}
            >
              Connect Google Drive
            </button>
          )}
        </header>
      )}
      {!connection.clientConfigured && (
        <p role="status" style={{ padding: 16 }}>
          Set GOOGLE_DRIVE_DESKTOP_CLIENT_ID to a Google OAuth Desktop app client ID to connect.
        </p>
      )}
      {error && (
        <div role="alert" style={{ padding: '8px 12px', color: 'var(--color-danger, #d33)' }}>
          {error}
        </div>
      )}
      {!root && roots.length > 0 && (
        <section style={{ display: 'grid', gap: 8, padding: 16 }}>
          {roots.map((item) => (
            <button
              data-drive-control=""
              key={item.id}
              disabled={busy}
              onClick={() => void setConnected(item)}
            >
              {item.name}
            </button>
          ))}
        </section>
      )}
      {!root &&
        connection.clientConfigured &&
        connection.credentialStored &&
        roots.length === 0 &&
        !error && (
          <section style={{ padding: 16 }}>
            <p>No PKMS Google Drive workspace exists for this account.</p>
            <button
              data-drive-control=""
              disabled={busy}
              onClick={() => {
                setBusy(true)
                void window.pkmsDesktop
                  .createGoogleDriveWorkspace()
                  .then((result) =>
                    setConnected({ id: result.root.id, name: result.root.name }, result.entries)
                  )
                  .catch((cause) =>
                    setError(
                      cause instanceof Error ? cause.message : 'Could not create a workspace.'
                    )
                  )
                  .finally(() => setBusy(false))
              }}
            >
              Create PKMS Google Drive workspace
            </button>
          </section>
        )}
      {root && (
        <section
          className={driveStyles['pkms-google-drive-workspace']}
          style={{
            display: 'flex',
            flex: 1,
            minHeight: 0,
            borderTop: '1px solid var(--border-color, #8884)'
          }}
        >
          {treeOpen && (
            <EditorTreeFrame
              className={driveStyles['pkms-google-drive-tree']}
              ariaLabel="Google Drive files"
              header={
                <EditorTreeToolbar
                  title="Files"
                  status={
                    <button
                      type="button"
                      className={driveStyles['pkms-google-drive-sync-state']}
                      data-drive-sync-state=""
                      onClick={() => {
                        if (
                          sessionSnapshot?.savePhase === 'dirty' ||
                          sessionSnapshot?.savePhase === 'error'
                        )
                          void session?.save({ flushSync: true })
                        else if (sessionSnapshot?.savePhase !== 'conflict') void syncNow()
                      }}
                      disabled={
                        busy ||
                        syncing ||
                        sessionSnapshot?.savePhase === 'saving' ||
                        sessionSnapshot?.savePhase === 'conflict'
                      }
                      title="Sync now"
                    >
                      <span
                        className={`${driveStyles['pkms-google-drive-sync-indicator']} ${documentSaving || documentSyncing ? driveStyles['is-busy'] : error || documentNeedsAttention ? driveStyles['is-error'] : ''}`}
                      />
                      <span>
                        {documentSaving
                          ? 'Saving'
                          : documentNeedsAttention
                            ? 'Needs attention'
                            : documentSyncing
                              ? 'Syncing'
                              : error
                                ? 'Needs attention'
                                : status.toLowerCase().includes('waiting')
                                  ? 'Waiting'
                                  : 'Up to date'}
                      </span>
                    </button>
                  }
                  actions={
                    <EditorTreeCreateActions
                      canCreateFile
                      canCreateDirectory
                      disabled={busy}
                      onCreateFile={() => requestCreateItem('markdown')}
                      onCreateDirectory={() => requestCreateItem('folder')}
                    />
                  }
                />
              }
              footer={
                roots.length > 1 ? (
                  <div className={driveStyles['pkms-google-drive-tree-footer']}>
                    <select
                      aria-label="PKMS Google Drive workspace"
                      value={root.id}
                      disabled={busy}
                      onChange={(event) => {
                        const nextRoot = roots.find((item) => item.id === event.target.value)
                        if (nextRoot) void setConnected(nextRoot)
                      }}
                    >
                      {roots.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : undefined
              }
              style={{
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                flex: `0 0 ${treeWidth - 1}px`,
                width: treeWidth - 1,
                minWidth: 180,
                borderRight: '1px solid var(--border-color, #8884)',
                minHeight: 0
              }}
            >
              {searchOpen && (
                <div className={driveStyles['pkms-google-drive-search-row']}>
                  {searchOpen ? (
                    <>
                      <input
                        ref={driveSearchInputRef}
                        data-drive-search
                        aria-label="Search PKMS Google Drive workspace"
                        placeholder="Search workspace"
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') {
                            setSearchOpen(false)
                            setSearchQuery('')
                          }
                        }}
                        style={{ minWidth: 0, flex: 1 }}
                      />
                      <button
                        data-drive-control=""
                        type="button"
                        onClick={() => {
                          setSearchOpen(false)
                          setSearchQuery('')
                        }}
                        aria-label="Close search"
                      >
                        ×
                      </button>
                    </>
                  ) : null}
                </div>
              )}
              {searchOpen ? (
                <div
                  aria-live="polite"
                  style={{
                    display: 'grid',
                    flex: '1 1 auto',
                    minHeight: 0,
                    gap: 2,
                    overflow: 'auto'
                  }}
                >
                  {searchQuery.trim().length < 2 ? (
                    <span style={{ padding: 8, opacity: 0.65 }}>Type at least 2 characters.</span>
                  ) : searching && !searchResults.length ? (
                    <span style={{ padding: 8, opacity: 0.65 }}>Searching Drive…</span>
                  ) : searchResults.length ? (
                    <>
                      {searchResults.map((entry) => (
                        <button
                          data-drive-control=""
                          key={entry.id}
                          type="button"
                          onClick={() => void openEntry(entry)}
                          style={{ display: 'grid', textAlign: 'left', padding: '7px 8px' }}
                        >
                          <span>{entry.name}</span>
                          <small style={{ opacity: 0.65 }}>{entry.path}</small>
                        </button>
                      ))}
                      {searchPageToken && (
                        <button
                          data-drive-control=""
                          type="button"
                          disabled={searching}
                          onClick={() => void loadMoreSearchResults()}
                        >
                          {searching ? 'Loading…' : 'Load more results'}
                        </button>
                      )}
                    </>
                  ) : searchPageToken ? (
                    <button
                      data-drive-control=""
                      type="button"
                      disabled={searching}
                      onClick={() => void loadMoreSearchResults()}
                    >
                      {searching ? 'Searching Drive…' : 'Continue searching Drive…'}
                    </button>
                  ) : searching ? (
                    <span style={{ padding: 8, opacity: 0.65 }}>Searching Drive…</span>
                  ) : (
                    <span style={{ padding: 8, opacity: 0.65 }}>No matches in the workspace.</span>
                  )}
                </div>
              ) : (
                <EditorTreePane
                  ariaLabel="PKMS Google Drive tree viewport"
                  className={driveStyles['pkms-google-drive-tree-scroll']}
                  contentRef={treeScrollContainerRef}
                  style={{ flex: '1 1 auto', minHeight: 0 }}
                  tree={{
                    rootRef: treeRootRef,
                    projection: treeProjection,
                    className: '',
                    ariaLabel: 'PKMS Google Drive files',
                    canMove: true,
                    rootDropTarget: treeDropTarget === '',
                    onSetDropTarget: setTreeDropTarget,
                    onDropItems: (paths, destination) => void moveTreeItems(paths, destination),
                    onDragStart: (item, _index, event) => {
                      event.dataTransfer.effectAllowed = 'move'
                      event.dataTransfer.setData(
                        EDITOR_TREE_DRAG_MIME_TYPE,
                        JSON.stringify([item.path])
                      )
                    },
                    emptyContent: (
                      <span style={{ padding: 8, opacity: 0.65 }}>This folder is empty.</span>
                    ),
                    onKeyDown: handleTreeKeyDown,
                    onFocusPath: setFocusedTreePath,
                    onRootContextMenu: (event) =>
                      openTreeContextMenu(null, event.clientX, event.clientY),
                    onContextMenu: (item, event) =>
                      openTreeContextMenu(
                        item.source as GoogleDriveWorkspaceEntry,
                        event.clientX,
                        event.clientY
                      ),
                    onActivate: (item) => {
                      const entry = item.source as GoogleDriveWorkspaceEntry
                      setFocusedTreePath(entry.path)
                      if (entry.kind === 'folder') void toggleFolder(entry)
                      else void openEntry(entry)
                    }
                  }}
                />
              )}
              {treeContextMenu && (
                <ContextMenu
                  x={treeContextMenu.x}
                  y={treeContextMenu.y}
                  ariaLabel={
                    treeContextMenu.entry ? `${treeContextMenu.entry.name} actions` : 'PKMS actions'
                  }
                  items={contextMenuItems}
                  onClose={() => setTreeContextMenu(null)}
                />
              )}
            </EditorTreeFrame>
          )}
          {treeOpen && (
            <EditorTreeResizeHandle
              width={treeWidth}
              minWidth={180}
              maxWidth={480}
              onWidthChange={setTreeWidth}
            />
          )}
          <div
            className={driveStyles['pkms-google-drive-editor']}
            data-drive-editor=""
            style={{ flex: 1, minWidth: 0, overflow: 'auto' }}
          >
            {session && activeFile?.kind === 'markdown' ? (
              <>
                <EditorBreadcrumbs
                  path={activeFile.path}
                  onLoadChildren={loadBreadcrumbChildren}
                  onOpenFile={openBreadcrumbFile}
                />
                <EditorMarkdownEditor
                  className={driveStyles['pkms-google-drive-markdown']}
                  title={
                    <EditorMarkdownTitle
                      path={activeFile.path}
                      title={markdownTitleFor(activeFile.path)}
                      editing={titleEditing}
                      draft={titleDraft}
                      error={titleError}
                      inputRef={titleInputRef}
                      onStartEditing={busy ? undefined : beginTitleEdit}
                      onChange={(value) => {
                        setTitleDraft(value)
                        setTitleError(null)
                      }}
                      onCommit={() => void commitTitleRename()}
                      onCancel={() => {
                        setTitleEditing(false)
                        setTitleError(null)
                      }}
                    />
                  }
                  surfaceKey={activeFile.id}
                  surfaceProps={{
                    session,
                    documentPath: activeFile.path,
                    documentKey: `pkms-google-drive:${root.id}:${activeFile.id}`,
                    parserExtensions: editorMarkdownParserExtensions,
                    extensions: editorCodeMirrorHostExtensions,
                    onActivateLink: activateDriveLink,
                    ariaLabel: 'Markdown editor'
                  }}
                />
              </>
            ) : activeFile?.kind === 'asset' ? (
              <EditorAssetPreview
                fileName={activeFile.name}
                path={activeFile.path}
                size={activeFile.size === undefined ? undefined : Number(activeFile.size)}
                contentType={assetPreviewType}
                url={assetPreviewUrl}
                loading={openingFileId === activeFile.id && !assetPreviewError}
                error={assetPreviewError}
                onDownload={
                  assetPreviewUrl
                    ? () => {
                        const link = document.createElement('a')
                        link.href = assetPreviewUrl
                        link.download = activeFile.name
                        link.click()
                      }
                    : undefined
                }
              />
            ) : (
              <div style={{ display: 'grid', placeItems: 'center', height: '100%', opacity: 0.65 }}>
                Select a Markdown file to open it.
              </div>
            )}
          </div>
        </section>
      )}
      {dialogRequest && (
        <div
          className={driveStyles['pkms-google-drive-dialog-backdrop']}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDialogRequest(null)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setDialogRequest(null)
          }}
        >
          <section
            className={driveStyles['pkms-google-drive-dialog']}
            role="dialog"
            aria-modal="true"
            aria-label={dialogRequest.title}
          >
            <>
              <h2>{dialogRequest.title}</h2>
              <p>{dialogRequest.message}</p>
              <div className={driveStyles['pkms-google-drive-dialog-actions']}>
                <button
                  data-drive-control=""
                  type="button"
                  className={driveStyles['pkms-google-drive-dialog-cancel']}
                  onClick={() => setDialogRequest(null)}
                >
                  Cancel
                </button>
                <button
                  data-drive-control=""
                  type="button"
                  className={`${driveStyles['pkms-google-drive-dialog-submit']} ${driveStyles['is-danger']}`}
                  onClick={() => {
                    dialogRequest.onConfirm()
                    setDialogRequest(null)
                  }}
                >
                  {dialogRequest.confirmLabel}
                </button>
              </div>
            </>
          </section>
        </div>
      )}
      {quickOpen && quickOpenProvider && (
        <EditorQuickOpenDialog
          query={quickQuery}
          items={quickOpenMatches.map((item) => ({
            id: item.itemId,
            label: item.name,
            description: item.path
          }))}
          loading={quickOpenLoading}
          error={quickOpenError}
          onQueryChange={setQuickQuery}
          onClose={() => setQuickOpen(false)}
          onSelect={async (itemId) => {
            const item = quickOpenMatches.find((match) => match.itemId === itemId)
            setQuickOpen(false)
            if (!item) return
            void resolveDrivePath(item.path)
              .then(async (entry) => {
                if (!entry || entry.kind !== 'markdown') {
                  setError(`Could not find Markdown file: ${item.path}`)
                  return
                }
                await revealDriveEntry(entry)
                void openEntry(entry)
              })
              .catch((cause) =>
                setError(cause instanceof Error ? cause.message : 'Could not open file.')
              )
          }}
        />
      )}
    </main>
  )
}
