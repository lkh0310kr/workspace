import { interactionCoordinator } from "../interaction/InteractionCoordinator";

/**
 * Hide webviews while overlay UI (splitter drag, dropdowns) is open.
 * Restores pointer-events via InteractionCoordinator.reconcile on pop.
 */
export function isOverlayBlocked(): boolean {
  return interactionCoordinator.isOverlayBlocked();
}

export function pushOverlayBlock(source = "overlay"): void {
  interactionCoordinator.pushOverlayBlock(source);
}

export function popOverlayBlock(source = "overlay"): void {
  interactionCoordinator.popOverlayBlock(source);
}
