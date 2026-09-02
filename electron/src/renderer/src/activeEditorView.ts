import type { EditorView } from "@codemirror/view";
import { EditorSelection } from "@codemirror/state";
import { pastePlainTextIntoView } from "./editorPlainPaste";

let focusedEditorView: EditorView | null = null;

export function setFocusedEditorView(view: EditorView | null): void {
  if (view && !view.dom.isConnected) return;
  focusedEditorView = view;
}

export function clearFocusedEditorView(view: EditorView): void {
  if (focusedEditorView === view) focusedEditorView = null;
}

export function getFocusedEditorView(): EditorView | null {
  if (!focusedEditorView?.dom.isConnected) return null;
  return focusedEditorView;
}

export function pastePlainTextInFocusedEditor(): boolean {
  const view = focusedEditorView;
  if (!view?.dom.isConnected) return false;
  void pastePlainTextIntoView(view);
  return true;
}

export function getCurrentLineText(view: EditorView): { line: number; text: string } {
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  return { line: line.number, text: line.text };
}

export function getSelectedOrCurrentLineText(view: EditorView): {
  line: number;
  text: string;
  selection: string | null;
} {
  const selection = view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to).trim();
  const current = getCurrentLineText(view);
  if (selection) {
    return { line: current.line, text: selection, selection };
  }
  return { line: current.line, text: current.text.trim(), selection: null };
}

function lineRange(view: EditorView, lineNumber: number): { from: number; to: number } {
  const line = view.state.doc.line(lineNumber);
  return { from: line.from, to: line.to };
}

/** Insert lines below the current line; fill the next line when it is blank. */
export function insertLinesBelowCurrentLine(view: EditorView, lines: string[]): boolean {
  if (lines.length === 0) return false;
  const { line } = getCurrentLineText(view);
  const currentRange = lineRange(view, line);
  const doc = view.state.doc;
  const hasNextLine = line < doc.lines;
  const nextLine = hasNextLine ? doc.line(line + 1) : null;
  const nextIsBlank = nextLine != null && nextLine.text.trim() === "";

  let insertFrom = currentRange.to;
  let insertText = `\n${lines.join("\n")}`;

  if (nextIsBlank && nextLine) {
    insertFrom = nextLine.from;
    insertText = lines.join("\n");
  }

  const cursorPos = insertFrom + insertText.length;
  view.dispatch({
    changes: { from: insertFrom, to: nextIsBlank && nextLine ? nextLine.to : insertFrom, insert: insertText },
    selection: EditorSelection.cursor(cursorPos),
  });
  view.focus();
  return true;
}

export function insertNoteBelowCurrentLine(view: EditorView, note: string): boolean {
  if (!note.trim()) return false;
  const { line } = getCurrentLineText(view);
  const currentRange = lineRange(view, line);
  const doc = view.state.doc;
  const hasNextLine = line < doc.lines;
  const nextLine = hasNextLine ? doc.line(line + 1) : null;
  const nextIsBlank = nextLine != null && nextLine.text.trim() === "";
  const insertFrom = nextIsBlank && nextLine ? nextLine.from : currentRange.to;
  const insertText = nextIsBlank ? note : `\n${note}`;
  view.dispatch({
    changes: { from: insertFrom, to: nextIsBlank && nextLine ? nextLine.to : insertFrom, insert: insertText },
  });
  view.focus();
  return true;
}
