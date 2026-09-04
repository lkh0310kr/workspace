import { useCallback, useEffect, useRef, useState } from 'react'
import type { ThemePreference } from '../theme'
import { getStoredThemePreference } from '../theme'
import { addTab, onNewWorkspaceTabShortcut, onOpenSettingsShortcut } from '../electron'

export type WorkspaceSettingsTarget = { tabId: number; anchorRect: DOMRect }

export function useAppShellState() {
  const [settingsTarget, setSettingsTarget] = useState<WorkspaceSettingsTarget | null>(null)
  const [appSettingsAnchor, setAppSettingsAnchor] = useState<DOMRect | null>(null)
  const appSettingsButtonRef = useRef<HTMLButtonElement>(null)
  const [themePreference, setThemePreference] = useState<ThemePreference>(getStoredThemePreference)

  const toggleAppSettings = useCallback((anchor?: DOMRect | null) => {
    setAppSettingsAnchor((open) => {
      if (open) return null
      return anchor ?? appSettingsButtonRef.current?.getBoundingClientRect() ?? null
    })
  }, [])

  const dismissPortals = useCallback(() => {
    setAppSettingsAnchor(null)
    setSettingsTarget(null)
  }, [])

  // Cmd/Ctrl+, is handled in the main process (before-input-event) and relayed
  // via shortcut:open-settings — do not also listen in the renderer or the
  // popover toggles open then immediately closed on one keypress.
  useEffect(() => onOpenSettingsShortcut(() => toggleAppSettings()), [toggleAppSettings])

  // Cmd/Ctrl+N — same "new tab" action as WorkspaceTabRail's "+" button,
  // relayed the same way as Cmd+, above.
  useEffect(() => onNewWorkspaceTabShortcut(() => void addTab().catch(console.error)), [])

  return {
    settingsTarget,
    setSettingsTarget,
    appSettingsAnchor,
    setAppSettingsAnchor,
    appSettingsButtonRef,
    themePreference,
    setThemePreference,
    toggleAppSettings,
    dismissPortals
  }
}
