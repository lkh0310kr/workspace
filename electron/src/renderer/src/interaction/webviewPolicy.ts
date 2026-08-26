export type WebviewPolicy = {
  visible: boolean;
  interactive: boolean;
};

export type WebviewPolicyContext = {
  workspaceTabId: number;
  /** Pane chip is live (workspace tab + flexlayout pane visibility). */
  paneVisible: boolean;
  activeWorkspaceTabId: number | null;
  overlayBlocked: boolean;
  portalsOpen: boolean;
};

/**
 * Native embed display/input policy for registered browser guests.
 * Drag overlays hide the guest (display:none); portals keep it visible but block input.
 */
export function resolveWebviewPolicy(ctx: WebviewPolicyContext): WebviewPolicy {
  const paneLive = ctx.activeWorkspaceTabId === ctx.workspaceTabId && ctx.paneVisible;
  const visible = paneLive && !ctx.overlayBlocked;
  const interactive = paneLive && !ctx.overlayBlocked && !ctx.portalsOpen;
  return { visible, interactive };
}

/** Unregistered webview fallback — host workspace tab is the only visibility signal. */
export function resolveOrphanWebviewPolicy(
  hostWorkspaceTabId: number | null,
  activeWorkspaceTabId: number | null,
  overlayBlocked: boolean,
  portalsOpen: boolean,
): WebviewPolicy {
  if (hostWorkspaceTabId === null) {
    return { visible: false, interactive: false };
  }
  return resolveWebviewPolicy({
    workspaceTabId: hostWorkspaceTabId,
    paneVisible: true,
    activeWorkspaceTabId,
    overlayBlocked,
    portalsOpen,
  });
}
