import { useEffect, useRef, type MutableRefObject, type RefObject } from "react";
import { useWebviewDragPassthroughActive } from "./useWebviewDragPassthroughActive";
import { browserFocusLog } from "./browserFocusDebugLog";
import type { WebviewGuestFocus } from "./useWebviewGuestFocus";

const GUEST_FOCUS_FRAMES = 6;

/**
 * Hands focus to the browser guest once per chip activation (Orca
 * use-client-hosted-guest-activation-focus). Retries across frames because
 * InteractionCoordinator may flip display/inert a tick later.
 */
export function useBrowserGuestActivationFocus({
  isActive,
  webviewRef,
  guestFocus,
  keepAddressBarFocusRef,
}: {
  isActive: boolean;
  webviewRef: RefObject<Electron.WebviewTag | null>;
  guestFocus: WebviewGuestFocus;
  keepAddressBarFocusRef: MutableRefObject<boolean>;
}): void {
  const dragPassthroughActive = useWebviewDragPassthroughActive();
  const focusedForActivationRef = useRef(false);

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
    if (!guestFocus.isAttached()) return;

    let cancelled = false;
    let frameId = 0;
    let attempts = 0;

    const runFocus = (): void => {
      if (cancelled) return;
      attempts += 1;
      const ok = guestFocus.focus(`activation-attempt-${attempts}`);
      browserFocusLog("useBrowserGuestActivationFocus", "activation focus attempt", {
        attempt: attempts,
        ok,
      });
      if (!ok && attempts < GUEST_FOCUS_FRAMES) {
        frameId = window.requestAnimationFrame(runFocus);
        return;
      }
      if (ok || attempts >= GUEST_FOCUS_FRAMES) {
        focusedForActivationRef.current = true;
      }
    };

    frameId = window.requestAnimationFrame(runFocus);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
    };
  }, [dragPassthroughActive, guestFocus, isActive, keepAddressBarFocusRef, webviewRef]);
}
