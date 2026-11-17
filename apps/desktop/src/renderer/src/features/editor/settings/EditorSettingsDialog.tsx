import { useEffect, useState } from 'react'
import {
  loadWorkspaceEditorSettings,
  saveWorkspaceEditorSettings,
  useWorkspaceEditorSettings,
  type WorkspaceEditorSettings
} from '../state/workspaceEditorSettings'

type SettingsPage = 'text-editor' | 'files-folders'

interface Props {
  onClose: () => void
  tabId: number
  rootPath: string
}

const SETTINGS_PAGES: { id: SettingsPage; label: string; description: string }[] = [
  { id: 'text-editor', label: '텍스트 편집기', description: '저장 방식' },
  { id: 'files-folders', label: '파일 및 폴더', description: '파일 표시 규칙' }
]

export function EditorSettingsDialog({ onClose, tabId, rootPath }: Props) {
  const snapshot = useWorkspaceEditorSettings(tabId, rootPath)
  const [activePage, setActivePage] = useState<SettingsPage>('text-editor')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [hiddenFileDraft, setHiddenFileDraft] = useState('')

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const handleChange = (settings: WorkspaceEditorSettings) => {
    setSaving(true)
    setSaveError(null)
    void saveWorkspaceEditorSettings(tabId, rootPath, settings)
      .catch((error: unknown) => {
        setSaveError(error instanceof Error ? error.message : String(error))
      })
      .finally(() => setSaving(false))
  }

  const updateSettings = (patch: Partial<WorkspaceEditorSettings>) => {
    handleChange({ ...snapshot.settings, ...patch })
  }

  const page = SETTINGS_PAGES.find((item) => item.id === activePage) ?? SETTINGS_PAGES[0]

  return (
    <div
      className="editor-settings-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="editor-settings-window"
        role="dialog"
        aria-modal="true"
        aria-labelledby="editor-settings-title"
      >
        <aside className="editor-settings-sidebar">
          <div className="editor-settings-brand">
            <span className="editor-settings-brand-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18">
                <path
                  d="M12 8.25a3.75 3.75 0 1 0 0 7.5 3.75 3.75 0 0 0 0-7.5Zm8.25 4.96v-2.42l-2.03-.55a6.65 6.65 0 0 0-.57-1.37l1.06-1.82-1.71-1.71-1.82 1.06a6.65 6.65 0 0 0-1.37-.57l-.55-2.03h-2.42l-.55 2.03a6.65 6.65 0 0 0-1.37.57L7.1 5.34 5.39 7.05l1.06 1.82a6.65 6.65 0 0 0-.57 1.37l-2.03.55v2.42l2.03.55c.13.48.32.94.57 1.37l-1.06 1.82 1.71 1.71 1.82-1.06c.43.25.89.44 1.37.57l.55 2.03h2.42l.55-2.03c.48-.13.94-.32 1.37-.57l1.82 1.06 1.71-1.71-1.06-1.82c.25-.43.44-.89.57-1.37l2.03-.55Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span>
              <strong>편집기 설정</strong>
              <small>현재 워크스페이스에 적용</small>
            </span>
          </div>

          <nav className="editor-settings-nav" aria-label="편집기 설정 메뉴">
            <div className="editor-settings-nav-label">편집기</div>
            {SETTINGS_PAGES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`editor-settings-nav-item${activePage === item.id ? ' active' : ''}`}
                aria-current={activePage === item.id ? 'page' : undefined}
                onClick={() => setActivePage(item.id)}
              >
                <span className="editor-settings-nav-icon" aria-hidden="true">
                  {item.id === 'text-editor' ? '가' : '▱'}
                </span>
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                </span>
              </button>
            ))}
          </nav>

          <div className="editor-settings-sidebar-footer">
            <span className="editor-settings-nav-label">워크스페이스</span>
            <span className="editor-settings-workspace-path" title={rootPath}>
              {rootPath}
            </span>
            <span className="editor-settings-config-path">워크스페이스별 설정</span>
          </div>
        </aside>

        <main className="editor-settings-main">
          <header className="editor-settings-header">
            <div>
              <h1 id="editor-settings-title">{page.label}</h1>
              <p>{page.description}</p>
            </div>
            <button
              type="button"
              className="editor-settings-close"
              onClick={onClose}
              aria-label="설정 닫기"
              title="닫기 (Esc)"
            >
              ×
            </button>
          </header>

          <div className="editor-settings-content">
            {snapshot.error && (
              <div className="editor-settings-alert" role="alert">
                <span>설정을 불러오지 못했습니다: {snapshot.error}</span>
                <button
                  type="button"
                  onClick={() => void loadWorkspaceEditorSettings(tabId, rootPath)}
                >
                  다시 시도
                </button>
              </div>
            )}
            {saveError && (
              <div className="editor-settings-alert" role="alert">
                설정을 저장하지 못했습니다: {saveError}
              </div>
            )}
            {!snapshot.loaded && !snapshot.error && (
              <div className="editor-settings-loading">설정을 불러오는 중…</div>
            )}
            {snapshot.loaded && activePage === 'text-editor' && (
              <section className="editor-settings-group" aria-labelledby="saving-title">
                <div className="editor-settings-group-heading">
                  <h2 id="saving-title">저장</h2>
                  <p>텍스트 문서를 저장할 시점을 선택합니다.</p>
                </div>
                <div className="editor-settings-option-row">
                  <div className="editor-settings-option-copy">
                    <strong>자동 저장</strong>
                    <p>입력을 멈추면 변경 사항을 자동으로 저장합니다.</p>
                  </div>
                  <div className="editor-settings-choice-group" role="group" aria-label="저장 방식">
                    <button
                      type="button"
                      aria-pressed={snapshot.settings.autoSave}
                      disabled={saving}
                      className={snapshot.settings.autoSave ? 'selected' : ''}
                      onClick={() => updateSettings({ autoSave: true })}
                    >
                      자동 저장
                    </button>
                    <button
                      type="button"
                      aria-pressed={!snapshot.settings.autoSave}
                      disabled={saving}
                      className={!snapshot.settings.autoSave ? 'selected' : ''}
                      onClick={() => updateSettings({ autoSave: false })}
                    >
                      수동 저장
                    </button>
                  </div>
                </div>
                <div className="editor-settings-hint">
                  수동 저장은 <kbd>⌘ S</kbd> 또는 <kbd>Ctrl S</kbd>를 누르면 실행됩니다.
                </div>
              </section>
            )}
            {snapshot.loaded && activePage === 'files-folders' && (
              <section className="editor-settings-group" aria-labelledby="visibility-title">
                <div className="editor-settings-group-heading">
                  <h2 id="visibility-title">숨길 파일과 폴더</h2>
                  <p>이름이나 패턴을 입력하고 Enter를 눌러 목록에 추가하세요.</p>
                </div>
                <div className="editor-settings-option-copy editor-settings-hidden-files-copy">
                  <strong>제외 목록</strong>
                  <p>
                    <code>.git</code>, <code>*.log</code>처럼 이름 또는 별표 패턴을 입력할 수
                    있습니다.
                  </p>
                </div>
                <form
                  className="editor-settings-hidden-files-form"
                  onSubmit={(event) => {
                    event.preventDefault()
                    const additions = hiddenFileDraft
                      .split(/[\n,]/)
                      .map((item) => item.trim())
                      .filter(Boolean)
                    if (!additions.length) return
                    updateSettings({
                      hiddenFiles: [...new Set([...snapshot.settings.hiddenFiles, ...additions])]
                    })
                    setHiddenFileDraft('')
                  }}
                >
                  <input
                    type="text"
                    value={hiddenFileDraft}
                    disabled={saving}
                    placeholder="예: .git 또는 *.log"
                    aria-label="숨길 파일 이름 또는 패턴"
                    onChange={(event) => setHiddenFileDraft(event.currentTarget.value)}
                  />
                  <button type="submit" disabled={saving || !hiddenFileDraft.trim()}>
                    추가
                  </button>
                </form>
                <ul className="editor-settings-hidden-files-list" aria-label="숨길 파일 목록">
                  {snapshot.settings.hiddenFiles.map((pattern) => (
                    <li key={pattern}>
                      <code>{pattern}</code>
                      <button
                        type="button"
                        aria-label={`${pattern} 삭제`}
                        disabled={saving}
                        onClick={() =>
                          updateSettings({
                            hiddenFiles: snapshot.settings.hiddenFiles.filter(
                              (item) => item !== pattern
                            )
                          })
                        }
                      >
                        ×
                      </button>
                    </li>
                  ))}
                  {snapshot.settings.hiddenFiles.length === 0 && (
                    <li className="editor-settings-hidden-files-empty">숨기는 항목이 없습니다.</li>
                  )}
                </ul>
                <div className="editor-settings-hint">
                  목록의 항목은 편집기 트리에서만 숨겨집니다. 빠른 열기와 파일 검색에는 영향을 주지
                  않습니다.
                </div>
              </section>
            )}
          </div>
        </main>
      </section>
    </div>
  )
}
