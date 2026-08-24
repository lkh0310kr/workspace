import { app, shell, BrowserWindow, ipcMain, Menu, dialog } from 'electron'
import { join } from 'path'
import { hostname as osHostname } from 'os'
import * as fs from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { Workspace } from './workspace'
import { loadConfig, saveConfig, loadWorkspaceSnapshot, saveWorkspaceSnapshot } from './persistence'
import { installClaudeStatuslineHook, claudeRateLimitStatus, cursorUsageStatus } from './usage'
import { setupBrowserSession } from './browserSession'

function createWindow(): BrowserWindow {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    // Overlay title bar (traffic lights float over the web content, no
    // native bar underneath) — mirrors tauri.conf.json's titleBarStyle so
    // .titlebar in styles.css (which reserves the same 28px strip and
    // hosts the sidebar toggle) applies unchanged.
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' } : {}),
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      // Browser pane uses a real <webview> guest (Orca's approach — see
      // BrowserPane.tsx), which needs this enabled on the host window.
      webviewTag: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
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
    if (input.type !== 'keyDown') return
    if (input.code === 'KeyR' && (input.control || input.meta)) {
      event.preventDefault()
      mainWindow.webContents.send('shortcut:browser-reload', { hard: input.shift })
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

// Watches the active tab's rootPath and pushes 'fs:changed' to the
// renderer (TreeView/EditorPane's onFileChanged) so external edits (git
// checkout, another editor, a build script) show up without polling.
// fs.watch's recursive option is macOS/Windows-only (FSEvents/ReadDirectoryW
// backed) — fine for this app, but wouldn't be portable to Linux as-is.
let fileWatcher: fs.FSWatcher | null = null
let watchedRoot: string | null = null
let fsChangeDebounce: ReturnType<typeof setTimeout> | null = null

function broadcastFileChanged(): void {
  if (fsChangeDebounce) clearTimeout(fsChangeDebounce)
  fsChangeDebounce = setTimeout(() => {
    mainWindowRef?.webContents.send('fs:changed')
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
    fileWatcher = fs.watch(root, { recursive: true }, () => broadcastFileChanged())
  } catch (err) {
    console.error('fs.watch failed for', root, err)
  }
}

function persist(): void {
  if (!workspace) return
  saveWorkspaceSnapshot(workspace.state())
  // Mirrors the Rust version's app.emit("workspace-updated", ...) after
  // every mutating command — useWorkspace-equivalent hooks in the
  // renderer (electron.ts's onWorkspaceUpdated) only ever call
  // getWorkspaceState once on mount, so without this push they'd never
  // see another tab/layout change made through any other handler.
  mainWindowRef?.webContents.send('workspace:updated', workspace.state())
  syncFileWatcher()
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
    }
  ]
  return Menu.buildFromTemplate(template)
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
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
      mainWindowRef?.webContents.send('browser:open-new-tab', {
        hostWebContentsId: contents.id,
        url: details.url
      })
      return { action: 'deny' }
    })
  })

  installClaudeStatuslineHook()
  setupBrowserSession()

  const config = loadConfig()
  const defaultRoot = config.rootPath ?? process.cwd()
  const snapshot = loadWorkspaceSnapshot()
  workspace = snapshot ? Workspace.fromSnapshot(defaultRoot, snapshot) : Workspace.withRoot(defaultRoot)
  // Save immediately (mirrors src/lib.rs) — first launch would otherwise
  // never persist anything until the user creates/closes/renames a tab,
  // meaning a never-touched default tab's terminal id (and thus its tmux
  // session) would be lost on the very next relaunch.
  persist()

  const mainWindow = createWindow()
  mainWindowRef = mainWindow

  ipcMain.handle('hostname', () => osHostname())
  ipcMain.handle('shell:reveal-item-in-dir', (_event, path: string) => {
    shell.showItemInFolder(path)
  })
  ipcMain.handle('usage:claude-rate-limit-status', () => claudeRateLimitStatus())
  ipcMain.handle('usage:cursor-usage-status', () => cursorUsageStatus())
  ipcMain.handle('dialog:open-directory', async (_event, defaultPath?: string) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      defaultPath
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  // pty:spawn is the only handler that needs to *push* data back
  // (terminal output arrives whenever the shell produces it, not in
  // response to a request), so it's the one place wiring to a specific
  // window's webContents.send matters — the rest are plain request/
  // response and don't care which window called them.
  workspace.onTerminalData = (id, data) => {
    mainWindow.webContents.send('pty:data', { id, data })
  }

  ipcMain.handle('pty:spawn', (_event, cols: number, rows: number) => {
    return workspace!.spawnTerminal(cols, rows)
  })
  ipcMain.on('pty:write', (_event, id: number, data: Uint8Array) => {
    workspace!.terminalWrite(id, Buffer.from(data))
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
  ipcMain.handle('workspace:set-tab-layout', (_event, tabId: number, layoutJson: string) => {
    workspace!.setTabLayout(tabId, layoutJson)
    persist()
  })
  ipcMain.handle('workspace:set-tab-root-path', (_event, tabId: number, rootPath: string) => {
    workspace!.setTabRootPath(tabId, rootPath)
    if (tabId === workspace!.state().activeTabId) {
      workspace!.defaultRootPath = rootPath
      saveConfig({ rootPath })
    }
    persist()
    return workspace!.state()
  })

  ipcMain.handle('fs:list-dir', (_event, tabId: number, rel: string) => workspace!.listDir(tabId, rel))
  ipcMain.handle('fs:read-file', (_event, tabId: number, rel: string) => workspace!.readFile(tabId, rel))
  ipcMain.handle('fs:write-file', (_event, tabId: number, rel: string, content: string) =>
    workspace!.writeFile(tabId, rel, content)
  )
  ipcMain.handle('fs:create-dir', (_event, tabId: number, rel: string) => workspace!.createDir(tabId, rel))
  ipcMain.handle('fs:delete-path', (_event, tabId: number, rel: string) => workspace!.deletePath(tabId, rel))
  ipcMain.handle('fs:rename-path', (_event, tabId: number, fromRel: string, toRel: string) =>
    workspace!.renamePath(tabId, fromRel, toRel)
  )

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
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

// Detach tmux clients cleanly on graceful shutdown — see pty.ts's
// dispose() for why this matters (an EOF forwarded into a still-attached
// client's shell would kill the very session this whole feature exists to
// keep alive across restarts).
app.on('before-quit', () => {
  workspace?.disposeAllTerminals()
  fileWatcher?.close()
})
