import type { RefObject } from 'react'
import type { Model } from 'flexlayout-react'
import type { TabInfo } from '../workspace'
import { WorkspaceTabRail } from '../workspace/WorkspaceTabRail'

type Props = {
  settingsOpen: boolean
  settingsButtonRef: RefObject<HTMLButtonElement | null>
  onToggleSettings: (anchor: DOMRect) => void
  workspaceTabs: TabInfo[]
  activeWorkspaceTabId: number
  homeActive: boolean
  onOpenWorkspaceTabSettings: (tabId: number, anchorRect: DOMRect) => void
  getModel: (tabId: number) => Model | undefined
  layoutRevisions: Record<number, number>
}

const showDrawnWindowControls = typeof window !== 'undefined' && window.api?.platform !== 'darwin'

export function AppTitlebar({
  settingsOpen,
  settingsButtonRef,
  onToggleSettings,
  workspaceTabs,
  activeWorkspaceTabId,
  homeActive,
  onOpenWorkspaceTabSettings,
  getModel,
  layoutRevisions
}: Props) {
  // Windows / Linux: custom caption buttons (Orca — no titleBarOverlay).
  // WSLg: overlay misaligns client surface and hit-test.
  return (
    <div className="titlebar">
      <WorkspaceTabRail
        tabs={workspaceTabs}
        activeTabId={activeWorkspaceTabId}
        homeActive={homeActive}
        onOpenSettings={onOpenWorkspaceTabSettings}
        getModel={getModel}
        layoutRevisions={layoutRevisions}
      />
      <div className="titlebar-spacer" />
      <button
        ref={settingsButtonRef}
        type="button"
        className={`titlebar-settings-button${settingsOpen ? ' active' : ''}`}
        title="Settings"
        aria-label="Settings"
        aria-haspopup="dialog"
        aria-expanded={settingsOpen}
        onClick={(event) => onToggleSettings(event.currentTarget.getBoundingClientRect())}
      >
        <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 8.25a3.75 3.75 0 1 0 0 7.5 3.75 3.75 0 0 0 0-7.5Zm8.25 4.96v-2.42l-2.03-.55a6.65 6.65 0 0 0-.57-1.37l1.06-1.82-1.71-1.71-1.82 1.06a6.65 6.65 0 0 0-1.37-.57l-.55-2.03h-2.42l-.55 2.03a6.65 6.65 0 0 0-1.37.57L7.1 5.34 5.39 7.05l1.06 1.82a6.65 6.65 0 0 0-.57 1.37l-2.03.55v2.42l2.03.55c.13.48.32.94.57 1.37l-1.06 1.82 1.71 1.71 1.82-1.06c.43.25.89.44 1.37.57l.55 2.03h2.42l.55-2.03c.48-.13.94-.32 1.37-.57l1.82 1.06 1.71-1.71-1.06-1.82c.25-.43.44-.89.57-1.37l2.03-.55Z"
          />
        </svg>
      </button>
      {showDrawnWindowControls ? (
        <div className="titlebar-window-controls" aria-label="Window">
          <button
            type="button"
            className="titlebar-window-btn"
            title="Minimize"
            onClick={() => window.api.windowControls.minimize()}
          >
            <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
              <rect x="1" y="5.5" width="10" height="1" fill="currentColor" />
            </svg>
          </button>
          <button
            type="button"
            className="titlebar-window-btn"
            title="Maximize"
            onClick={() => window.api.windowControls.maximize()}
          >
            <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
              <rect
                x="1.5"
                y="1.5"
                width="9"
                height="9"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
              />
            </svg>
          </button>
          <button
            type="button"
            className="titlebar-window-btn titlebar-window-btn-close"
            title="Close"
            onClick={() => window.api.windowControls.close()}
          >
            <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
              <path d="M2 2l8 8M10 2L2 10" stroke="currentColor" strokeWidth="1.2" fill="none" />
            </svg>
          </button>
        </div>
      ) : null}
    </div>
  )
}
