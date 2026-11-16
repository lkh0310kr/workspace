import { registerKeyboardSurfaceRelease } from '../../../interaction/focus/keyboardSurface'

const releaseTerminalFocus = new Map<number, () => void>()

export function registerTerminalKeyboardTarget(
  terminalId: number,
  releaseFocus: () => void
): () => void {
  releaseTerminalFocus.set(terminalId, releaseFocus)
  return () => {
    if (releaseTerminalFocus.get(terminalId) === releaseFocus) {
      releaseTerminalFocus.delete(terminalId)
    }
  }
}

function releaseAllTerminalKeyboardFocus(): void {
  for (const release of releaseTerminalFocus.values()) {
    try {
      release()
    } catch {
      /* a terminal may be tearing down */
    }
  }
  try {
    window.api.terminal.setFocused(null)
  } catch {
    /* preload may be unavailable in tests */
  }
}

registerKeyboardSurfaceRelease('terminal', ['browser'], releaseAllTerminalKeyboardFocus)
