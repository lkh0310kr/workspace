import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  EditorMarkdownEditor,
  EditorMenuList,
  EditorTreeView,
  flattenEditorTree,
  markdownTitleFor,
  projectEditorTreeRows,
  type EditorDocumentSession,
  type EditorMenuItem,
  type EditorSyncPhase,
  type EditorTreeItem,
  type EditorTreeViewItem
} from '@workspace/editor'
import type { GoogleDriveWorkspaceEntry } from '@pkms/google-drive'
import '@pkms/google-drive/workspace.css'

interface RootOption {
  id: string
  name: string
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
    },
    async save(options = {}) {
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
    },
    async close() {
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
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set())
  const [loadingFolders, setLoadingFolders] = useState<Set<string>>(() => new Set())
  const [treeScrollTop, setTreeScrollTop] = useState(0)
  const [treeViewportHeight, setTreeViewportHeight] = useState(600)
  const treeRootRef = useRef<HTMLElement>(null)
  const treeScrollRef = useRef<HTMLDivElement>(null)
  const driveSearchInputRef = useRef<HTMLInputElement>(null)
  const treeContextMenuRef = useRef<HTMLDivElement>(null)
  const [directory, setDirectory] = useState({
    id: null as string | null,
    path: '',
    ancestors: [] as Array<{ id: string | null; path: string; name: string }>
  })
  const [activeFile, setActiveFile] = useState<GoogleDriveWorkspaceEntry | null>(null)
  const [treeContextMenu, setTreeContextMenu] = useState<{
    entry: GoogleDriveWorkspaceEntry | null
    x: number
    y: number
  } | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<GoogleDriveWorkspaceEntry[]>([])
  const [searchPageToken, setSearchPageToken] = useState<string | undefined>()
  const [searching, setSearching] = useState(false)
  const searchGeneration = useRef(0)
  const [session, setSession] = useState<EditorDocumentSession | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('Connecting to Google Drive…')
  const [error, setError] = useState('')

  const setConnected = useCallback(
    async (nextRoot: RootOption, initialEntries?: GoogleDriveWorkspaceEntry[]) => {
      setBusy(true)
      setError('')
      try {
        const result = initialEntries
          ? { entries: initialEntries }
          : await window.pkmsDesktop.connectGoogleDriveWorkspace(nextRoot.id)
        setSession(null)
        setActiveFile(null)
        setDirectory({ id: null, path: '', ancestors: [] })
        setRoot(nextRoot)
        setTreeBranches(new Map([['', result.entries]]))
        setExpandedFolders(new Set())
        setLoadingFolders(new Set())
        setRoots([])
        setStatus(`Connected to ${nextRoot.name}`)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not connect to Google Drive.')
        setStatus('Google Drive needs attention')
      } finally {
        setBusy(false)
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
    const nextEntries = await window.pkmsDesktop.listGoogleDriveDirectory(root.id, directory.id)
    setTreeBranches((current) => new Map(current).set(directory.path, nextEntries))
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
    const element = treeScrollRef.current
    if (!element) return
    const updateSize = () => setTreeViewportHeight(element.clientHeight)
    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(element)
    return () => observer.disconnect()
  }, [root, treeOpen, searchOpen])

  useEffect(() => {
    if (!searchRequest) return
    setSearchOpen(true)
    window.setTimeout(() => driveSearchInputRef.current?.focus(), 0)
  }, [searchRequest])

  useEffect(() => {
    if (treeOpen && treeScrollRef.current) treeScrollRef.current.scrollTop = treeScrollTop
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
      if (treeBranches.has(entry.path)) return
      setLoadingFolders((current) => new Set(current).add(entry.path))
      try {
        const children = await window.pkmsDesktop.listGoogleDriveDirectory(root.id, entry.id)
        setTreeBranches((current) => new Map(current).set(entry.path, children))
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

  const treeProjection = useMemo(() => {
    const branches = new Map(
      [...treeBranches].map(([path, children]) => [
        path,
        children.map((entry) => ({ ...entry, directory: entry.kind === 'folder' }))
      ])
    )
    const visible = flattenEditorTree(branches, expandedFolders, '').map(({ item, depth }) => ({
      id: item.id,
      path: item.path,
      name: item.name.replace(/\.(?:md|markdown)$/i, ''),
      kind: item.kind === 'folder' ? 'directory' : item.kind,
      depth,
      expandable: item.kind === 'folder',
      expanded: expandedFolders.has(item.path),
      loading: loadingFolders.has(item.path),
      active: activeFile?.id === item.id || directory.id === item.id,
      selected: activeFile?.id === item.id,
      tabIndex: 0,
      source: item
    })) as EditorTreeViewItem[]
    return projectEditorTreeRows(visible, treeScrollTop, treeViewportHeight)
  }, [
    treeBranches,
    expandedFolders,
    loadingFolders,
    activeFile,
    directory.id,
    treeScrollTop,
    treeViewportHeight
  ])

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
      window.setTimeout(() => driveSearchInputRef.current?.focus(), 0)
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
    setBusy(true)
    try {
      const result = await window.pkmsDesktop.syncGoogleDriveWorkspace(root.id)
      await refreshDirectory()
      setStatus(
        result.pendingOperations
          ? `${result.pendingOperations} change(s) waiting for Drive`
          : 'Google Drive is up to date'
      )
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Google Drive sync failed.')
      setStatus('Google Drive sync is waiting')
    } finally {
      setBusy(false)
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
      if (entry.kind !== 'markdown') {
        setError(
          'Attachments are visible in Google Drive but this editor currently opens Markdown only.'
        )
        return
      }
      setBusy(true)
      setError('')
      try {
        const opened = await window.pkmsDesktop.openGoogleDriveMarkdown(root.id, entry.id)
        const next = createSession(root.id, opened.entry, opened.text, opened.revision)
        await session?.close()
        setSession(next)
        setActiveFile(opened.entry)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not open the Markdown file.')
      } finally {
        setBusy(false)
      }
    },
    [root, session, toggleFolder]
  )

  const createItem = useCallback(
    async (kind: 'markdown' | 'folder', parentPath = directory.path) => {
      if (!root) return
      const initialName = kind === 'markdown' ? 'Untitled.md' : 'New Folder'
      const name = window.prompt(
        kind === 'markdown' ? 'New Markdown file' : 'New folder',
        initialName
      )
      if (!name?.trim()) return
      setBusy(true)
      try {
        const path = parentPath ? `${parentPath}/${name.trim()}` : name.trim()
        const updatedEntries = await window.pkmsDesktop.createGoogleDriveItem(
          root.id,
          parentPath,
          kind,
          name.trim()
        )
        setTreeBranches((current) => new Map(current).set(parentPath, updatedEntries))
        setStatus(`Created ${path}`)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not create the item.')
      } finally {
        setBusy(false)
      }
    },
    [directory.path, root]
  )

  const renameEntry = useCallback(
    async (entry: GoogleDriveWorkspaceEntry) => {
      if (!root) return
      const name = window.prompt('Rename item', entry.name)
      if (!name?.trim() || name.trim() === entry.name) return
      setBusy(true)
      try {
        const renamed = await window.pkmsDesktop.renameGoogleDriveItem(
          root.id,
          entry.id,
          name.trim()
        )
        if (activeFile?.id === entry.id) {
          setActiveFile(renamed)
          session?.updateItem?.({
            providerId: `pkms-google-drive:${root.id}`,
            itemId: renamed.id,
            parentId: renamed.parents?.[0] ?? null,
            name: renamed.name,
            path: renamed.path,
            kind: 'markdown',
            readOnly: false
          })
        }
        await refreshEntryParent(entry)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not rename the item.')
      } finally {
        setBusy(false)
      }
    },
    [activeFile, refreshEntryParent, root, session]
  )

  const trashEntry = useCallback(
    async (entry: GoogleDriveWorkspaceEntry) => {
      if (!root || !window.confirm(`Move “${entry.name}” to Google Drive trash?`)) return
      setBusy(true)
      try {
        await window.pkmsDesktop.trashGoogleDriveItem(root.id, entry.id)
        if (activeFile?.id === entry.id) {
          await session?.close()
          setSession(null)
          setActiveFile(null)
        }
        await refreshEntryParent(entry)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not trash the item.')
      } finally {
        setBusy(false)
      }
    },
    [activeFile, refreshEntryParent, root, session]
  )

  const openTreeContextMenu = useCallback(
    (entry: GoogleDriveWorkspaceEntry | null, x: number, y: number) => {
      const height = entry?.kind === 'folder' ? 168 : entry ? 116 : 112
      setTreeContextMenu({
        entry,
        x: Math.max(8, Math.min(x, window.innerWidth - 200)),
        y: Math.max(8, Math.min(y, window.innerHeight - height - 8))
      })
    },
    []
  )

  useEffect(() => {
    if (!treeContextMenu) return
    const dismiss = (event: Event) => {
      if (!treeContextMenuRef.current?.contains(event.target as Node)) setTreeContextMenu(null)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setTreeContextMenu(null)
    }
    window.addEventListener('pointerdown', dismiss, true)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('pointerdown', dismiss, true)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [treeContextMenu])

  const contextMenuItems: EditorMenuItem[] = treeContextMenu
    ? [
        ...(treeContextMenu.entry
          ? [
              {
                type: 'item' as const,
                id: 'open',
                label: treeContextMenu.entry.kind === 'folder' ? 'Open folder' : 'Open',
                onSelect: () => void openEntry(treeContextMenu.entry!)
              }
            ]
          : []),
        ...(treeContextMenu.entry?.kind === 'folder' || !treeContextMenu.entry
          ? [
              {
                type: 'item' as const,
                id: 'new-note',
                label: 'New note',
                onSelect: () => void createItem('markdown', treeContextMenu.entry?.path ?? '')
              },
              {
                type: 'item' as const,
                id: 'new-folder',
                label: 'New folder',
                onSelect: () => void createItem('folder', treeContextMenu.entry?.path ?? '')
              }
            ]
          : []),
        ...(treeContextMenu.entry
          ? [
              {
                type: 'item' as const,
                id: 'rename',
                label: 'Rename',
                onSelect: () => void renameEntry(treeContextMenu.entry!)
              },
              {
                type: 'item' as const,
                id: 'delete',
                label: 'Move to trash',
                danger: true,
                onSelect: () => void trashEntry(treeContextMenu.entry!)
              }
            ]
          : []),
        {
          type: 'item',
          id: 'sync',
          label: 'Sync now',
          disabled: busy,
          onSelect: () => void syncNow()
        }
      ]
    : []

  return (
    <main
      className="pkms-google-drive-root is-desktop"
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        minHeight: 0
      }}
    >
      <header
        className="pkms-google-drive-header"
        style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: 12 }}
      >
        <div>
          <div className="pkms-google-drive-eyebrow">PKMS</div>
          <p style={{ margin: '4px 0' }}>{status}</p>
        </div>
        {!root && (
          <button
            type="button"
            onClick={() => void connect()}
            disabled={busy || !connection.clientConfigured}
          >
            Connect Google Drive
          </button>
        )}
      </header>
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
            <button key={item.id} disabled={busy} onClick={() => void setConnected(item)}>
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
          className="pkms-google-drive-workspace"
          style={{
            display: 'flex',
            flex: 1,
            minHeight: 0,
            borderTop: '1px solid var(--border-color, #8884)'
          }}
        >
          {treeOpen && (
            <aside
              className="pkms-google-drive-tree"
              aria-label="Google Drive files"
              style={{
                display: 'flex',
                flexDirection: 'column',
                flex: '0 0 260px',
                width: 260,
                minWidth: 180,
                borderRight: '1px solid var(--border-color, #8884)',
                minHeight: 0
              }}
            >
              <div style={{ display: 'flex', gap: 4, padding: 8, flex: '0 0 auto' }}>
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
              {searchOpen ? (
                <div aria-live="polite" style={{ display: 'grid', gap: 2 }}>
                  {searchQuery.trim().length < 2 ? (
                    <span style={{ padding: 8, opacity: 0.65 }}>Type at least 2 characters.</span>
                  ) : searching && !searchResults.length ? (
                    <span style={{ padding: 8, opacity: 0.65 }}>Searching Drive…</span>
                  ) : searchResults.length ? (
                    <>
                      {searchResults.map((entry) => (
                        <button
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
                <div
                  ref={treeScrollRef}
                  style={{ flex: 1, minHeight: 0, overflow: 'auto' }}
                  onScroll={(event) => setTreeScrollTop(event.currentTarget.scrollTop)}
                >
                  <EditorTreeView
                    rootRef={treeRootRef}
                    projection={treeProjection}
                    className="file-list file-tree"
                    ariaLabel="PKMS Google Drive files"
                    emptyContent={
                      <span style={{ padding: 8, opacity: 0.65 }}>This folder is empty.</span>
                    }
                    onRootContextMenu={(event) =>
                      openTreeContextMenu(null, event.clientX, event.clientY)
                    }
                    onContextMenu={(item, event) =>
                      openTreeContextMenu(
                        item.source as GoogleDriveWorkspaceEntry,
                        event.clientX,
                        event.clientY
                      )
                    }
                    onActivate={(item) => {
                      const entry = item.source as GoogleDriveWorkspaceEntry
                      if (entry.kind === 'folder') void toggleFolder(entry)
                      else void openEntry(entry)
                    }}
                  />
                </div>
              )}
              {treeContextMenu && (
                <EditorMenuList
                  ref={treeContextMenuRef}
                  className="tree-context-menu"
                  ariaLabel={
                    treeContextMenu.entry ? `${treeContextMenu.entry.name} actions` : 'PKMS actions'
                  }
                  dangerClassName="danger"
                  items={contextMenuItems}
                  style={{ left: treeContextMenu.x, top: treeContextMenu.y }}
                  onClose={() => setTreeContextMenu(null)}
                />
              )}
            </aside>
          )}
          <div
            className="pkms-google-drive-editor"
            style={{ flex: 1, minWidth: 0, overflow: 'auto' }}
          >
            {session && activeFile ? (
              <EditorMarkdownEditor
                className="pkms-google-drive-markdown"
                title={
                  <div className="editor-title-block">
                    <div className="editor-markdown-title">{markdownTitleFor(activeFile.path)}</div>
                  </div>
                }
                actions={
                  <div className="pkms-google-drive-file-actions">
                    <button type="button" onClick={() => void session.save()} disabled={busy}>
                      Save
                    </button>
                  </div>
                }
                surfaceKey={activeFile.id}
                surfaceProps={{
                  session,
                  documentPath: activeFile.path,
                  documentKey: `pkms-google-drive:${root.id}:${activeFile.id}`,
                  ariaLabel: 'Markdown editor'
                }}
              />
            ) : (
              <div style={{ display: 'grid', placeItems: 'center', height: '100%', opacity: 0.65 }}>
                Select a Markdown file to open it.
              </div>
            )}
          </div>
        </section>
      )}
    </main>
  )
}
