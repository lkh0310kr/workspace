import { useCallback, useEffect, useRef, useState } from 'react'
import type { ThemePreference } from '../../theme'
import { getStoredThemePreference } from '../../theme'
import { onNewWorkspaceTabShortcut } from '../workspace/runtime/workspaceShortcuts'
import { addTab } from '../workspace'

export type WorkspaceSettingsTarget = { tabId: number; anchorRect: DOMRect }
export type EditorSettingsTarget = { tabId: number; rootPath: string }

export function useAppShellState() {
  const [settingsTarget, setSettingsTarget] = useState<WorkspaceSettingsTarget | null>(null)
  const [appSettingsAnchor, setAppSettingsAnchor] = useState<DOMRect | null>(null)
  const [editorSettingsTarget, setEditorSettingsTarget] = useState<EditorSettingsTarget | null>(
    null
  )
  const settingsButtonRef = useRef<HTMLButtonElement>(null)
  const lastNewTabShortcutAt = useRef(0)
  const [themePreference, setThemePreference] = useState<ThemePreference>(getStoredThemePreference)

  const toggleAppSettings = useCallback((anchor?: DOMRect | null) => {
    setAppSettingsAnchor((open) => {
      if (open) return null
      return anchor ?? settingsButtonRef.current?.getBoundingClientRect() ?? null
    })
  }, [])

  const dismissPortals = useCallback(() => {
    setAppSettingsAnchor(null)
    setEditorSettingsTarget(null)
    setSettingsTarget(null)
  }, [])

  // Cmd/Ctrl+N — same "new tab" action as WorkspaceTabRail's "+" button.
  useEffect(
    () =>
      onNewWorkspaceTabShortcut(() => {
        const now = Date.now()
        // Native menu accelerators and before-input-event both cover embedded
        // webviews. Collapse a same-keystroke duplicate into one tab creation.
        if (now - lastNewTabShortcutAt.current < 140) return
        lastNewTabShortcutAt.current = now
        void addTab().catch(console.error)
      }),
    []
  )

  return {
    settingsTarget,
    setSettingsTarget,
    appSettingsAnchor,
    setAppSettingsAnchor,
    editorSettingsTarget,
    setEditorSettingsTarget,
    settingsButtonRef,
    themePreference,
    setThemePreference,
    toggleAppSettings,
    dismissPortals
  }
}
