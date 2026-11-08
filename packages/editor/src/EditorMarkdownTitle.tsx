import type { ReactNode, RefObject } from "react";
import { EditorMarkdownTitleInput } from "./EditorMarkdownTitleInput";

interface Props {
  path: string | null;
  title: string;
  editing: boolean;
  draft: string;
  error: string | null;
  inputRef: RefObject<HTMLInputElement | null>;
  trailing?: ReactNode;
  onStartEditing?: () => void;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}

/** Shared Markdown title display/edit switch; rename policy stays with each host. */
export function EditorMarkdownTitle({
  path,
  title,
  editing,
  draft,
  error,
  inputRef,
  trailing,
  onStartEditing,
  onChange,
  onCommit,
  onCancel,
}: Props) {
  return <div className="editor-title-block">
    {editing
      ? <EditorMarkdownTitleInput inputRef={inputRef} value={draft} error={error} onChange={onChange} onCommit={onCommit} onCancel={onCancel} />
      : <div className="editor-markdown-title" title={path ?? undefined} onClick={onStartEditing}>{title}</div>}
    {trailing}
  </div>;
}
