import { useCallback, useEffect, useMemo, useState } from 'react'
import type { EditorDocumentSession, EditorSyncPhase, EditorTreeItem } from '@workspace/editor'
import { EditorMarkdownEditor, markdownTitleFor } from '@workspace/editor'
import {
  DriveAuthenticationRequiredError,
  GoogleDriveClient,
  GoogleDriveOperationLog,
  GoogleDriveWebOAuth,
  GoogleDriveWorkspaceRepository,
  GoogleDriveYjsDocumentStore,
  IndexedDbDriveOutbox,
  IndexedDbGoogleDriveYjsDocumentStorage,
  createGoogleDriveWorkspaceSync,
  type GoogleDriveWorkspaceEntry
} from '@pkms/google-drive'
import './pkms-google-drive.css'

const WORKSPACE_MARKER = 'pkms-google-drive-v1'
const ROOT_STORAGE_KEY = 'pkms-google-drive-root'
const DEFAULT_CLIENT_ID = '130397210046-intlp507spke9u1b659ef1ccp85s270v.apps.googleusercontent.com'

type Connection = { oauth: GoogleDriveWebOAuth; client: GoogleDriveClient }
type WorkspaceRuntime = {
  rootId: string
  repository: GoogleDriveWorkspaceRepository
  documents: GoogleDriveYjsDocumentStore
  sync: ReturnType<typeof createGoogleDriveWorkspaceSync>['engine']
}

function createDocumentSession(
  runtime: WorkspaceRuntime,
  file: GoogleDriveWorkspaceEntry,
  doc: import('yjs').Doc,
  text: import('yjs').Text
): EditorDocumentSession {
  const providerId = `pkms-google-drive:${runtime.rootId}`
  let item: EditorTreeItem = {
    providerId,
    itemId: file.id,
    parentId: null,
    name: file.name,
    path: file.path,
    kind: 'markdown',
    readOnly: false
  }
  const listeners = new Set<(snapshot: ReturnType<EditorDocumentSession['snapshot']>) => void>()
  let phase: 'clean' | 'dirty' | 'saving' | 'conflict' | 'error' = 'clean'
  let syncPhase: EditorSyncPhase = 'synced'
  let message: string | undefined
  let revision = 0
  let localRevision = 0
  let localTransaction = false
  let closed = false
  const snapshot = () => ({
    content: { type: 'text' as const, text: text.toString() },
    revision: `${doc.clientID}:${revision}:${text.length}`,
    savePhase: phase,
    syncPhase,
    ...(message ? { message } : {})
  })
  const emit = () => {
    const current = snapshot()
    listeners.forEach((listener) => listener(current))
  }
  const observe = () => {
    revision += 1
    if (localTransaction) {
      localRevision += 1
      phase = 'dirty'
      syncPhase = 'pending'
      message = undefined
    }
    emit()
  }
  text.observe(observe)

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
    async replaceText(value, baseRevision) {
      if (closed) throw new Error('Document session is closed')
      if (baseRevision !== snapshot().revision) {
        phase = 'conflict'
        message = 'The document changed while this edit was being applied.'
        emit()
        throw new Error(message)
      }
      if (text.toString() === value) return
      localTransaction = true
      try {
        doc.transact(() => {
          if (text.length) text.delete(0, text.length)
          if (value) text.insert(0, value)
        }, 'pkms-google-drive-editor')
      } finally {
        localTransaction = false
      }
    },
    async save() {
      if (closed) throw new Error('Document session is closed')
      const requestedLocalRevision = localRevision
      phase = 'saving'
      syncPhase = 'pending'
      message = undefined
      emit()
      try {
        await runtime.documents.flushLocalDocument(file.id)
        await runtime.sync.sync()
        phase = localRevision === requestedLocalRevision ? 'clean' : 'dirty'
        syncPhase = phase === 'clean' ? 'synced' : 'pending'
      } catch (cause) {
        // Yjs and the outbox have already persisted locally before network sync begins.
        phase = localRevision === requestedLocalRevision ? 'clean' : 'dirty'
        syncPhase = 'blocked'
        message = cause instanceof Error ? cause.message : 'Google Drive sync failed.'
      }
      emit()
      return snapshot()
    },
    async close() {
      closed = true
      text.unobserve(observe)
      listeners.clear()
      await runtime.documents.flushLocalDocument(file.id).catch(() => {})
    }
  }
}

