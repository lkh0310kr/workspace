import type { EditorView } from "@codemirror/view";
import type { StudyAssistContext } from "../../../shared/japaneseStudyTypes";
import { japaneseStudyAssist } from "../electron";
import { formatAugmentInsertText } from "./studyAssistPreview";

export function buildAugmentAssistContext(view: EditorView, filePath: string | null): StudyAssistContext {
  const fullDocument = view.state.doc.toString();
  const { head } = view.state.selection.main;
  const line = view.state.doc.lineAt(head);

  const previousLines: string[] = [];
  for (let i = Math.max(1, line.number - 6); i < line.number; i++) {
    previousLines.push(view.state.doc.line(i).text);
  }

  const nextLines: string[] = [];
  for (let i = line.number + 1; i <= Math.min(view.state.doc.lines, line.number + 6); i++) {
    nextLines.push(view.state.doc.line(i).text);
  }

  return {
    filePath,
    fullDocument,
    cursorLine: line.number,
    cursorOffset: head,
    currentLine: line.text,
    previousLines,
    nextLines,
  };
}

export async function runDocumentAugment(view: EditorView, filePath: string | null): Promise<string> {
  const context = buildAugmentAssistContext(view, filePath);
  const result = await japaneseStudyAssist({
    task: "augment",
    text: context.currentLine?.trim() || ".",
    context,
  });
  return formatAugmentInsertText(result);
}
