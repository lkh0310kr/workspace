import { memo, useEffect, useRef, useState } from 'react'
import type { SearchAddon } from '@xterm/addon-search'
import '@xterm/xterm/css/xterm.css'
import type { RefObject } from 'react'
import './terminal.css'
import './terminal-xterm-overrides.css'
import { TerminalSearch, type SearchAddonPort } from '../search/TerminalSearch'
import { createPaneDOM } from '../pane-manager/pane-dom-creation'
import { buildTerminalPaneOptions } from '../pane-manager/build-terminal-pane-options'
import { disposePane, openTerminal } from '../pane-manager/pane-lifecycle'
import type { ManagedPaneInternal } from '../pane-manager/pane-manager-types'
import { registerTerminalPane, unregisterTerminalPane } from '../pane-manager/pane-terminal-registry'
import { applyTerminalWebglAfterFit, refitPaneTerminal } from '../pane-manager/pane-terminal-refit'
import { fitRevealedPane } from '../pane-manager/pane-reveal-fit'
import { resumePaneRendering, suspendPaneRendering } from '../pane-manager/pane-rendering-control'
import type { TuiAgent } from '../types/tuiAgent'
import { shouldFocusTerminalFromPanePointerDown } from '../pane-manager/pane-pointer-focus'
import { XTERM_THEMES } from './terminalThemes'
import type { TerminalPaneHost } from './TerminalPaneHost'

interface Props {
  runtimeHost: TerminalPaneHost
  terminalId: number
  workspaceTabId: number
  paneTabId: string
  rootPath?: string | null
  visible: boolean
  active: boolean
  zoom?: number
  terminalAgent?: TuiAgent
  onTerminalTabUpdate?: (patch: { title?: string; terminalAgent?: TuiAgent | null }) => void
}

const TERMINAL_BASE_FONT_SIZE = 14

function applyTerminalSurfaceBackground(el: HTMLElement, resolved: 'dark' | 'light') {
  const bg = XTERM_THEMES[resolved].background ?? ''
  el.style.setProperty('--terminal-surface-bg', bg)
}

