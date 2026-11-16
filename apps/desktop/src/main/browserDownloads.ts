import { app, session, shell, type DownloadItem, type WebContents } from 'electron'
import { join } from 'path'
import { BROWSER_SESSION_PARTITION } from './browserSession'

export interface BrowserDownloadPayload {
  id: string
  hostWebContentsId: number
  phase: 'started' | 'updated' | 'done'
  filename?: string
  url?: string
  path?: string
  receivedBytes?: number
  totalBytes?: number
  state?: 'progressing' | 'interrupted' | 'completed' | 'cancelled'
}

type SendFn = (channel: string, ...args: unknown[]) => void

export function setupBrowserDownloads(send: SendFn): void {
  const sess = session.fromPartition(BROWSER_SESSION_PARTITION)
  sess.on('will-download', (_event, item: DownloadItem, webContents: WebContents) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const filename = item.getFilename()
    const savePath = join(app.getPath('downloads'), filename)
    item.setSavePath(savePath)

    const base = { id, hostWebContentsId: webContents.id }

    send('browser:download-event', {
      ...base,
      phase: 'started',
      filename,
      url: item.getURL(),
      path: savePath,
      receivedBytes: 0,
      totalBytes: item.getTotalBytes(),
      state: 'progressing'
    } satisfies BrowserDownloadPayload)

    item.on('updated', (_e, state) => {
      send('browser:download-event', {
        ...base,
        phase: 'updated',
        receivedBytes: item.getReceivedBytes(),
        totalBytes: item.getTotalBytes(),
        state
      } satisfies BrowserDownloadPayload)
    })

    item.on('done', (_e, state) => {
      send('browser:download-event', {
        ...base,
        phase: 'done',
        path: savePath,
        state
      } satisfies BrowserDownloadPayload)
    })
  })
}

export function revealDownloadInFolder(path: string): void {
  shell.showItemInFolder(path)
}
