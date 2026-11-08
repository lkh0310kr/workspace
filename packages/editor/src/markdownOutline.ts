import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import { markdownLanguage } from "@codemirror/lang-markdown";
import { HEADING_TYPES } from "./markdownLivePreview";

export interface MarkdownHeading {
  level: number;
  title: string;
  position: number;
  line: number;
}

export interface EditorOutlineEntry {
  id: string;
  level: number;
  label: string;
  position: number;
}

/** Convert parser headings to the shared outline view model. */
export function editorOutlineEntries(headings: readonly MarkdownHeading[]): EditorOutlineEntry[] {
  return headings.map((heading) => ({
    id: `${heading.position}-${heading.title}`,
    level: heading.level,
    label: heading.title,
    position: heading.position,
  }));
}

function headingTitle(source: string): string {
  return source.replace(/^\s*#+\s*/, "").replace(/\s+#+\s*$/, "").trim();
}

export function markdownOutlineFromState(state: EditorState): MarkdownHeading[] {
  const headings: MarkdownHeading[] = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (!HEADING_TYPES.has(node.type.name)) return;
      const marker = node.node.getChild("HeaderMark");
      const start = marker?.to ?? node.from;
      headings.push({
        level: Number(node.type.name.slice(-1)),
        title: headingTitle(state.doc.sliceString(start, node.to)),
        position: node.from,
        line: state.doc.lineAt(node.from).number,
      });
    },
  });
  return headings;
}

export function markdownOutlineFromText(source: string): MarkdownHeading[] {
  const tree = markdownLanguage.parser.parse(source);
  const headings: MarkdownHeading[] = [];
  let lineCursor = 0;
  let lineNumber = 1;
  tree.iterate({
    enter(node) {
      if (!HEADING_TYPES.has(node.type.name)) return;
      const marker = node.node.getChild("HeaderMark");
      const start = marker?.to ?? node.from;
      while (lineCursor < node.from) {
        if (source.charCodeAt(lineCursor) === 10) lineNumber++;
        lineCursor++;
      }
      headings.push({
        level: Number(node.type.name.slice(-1)),
        title: headingTitle(source.slice(start, node.to)),
        position: node.from,
        line: lineNumber,
      });
    },
  });
  return headings;
}