function TerminalPaneInner({
  runtimeHost,
  terminalId,
  workspaceTabId,
  paneTabId,
  rootPath,
  visible,
  active,
  zoom = 1,
  terminalAgent,
  onTerminalTabUpdate
}: Props) {
  const shellRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const paneRef = useRef<ManagedPaneInternal | null>(null)
  const ptyDisposeRef = useRef<(() => void) | null>(null)
  const onTerminalTabUpdateRef = useRef(onTerminalTabUpdate)
  onTerminalTabUpdateRef.current = onTerminalTabUpdate
  const runtimeHostRef = useRef(runtimeHost)
  useEffect(() => {
    runtimeHostRef.current = runtimeHost
  }, [runtimeHost])
  const terminalAgentRef = useRef(terminalAgent)
  terminalAgentRef.current = terminalAgent
  const searchRef = useRef<SearchAddon | null>(null)
  const hasFocusRef = useRef(false)
  const wasShownRef = useRef(false)
  const [searchThemeKey, setSearchThemeKey] = useState(() => runtimeHost.getResolvedTheme())
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => runtimeHost.subscribeThemeChange(setSearchThemeKey), [runtimeHost])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const paneRuntimeHost = runtimeHostRef.current

    const platformInfo = paneRuntimeHost.getPlatformInfo()

    const pane = createPaneDOM(terminalId, `terminal-${terminalId}`, {
      terminalGpuAcceleration: 'auto',
      terminalDisplayServer: platformInfo.displayServer,
      linkOpenHint: () => 'open in browser',
      onLinkClick: (_paneId, _event, uri) => paneRuntimeHost.openLink(uri),
      terminalOptions: () => ({
        ...buildTerminalPaneOptions({
          rootPath,
          terminalAgent,
          zoom,
          osRelease: platformInfo.osRelease
        }),
        theme: paneRuntimeHost.getXtermTheme(paneRuntimeHost.getResolvedTheme())
      })
    })

    host.appendChild(pane.container)
    openTerminal(pane)
    paneRef.current = pane
    searchRef.current = pane.searchAddon
    registerTerminalPane(terminalId, pane)

    const resolved = paneRuntimeHost.getResolvedTheme()
    if (shellRef.current) applyTerminalSurfaceBackground(shellRef.current, resolved)
    applyTerminalSurfaceBackground(host, resolved)

    paneRuntimeHost.registerAgentPane(terminalId, workspaceTabId, paneTabId, terminalAgent)
    paneRuntimeHost.registerLiveTerminal(terminalId)

    const { dispose, transport } = paneRuntimeHost.connectPty(pane, terminalId, {
      workspaceTabId,
      paneTabId,
      terminalAgent,
      onTitleChange: (title) => {
        const terminalAgent = paneRuntimeHost.resolveTitleAgentType(title)
        onTerminalTabUpdateRef.current?.({
          title,
          terminalAgent: terminalAgent ?? null
        })
      }
    })
    ptyDisposeRef.current = dispose

    const isFocused = (): boolean => {
      const active = document.activeElement
      const root = pane.terminal.element
      return (
        active === pane.terminal.textarea ||
        (!!root && active instanceof Node && root.contains(active))
      )
    }
    const inputHandlersDispose = paneRuntimeHost.installInputHandlers({
      terminal: pane.terminal,
      container: pane.container,
      terminalId,
      transport,
      getTerminalAgent: () => terminalAgentRef.current,
      writeClipboardText: (text) => runtimeHostRef.current.writeClipboardText(text),
      isFocused
    })

    const unregisterKeyboardTarget = paneRuntimeHost.registerKeyboardTarget(terminalId, () => {
      pane.terminal.blur()
    })

    const onFocusIn = () => {
      hasFocusRef.current = true
      if (platformInfo.platform === 'win32') {
        runtimeHostRef.current.requestKeyboardSurface('terminal', 'terminal-focusin')
      }
      runtimeHostRef.current.setFocusedTerminal(terminalId)
      runtimeHostRef.current.log(
        'terminal:focus',
        'focusin',
        {
          activeElement: document.activeElement === pane.terminal.textarea ? 'textarea' : 'child'
        },
        terminalId
      )
    }
    const onFocusOut = (event: FocusEvent) => {
      const root = pane.terminal.element
      const next = event.relatedTarget
      if (next instanceof Node && root?.contains(next)) {
        return
      }
      hasFocusRef.current = false
      runtimeHostRef.current.setFocusedTerminal(null)
      runtimeHostRef.current.log('terminal:focus', 'focusout', {}, terminalId)
    }

    pane.container.addEventListener('focusin', onFocusIn)
    pane.container.addEventListener('focusout', onFocusOut)
    const onPointerDown = (event: PointerEvent) => {
      if (!shouldFocusTerminalFromPanePointerDown(event.target)) {
        return
      }
      if (platformInfo.platform === 'win32') {
        runtimeHostRef.current.requestKeyboardSurface('terminal', 'terminal-pointerdown')
      }
      pane.terminal.focus()
    }
    pane.container.addEventListener('pointerdown', onPointerDown)

    const unsubscribeTheme = paneRuntimeHost.subscribeThemeChange((resolved) => {
      pane.terminal.options.theme = paneRuntimeHost.getXtermTheme(resolved)
      if (shellRef.current) applyTerminalSurfaceBackground(shellRef.current, resolved)
      const hostEl = hostRef.current
      if (hostEl) applyTerminalSurfaceBackground(hostEl, resolved)
    })

    return () => {
      unsubscribeTheme()
      inputHandlersDispose()
      unregisterKeyboardTarget()
      runtimeHostRef.current.setFocusedTerminal(null)
      pane.container.removeEventListener('focusin', onFocusIn)
      pane.container.removeEventListener('focusout', onFocusOut)
      pane.container.removeEventListener('pointerdown', onPointerDown)
      paneRuntimeHost.unregisterAgentPane(terminalId)
      ptyDisposeRef.current?.()
      ptyDisposeRef.current = null
      unregisterTerminalPane(terminalId, pane)
      disposePane(pane)
      pane.container.remove()
      paneRef.current = null
      searchRef.current = null
    }
  }, [terminalId, rootPath, workspaceTabId, paneTabId, terminalAgent])

  useEffect(() => {
    runtimeHostRef.current.ensureAgentWorking(workspaceTabId, paneTabId, terminalAgent)
  }, [workspaceTabId, paneTabId, terminalAgent])

  useEffect(() => {
    const pane = paneRef.current
    if (!pane) return
    pane.terminal.options.fontSize = Math.round(TERMINAL_BASE_FONT_SIZE * zoom)
    refitPaneTerminal(pane)
  }, [zoom])

  useEffect(() => {
    const shown = visible && active
    const pane = paneRef.current
    const host = hostRef.current
    if (host) {
      host.style.pointerEvents = shown ? 'auto' : 'none'
    }
    if (!pane) return

    if (!shown) {
      suspendPaneRendering(pane)
      return
    }

    resumePaneRendering(pane)

    const becameShown = shown && !wasShownRef.current
    wasShownRef.current = shown

    const refit = (): void => {
      if (becameShown) {
        // Reveal uses Orca's stable-grid fit. A raw fit after `display:none`
        // can observe transient cell metrics and reflow pinned scrollback.
        fitRevealedPane(pane)
        applyTerminalWebglAfterFit(pane)
        return
      }
      refitPaneTerminal(pane)
    }

    requestAnimationFrame(() => {
      refit()
      if (becameShown) {
        runtimeHostRef.current.focusTextarea(pane.container)
        pane.terminal.focus()
      }
    })
    const timer = window.setTimeout(() => {
      refit()
      if (becameShown) {
        runtimeHostRef.current.focusTextarea(pane.container)
        pane.terminal.focus()
      }
    }, 50)

    return () => {
      clearTimeout(timer)
    }
  }, [visible, active, terminalId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const pane = paneRef.current
      const term = pane?.terminal
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        if (!hasFocusRef.current && !searchOpen) return
        e.preventDefault()
        if (searchOpen) {
          setSearchOpen(false)
          term?.focus()
        } else {
          setSearchOpen(true)
        }
      } else if (e.key === 'Escape' && searchOpen) {
        setSearchOpen(false)
        term?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [searchOpen])

  return (
    <div className="terminal-pane-shell" ref={shellRef}>
      <TerminalSearch
        isOpen={searchOpen}
        onClose={() => {
          setSearchOpen(false)
          paneRef.current?.terminal.focus()
        }}
        searchAddonRef={searchRef as RefObject<SearchAddonPort | null>}
        decorations={runtimeHost.getSearchDecorations(searchThemeKey)}
        registerPortal={runtimeHost.registerPortal}
      />
      <div className="terminal-pane-host pane-manager-root" ref={hostRef} />
    </div>
  )
}

export const TerminalPane = memo(TerminalPaneInner)
