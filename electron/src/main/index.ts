import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { spawnTerminal, writeTerminal, resizeTerminal, disposeTerminal, disposeAllTerminals } from './terminals'

function createWindow(): BrowserWindow {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
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

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  const mainWindow = createWindow()

  // pty:spawn is the only handler that needs to *push* data back
  // (terminal output arrives whenever the shell produces it, not in
  // response to a request), so it's the one place wiring to a specific
  // window's webContents.send matters — the rest are plain request/
  // response and don't care which window called them.
  ipcMain.handle('pty:spawn', (_event, cols: number, rows: number, cwd: string | undefined) => {
    const id = spawnTerminal(cols, rows, cwd, (data) => {
      mainWindow.webContents.send('pty:data', { id, data })
    })
    return id
  })

  ipcMain.on('pty:write', (_event, id: number, data: Uint8Array) => {
    writeTerminal(id, Buffer.from(data))
  })

  ipcMain.on('pty:resize', (_event, id: number, cols: number, rows: number) => {
    resizeTerminal(id, cols, rows)
  })

  ipcMain.on('pty:dispose', (_event, id: number) => {
    disposeTerminal(id)
  })

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
  disposeAllTerminals()
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
