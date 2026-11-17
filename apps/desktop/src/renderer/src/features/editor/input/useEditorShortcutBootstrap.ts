import { useEffect } from 'react'
import { pastePlainTextInFocusedEditor } from './activeEditorView'
import { onPastePlainTextShortcut } from './editorShortcuts'

export function useEditorShortcutBootstrap(): void {
  useEffect(() => onPastePlainTextShortcut(() => pastePlainTextInFocusedEditor()), [])
}
