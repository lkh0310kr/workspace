import { useEffect, useMemo, useRef, useState } from "react";
import { acquireLocalEditorProvider } from "../editor/localEditorProvider";
import { editorSupportsSearch, EditorQuickOpenDialog } from "@workspace/editor";
import type { EditorTreeItem } from "@workspace/editor";

// Cmd+P fuzzy file switcher — a centered modal, not anchor-rect-based like
// Popover.tsx (nothing to anchor to; it's summoned from anywhere).
interface Props {
  tabId: number;
  onOpenFile: (path: string, kind: "code" | "markdown" | "viewer") => void;
  onClose: () => void;
}

export function QuickOpen({ tabId, onOpenFile, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<EditorTreeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const providerLease = useMemo(() => acquireLocalEditorProvider(tabId), [tabId]);
  const provider = providerLease.provider;
  const supportsNameSearch = editorSupportsSearch(provider, "names");
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => () => providerLease.release(), [providerLease]);

  useEffect(() => {
    if (!supportsNameSearch) {
      setItems([]);
      setLoading(false);
      setLoadError(null);
      onCloseRef.current();
      return;
    }
    const controller = new AbortController();
    setItems([]);
    setLoading(true);
    setLoadError(null);
    provider.search(query, {
      target: "names",
      caseSensitive: false,
      regex: false,
      wholeWord: false,
      fuzzy: true,
      limit: 100,
    }, controller.signal).then(
      (results) => {
        if (controller.signal.aborted) return;
        setItems(results.map(({ item }) => item));
        setLoading(false);
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(error instanceof Error ? error.message : String(error));
        setItems([]);
        setLoading(false);
      },
    );
    return () => controller.abort();
  }, [provider, query, supportsNameSearch]);

  const openSelected = (itemId: string): void => {
    const item = items.find((candidate) => candidate.itemId === itemId);
    if (!item) return;
    const kind = item.kind === "markdown" ? "markdown" : item.kind === "asset" ? "viewer" : "code";
    onOpenFile(item.path, kind);
    onClose();
  };

  if (!supportsNameSearch) return null;
  return <EditorQuickOpenDialog
    query={query}
    items={items.map((item) => ({ id: item.itemId, label: item.path }))}
    loading={loading}
    error={loadError}
    onQueryChange={setQuery}
    onSelect={openSelected}
    onClose={onClose}
  />;
}
