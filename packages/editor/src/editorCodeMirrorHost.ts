import { EditorState } from "@codemirror/state";
import { indentUnit } from "@codemirror/language";
import { drawSelection, EditorView } from "@codemirror/view";
import { indentGuides } from "./indentGuides";
import { workspaceEditorTheme } from "./editorHostTheme";

/** CodeMirror host behavior shared by the Desktop Editor and PKMS surfaces. */
export const editorCodeMirrorHostExtensions = [
  indentUnit.of("    "),
  EditorState.allowMultipleSelections.of(true),
  drawSelection(),
  workspaceEditorTheme,
  indentGuides,
  EditorView.clickAddsSelectionRange.of((event) => event.altKey),
];
