import { useEffect, useState } from "react";
import type { TabNode } from "flexlayout-react";
import { PaneFrame } from "../components/PaneFrame";
import { PaneComponent } from "../layout/paneTypes";
import { readFile, writeFile } from "../electron";

// Placeholder stand-in for ui/src/panes/EditorPane.tsx (CodeMirror,
// TreeView, markdown live-preview, autosave, wikilinks, indent guides —
// task 5, not started yet). This exists only so the layout/tab-rail port
// (task 6) has something to render for "code"/"markdown" panes and
// compiles end-to-end; a plain textarea with manual load/save, not a real
// editor. Same Props shape as the eventual CodeMirror port so App.tsx's
// factory won't need to change again when task 5 lands.
interface Props {
  filePath: string | null;
  tabId: number;
  rootPath: string;
  component: PaneComponent;
  tabNode?: TabNode;
  onSplit: (mode: "split-right" | "split-down", paneType: PaneComponent) => void;
  onTypeChange: (component: PaneComponent) => void;
  onClose: () => void;
}

export function EditorPane({ filePath, tabId, component, onSplit, onTypeChange, onClose }: Props) {
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!filePath) {
      setContent("");
      return;
    }
    let cancelled = false;
    readFile(tabId, filePath).then((text) => {
      if (!cancelled) {
        setContent(text);
        setDirty(false);
      }
    }, console.error);
    return () => {
      cancelled = true;
    };
  }, [tabId, filePath]);

  const save = () => {
    if (!filePath) return;
    writeFile(tabId, filePath, content).then(() => setDirty(false), console.error);
  };

  return (
    <PaneFrame
      component={component}
      hideHeader={false}
      onSplit={onSplit}
      onTypeChange={onTypeChange}
      onClose={onClose}
    >
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <textarea
          style={{ flex: 1, minHeight: 0, resize: "none", border: "none", padding: 8 }}
          value={content}
          placeholder={filePath ?? "No file open"}
          disabled={!filePath}
          onChange={(e) => {
            setContent(e.target.value);
            setDirty(true);
          }}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "s") {
              e.preventDefault();
              save();
            }
          }}
        />
        {dirty && <div style={{ padding: "2px 8px", fontSize: 11, opacity: 0.7 }}>Unsaved (Cmd+S to save)</div>}
      </div>
    </PaneFrame>
  );
}
