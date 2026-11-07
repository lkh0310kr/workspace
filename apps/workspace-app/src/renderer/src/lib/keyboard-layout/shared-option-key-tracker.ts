import {
  createOptionKeyLocationTracker,
  type OptionKeyLocationTracker,
} from "./option-key-location-state";

let shared: OptionKeyLocationTracker | null = null;

export function getSharedOptionKeyTracker(): OptionKeyLocationTracker {
  shared ??= createOptionKeyLocationTracker();
  return shared;
}

export function clearSharedOptionKeyTracker(): void {
  shared?.clear();
}
