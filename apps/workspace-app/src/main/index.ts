import './protocolSchemes'
import './imeEnv'
import { installMainStartupLogging, appendStartupLog, isPackagedApp } from './startupLog'
import { ensureLinuxImeDaemon } from './imeEnv'
import { relayGuestWebviewShortcuts, relayHostAppShortcuts } from './shortcuts/relayAppShortcuts'

import { app, shell, BrowserWindow, Menu, clipboard } from 'electron'
import { join } from 'path'
import * as fs from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { Workspace } from './workspace'
import { registerMediaProtocol } from './mediaProtocol'
import { registerModelProtocol } from './model3d/modelProtocol'
import { importJobQueue } from './model3d/importJobQueue'
import { registerEpubProtocol } from './epub'
import {
  loadConfig,
  saveConfig,
  loadWorkspaceSnapshot,
  saveWorkspaceSnapshot,
  saveTerminalSessionBuffers,
} from './persistence'
import {
  preferNativeWorkspacePath,
  isWsl,
  isWslWindowsMountPath,
  applyWslDpiScaleFix,
} from './wslPaths'
import { applyBrowserGpuSwitches } from './browserGpuEnv'
import { shouldIgnoreWatcherPath } from './filesystemWatcherIgnore'
import { revealWslWindow, installWslWindowLifecycle } from './wslWindow'
import { exportLayoutFiles } from '../shared/layoutExport'
import { installClaudeStatuslineHook } from './usage'
import { setupBrowserSession } from './browserSession'
import { setupBrowserDownloads } from './browserDownloads'
import { registerBrowserNavIpc } from './browserNav'
import { registerPkmsIpc } from './pkms/ipc'
import { registerWorkspaceIpc } from './ipc/workspace'
import { registerTerminalIpc } from './ipc/terminal'
import { registerContentCapabilityIpc } from './ipc/contentCapabilities'
import { registerSystemCapabilityIpc } from './ipc/systemCapabilities'
import { registerAgentStatusIpc } from './ipc/agentStatus'
import { requestTerminalSessionBuffers } from './ipc/terminalSessionBuffers'
import { appendTerminalLog, reprTerminalBytesMain } from './terminalDebugLog'
import {
  observeTerminalPtyOutput,
  notifyTerminalPtySpawned,
  setTerminalOscTitleBroadcastTarget,
} from './terminalOscTitleBroadcast'
import { installAgentStatusHooks } from './agentHooks'
import {
  getWorkspaceAgentHookPort,
  setWorkspaceAgentHookBroadcastTarget,
  startWorkspaceAgentHookServer,
} from './workspaceAgentHookServer'
import { resolveMacOptionTerminalBytes } from './terminalMacOptionShortcuts'
import { disposeCadViewers } from './cadViewer'
import { reinforceExistingWindowFocus } from './window/focusExistingWindow'
import { installWindowsPathRegistryChangeListener } from './pty/windows-path-registry-change'
import { checkForUpdatesByUser, initializeAutoUpdates } from './autoUpdate'

// WSLg + Windows DPI: must run before ready / BrowserWindow (see wslPaths).
applyWslDpiScaleFix((name, value) => {
  app.commandLine.appendSwitch(name, value)
})
applyBrowserGpuSwitches((name, value) => {
  if (value === undefined) app.commandLine.appendSwitch(name)
  else app.commandLine.appendSwitch(name, value)
})

installMainStartupLogging()

// Two live instances (a forgotten second `npm run dev`, or dev running
// alongside a packaged daily-use build) race on the same
// config.electron.json/workspace.electron.json with no locking, and both
// independently spawn PTYs — last writer wins, in-memory tab/terminal
// state diverges from disk, and the surviving window can get stuck at
// "Loading workspace…" or stop responding to input entirely. Must be
// requested before anything else touches app state; a losing second
// launch just quits immediately instead of creating a competing window.
// Packaged builds must be single-instance. Dev skips the lock so electron-vite
// can restart Electron after main-process rebuilds; otherwise the new process
// loses the lock, quits immediately, and electron-vite exits all of `npm run dev`.
// Dock/menu-bar label only — appSupportDir() in persistence.ts is what
// actually keeps dev and packaged data apart. This just makes it obvious
// at a glance (Dock, Cmd+Tab, window menu) which one you're looking at
// when both are running side by side. Must run before app.whenReady().
if (!isPackagedApp()) {
  app.setName('Workspace (Dev)')
}

