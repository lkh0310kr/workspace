import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { EditorOutlineList, type EditorOutlineEntry } from "./EditorOutlineList";
import "./markdownDocument.css";

export interface EditorMarkdownDocumentProps {
  title: ReactNode;
  actions?: ReactNode;
  outlineItems?: readonly EditorOutlineEntry[];
  outlineKey?: string;
  onOutlineNavigate?: (position: number) => void;
  children: ReactNode;
  onBackgroundClick?: (event: MouseEvent<HTMLDivElement>) => void;
  className?: string;
}

/** Workspace-baseline Markdown document frame shared across product shells. */
export function EditorMarkdownDocument({ title, actions, outlineItems, outlineKey, onOutlineNavigate, children, onBackgroundClick, className }: EditorMarkdownDocumentProps) {
  const [outlineOpen, setOutlineOpen] = useState(false);
  useEffect(() => setOutlineOpen(false), [outlineKey]);

  return (
    <div className={["editor-markdown-document", className].filter(Boolean).join(" ")}>
      {(actions || outlineItems !== undefined) && <div className="obsidian-float-actions">
        {actions}
        {outlineItems !== undefined && <div className="editor-markdown-outline-control">
          <button type="button" className={`obsidian-topbar-icon${outlineOpen ? " active" : ""}`} title="Toggle outline" aria-label="Toggle outline" aria-expanded={outlineOpen} onClick={() => setOutlineOpen((open) => !open)}>
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M2 3h12v1H2V3Zm0 4h12v1H2V7Zm0 4h8v1H2v-1Z" /></svg>
          </button>
          {outlineOpen && <div className="editor-markdown-outline-popover"><EditorOutlineList items={outlineItems} onNavigate={(position) => { setOutlineOpen(false); onOutlineNavigate?.(position); }} className="editor-markdown-outline-list" itemClassName="editor-markdown-outline-item" emptyMessage="No headings" /></div>}
        </div>}
      </div>}
      <div className="editor-markdown-scroll" onClick={onBackgroundClick}>
        {title}
        <div className="editor-markdown-content">{children}</div>
      </div>
    </div>
  );
}
