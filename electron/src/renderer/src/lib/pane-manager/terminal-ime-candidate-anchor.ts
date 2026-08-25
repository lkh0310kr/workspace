import type { Terminal } from "@xterm/xterm";
import { resolveCursorAgentImeAnchor, type TerminalImeAnchor } from "./terminal-ime-anchor";

type ImeAnchorCellMetrics = {
  cellWidth: number;
  cellHeight: number;
  cols: number;
  rows: number;
};

type ImeAnchorStyleProperty = "top" | "left" | "height" | "lineHeight";

export function releaseTerminalImeTextareaAnchor(terminal: Terminal): void {
  if (!terminal.textarea) {
    return;
  }
  const compositionView = terminal.element?.querySelector<HTMLElement>(".composition-view");
  terminal.textarea.style.removeProperty("top");
  terminal.textarea.style.removeProperty("left");
  if (compositionView) {
    compositionView.style.removeProperty("top");
    compositionView.style.removeProperty("left");
    compositionView.style.removeProperty("height");
    compositionView.style.removeProperty("lineHeight");
  }
}

export function installTerminalImeCandidateAnchor(terminal: Terminal): (() => void) | null {
  if (!terminal.element || !terminal.textarea) {
    return null;
  }
  const screenElement = terminal.element.querySelector<HTMLElement>(".xterm-screen");
  const compositionView = terminal.element.querySelector<HTMLElement>(".composition-view");
  const textarea = terminal.textarea;
  let metrics: ImeAnchorCellMetrics | null = null;
  let deferredApply: number | null = null;
  let cursorAgentSeen = false;

  const releaseInlineAnchorStyles = (): void => {
    textarea.style.removeProperty("top");
    textarea.style.removeProperty("left");
    if (compositionView) {
      compositionView.style.removeProperty("top");
      compositionView.style.removeProperty("left");
      compositionView.style.removeProperty("height");
      compositionView.style.removeProperty("lineHeight");
    }
  };

  const measureCells = (): ImeAnchorCellMetrics | null => {
    if (!screenElement) {
      return null;
    }
    const rect = screenElement.getBoundingClientRect();
    const cellWidth = rect.width / terminal.cols;
    const cellHeight = rect.height / terminal.rows;
    if (!(cellWidth > 0) || !(cellHeight > 0)) {
      return null;
    }
    return { cellWidth, cellHeight, cols: terminal.cols, rows: terminal.rows };
  };

  const writeStyle = (
    element: HTMLElement,
    property: ImeAnchorStyleProperty,
    value: string,
  ): void => {
    if (element.style[property] !== value) {
      element.style[property] = value;
    }
  };

  const applyAnchor = (
    row: number,
    column: number,
    cells: ImeAnchorCellMetrics,
    isCursorAgent: boolean,
  ): void => {
    const top = `${row * cells.cellHeight}px`;
    const left = `${column * cells.cellWidth}px`;
    writeStyle(textarea, "top", top);
    writeStyle(textarea, "left", left);
    if (isCursorAgent && compositionView) {
      const height = `${cells.cellHeight}px`;
      writeStyle(compositionView, "top", top);
      writeStyle(compositionView, "left", left);
      writeStyle(compositionView, "height", height);
      writeStyle(compositionView, "lineHeight", height);
    }
  };

  const resolveAnchor = (): { anchor: TerminalImeAnchor; isCursorAgent: boolean } => {
    const buf = terminal.buffer.active;
    const cursorAgentAnchor = resolveCursorAgentImeAnchor({
      buffer: buf,
      rows: terminal.rows,
      cols: terminal.cols,
      cursorX: buf.cursorX,
      cursorY: buf.cursorY,
      knownCursorAgent: cursorAgentSeen,
    });
    cursorAgentSeen ||= cursorAgentAnchor !== null;
    return {
      anchor: cursorAgentAnchor ?? {
        row: buf.cursorY,
        column: Math.min(buf.cursorX, terminal.cols - 1),
      },
      isCursorAgent: cursorAgentAnchor !== null,
    };
  };

  const handler = (event?: Event): void => {
    if (!screenElement) {
      return;
    }
    const staleMetrics =
      !metrics || metrics.cols !== terminal.cols || metrics.rows !== terminal.rows;
    if (event?.type !== "compositionupdate" || staleMetrics) {
      metrics = measureCells();
    }
    const cells = metrics;
    if (!cells) {
      return;
    }
    const { anchor, isCursorAgent } = resolveAnchor();
    applyAnchor(anchor.row, anchor.column, cells, isCursorAgent);
    if (!isCursorAgent) {
      if (deferredApply !== null) {
        window.clearTimeout(deferredApply);
        deferredApply = null;
      }
      return;
    }
    if (deferredApply !== null) {
      window.clearTimeout(deferredApply);
    }
    deferredApply = window.setTimeout(() => {
      deferredApply = null;
      if (!textarea.isConnected) {
        return;
      }
      if (!metrics || metrics.cols !== terminal.cols || metrics.rows !== terminal.rows) {
        metrics = measureCells();
      }
      if (metrics) {
        const current = resolveAnchor();
        applyAnchor(current.anchor.row, current.anchor.column, metrics, current.isCursorAgent);
      }
    }, 0);
  };

  terminal.element.addEventListener("compositionstart", handler);
  terminal.element.addEventListener("compositionupdate", handler);
  terminal.element.addEventListener("compositionend", releaseInlineAnchorStyles);
  return () => {
    terminal.element?.removeEventListener("compositionstart", handler);
    terminal.element?.removeEventListener("compositionupdate", handler);
    terminal.element?.removeEventListener("compositionend", releaseInlineAnchorStyles);
  };
}
