import type { IDisposable } from "@xterm/xterm";
import type { ManagedPane, ManagedPaneInternal } from "../lib/pane-manager/pane-manager-types";
import { setPaneFitListener } from "../lib/pane-manager/pane-fit-resize-observer";
import { refitPaneTerminal } from "../lib/pane-manager/pane-terminal-refit";
import { writeTerminalOutput } from "../lib/pane-manager/pane-terminal-output-scheduler";
import { ptyResize, writeClipboardText } from "../electron";
import { createElectronPtyTransport, type PtyTransport } from "./ptyTransport";
import { createPtyTerminalTitleObserver } from "./ptyTerminalTitleObserver";
import { reprTerminalBytes, termLog } from "./terminalDebugLog";

export function connectPanePty(
  pane: ManagedPane,
  terminalId: number,
  options?: { onTitleChange?: (title: string) => void },
): {
  transport: PtyTransport;
  dispose: () => void;
} {
  const transport = createElectronPtyTransport(terminalId);
  const internal = pane as ManagedPaneInternal;
  const term = pane.terminal;
  let onDataDisposable: IDisposable | null = null;
  let oscDisposable: IDisposable | null = null;

  const titleObserver = options?.onTitleChange
    ? createPtyTerminalTitleObserver(options.onTitleChange)
    : null;

  const writeOutput = (data: string) => {
    titleObserver?.observePtyChunk(data);
    termLog(
      "pty:receive",
      "to-xterm",
      { bytes: reprTerminalBytes(data), length: data.length },
      terminalId,
    );
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
    })
    .catch((err) => {
      console.error("[terminal] pty connect failed:", terminalId, err);
    });

  onDataDisposable = term.onData((data) => {
    termLog(
      "xterm:onData",
      "to-pty",
      { bytes: reprTerminalBytes(data), length: data.length },
      terminalId,
    );
    transport.write(data);
  });

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
