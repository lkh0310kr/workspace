import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import type { TabNode } from "flexlayout-react";
import { PanePicker } from "./PanePicker";
import { SplitIcon } from "./SplitIcon";
import { paneLabel, PaneComponent } from "../layout/paneTypes";
import { popOverlayBlock, pushOverlayBlock } from "../browser/overlayBarrier";
import { startPaneDrag } from "../layout/layoutRef";

interface Props {
  component: PaneComponent;
  toolbar?: ReactNode;
  contentSlot?: boolean;
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
  { component, toolbar, contentSlot, tabNode, onSplit, onTypeChange, onClose, children },
  ref,
) {
  const [typeOpen, setTypeOpen] = useState(false);
  const closeTypePicker = useCallback(() => setTypeOpen(false), []);
  const blockedRef = useRef(false);

  // Any pane's type picker hides all browser webviews app-wide: native
  // child webviews render above the DOM regardless of which pane owns them.
  useEffect(() => {
    if (typeOpen === blockedRef.current) return;
    blockedRef.current = typeOpen;
    if (typeOpen) pushOverlayBlock();
    else popOverlayBlock();
  }, [typeOpen]);

  useEffect(
    () => () => {
      if (blockedRef.current) popOverlayBlock();
    },
    [],
  );

  const paneActions = (
    <div className="pane-actions">
      <div className="pane-type-anchor">
        <button
          type="button"
          className={`pane-action ${typeOpen ? "active" : ""}`}
          title="Change pane type"
          onClick={(e) => {
            e.stopPropagation();
            setTypeOpen((open) => !open);
          }}
        >
          ⊞
        </button>
      </div>
      <button
        type="button"
        className="pane-action pane-action-icon"
        title="Split side by side"
        onClick={() => onSplit("split-right", component)}
      >
        <SplitIcon direction="vertical" />
      </button>
      <button
        type="button"
        className="pane-action pane-action-icon"
        title="Split stacked"
        onClick={() => onSplit("split-down", component)}
      >
        <SplitIcon direction="horizontal" />
      </button>
      <button type="button" className="pane-action" title="Close" onClick={onClose}>
        ×
      </button>
    </div>
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
      <span className="pane-title">{paneLabel(component)}</span>
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
      ) : (
        <>
          {headerRow}
          {toolbar ? <div className="pane-toolbar browser-toolbar">{toolbar}</div> : null}
          <div className="pane-body">{children}</div>
        </>
      )}
      {typeOpen ? (
        <PanePicker
          title="Change pane type"
          current={component}
          onPick={(pane) => {
            onTypeChange(pane);
            closeTypePicker();
          }}
          onClose={closeTypePicker}
        />
      ) : null}
    </div>
  );
});
