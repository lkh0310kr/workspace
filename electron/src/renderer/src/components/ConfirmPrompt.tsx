import { Popover, type AnchorRect } from "./Popover";

interface Props {
  anchorRect: AnchorRect;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmPrompt({
  anchorRect,
  title,
  message,
  confirmLabel = "Delete",
  onConfirm,
  onClose,
}: Props) {
  return (
    <Popover anchorRect={anchorRect} onClose={onClose} className="text-prompt">
      <div className="text-prompt-title">{title}</div>
      <p className="confirm-prompt-message">{message}</p>
      <div className="text-prompt-actions">
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="confirm-prompt-danger"
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Popover>
  );
}
