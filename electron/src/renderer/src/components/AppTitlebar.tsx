import { useRef, type RefObject } from "react";
import type { TabInfo } from "../electron";
import { SidebarQuickSwitchPopover } from "./SidebarQuickSwitchPopover";

type Props = {
  railOpen: boolean;
  onToggleRail: () => void;
  appSettingsOpen: boolean;
  appSettingsButtonRef: RefObject<HTMLButtonElement | null>;
  onToggleAppSettings: (anchor: DOMRect) => void;
  tabs: TabInfo[];
  activeTabId: number;
  sidebarQuickSwitchAnchor: DOMRect | null;
  onCloseQuickSwitch: () => void;
  onSidebarHoverEnter: (anchor: DOMRect) => void;
  onSidebarHoverLeave: () => void;
  clearSidebarHoverTimer: () => void;
};

export function AppTitlebar({
  railOpen,
  onToggleRail,
  appSettingsOpen,
  appSettingsButtonRef,
  onToggleAppSettings,
  tabs,
  activeTabId,
  sidebarQuickSwitchAnchor,
  onCloseQuickSwitch,
  onSidebarHoverEnter,
  onSidebarHoverLeave,
  clearSidebarHoverTimer,
}: Props) {
  const sidebarToggleRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="titlebar">
      <button
        ref={sidebarToggleRef}
        type="button"
        className={`titlebar-sidebar-toggle${railOpen ? " active" : ""}`}
        title="Toggle Sidebar"
        onClick={onToggleRail}
        onMouseEnter={() => {
          if (railOpen || !sidebarToggleRef.current) return;
          onSidebarHoverEnter(sidebarToggleRef.current.getBoundingClientRect());
        }}
        onMouseLeave={onSidebarHoverLeave}
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
        title="Settings (⌘,)"
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
      {sidebarQuickSwitchAnchor && !railOpen && (
        <SidebarQuickSwitchPopover
          tabs={tabs}
          activeTabId={activeTabId}
          anchorRect={sidebarQuickSwitchAnchor}
          onClose={onCloseQuickSwitch}
          onMouseEnter={clearSidebarHoverTimer}
          onMouseLeave={onSidebarHoverLeave}
        />
      )}
    </div>
  );
}
