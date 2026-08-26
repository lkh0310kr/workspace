export type WebviewPolicy = {
  visible: boolean;
  interactive: boolean;
};

export type WebviewPolicyContext = {
  workspaceTabId: number;
  /** Flexlayout pane is visible in the active workspace tab (not chip-active). */
  paneVisible: boolean;
  /** Browser chip is the active tab in its pane group. */
  chipActive: boolean;
  activeWorkspaceTabId: number | null;
  overlayBlocked: boolean;
  portalsOpen: boolean;
};

/**
 * Native embed display/input policy for registered browser guests.
 * Drag overlays hide the guest (display:none); portals keep it visible but block input.
 * Keep `visible` when only the chip changes so Electron webview compositing survives chip switches.
 */
export function resolveWebviewPolicy(ctx: WebviewPolicyContext): WebviewPolicy {
  const paneLive = ctx.activeWorkspaceTabId === ctx.workspaceTabId && ctx.paneVisible;
  const visible = paneLive && !ctx.overlayBlocked;
  const interactive = paneLive && ctx.chipActive && !ctx.overlayBlocked && !ctx.portalsOpen;
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
    chipActive: true,
    activeWorkspaceTabId,
    overlayBlocked,
    portalsOpen,
  });
}
