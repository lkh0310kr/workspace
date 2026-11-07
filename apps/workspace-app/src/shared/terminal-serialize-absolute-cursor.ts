// Ported from ref-proj/orca/src/shared/terminal-serialize-absolute-cursor.ts (cursor tail only)

type SerializeCursorTerminal = {
  cols: number;
  rows: number;
  buffer: { active: { cursorX: number; cursorY: number } };
};

type BufferSerializer<TOpts> = {
  serialize: (opts?: TOpts) => string;
};

type TerminalWithSavedCursorCore = SerializeCursorTerminal & {
  modes?: { originMode?: boolean };
  _core?: {
    buffer?: {
      savedX?: number;
      savedY?: number;
      savedOriginMode?: boolean;
      ybase?: number;
      scrollTop?: number;
      scrollBottom?: number;
    };
  };
};

export function serializeWithAbsoluteCursor<TOpts>(
  serializer: BufferSerializer<TOpts>,
  terminal: SerializeCursorTerminal,
  opts?: TOpts,
): string {
  const serialized = serializer.serialize(opts);
  if (serialized.length === 0) {
    return serialized;
  }
  return `${serialized}${buildAbsoluteCursorRestoreSequence(terminal)}`;
}

export function buildAbsoluteCursorRestoreSequence(terminal: SerializeCursorTerminal): string {
  const { cursorX, cursorY } = terminal.buffer.active;
  const terminalWithCore = terminal as TerminalWithSavedCursorCore;
  const buffer = terminalWithCore._core?.buffer;
  const scrollTop = buffer?.scrollTop ?? 0;
  const originMode = terminalWithCore.modes?.originMode === true;
  const cupCursorY = cursorY - (originMode ? scrollTop : 0);
  const canRestoreCurrentCursor =
    cursorX >= 0 && cursorX < terminal.cols && cupCursorY >= 0 && cupCursorY < terminal.rows;
  if (!canRestoreCurrentCursor) {
    return "";
  }
  return `\x1b[${cupCursorY + 1};${cursorX + 1}H`;
}
