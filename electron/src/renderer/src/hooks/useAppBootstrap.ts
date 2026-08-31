import { useEffect } from "react";
import { installBrowserDownloadRelay } from "../browserDownloads";
import { browserCleanupAll } from "../browser";
import { installBrowserEmbedSupport, reloadFocusedBrowser } from "../browser/browserEmbedSupport";
import { onBrowserReloadShortcut, onPastePlainTextShortcut } from "../electron";
import { pastePlainTextInFocusedEditor } from "../activeEditorView";
import { installGlobalErrorLogging } from "../errorLog";

/** One-time app-wide side effects (logging, browser embed, downloads). */
export function useAppBootstrap(): void {
  useEffect(() => {
    void browserCleanupAll().catch(console.error);
  }, []);

  useEffect(() => installGlobalErrorLogging(), []);
  useEffect(() => installBrowserEmbedSupport(), []);
  useEffect(() => installBrowserDownloadRelay(), []);
  useEffect(() => onBrowserReloadShortcut(({ hard }) => reloadFocusedBrowser(hard)), []);
  useEffect(() => onPastePlainTextShortcut(() => pastePlainTextInFocusedEditor()), []);
}
