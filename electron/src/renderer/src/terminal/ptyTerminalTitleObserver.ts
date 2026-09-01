import {
  extractAllOscTitles,
  isCursorNativeAgentTitle,
  normalizeTerminalTitle,
  shouldSuppressCursorNativeTitle,
} from "../../../shared/agent/agent-detection";

export type PtyTerminalTitleObserver = {
  observePtyChunk: (data: string) => void;
};

/** Ported from ref-proj/orca pty-output-title-observer (title path only). */
export function createPtyTerminalTitleObserver(
  onTitleChange: (title: string) => void,
): PtyTerminalTitleObserver {
  let lastEmittedTitle: string | null = null;

  const observePtyChunk = (data: string): void => {
    if (!data.includes("\x1b]")) return;
    const titles = extractAllOscTitles(data);
    for (const title of titles) {
      if (isCursorNativeAgentTitle(title) && shouldSuppressCursorNativeTitle(lastEmittedTitle)) {
        continue;
      }
      const normalized = normalizeTerminalTitle(title);
      if (normalized === lastEmittedTitle) continue;
      lastEmittedTitle = normalized;
      onTitleChange(normalized);
    }
  };

  return { observePtyChunk };
}
