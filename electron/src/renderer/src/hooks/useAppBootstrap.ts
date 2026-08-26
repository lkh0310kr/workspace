import { useEffect } from "react";
import { installBrowserDownloadRelay } from "../browserDownloads";
import { browserCleanupAll } from "../browser";
import { installBrowserEmbedSupport, reloadFocusedBrowser } from "../browser/browserEmbedSupport";
import { isDevInstrumentation } from "../debug/devTools";
import { onBrowserReloadShortcut } from "../electron";
import { installGlobalErrorLogging } from "../errorLog";
import { installInteractionDebugProbe } from "../interaction/interactionDebugProbe";

/** One-time app-wide side effects (logging, browser embed, downloads). */
export function useAppBootstrap(): void {
  useEffect(() => {
    void browserCleanupAll().catch(console.error);
  }, []);

  useEffect(() => installGlobalErrorLogging(), []);
  useEffect(() => {
    if (!isDevInstrumentation) return;
    return installInteractionDebugProbe();
  }, []);
  useEffect(() => installBrowserEmbedSupport(), []);
  useEffect(() => installBrowserDownloadRelay(), []);
  useEffect(() => onBrowserReloadShortcut(({ hard }) => reloadFocusedBrowser(hard)), []);
}
