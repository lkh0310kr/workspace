import type { EditorView } from "@codemirror/view";
import type { StudyAssistRequest, StudyAssistResult, StudyTask } from "../../../shared/japaneseStudyTypes";
import type { ContextMenuItem } from "../components/ContextMenu";
import {
  getSelectedOrCurrentLineText,
  insertLinesBelowCurrentLine,
  insertNoteBelowCurrentLine,
} from "../activeEditorView";
import { japaneseStudyAssist, japaneseStudyLog } from "../electron";

function logStudy(event: string, data?: Record<string, unknown>): void {
  void japaneseStudyLog(event, data);
  console.log(`[study-assist] ${event}`, data ?? "");
}

async function invokeStudyAssist(request: StudyAssistRequest): Promise<StudyAssistResult> {
  logStudy("renderer_invoke", { task: request.task, textLength: request.text.length });
  const result = await japaneseStudyAssist(request);
  logStudy("renderer_result", {
    task: result.task,
    providerId: result.providerId,
    lineCount: result.lines.length,
    hasNote: Boolean(result.note),
  });
  return result;
}

function neighborLines(view: EditorView, line: number) {
  const doc = view.state.doc;
  const previousLine = line > 1 ? doc.line(line - 1).text : undefined;
  const nextLine = line < doc.lines ? doc.line(line + 1).text : undefined;
  return { previousLine, nextLine };
}

export async function runStudyAssistInEditor(view: EditorView, task: StudyTask): Promise<boolean> {
  logStudy("editor_run_start", { task });
  if (!view.dom.isConnected) {
    logStudy("editor_run_abort", { reason: "view_disconnected", task });
    return false;
  }

  const { line, text, selection } = getSelectedOrCurrentLineText(view);
  if (!text) {
    logStudy("editor_run_abort", { reason: "empty_selection", task });
    return false;
  }

  const context = neighborLines(view, line);
  let result: StudyAssistResult;
  try {
    result = await invokeStudyAssist({
      task,
      text,
      context,
      koreanDraft: task === "check_translation" && !selection ? context.nextLine : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logStudy("editor_run_error", { task, error: message });
    insertNoteBelowCurrentLine(view, `[study] ${message}`);
    return false;
  }

  if (task === "breakdown") {
    if (result.note) {
      insertNoteBelowCurrentLine(view, result.note);
      logStudy("editor_insert_note", { task, kind: "breakdown" });
      return true;
    }
    if (result.lines.length > 0) {
      insertLinesBelowCurrentLine(view, result.lines);
      return true;
    }
    insertNoteBelowCurrentLine(view, "[study] 분해 결과가 없습니다.");
    logStudy("editor_insert_empty", { task });
    return false;
  }

  if (task === "grammar_hint" || task === "check_translation") {
    if (result.note) {
      insertNoteBelowCurrentLine(view, result.note);
      logStudy("editor_insert_note", { task });
      return true;
    }
    if (result.lines.length > 0) {
      insertLinesBelowCurrentLine(view, result.lines);
      return true;
    }
    insertNoteBelowCurrentLine(view, result.note ?? "[study] 결과가 없습니다.");
    return false;
  }

  if (result.lines.length > 0) {
    insertLinesBelowCurrentLine(view, result.lines);
    logStudy("editor_insert_lines", { task, lineCount: result.lines.length });
    return true;
  }

  const fallback = result.note ?? "[study] 결과가 없습니다. Japanese 설정에서 provider를 확인하세요.";
  insertNoteBelowCurrentLine(view, fallback);
  logStudy("editor_insert_fallback", { task, note: fallback });
  return false;
}

function studyMenuAction(view: () => EditorView | null, task: StudyTask, onClose: () => void): () => void {
  return () => {
    onClose();
    const editor = view();
    if (!editor) {
      logStudy("menu_abort", { reason: "no_editor_view", task });
      return;
    }
    void runStudyAssistInEditor(editor, task);
  };
}

export function buildJapaneseStudyContextMenuItems(
  getView: () => EditorView | null,
  onClose: () => void,
): ContextMenuItem[] {
  const action = (task: StudyTask) => studyMenuAction(getView, task, onClose);
  return [
    { type: "button", label: "일본어 → 한국어", icon: "訳", onClick: action("translate_to_ko") },
    { type: "button", label: "한국어 → 일본어", icon: "訳", onClick: action("translate_to_ja") },
    { type: "separator" },
    { type: "button", label: "일본어 분해", icon: "解", onClick: action("breakdown") },
    { type: "button", label: "읽기 (히라가나)", icon: "読", onClick: action("reading") },
    { type: "separator" },
    { type: "button", label: "문법 힌트", onClick: action("grammar_hint") },
    { type: "button", label: "번역 확인", onClick: action("check_translation") },
    { type: "button", label: "연습 문장", onClick: action("practice_sentences") },
  ];
}
