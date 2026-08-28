import type { RefObject } from "react";

type Props = {
  workspaceRailOpen: boolean;
  workspaceRailButtonRef: RefObject<HTMLButtonElement | null>;
  onToggleWorkspaceRail: (anchor: DOMRect) => void;
  appSettingsOpen: boolean;
  appSettingsButtonRef: RefObject<HTMLButtonElement | null>;
  onToggleAppSettings: (anchor: DOMRect) => void;
};

const showDrawnWindowControls =
  typeof window !== "undefined" && window.api?.platform !== "darwin";

export function AppTitlebar({
  workspaceRailOpen,
  workspaceRailButtonRef,
  onToggleWorkspaceRail,
  appSettingsOpen,
  appSettingsButtonRef,
  onToggleAppSettings,
}: Props) {
  // Windows / Linux: custom caption buttons (Orca — no titleBarOverlay).
  // WSLg: overlay misaligns client surface and hit-test.
  return (
    <div className="titlebar">
      <button
        ref={workspaceRailButtonRef}
        type="button"
        className={`titlebar-sidebar-toggle${workspaceRailOpen ? " active" : ""}`}
        title="Workspace Tabs"
        onClick={(e) => onToggleWorkspaceRail(e.currentTarget.getBoundingClientRect())}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor" />
          <line x1="6" y1="2.5" x2="6" y2="13.5" stroke="currentColor" />
        </svg>
      </button>
      <button
        ref={appSettingsButtonRef}
        type="button"
        className={`titlebar-sidebar-toggle${appSettingsOpen ? " active" : ""}`}
        title="Settings"
        onClick={(e) => onToggleAppSettings(e.currentTarget.getBoundingClientRect())}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path
            fill="none"
            stroke="currentColor"
            d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z"
          />
          <path
            fill="none"
            stroke="currentColor"
            d="M8 1.5v1.6M8 12.9v1.6M14.5 8h-1.6M3.1 8H1.5M12.4 3.6l-1.13 1.13M4.73 11.27 3.6 12.4M12.4 12.4l-1.13-1.13M4.73 4.73 3.6 3.6"
          />
        </svg>
      </button>
      <div className="titlebar-spacer" />
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
              <rect x="1.5" y="1.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" />
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
  );
}
