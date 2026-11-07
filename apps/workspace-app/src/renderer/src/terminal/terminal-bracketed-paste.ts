import type { Terminal } from "@xterm/xterm";

export type WindowsInputRecordNewline = "alt-enter" | "csi-u";

type BracketedPasteTerminal = {
  modes: {
    bracketedPasteMode: boolean;
  };
};

type PasteTerminal = BracketedPasteTerminal & {
  options: Pick<Terminal["options"], "ignoreBracketedPasteMode">;
  input: (data: string) => void;
  paste: (text: string) => void;
};

export type PasteTerminalTextOptions = {
  forceBracketedPaste?: boolean;
  forceBracketedPasteForMultiline?: boolean;
  windowsInputRecordNewline?: WindowsInputRecordNewline;
};

const interruptedBracketedPasteTerminals = new WeakSet<object>();
const bracketedPasteModeOutputTail = new WeakMap<object, string>();
const ESCAPE = "\u001b";
export const BRACKETED_PASTE_START = `${ESCAPE}[200~`;
export const BRACKETED_PASTE_END = `${ESCAPE}[201~`;
const BRACKETED_PASTE_MODE_SEQUENCE_RE = /^\[\?(?:\d+;)*2004(?:;\d+)*[hl]/;
const BRACKETED_PASTE_MODE_TAIL_MAX = 128;
const BRACKETED_PASTE_MODE_SEQUENCE_SCAN_MAX = BRACKETED_PASTE_MODE_TAIL_MAX;
const LINE_BREAK_RE = /[\r\n]/;

function hasBracketedPasteModeSequence(data: string): boolean {
  let escapeIndex = data.indexOf(ESCAPE);
  while (escapeIndex !== -1) {
    const sequenceStart = escapeIndex + 1;
    if (
      data.charCodeAt(sequenceStart) === 0x5b &&
      BRACKETED_PASTE_MODE_SEQUENCE_RE.test(
        data.slice(sequenceStart, sequenceStart + BRACKETED_PASTE_MODE_SEQUENCE_SCAN_MAX),
      )
    ) {
      return true;
    }
    escapeIndex = data.indexOf(ESCAPE, escapeIndex + 1);
  }
  return false;
}

export function sanitizeBracketedPasteText(text: string): string {
  let escapeIndex = text.indexOf(ESCAPE);
  if (escapeIndex === -1) {
    return text;
  }

  let sanitized = "";
  let start = 0;
  while (escapeIndex !== -1) {
    sanitized += `${text.slice(start, escapeIndex)}\u241b`;
    start = escapeIndex + ESCAPE.length;
    escapeIndex = text.indexOf(ESCAPE, start);
  }
  return sanitized + text.slice(start);
}

export function sanitizeTerminalPasteText(text: string): string {
  return sanitizeBracketedPasteText(text);
}

export function normalizeTerminalPasteLineEndings(text: string): string {
  return text.replace(/\r?\n/g, "\r");
}

export function wrapTerminalBracketedPasteText(text: string): string {
  const normalizedText = normalizeTerminalPasteLineEndings(text);
  return `${BRACKETED_PASTE_START}${sanitizeBracketedPasteText(normalizedText)}${BRACKETED_PASTE_END}`;
}

export function encodeWindowsInputRecordPasteText(
  text: string,
  newline: WindowsInputRecordNewline,
): string {
  const newlineSequence = newline === "csi-u" ? "\x1b[13;2u" : "\x1b\r";
  let encoded = "";
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "\r") {
      encoded += newlineSequence;
      if (text[index + 1] === "\n") {
        index += 1;
      }
    } else if (char === "\n") {
      encoded += newlineSequence;
    } else {
      encoded += char === ESCAPE ? "\u241b" : char;
    }
  }
  return encoded;
}

function forceBracketedPaste(terminal: PasteTerminal, text: string): void {
  terminal.input(wrapTerminalBracketedPasteText(text));
}

function resolvePasteOptions(
  text: string,
  options?: PasteTerminalTextOptions,
): PasteTerminalTextOptions | undefined {
  if (options?.forceBracketedPaste) {
    return options;
  }
  if (options?.forceBracketedPasteForMultiline && LINE_BREAK_RE.test(text)) {
    return { ...options, forceBracketedPaste: true };
  }
  return options;
}

export function markTerminalBracketedPasteInterrupted(terminal: BracketedPasteTerminal): void {
  if (terminal.modes.bracketedPasteMode) {
    interruptedBracketedPasteTerminals.add(terminal);
  }
}

export function observeTerminalBracketedPasteModeOutput(
  terminal: BracketedPasteTerminal,
  data: string,
): void {
  if (!interruptedBracketedPasteTerminals.has(terminal)) {
    bracketedPasteModeOutputTail.delete(terminal);
    return;
  }
  const combined = (bracketedPasteModeOutputTail.get(terminal) ?? "") + data;
  bracketedPasteModeOutputTail.set(terminal, combined.slice(-BRACKETED_PASTE_MODE_TAIL_MAX));
  if (hasBracketedPasteModeSequence(combined)) {
    interruptedBracketedPasteTerminals.delete(terminal);
    bracketedPasteModeOutputTail.delete(terminal);
  }
}

export function pasteTerminalText(
  terminal: PasteTerminal,
  text: string,
  options?: PasteTerminalTextOptions,
): void {
  const resolved = resolvePasteOptions(text, options);
  if (resolved?.windowsInputRecordNewline) {
    terminal.input(encodeWindowsInputRecordPasteText(text, resolved.windowsInputRecordNewline));
    return;
  }
  if (resolved?.forceBracketedPaste) {
    forceBracketedPaste(terminal, text);
    return;
  }
  if (!interruptedBracketedPasteTerminals.has(terminal)) {
    terminal.paste(text);
    return;
  }
  if (!terminal.modes.bracketedPasteMode) {
    interruptedBracketedPasteTerminals.delete(terminal);
    bracketedPasteModeOutputTail.delete(terminal);
    terminal.paste(text);
    return;
  }
  if (LINE_BREAK_RE.test(text)) {
    terminal.paste(text);
    return;
  }

  const previousIgnoreBracketedPasteMode = terminal.options.ignoreBracketedPasteMode;
  terminal.options.ignoreBracketedPasteMode = true;
  try {
    terminal.paste(sanitizeTerminalPasteText(text));
  } finally {
    terminal.options.ignoreBracketedPasteMode = previousIgnoreBracketedPasteMode;
  }
}
