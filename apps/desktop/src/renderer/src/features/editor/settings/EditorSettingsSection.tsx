import type { WorkspaceEditorSettings } from '../state/workspaceEditorSettings'

interface Props {
  settings: WorkspaceEditorSettings
  disabled?: boolean
  onChange: (next: WorkspaceEditorSettings) => void
}

export function EditorSettingsSection({ settings, disabled = false, onChange }: Props) {
  return (
    <>
      <div className="settings-section-title">Editing</div>
      <div className="settings-row settings-row-column">
        <span className="settings-row-label">
          Markdown save — auto-saves shortly after you stop typing, or only on Cmd+S
        </span>
        <div className="settings-theme-options">
          <button
            type="button"
            className={`settings-theme-option${!settings.autoSave ? ' active' : ''}`}
            disabled={disabled}
            onClick={() => onChange({ ...settings, autoSave: false })}
          >
            Manual (Cmd+S)
          </button>
          <button
            type="button"
            className={`settings-theme-option${settings.autoSave ? ' active' : ''}`}
            disabled={disabled}
            onClick={() => onChange({ ...settings, autoSave: true })}
          >
            Auto-save
          </button>
        </div>
      </div>
      <label className="settings-row editor-hidden-files-setting">
        <span className="settings-row-label">Show hidden files in the Editor tree</span>
        <input
          type="checkbox"
          checked={settings.showHiddenFiles}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...settings, showHiddenFiles: event.currentTarget.checked })
          }
        />
      </label>
    </>
  )
}
