import {
  clearWorkingIndicators,
  createAgentStatusTracker,
  detectAgentStatusFromTitle,
  extractAllOscTitles,
  isCursorNativeAgentTitle,
  normalizeTerminalTitle,
  shouldSuppressCursorNativeTitle,
} from '../../../shared/agent/agent-detection'

const STALE_TITLE_TIMEOUT = 3_000

export type PtyOutputTitleObserver = {
  getLastEmittedTitle: () => string | null
  observePtyChunk: (data: string) => void
  reset: () => void
}

export function createPtyOutputTitleObserver(options: {
  onTitleChange?: (normalized: string, raw: string) => void
  onAgentBecameIdle?: (title: string, meta?: { staleWorkingTitleClear?: boolean }) => void
  onAgentBecameWorking?: () => void
  onAgentExited?: () => void
  initialAgentTitle?: string
}): PtyOutputTitleObserver {
  let lastEmittedTitle: string | null =
    options.initialAgentTitle !== undefined ? normalizeTerminalTitle(options.initialAgentTitle) : null
  let staleTitleTimer: ReturnType<typeof setTimeout> | null = null
  const initialTrackerTitle =
    options.initialAgentTitle !== undefined && !isCursorNativeAgentTitle(options.initialAgentTitle)
      ? options.initialAgentTitle
      : undefined
  const agentTracker =
    options.onAgentBecameIdle || options.onAgentBecameWorking || options.onAgentExited
      ? createAgentStatusTracker(
          (title) => options.onAgentBecameIdle?.(title),
          options.onAgentBecameWorking,
          options.onAgentExited,
          initialTrackerTitle,
        )
      : null

  function isWorkingTitle(title: string | null): boolean {
    return title !== null && detectAgentStatusFromTitle(title) === 'working'
  }

  function applyObservedTerminalTitle(title: string): void {
    lastEmittedTitle = normalizeTerminalTitle(title)
    options.onTitleChange?.(lastEmittedTitle, title)
    agentTracker?.handleTitle(title)
  }

  function clearStaleTitleTimer(): void {
    if (staleTitleTimer !== null) {
      clearTimeout(staleTitleTimer)
      staleTitleTimer = null
    }
  }

  const observePtyChunk = (data: string): void => {
    if (!options.onTitleChange || !data.includes('\x1b]')) return
    const titles = extractAllOscTitles(data)
    if (titles.length > 0) {
      clearStaleTitleTimer()
      for (const title of titles) {
        if (isCursorNativeAgentTitle(title)) {
          if (!shouldSuppressCursorNativeTitle(lastEmittedTitle)) {
            applyObservedTerminalTitle(title)
          }
          continue
        }
        applyObservedTerminalTitle(title)
      }
      return
    }
    if (isWorkingTitle(lastEmittedTitle)) {
      clearStaleTitleTimer()
      staleTitleTimer = setTimeout(() => {
        staleTitleTimer = null
        if (isWorkingTitle(lastEmittedTitle)) {
          const cleared = clearWorkingIndicators(lastEmittedTitle ?? '')
          lastEmittedTitle = cleared
          options.onTitleChange?.(cleared, cleared)
          options.onAgentBecameIdle?.(cleared, { staleWorkingTitleClear: true })
          agentTracker?.handleTitle(cleared)
        }
      }, STALE_TITLE_TIMEOUT)
    }
  }

  return {
    getLastEmittedTitle: () => lastEmittedTitle,
    observePtyChunk,
    reset: () => {
      clearStaleTitleTimer()
      agentTracker?.reset()
    },
  }
}
