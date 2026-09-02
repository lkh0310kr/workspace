import type { StudyAssistResult, StudyTask } from "../../../shared/japaneseStudyTypes";

export function formatStudyChatInsertLines(content: string, isMarkdown: boolean): string[] {
  const body = content.trim();
  if (!body) return [];
  if (isMarkdown) {
    return body.split("\n").map((line) => (line.trim() ? `> ${line}` : ">"));
  }
  return [body];
}

export function formatStudyAssistPreviewText(result: StudyAssistResult): string {
  if (result.note?.trim()) {
    return result.note.trim();
  }
  return result.lines.map((line) => line.trim()).filter(Boolean).join("\n");
}

export function formatAugmentInsertText(result: StudyAssistResult): string {
  return formatStudyAssistPreviewText(result);
}

/** @deprecated Legacy task menu removed — kept for tests/helpers. */
export function formatStudyAssistInsertLines(
  result: StudyAssistResult,
  task: StudyTask,
  isMarkdown: boolean,
): string[] {
  if (task === "chat") {
    return formatStudyChatInsertLines(formatStudyAssistPreviewText(result), isMarkdown);
  }
  const body = formatStudyAssistPreviewText(result);
  if (!body) return [];
  if (
    isMarkdown &&
    (task === "grammar_hint" || task === "check_translation" || (task === "breakdown" && result.note))
  ) {
    return body.split("\n").map((line) => (line.trim() ? `> ${line}` : ">"));
  }
  if (result.lines.length > 0) {
    return result.lines.map((line) => line.trim()).filter(Boolean);
  }
  return [body];
}
