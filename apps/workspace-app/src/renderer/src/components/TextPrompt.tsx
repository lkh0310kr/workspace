import { useRef, useState } from "react";
import { Popover, type AnchorRect } from "./Popover";

// Electron doesn't implement window.prompt() at all — it throws
// "prompt() is not supported" unconditionally (a long-standing, never-
// fixed Electron gap: window.alert()/confirm() work via native dialogs,
// prompt() never got the same treatment). TreeView's New Folder/Rename
// both used it, so both were completely broken. This is the replacement:
// a small popover with a text input, anchored wherever the caller says
// (the context-menu click position, for TreeView's case).
interface Props {
  anchorRect: AnchorRect;
  title: string;
  defaultValue?: string;
  submitLabel?: string;
  onSubmit: (value: string) => void;
  onClose: () => void;
}

export function TextPrompt({ anchorRect, title, defaultValue = "", submitLabel = "OK", onSubmit, onClose }: Props) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    onClose();
  };

  return (
    <Popover anchorRect={anchorRect} onClose={onClose} className="text-prompt">
      <div className="text-prompt-title">{title}</div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          ref={inputRef}
          // Popover portals synchronously, so this can autofocus without
          // a mount-effect race.
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
          }}
        />
        <div className="text-prompt-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={!value.trim()}>
            {submitLabel}
          </button>
        </div>
      </form>
    </Popover>
  );
}
