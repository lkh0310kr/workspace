import { useEffect, useState } from "react";
import { isDevInstrumentation } from "../debug/devTools";
import {
  interactionCoordinator,
  type InteractionSnapshot,
} from "../interaction/InteractionCoordinator";
import { fullInteractionDiagnostic, getDebugRing } from "../interaction/interactionDebugLog";

function InteractionDebugPanelInner() {
  const [expanded, setExpanded] = useState(false);
  const [snapshot, setSnapshot] = useState<InteractionSnapshot>(() =>
    interactionCoordinator.getSnapshot(),
  );
  const [ringSize, setRingSize] = useState(0);

  useEffect(
    () =>
      interactionCoordinator.subscribe(() => {
        setSnapshot(interactionCoordinator.getSnapshot());
        setRingSize(getDebugRing().length);
      }),
    [],
  );

  const stuck = snapshot.overlayBlockCount > 0;

  const dumpLogs = () => {
    const payload = {
      snapshot,
      ring: getDebugRing(),
      diagnostic: fullInteractionDiagnostic(),
    };
    console.log("[IC dump]", payload);
    try {
      navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="interaction-debug-panel">
      {expanded && (
        <div className="interaction-debug-body">
          <div className="interaction-debug-row">
            <span>Overlay blocks</span>
            <strong>{snapshot.overlayBlockCount}</strong>
          </div>
          {snapshot.overlaySources.length > 0 && (
            <pre className="interaction-debug-pre">{snapshot.overlaySources.join("\n")}</pre>
          )}
          <div className="interaction-debug-row">
            <span>Active workspace tab</span>
            <strong>{snapshot.activeWorkspaceTabId ?? "—"}</strong>
          </div>
          <div className="interaction-debug-row">
            <span>Registered webviews</span>
            <strong>{snapshot.registeredWebviewCount}</strong>
          </div>
          <div className="interaction-debug-row">
            <span>Open portals</span>
            <strong>{snapshot.portalIds.length}</strong>
          </div>
          <div className="interaction-debug-row">
            <span>Debug ring</span>
            <strong>{ringSize}</strong>
          </div>
          {snapshot.portalIds.length > 0 && (
            <pre className="interaction-debug-pre">{snapshot.portalIds.join("\n")}</pre>
          )}
          <div className="interaction-debug-row">
            <span>Last reconcile</span>
            <strong className="interaction-debug-reason">{snapshot.lastReconcileReason}</strong>
          </div>
          <button type="button" className="interaction-debug-clear" onClick={dumpLogs}>
            Dump logs to console + clipboard
          </button>
          {stuck && (
            <button
              type="button"
              className="interaction-debug-clear"
              onClick={() => interactionCoordinator.clearOverlayBlocks("debug-clear")}
            >
              Clear overlay blocks
            </button>
          )}
        </div>
      )}
      <button
        type="button"
        className={`interaction-debug-badge${stuck ? " stuck" : ""}`}
        onClick={() => setExpanded((v) => !v)}
        title="Interaction coordinator debug"
      >
        IC {stuck ? "!" : snapshot.overlayBlockCount}
      </button>
    </div>
  );
}

export function InteractionDebugPanel() {
  if (!isDevInstrumentation) return null;
  return <InteractionDebugPanelInner />;
}
