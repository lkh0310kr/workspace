import { useMemo, type RefObject } from "react";
import { browserFocusLog } from "./browserFocusDebugLog";

/** How browser chrome hands focus to the <webview> guest (Orca browser-page-guest-focus). */
export type WebviewGuestFocus = {
  blur: () => void;
  focus: (reason?: string) => boolean;
  isAttached: () => boolean;
};

export function useWebviewGuestFocus(
  webviewRef: RefObject<Electron.WebviewTag | null>,
): WebviewGuestFocus {
  return useMemo(
    () => ({
      blur: () => {
        browserFocusLog("useWebviewGuestFocus.blur", "blur guest host");
        webviewRef.current?.blur();
      },
      isAttached: () => webviewRef.current !== null,
      focus: (reason = "unknown") => {
        const webview = webviewRef.current;
        if (!webview) {
          browserFocusLog("useWebviewGuestFocus.focus", "no webview ref", { reason });
          return false;
        }
        try {
          webview.focus();
          // Why: Electron often leaves activeElement on body/document while the
          // guest WebContents still receives keyboard — do not gate on host match.
          browserFocusLog("useWebviewGuestFocus.focus", "webview.focus() called", {
            reason,
            tabItemId: webview.dataset.tabItemId,
          });
          return true;
        } catch (err) {
          browserFocusLog("useWebviewGuestFocus.focus", "webview.focus() threw", {
            reason,
            error: String(err),
          });
          return false;
        }
      },
    }),
    [webviewRef],
  );
}
