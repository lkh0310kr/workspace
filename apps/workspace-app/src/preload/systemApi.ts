import { ipcRenderer } from 'electron'

export const systemApi = {
  hostname: (): Promise<string> => ipcRenderer.invoke('hostname'),
  system: {
    summary: (): Promise<{
      hostname: string; platform: string; release: string; arch: string;
      cpuPercent: number | null; cpuCores: number; memoryTotal: number; memoryAvailable: number;
      diskTotal: number | null; diskAvailable: number | null; uptimeSeconds: number;
    }> => ipcRenderer.invoke('system:summary')
  },
  platform: process.platform as NodeJS.Platform,
  platformInfo: {
    get: () => ({
      platform: process.platform,
      osRelease:
        (process as NodeJS.Process & { getSystemVersion?: () => string }).getSystemVersion?.() ??
        '',
      arch: process.arch,
      shell: process.env.SHELL?.trim() || process.env.ComSpec?.trim() || '',
    }),
  },
  isWsl:
    process.platform === 'linux' &&
    ((): boolean => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return require('fs').readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft')
      } catch {
        return false
      }
    })(),
  windowControls: {
    minimize: (): void => ipcRenderer.send('window:minimize'),
    maximize: (): void => ipcRenderer.send('window:maximize'),
    close: (): void => ipcRenderer.send('window:close')
  },
  shell: {
    revealItemInDir: (path: string): Promise<void> => ipcRenderer.invoke('shell:reveal-item-in-dir', path)
  },
  usage: {
    claudeRateLimitStatus: (): Promise<unknown> => ipcRenderer.invoke('usage:claude-rate-limit-status'),
    cursorUsageStatus: (): Promise<unknown> => ipcRenderer.invoke('usage:cursor-usage-status'),
    codexRateLimitStatus: (): Promise<unknown> => ipcRenderer.invoke('usage:codex-rate-limit-status'),
    meterSettingsGet: (): Promise<unknown> => ipcRenderer.invoke('usage:meter-settings-get'),
    meterSettingsSave: (settings: unknown): Promise<void> =>
      ipcRenderer.invoke('usage:meter-settings-save', settings)
  },
  dialog: {
    openDirectory: (defaultPath?: string) => ipcRenderer.invoke('dialog:open-directory', defaultPath),
    pickMediaFile: (kind: 'video' | 'audio' | 'ebook') =>
      ipcRenderer.invoke('dialog:pick-media-file', kind)
  },
  clipboard: {
    writeText: (text: string): void => ipcRenderer.send('clipboard:write-text', text),
    readText: (): Promise<string> => ipcRenderer.invoke('clipboard:read-text'),
    saveImageAsTempFile: (): Promise<string | null> =>
      ipcRenderer.invoke('clipboard:save-image-as-temp-file')
  },
  debug: {
    interactionLog: (entry: Record<string, unknown>): void =>
      ipcRenderer.send('debug:interaction-log', entry),
    terminalLog: (entry: Record<string, unknown>): void =>
      ipcRenderer.send('debug:terminal-log', entry),
    layoutLog: (entry: Record<string, unknown>): void =>
      ipcRenderer.send('debug:layout-log', entry),
    appLog: (
      source: string,
      level: 'log' | 'info' | 'warn' | 'error' | 'debug',
      event: string,
      data?: Record<string, unknown>,
    ): void => ipcRenderer.send('debug:app-log', source, level, event, data),
    errorLog: (message: string, stack?: string, extra?: Record<string, unknown>): void =>
      ipcRenderer.send('debug:error-log', message, stack, extra),
    consoleLog: (level: 'log' | 'info' | 'warn' | 'error' | 'debug', args: unknown[]): void =>
      ipcRenderer.send('debug:console-log', level, args),
    getLogsDir: (): Promise<string> => ipcRenderer.invoke('debug:get-logs-dir'),
  }
}
