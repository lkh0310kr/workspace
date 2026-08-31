import { app, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'

// Personal daily-driver app: this is expected to stay open for days, so it
// checks for updates itself instead of relying on someone remembering to
// rebuild. Packaged builds only — a dev run (`npm run dev`) is never
// code-signed/published, so update checks there would just fail every time.
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

export function setupAutoUpdate(): void {
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('error', (err) => {
    console.error('[auto-update] error', err)
  })

  autoUpdater.on('update-downloaded', (info) => {
    dialog
      .showMessageBox({
        type: 'info',
        buttons: ['Restart Now', 'Later'],
        defaultId: 0,
        cancelId: 1,
        title: 'Update Available',
        message: `Workspace ${info.version} is ready to install.`,
        detail:
          'Restart now to apply the update, or it will install automatically the next time you quit.'
      })
      .then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall()
      })
      .catch((err) => console.error('[auto-update] prompt failed', err))
  })

  const check = (): void => {
    autoUpdater.checkForUpdates().catch((err) => console.error('[auto-update] check failed', err))
  }

  // Let the app finish starting up before the first check.
  setTimeout(check, 10_000)
  setInterval(check, CHECK_INTERVAL_MS)
}
