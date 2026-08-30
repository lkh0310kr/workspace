import './imeEnv'
import { ensureLinuxImeDaemon, isImeToggleKey } from './imeEnv'

import { app, shell, BrowserWindow, ipcMain, Menu, dialog, clipboard, session } from 'electron'
import { join } from 'path'
import { hostname as osHostname } from 'os'
import * as fs from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { Workspace } from './workspace'
import type { SearchOptions } from './search'
import { registerMediaProtocol, toMediaUrlBrowsed } from './mediaProtocol'
import { fetchFeed } from './rss'
import { registerEpubProtocol, openEpubAbsolute } from './epub'
import { registerEngineBundleProtocol } from './engineBundleProtocol'
import {
  loadConfig,
  saveConfig,
  loadWorkspaceSnapshot,
  saveWorkspaceSnapshot,
  migrateLegacyDevStateIfNeeded
} from './persistence'
import {
  preferNativeWorkspacePath,
  isWsl,
  isWslWindowsMountPath,
  applyWslDpiScaleFix,
  resolveUserSelectedRootPath,
} from './wslPaths'
import { shouldIgnoreWatcherPath } from './filesystemWatcherIgnore'
import { revealWslWindow, toggleWslWindowMaximize, installWslWindowLifecycle } from './wslWindow'
import { exportLayoutFiles } from '../shared/layoutExport'
import { installClaudeStatuslineHook, claudeRateLimitStatus, cursorUsageStatus } from './usage'
import { setupBrowserSession, BROWSER_SESSION_PARTITION } from './browserSession'
import { setupBrowserDownloads } from './browserDownloads'
import { registerBrowserNavIpc } from './browserNav'
import { appendTerminalLog, reprTerminalBytesMain } from './terminalDebugLog'
import { appendLayoutLog } from './layoutDebugLog'
import { resolveMacOptionTerminalBytes } from './terminalMacOptionShortcuts'
import { launchWorldEngine, disposeWorldEngine } from './worldEngine'
import { startEmbeddedWorldEngine } from './worldEngineEmbed'
import { pickDirectory, pickMediaFile } from './nativeDialogs'
import { initJapaneseDictionary, reloadJapaneseDictionary } from './japanese/init'
import { readJapaneseLogs } from './japanese/japaneseLog'
import {
  getJapaneseDbStatus,
  getJapaneseKanji,
  getJapaneseLexeme,
  getJapaneseStrokes,
  recognizeJapaneseStrokes,
  scoreJapanesePractice,
  searchJapaneseByKanji,
  searchJapaneseDictionary,
} from './japanese/service'
import { reinforceExistingWindowFocus } from './window/focusExistingWindow'
import { installWindowsPathRegistryChangeListener } from './pty/windows-path-registry-change'