const gotSingleInstanceLock = isPackagedApp() ? app.requestSingleInstanceLock() : true
appendStartupLog('single_instance_lock', { acquired: gotSingleInstanceLock, packaged: isPackagedApp() })
if (!gotSingleInstanceLock) {
  console.error('[workspace-app] Another instance is already running — quitting.')
  appendStartupLog('single_instance_quit', { reason: 'lock_not_acquired' })
  app.quit()
} else if (isPackagedApp()) {
  app.on('second-instance', () => {
    appendStartupLog('second_instance', {
      hasMainWindow: !!mainWindowRef,
      mainWindowDestroyed: mainWindowRef?.isDestroyed() ?? null,
      mainWindowVisible: mainWindowRef?.isVisible() ?? null,
    })
    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      reinforceExistingWindowFocus(mainWindowRef, app)
      return
    }
    appendStartupLog('second_instance_recreate_window')
    bindMainWindow(createWindow())
  })
}

let focusedTerminalId: number | null = null

function handleMacTerminalOptionShortcut(
  event: Electron.Event,
  input: Electron.Input,
  terminalId: number,
): boolean {
  if (process.platform !== 'darwin' || input.type !== 'keyDown') {
    return false
  }
  if (!input.alt || input.meta || input.control || input.shift) {
    return false
  }
  const bytes = resolveMacOptionTerminalBytes(input.code)
  if (!bytes) {
    return false
  }
  event.preventDefault()
  workspace?.terminalWrite(terminalId, Buffer.from(bytes, 'utf8'))
  sendToMainWindow('terminal:clear-option-modifiers')
  appendTerminalLog({
    sessionId: 'terminal',
    timestamp: Date.now(),
    location: 'main:before-input',
    message: 'mac-option-shortcut',
    terminalId,
    data: { code: input.code, bytes: reprTerminalBytesMain(bytes) },
  })
  return true
}

import { appendAppLog, getLogsDir, installMainConsoleFileLogging } from './debugLogSink'

function logWindowLifecycle(event: string, window: BrowserWindow, extra?: Record<string, unknown>): void {
  appendStartupLog(event, {
    windowId: window.id,
    destroyed: window.isDestroyed(),
    visible: window.isVisible(),
    minimized: window.isMinimized(),
    maximized: window.isMaximized(),
    bounds: window.isDestroyed() ? null : window.getBounds(),
    ...(extra ?? {}),
  })
}

