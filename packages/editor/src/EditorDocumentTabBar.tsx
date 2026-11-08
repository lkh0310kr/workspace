import type { ReactNode } from "react";
import { EditorTabChip } from "./EditorTabChip";

export interface EditorDocumentTab {
  id: string;
  label: string;
  title?: string;
  dirty?: boolean;
  icon?: ReactNode;
}

interface Props {
  tabs: readonly EditorDocumentTab[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  ariaLabel?: string;
}

/** Shared document-tab interaction used by PKMS and Workspace editor hosts. */
export function EditorDocumentTabBar({ tabs, activeId, onSelect, onClose, ariaLabel = "Open documents" }: Props) {
  return (
    <div className="editor-document-tabs" role="tablist" aria-label={ariaLabel}>
      {tabs.map((tab) => (
        <div className="editor-document-tab-slot" key={tab.id}>
          <EditorTabChip
            id={tab.id}
            label={tab.label}
            title={tab.title}
            active={activeId === tab.id}
            dirty={tab.dirty}
            icon={tab.icon}
            className="editor-document-tab"
            iconClassName="editor-document-tab-icon"
            labelClassName="editor-document-tab-label"
            closeClassName="editor-document-tab-close"
            onClick={() => onSelect(tab.id)}
            onClose={() => onClose(tab.id)}
          />
        </div>
      ))}
    </div>
  );
}
