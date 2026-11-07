import { useEffect } from "react";
import { installBrowserDownloadRelay } from "../browserDownloads";
import { browserCleanupAll } from "../browser";
import { installBrowserEmbedSupport, reloadFocusedBrowser } from "../browser/browserEmbedSupport";
import { installRendererConsoleFileLogging } from "../debug/consoleFileLog";
import { onBrowserReloadShortcut, onPastePlainTextShortcut, onTerminalPasteShortcut } from "../electron";
import { pastePlainTextInFocusedEditor } from "../activeEditorView";
import { getRegisteredTerminalPane } from "../lib/pane-manager/pane-terminal-registry";
import { pasteClipboardIntoTerminal } from "../terminal/terminal-clipboard-paste";
import { notifyTerminalKeyboardPasteHandled } from "../terminal/installTerminalPasteHandler";
import { captureTerminalSessionBuffers } from "../terminal/capture-terminal-session-buffers";
import { installGlobalErrorLogging } from "../errorLog";
import { installTerminalAgentStatusBridge } from "../terminal/installTerminalAgentStatusBridge";

/** One-time app-wide side effects (logging, browser embed, downloads). */
export function useAppBootstrap(): void {
  useEffect(() => {
    void browserCleanupAll().catch(console.error);
  }, []);

  useEffect(() => installGlobalErrorLogging(), []);
  useEffect(() => {
    installRendererConsoleFileLogging();
  }, []);
  useEffect(() => installBrowserEmbedSupport(), []);
  useEffect(() => installBrowserDownloadRelay(), []);
  useEffect(() => installTerminalAgentStatusBridge(), []);
  useEffect(() => onBrowserReloadShortcut(({ hard }) => reloadFocusedBrowser(hard)), []);
  useEffect(() => onPastePlainTextShortcut(() => pastePlainTextInFocusedEditor()), []);
  useEffect(
    () =>
      onTerminalPasteShortcut(({ terminalId }) => {
        const pane = getRegisteredTerminalPane(terminalId);
        if (!pane) return;
        notifyTerminalKeyboardPasteHandled();
        void pasteClipboardIntoTerminal({ terminal: pane.terminal });
      }),
    [],
  );

  useEffect(
    () =>
      window.api.terminal.onCaptureSessionBuffers((terminalIds) => {
        const file = captureTerminalSessionBuffers(terminalIds);
        window.api.terminal.sendSessionBuffers(file);
      }),
    [],
  );
}