function createWindow(): BrowserWindow {
  // Window chrome:
  // - macOS: hiddenInset (existing traffic-light gutter).
  // - Windows / Linux / WSL: Orca-style frameless custom titlebar — no
  //   titleBarOverlay (WSLg misaligns client surface + hit-test).
  const isMac = process.platform === 'darwin'
  const wsl = isWsl()

  // macOS: hiddenInset traffic lights. Orca pattern elsewhere: frameless
  // custom titlebar — no titleBarOverlay (WSLg misaligns; win32/linux match Orca).
  const chromeOpts = isMac
    ? { titleBarStyle: 'hiddenInset' as const }
    : { titleBarStyle: 'hidden' as const, frame: false }

  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#1e1e1e',
    ...chromeOpts,
    ...(isMac ? {} : { icon }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webviewTag: true,
      plugins: true
    }
  })
  logWindowLifecycle('window_created', mainWindow)

  const revealWindow = (reason: string): void => {
    if (mainWindow.isDestroyed()) return
    logWindowLifecycle('window_reveal_attempt', mainWindow, { reason })
    if (wsl) {
      revealWslWindow(mainWindow)
      return
    }
    if (mainWindow.isVisible()) return
    mainWindow.show()
    mainWindow.maximize()
    logWindowLifecycle('window_revealed', mainWindow, { reason })
  }
  if (wsl) {
    // WSLg: show only after the first frame is ready (avoids blank COPY MODE surface).
    mainWindow.webContents.once('did-finish-load', () => revealWindow('did-finish-load'))
    setTimeout(() => revealWindow('timeout_2500ms'), 2500)
  } else {
    mainWindow.on('ready-to-show', () => revealWindow('ready-to-show'))
    setTimeout(() => revealWindow('timeout_2500ms'), 2500)
    setTimeout(() => {
      if (!mainWindow.isDestroyed() && !mainWindow.isVisible()) {
        revealWindow('timeout_10000ms_fallback')
      }
    }, 10_000)
  }

  mainWindow.webContents.on('did-finish-load', () => {
    logWindowLifecycle('webcontents_did_finish_load', mainWindow)
  })
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    appendStartupLog('webcontents_did_fail_load', {
      windowId: mainWindow.id,
      errorCode,
      errorDescription,
      validatedURL,
    })
  })
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    appendStartupLog('webcontents_render_process_gone', {
      windowId: mainWindow.id,
      reason: details.reason,
      exitCode: details.exitCode,
    })
  })
  mainWindow.on('unresponsive', () => {
    logWindowLifecycle('window_unresponsive', mainWindow)
  })
  mainWindow.on('responsive', () => {
    logWindowLifecycle('window_responsive', mainWindow)
  })
  mainWindow.on('closed', () => {
    appendStartupLog('window_closed', { windowId: mainWindow.id })
  })

  if (wsl) installWslWindowLifecycle(mainWindow)

  installWindowsPathRegistryChangeListener(mainWindow)

  // Web content may request fullscreen. React to the guest event so the
  // Workspace titlebar and browser controls can get out of the way.
  mainWindow.on('enter-html-full-screen', () => {
    sendToMainWindow('browser:html-fullscreen-changed', true)
  })
  mainWindow.on('leave-html-full-screen', () => {
    sendToMainWindow('browser:html-fullscreen-changed', false)
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Cmd+R / Cmd+Shift+R: always intercept at the input-event level (not a
  // renderer-side keydown listener) — @electron-toolkit/utils's
  // watchWindowShortcuts (below) already unconditionally swallows
  // Cmd+R-family combos in production builds via the same mechanism
  // (before-input-event's preventDefault stops the key from ever reaching
  // any renderer DOM listener at all), so a renderer-level handler would
  // silently never fire there. Repurposes the shortcut instead of just
  // blocking it: reload the currently-focused browser tab
  // (activeBrowserWebview.ts), not the whole app — reloading the whole
  // renderer would nuke every terminal pane's UI state.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    relayHostAppShortcuts(event, input, {
      send: (channel, ...args) => mainWindow.webContents.send(channel, ...args),
      terminalOwnsAppShortcuts: focusedTerminalId !== null,
      focusedTerminalId,
      onTerminalOptionShortcut: handleMacTerminalOptionShortcut,
    })
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

let workspace: Workspace | null = null
let mainWindowRef: BrowserWindow | null = null

// Every push-to-renderer call in this file goes through here instead of
// calling mainWindowRef?.webContents.send(...) directly — the window can
// be closed (Cmd+W, red traffic light) and macOS recreates one on the
// next dock-icon 'activate' without the app quitting, so mainWindowRef
// can point at an already-destroyed BrowserWindow for a window between
// that close and whatever next re-binds it. Calling .send() on a
// destroyed WebContents throws synchronously ("Object has been
// destroyed"), and since pty output arrives continuously that repeated
// on every single terminal data chunk — reported as "에러가 너무 많이
// 뜬다. 워크스페이스 전환도 안됨" (workspace:updated silently going to the
// dead window too, so the visible new window never saw state updates).
function sendToMainWindow(channel: string, ...args: unknown[]): void {
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.webContents.send(channel, ...args)
  }
}

// The other half of the same fix: mainWindowRef and workspace's terminal
// data callback both need to be re-pointed at whichever BrowserWindow is
// actually current, every time one is (re)created — not just once at
// initial launch, since app.on('activate') can create a brand new window
// after the original one was closed.
function bindMainWindow(window: BrowserWindow): void {
  mainWindowRef = window
}

// Watches the active tab's rootPath and pushes 'fs:changed' to the
// renderer (TreeView/EditorPane's onFileChanged) so external edits (git
// checkout, another editor, a build script) show up without polling.
// fs.watch's recursive option is macOS/Windows-only (FSEvents/ReadDirectoryW
// backed) — fine for this app, but wouldn't be portable to Linux as-is.
let fileWatcher: fs.FSWatcher | null = null
let watchedRoot: string | null = null
let fileWatcherReconcile: ReturnType<typeof setInterval> | null = null
let fsChangeDebounce: ReturnType<typeof setTimeout> | null = null
const pendingFsChangePaths = new Set<string>()

function broadcastFileChanged(changedRel?: string): void {
  if (changedRel !== undefined) {
    if (shouldIgnoreWatcherPath(changedRel)) return
    pendingFsChangePaths.add(changedRel)
  } else {
    pendingFsChangePaths.add('')
  }
  if (fsChangeDebounce) clearTimeout(fsChangeDebounce)
  fsChangeDebounce = setTimeout(() => {
    const paths = [...pendingFsChangePaths]
    pendingFsChangePaths.clear()
    sendToMainWindow('fs:changed', paths)
  }, 150)
}

