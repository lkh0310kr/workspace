import type { WebContents } from 'electron'
import {
  extractAllOscTitles,
  normalizeTerminalTitle,
} from '../shared/agent/agent-detection'

let getTargetWebContents: (() => WebContents | null) | null = null
const lastNormalizedTitleByTerminalId = new Map<number, string>()

export function setTerminalOscTitleBroadcastTarget(getter: () => WebContents | null): void {
  getTargetWebContents = getter
}

export function notifyTerminalPtySpawned(terminalId: number): void {
  const wc = getTargetWebContents?.()
  if (!wc || wc.isDestroyed()) return
  wc.send('terminal:pty-spawned', { terminalId })
}

export function observeTerminalPtyOutput(terminalId: number, chunkUtf8: string): void {
  if (!chunkUtf8.includes('\x1b]')) return
  const wc = getTargetWebContents?.()
  if (!wc || wc.isDestroyed()) return

  for (const rawTitle of extractAllOscTitles(chunkUtf8)) {
    const normalizedTitle = normalizeTerminalTitle(rawTitle)
    if (lastNormalizedTitleByTerminalId.get(terminalId) === normalizedTitle) {
      continue
    }
    lastNormalizedTitleByTerminalId.set(terminalId, normalizedTitle)
    wc.send('terminal:osc-title', { terminalId, rawTitle, normalizedTitle })
  }
}

export function clearTerminalOscTitleState(terminalId: number): void {
  lastNormalizedTitleByTerminalId.delete(terminalId)
}
