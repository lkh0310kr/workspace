import { useEffect, useState } from "react";
import type { TabNode } from "flexlayout-react";
import { interactionCoordinator } from "../interaction/InteractionCoordinator";
import { useLayoutRevision } from "../hooks/useLayoutRevision";
import { useWorkspaceScope } from "../interaction/useWorkspaceScope";

/**
 * Single source of truth for whether a PaneGroup should show live content.
 * Do NOT pass visibility through flexlayout's factory closure — it goes stale
 * when the workspace tab switches because flexlayout does not re-invoke factory.
 */
export function usePaneVisibility(workspaceTabId: number, tabNode: TabNode): boolean {
  const layoutRevision = useLayoutRevision(workspaceTabId);
  const { visibleWorkspaceTabId } = useWorkspaceScope();
  const [, tick] = useState(0);

  useEffect(() => {
    return interactionCoordinator.subscribe(() => tick((n) => n + 1));
  }, []);

  useEffect(() => {
    const nodeId = tabNode.getId();
    const el = document.getElementById(`flexlayout-tab-${nodeId}`);
    if (!el) return;
    const sync = (): void => tick((n) => n + 1);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    const mo = new MutationObserver(sync);
    mo.observe(el, { attributes: true, attributeFilter: ["style", "class"] });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [tabNode]);

  void layoutRevision;

  return workspaceTabId === visibleWorkspaceTabId && tabNode.isVisible();
}
