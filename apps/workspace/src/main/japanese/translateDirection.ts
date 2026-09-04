import type { StudyAssistRequest } from "../../shared/japaneseStudyTypes";
import { detectTranslateDirection, type StudyTranslateDirection } from "../../shared/studyText";

export function resolveTranslateDirection(req: StudyAssistRequest): StudyTranslateDirection {
  if (req.translateDirection && req.translateDirection !== "auto") {
    return req.translateDirection;
  }
  if (req.task === "translate_to_ko") return "to_ko";
  if (req.task === "translate_to_ja") return "to_ja";
  return detectTranslateDirection(req.text);
}

export function isTranslateTask(task: StudyAssistRequest["task"]): boolean {
  return task === "translate" || task === "translate_to_ko" || task === "translate_to_ja";
}
