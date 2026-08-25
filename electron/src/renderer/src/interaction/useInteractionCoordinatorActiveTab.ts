import { useEffect, useState } from "react";
import { interactionCoordinator } from "./InteractionCoordinator";

/** Workspace tab id owned by InteractionCoordinator (optimistic rail clicks). */
export function useInteractionCoordinatorActiveTab(): number | null {
  const [tabId, setTabId] = useState<number | null>(
    () => interactionCoordinator.getSnapshot().activeWorkspaceTabId,
  );

  useEffect(
    () =>
      interactionCoordinator.subscribe(() => {
        setTabId(interactionCoordinator.getSnapshot().activeWorkspaceTabId);
      }),
    [],
  );

  return tabId;
}
