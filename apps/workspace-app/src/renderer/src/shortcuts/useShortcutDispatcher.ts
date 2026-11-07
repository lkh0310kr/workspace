import { useEffect } from "react";
import { dispatchShortcut } from "./shortcutRegistry";

/** Single window keydown entry point for renderer shortcuts. */
export function useShortcutDispatcher(): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (dispatchShortcut(event)) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);
}
