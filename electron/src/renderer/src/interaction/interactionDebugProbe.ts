import { interactionCoordinator } from "./InteractionCoordinator";
import {
  dbgLog,
  fullInteractionDiagnostic,
  getDebugRing,
  summarizePointerEvents,
} from "./interactionDebugLog";

let installed = false;
let clickSeq = 0;

/**
 * Global interaction probe: logs every click, coordinator change, and
 * periodic heartbeat while debugging session 6fd295 is active.
 */
export function installInteractionDebugProbe(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  dbgLog("interactionDebugProbe.ts:install", "probe installed", { href: location.href }, "H0");

  interactionCoordinator.subscribe(() => {
    const snap = interactionCoordinator.getSnapshot();
    dbgLog(
      "InteractionCoordinator:subscribe",
      "coordinator state changed",
      {
        snapshot: snap,
        diagnostic: fullInteractionDiagnostic(),
      },
      "H2",
    );
  });

  // Capture-phase pointerdown — see what actually receives clicks
  document.addEventListener(
    "pointerdown",
    (e) => {
      clickSeq++;
      const atPoint = document.elementFromPoint(e.clientX, e.clientY);
      const target = e.target as Element | null;
      const snap = interactionCoordinator.getSnapshot();
      const diag = fullInteractionDiagnostic(e.clientX, e.clientY);
      const targetChain = summarizePointerEvents(target);
      const blockedInChain = targetChain.some((n) => n.peNone);
      const allWvNone = (diag.webviews as Array<{ inlinePointerEvents: string }>).every(
        (w) => w.inlinePointerEvents === "none",
      );
      const activeHost = (diag.layoutHosts as Array<{ active: boolean; pointerEvents: string }>).find(
        (h) => h.active,
      );

      dbgLog(
        "probe:pointerdown",
        `click #${clickSeq}`,
        {
          seq: clickSeq,
          client: { x: e.clientX, y: e.clientY },
          button: e.button,
          targetTag: target?.tagName ?? "?",
          targetClass: (target as HTMLElement | null)?.className?.slice?.(0, 100) ?? "",
          atPointTag: atPoint?.tagName ?? "null",
          atPointClass: (atPoint as HTMLElement | null)?.className?.slice?.(0, 100) ?? "",
          targetChain,
          blockedInChain,
          coordinator: snap,
          overlayBlocked: interactionCoordinator.isOverlayBlocked(),
          activeHostPointerEvents: activeHost?.pointerEvents ?? "no-active-host",
          allWebviewsPointerNone: allWvNone,
          webviewCount: (diag.webviews as unknown[]).length,
          bodyPortalCount: (diag.appShell as { bodyPortalCount?: number })?.bodyPortalCount,
          diagnostic: diag,
        },
        blockedInChain || snap.overlayBlockCount > 0 ? "H4" : allWvNone ? "H3" : "H1",
      );
    },
    true,
  );

  // Detect clicks that never reach expected targets (rail / layout)
  document.addEventListener(
    "pointerdown",
    (e) => {
      const t = e.target as HTMLElement;
      if (t.closest(".workspace-rail") || t.closest(".layout-host")) {
        dbgLog(
          "probe:pointerdown:reachable",
          "click reached rail or layout-host",
          {
            inRail: !!t.closest(".workspace-rail"),
            inLayout: !!t.closest(".layout-host"),
            tag: t.tagName,
            className: t.className?.slice?.(0, 80) ?? "",
          },
          "H5",
        );
      }
    },
    false,
  );

  window.setInterval(() => {
    const snap = interactionCoordinator.getSnapshot();
    if (snap.overlayBlockCount > 0) return;
    dbgLog(
      "probe:heartbeat",
      "heartbeat",
      {
        snapshot: snap,
        clickSeq,
        ringSize: getDebugRing().length,
        diagnostic: fullInteractionDiagnostic(),
      },
      "H6",
    );
  }, 5000);

  window.addEventListener("focus", () => {
    dbgLog("probe:focus", "window focus", { activeElement: document.activeElement?.tagName }, "H6");
  });

  window.addEventListener("blur", () => {
    dbgLog("probe:blur", "window blur", {}, "H6");
  });
}
