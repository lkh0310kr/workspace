import { useCallback, useEffect, useState } from "react";
import { DirEntry, listDir, onFileChanged } from "../tauri";

interface Props {
  tabId: number;
  onOpenFile: (path: string, kind: "code" | "markdown") => void;
}

interface DirState {
  entries: DirEntry[];
  loaded: boolean;
}

function classifyFile(name: string): "code" | "markdown" {
  const lower = name.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".markdown") ? "markdown" : "code";
}

export function TreeView({ tabId, onOpenFile }: Props) {
  const [dirs, setDirs] = useState<Map<string, DirState>>(new Map());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const loadDir = useCallback(
    (path: string) => {
      listDir(tabId, path)
        .then((entries) => {
          setDirs((prev) => new Map(prev).set(path, { entries, loaded: true }));
        })
        .catch(console.error);
    },
    [tabId],
  );

  useEffect(() => {
    setDirs(new Map());
    setExpanded(new Set());
    loadDir("");
  }, [tabId, loadDir]);

  useEffect(() => {
    const unlisten = onFileChanged(() => {
      loadDir("");
      for (const path of expanded) loadDir(path);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [loadDir, expanded]);

  const toggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
        if (!dirs.get(path)?.loaded) loadDir(path);
      }
      return next;
    });
  };

  const renderDir = (path: string, depth: number) => {
    const state = dirs.get(path);
    if (!state) return null;
    return state.entries.map((entry) => (
      <div key={entry.path}>
        <div
          className="tree-view-item"
          style={{ paddingLeft: depth * 14 + 8 }}
          onClick={() =>
            entry.is_dir ? toggle(entry.path) : onOpenFile(entry.path, classifyFile(entry.name))
          }
        >
          <span className="tree-view-icon">
            {entry.is_dir ? (expanded.has(entry.path) ? "▾" : "▸") : "·"}
          </span>
          <span className="tree-view-name">{entry.name}</span>
        </div>
        {entry.is_dir && expanded.has(entry.path) && renderDir(entry.path, depth + 1)}
      </div>
    ));
  };

  return <div className="tree-view">{renderDir("", 0)}</div>;
}
