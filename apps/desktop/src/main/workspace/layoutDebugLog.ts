import { appendNdjsonLog } from '../diagnostics/logging/debugLogSink'

export function appendLayoutLog(entry: Record<string, unknown>): void {
  appendNdjsonLog('layout.ndjson', entry)
}
