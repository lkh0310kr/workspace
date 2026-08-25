/**
 * Interaction debug logging — NDJSON file (main process) + in-memory ring buffer.
 */

const MAX_RING = 300;

export type DebugLogEntry = {
  sessionId: string;
  timestamp: number;
  location: string;
  message: string;
  hypothesisId?: string;
  runId?: string;
  data?: Record<string, unknown>;
};

const ring: DebugLogEntry[] = [];

export function dbgLog(
  location: string,
  message: string,
  data?: Record<string, unknown>,
  hypothesisId?: string,
  runId = "runtime",
): void {
  const entry: DebugLogEntry = {
    sessionId: "interaction",
    timestamp: Date.now(),
    location,
    message,
    hypothesisId,
    runId,
    data,
  };
  ring.push(entry);
  if (ring.length > MAX_RING) ring.shift();
  // #region agent log
  try {
    window.api?.debug?.interactionLog(entry as Record<string, unknown>);
  } catch {
    /* ignore */
  }
  // #endregion
}

export function getDebugRing(): readonly DebugLogEntry[] {
  return ring;
}

export function summarizePointerEvents(el: Element | null, maxDepth = 12): Array<{
  tag: string;
  id: string;
  className: string;
  pointerEvents: string;
  visibility: string;
  display: string;
  zIndex: string;
  peNone: boolean;
}> {
  const chain: ReturnType<typeof summarizePointerEvents> = [];
  let node: Element | null = el;
  let depth = 0;
  while (node && depth < maxDepth) {
    const html = node as HTMLElement;
    const style = window.getComputedStyle(html);
    const pe = style.pointerEvents;
    chain.push({
      tag: node.tagName.toLowerCase(),
      id: html.id || "",
      className: typeof html.className === "string" ? html.className.slice(0, 120) : "",
      pointerEvents: pe,
      visibility: style.visibility,
      display: style.display,
      zIndex: style.zIndex,
      peNone: pe === "none",
    });
    node = node.parentElement;
    depth++;
  }
  return chain;
}

export function collectLayoutHosts(): Array<Record<string, unknown>> {
  return [...document.querySelectorAll(".layout-host-item")].map((el) => {
    const html = el as HTMLElement;
    const s = window.getComputedStyle(html);
    return {
      tabId: html.getAttribute("data-workspace-tab-id"),
      className: html.className,
      visibility: s.visibility,
      pointerEvents: s.pointerEvents,
      display: s.display,
      zIndex: s.zIndex,
      active: html.classList.contains("layout-host-item--active"),
    };
  });
}

export function collectWebviews(): Array<Record<string, unknown>> {
  return [...document.querySelectorAll("webview")].map((el) => {
    const wv = el as Electron.WebviewTag;
    const s = window.getComputedStyle(wv);
    const host = wv.closest("[data-workspace-tab-id]");
    return {
      tabItemId: wv.dataset.tabItemId ?? "",
      workspaceTabId: host?.getAttribute("data-workspace-tab-id") ?? "",
      inlinePointerEvents: wv.style.pointerEvents,
      computedPointerEvents: s.pointerEvents,
      visibility: s.visibility,
      display: s.display,
      url: (() => {
        try {
          return wv.getURL();
        } catch {
          return "?";
        }
      })(),
    };
  });
}

export function collectBodyPortals(): Array<Record<string, unknown>> {
  const portals: Array<Record<string, unknown>> = [];
  for (const el of document.querySelectorAll("body > *")) {
    const html = el as HTMLElement;
    const s = window.getComputedStyle(html);
    const rect = html.getBoundingClientRect();
    const coversScreen =
      rect.width >= window.innerWidth * 0.9 && rect.height >= window.innerHeight * 0.9;
    if (
      coversScreen ||
      html.classList.contains("popover") ||
      html.classList.contains("popover-catcher") ||
      s.pointerEvents !== "none" &&
        (s.zIndex !== "auto" && Number(s.zIndex) > 1000)
    ) {
      portals.push({
        tag: html.tagName,
        className: html.className.slice(0, 80),
        pointerEvents: s.pointerEvents,
        visibility: s.visibility,
        display: s.display,
        zIndex: s.zIndex,
        rect: { w: rect.width, h: rect.height, top: rect.top, left: rect.left },
        coversScreen,
      });
    }
  }
  return portals;
}

export function collectAppShell(): Record<string, unknown> {
  const shell = document.querySelector(".app-shell");
  const layoutHost = document.querySelector(".layout-host");
  const shellStyle = shell ? window.getComputedStyle(shell as HTMLElement) : null;
  const hostStyle = layoutHost ? window.getComputedStyle(layoutHost as HTMLElement) : null;
  return {
    activeElement: document.activeElement
      ? {
          tag: document.activeElement.tagName,
          className: (document.activeElement as HTMLElement).className?.slice?.(0, 80) ?? "",
        }
      : null,
    appShell: shellStyle
      ? { pointerEvents: shellStyle.pointerEvents, visibility: shellStyle.visibility }
      : null,
    layoutHost: hostStyle
      ? { pointerEvents: hostStyle.pointerEvents, visibility: hostStyle.visibility }
      : null,
    bodyPortalCount: document.querySelectorAll(".popover").length,
    popoverCatcherCount: document.querySelectorAll(".popover-catcher").length,
  };
}

export function fullInteractionDiagnostic(centerX?: number, centerY?: number): Record<string, unknown> {
  const cx = centerX ?? Math.floor(window.innerWidth / 2);
  const cy = centerY ?? Math.floor(window.innerHeight / 2);
  const atPoint = document.elementFromPoint(cx, cy);
  return {
    clickPoint: { x: cx, y: cy },
    elementAtPoint: atPoint
      ? {
          tag: atPoint.tagName,
          className: (atPoint as HTMLElement).className?.slice?.(0, 100) ?? "",
        }
      : null,
    pointerChain: summarizePointerEvents(atPoint),
    layoutHosts: collectLayoutHosts(),
    webviews: collectWebviews(),
    bodyPortals: collectBodyPortals(),
    appShell: collectAppShell(),
    flexlayoutSplitter: [...document.querySelectorAll(".flexlayout__splitter")].map((el) => {
      const s = window.getComputedStyle(el as HTMLElement);
      return { pointerEvents: s.pointerEvents, display: s.display };
    }),
  };
}
