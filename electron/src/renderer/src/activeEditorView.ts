import type { EditorView } from "@codemirror/view";
import { EditorSelection } from "@codemirror/state";

export function replaceRangeAndInsert(view: EditorView, from: number, to: number, text: string): void {
  const insertText = text.trim();
  if (!insertText) return;
  const cursorPos = from + insertText.length;
  view.dispatch({
    changes: { from, to, insert: insertText },
    selection: EditorSelection.cursor(cursorPos),
    scrollIntoView: true,
  });
  view.focus();
}
