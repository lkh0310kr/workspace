import type { StudyAssistRequest, StudyAssistResult } from "../../../shared/japaneseStudyTypes";

export interface StudyLlmProvider {
  readonly id: string;
  readonly label: string;
  available(): Promise<boolean>;
  complete(req: StudyAssistRequest): Promise<Pick<StudyAssistResult, "lines" | "note">>;
}
