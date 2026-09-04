import { useCallback, useEffect, useRef, type MutableRefObject, type RefObject } from "react";
import type { WebviewGuestFocus } from "./useWebviewGuestFocus";

const ADDRESS_BAR_FOCUS_FRAMES = 6;

/**
 * Address bar vs guest focus for browser chrome (Orca use-browser-page-chrome-focus,
 * trimmed to Workspace's single-window model).
 */
export function useBrowserChromeFocus({
  chipShown,
  addressBarInputRef,
  guestFocus,
}: {
  chipShown: boolean;
  addressBarInputRef: RefObject<HTMLInputElement | null>;
  guestFocus: WebviewGuestFocus;
}): {
  focusAddressBarNow: () => boolean;
  focusGuestNow: () => boolean;
  keepAddressBarFocusRef: MutableRefObject<boolean>;
} {
  const keepAddressBarFocusRef = useRef(false);
  const addressBarFocusGrabRef = useRef<(() => void) | null>(null);

  const cancelAddressBarFocusGrab = useCallback((): void => {
    addressBarFocusGrabRef.current?.();
  }, []);

  const focusAddressBarNow = useCallback((): boolean => {
    const input = addressBarInputRef.current;
    if (!input) return false;
    guestFocus.blur();
    input.focus();
    input.select();
    return document.activeElement === input;
  }, [addressBarInputRef, guestFocus]);

  const focusGuestNow = useCallback((): boolean => {
    if (!guestFocus.isAttached()) return false;
    addressBarInputRef.current?.blur();
    return guestFocus.focus();
  }, [addressBarInputRef, guestFocus]);

  const startAddressBarFocusGrab = useCallback((): (() => void) => {
    cancelAddressBarFocusGrab();
    let cancelled = false;
    let frameId = 0;
    let attempts = 0;
    const cancel = (): void => {
      if (addressBarFocusGrabRef.current !== cancel) return;
      addressBarFocusGrabRef.current = null;
      cancelled = true;
      window.cancelAnimationFrame(frameId);
      keepAddressBarFocusRef.current = false;
    };
    const focusAddressBar = (): void => {
      if (cancelled) return;
      if (attempts === 0 || document.activeElement !== addressBarInputRef.current) {
        focusAddressBarNow();
      }
      attempts += 1;
      if (attempts < ADDRESS_BAR_FOCUS_FRAMES) {
        frameId = window.requestAnimationFrame(focusAddressBar);
      } else {
        addressBarFocusGrabRef.current = null;
        keepAddressBarFocusRef.current = false;
      }
    };
    addressBarFocusGrabRef.current = cancel;
    keepAddressBarFocusRef.current = true;
    focusAddressBar();
    return cancel;
  }, [addressBarInputRef, cancelAddressBarFocusGrab, focusAddressBarNow]);

  useEffect(() => {
    if (!chipShown) {
      cancelAddressBarFocusGrab();
      return;
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() !== "l") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      startAddressBarFocusGrab();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [chipShown, startAddressBarFocusGrab]);

  useEffect(() => {
    if (!chipShown) return;
    return () => cancelAddressBarFocusGrab();
  }, [cancelAddressBarFocusGrab, chipShown]);

  return { focusAddressBarNow, focusGuestNow, keepAddressBarFocusRef };
}
