import { useEffect } from "react";
import { installBrowserDownloadRelay } from "../browserDownloads";
import { browserCleanupAll } from "../browser";
import { installBrowserEmbedSupport, reloadFocusedBrowser } from "../browser/browserEmbedSupport";
import { onBrowserReloadShortcut, onPastePlainTextShortcut, onTerminalPasteShortcut } from "../electron";
import { pastePlainTextInFocusedEditor } from "../activeEditorView";
import { getRegisteredTerminalPane } from "../lib/pane-manager/pane-terminal-registry";
import { pasteClipboardIntoTerminal } from "../terminal/terminal-clipboard-paste";
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
  useEffect(
    () =>
      onTerminalPasteShortcut(({ terminalId }) => {
        const pane = getRegisteredTerminalPane(terminalId);
        if (!pane) return;
        void pasteClipboardIntoTerminal(pane.terminal);
      }),
    [],
  );
}
