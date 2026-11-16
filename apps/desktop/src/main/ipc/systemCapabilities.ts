import { BrowserWindow, clipboard, ipcMain, shell } from 'electron'
import { cpus, freemem, homedir, hostname, platform, release, totalmem, uptime } from 'node:os'
import { statfsSync } from 'node:fs'
import { assertClipboardImageDimensionsWithinLimit } from '../../shared/clipboard-image'
import type { UsageMeterSettings } from '../../shared/usage-meter-settings'
import { saveClipboardImageBufferAsTempFile } from '../clipboard/clipboardImageTempFile'
import { appendAppLog, appendConsoleLog, appendNdjsonLog, getLogsDir } from '../debugLogSink'
import { appendLayoutLog } from '../layoutDebugLog'
import { appendTerminalLog } from '../terminalDebugLog'
import { claudeRateLimitStatus, cursorUsageStatus, codexRateLimitStatus } from '../usage'
import { loadUsageMeterSettings, saveUsageMeterSettings } from '../usageMeterConfig'
import { pickDirectory, pickMediaFile } from '../nativeDialogs'
import { isWsl } from '../wslPaths'
import { toggleWslWindowMaximize } from '../wslWindow'

export function registerSystemCapabilityIpc(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle('hostname', () => hostname())
  ipcMain.handle('app:platform', () => process.platform)
  let previousCpu: { idle: number; total: number } | null = null
  ipcMain.handle('system:summary', () => {
    const cores = cpus()
    const cpu = cores.reduce(
      (sum, core) => {
        const times = core.times
        return {
          idle: sum.idle + times.idle,
          total: sum.total + Object.values(times).reduce((a, b) => a + b, 0)
        }
      },
      { idle: 0, total: 0 }
    )
    const cpuPercent =
      previousCpu && cpu.total > previousCpu.total
        ? Math.round(100 * (1 - (cpu.idle - previousCpu.idle) / (cpu.total - previousCpu.total)))
        : null
    previousCpu = cpu
    let disk: { total: number; available: number } | null = null
    try {
      const fs = statfsSync(homedir())
      disk = { total: fs.blocks * fs.bsize, available: fs.bavail * fs.bsize }
    } catch {
      /* filesystem metrics may be unavailable on virtual or remote home directories */
    }
    return {
      hostname: hostname(),
      platform: platform(),
      release: release(),
      arch: process.arch,
      cpuPercent,
      cpuCores: cores.length,
      memoryTotal: totalmem(),
      memoryAvailable: freemem(),
      diskTotal: disk?.total ?? null,
      diskAvailable: disk?.available ?? null,
      uptimeSeconds: uptime()
    }
  })
  ipcMain.on('window:minimize', (event) => BrowserWindow.fromWebContents(event.sender)?.minimize())
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
  ipcMain.on('window:close', (event) => BrowserWindow.fromWebContents(event.sender)?.close())
  ipcMain.on('debug:interaction-log', (_event, entry: Record<string, unknown>) => {
    appendNdjsonLog('interaction.ndjson', entry)
  })
  ipcMain.on('debug:terminal-log', (_event, entry: Record<string, unknown>) =>
    appendTerminalLog(entry)
  )
  ipcMain.on('debug:layout-log', (_event, entry: Record<string, unknown>) => appendLayoutLog(entry))
  ipcMain.on(
    'debug:app-log',
    (_event, source: string, level: string, event: string, data?: Record<string, unknown>) =>
      appendAppLog(source, level as 'log' | 'info' | 'warn' | 'error' | 'debug', event, data)
  )
  ipcMain.on(
    'debug:error-log',
    (_event, message: string, stack?: string, extra?: Record<string, unknown>) => {
      appendNdjsonLog('errors.ndjson', {
        ts: new Date().toISOString(),
        source: 'renderer',
        level: 'error',
        message,
        stack: stack ?? null,
        ...(extra ?? {})
      })
    }
  )
  ipcMain.on('debug:console-log', (_event, level: string, args: unknown[]) =>
    appendConsoleLog('renderer', level as 'log' | 'info' | 'warn' | 'error' | 'debug', args)
  )
  ipcMain.handle('debug:get-logs-dir', () => getLogsDir())
  ipcMain.on('clipboard:write-text', (_event, text: string) => clipboard.writeText(text))
  ipcMain.handle('clipboard:read-text', () => clipboard.readText())
  ipcMain.handle('clipboard:save-image-as-temp-file', () => {
    const image = clipboard.readImage()
    if (image.isEmpty()) return null
    assertClipboardImageDimensionsWithinLimit(image.getSize())
    return saveClipboardImageBufferAsTempFile(image.toPNG())
  })
  ipcMain.handle('shell:reveal-item-in-dir', (_event, path: string) => shell.showItemInFolder(path))
  ipcMain.handle('usage:claude-rate-limit-status', () => claudeRateLimitStatus())
  ipcMain.handle('usage:cursor-usage-status', () => cursorUsageStatus())
  ipcMain.handle('usage:codex-rate-limit-status', () => codexRateLimitStatus())
  ipcMain.handle('usage:meter-settings-get', () => loadUsageMeterSettings())
  ipcMain.handle('usage:meter-settings-save', (_event, settings: unknown) =>
    saveUsageMeterSettings(settings as UsageMeterSettings)
  )
  ipcMain.handle('dialog:open-directory', async (_event, defaultPath?: string) =>
    pickDirectory(getMainWindow(), defaultPath)
  )
  ipcMain.handle('dialog:pick-media-file', async (_event, kind: 'video' | 'audio' | 'ebook') =>
    pickMediaFile(getMainWindow(), kind)
  )
}
