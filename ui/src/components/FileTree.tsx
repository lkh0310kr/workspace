/** @deprecated File tree is not used in the current UI. Kept for future revival. */
import { useCallback, useEffect, useState } from "react";
import { DirEntry, listDir, onFileChanged } from "../tauri";

interface Props {
  onOpenFile: (path: string, kind: "code" | "markdown") => void;
}

export function FileTree({ onOpenFile }: Props) {
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [cwd, setCwd] = useState("");

  const refresh = useCallback(() => {
    listDir(cwd).then(setEntries).catch(console.error);
  }, [cwd]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const unlisten = onFileChanged(() => refresh());
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [refresh]);

  const open = (entry: DirEntry) => {
    if (entry.is_dir) {
      setCwd(entry.path);
      return;
    }
    const lower = entry.name.toLowerCase();
    if (lower.endsWith(".md") || lower.endsWith(".markdown")) {
      onOpenFile(entry.path, "markdown");
    } else {
      onOpenFile(entry.path, "code");
    }
  };

  return (
    <div className="file-tree">
      <div className="file-tree-item" onClick={() => setCwd("")}>
        📁 {cwd || "."}
      </div>
      {entries.map((e) => (
        <div
          key={e.path}
          className={`file-tree-item ${e.is_dir ? "dir" : ""}`}
          style={{ paddingLeft: 16 }}
          onClick={() => open(e)}
        >
          {e.is_dir ? "📁" : "📄"} {e.name}
        </div>
      ))}
    </div>
  );
}
