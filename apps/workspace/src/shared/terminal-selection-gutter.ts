// Ported from ref-proj/orca/src/shared/terminal-selection-gutter.ts
//
// Why: an xterm selection is a rectangle of screen cells, not logical text.
// Agent CLIs paint their messages behind a fixed left gutter, so every copied
// line carried that gutter into the clipboard and pasted replies came out
// indented (#19770).

const LEADING_SPACES = /^ */;

type SelectionLine = { indent: number; text: string; terminator: string };

function parseLine(rawLine: string): SelectionLine {
  const carriageReturn = rawLine.endsWith("\r");
  const text = carriageReturn ? rawLine.slice(0, -1) : rawLine;
  return {
    indent: LEADING_SPACES.exec(text)?.[0].length ?? 0,
    text,
    terminator: carriageReturn ? "\r" : "",
  };
}

function measureGutter(lines: readonly SelectionLine[]): number {
  let gutter = Number.POSITIVE_INFINITY;
  for (const { indent, text } of lines) {
    if (indent === text.length) {
      continue;
    }
    gutter = Math.min(gutter, indent);
    if (gutter === 0) {
      return 0;
    }
  }
  return Number.isFinite(gutter) ? gutter : 0;
}

export function stripTerminalSelectionGutter(selection: string): string {
  const lines = selection.split("\n").map(parseLine);
  const gutter = measureGutter(lines);
  if (gutter === 0) {
    return selection;
  }
  return lines
    .map(({ indent, text, terminator }) => text.slice(Math.min(indent, gutter)) + terminator)
    .join("\n");
}
