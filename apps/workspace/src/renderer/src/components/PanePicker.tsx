import { Popover, type AnchorRect } from "./Popover";
import { TabKind, type PaneTabItem } from "../layout/paneTypes";
import { paneKindPickerOptions } from "../panes/paneKindRegistry";
import { WorkbenchIcon, type WorkbenchIconName } from "./WorkbenchIcon";

interface Props {
  anchorRect: AnchorRect;
  onPick: (kind: TabKind, source?: Partial<PaneTabItem>) => void;
  onClose: () => void;
  title?: string;
  current?: TabKind;
}

export function PanePicker({ anchorRect, onPick, onClose, current }: Props) {
  return (
    <Popover anchorRect={anchorRect} onClose={onClose} className="context-menu-popover">
      <div className="context-menu context-menu-inline">
        {paneKindPickerOptions().map((kind) => (
          <button
            key={kind.label}
            type="button"
            className={`context-menu-item${kind.id === current ? " active" : ""}`}
            onClick={() => onPick(kind.id, kind.source)}
          >
            <span className="context-menu-icon"><WorkbenchIcon name={kind.icon as WorkbenchIconName} /></span>
            <span className="context-menu-label">{kind.label}</span>
          </button>
        ))}
      </div>
    </Popover>
  );
}
