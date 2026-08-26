import type { Terminal } from "@xterm/xterm";

type LinkifierHoverCache = {
  _lastBufferCell?: unknown;
  _activeLine?: number;
  _clearCurrentLink?: () => void;
  _currentLink?: unknown;
};

type TerminalCoreWithLinkifier = {
  _core?: {
    linkifier?: LinkifierHoverCache;
  };
};

export function resetTerminalLinkifierHoverState(terminal: Terminal): void {
  try {
    const linkifier = (terminal as unknown as TerminalCoreWithLinkifier)._core?.linkifier;
    try {
      linkifier?._clearCurrentLink?.();
    } catch {
      /* provider leave() threw — cache invalidation below still applies */
    }
    if (linkifier && "_currentLink" in linkifier) {
      linkifier._currentLink = undefined;
    }
    if (linkifier && "_lastBufferCell" in linkifier) {
      linkifier._lastBufferCell = undefined;
    }
    if (linkifier && "_activeLine" in linkifier) {
      linkifier._activeLine = -1;
    }
    terminal.element
      ?.querySelector<HTMLElement>(".xterm-screen")
      ?.classList.remove("xterm-cursor-pointer");
  } catch {
    /* linkifier internals unavailable */
  }
}

export function isTerminalLinkifierHoverActive(terminal: Terminal): boolean {
  try {
    const linkifier = (terminal as unknown as TerminalCoreWithLinkifier)._core?.linkifier;
    return Boolean(linkifier && "_currentLink" in linkifier && linkifier._currentLink);
  } catch {
    return false;
  }
}
