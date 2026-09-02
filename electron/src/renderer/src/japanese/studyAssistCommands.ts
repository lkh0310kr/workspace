import type { EditorView } from "@codemirror/view";
import type { StudyAssistResult, StudyTask } from "../../../shared/japaneseStudyTypes";
import { insertLinesBelowCurrentLine, insertNoteBelowCurrentLine } from "../activeEditorView";
import { formatStudyAssistInsertLines } from "./studyAssistPreview";

export function applyStudyAssistResult(
  view: EditorView,
  task: StudyTask,
  result: StudyAssistResult,
  options: { isMarkdown: boolean },
): boolean {
  const lines = formatStudyAssistInsertLines(result, task, options.isMarkdown);
  if (lines.length > 0) {
    insertLinesBelowCurrentLine(view, lines);
    return true;
  }

  const fallback = result.note?.trim() || "[study] 결과가 없습니다.";
  insertNoteBelowCurrentLine(view, fallback);
  return false;
}
