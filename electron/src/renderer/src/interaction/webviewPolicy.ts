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
 */
export function resolveWebviewPolicy(ctx: WebviewPolicyContext): WebviewPolicy {
  const paneLive = ctx.activeWorkspaceTabId === ctx.workspaceTabId && ctx.paneVisible;
  // Why: Electron <webview> can steal hits even with pointer-events:none while
  // display:flex — hide inactive chips so terminal/editor panes receive clicks.
  const visible = paneLive && !ctx.overlayBlocked && ctx.chipActive;
  const interactive = visible && !ctx.portalsOpen;
  return { visible, interactive };
}

/** Unregistered webview fallback — mid-mount/teardown guests must stay hidden. */
export function resolveOrphanWebviewPolicy(
  _hostWorkspaceTabId: number | null,
  _activeWorkspaceTabId: number | null,
  _overlayBlocked: boolean,
  _portalsOpen: boolean,
): WebviewPolicy {
  // Why: unregisterWebview leaves the DOM node alive for a frame; treating
  // orphans as chip-active re-shows display:flex and steals terminal clicks.
  return { visible: false, interactive: false };
}