function parentPath(path: string): string {
  const separator = path.lastIndexOf('/')
  return separator < 0 ? '' : path.slice(0, separator)
}

function childPath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name
}

function hasGoogleIdentityServices(): boolean {
  return Boolean((window as Window & { google?: { oauth2?: unknown } }).google?.oauth2)
}

export function meta() {
  return [
    { title: 'PKMS Google Drive' },
    { name: 'description', content: 'PKMS workspace stored in Google Drive.' }
  ]
}

export default function PkmsGoogleDriveRoute(): React.JSX.Element {
  const [googleIdentityReady, setGoogleIdentityReady] = useState(false)
  const [connection, setConnection] = useState<Connection | null>(null)
  const [roots, setRoots] = useState<Array<{ id: string; name: string }>>([])
  const [runtime, setRuntime] = useState<WorkspaceRuntime | null>(null)
  const [entries, setEntries] = useState<GoogleDriveWorkspaceEntry[]>([])
  const [directory, setDirectory] = useState('')
  const [activeFile, setActiveFile] = useState<GoogleDriveWorkspaceEntry | null>(null)
  const [session, setSession] = useState<EditorDocumentSession | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('Not connected')
  const oauthClientId =
    (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || DEFAULT_CLIENT_ID

  useEffect(() => {
    const identityScriptUrl = 'https://accounts.google.com/gsi/client'
    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src="${identityScriptUrl}"]`
    )
    if (hasGoogleIdentityServices()) {
      setGoogleIdentityReady(true)
      return
    }
    const script = existingScript ?? document.createElement('script')
    const handleLoad = () => setGoogleIdentityReady(hasGoogleIdentityServices())
    const handleError = () => setError('Google Identity Services could not be loaded.')
    script.addEventListener('load', handleLoad)
    script.addEventListener('error', handleError)
    if (!existingScript) {
      script.src = identityScriptUrl
      script.async = true
      script.defer = true
      document.head.appendChild(script)
    }
    return () => {
      script.removeEventListener('load', handleLoad)
      script.removeEventListener('error', handleError)
    }
  }, [])

  const connect = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      const oauth = connection?.oauth ?? new GoogleDriveWebOAuth(oauthClientId)
      await oauth.connect()
      const client = connection?.client ?? new GoogleDriveClient({ tokenProvider: oauth })
      setConnection({ oauth, client })
      const pinned = localStorage.getItem(ROOT_STORAGE_KEY)
      if (pinned) {
        try {
          const root = await client.getFile(pinned)
          if (
            root.mimeType === 'application/vnd.google-apps.folder' &&
            root.appProperties?.pkmsWorkspace === WORKSPACE_MARKER
          ) {
            await openWorkspace({ id: root.id, name: root.name }, { oauth, client })
            return
          }
        } catch {
          localStorage.removeItem(ROOT_STORAGE_KEY)
        }
      }
      const found = await client.listFiles({
        query: `mimeType = 'application/vnd.google-apps.folder' and trashed = false and appProperties has { key='pkmsWorkspace' and value='${WORKSPACE_MARKER}' }`,
        pageSize: 100,
        fields: 'id,name,mimeType,appProperties'
      })
      setRoots(found.map(({ id, name }) => ({ id, name })))
      setStatus(
        found.length ? 'Choose a Google Drive workspace' : 'Create a Google Drive workspace'
      )
    } catch (cause) {
      setError(
        cause instanceof DriveAuthenticationRequiredError
          ? 'Google authorization expired. Connect again to continue.'
          : cause instanceof Error
            ? cause.message
            : 'Could not connect to Google Drive.'
      )
      setStatus('Connection needs attention')
    } finally {
      setBusy(false)
    }
  }, [connection, oauthClientId])

  const openWorkspace = useCallback(
    async (root: { id: string; name: string }, connected = connection) => {
      if (!connected) return
      setBusy(true)
      setError('')
      try {
        const repository = new GoogleDriveWorkspaceRepository(connected.client, root.id)
        const outbox = new IndexedDbDriveOutbox()
        const operationLog = new GoogleDriveOperationLog(connected.client, root.id)
        const documents = new GoogleDriveYjsDocumentStore(
          root.id,
          repository,
          operationLog,
          outbox,
          new IndexedDbGoogleDriveYjsDocumentStorage()
        )
        const { engine } = createGoogleDriveWorkspaceSync({
          repository,
          operationLog,
          outbox,
          documents,
          applyAssetReplacement: async () => {
            throw new Error(
              'A binary asset change is pending. This Web integration currently syncs folders and Markdown documents only.'
            )
          }
        })
        const nextRuntime = { rootId: root.id, repository, documents, sync: engine }
        await engine.sync()
        localStorage.setItem(ROOT_STORAGE_KEY, root.id)
        setRuntime(nextRuntime)
        setRoots([])
        setDirectory('')
        setActiveFile(null)
        await session?.close()
        setSession(null)
        setStatus(`Connected to ${root.name}`)
        const nextEntries = await repository.listDirectory('')
        setEntries(nextEntries)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not open this Drive workspace.')
        setStatus('Google Drive sync is waiting')
      } finally {
        setBusy(false)
      }
    },
    [connection, session]
  )

  const refresh = useCallback(async () => {
    if (!runtime) return
    const nextEntries = await runtime.repository.listDirectory(directory)
    setEntries(nextEntries)
    if (activeFile) {
      const latest = nextEntries.find((entry) => entry.id === activeFile.id)
      if (latest) {
        setActiveFile(latest)
        session?.updateItem?.({
          providerId: `pkms-google-drive:${runtime.rootId}`,
          itemId: latest.id,
          parentId: null,
          name: latest.name,
          path: latest.path,
          kind: latest.kind === 'folder' ? 'directory' : 'markdown',
          readOnly: latest.kind !== 'markdown'
        })
      }
    }
  }, [activeFile, directory, runtime, session])

  const syncNow = useCallback(async () => {
    if (!runtime) return
    setBusy(true)
    try {
      const result = await runtime.sync.sync()
      await refresh()
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
  }, [refresh, runtime])

  useEffect(() => {
    if (!runtime) return
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void syncNow()
    }, 15_000)
    return () => window.clearInterval(timer)
  }, [runtime, syncNow])

  const openEntry = useCallback(
    async (entry: GoogleDriveWorkspaceEntry) => {
      if (!runtime) return
      if (entry.kind === 'folder') {
        setDirectory(entry.path)
        setEntries(await runtime.repository.listDirectory(entry.path))
        return
      }
      if (entry.kind !== 'markdown') {
        setError(
          'Attachments are visible in Google Drive but are read-only in this Web integration.'
        )
        return
      }
      setBusy(true)
      setError('')
      try {
        const { doc, text } = await runtime.documents.open(entry.id)
        const next = createDocumentSession(runtime, entry, doc, text)
        await session?.save()
        await session?.close()
        setSession(next)
        setActiveFile(entry)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not open the Markdown file.')
      } finally {
        setBusy(false)
      }
    },
    [runtime, session]
  )

  const createItem = useCallback(
    async (kind: 'folder' | 'markdown') => {
      if (!runtime) return
      const initial = kind === 'markdown' ? 'Untitled.md' : 'New Folder'
      const name = window.prompt(kind === 'markdown' ? 'New Markdown file' : 'New folder', initial)
      if (!name?.trim()) return
      const path = childPath(directory, name.trim())
      setBusy(true)
      try {
        if (kind === 'folder') await runtime.sync.enqueue({ type: 'create-folder', path })
        else
          await runtime.sync.enqueue({
            type: 'create-file',
            path,
            mimeType: 'text/markdown',
            bytes: new TextEncoder().encode('')
          })
        await syncNow()
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not create this item.')
      } finally {
        setBusy(false)
      }
    },
    [directory, runtime, syncNow]
  )

  const renameActive = useCallback(async () => {
    if (!runtime || !activeFile) return
    const name = window.prompt('Rename item', activeFile.name)
    if (!name?.trim() || name.trim() === activeFile.name) return
    setBusy(true)
    try {
      await runtime.sync.enqueue({ type: 'rename', fileId: activeFile.id, name: name.trim() })
      await syncNow()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not rename this item.')
    } finally {
      setBusy(false)
    }
  }, [activeFile, runtime, syncNow])

  const deleteActive = useCallback(async () => {
    if (!runtime || !activeFile) return
    if (!window.confirm(`Move “${activeFile.name}” to Google Drive trash?`)) return
    setBusy(true)
    try {
      await runtime.sync.enqueue({ type: 'trash', fileId: activeFile.id })
      await session?.close()
      setSession(null)
      setActiveFile(null)
      await syncNow()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete this item.')
    } finally {
      setBusy(false)
    }
  }, [activeFile, runtime, session, syncNow])

  const breadcrumb = useMemo(() => (directory ? directory.split('/') : []), [directory])

  return (
    <main className="pkms-google-drive-root">
      <header className="pkms-google-drive-header">
        <div>
          <div className="pkms-google-drive-eyebrow">PKMS Google Drive</div>
          <h1>Google Drive workspace</h1>
          <p>{status}</p>
        </div>
        <div className="pkms-google-drive-controls">
          <button
            type="button"
            onClick={() => void connect()}
            disabled={busy || !googleIdentityReady}
          >
            {!googleIdentityReady
              ? 'Loading Google sign-in…'
              : connection
                ? 'Reconnect Google Drive'
                : 'Connect Google Drive'}
          </button>
          {runtime ? (
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
          ) : null}
        </div>
      </header>

      {error ? (
        <div className="pkms-google-drive-error" role="alert">
          {error}
        </div>
      ) : null}

      {!runtime && roots.length ? (
        <section className="pkms-google-drive-root-picker">
          <h2>Select a PKMS Google Drive workspace</h2>
          {roots.map((root) => (
            <button
              key={root.id}
              type="button"
              disabled={busy}
              onClick={() => void openWorkspace(root)}
            >
              {root.name}
            </button>
          ))}
        </section>
      ) : null}

      {!runtime && connection && !roots.length ? (
        <section className="pkms-google-drive-root-picker">
          <h2>No PKMS Google Drive workspace exists for this account.</h2>
          <p>
            Create a new root to test the direct Drive data path. This does not migrate or modify
            the existing PKMS cloud source.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void (async () => {
                try {
                  const root = await connection.client.createFolder('PKMS', null, {
                    pkmsWorkspace: WORKSPACE_MARKER
                  })
                  await openWorkspace(root)
                } catch (cause) {
                  setError(
                    cause instanceof Error ? cause.message : 'Could not create a Drive root.'
                  )
                }
              })()
            }}
          >
            Create PKMS Drive workspace
          </button>
        </section>
      ) : null}

      {runtime ? (
        <section className="pkms-google-drive-workspace">
          <aside className="pkms-google-drive-tree" aria-label="Google Drive files">
            <div className="pkms-google-drive-breadcrumb">
              <button
                type="button"
                onClick={() => {
                  setDirectory('')
                  void runtime.repository.listDirectory('').then(setEntries)
                }}
              >
                PKMS
              </button>
              {breadcrumb.map((segment, index) => {
                const path = breadcrumb.slice(0, index + 1).join('/')
                return (
                  <button
                    key={path}
                    type="button"
                    onClick={() => {
                      setDirectory(path)
                      void runtime.repository.listDirectory(path).then(setEntries)
                    }}
                  >
                    {segment}
                  </button>
                )
              })}
            </div>
            {directory ? (
              <button
                className="pkms-google-drive-back"
                type="button"
                onClick={() => {
                  const parent = parentPath(directory)
                  setDirectory(parent)
                  void runtime.repository.listDirectory(parent).then(setEntries)
                }}
              >
                ← Parent folder
              </button>
            ) : null}
            <div className="pkms-google-drive-entry-list">
              {entries.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className={activeFile?.id === entry.id ? 'active' : ''}
                  onClick={() => void openEntry(entry)}
                >
                  <span aria-hidden="true">
                    {entry.kind === 'folder' ? '▸' : entry.kind === 'markdown' ? 'M' : '·'}
                  </span>
                  <span>{entry.name}</span>
                </button>
              ))}
              {!entries.length ? (
                <div className="pkms-google-drive-empty">This folder is empty.</div>
              ) : null}
            </div>
          </aside>
          <div className="pkms-google-drive-editor">
            {session && activeFile ? (
              <EditorMarkdownEditor
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
                    <button type="button" onClick={() => void renameActive()} disabled={busy}>
                      Rename
                    </button>
                    <button type="button" onClick={() => void deleteActive()} disabled={busy}>
                      Delete
                    </button>
                  </div>
                }
                surfaceKey={activeFile.id}
                surfaceProps={{
                  session,
                  documentPath: activeFile.path,
                  documentKey: `pkms-google-drive:${runtime.rootId}:${activeFile.id}`,
                  ariaLabel: 'Markdown editor'
                }}
              />
            ) : (
              <div className="pkms-google-drive-editor-empty">
                Select a Markdown file to open it.
              </div>
            )}
          </div>
        </section>
      ) : null}
    </main>
  )
}
