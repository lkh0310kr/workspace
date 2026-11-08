import { EditorState, Transaction, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

export interface CreateEditorViewOptions {
  parent: HTMLElement;
  doc: string;
  extensions: readonly Extension[];
}

/** Create CodeMirror views through the shared Editor runtime in every product. */
export function createEditorView({ parent, doc, extensions }: CreateEditorViewOptions): EditorView {
  return new EditorView({
    state: EditorState.create({ doc, extensions: [...extensions] }),
    parent,
  });
}

/** Apply provider snapshots as non-user edits so they do not enter local undo history. */
export function replaceEditorDocument(view: EditorView, text: string): void {
  const previous = view.state.doc.toString();
  if (previous === text) return;
  let prefix = 0;
  while (prefix < previous.length && prefix < text.length && previous[prefix] === text[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < previous.length - prefix &&
    suffix < text.length - prefix &&
    previous[previous.length - suffix - 1] === text[text.length - suffix - 1]
  ) suffix++;
  view.dispatch({
    changes: { from: prefix, to: previous.length - suffix, insert: text.slice(prefix, text.length - suffix) },
    annotations: Transaction.addToHistory.of(false),
  });
}
