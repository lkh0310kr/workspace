import { EditorSelection, type Extension } from "@codemirror/state";
import { keymap, type EditorView } from "@codemirror/view";

/** Toggle Markdown emphasis around every selection without losing its range. */
export function toggleMarkdownWrap(marker: string) {
  return (view: EditorView): boolean => {
    const { state } = view;
    const changes = state.changeByRange((range) => {
      const { from, to } = range;
      const before = state.sliceDoc(Math.max(0, from - marker.length), from);
      const after = state.sliceDoc(to, Math.min(state.doc.length, to + marker.length));
      if (from !== to && before === marker && after === marker) {
        return {
          changes: [
            { from: from - marker.length, to: from },
            { from: to, to: to + marker.length },
          ],
          range: EditorSelection.range(from - marker.length, to - marker.length),
        };
      }
      return {
        changes: [
          { from, insert: marker },
          { from: to, insert: marker },
        ],
        range: EditorSelection.range(from + marker.length, to + marker.length),
      };
    });
    view.dispatch(state.update(changes, { scrollIntoView: true, userEvent: "input" }));
    return true;
  };
}

/** The baseline formatting shortcuts are shared by Markdown editors in both products. */
export function markdownFormattingKeymap(): Extension {
  return keymap.of([
    { key: "Mod-b", run: toggleMarkdownWrap("**") },
    { key: "Mod-i", run: toggleMarkdownWrap("*") },
  ]);
}
