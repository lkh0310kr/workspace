import { useCallback, useEffect, useRef, useState } from "react";
import { PanePicker } from "./PanePicker";
import { SplitIcon } from "./SplitIcon";
import { PaneComponent } from "../layout/paneTypes";
import { popOverlayBlock, pushOverlayBlock } from "../browser/overlayBarrier";

interface Props {
  component: PaneComponent;
  onSplit: (mode: "split-right" | "split-down", paneType: PaneComponent) => void;
  onTypeChange: (component: PaneComponent) => void;
  onClose: () => void;
}

export function PaneActions({ component, onSplit, onTypeChange, onClose }: Props) {
  const [typeOpen, setTypeOpen] = useState(false);
  const closeTypePicker = useCallback(() => setTypeOpen(false), []);
  const blockedRef = useRef(false);

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

  return (
    <>
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
    </>
  );
}
