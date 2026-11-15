import { useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import {
  EditorMarkdownEditor,
  EditorMarkdownTitle,
  EditorBreadcrumbs,
  editorCodeMirrorHostExtensions,
  editorMarkdownParserExtensions,
  type EditorBreadcrumbEntry
} from '@workspace/editor'
import { TreeView } from '../../src/renderer/src/components/TreeView'
import { EditorContent } from '../../src/renderer/src/panes/EditorContent'
import { PkmsPane } from '../../src/renderer/src/panes/pkms/PkmsPane'
import PkmsClientApp from '../../../../packages/pkms-client/src/PkmsClientApp'
import type { GoogleDriveWorkspaceEntry } from '../../../../packages/pkms-google-drive/src/workspaceRepository'
import '@workspace/editor/tree.css'
import '../../../../packages/editor/src/editorHost.css'
import '../../../../packages/editor/src/markdown.css'
import '../../../../packages/editor/src/markdownDocument.css'
import '../../../../packages/pkms-client/src/styles.css'
import '../../src/renderer/src/assets/styles.css'
import './visual-fixture.css'

const rootPath = '/editor-visual-fixture'
const markdown = `# Live Drive verification

This shared fixture checks the document column against the filename title.

[[Readme|sibling note]] and [external link](https://example.test).

| Host | Tree |
| --- | --- |
| Desktop | Shared |
| Web | Shared |

$$x^2 + y^2 = z^2$$

\`\`\`typescript
const sharedEditor = true
\`\`\`

\`\`\`mermaid
flowchart LR
  Desktop --> Shared
  Web --> Shared
\`\`\`

<div><strong>HTML preview</strong></div>
`
const readmeMarkdown = '# Readme preview\n\nOpened from the shared breadcrumb menu.\n'

const driveRoot = {
  id: 'mock-drive-root',
  name: 'Codex Drive',
  mimeType: 'application/vnd.google-apps.folder'
}
const driveFolder: GoogleDriveWorkspaceEntry = {
  id: 'mock-verification-folder',
  name: 'Verification',
  mimeType: 'application/vnd.google-apps.folder',
  parents: [driveRoot.id],
  path: 'Verification',
  kind: 'folder'
}
const driveNote: GoogleDriveWorkspaceEntry = {
  id: 'mock-markdown-file',
  name: 'Codex Drive smoke test.md',
  mimeType: 'text/markdown',
  parents: [driveFolder.id],
  path: 'Verification/Codex Drive smoke test.md',
  kind: 'markdown'
}
const driveExtraNote: GoogleDriveWorkspaceEntry = {
  id: 'mock-readme-file',
  name: 'Readme.md',
  mimeType: 'text/markdown',
  parents: [driveFolder.id],
  path: 'Verification/Readme.md',
  kind: 'markdown'
}
const driveHiddenFolder: GoogleDriveWorkspaceEntry = {
  id: 'mock-hidden-folder',
  name: 'Hidden',
  mimeType: 'application/vnd.google-apps.folder',
  parents: [driveFolder.id],
  path: 'Verification/Hidden',
  kind: 'folder'
}
const driveDeepNote: GoogleDriveWorkspaceEntry = {
  id: 'mock-deep-note',
  name: 'Deep Note.md',
  mimeType: 'text/markdown',
  parents: [driveHiddenFolder.id],
  path: 'Verification/Hidden/Deep Note.md',
  kind: 'markdown'
}
const driveTreeStressEntries: GoogleDriveWorkspaceEntry[] = Array.from(
  { length: 64 },
  (_, index) => {
    const name = `Row ${String(index).padStart(3, '0')}.md`
    return {
      id: `mock-tree-row-${index}`,
      name,
      mimeType: 'text/markdown',
      parents: [driveFolder.id],
      path: `Verification/${name}`,
      kind: 'markdown'
    }
  }
)
const driveEntries: GoogleDriveWorkspaceEntry[] = [driveFolder]
const driveCreatedNotes: GoogleDriveWorkspaceEntry[] = []
const driveRenamedEntries = new Map<string, GoogleDriveWorkspaceEntry>()
const currentDriveEntry = (entry: GoogleDriveWorkspaceEntry) =>
  driveRenamedEntries.get(entry.id) ?? entry
const isTreeStressScenario =
  new URLSearchParams(window.location.search).get('scenario') === 'tree-overflow'
const isMissingWikiScenario =
  new URLSearchParams(window.location.search).get('scenario') === 'missing-wikilink'
const isQuickOpenNestedScenario =
  new URLSearchParams(window.location.search).get('scenario') === 'quick-open-nested'
const isViewStateScenario =
  new URLSearchParams(window.location.search).get('scenario') === 'view-state'
const longMarkdown = `${markdown}\n${Array.from(
  { length: 90 },
  (_, index) => `View state paragraph ${String(index + 1).padStart(2, '0')}.`
).join('\n\n')}\n`
const editorMarkdownFixture = isMissingWikiScenario
  ? `${markdown}\n[[Fresh Note]]\n`
  : isViewStateScenario
    ? longMarkdown
    : markdown

function installMocks() {
  const w = window as any
  const createdLocalItems: Array<{ name: string; path: string; isDir: boolean }> = []
  const localFileContents = new Map([
    ['Verification/Codex Drive smoke test.md', editorMarkdownFixture],
    ['Verification/Readme.md', readmeMarkdown]
  ])
  const localChildren = (parent: string) =>
    createdLocalItems
      .filter(
        (item) =>
          (item.path.includes('/') ? item.path.slice(0, item.path.lastIndexOf('/')) : '') === parent
      )
      .map((item) => ({ ...item, isIgnored: false }))
  w.__openedDriveMarkdownEntries = []
  w.__savedDriveMarkdown = []
  w.__createdPkmsPaths = []
  w.__createdDrivePaths = []
  w.__createdLocalPaths = []
  w.__readLocalPaths = []
  w.__renamedPkmsPaths = []
  w.__renamedDriveItems = []
  w.api = {
    fs: {
      listDir: async (_tabId: number, path: string) =>
        path === ''
          ? [
              { name: 'Verification', path: 'Verification', isDir: true, isIgnored: false },
              ...localChildren('')
            ]
          : path === 'Verification'
            ? [
                {
                  name: 'Codex Drive smoke test.md',
                  path: 'Verification/Codex Drive smoke test.md',
                  isDir: false,
                  isIgnored: false
                },
                {
                  name: 'Readme.md',
                  path: 'Verification/Readme.md',
                  isDir: false,
                  isIgnored: false
                },
                ...localChildren('Verification')
              ]
            : [],
      readFile: async (_tabId: number, path: string) => {
        w.__readLocalPaths.push(path)
        return localFileContents.get(path) ?? ''
      },
      writeFile: async (_tabId: number, path: string, contents: string) => {
        createdLocalItems.push({ name: path.split('/').at(-1) ?? path, path, isDir: false })
        localFileContents.set(path, contents)
        w.__createdLocalPaths.push(path)
      },
      writeFileIfUnchanged: async (
        _tabId: number,
        path: string,
        _expected: string,
        contents: string
      ) => {
        localFileContents.set(path, contents)
        return true
      },
      createDir: async (_tabId: number, path: string) => {
        createdLocalItems.push({ name: path.split('/').at(-1) ?? path, path, isDir: true })
        w.__createdLocalPaths.push(path)
      },
      deletePath: async () => undefined,
      renamePath: async () => undefined,
      onChanged: () => () => undefined,
      listAllFiles: async () => ['Verification/Codex Drive smoke test.md'],
      searchInFiles: () => undefined,
      searchCancel: () => undefined,
      onSearchResult: () => () => undefined,
      onSearchDone: () => () => undefined
    },
    shortcuts: {
      onFindInEditor: () => () => undefined,
      onToggleExplorer: () => () => undefined,
      onFindInFiles: () => () => undefined
    }
  }
  w.pkmsDesktop = {
    googleDriveOAuthStatus: async () => ({ credentialStored: true, clientConfigured: true }),
    listGoogleDriveWorkspaces: async () => [driveRoot],
    connectGoogleDriveWorkspace: async () => ({ root: driveRoot, entries: driveEntries }),
    listGoogleDriveDirectory: async (_rootId: string, parentId: string | null) =>
      parentId === null || parentId === driveRoot.id
        ? [
            ...driveEntries.map(currentDriveEntry),
            ...driveCreatedNotes.filter((entry) => entry.parents?.[0] === driveRoot.id)
          ]
        : parentId === driveFolder.id
          ? isTreeStressScenario
            ? [
                currentDriveEntry(driveNote),
                currentDriveEntry(driveExtraNote),
                ...driveTreeStressEntries
              ]
            : [
                currentDriveEntry(driveNote),
                currentDriveEntry(driveExtraNote),
                ...(isQuickOpenNestedScenario ? [driveHiddenFolder] : []),
                ...driveCreatedNotes.filter((entry) => entry.parents?.[0] === driveFolder.id)
              ]
          : parentId === driveHiddenFolder.id && isQuickOpenNestedScenario
            ? [driveDeepNote]
            : [],
    openGoogleDriveMarkdown: async (_rootId: string, entryId: string) => {
      w.__openedDriveMarkdownEntries.push(entryId)
      const entry = [driveNote, driveExtraNote, driveDeepNote, ...driveCreatedNotes].find(
        (candidate) => candidate.id === entryId
      )
      if (!entry) throw new Error(`Unknown mock Drive entry: ${entryId}`)
      return {
        entry: currentDriveEntry(entry),
        text:
          entry.id === driveExtraNote.id
            ? readmeMarkdown
            : entry.id === driveDeepNote.id
              ? '# Deep Note preview\n'
              : driveCreatedNotes.some((candidate) => candidate.id === entry.id)
                ? '# Untitled\n\n'
                : editorMarkdownFixture,
        revision: 'mock-r1'
      }
    },
    saveGoogleDriveMarkdown: async (_rootId: string, entryId: string, text: string) => {
      w.__savedDriveMarkdown.push({ entryId, text })
      return { revision: 'mock-r2', sync: { pendingOperations: 0 } }
    },
    syncGoogleDriveWorkspace: async () => ({ pendingOperations: 0 }),
    searchGoogleDriveWorkspace: async (_rootId: string, query: string) => ({
      entries: [
        driveNote,
        driveExtraNote,
        ...(isQuickOpenNestedScenario ? [driveDeepNote] : [])
      ].filter((entry) => entry.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
    }),
    createGoogleDriveItem: async (
      _rootId: string,
      parentId: string,
      kind: string,
      name: string
    ) => {
      const parent = parentId ? [driveFolder].find((entry) => entry.id === parentId) : null
      const entry: GoogleDriveWorkspaceEntry = {
        id: `mock-drive-created-${driveCreatedNotes.length + 1}`,
        name,
        mimeType: kind === 'folder' ? 'application/vnd.google-apps.folder' : 'text/markdown',
        parents: [parent?.id ?? driveRoot.id],
        path: [parent?.path, name].filter(Boolean).join('/'),
        kind: kind === 'folder' ? 'folder' : 'markdown'
      }
      driveCreatedNotes.push(entry)
      w.__createdDrivePaths.push(entry.path)
      return parent ? [driveNote, driveExtraNote, entry] : [...driveEntries, entry]
    },
    renameGoogleDriveItem: async (_rootId: string, entryId: string, name: string) => {
      const entry = [driveFolder, driveNote, driveExtraNote, ...driveCreatedNotes].find(
        (candidate) => candidate.id === entryId
      )
      if (!entry) throw new Error(`Unknown mock Drive entry: ${entryId}`)
      const parent = [driveFolder].find((candidate) => candidate.id === entry.parents?.[0])
      const renamed = {
        ...entry,
        name,
        path: [parent?.path, name].filter(Boolean).join('/')
      }
      driveRenamedEntries.set(entryId, renamed)
      w.__renamedDriveItems.push(renamed)
      return renamed
    },
    trashGoogleDriveItem: async () => undefined,
    disconnectGoogleDriveWorkspace: async () => undefined
  }
  const workspace = {
    id: 'visual-workspace',
    repository: 'codex / drive-smoke-test',
    branch: 'main',
    revision: 1,
    githubStatus: 'synced'
  }
  const pkmsFiles = [
    { id: 'web-folder', path: 'Verification', kind: 'folder', revision: 1 },
    {
      id: 'web-note',
      path: 'Verification/Codex Drive smoke test.md',
      kind: 'markdown',
      content: editorMarkdownFixture,
      revision: 1
    },
    {
      id: 'web-readme',
      path: 'Verification/Readme.md',
      kind: 'markdown',
      content: readmeMarkdown,
      revision: 1
    },
    ...(isQuickOpenNestedScenario
      ? [
          {
            id: 'web-hidden-folder',
            path: 'Verification/Hidden',
            kind: 'folder',
            revision: 1
          },
          {
            id: 'web-deep-note',
            path: 'Verification/Hidden/Deep Note.md',
            kind: 'markdown',
            content: '# Deep Note preview\n',
            revision: 1
          }
        ]
      : [])
  ]
  const originalFetch = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      window.location.href
    )
    const path = url.pathname
    const json = (value: unknown, status = 200) =>
      new Response(JSON.stringify(value), {
        status,
        headers: { 'Content-Type': 'application/json' }
      })
    if (path === '/api/session') return json({ user: { login: 'codex' } })
    if (path === '/api/workspaces') return json({ workspaces: [workspace] })
    if (path === `/api/workspaces/${workspace.id}/directory`) {
      const directory = url.searchParams.get('path') ?? ''
      return json({
        files: pkmsFiles.filter((file) => {
          const parent = file.path.includes('/')
            ? file.path.slice(0, file.path.lastIndexOf('/'))
            : ''
          return parent === directory
        })
      })
    }
    if (path === `/api/workspaces/${workspace.id}/operations` && init?.method === 'POST') {
      const body = JSON.parse(String(init.body ?? '{}')) as {
        operation?: {
          type?: string
          path?: string
          toPath?: string
          fileId?: string
          content?: string
        }
      }
      const operation = body.operation
      if (operation?.type === 'create-file' && operation.path && operation.fileId) {
        w.__createdPkmsPaths.push(operation.path)
        pkmsFiles.push({
          id: operation.fileId,
          path: operation.path,
          kind: 'markdown',
          content: operation.content ?? '',
          revision: 0
        })
      }
      if (operation?.type === 'create-folder' && operation.path) {
        w.__createdPkmsPaths.push(operation.path)
        pkmsFiles.push({
          id: `web-created-folder-${pkmsFiles.length}`,
          path: operation.path,
          kind: 'folder',
          revision: 0
        })
      }
      if (operation?.type === 'move' && operation.toPath && operation.fileId) {
        const source = pkmsFiles.find((file) => file.id === operation.fileId)
        if (source) {
          const previousPath = source.path
          for (const file of pkmsFiles) {
            if (file.path === previousPath || file.path.startsWith(`${previousPath}/`))
              file.path = `${operation.toPath}${file.path.slice(previousPath.length)}`
          }
          w.__renamedPkmsPaths.push(operation.toPath)
        }
      }
      return json({ acceptedRevision: workspace.revision + 1 })
    }
    if (path === `/api/workspaces/${workspace.id}/sync-status`)
      return json({ serverRevision: 1, githubStatus: 'synced', pendingFiles: 0 })
    if (path === `/api/workspaces/${workspace.id}/flush`)
      return json({ serverRevision: 1, githubStatus: 'synced', pendingFiles: 0 })
    const fileMatch = path.match(new RegExp(`^/api/workspaces/${workspace.id}/files/([^/]+)$`))
    if (fileMatch) {
      const file = pkmsFiles.find((candidate) => candidate.id === decodeURIComponent(fileMatch[1]))
      return file ? json(file) : json({ error: 'not_found' }, 404)
    }
    if (path === '/api/realtime/config')
      return json({
        url: 'ws://127.0.0.1:4179/visual-realtime',
        anonKey: 'visual-test',
        issuer: 'visual-test'
      })
    if (path === '/api/realtime/token')
      return json({
        token:
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ2aXN1YWwtdGVzdCIsInN1YiI6InZpc3VhbCIsInJvbGUiOiJhbm9uIiwiYXBwX21ldGFkYXRhIjp7ImdpdGh1Yl9sb2dpbiI6ImNvZGV4In19.signature'
      })
    if (path.endsWith('/diagnostics/realtime')) return new Response(null, { status: 204 })
    if (path.endsWith('/updates')) return json({ update: '' })
    if (init?.method === 'POST' || init?.method === 'PUT' || init?.method === 'DELETE')
      return new Response(null, { status: 204 })
    if (path.startsWith('/api/')) return json({ error: `Unmocked visual API: ${path}` }, 404)
    return originalFetch(input, init)
  }
  localStorage.setItem('workspace.explorerRoot.editor-visual', rootPath)
  localStorage.setItem('workspace.explorerExpanded.editor-visual', JSON.stringify(['Verification']))
}

