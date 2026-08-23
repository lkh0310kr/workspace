import { forwardRef, type DragEvent, type ReactNode } from "react";
import type { TabNode } from "flexlayout-react";
import { PaneActions } from "./PaneActions";
import { paneLabel, PaneComponent } from "../layout/paneTypes";
import { popOverlayBlock, pushOverlayBlock } from "../browser/overlayBarrier";
import { startPaneDrag } from "../layout/layoutRef";

interface Props {
  component: PaneComponent;
  toolbar?: ReactNode;
  /** Overrides the default `paneLabel(component)` header text — e.g. the
   * terminal pane replaces it with live session/host/time info in place
   * of tmux's own status bar (see TerminalPaneTitle). */
  title?: ReactNode;
  contentSlot?: boolean;
  hideHeader?: boolean;
  /** Enables dragging the pane header to reposition/split it via
   * flexlayout's own drag-and-drop, in place of the native tab strip
   * (hidden app-wide in favor of this custom header). */
  tabNode?: TabNode;
  onSplit: (mode: "split-right" | "split-down", paneType: PaneComponent) => void;
  onTypeChange: (component: PaneComponent) => void;
  onClose: () => void;
  children?: ReactNode;
}

export const PaneFrame = forwardRef<HTMLDivElement, Props>(function PaneFrame(
  { component, toolbar, title, contentSlot, hideHeader, tabNode, onSplit, onTypeChange, onClose, children },
  ref,
) {
  const paneActions = (
    <PaneActions
      component={component}
      onSplit={onSplit}
      onTypeChange={onTypeChange}
      onClose={onClose}
    />
  );

  const dragProps = tabNode
    ? {
        draggable: true,
        onDragStart: (e: DragEvent) => {
          pushOverlayBlock();
          startPaneDrag(e, tabNode);
        },
        onDragEnd: () => popOverlayBlock(),
      }
    : {};

  const headerRow = (
    <div className="pane-header" {...dragProps}>
      <span className="pane-title">{title ?? paneLabel(component)}</span>
      {paneActions}
    </div>
  );

  return (
    <div className={`pane-shell${contentSlot ? " pane-shell-browser" : ""}`} ref={ref}>
      {contentSlot ? (
        <>
          <div className="pane-browser-chrome">
            {/* No drag-to-move here: this header is mostly the address-bar
                toolbar, and `draggable` on an ancestor of a text input
                breaks click-drag text selection inside it. */}
            <div className="pane-header pane-header-browser">
              {toolbar}
              {paneActions}
            </div>
          </div>
          {children}
        </>
      ) : hideHeader ? (
        <div className="pane-body pane-body-fill">{children}</div>
      ) : (
        <>
          {headerRow}
          {toolbar ? <div className="pane-toolbar browser-toolbar">{toolbar}</div> : null}
          <div className="pane-body">{children}</div>
        </>
      )}
    </div>
  );
});
