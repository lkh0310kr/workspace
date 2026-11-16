import { useState } from 'react'
import { getStoredAutoSave, setStoredAutoSave } from '../state/autosave'

export function EditorSettingsSection() {
  const [autoSave, setAutoSave] = useState(getStoredAutoSave)

  const changeAutoSave = (enabled: boolean) => {
    setStoredAutoSave(enabled)
    setAutoSave(enabled)
  }

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
            className={`settings-theme-option${!autoSave ? ' active' : ''}`}
            onClick={() => changeAutoSave(false)}
          >
            Manual (Cmd+S)
          </button>
          <button
            type="button"
            className={`settings-theme-option${autoSave ? ' active' : ''}`}
            onClick={() => changeAutoSave(true)}
          >
            Auto-save
          </button>
        </div>
      </div>
    </>
  )
}
