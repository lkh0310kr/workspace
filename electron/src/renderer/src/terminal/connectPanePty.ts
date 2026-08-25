import type { IDisposable } from "@xterm/xterm";
import type { ManagedPane, ManagedPaneInternal } from "../lib/pane-manager/pane-manager-types";
import { setPaneFitListener } from "../lib/pane-manager/pane-fit-resize-observer";
import { refitPaneTerminal } from "../lib/pane-manager/pane-terminal-refit";
import { writeTerminalOutput } from "../lib/pane-manager/pane-terminal-output-scheduler";
import { dbgLog } from "../interaction/interactionDebugLog";
import { ptyResize, writeClipboardText } from "../electron";
import { createElectronPtyTransport, type PtyTransport } from "./ptyTransport";

export function connectPanePty(pane: ManagedPane, terminalId: number): {
  transport: PtyTransport;
  dispose: () => void;
} {
  const transport = createElectronPtyTransport(terminalId);
  const internal = pane as ManagedPaneInternal;
  const term = pane.terminal;
  let onDataDisposable: IDisposable | null = null;
  let oscDisposable: IDisposable | null = null;

  const writeOutput = (data: string) => {
    writeTerminalOutput(term, data, { foreground: true });
  };

  const syncPtySize = () => {
    ptyResize(terminalId, term.cols, term.rows).catch(console.error);
  };

  setPaneFitListener(internal, () => syncPtySize());

  void transport
    .connect({
      onData: writeOutput,
    })
    .then((result) => {
      if (result.snapshot) {
        writeOutput(result.snapshot);
      }
      refitPaneTerminal(pane);
      syncPtySize();
      dbgLog(
        "connectPanePty:connected",
        "pty connected",
        { terminalId, isReattach: result.isReattach, cols: term.cols, rows: term.rows },
        "terminal",
      );
    })
    .catch((err) => {
      console.error("[terminal] pty connect failed:", terminalId, err);
      dbgLog(
        "connectPanePty:error",
        "pty connect failed",
        { terminalId, error: String(err) },
        "terminal",
      );
    });

  onDataDisposable = term.onData((data) => transport.write(data));

  oscDisposable = term.parser.registerOscHandler(52, (data) => {
    const payload = data.slice(data.indexOf(";") + 1);
    if (payload === "?" || payload === "") return false;
    try {
      writeClipboardText(atob(payload));
      return true;
    } catch {
      return false;
    }
  });

  return {
    transport,
    dispose: () => {
      setPaneFitListener(internal, null);
      transport.disconnect();
      onDataDisposable?.dispose();
      oscDisposable?.dispose();
    },
  };
}
