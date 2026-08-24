import { app, shell, BrowserWindow, ipcMain, Menu } from 'electron'
import { join } from 'path'
import { hostname as osHostname } from 'os'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { Workspace } from './workspace'
import { loadConfig, saveConfig, loadWorkspaceSnapshot, saveWorkspaceSnapshot } from './persistence'

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

function persist(): void {
  if (!workspace) return
  saveWorkspaceSnapshot(workspace.state())
  // Mirrors the Rust version's app.emit("workspace-updated", ...) after
  // every mutating command — useWorkspace-equivalent hooks in the
  // renderer (electron.ts's onWorkspaceUpdated) only ever call
  // getWorkspaceState once on mount, so without this push they'd never
  // see another tab/layout change made through any other handler.
  mainWindowRef?.webContents.send('workspace:updated', workspace.state())
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
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

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
})