function Document() {
  const inputRef = useRef<HTMLInputElement | null>(null)
  return (
    <div className="visual-markdown-host">
      <EditorBreadcrumbs
        path="Verification/Codex Drive smoke test.md"
        onLoadChildren={async (directoryPath): Promise<EditorBreadcrumbEntry[]> => {
          if (directoryPath === '')
            return [{ name: 'Verification', path: 'Verification', kind: 'directory' }]
          if (directoryPath !== 'Verification') return []
          return [
            {
              name: 'Codex Drive smoke test.md',
              path: 'Verification/Codex Drive smoke test.md',
              kind: 'markdown'
            },
            { name: 'Readme.md', path: 'Verification/Readme.md', kind: 'markdown' }
          ]
        }}
        onOpenFile={() => undefined}
      />
      <EditorMarkdownEditor
        title={
          <EditorMarkdownTitle
            path="Verification/Codex Drive smoke test.md"
            title="Codex Drive smoke test"
            editing={false}
            draft="Codex Drive smoke test"
            error={null}
            inputRef={inputRef}
            onChange={() => undefined}
            onCommit={() => undefined}
            onCancel={() => undefined}
          />
        }
        surfaceProps={{
          value: editorMarkdownFixture,
          documentKey: `visual:desktop-editor:verification-note:${isViewStateScenario ? 'view-state' : 'parity'}`,
          viewStateStorage: window.localStorage,
          parserExtensions: editorMarkdownParserExtensions,
          extensions: editorCodeMirrorHostExtensions,
          ariaLabel: 'Markdown editor'
        }}
      />
    </div>
  )
}

