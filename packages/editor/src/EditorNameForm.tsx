import { useEffect, useRef, useState } from "react";

interface Props {
  title: string;
  initialValue?: string;
  submitLabel?: string;
  titleTag?: "div" | "h2";
  titleClassName?: string;
  inputClassName?: string;
  actionsClassName?: string;
  cancelButtonClassName?: string;
  submitButtonClassName?: string;
  selectInitialValue?: boolean;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

/** Shared name-entry behavior; hosts own where the form is presented. */
export function EditorNameForm({
  title,
  initialValue = "",
  submitLabel = "Save",
  titleTag = "div",
  titleClassName,
  inputClassName,
  actionsClassName,
  cancelButtonClassName,
  submitButtonClassName,
  selectInitialValue = false,
  onSubmit,
  onCancel,
}: Props) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setValue(initialValue);
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
      if (selectInitialValue) inputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [initialValue, selectInitialValue]);

  const Title = titleTag;
  const trimmed = value.trim();
  return <div className="editor-name-form">
    <Title className={titleClassName}>{title}</Title>
    <form onSubmit={(event) => { event.preventDefault(); if (trimmed) onSubmit(trimmed); }}>
      <input
        ref={inputRef}
        className={inputClassName}
        autoFocus
        value={value}
        onChange={(event) => setValue(event.target.value)}
        aria-label={title}
      />
      <div className={actionsClassName}>
        <button type="button" className={cancelButtonClassName} onClick={onCancel}>Cancel</button>
        <button type="submit" className={submitButtonClassName} disabled={!trimmed}>{submitLabel}</button>
      </div>
    </form>
  </div>;
}
