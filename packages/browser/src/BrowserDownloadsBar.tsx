import type { BrowserDownloadItem } from './browserDownloads'
export type { BrowserDownloadItem } from './browserDownloads'

interface Props {
  items: readonly BrowserDownloadItem[]
  onReveal: (path: string) => void
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** i
  return `${value < 10 && i > 0 ? value.toFixed(1) : Math.round(value)} ${units[i]}`
}

function statusLabel(item: BrowserDownloadItem): string {
  if (item.state === 'completed') return 'Done'
  if (item.state === 'cancelled') return 'Cancelled'
  if (item.state === 'interrupted') return 'Failed'
  if (item.totalBytes > 0) {
    const pct = Math.round((item.receivedBytes / item.totalBytes) * 100)
    return `${pct}%`
  }
  return formatBytes(item.receivedBytes)
}

export function BrowserDownloadsBar({ items, onReveal }: Props) {
  if (items.length === 0) return null

  return (
    <div className="browser-downloads-bar" aria-live="polite">
      {items.map((item) => (
        <div key={item.id} className={`browser-download-item browser-download-item--${item.state}`}>
          <div className="browser-download-item-main">
            <span className="browser-download-filename">{item.filename}</span>
            <span className="browser-download-status">{statusLabel(item)}</span>
          </div>
          {item.state === 'progressing' && item.totalBytes > 0 ? (
            <div className="browser-download-progress">
              <div
                className="browser-download-progress-fill"
                style={{ width: `${Math.min(100, (item.receivedBytes / item.totalBytes) * 100)}%` }}
              />
            </div>
          ) : null}
          {item.state === 'completed' && item.path ? (
            <button
              type="button"
              className="browser-download-reveal"
              onClick={() => onReveal(item.path)}
            >
              Show in folder
            </button>
          ) : null}
        </div>
      ))}
    </div>
  )
}
