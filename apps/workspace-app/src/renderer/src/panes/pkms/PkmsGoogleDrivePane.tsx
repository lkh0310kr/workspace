import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  EditorMarkdownEditor,
  markdownTitleFor,
  type EditorDocumentSession,
  type EditorSyncPhase,
  type EditorTreeItem
} from '@workspace/editor'
import type { GoogleDriveWorkspaceEntry } from '@pkms/google-drive'

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
    async save() {
      if (closed) throw new Error('Document session is closed')
      const requestedRevision = localRevision
      phase = 'saving'
      syncPhase = 'pending'
      message = undefined
      emit()
      try {
        const result = await window.pkmsDesktop.saveGoogleDriveMarkdown(rootId, file.id, content)
        revision = result.revision
        phase = localRevision === requestedRevision ? 'clean' : 'dirty'
        syncPhase = result.sync.pendingOperations ? 'pending' : 'synced'
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

export function PkmsGoogleDrivePane(): React.JSX.Element {
  const [connection, setConnection] = useState({ credentialStored: false, clientConfigured: false })
  const [roots, setRoots] = useState<RootOption[]>([])
  const [root, setRoot] = useState<RootOption | null>(null)
  const [entries, setEntries] = useState<GoogleDriveWorkspaceEntry[]>([])
  const [directory, setDirectory] = useState({
    id: null as string | null,
    path: '',
    ancestors: [] as Array<{ id: string | null; path: string; name: string }>
  })
  const [activeFile, setActiveFile] = useState<GoogleDriveWorkspaceEntry | null>(null)
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
        setEntries(result.entries)
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
    setEntries(await window.pkmsDesktop.listGoogleDriveDirectory(root.id, directory.id))
  }, [directory.id, root])

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
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void syncNow()
    }, 15_000)
    return () => window.clearInterval(timer)
  }, [root, syncNow])

  const openEntry = useCallback(
    async (entry: GoogleDriveWorkspaceEntry) => {
      if (!root) return
      if (entry.kind === 'folder') {
        setDirectory((current) => ({
          id: entry.id,
          path: entry.path,
          ancestors: [
            ...current.ancestors,
            { id: current.id, path: current.path, name: current.path.split('/').at(-1) || 'PKMS' }
          ]
        }))
        setEntries(await window.pkmsDesktop.listGoogleDriveDirectory(root.id, entry.id))
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
    [root, session]
  )

  const createItem = useCallback(
    async (kind: 'markdown' | 'folder') => {
      if (!root) return
      const initialName = kind === 'markdown' ? 'Untitled.md' : 'New Folder'
      const name = window.prompt(
        kind === 'markdown' ? 'New Markdown file' : 'New folder',
        initialName
      )
      if (!name?.trim()) return
      setBusy(true)
      try {
        const path = directory.path ? `${directory.path}/${name.trim()}` : name.trim()
        setEntries(
          await window.pkmsDesktop.createGoogleDriveItem(root.id, directory.path, kind, name.trim())
        )
        setStatus(`Created ${path}`)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not create the item.')
      } finally {
        setBusy(false)
      }
    },
    [directory.path, root]
  )

  const renameActive = useCallback(async () => {
    if (!root || !activeFile) return
    const name = window.prompt('Rename item', activeFile.name)
    if (!name?.trim() || name.trim() === activeFile.name) return
    setBusy(true)
    try {
      const renamed = await window.pkmsDesktop.renameGoogleDriveItem(
        root.id,
        activeFile.id,
        name.trim()
      )
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
      await refreshDirectory()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not rename the item.')
    } finally {
      setBusy(false)
    }
  }, [activeFile, refreshDirectory, root, session])

  const trashActive = useCallback(async () => {
    if (!root || !activeFile || !window.confirm(`Move “${activeFile.name}” to Google Drive trash?`))
      return
    setBusy(true)
    try {
      await window.pkmsDesktop.trashGoogleDriveItem(root.id, activeFile.id)
      await session?.close()
      setSession(null)
      setActiveFile(null)
      await refreshDirectory()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not trash the item.')
    } finally {
      setBusy(false)
    }
  }, [activeFile, refreshDirectory, root, session])

  const breadcrumbs = useMemo(
    () => [
      { id: null, path: '', name: 'PKMS' },
      ...directory.ancestors.filter((crumb) => crumb.path),
      ...(directory.path
        ? [{ id: directory.id, path: directory.path, name: directory.path.split('/').at(-1)! }]
        : [])
    ],
    [directory.ancestors, directory.id, directory.path]
  )

  return (
    <main
      className="pkms-google-drive-root"
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
          <div className="pkms-google-drive-eyebrow">PKMS Google Drive</div>
          <p style={{ margin: '4px 0' }}>{status}</p>
        </div>
        <div
          className="pkms-google-drive-controls"
          style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}
        >
          {!root && (
            <button
              type="button"
              onClick={() => void connect()}
              disabled={busy || !connection.clientConfigured}
            >
              Connect Google Drive
            </button>
          )}
          {root && (
            <>
              <button type="button" onClick={() => void createItem('markdown')} disabled={busy}>
                New note
              </button>
              <button type="button" onClick={() => void createItem('folder')} disabled={busy}>
                New folder
              </button>
              <button type="button" onClick={() => void syncNow()} disabled={busy}>
                Sync now
              </button>
            </>
          )}
        </div>
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
          style={{
            display: 'flex',
            flex: 1,
            minHeight: 0,
            borderTop: '1px solid var(--border-color, #8884)'
          }}
        >
          <aside
            aria-label="Google Drive files"
            style={{
              width: 260,
              minWidth: 180,
              overflow: 'auto',
              borderRight: '1px solid var(--border-color, #8884)',
              padding: 8
            }}
          >
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
              {breadcrumbs.map((crumb, index) => {
                const ancestors = directory.ancestors.slice(0, index)
                return (
                  <button
                    key={`${index}:${crumb.path}`}
                    type="button"
                    onClick={() => {
                      setDirectory({ id: crumb.id, path: crumb.path, ancestors })
                      void window.pkmsDesktop
                        .listGoogleDriveDirectory(root.id, crumb.id)
                        .then(setEntries)
                    }}
                  >
                    {crumb.name}
                  </button>
                )
              })}
            </div>
            {directory.path && (
              <button
                type="button"
                onClick={() => {
                  const parent = directory.ancestors.at(-1) ?? { id: null, path: '', name: 'PKMS' }
                  setDirectory({
                    id: parent.id,
                    path: parent.path,
                    ancestors: directory.ancestors.slice(0, -1)
                  })
                  void window.pkmsDesktop
                    .listGoogleDriveDirectory(root.id, parent.id)
                    .then(setEntries)
                }}
              >
                ← Parent folder
              </button>
            )}
            <div style={{ display: 'grid', gap: 2, marginTop: 8 }}>
              {entries.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  aria-current={activeFile?.id === entry.id ? 'page' : undefined}
                  onClick={() => void openEntry(entry)}
                  style={{ display: 'flex', gap: 8, textAlign: 'left', padding: '7px 8px' }}
                >
                  <span aria-hidden="true">
                    {entry.kind === 'folder' ? '▸' : entry.kind === 'markdown' ? 'M' : '·'}
                  </span>
                  <span>{entry.name}</span>
                </button>
              ))}
              {!entries.length && (
                <span style={{ padding: 8, opacity: 0.65 }}>This folder is empty.</span>
              )}
            </div>
          </aside>
          <div style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
            {session && activeFile ? (
              <EditorMarkdownEditor
                title={
                  <div className="editor-title-block">
                    <div className="editor-markdown-title">{markdownTitleFor(activeFile.path)}</div>
                  </div>
                }
                actions={
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" onClick={() => void session.save()} disabled={busy}>
                      Save
                    </button>
                    <button type="button" onClick={() => void renameActive()} disabled={busy}>
                      Rename
                    </button>
                    <button type="button" onClick={() => void trashActive()} disabled={busy}>
                      Delete
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
