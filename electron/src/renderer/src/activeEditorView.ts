import type { EditorView } from "@codemirror/view";
import { pastePlainTextIntoView } from "./editorPlainPaste";

let focusedEditorView: EditorView | null = null;

export function setFocusedEditorView(view: EditorView | null): void {
  if (view && !view.dom.isConnected) return;
  focusedEditorView = view;
}

export function clearFocusedEditorView(view: EditorView): void {
  if (focusedEditorView === view) focusedEditorView = null;
}

export function pastePlainTextInFocusedEditor(): boolean {
  const view = focusedEditorView;
  if (!view?.dom.isConnected) return false;
  void pastePlainTextIntoView(view);
  return true;
}
