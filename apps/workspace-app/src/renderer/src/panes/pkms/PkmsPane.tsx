import { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import editorTreeStyles from '@workspace/editor/tree.css?inline'
import editorTreeViewStyles from '@workspace/editor/treeView.module.css?inline'
import editorHostStyles from '@workspace/editor/editorHost.css?inline'
import editorMarkdownStyles from '@workspace/editor/markdown.css?inline'
import editorMarkdownDocumentStyles from '@workspace/editor/markdownDocument.module.css?inline'
import editorSearchStyles from '@workspace/editor/editorSearch.css?inline'
import googleDriveStyles from '@pkms/google-drive/workspace.module.css?inline'
import { PkmsGoogleDrivePane } from './PkmsGoogleDrivePane'
import { onFindInFilesShortcut, onToggleExplorerShortcut } from '../../electron'
import { isExplorerToggleShortcut } from '../../explorer/explorerShortcuts'

interface PkmsPaneProps {
  paneVisible?: boolean
  active?: boolean
  groupFocused?: boolean
}

export function PkmsPane({
  paneVisible = true,
  active = true,
  groupFocused = true
}: PkmsPaneProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const innerRootRef = useRef<Root | null>(null)
  const [treeOpen, setTreeOpen] = useState(true)
  const [searchRequest, setSearchRequest] = useState(0)
  const lastTreeToggleAt = useRef(0)

  const toggleDriveTree = useCallback(() => {
    const now = Date.now()
    if (now - lastTreeToggleAt.current < 180) return
    lastTreeToggleAt.current = now
    setTreeOpen((open) => !open)
  }, [])

  useEffect(() => {
    return onToggleExplorerShortcut(() => {
      if (!paneVisible || !active || !groupFocused) return
      toggleDriveTree()
    })
  }, [paneVisible, active, groupFocused, toggleDriveTree])

  useEffect(() => {
    return onFindInFilesShortcut(() => {
      if (!paneVisible || !active || !groupFocused) return
      setTreeOpen(true)
      setSearchRequest((request) => request + 1)
    })
  }, [paneVisible, active, groupFocused])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isExplorerToggleShortcut(event)) return
      if (!paneVisible || !active || !groupFocused) return
      event.preventDefault()
      event.stopImmediatePropagation()
      toggleDriveTree()
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [paneVisible, active, groupFocused, toggleDriveTree])

  useEffect(() => {
    const container = hostRef.current
    if (!container) return

    // Give every effect mount a fresh host. React StrictMode and Fast Refresh can
    // replay effects on the same outer element, which cannot accept a second root.
    const mountContainer: HTMLElement | ShadowRoot = container.shadowRoot ?? container
    const host = document.createElement('div')
    host.className = 'pkms-pane-shadow-host'
    mountContainer.replaceChildren(host)
    const shadow = host.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = `${editorTreeStyles.replaceAll(':root', ':host').replace(/(^|,)\s*body(?=\s*[, {])/gm, '$1:host')}
${editorTreeViewStyles.replaceAll(':root', ':host')}
${editorHostStyles}
${editorMarkdownStyles}
${editorMarkdownDocumentStyles}
${editorSearchStyles}
${googleDriveStyles}
:host { display: block; width: 100%; height: 100%; min-width: 0; min-height: 0; overflow: hidden; }
.pkms-root { width: 100%; height: 100%; min-width: 0; min-height: 0; }
/* The client sizes itself to the window (100dvh); inside a pane it must fill the pane so the tree can scroll. */
.app-shell { height: 100%; }
.welcome-screen, .loading-screen { min-height: 100%; }`
    const mount = document.createElement('div')
    mount.className = 'pkms-root'
    shadow.append(style, mount)

    const root: Root = createRoot(mount)
    innerRootRef.current = root

    return () => {
      innerRootRef.current = null
      root.unmount()
      host.remove()
    }
  }, [])

  useEffect(() => {
    innerRootRef.current?.render(
      <PkmsGoogleDrivePane treeOpen={treeOpen} searchRequest={searchRequest} />
    )
  }, [treeOpen, searchRequest])

  return (
    <div
      className="pkms-pane-host"
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        minWidth: 0,
        minHeight: 0,
        overflow: 'hidden'
      }}
    >
      <div ref={hostRef} style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden' }} />
    </div>
  )
}
