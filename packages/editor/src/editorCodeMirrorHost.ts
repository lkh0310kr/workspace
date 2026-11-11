import { EditorState } from "@codemirror/state";
import { indentUnit } from "@codemirror/language";
import { drawSelection, EditorView } from "@codemirror/view";
import { indentGuides } from "./indentGuides";
import { workspaceEditorTheme } from "./editorHostTheme";

/** CodeMirror host behavior shared by the Desktop Editor and PKMS surfaces. */
export const editorCodeMirrorHostExtensions = [
  indentUnit.of("    "),
  workspaceEditorTheme,
  indentGuides,
  EditorView.clickAddsSelectionRange.of((event) => event.altKey),
];

/** Code-only selection rendering: Markdown preview widgets distort drawSelection's range rectangles. */
export const editorCodeMirrorCodeSelectionExtensions = [
  EditorState.allowMultipleSelections.of(true),
  drawSelection(),
];
