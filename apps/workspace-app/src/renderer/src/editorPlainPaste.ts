import { EditorSelection } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { readClipboardText } from "./electron";

/** Paste clipboard plain text at every selection range (Cmd+Shift+V). */
export async function pastePlainTextIntoView(view: EditorView): Promise<boolean> {
  let text: string;
  try {
    text = await readClipboardText();
  } catch {
    return false;
  }
  const { state } = view;
  view.dispatch(
    state.changeByRange((range) => ({
      changes: { from: range.from, to: range.to, insert: text },
      range: EditorSelection.cursor(range.from + text.length),
    })),
    { scrollIntoView: true, userEvent: "input.paste" },
  );
  view.focus();
  return true;
}

export function pastePlainTextCommand(view: EditorView): boolean {
  void pastePlainTextIntoView(view);
  return true;
}
