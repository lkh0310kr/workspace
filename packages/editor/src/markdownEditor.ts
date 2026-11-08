import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { insertNewlineAndIndent } from "@codemirror/commands";
import { deleteMarkupBackward, insertNewlineContinueMarkupCommand } from "@codemirror/lang-markdown";
import { indentOnInput, indentUnit } from "@codemirror/language";
import type { MarkdownConfig } from "@lezer/markdown";
import type { Extension } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { markdownFormattingKeymap } from "./markdownCommands";
import { markdownLivePreview } from "./markdownLivePreview";

export interface MarkdownEditorOptions {
  /** Product syntax additions such as Workspace's [[WikiLink]] parser. */
  parserExtensions?: readonly MarkdownConfig[];
}

/** Shared Markdown grammar and interaction layer; products supply only syntax resolvers. */
export function createMarkdownEditorExtensions(options: MarkdownEditorOptions = {}): Extension[] {
  return [
    markdown({
      base: markdownLanguage,
      extensions: [...(options.parserExtensions ?? [])],
      addKeymap: false,
    }),
    indentOnInput(),
    indentUnit.of("    "),
    keymap.of([
      { key: "Enter", run: insertNewlineContinueMarkupCommand({ nonTightLists: false }) },
      { key: "Enter", run: insertNewlineAndIndent },
      { key: "Backspace", run: deleteMarkupBackward },
    ]),
    markdownLivePreview,
    markdownFormattingKeymap(),
  ];
}
