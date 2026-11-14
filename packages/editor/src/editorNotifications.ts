export const EDITOR_NOTIFICATION_EVENT = 'workspace-editor-notification'

export interface EditorNotificationDetail {
  message: string
  kind: 'success' | 'error'
}

/** Notify the host shell so embedded editor surfaces can use its global toast UI. */
export function dispatchEditorNotification(detail: EditorNotificationDetail): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<EditorNotificationDetail>(EDITOR_NOTIFICATION_EVENT, { detail })
  )
}
