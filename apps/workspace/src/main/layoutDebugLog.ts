import { appendNdjsonLog } from "./debugLogSink";

export function appendLayoutLog(entry: Record<string, unknown>): void {
  appendNdjsonLog("layout.ndjson", entry);
}
