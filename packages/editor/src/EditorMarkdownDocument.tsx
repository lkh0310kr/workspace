import { type MouseEvent, type ReactNode } from "react";
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
  const handleBackgroundClick = (event: MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest(".cm-editor, .editor-title-block, .editor-markdown-title, .md-title-edit")) return;
    onBackgroundClick?.(event);
  };

  return (
    <div className={["editor-markdown-document", className].filter(Boolean).join(" ")}>
      {actions && <div className="editor-floating-actions">{actions}</div>}
      <div className="editor-markdown-scroll" onClick={handleBackgroundClick}>
        {title}
        <div className="editor-markdown-content">{children}</div>
      </div>
    </div>
  );
}
