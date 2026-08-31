import { useMemo, type RefObject } from "react";
import { browserFocusLog } from "./browserFocusDebugLog";
import { focusBrowserGuestWebview, isWebviewHostFocused } from "./browserGuestFocus";

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
        focusBrowserGuestWebview(webview, reason);
        const ok = isWebviewHostFocused(webview);
        browserFocusLog("useWebviewGuestFocus.focus", ok ? "focused" : "focus incomplete", {
          reason,
          tabItemId: webview.dataset.tabItemId,
        });
        return ok;
      },
    }),
    [webviewRef],
  );
}