// WSLg + Windows DPI: must run before ready / BrowserWindow (see wslPaths).
applyWslDpiScaleFix((name, value) => {
  app.commandLine.appendSwitch(name, value)
})

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
const gotSingleInstanceLock = app.isPackaged ? app.requestSingleInstanceLock() : true
if (!gotSingleInstanceLock) {
  console.error('[workspace-app] Another instance is already running — quitting.')
  app.quit()
} else if (app.isPackaged) {
  app.on('second-instance', () => {
    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      reinforceExistingWindowFocus(mainWindowRef, app)
    }
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

import { appendNdjsonLog } from './debugLogSink'

function interactionLogPath(): string {
  return 'interaction.ndjson'
}

function appendInteractionLog(entry: Record<string, unknown>): void {
  appendNdjsonLog(interactionLogPath(), entry)
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

  const revealWindow = (): void => {
    if (mainWindow.isDestroyed()) return
    if (wsl) {
      revealWslWindow(mainWindow)
      return
    }
    if (mainWindow.isVisible()) return
    mainWindow.show()
    mainWindow.maximize()
  }
  if (wsl) {
    // WSLg: show only after the first frame is ready (avoids blank COPY MODE surface).
    mainWindow.webContents.once('did-finish-load', revealWindow)
    setTimeout(revealWindow, 2500)
  } else {
    mainWindow.on('ready-to-show', revealWindow)
    setTimeout(revealWindow, 2500)
  }

  if (wsl) installWslWindowLifecycle(mainWindow)

  installWindowsPathRegistryChangeListener(mainWindow)

  // A page inside a <webview> guest calling the Fullscreen API
  // (document.requestFullscreen() — Godot's own Web export template has
  // an in-canvas fullscreen button that does exactly this, same as any
  // browser game) bubbles up to these events on the host BrowserWindow
  // automatically; Electron/Chromium already makes the real OS window go
  // fullscreen for free, no code needed for that part. What isn't free:
  // this app's own chrome (titlebar, the Browser pane's own nav/address
  // row) stays visible around the game unless something hides it —
  // ported from itch.io's desktop client (ref-proj/itch,
  // src/main/reactors/winds.ts's enter-html-full-screen/leave-html-full-
  // screen handling), which solves exactly this for the same reason
  // (hosting arbitrary HTML5/WASM games, many of them Godot exports, in
  // an Electron shell with its own UI around the guest content).
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
    // Never intercept IME toggle keys (한영/한자) — preventDefault here
    // would lock English-only. OS/IBus owns the toggle (Orca pattern).
    if (isImeToggleKey(input)) return
    if (input.type !== 'keyDown') return
    // Orca terminal-first: while xterm owns focus, shell/readline keeps R/W chords.
    const terminalOwnsAppShortcuts = focusedTerminalId !== null
    if (!terminalOwnsAppShortcuts && input.code === 'KeyR' && (input.control || input.meta)) {
      event.preventDefault()
      mainWindow.webContents.send('shortcut:browser-reload', { hard: input.shift })
    }
    // Cmd+W closes the active pane tab (not the whole window) — same
    // input-event-level interception as Cmd+R above; macOS would otherwise
    // close the BrowserWindow on Cmd+W by default.
    if (!terminalOwnsAppShortcuts && input.code === 'KeyW' && (input.control || input.meta)) {
      event.preventDefault()
      mainWindow.webContents.send('shortcut:close-pane-tab')
    }
    if (input.code === 'Comma' && (input.control || input.meta)) {
      event.preventDefault()
      mainWindow.webContents.send('shortcut:open-settings')
    }
    if (focusedTerminalId !== null) {
      handleMacTerminalOptionShortcut(event, input, focusedTerminalId)
    }
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
  if (workspace) {
    workspace.onTerminalData = (id, seq, data) => {
      if (!window.isDestroyed()) window.webContents.send('pty:data', { id, seq, data })
    }
  }
}

// Watches the active tab's rootPath and pushes 'fs:changed' to the
// renderer (TreeView/EditorPane's onFileChanged) so external edits (git
// checkout, another editor, a build script) show up without polling.
// fs.watch's recursive option is macOS/Windows-only (FSEvents/ReadDirectoryW
// backed) — fine for this app, but wouldn't be portable to Linux as-is.
let fileWatcher: fs.FSWatcher | null = null
let watchedRoot: string | null = null
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

function schedulePersistSideEffects(state: ReturnType<Workspace['state']>): void {
  const defer = isWsl() && state.tabs.some((t) => isWslWindowsMountPath(t.rootPath))
  if (!defer) {
    runPersistSideEffects(state)
    return
  }
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
  schedulePersistSideEffects(state)
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
      label: 'Edit',
      submenu: [
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [{ role: 'togglefullscreen' }]
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'close' }]
    },
    {
      // World Engine Phase 3 (see docs/architecture/09-future-native-architecture.md):
      // a separate native window Workspace spawns/manages, not an
      // embedded pane — dev-only trigger until it has a real pane/UI
      // surface of its own.
      label: 'World Engine',
      submenu: [
        {
          label: 'Launch World Engine (dev)',
          click: async () => {
            const result = await launchWorldEngine()
            if (!result.ok) {
              dialog.showErrorBox('World Engine', result.error ?? 'Failed to launch World Engine.')
            }
          }
        },
        {
          label: 'Launch Embedded Engine (experimental)',
          click: () => {
            const win = mainWindowRef
            if (!win) {
              dialog.showErrorBox('World Engine', 'Main window is not available.')
              return
            }
            const result = startEmbeddedWorldEngine(win)
            if (!result.ok) {
              dialog.showErrorBox('World Engine (embed)', result.error ?? 'Failed to start embedded engine.')
            }
          }
        }
      ]
    }
  ]
  return Menu.buildFromTemplate(template)
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  if (!gotSingleInstanceLock) return
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(buildAppMenu())
  }
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

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
    // <webview> host element are unreliable (see TODO.md / activeBrowserWebview.ts),
    // but the guest process's own WebContents always fires these.
    contents.on('focus', () => {
      sendToMainWindow('browser:guest-focus', { webContentsId: contents.id, focused: true })
    })
    contents.on('blur', () => {
      sendToMainWindow('browser:guest-focus', { webContentsId: contents.id, focused: false })
    })
    // Guest webview has its own keyboard focus — host webContents
    // before-input-event (createWindow) won't see Cmd+W/Cmd+R while the
    // user is typing in a page, so relay the same shortcuts here too.
    contents.on('before-input-event', (event, input) => {
      // Never intercept IME toggle — OS/IBus owns it (same as host window).
      if (isImeToggleKey(input)) return
      if (input.type !== 'keyDown') return
      if (input.code === 'KeyR' && (input.control || input.meta)) {
        event.preventDefault()
        sendToMainWindow('shortcut:browser-reload', { hard: input.shift })
      }
      if (input.code === 'KeyW' && (input.control || input.meta)) {
        event.preventDefault()
        sendToMainWindow('shortcut:close-pane-tab')
      }
      if (input.code === 'Comma' && (input.control || input.meta)) {
        event.preventDefault()
        sendToMainWindow('shortcut:open-settings')
      }
    })
  })

  ensureLinuxImeDaemon()
  installClaudeStatuslineHook()
  setupBrowserSession()
  setupBrowserDownloads(sendToMainWindow)
  registerBrowserNavIpc()

  migrateLegacyDevStateIfNeeded()
  const config = loadConfig()
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
  workspace = snapshot ? Workspace.fromSnapshot(defaultRoot, snapshot) : Workspace.withRoot(defaultRoot)
  registerMediaProtocol(() => workspace!.allTabRootPaths())
  registerEpubProtocol()
  // "Open as App" always opens a Browser-pane <webview>, which uses the
  // persist:browser partition, not the default session — registering
  // there is what actually matters (see engineBundleProtocol.ts's doc
  // comment for the failure mode this fixes).
  registerEngineBundleProtocol(session.fromPartition(BROWSER_SESSION_PARTITION), () => workspace!.allTabRootPaths())
  // Save immediately (mirrors src/lib.rs) — first launch would otherwise
  // never persist anything until the user creates/closes/renames a tab,
  // meaning a never-touched default tab's terminal id would be lost on the very next relaunch.
  persist()

  initJapaneseDictionary()

  bindMainWindow(createWindow())

  ipcMain.handle('hostname', () => osHostname())
  ipcMain.handle('app:platform', () => process.platform)
  ipcMain.on('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })
  ipcMain.on('window:maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    if (isWsl()) {
      toggleWslWindowMaximize(win)
      return
    }
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.on('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })
  ipcMain.on('debug:interaction-log', (_event, entry: Record<string, unknown>) => {
    appendInteractionLog(entry)
  })
  ipcMain.on('debug:terminal-log', (_event, entry: Record<string, unknown>) => {
    appendTerminalLog(entry)
  })
  ipcMain.on('debug:layout-log', (_event, entry: Record<string, unknown>) => {
    appendLayoutLog(entry)
  })
  // OSC 52 from nested apps (vim, ssh tmux, etc.) — xterm forwards via
  // registerOscHandler(52) in connectPanePty; renderer has no clipboard API.
  ipcMain.on('clipboard:write-text', (_event, text: string) => {
    clipboard.writeText(text)
  })
  ipcMain.handle('shell:reveal-item-in-dir', (_event, path: string) => {
    shell.showItemInFolder(path)
  })
  ipcMain.handle('usage:claude-rate-limit-status', () => claudeRateLimitStatus())
  ipcMain.handle('usage:cursor-usage-status', () => cursorUsageStatus())
  ipcMain.handle('dialog:open-directory', async (_event, defaultPath?: string) =>
    pickDirectory(mainWindowRef, defaultPath)
  )

  // For the Video/Audio/Ebook pane-picker entries — a file the user opens
  // "directly" rather than through TreeView/Quick Open, so it's
  // deliberately not confined to any open workspace root. The dialog
  // itself is the trust boundary (see toMediaUrlBrowsed's doc comment):
  // the returned path only ever came from this native picker, never from
  // renderer-supplied input.
  ipcMain.handle('dialog:pick-media-file', async (_event, kind: 'video' | 'audio' | 'ebook') =>
    pickMediaFile(mainWindowRef, kind)
  )

  ipcMain.handle('pty:spawn', (_event, cols: number, rows: number, tabId?: number) => {
    return workspace!.spawnTerminal(cols, rows, tabId)
  })
  ipcMain.handle('pty:connect', (event, id: number) => {
    return workspace!.connectTerminal(id, event.sender.id)
  })
  ipcMain.on('pty:disconnect', (event, id: number) => {
    workspace!.disconnectTerminal(id, event.sender.id)
  })
  ipcMain.on('pty:write', (_event, id: number, data: Uint8Array) => {
    workspace!.terminalWrite(id, Buffer.from(data))
  })
  ipcMain.on('terminal:set-focused', (_event, id: number | null) => {
    focusedTerminalId = id
  })
  ipcMain.on('pty:resize', (_event, id: number, cols: number, rows: number) => {
    workspace!.terminalResize(id, cols, rows)
  })
  ipcMain.on('pty:dispose', () => {
    // Individual-terminal disposal isn't wired to the Workspace model yet
    // (it only releases terminals no longer referenced by any tab's
    // layout, via setTabLayout) — a real "close this terminal" action
    // belongs to the layout port (task 6), not this milestone.
  })

  ipcMain.handle('workspace:get-state', () => workspace!.state())
  ipcMain.handle('workspace:add-tab', () => {
    const id = workspace!.addTab()
    persist()
    return id
  })
  ipcMain.handle('workspace:close-tab', (_event, tabId: number) => {
    workspace!.closeTab(tabId)
    persist()
  })
  ipcMain.handle('workspace:select-tab', (_event, tabId: number) => {
    workspace!.selectTab(tabId)
    persist()
  })
  ipcMain.handle('workspace:rename-tab', (_event, tabId: number, title: string) => {
    workspace!.renameTab(tabId, title)
    persist()
  })
  ipcMain.handle('workspace:reorder-tabs', (_event, orderedIds: number[]) => {
    workspace!.reorderTabs(orderedIds)
    persist()
  })
  ipcMain.handle('workspace:set-tab-layout', (_event, tabId: number, layoutJson: string) => {
    workspace!.setTabLayout(tabId, layoutJson)
    persist()
  })
  ipcMain.handle('workspace:set-tab-root-path', (_event, tabId: number, rootPath: string) => {
    const nativeRoot = resolveUserSelectedRootPath(rootPath)
    workspace!.setTabRootPath(tabId, nativeRoot)
    if (tabId === workspace!.state().activeTabId) {
      workspace!.defaultRootPath = nativeRoot
      saveConfig({ rootPath: nativeRoot })
    }
    persist()
    return workspace!.state()
  })

  ipcMain.handle('fs:list-dir', (_event, tabId: number, rel: string) => workspace!.listDir(tabId, rel))
  ipcMain.handle('fs:read-file', (_event, tabId: number, rel: string) => workspace!.readFile(tabId, rel))
  ipcMain.handle('fs:read-file-binary-preview', (_event, tabId: number, rel: string) =>
    workspace!.readFileBinaryPreview(tabId, rel)
  )
  ipcMain.handle('fs:write-file', (_event, tabId: number, rel: string, content: string) =>
    workspace!.writeFile(tabId, rel, content)
  )
  ipcMain.handle('fs:create-dir', (_event, tabId: number, rel: string) => workspace!.createDir(tabId, rel))
  ipcMain.handle('fs:delete-path', (_event, tabId: number, rel: string) => workspace!.deletePath(tabId, rel))
  ipcMain.handle('fs:rename-path', (_event, tabId: number, fromRel: string, toRel: string) =>
    workspace!.renamePath(tabId, fromRel, toRel)
  )

  // Streaming/cancelable, unlike the single-shot fs:* handlers above — a
  // search can run long and the renderer needs to cancel a stale one (a new
  // keystroke superseding the previous query), so this uses ipcMain.on +
  // event.sender.send instead of ipcMain.handle's one-shot request/response.
  const activeSearches = new Map<string, { cancel: () => void }>()
  ipcMain.on(
    'fs:search-in-files',
    (event, requestId: string, tabId: number, query: string, opts: SearchOptions) => {
      activeSearches.get(requestId)?.cancel()
      const handle = workspace!.searchInFiles(
        tabId,
        query,
        opts,
        (result) => {
          if (!event.sender.isDestroyed()) event.sender.send('fs:search-result', requestId, result)
        },
        (error) => {
          activeSearches.delete(requestId)
          if (!event.sender.isDestroyed()) event.sender.send('fs:search-done', requestId, error)
        }
      )
      activeSearches.set(requestId, handle)
    }
  )
  ipcMain.on('fs:search-cancel', (_event, requestId: string) => {
    activeSearches.get(requestId)?.cancel()
    activeSearches.delete(requestId)
  })
  ipcMain.handle('fs:list-all-files', (_event, tabId: number) => workspace!.listAllFiles(tabId))
  ipcMain.handle('media:get-url', (_event, tabId: number, rel: string) => workspace!.mediaUrl(tabId, rel))
  // Unconfined counterpart of media:get-url, for a file picked via
  // dialog:pick-media-file — see toMediaUrlBrowsed's doc comment.
  ipcMain.handle('media:get-url-absolute', (_event, absolutePath: string) => toMediaUrlBrowsed(absolutePath))
  // Why unconfined (unlike every fs:*/media:* handler above): a feed URL
  // is an arbitrary external HTTP resource by design, not a
  // workspace-relative path — there's nothing to resolveUnderRoot against.
  ipcMain.handle('rss:fetch-feed', (_event, url: string) => fetchFeed(url))
  ipcMain.handle('japanese:db-status', () => getJapaneseDbStatus())
  ipcMain.handle('japanese:reload', () => reloadJapaneseDictionary())
  ipcMain.handle('japanese:logs', (_event, limit?: number) => readJapaneseLogs(limit ?? 80))
  ipcMain.handle('japanese:search', (_event, query: string, limit?: number) =>
    searchJapaneseDictionary(query, limit),
  )
  ipcMain.handle('japanese:get-lexeme', (_event, entSeq: number) => getJapaneseLexeme(entSeq))
  ipcMain.handle('japanese:get-kanji', (_event, literal: string) => getJapaneseKanji(literal))
  ipcMain.handle('japanese:get-strokes', (_event, literal: string) => getJapaneseStrokes(literal))
  ipcMain.handle('japanese:search-by-kanji', (_event, literal: string) => searchJapaneseByKanji(literal))
  ipcMain.handle('japanese:recognize-strokes', (_event, strokes: unknown) =>
    recognizeJapaneseStrokes(strokes as Parameters<typeof recognizeJapaneseStrokes>[0]),
  )
  ipcMain.handle('japanese:score-practice', (_event, literal: string, strokes: unknown) =>
    scoreJapanesePractice(literal, strokes as Parameters<typeof scoreJapanesePractice>[1]),
  )
  ipcMain.handle('epub:open', (_event, tabId: number, rel: string) => workspace!.openEpub(tabId, rel))
  ipcMain.handle('epub:open-absolute', (_event, absolutePath: string) => openEpubAbsolute(absolutePath))
  ipcMain.handle('engine:get-bundle-url', (_event, tabId: number, rel: string, entry?: string) => {
    try {
      return workspace!.resolveEngineBundle(tabId, rel, entry)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { ok: false as const, error: message }
    }
  })
  ipcMain.handle('project:register-app', (_event, tabId: number, kind: string, rel: string, title?: string) =>
    workspace!.registerProjectApp(tabId, kind, rel, title)
  )
  ipcMain.handle('engine:export-godot-web', (_event, tabId: number, rel: string) =>
    workspace!.exportGodotWeb(tabId, rel)
  )
  ipcMain.handle('worldEngine:launch', async (_event, tabId: number, rel: string) => {
    const result = await workspace!.launchWorldEngine(tabId, rel)
    if (!result.ok) {
      dialog.showErrorBox('World Engine', result.error ?? 'Failed to launch World Engine.')
    }
    return result
  })

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open. Must
    // re-bind mainWindowRef/workspace.onTerminalData to this new window —
    // see bindMainWindow's comment for why leaving them pointed at the
    // now-destroyed old window crashes on every subsequent pty data chunk.
    if (BrowserWindow.getAllWindows().length === 0) bindMainWindow(createWindow())
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  workspace?.disposeAllTerminals()
  fileWatcher?.close()
  disposeWorldEngine()
})
