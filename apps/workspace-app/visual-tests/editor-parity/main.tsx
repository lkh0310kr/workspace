import { useMemo, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import {
  EditorMarkdownEditor,
  EditorMarkdownTitle,
  EditorBreadcrumbs,
  EditorTreeToolbar,
  projectEditorTreeRows,
  type EditorTreeProjection,
  type EditorBreadcrumbEntry
} from '@workspace/editor'
import { TreeView } from '../../src/renderer/src/components/TreeView'
import { PkmsPane } from '../../src/renderer/src/panes/pkms/PkmsPane'
import { FileTreeList } from '../../../../packages/pkms-client/src/components/FileTreeList'
import { flattenTree } from '../../../../packages/pkms-client/src/domain/fileTree'
import type { FileRecord, TreeRow } from '../../../../packages/pkms-client/src/domain/types'
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

- Folder rows keep the common density.
- File rows keep the common selection treatment.
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
const driveEntries: GoogleDriveWorkspaceEntry[] = [driveFolder]

function installMocks() {
  const w = window as any
  w.__openedDriveMarkdownEntries = []
  w.api = {
    fs: {
      listDir: async (_tabId: number, path: string) =>
        path === ''
          ? [{ name: 'Verification', path: 'Verification', isDir: true, isIgnored: false }]
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
                }
              ]
            : [],
      readFile: async () => markdown,
      writeFile: async () => undefined,
      writeFileIfUnchanged: async () => true,
      createDir: async () => undefined,
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
        ? driveEntries
        : parentId === driveFolder.id
          ? [driveNote, driveExtraNote]
          : [],
    openGoogleDriveMarkdown: async (_rootId: string, entryId: string) => {
      w.__openedDriveMarkdownEntries.push(entryId)
      const entry = [driveNote, driveExtraNote].find((candidate) => candidate.id === entryId)
      if (!entry) throw new Error(`Unknown mock Drive entry: ${entryId}`)
      return {
        entry,
        text: entry.id === driveExtraNote.id ? readmeMarkdown : markdown,
        revision: 'mock-r1'
      }
    },
    saveGoogleDriveMarkdown: async () => ({ revision: 'mock-r2', sync: { pendingOperations: 0 } }),
    syncGoogleDriveWorkspace: async () => ({ pendingOperations: 0 }),
    searchGoogleDriveWorkspace: async () => ({ entries: [] }),
    createGoogleDriveItem: async () => driveEntries,
    renameGoogleDriveItem: async () => driveNote,
    trashGoogleDriveItem: async () => undefined,
    disconnectGoogleDriveWorkspace: async () => undefined
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
        surfaceProps={{ value: markdown, extensions: [], ariaLabel: 'Markdown editor' }}
      />
    </div>
  )
}

function DesktopEditor() {
  return (
    <main className="md-pane visual-desktop-shell">
      <aside className="obsidian-explorer visual-tree">
        <TreeView
          tabId={9001}
          rootPath={rootPath}
          explorerStateKey="editor-visual"
          selectedPath="Verification/Codex Drive smoke test.md"
          paneVisible
          explorerModeActive
          onOpenFile={() => undefined}
        />
      </aside>
      <section className="obsidian-editor-shell visual-document">
        <Document />
      </section>
    </main>
  )
}

function DesktopPkms() {
  return <PkmsPane />
}

function WebPkms() {
  const treeRef = useRef<HTMLElement | null>(null)
  const files: FileRecord[] = useMemo(
    () => [
      { id: 'web-folder', path: 'Verification', kind: 'folder', revision: 1 },
      {
        id: 'web-note',
        path: 'Verification/Codex Drive smoke test.md',
        kind: 'markdown',
        revision: 1
      },
      { id: 'web-readme', path: 'Verification/Readme.md', kind: 'markdown', revision: 1 }
    ],
    []
  )
  const rows: TreeRow[] = useMemo(() => flattenTree(files, new Set(['Verification'])), [files])
  const projection: EditorTreeProjection<TreeRow> = useMemo(
    () => projectEditorTreeRows(rows, 0, 800),
    [rows]
  )
  const treeHeader = (
    <EditorTreeToolbar
      title={<span className="eyebrow">Files</span>}
      className="file-toolbar"
      headingClassName="file-toolbar-heading"
      actionsClassName="toolbar-actions"
      status={<button className="sync-compact-state">● GitHub backup</button>}
      actions={
        <>
          <button className="mini-button" title="New note">
            ＋
          </button>
          <button className="mini-button" title="New folder">
            ▰
          </button>
        </>
      }
    />
  )
  return (
    <main className="app-shell visual-web-shell">
      <aside className="sidebar">
        <div className="workspace-select">
          <div className="workspace-heading">
            <span className="eyebrow">Workspace</span>
            <button className="icon-button">＋</button>
          </div>
          <button className="connect-link">codex / drive-smoke-test</button>
        </div>
        <FileTreeList
          header={treeHeader}
          treeRef={treeRef}
          projection={projection}
          selectedPaths={new Set(['Verification/Codex Drive smoke test.md'])}
          expandedFolders={new Set(['Verification'])}
          focusedPath="Verification/Codex Drive smoke test.md"
          currentFolder=""
          activeFileId="web-note"
          cutPaths={new Set()}
          dropTarget={null}
          loadingFolders={new Set()}
          busy={false}
          loading={false}
          canMove={false}
          canMultiSelect={false}
          onKeyDown={() => undefined}
          onScroll={() => undefined}
          onSetDropTarget={() => undefined}
          onDropItems={() => undefined}
          onFocusPath={() => undefined}
          onContextMenu={() => undefined}
          onSelectRow={() => undefined}
          onClearSelection={() => undefined}
          onActivate={() => undefined}
        />
      </aside>
      <section className="main-panel visual-document">
        <Document />
      </section>
    </main>
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
