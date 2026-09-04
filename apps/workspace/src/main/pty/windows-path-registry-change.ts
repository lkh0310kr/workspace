import type { BrowserWindow } from "electron";

/** WM_SETTINGCHANGE — PATH/env updates on Windows (Orca pty/windows-path-registry-change). */
export const WINDOWS_SETTING_CHANGE_MESSAGE = 0x001a;

let pathCacheGeneration = 0;

export function invalidateWindowsPathCache(): void {
  pathCacheGeneration += 1;
}

export function getWindowsPathCacheGeneration(): number {
  return pathCacheGeneration;
}

export function installWindowsPathRegistryChangeListener(
  window: Pick<BrowserWindow, "hookWindowMessage">,
): void {
  if (process.platform !== "win32") return;
  window.hookWindowMessage(WINDOWS_SETTING_CHANGE_MESSAGE, () => {
    invalidateWindowsPathCache();
  });
}
