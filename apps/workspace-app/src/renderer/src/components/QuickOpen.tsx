import { useEffect, useMemo, useState } from "react";
import { listAllFiles } from "../electron";
import { fuzzyEditorSearch } from "@workspace/editor";
import { classifyFile } from "./TreeView";
import { EditorQuickOpenDialog } from "@workspace/editor";

// Cmd+P fuzzy file switcher — a centered modal, not anchor-rect-based like
// Popover.tsx (nothing to anchor to; it's summoned from anywhere).
interface Props {
  tabId: number;
  onOpenFile: (path: string, kind: "code" | "markdown" | "viewer") => void;
  onClose: () => void;
}

export function QuickOpen({ tabId, onOpenFile, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setFiles([]);
    setLoading(true);
    setLoadError(null);
    listAllFiles(tabId).then(
      (nextFiles) => {
        if (cancelled) return;
        setFiles(nextFiles);
        setLoading(false);
      },
      (error: unknown) => {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : String(error));
        setFiles([]);
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [tabId]);

  const filtered = useMemo(() => fuzzyEditorSearch(files, query, (f) => f, 100), [files, query]);

  const openSelected = (path: string): void => {
    onOpenFile(path, classifyFile(path));
    onClose();
  };

  return <EditorQuickOpenDialog
    query={query}
    items={filtered.map((path) => ({ id: path, label: path }))}
    loading={loading}
    error={loadError}
    onQueryChange={setQuery}
    onSelect={openSelected}
    onClose={onClose}
  />;
}
