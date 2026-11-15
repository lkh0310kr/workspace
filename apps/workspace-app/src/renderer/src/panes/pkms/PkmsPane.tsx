import { useEffect, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import PkmsClientApp from '@pkms/client/PkmsClientApp'
import pkmsStyles from '@pkms/client/styles.css?inline'
import editorTreeStyles from '@workspace/editor/tree.css?inline'
import editorHostStyles from '@workspace/editor/editorHost.css?inline'
import editorMarkdownStyles from '@workspace/editor/markdown.css?inline'
import editorMarkdownDocumentStyles from '@workspace/editor/markdownDocument.css?inline'
import editorSearchStyles from '@workspace/editor/editorSearch.css?inline'
import googleDriveStyles from '@pkms/google-drive/workspace.css?inline'
import { PkmsGoogleDrivePane } from './PkmsGoogleDrivePane'

export function PkmsPane(): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<'google-drive' | 'existing-pkms'>('google-drive')

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
    const scopedPkmsStyles = pkmsStyles
      .replaceAll(':root', ':host')
      .replace(/(^|,)\s*body(?=\s*[, {])/gm, '$1:host')
    style.textContent = `${scopedPkmsStyles}
${editorTreeStyles.replaceAll(':root', ':host').replace(/(^|,)\s*body(?=\s*[, {])/gm, '$1:host')}
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
    root.render(
      mode === 'google-drive' ? (
        <PkmsGoogleDrivePane />
      ) : (
        <MemoryRouter initialEntries={['/']}>
          <PkmsClientApp />
        </MemoryRouter>
      )
    )

    return () => {
      root.unmount()
      host.remove()
    }
  }, [mode])

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
      <nav
        aria-label="PKMS storage source"
        style={{
          display: 'flex',
          flex: '0 0 34px',
          gap: 4,
          padding: '3px 8px',
          borderBottom: '1px solid var(--border-color, #8884)'
        }}
      >
        <button
          type="button"
          aria-pressed={mode === 'google-drive'}
          onClick={() => setMode('google-drive')}
        >
          Google Drive
        </button>
        <button
          type="button"
          aria-pressed={mode === 'existing-pkms'}
          onClick={() => setMode('existing-pkms')}
        >
          Existing PKMS
        </button>
      </nav>
      <div ref={hostRef} style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden' }} />
    </div>
  )
}
