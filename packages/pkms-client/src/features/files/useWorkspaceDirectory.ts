import { useCallback, useState } from "react";
import { parentPath } from "../../domain/fileTree";
import type { FileRecord, Workspace } from "../../domain/types";

type Api = <T = unknown>(path: string, init?: RequestInit) => Promise<T>;

export function useWorkspaceDirectory(
  activeWorkspace: Workspace | null,
  api: Api,
  reportError: (message: string) => void,
) {
  const [currentFolder, setCurrentFolder] = useState("");
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [loadingFolder, setLoadingFolder] = useState(false);
  const [loadingFolderPaths, setLoadingFolderPaths] = useState<Set<string>>(() => new Set());
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set([""]));
  const [loadedFolders, setLoadedFolders] = useState<Set<string>>(() => new Set());

  const toggleDirectory = useCallback(async (file: FileRecord) => {
    if (!activeWorkspace) return;
    if (expandedFolders.has(file.path)) {
      setExpandedFolders((current) => {
        const next = new Set(current);
        next.delete(file.path);
        return next;
      });
      return;
    }
    setExpandedFolders((current) => new Set(current).add(file.path));
    if (loadedFolders.has(file.path)) return;
    setLoadingFolderPaths((current) => new Set(current).add(file.path));
    try {
      const result = await api<{ files: FileRecord[] }>(`/api/workspaces/${activeWorkspace.id}/directory?path=${encodeURIComponent(file.path)}`);
      setFiles((current) => [...current.filter((entry) => parentPath(entry.path) !== file.path), ...result.files]);
      setLoadedFolders((current) => new Set(current).add(file.path));
    } catch (cause) {
      reportError(cause instanceof Error ? cause.message : "Could not open folder");
    } finally {
      setLoadingFolderPaths((current) => {
        const next = new Set(current);
        next.delete(file.path);
        return next;
      });
    }
  }, [activeWorkspace, api, expandedFolders, loadedFolders, reportError]);

  const restoreWorkspaceTree = useCallback(async (isActive: () => boolean): Promise<number | null> => {
    if (!activeWorkspace) return null;
    setLoadingFolder(true);
    try {
      const root = await api<{ files: FileRecord[] }>(`/api/workspaces/${activeWorkspace.id}/directory`);
      if (!isActive()) return null;

      const storageKey = `pkms:tree:${activeWorkspace.id}`;
      let saved: { expanded?: string[]; currentFolder?: string; scrollTop?: number } = {};
      try { saved = JSON.parse(localStorage.getItem(storageKey) ?? "{}"); } catch { saved = {}; }
      const expanded = [...new Set(["", ...(saved.expanded ?? [])])];
      const restored = await Promise.allSettled(expanded.filter(Boolean).map((path) =>
        api<{ files: FileRecord[] }>(`/api/workspaces/${activeWorkspace.id}/directory?path=${encodeURIComponent(path)}`),
      ));
      if (!isActive()) return null;

      const restoredFiles = restored.flatMap((entry) => entry.status === "fulfilled" ? entry.value.files : []);
      const loaded = new Set(["", ...expanded.filter((_path, index) => restored[index - 1]?.status === "fulfilled")]);
      setFiles([...root.files, ...restoredFiles]);
      setCurrentFolder(saved.currentFolder ?? "");
      setExpandedFolders(new Set(expanded));
      setLoadedFolders(loaded);
      setLoadingFolder(false);
      return saved.scrollTop ?? 0;
    } catch (cause) {
      if (isActive()) {
        setLoadingFolder(false);
        reportError(cause instanceof Error ? cause.message : "Could not load workspace");
      }
      return null;
    }
  }, [activeWorkspace, api, reportError]);

  return {
    currentFolder,
    setCurrentFolder,
    files,
    setFiles,
    loadingFolder,
    setLoadingFolder,
    loadingFolderPaths,
    setLoadingFolderPaths,
    expandedFolders,
    setExpandedFolders,
    loadedFolders,
    setLoadedFolders,
    toggleDirectory,
    restoreWorkspaceTree,
  };
}
