import { interactionCoordinator } from "./interaction/InteractionCoordinator";

/** Workspace-tab switches keep every tab's pane tree mounted — portaled UI
 * must be torn down on switch. */
export const WORKSPACE_DISMISS_PORTALS_EVENT = "workspace:dismiss-portals";

export function dismissWorkspacePortals(): void {
  interactionCoordinator.dismissAllPortals();
  window.dispatchEvent(new CustomEvent(WORKSPACE_DISMISS_PORTALS_EVENT));
}

export function onWorkspaceDismissPortals(handler: () => void): () => void {
  window.addEventListener(WORKSPACE_DISMISS_PORTALS_EVENT, handler);
  return () => window.removeEventListener(WORKSPACE_DISMISS_PORTALS_EVENT, handler);
}
