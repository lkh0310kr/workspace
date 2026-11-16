import { dialog } from 'electron'
import { autoUpdater } from 'electron-updater'
import { appendStartupLog, isPackagedApp } from './startupLog'

let initialized = false
let checkInProgress = false
let manualCheck = false

/** Enable GitHub Releases based updates for signed, packaged desktop builds. */
export function initializeAutoUpdates(): void {
  if (initialized || !isPackagedApp() || !['darwin', 'win32'].includes(process.platform)) return
  initialized = true

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('checking-for-update', () => appendStartupLog('updater_checking'))
  autoUpdater.on('update-available', (info) => {
    appendStartupLog('updater_available', { version: info.version })
  })
  autoUpdater.on('update-not-available', (info) => {
    appendStartupLog('updater_not_available', { version: info.version })
    if (manualCheck) {
      void dialog.showMessageBox({
        type: 'info',
        title: 'Workspace 업데이트',
        message: '현재 최신 버전을 사용하고 있습니다.'
      })
    }
    manualCheck = false
    checkInProgress = false
  })
  autoUpdater.on('download-progress', (progress) => {
    appendStartupLog('updater_download_progress', {
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total
    })
  })
  autoUpdater.on('update-downloaded', (info) => {
    appendStartupLog('updater_downloaded', { version: info.version })
    manualCheck = false
    checkInProgress = false
    void dialog
      .showMessageBox({
        type: 'info',
        title: 'Workspace 업데이트 준비 완료',
        message: `Workspace ${info.version} 업데이트를 다운로드했습니다. 지금 재시작해 설치할까요?`,
        buttons: ['지금 재시작', '나중에'],
        defaultId: 0,
        cancelId: 1
      })
      .then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall()
      })
  })
  autoUpdater.on('error', (error) => {
    appendStartupLog('updater_error', { message: error.message })
    if (manualCheck) {
      void dialog.showMessageBox({
        type: 'error',
        title: 'Workspace 업데이트 확인 실패',
        message: '업데이트 서버에 연결하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.',
        detail: error.message
      })
    }
    manualCheck = false
    checkInProgress = false
  })

  // Let the main window finish opening before network access or prompts.
  setTimeout(() => void checkForUpdates(false), 12_000).unref()
}

export async function checkForUpdatesByUser(): Promise<void> {
  if (!isPackagedApp() || !['darwin', 'win32'].includes(process.platform)) {
    await dialog.showMessageBox({
      type: 'info',
      title: 'Workspace 업데이트',
      message: '업데이트 확인은 설치된 앱에서 사용할 수 있습니다.'
    })
    return
  }
  await checkForUpdates(true)
}

async function checkForUpdates(fromUser: boolean): Promise<void> {
  if (checkInProgress) return
  checkInProgress = true
  manualCheck = fromUser
  try {
    await autoUpdater.checkForUpdates()
  } catch (error) {
    appendStartupLog('updater_check_failed', {
      message: error instanceof Error ? error.message : String(error)
    })
    checkInProgress = false
    if (manualCheck) {
      manualCheck = false
      await dialog.showMessageBox({
        type: 'error',
        title: 'Workspace 업데이트 확인 실패',
        message: '업데이트 서버에 연결하지 못했습니다.',
        detail: error instanceof Error ? error.message : String(error)
      })
    }
  }
}
