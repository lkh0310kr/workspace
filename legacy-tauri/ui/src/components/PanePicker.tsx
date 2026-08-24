import { createPortal } from "react-dom";
import { PaneComponent, PANE_OPTIONS } from "../layout/paneTypes";

interface Props {
  onPick: (pane: PaneComponent) => void;
  onClose: () => void;
  title?: string;
  current?: PaneComponent;
}

export function PanePicker({ onPick, onClose, title = "Add pane", current }: Props) {
  return createPortal(
    <div className="pane-picker-backdrop" onClick={onClose}>
      <div className="pane-picker" onClick={(e) => e.stopPropagation()}>
        <div className="pane-picker-title">{title}</div>
        <div className="pane-picker-grid">
          {PANE_OPTIONS.map((pane) => (
            <button
              key={pane.id}
              type="button"
              className={`pane-picker-item${pane.id === current ? " active" : ""}`}
              onClick={() => onPick(pane.id)}
            >
              <span className="pane-picker-icon">{pane.icon}</span>
              <span>{pane.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
