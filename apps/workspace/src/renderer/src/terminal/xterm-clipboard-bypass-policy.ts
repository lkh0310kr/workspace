// Ported from ref-proj/orca/src/renderer/src/components/terminal-pane/xterm-bypass-policy.ts
// (clipboard / kitty-keyboard subset)

export type XtermClipboardBypassEvent = {
  type: string;
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  defaultPrevented?: boolean;
};

export type XtermClipboardBypassOptions = {
  isMac: boolean;
  kittyKeyboardFlags?: number;
  hasSelection: boolean;
};

function isKeyEvent(type: string): boolean {
  return type === "keydown" || type === "keyup";
}

function isCopyChord(event: XtermClipboardBypassEvent, isMac: boolean): boolean {
  if (event.altKey || event.shiftKey) {
    return false;
  }
  if (event.key.toLowerCase() !== "c") {
    return false;
  }
  return isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
}

function isPasteChord(event: XtermClipboardBypassEvent, isMac: boolean): boolean {
  if (event.altKey) {
    return false;
  }
  if (event.key.toLowerCase() !== "v") {
    return false;
  }
  return isMac
    ? event.metaKey && !event.ctrlKey && !event.shiftKey
    : event.ctrlKey && !event.metaKey;
}

/**
 * Kitty apps own unselected Cmd+C when they negotiated keyboard reporting.
 */
export function isAppOwnedCopyChord(
  event: XtermClipboardBypassEvent,
  options: Pick<XtermClipboardBypassOptions, "isMac" | "hasSelection" | "kittyKeyboardFlags">,
): boolean {
  return (
    options.isMac &&
    !options.hasSelection &&
    (options.kittyKeyboardFlags ?? 0) !== 0 &&
    isCopyChord(event, true)
  );
}

/**
 * Return true when xterm should not handle the chord (Chromium copy/paste or
 * manual copy handler in window capture should run instead of kitty CSI-u).
 */
export function shouldBypassXtermClipboardKeyboardEvent(
  event: XtermClipboardBypassEvent,
  options: XtermClipboardBypassOptions,
): boolean {
  if (!isKeyEvent(event.type)) {
    return false;
  }

  const { isMac, hasSelection } = options;
  const platformModifierHeld = isMac
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;

  if (event.defaultPrevented && platformModifierHeld) {
    return true;
  }

  if (isAppOwnedCopyChord(event, options)) {
    return false;
  }

  if (isMac) {
    return isCopyChord(event, true) || isPasteChord(event, true);
  }

  if (
    event.ctrlKey &&
    event.shiftKey &&
    !event.metaKey &&
    !event.altKey &&
    event.key.toLowerCase() === "c"
  ) {
    return true;
  }
  if (isCopyChord(event, false) && hasSelection) {
    return true;
  }
  if (isPasteChord(event, false) || (event.shiftKey && event.key === "Insert" && !event.ctrlKey)) {
    return true;
  }

  return false;
}