function syncFileWatcher(): void {
  if (!workspace) return
  const state = workspace.state()
  const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
  const root = activeTab?.rootPath ?? null
  if (root === watchedRoot) return
  fileWatcher?.close()
  fileWatcher = null
  if (fileWatcherReconcile) clearInterval(fileWatcherReconcile)
  fileWatcherReconcile = null
  watchedRoot = root
  if (!root) return
  try {
    // Recursive inotify on WSL /mnt/<drive> (drvfs) can block the main
    // thread for a long time — watch the root directory only there.
    const recursive = !isWslWindowsMountPath(root)
    fileWatcher = fs.watch(
      root,
      recursive ? { recursive: true } : {},
      (_event, filename) => broadcastFileChanged(filename ? String(filename) : undefined),
    )
    // A non-recursive watcher cannot see edits inside existing subdirectories.
    // Reconcile periodically so CLI-created/removed files still converge in UI
    // on platforms/paths where recursive watching is disabled (notably WSL
    // drvfs, where recursive inotify can stall the Electron main thread).
    if (!recursive) {
      fileWatcherReconcile = setInterval(() => broadcastFileChanged(), 2_000)
    }
  } catch (err) {
    console.error('fs.watch failed for', root, err)
  }
}

let pendingPersistSideEffects: ReturnType<typeof setImmediate> | null = null

function runPersistSideEffects(state: ReturnType<Workspace['state']>): void {
  try {
    exportLayoutFiles(state.tabs, state.activeTabId)
  } catch (err) {
    console.error('layout export failed', err)
  }
  syncFileWatcher()
}

function schedulePersistSideEffects(): void {
  // Exporting layouts and rebuilding the recursive file watcher can block
  // the main process. Keep those best-effort effects out of latency-sensitive
  // workspace IPC (especially tab selection), then coalesce rapid changes.
  if (pendingPersistSideEffects) clearImmediate(pendingPersistSideEffects)
  pendingPersistSideEffects = setImmediate(() => {
    pendingPersistSideEffects = null
    if (!workspace) return
    runPersistSideEffects(workspace.state())
  })
}

function persist(): void {
  if (!workspace) return
  const state = workspace.state()
  saveWorkspaceSnapshot(state)
  // Push UI state immediately — layout export + fs.watch on /mnt/c can take
  // seconds and must not block IPC (e.g. settings Save → "Saving…").
  sendToMainWindow('workspace:updated', state)
  schedulePersistSideEffects()
}

