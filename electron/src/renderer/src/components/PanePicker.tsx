import { createPortal } from "react-dom";
import { TabKind, TAB_KIND_OPTIONS } from "../layout/paneTypes";

interface Props {
  onPick: (kind: TabKind) => void;
  onClose: () => void;
  title?: string;
  current?: TabKind;
}

export function PanePicker({ onPick, onClose, title = "Add pane", current }: Props) {
  return createPortal(
    <div className="pane-picker-backdrop" onClick={onClose}>
      <div className="pane-picker" onClick={(e) => e.stopPropagation()}>
        <div className="pane-picker-title">{title}</div>
        <div className="pane-picker-grid">
          {TAB_KIND_OPTIONS.map((kind) => (
            <button
              key={kind.id}
              type="button"
              className={`pane-picker-item${kind.id === current ? " active" : ""}`}
              onClick={() => onPick(kind.id)}
            >
              <span className="pane-picker-icon">{kind.icon}</span>
              <span>{kind.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
