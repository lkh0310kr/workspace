import { useState } from 'react'
import { Popover, type AnchorRect } from '@renderer/adapters/ui'
import {
  loadWorkspaceEditorSettings,
  saveWorkspaceEditorSettings,
  useWorkspaceEditorSettings,
  type WorkspaceEditorSettings
} from '../state/workspaceEditorSettings'
import { EditorSettingsSection } from './EditorSettingsSection'

interface Props {
  anchorRect: AnchorRect
  onClose: () => void
  tabId: number
  rootPath: string
}

export function EditorSettingsDialog({ anchorRect, onClose, tabId, rootPath }: Props) {
  const snapshot = useWorkspaceEditorSettings(tabId, rootPath)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const handleChange = (settings: WorkspaceEditorSettings) => {
    setSaving(true)
    setSaveError(null)
    void saveWorkspaceEditorSettings(tabId, rootPath, settings)
      .catch((error: unknown) => {
        setSaveError(error instanceof Error ? error.message : String(error))
      })
      .finally(() => setSaving(false))
  }

  return (
    <Popover
      anchorRect={anchorRect}
      onClose={onClose}
      align="end"
      className="settings-dialog editor-settings-dialog"
    >
      <div className="settings-header">
        <span>Editor Settings</span>
        <button type="button" className="settings-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <div className="settings-row-label editor-settings-root" title={rootPath}>
        {rootPath}
      </div>
      {!snapshot.loaded && !snapshot.error && (
        <div className="settings-row-label">Loading workspace settings…</div>
      )}
      {snapshot.error && (
        <div className="settings-load-error" role="alert">
          <span>Could not read `.workspace/settings.json`: {snapshot.error}</span>
          <button type="button" onClick={() => void loadWorkspaceEditorSettings(tabId, rootPath)}>
            Retry
          </button>
        </div>
      )}
      <EditorSettingsSection
        settings={snapshot.settings}
        disabled={!snapshot.loaded || saving || Boolean(snapshot.error)}
        onChange={handleChange}
      />
      {saveError && (
        <div className="settings-error" role="alert">
          Could not save workspace settings: {saveError}
        </div>
      )}
      <div className="settings-row-label editor-settings-path">
        Saved to <code>.workspace/settings.json</code>
      </div>
    </Popover>
  )
}
