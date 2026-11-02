import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { FileRecord, Workspace } from "../../domain/types";
import { readWorkspaceTree, replaceDirectoryEntries, sameFileRecords, writeWorkspaceTree, type WorkspaceTreeCache } from "../../client/workspaceTreeCache";
import { flushQueuedWorkspaceAssets, flushQueuedWorkspaceOperations } from "../../client/workspaceOperations";

type Api = <T = unknown>(path: string, init?: RequestInit) => Promise<T>;
type DirectoryResponse = { files: FileRecord[] };

async function flushLocalQueue(workspaceId: string, api: Api): Promise<boolean> {
  const operationsDrained = await flushQueuedWorkspaceOperations(workspaceId, api).catch(() => false);
  return operationsDrained ? flushQueuedWorkspaceAssets(workspaceId, api).catch(() => false) : false;
}

export function useWorkspaceDirectory(
  activeWorkspace: Workspace | null,
  api: Api,
  reportError: (message: string) => void,
) {
  const [currentFolder, setCurrentFolderState] = useState("");
  const [files, setFilesState] = useState<FileRecord[]>([]);
  const [loadingFolder, setLoadingFolder] = useState(false);
  const [loadingFolderPaths, setLoadingFolderPaths] = useState<Set<string>>(() => new Set());
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set([""]));
  const [loadedFoldersState, setLoadedFoldersState] = useState<Set<string>>(() => new Set());
  const filesRef = useRef(files);
  const loadedFoldersRef = useRef(loadedFoldersState);
  const workspaceIdRef = useRef(activeWorkspace?.id);
  const inFlight = useRef(new Map<string, Promise<void>>());
  workspaceIdRef.current = activeWorkspace?.id;

  const persist = useCallback((nextFiles = filesRef.current, nextLoaded = loadedFoldersRef.current) => {
    const workspaceId = activeWorkspace?.id;
    if (!workspaceId || (!nextFiles.length && !nextLoaded.has(""))) return;
    void writeWorkspaceTree({ workspaceId, files: nextFiles, loadedFolders: [...nextLoaded], savedAt: Date.now() }).catch(() => {});
  }, [activeWorkspace?.id]);

  const setFiles: Dispatch<SetStateAction<FileRecord[]>> = useCallback((action) => {
    const next = typeof action === "function" ? action(filesRef.current) : action;
    if (sameFileRecords(filesRef.current, next)) return;
    filesRef.current = next;
    setFilesState(next);
    if (next.length) persist(next);
  }, [persist]);

  const setLoadedFolders: Dispatch<SetStateAction<Set<string>>> = useCallback((action) => {
    const next = typeof action === "function" ? action(loadedFoldersRef.current) : action;
    if (next.size === loadedFoldersRef.current.size && [...next].every((path) => loadedFoldersRef.current.has(path))) return;
    loadedFoldersRef.current = next;
    setLoadedFoldersState(next);
    persist(filesRef.current, next);
  }, [persist]);

  const setCurrentFolder: Dispatch<SetStateAction<string>> = useCallback((action) => {
    setCurrentFolderState((current) => typeof action === "function" ? action(current) : action);
  }, []);

  const replaceDirectory = useCallback((directory: string, entries: FileRecord[]) => {
    if (workspaceIdRef.current !== activeWorkspace?.id) return;
    setFiles((current) => replaceDirectoryEntries(current, directory, entries));
    const loaded = new Set(loadedFoldersRef.current).add(directory);
    setLoadedFolders(loaded);
    persist(filesRef.current, loaded);
  }, [activeWorkspace?.id, persist, setFiles, setLoadedFolders]);

  const refreshDirectory = useCallback((directory: string, showLoading: boolean): Promise<void> => {
    if (!activeWorkspace) return Promise.resolve();
    const existing = inFlight.current.get(directory);
    if (existing) return existing;
    if (showLoading) setLoadingFolderPaths((current) => new Set(current).add(directory));
    const workspaceId = activeWorkspace.id;
    const request = flushLocalQueue(workspaceId, api)
      .then(() => api<DirectoryResponse>(`/api/workspaces/${workspaceId}/directory?path=${encodeURIComponent(directory)}`))
      .then((result) => {
        if (workspaceIdRef.current === workspaceId) replaceDirectory(directory, result.files);
      })
      .finally(() => {
        inFlight.current.delete(directory);
        if (showLoading) setLoadingFolderPaths((current) => {
          const next = new Set(current);
          next.delete(directory);
          return next;
        });
      });
    inFlight.current.set(directory, request);
    return request;
  }, [activeWorkspace, api, replaceDirectory]);

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
    const cached = loadedFoldersRef.current.has(file.path);
    if (cached) {
      void refreshDirectory(file.path, false).catch(() => {});
      return;
    }
    try {
      await refreshDirectory(file.path, true);
    } catch (cause) {
      reportError(cause instanceof Error ? cause.message : "Could not open folder");
    }
  }, [activeWorkspace, expandedFolders, refreshDirectory, reportError]);

  const restoreWorkspaceTree = useCallback(async (isActive: () => boolean): Promise<number | null> => {
    if (!activeWorkspace) return null;
    const workspaceId = activeWorkspace.id;
    const storageKey = `pkms:tree:${workspaceId}`;
    let saved: { expanded?: string[]; currentFolder?: string; scrollTop?: number } = {};
    try { saved = JSON.parse(localStorage.getItem(storageKey) ?? "{}"); } catch { saved = {}; }
    const expanded = [...new Set(["", ...(saved.expanded ?? [])])];
    setLoadingFolder(true);

    let cached: WorkspaceTreeCache | null = null;
    try { cached = await readWorkspaceTree(workspaceId); } catch { /* Use the network when local cache is unavailable. */ }
    if (!isActive() || workspaceIdRef.current !== workspaceId) return null;

    if (cached) {
      filesRef.current = cached.files;
      setFilesState(cached.files);
      loadedFoldersRef.current = new Set(cached.loadedFolders);
      loadedFoldersRef.current.add("");
      setLoadedFoldersState(loadedFoldersRef.current);
      setCurrentFolderState(saved.currentFolder ?? "");
      setExpandedFolders(new Set(expanded));
      setLoadingFolder(false);
      const refresh = async () => {
        await flushLocalQueue(workspaceId, api);
        const paths = [...new Set(["", ...expanded.filter(Boolean)])];
        const results = await Promise.allSettled(paths.map((path) => api<DirectoryResponse>(
          `/api/workspaces/${workspaceId}/directory?path=${encodeURIComponent(path)}`,
        )));
        if (!isActive() || workspaceIdRef.current !== workspaceId) return;
        results.forEach((result, index) => {
          if (result.status === "fulfilled") replaceDirectory(paths[index], result.value.files);
        });
      };
      void refresh().catch(() => {});
      return saved.scrollTop ?? 0;
    }

    try {
      await flushLocalQueue(workspaceId, api);
      const root = await api<DirectoryResponse>(`/api/workspaces/${workspaceId}/directory`);
      if (!isActive() || workspaceIdRef.current !== workspaceId) return null;
      replaceDirectory("", root.files);
      const loaded = new Set([""]);
      setLoadedFolders(loaded);
      setCurrentFolderState(saved.currentFolder ?? "");
      setExpandedFolders(new Set(expanded));
      setLoadingFolder(false);
      persist(filesRef.current, loaded);
      const paths = expanded.filter(Boolean);
      if (paths.length) {
        setLoadingFolderPaths(new Set(paths));
        void Promise.allSettled(paths.map((path) => api<DirectoryResponse>(
          `/api/workspaces/${workspaceId}/directory?path=${encodeURIComponent(path)}`,
        ))).then((results) => {
          if (!isActive() || workspaceIdRef.current !== workspaceId) return;
          results.forEach((result, index) => {
            if (result.status === "fulfilled") replaceDirectory(paths[index], result.value.files);
          });
        }).finally(() => {
          if (workspaceIdRef.current === workspaceId) setLoadingFolderPaths(new Set());
        });
      }
      return saved.scrollTop ?? 0;
    } catch (cause) {
      if (isActive() && workspaceIdRef.current === workspaceId) {
        setLoadingFolder(false);
        reportError(cause instanceof Error ? cause.message : "Could not load workspace");
      }
      return null;
    }
  }, [activeWorkspace, api, persist, replaceDirectory, reportError, setLoadedFolders]);

  return {
    currentFolder, setCurrentFolder, files, setFiles,
    loadingFolder, setLoadingFolder,
    loadingFolderPaths, setLoadingFolderPaths,
    expandedFolders, setExpandedFolders,
    loadedFolders: loadedFoldersState, setLoadedFolders,
    toggleDirectory, restoreWorkspaceTree,
  };
}
