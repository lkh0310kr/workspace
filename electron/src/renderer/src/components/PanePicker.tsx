import { Popover } from "./Popover";
import { TabKind, TAB_KIND_OPTIONS } from "../layout/paneTypes";

interface Props {
  anchorRect: DOMRect;
  onPick: (kind: TabKind) => void;
  onClose: () => void;
  title?: string;
  current?: TabKind;
}

export function PanePicker({ anchorRect, onPick, onClose, title = "Add pane", current }: Props) {
  return (
    <Popover anchorRect={anchorRect} onClose={onClose} className="pane-picker">
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
    </Popover>
  );
}
