import { useEffect, useRef, type MutableRefObject, type RefObject } from "react";
import { useWebviewDragPassthroughActive } from "./useWebviewDragPassthroughActive";
import { browserFocusLog } from "./browserFocusDebugLog";
import { isWebviewHostFocused } from "./browserGuestFocus";
import { interactionCoordinator } from "../interaction/InteractionCoordinator";
import { isBrowserGuestWebContentsFocused } from "../layout/activeBrowserWebview";

const GUEST_FOCUS_FRAMES = 24;

/**
 * Hands focus to the browser guest once per chip activation (Orca
 * use-client-hosted-guest-activation-focus). Retries across frames until the
 * webview is mounted and InteractionCoordinator marks it interactive.
 */
export function useBrowserGuestActivationFocus({
  isActive,
  workspaceTabId,
  paneTabItemId,
  webviewRef,
  keepAddressBarFocusRef,
  webviewReady = false,
}: {
  isActive: boolean;
  workspaceTabId: number;
  paneTabItemId: string;
  webviewRef: RefObject<Electron.WebviewTag | null>;
  keepAddressBarFocusRef: MutableRefObject<boolean>;
  /** Bumps when the guest mounts (webContentsId assigned) so we retry after mount. */
  webviewReady?: boolean;
}): void {
  const dragPassthroughActive = useWebviewDragPassthroughActive();
  const focusedForActivationRef = useRef(false);
  const prevWebviewReadyRef = useRef(false);

  useEffect(() => {
    if (webviewReady && !prevWebviewReadyRef.current) {
      focusedForActivationRef.current = false;
    }
    prevWebviewReadyRef.current = webviewReady;
  }, [webviewReady]);

  useEffect(() => {
    if (!isActive) {
      focusedForActivationRef.current = false;
      return;
    }
    if (focusedForActivationRef.current) return;
    if (dragPassthroughActive) {
      browserFocusLog("useBrowserGuestActivationFocus", "skipped — drag passthrough");
      return;
    }
    if (keepAddressBarFocusRef.current) {
      browserFocusLog("useBrowserGuestActivationFocus", "skipped — address bar grab");
      return;
    }

    let cancelled = false;
    let frameId = 0;
    let attempts = 0;

    const runFocus = (): void => {
      if (cancelled) return;
      attempts += 1;
      const webview = webviewRef.current;
      if (!webview) {
        browserFocusLog("useBrowserGuestActivationFocus", "waiting for webview attach", {
          attempt: attempts,
        });
        if (attempts < GUEST_FOCUS_FRAMES) {
          frameId = window.requestAnimationFrame(runFocus);
        }
        return;
      }
      if (!interactionCoordinator.isGuestInteractive(webview)) {
        browserFocusLog("useBrowserGuestActivationFocus", "waiting for guest interactive", {
          attempt: attempts,
        });
        if (attempts < GUEST_FOCUS_FRAMES) {
          frameId = window.requestAnimationFrame(runFocus);
        }
        return;
      }
      interactionCoordinator.requestBrowserGuestFocus(
        workspaceTabId,
        paneTabItemId,
        `activation-attempt-${attempts}`,
      );
      let guestFocused = false;
      try {
        const id = webview.getWebContentsId();
        guestFocused = isBrowserGuestWebContentsFocused(id);
      } catch {
        /* guest mid-teardown */
      }
      const hostFocused = isWebviewHostFocused(webview);
      if (guestFocused || hostFocused) {
        focusedForActivationRef.current = true;
        browserFocusLog("useBrowserGuestActivationFocus", "activation focus complete", {
          attempt: attempts,
          guestFocused,
          hostFocused,
        });
        return;
      }
      if (attempts < GUEST_FOCUS_FRAMES) {
        frameId = window.requestAnimationFrame(runFocus);
      }
    };

    frameId = window.requestAnimationFrame(runFocus);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
    };
  }, [
    dragPassthroughActive,
    isActive,
    keepAddressBarFocusRef,
    paneTabItemId,
    webviewRef,
    webviewReady,
    workspaceTabId,
  ]);
}
