import { forwardRef, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { PanePicker } from "./PanePicker";
import { SplitIcon } from "./SplitIcon";
import { paneLabel, PaneComponent } from "../layout/paneTypes";
import { popOverlayBlock, pushOverlayBlock } from "../browser/overlayBarrier";

interface Props {
  component: PaneComponent;
  toolbar?: ReactNode;
  contentSlot?: boolean;
  onSplit: (mode: "split-right" | "split-down", paneType: PaneComponent) => void;
  onTypeChange: (component: PaneComponent) => void;
  onClose: () => void;
  children?: ReactNode;
}

export const PaneFrame = forwardRef<HTMLDivElement, Props>(function PaneFrame(
  { component, toolbar, contentSlot, onSplit, onTypeChange, onClose, children },
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

  const headerRow = (
    <div className="pane-header">
      <span className="pane-title">{paneLabel(component)}</span>
      {paneActions}
    </div>
  );

  return (
    <div className={`pane-shell${contentSlot ? " pane-shell-browser" : ""}`} ref={ref}>
      {contentSlot ? (
        <>
          <div className="pane-browser-chrome">
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
