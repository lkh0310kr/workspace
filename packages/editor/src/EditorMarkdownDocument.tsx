import type { MouseEvent, ReactNode } from "react";
import "./markdownDocument.css";

export interface EditorMarkdownDocumentProps {
  title: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  onBackgroundClick?: (event: MouseEvent<HTMLDivElement>) => void;
  className?: string;
}

/** Workspace-baseline Markdown document frame shared across product shells. */
export function EditorMarkdownDocument({ title, actions, children, onBackgroundClick, className }: EditorMarkdownDocumentProps) {
  return (
    <div className={["editor-markdown-document", className].filter(Boolean).join(" ")}>
      {actions}
      <div className="editor-markdown-scroll" onClick={onBackgroundClick}>
        {title}
        <div className="editor-markdown-content">{children}</div>
      </div>
    </div>
  );
}
