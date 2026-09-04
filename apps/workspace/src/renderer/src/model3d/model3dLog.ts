import { fileLogEvent } from "../debug/consoleFileLog";

export async function logModel3d(event: string, data?: Record<string, unknown>): Promise<void> {
  if (window.api.model3d?.log) {
    try {
      await window.api.model3d.log(event, data);
      return;
    } catch (err) {
      console.warn("[model3d] ipc log failed", err);
    }
  }
  fileLogEvent("model3d-renderer", event, data);
}
