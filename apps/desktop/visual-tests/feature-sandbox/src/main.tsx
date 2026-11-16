import { useMemo, useState } from 'react'
import type { JSX } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserPaneKind } from '@workspace/browser'
import type { BrowserPaneItem } from '@workspace/browser'
import { HomeView } from '@workspace/home'
import { createTerminalPaneKind } from '@workspace/terminal'
import type { TerminalPaneHost } from '@workspace/terminal'
import { createMemoryBrowserHost } from './mockBrowserHost'
import { createMemoryTerminalHost } from './mockTerminalHost'
import './styles.css'

type Surface = 'home' | 'browser' | 'terminal'
type BrowserItem = BrowserPaneItem & { kind: 'browser' }
type TerminalItem = {
  id: string
  kind: 'terminal'
  terminalId: number
  title?: string
}

const hostSummary = async () => ({
  hostname: 'sandbox-machine',
  platform: 'Sandbox OS',
  release: '0.1',
  arch: 'x64',
  cpuPercent: 12,
  cpuCores: 8,
  memoryTotal: 16_000_000_000,
  memoryAvailable: 9_000_000_000,
  diskTotal: 512_000_000_000,
  diskAvailable: 240_000_000_000,
  uptimeSeconds: 4_200
})

function FeatureSandbox(): JSX.Element {
  const [surface, setSurface] = useState<Surface>('home')
  const [browserItem, setBrowserItem] = useState<BrowserItem>({
    id: 'sandbox-browser',
    kind: 'browser',
    url: 'https://workspace.local/sandbox'
  })
  const [terminalItem, setTerminalItem] = useState<TerminalItem | null>(null)
  const [terminalHost] = useState<TerminalPaneHost>(() => createMemoryTerminalHost())
  const [browserHost] = useState(() => createMemoryBrowserHost())
  const browserKind = useMemo(
    () => createBrowserPaneKind<BrowserItem>(browserHost),
    [browserHost]
  )
  const terminalKind = useMemo(
    () => createTerminalPaneKind<TerminalItem>(terminalHost),
    [terminalHost]
  )

  async function showTerminal(): Promise<void> {
    if (!terminalItem) {
      const created = await terminalKind.createItem('sandbox-terminal', {}, 1)
      setTerminalItem(created)
    }
    setSurface('terminal')
  }

  function updateBrowserItem(patch: Partial<BrowserItem>): void {
    setBrowserItem((current) => ({ ...current, ...patch }))
  }

  const browserView = browserKind.render({
    workspaceTabId: 1,
    nodeId: 'sandbox-browser-pane',
    item: browserItem,
    active: surface === 'browser',
    paneVisible: surface === 'browser',
    updateItem: updateBrowserItem,
    openNewTab: (_kind, source) => {
      if (source?.url) updateBrowserItem({ url: source.url })
    },
    focusPaneGroup: () => setSurface('browser'),
    selectPaneTab: () => setSurface('browser')
  })

  const browserOverlay = browserKind.renderOverlay({
    nodeId: 'sandbox-browser-pane',
    paneVisible: surface === 'browser',
    items: [browserItem],
    activeItemId: browserItem.id,
    renderItem: () => browserView,
    onFocusOwningGroup: () => setSurface('browser')
  })

  const terminalView = terminalItem
    ? terminalKind.render({
        workspaceTabId: 1,
        rootPath: '/sandbox',
        item: terminalItem,
        chipShown: surface === 'terminal',
        active: surface === 'terminal',
        zoom: 1,
        updateItem: (patch) => setTerminalItem((current) => current && { ...current, ...patch })
      })
    : null

  return (
    <main className="sandbox-shell">
      <header className="sandbox-header">
        <div>
          <p className="sandbox-eyebrow">DEVELOPMENT TOOL</p>
          <h1>Feature package sandbox</h1>
          <p className="sandbox-description">
            Home, Browser, and Terminal mount with mock hosts outside the Desktop shell.
          </p>
        </div>
        <nav aria-label="Feature surface">
          <button aria-pressed={surface === 'home'} onClick={() => setSurface('home')}>
            Home
          </button>
          <button aria-pressed={surface === 'browser'} onClick={() => setSurface('browser')}>
            Browser
          </button>
          <button aria-pressed={surface === 'terminal'} onClick={() => void showTerminal()}>
            Terminal
          </button>
        </nav>
      </header>
      <section className="sandbox-surface" aria-label={`${surface} feature`}>
        {surface === 'home' ? <HomeView readSystemSummary={hostSummary} /> : null}
        <div className="sandbox-browser" hidden={surface !== 'browser'}>
          {browserOverlay}
        </div>
        <div className="sandbox-terminal" hidden={surface !== 'terminal'}>
          {terminalView ?? <p className="sandbox-empty">Starting mock terminal…</p>}
        </div>
      </section>
      <footer>Mock host capabilities only · no Electron, Workspace store, or PaneGroup</footer>
    </main>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('feature sandbox root was not found')
createRoot(root).render(<FeatureSandbox />)
