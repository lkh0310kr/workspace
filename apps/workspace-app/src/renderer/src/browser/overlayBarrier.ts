import { interactionCoordinator } from "../interaction/InteractionCoordinator";

/**
 * Block or hide webviews while drag overlays are active. Popovers use portal
 * registration instead — those keep the page visible and only block input.
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