// Same shape as Electron's own implicit default application menu (which
// we'd otherwise get automatically on macOS by not calling
// Menu.setApplicationMenu at all), minus Undo/Redo from the Edit
// submenu. Electron's default Edit menu binds Cmd+Z/Cmd+Shift+Z to
// role: 'undo'/'redo', which invoke the *native* Chromium edit-command
// undo stack — a no-op here, since CodeMirror manages its own undo
// history entirely in JS (@codemirror/commands' historyKeymap, wired in
// EditorPane once that's ported). The native menu item intercepts the
// keystroke at the OS responder-chain level before it ever reaches the
// webview as a DOM keydown event, so CodeMirror's own Cmd+Z binding
// would never fire — the exact same problem (and fix) already found and
// applied to the Tauri version's src/lib.rs.
// macOS only. Harmless console noise "representedObject is not a WeakPtr…"
// comes from Electron #50389 when using role: items (Edit/Window menus);
// fixed upstream by removing the log in Electron ≥41. We build once here.
function buildAppMenu(): Menu {
  const appName = app.name
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: appName,
      submenu: [
        { role: 'about' },
        {
          label: 'Check for Updates…',
          click: () => void checkForUpdatesByUser()
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'New Workspace Tab',
          accelerator: 'CommandOrControl+N',
          click: () => sendToMainWindow('shortcut:new-workspace-tab')
        },
        { type: 'separator' },
        {
          label: 'Go to Home',
          accelerator: 'CommandOrControl+`',
          click: () => sendToMainWindow('shortcut:home')
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'cut' },
        { role: 'copy' },
        {
          label: 'Paste',
          accelerator: 'CommandOrControl+V',
          click: () => {
            if (focusedTerminalId !== null) {
              sendToMainWindow('shortcut:terminal-paste', { terminalId: focusedTerminalId })
              return
            }
            if (mainWindowRef && !mainWindowRef.isDestroyed()) {
              mainWindowRef.webContents.paste()
            }
          }
        },
        {
          label: 'Paste and Match Style',
          accelerator: 'CommandOrControl+Shift+V',
          click: () => {
            sendToMainWindow('shortcut:paste-plain-text')
          }
        },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [{ role: 'togglefullscreen' }]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        {
          label: 'Close Tab',
          accelerator: 'CommandOrControl+W',
          click: () => {
            sendToMainWindow('shortcut:close-pane-tab')
          }
        },
        {
          label: 'Close Window',
          accelerator: 'CommandOrControl+Shift+W',
          click: () => {
            mainWindowRef?.close()
          }
        }
      ]
    },

  ]
  return Menu.buildFromTemplate(template)
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  if (!gotSingleInstanceLock) return
  appendStartupLog('app_when_ready_begin')
  installMainConsoleFileLogging()
  appendAppLog('main', 'info', 'app_ready', { packaged: isPackagedApp(), platform: process.platform })
  appendStartupLog('app_when_ready_logging_installed', { logsDir: getLogsDir() })
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(buildAppMenu())
  }
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.kanghyun.workspace')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  // zoom: true — without it this also unconditionally blocks Cmd+'-'/
  // Cmd+'=' at the input-event level (same mechanism as the Cmd+R block
  // above), which silently broke App.tsx's own Cmd+'+'/Cmd+'-' pane zoom
  // feature from the moment it was added.
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window, { zoom: true })
  })

  // Guest <webview> content (BrowserPane) attempting to open a new window
  // (target="_blank", window.open()) — without this it falls through to
  // Electron's default handling, which (since BrowserPane.tsx sets
  // allowpopups) is to open a real native OS window, reported as "a href
  // target _blank 열면 native window가 새로 뜨는 것 같음". Deny the native
  // window and hand the URL to the renderer instead, so it can open it as
  // a new tab in the same pane group. Set on the guest's own WebContents
  // (via web-contents-created, since a <webview>'s guest is a separate
  // WebContents from the host window) — the host's own
  // setWindowOpenHandler in createWindow() only covers links opened from
  // our own renderer UI, not from inside a webview guest page. Registered
  // once here (not per-window, unlike the shortcuts above) since it isn't
  // tied to any one BrowserWindow's lifecycle.
  app.on('web-contents-created', (_event, contents) => {
    if (contents.getType() !== 'webview') return
    contents.setWindowOpenHandler((details) => {
      sendToMainWindow('browser:open-new-tab', {
        hostWebContentsId: contents.id,
        url: details.url
      })
      return { action: 'deny' }
    })
    // Guest WebContents focus/blur — renderer DOM focus events on the
    // <webview> host element are unreliable (see activeBrowserWebview.ts),
    // but the guest process's own WebContents always fires these.
    contents.on('focus', () => {
      sendToMainWindow('browser:guest-focus', { webContentsId: contents.id, focused: true })
    })
    contents.on('blur', () => {
      sendToMainWindow('browser:guest-focus', { webContentsId: contents.id, focused: false })
    })
    // Guest clicks don't bubble to overlay slot pointerdown after the page loads; relay every
    // mouseDown so split-pane focus dimming updates even when the guest is already focused.
    contents.on('input-event', (_event, input) => {
      if (input.type !== 'mouseDown') return
      sendToMainWindow('browser:guest-pointer-down', { webContentsId: contents.id })
    })
    // Guest webview has its own keyboard focus — host webContents
    // before-input-event (createWindow) won't see Cmd+W/Cmd+R while the
    // user is typing in a page, so relay the same shortcuts here too.
    contents.on('before-input-event', (event, input) => {
      relayGuestWebviewShortcuts(event, input, sendToMainWindow, () => {
        contents.insertText(clipboard.readText())
      }, contents.id)
    })
    // Electron may consume Cmd/Ctrl +/- as native zoom before before-input-event.
    contents.on('zoom-changed', (event, zoomDirection) => {
      if (zoomDirection !== 'in' && zoomDirection !== 'out') return
      event.preventDefault()
      sendToMainWindow('shortcut:browser-zoom', {
        direction: zoomDirection,
        webContentsId: contents.id
      })
    })
  })

  ensureLinuxImeDaemon()
  installClaudeStatuslineHook()
  installAgentStatusHooks()
  setupBrowserSession()
  setupBrowserDownloads(sendToMainWindow)
  registerBrowserNavIpc()
  registerPkmsIpc()

  const config = loadConfig()
  appendStartupLog('config_loaded', { hasRootPath: !!config.rootPath })
  // WSL: never keep a /mnt/<drive> root as the live workspace — 9p sync I/O
  // freezes the main process before ready-to-show (window stays invisible).
  const defaultRoot = preferNativeWorkspacePath(config.rootPath ?? process.cwd())
  if (config.rootPath && config.rootPath !== defaultRoot) {
    saveConfig({ ...config, rootPath: defaultRoot })
  }
  const rawSnapshot = loadWorkspaceSnapshot()
  // Do not remap persisted tab roots on load — the user may have explicitly
  // chosen a /mnt/<drive> path via settings. preferNativeWorkspacePath is
  // only for the default seed root at first launch (see defaultRoot above).
  const snapshot = rawSnapshot

  appendStartupLog('create_window_begin')
  bindMainWindow(createWindow())
  initializeAutoUpdates()
  appendStartupLog('create_window_end', {
    hasMainWindow: !!mainWindowRef,
    visible: mainWindowRef?.isVisible() ?? null,
  })

  workspace = snapshot ? Workspace.fromSnapshot(defaultRoot, snapshot) : Workspace.withRoot(defaultRoot)
  workspace.onTerminalPtyOutput = observeTerminalPtyOutput
  workspace.onTerminalSpawned = notifyTerminalPtySpawned
  setTerminalOscTitleBroadcastTarget(() => mainWindowRef?.webContents ?? null)
  setWorkspaceAgentHookBroadcastTarget(() => mainWindowRef?.webContents ?? null)
  void startWorkspaceAgentHookServer().then((port) => {
    appendStartupLog('workspace_agent_hook_server', { port })
    workspace!.agentHookStatusUrl = () => {
      const p = getWorkspaceAgentHookPort()
      return p ? `http://127.0.0.1:${p}/status` : null
    }
  })
  for (const terminalId of workspace.allReferencedTerminalIds()) {
    notifyTerminalPtySpawned(terminalId)
  }
  registerAgentStatusIpc()
  importJobQueue.on('update', (job) => {
    sendToMainWindow('model:import-status', job)
  })
  registerMediaProtocol(() => workspace!.allTabRootPaths())
  registerModelProtocol(() => workspace!.allTabRootPaths())
  registerEpubProtocol()
  // Save immediately (mirrors src/lib.rs) — first launch would otherwise
  // never persist anything until the user creates/closes/renames a tab,
  // meaning a never-touched default tab's terminal id would be lost on the very next relaunch.
  persist()

  const terminalBufferAutosaveMs = 45_000
  const terminalBufferAutosaveTimer = setInterval(() => {
    if (!workspace) return
    try {
      saveTerminalSessionBuffers(workspace.buildTerminalSessionBuffersForAutosave())
    } catch (err) {
      console.warn('[terminal] session buffer autosave failed', err)
    }
  }, terminalBufferAutosaveMs)
  app.on('will-quit', () => clearInterval(terminalBufferAutosaveTimer))

  registerSystemCapabilityIpc(() => mainWindowRef)
  registerTerminalIpc(() => workspace!, (id) => { focusedTerminalId = id })
  registerWorkspaceIpc(() => workspace!, persist)
  registerContentCapabilityIpc(() => workspace!)

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open. Must
    // re-bind mainWindowRef to this new window — see bindMainWindow's comment
    // for why leaving it pointed at the now-destroyed old window breaks IPC.
    if (BrowserWindow.getAllWindows().length === 0) bindMainWindow(createWindow())
  })

  appendStartupLog('app_when_ready_complete')
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

let applicationQuitPrepared = false

async function prepareApplicationQuit(): Promise<void> {
  appendStartupLog('app_before_quit')
  if (workspace) {
    const captured = await requestTerminalSessionBuffers(mainWindowRef, workspace)
    const merged = workspace.buildTerminalSessionBuffersForQuit(captured)
    saveTerminalSessionBuffers(merged)
    persist()
    workspace.disposeAllTerminals()
  }
  fileWatcher?.close()
  disposeCadViewers()
}

app.on('before-quit', (event) => {
  if (applicationQuitPrepared) {
    return
  }
  event.preventDefault()
  void prepareApplicationQuit()
    .catch((err) => {
      console.error('[app] prepareApplicationQuit failed', err)
      workspace?.disposeAllTerminals()
    })
    .finally(() => {
      applicationQuitPrepared = true
      app.quit()
    })
})
