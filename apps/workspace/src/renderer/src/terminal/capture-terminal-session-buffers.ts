import { DESKTOP_TERMINAL_SCROLLBACK_ROWS_DEFAULT } from "../lib/shared/terminal-scrollback-policy";
import { serializeWithAbsoluteCursor } from "../../../shared/terminal-serialize-absolute-cursor";
import {
  trimTerminalSessionBufferToByteLimit,
  type TerminalSessionBuffersFile,
} from "../../../shared/terminal-session-buffers";
import { flushTerminalOutput } from "../lib/pane-manager/pane-terminal-output-scheduler";
import {
  forEachRegisteredTerminalPane,
  getRegisteredTerminalPane,
} from "../lib/pane-manager/pane-terminal-registry";
import type { ManagedPaneInternal } from "../lib/pane-manager/pane-manager-types";

function capturePaneBuffer(pane: ManagedPaneInternal): string {
  flushTerminalOutput(pane.terminal);
  const serialized = serializeWithAbsoluteCursor(pane.serializeAddon, pane.terminal, {
    scrollback: DESKTOP_TERMINAL_SCROLLBACK_ROWS_DEFAULT,
  });
  if (!serialized) {
    return "";
  }
  return trimTerminalSessionBufferToByteLimit(serialized);
}

/** Serialize mounted terminal panes for quit-time persistence. */
export function captureTerminalSessionBuffers(terminalIds?: readonly number[]): TerminalSessionBuffersFile {
  const buffersByTerminalId: Record<string, string> = {};

  const captureId = (terminalId: number): void => {
    const pane = getRegisteredTerminalPane(terminalId);
    if (!pane) {
      return;
    }
    const serialized = capturePaneBuffer(pane);
    if (serialized) {
      buffersByTerminalId[String(terminalId)] = serialized;
    }
  };

  if (terminalIds && terminalIds.length > 0) {
    for (const id of terminalIds) {
      captureId(id);
    }
  } else {
    forEachRegisteredTerminalPane((terminalId, pane) => {
      const serialized = capturePaneBuffer(pane);
      if (serialized) {
        buffersByTerminalId[String(terminalId)] = serialized;
      }
    });
  }

  return { buffersByTerminalId };
}
