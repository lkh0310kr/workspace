import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { insertNewlineAndIndent } from "@codemirror/commands";
import { deleteMarkupBackward, insertNewlineContinueMarkupCommand } from "@codemirror/lang-markdown";
import { indentOnInput, indentUnit, syntaxTree } from "@codemirror/language";
import type { MarkdownConfig } from "@lezer/markdown";
import type { Extension } from "@codemirror/state";
import { keymap, type Command } from "@codemirror/view";
import { markdownFormattingKeymap } from "./markdownCommands";
import { markdownMathExtension } from "./markdownMath";
import { markdownLivePreview, markdownTableCellRangesAt } from "./markdownLivePreview";

function tableCellNavigation(direction: -1 | 1): Command {
  return (view) => {
    const position = view.state.selection.main.head;
    const ranges = markdownTableCellRangesAt(view.state, position);
    if (!ranges) return false;
    const current = ranges.findIndex((range) => position >= range.from && position <= range.to);
    if (current < 0) return false;
    const next = ranges[current + direction];
    const table = syntaxTree(view.state).resolveInner(position, 1);
    let tableNode = table;
    while (tableNode && tableNode.type.name !== "Table" && tableNode.parent) tableNode = tableNode.parent;
    if (!tableNode || tableNode.type.name !== "Table") return false;
    const target = next?.from ?? (direction > 0
      ? Math.min(tableNode.to + 1, view.state.doc.length)
      : Math.max(0, tableNode.from - 1));
    const appendLineBreak = !next && direction > 0 && tableNode.to === view.state.doc.length;
    view.dispatch({
      ...(appendLineBreak ? { changes: { from: tableNode.to, insert: "\n" } } : {}),
      selection: { anchor: target + (appendLineBreak ? 1 : 0) },
      scrollIntoView: true,
    });
    return true;
  };
}

export interface MarkdownEditorOptions {
  /** Product syntax additions such as Workspace's [[WikiLink]] parser. */
  parserExtensions?: readonly MarkdownConfig[];
}

/** Shared Markdown grammar and interaction layer; products supply only syntax resolvers. */
export function createMarkdownEditorExtensions(options: MarkdownEditorOptions = {}): Extension[] {
  return [
    markdown({
      base: markdownLanguage,
      extensions: [markdownMathExtension, ...(options.parserExtensions ?? [])],
      addKeymap: false,
    }),
    indentOnInput(),
    indentUnit.of("    "),
    keymap.of([
      { key: "Enter", run: insertNewlineContinueMarkupCommand({ nonTightLists: false }) },
      { key: "Enter", run: insertNewlineAndIndent },
      { key: "Backspace", run: deleteMarkupBackward },
      { key: "Tab", run: tableCellNavigation(1) },
      { key: "Shift-Tab", run: tableCellNavigation(-1) },
    ]),
    markdownLivePreview,
    markdownFormattingKeymap(),
  ];
}
