import { japaneseLog } from "./japaneseLog";

export function studyAssistLog(event: string, data?: Record<string, unknown>): void {
  japaneseLog(`study_${event}`, data);
}