function DesktopEditor() {
  const providerBacked = isMissingWikiScenario
  const [filePath, setFilePath] = useState<string | null>('Verification/Codex Drive smoke test.md')
  return (
    <main className="md-pane visual-desktop-shell">
      <aside className="obsidian-explorer visual-tree">
        <TreeView
          tabId={9001}
          rootPath={rootPath}
          explorerStateKey="editor-visual"
          selectedPath={filePath}
          paneVisible
          explorerModeActive
          onOpenFile={(path) => setFilePath(path)}
        />
      </aside>
      <section className="obsidian-editor-shell visual-document">
        {providerBacked ? (
          <EditorContent
            tabId={9001}
            rootPath={rootPath}
            filePath={filePath}
            kind="markdown"
            zoom={1}
            onOpenFile={(path) => setFilePath(path)}
            onAssignPath={setFilePath}
            onDirtyChange={() => undefined}
          />
        ) : (
          <Document />
        )}
      </section>
    </main>
  )
}

function DesktopPkms() {
  return <PkmsPane />
}

function WebPkms() {
  // Desktop and Drive hosts share this fixture, but the real Web client must
  // exercise its fetch transport instead of the desktop preload bridge.
  delete (window as Window & { pkmsDesktop?: unknown }).pkmsDesktop
  return (
    <MemoryRouter>
      <PkmsClientApp />
    </MemoryRouter>
  )
}

function Fixture() {
  const host = new URLSearchParams(window.location.search).get('host') ?? 'desktop-editor'
  document.documentElement.dataset.visualHost = host
  if (host === 'desktop-pkms-editor') return <DesktopPkms />
  if (host === 'web-pkms-editor') return <WebPkms />
  return <DesktopEditor />
}

installMocks()
createRoot(document.getElementById('root')!).render(<Fixture />)
