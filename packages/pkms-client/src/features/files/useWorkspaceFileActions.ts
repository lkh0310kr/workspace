import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { NavigateFunction } from "react-router";
import type { FileRecord, TreeContextMenu, TreeRow, Workspace } from "../../domain/types";
import { entryName, parentPath, treeSelectionRoots } from "../../domain/fileTree";
import { fileLocationPath } from "../../domain/fileLocation";
import { submitWorkspaceOperation } from "../../client/workspaceOperations";

function remapPath(path: string, from: string, to: string, kind: FileRecord["kind"]): string {
  if (path === from) return to;
  if (kind === "folder" && path.startsWith(`${from}/`)) return `${to}${path.slice(from.length)}`;
  return path;
}

function remapFiles(files: FileRecord[], file: FileRecord, from: string, to: string): FileRecord[] {
  return files.map((entry) => {
    const path = remapPath(entry.path, from, to, file.kind);
    return path === entry.path ? entry : { ...entry, path };
  });
}

interface Options {
  workspace: Workspace | null; activeFile: FileRecord | null; currentFolder: string; parentFolder: string; files: FileRecord[];
  selectedTreePaths: Set<string>; treeRows: TreeRow[]; expandedFolders: Set<string>;
  api: <T = unknown>(path: string, options?: RequestInit) => Promise<T>; navigate: NavigateFunction; routedPath: MutableRefObject<string | null>;
  clearActiveFile: () => void; openFile: (file: FileRecord, historyAction?: "push" | "replace" | "none") => Promise<void>; toggleFolder: (file: FileRecord) => Promise<void>;
  setFiles: Dispatch<SetStateAction<FileRecord[]>>; setActiveFile: Dispatch<SetStateAction<FileRecord | null>>; setCurrentFolder: Dispatch<SetStateAction<string>>;
  setExpandedFolders: Dispatch<SetStateAction<Set<string>>>; setLoadedFolders: Dispatch<SetStateAction<Set<string>>>;
  setSelectedTreePaths: Dispatch<SetStateAction<Set<string>>>; setCutTreePaths: Dispatch<SetStateAction<Set<string>>>;
  setFocusedTreePath: Dispatch<SetStateAction<string | null>>; setTreeContextMenu: Dispatch<SetStateAction<TreeContextMenu | null>>;
  setError: Dispatch<SetStateAction<string>>; setNotice: Dispatch<SetStateAction<string>>;
  requestName: (title: string, initialValue?: string) => Promise<string | null>;
  confirm: (message: string) => Promise<boolean>;
  beforeDelete?: (roots: FileRecord[]) => boolean;
  afterDelete?: (roots: FileRecord[]) => void;
}

export function useWorkspaceFileActions(options: Options) {
  const { workspace: activeWorkspace, activeFile, currentFolder, parentFolder, files, selectedTreePaths, treeRows, expandedFolders, api, navigate, routedPath, clearActiveFile, openFile, toggleFolder, setFiles, setActiveFile, setCurrentFolder, setExpandedFolders, setLoadedFolders, setSelectedTreePaths, setCutTreePaths, setFocusedTreePath, setTreeContextMenu, setError, setNotice, requestName, confirm, beforeDelete, afterDelete } = options;
  const updateFilePath = async (file: FileRecord, toPath: string) => {
    if (!activeWorkspace) return;
    let activePath = activeFile?.path;
    const applyLocalPath = (from: string, destination: string) => {
      setFiles((current) => remapFiles(current, file, from, destination));
      setCurrentFolder((path) => remapPath(path, from, destination, file.kind));
      if (file.kind === "folder") {
        setExpandedFolders((current) => new Set([...current].map((path) => remapPath(path, from, destination, file.kind))));
        setLoadedFolders((current) => new Set([...current].map((path) => remapPath(path, from, destination, file.kind))));
      }
      setSelectedTreePaths((current) => new Set([...current].map((path) => remapPath(path, from, destination, file.kind))));
      setCutTreePaths((current) => new Set([...current].map((path) => remapPath(path, from, destination, file.kind))));
      if (activeFile && activePath && (activeFile.id === file.id || (file.kind === "folder" && activePath.startsWith(`${from}/`)))) {
        activePath = remapPath(activePath, from, destination, file.kind);
        const path = activePath;
        setActiveFile((current) => current?.id === activeFile.id ? { ...current, path } : current);
        const target = fileLocationPath(activeWorkspace.id, path);
        routedPath.current = target;
        navigate(target, { replace: true, preventScrollReset: true });
      }
    };
    setError("");
    applyLocalPath(file.path, toPath);
    try {
      const result = await submitWorkspaceOperation(api, activeWorkspace, { type: "move", fileId: file.id, toPath });
      if (result.conflictCopyPath && result.conflictCopyPath !== toPath) applyLocalPath(toPath, result.conflictCopyPath);
      if (result.conflictCopyPath) setNotice("Name conflict resolved while moving the item.");
      else if (result.links?.updated) setNotice(`Updated links in ${result.links.updated} note${result.links.updated === 1 ? "" : "s"}.`);
      if (result.links?.failed) setError("The item moved, but some links could not be updated.");
    } catch (cause) {
      applyLocalPath(toPath, file.path);
      setError(cause instanceof Error ? cause.message : "Could not rename item");
    }
  };

  const moveTreeItems = async (items: FileRecord[], destination: string) => {
    if (!activeWorkspace || !items.length) return;
    const roots = treeSelectionRoots(items, new Set(items.map((file) => file.path)));
    const moves = roots.map((file) => ({ file, toPath: `${destination ? `${destination}/` : ""}${entryName(file.path)}` }))
      .filter(({ file, toPath }) => toPath !== file.path);
    if (!moves.length) { setTreeContextMenu(null); return; }
    const invalid = moves.find(({ file }) => file.kind === "folder" && destination.startsWith(`${file.path}/`));
    if (invalid) { setError("A folder cannot be moved into itself or one of its subfolders."); setTreeContextMenu(null); return; }
    if (destination && !files.some((file) => file.path === destination && file.kind === "folder")) {
      setError("Destination folder is not available in the file tree."); setTreeContextMenu(null); return;
    }
    setTreeContextMenu(null);
    setError("");
    let activePath = activeFile?.path;
    const applyMoves = (changes: Array<{ file: FileRecord; fromPath: string; toPath: string }>) => {
      const mapPath = (path: string) => changes.reduce((next, change) => remapPath(next, change.fromPath, change.toPath, change.file.kind), path);
      setFiles((current) => changes.reduce((next, change) => remapFiles(next, change.file, change.fromPath, change.toPath), current));
      setCurrentFolder((path) => mapPath(path));
      setExpandedFolders((paths) => new Set([...paths].map(mapPath)));
      setLoadedFolders((paths) => new Set([...paths].map(mapPath)));
      setSelectedTreePaths((paths) => new Set([...paths].map(mapPath)));
      setCutTreePaths((paths) => new Set([...paths].map(mapPath)));
      setFocusedTreePath((path) => path ? mapPath(path) : path);
      if (activeFile && activePath) {
        const path = mapPath(activePath);
        if (path !== activePath) {
          activePath = path;
          setActiveFile((current) => current?.id === activeFile.id ? { ...current, path } : current);
          const target = fileLocationPath(activeWorkspace.id, path);
          routedPath.current = target;
          navigate(target, { replace: true, preventScrollReset: true });
        }
      }
    };
    applyMoves(moves.map(({ file, toPath }) => ({ file, fromPath: file.path, toPath })));
    const resolvedMoves: Array<{ file: FileRecord; destination: string }> = [];
    let linksUpdated = 0;
    try {
      for (const move of moves) {
        const result = await submitWorkspaceOperation(api, activeWorkspace, { type: "move", fileId: move.file.id, toPath: move.toPath });
        resolvedMoves.push({ file: move.file, destination: result.conflictCopyPath ?? move.toPath });
        linksUpdated += result.links?.updated ?? 0;
        if (result.conflictCopyPath && result.conflictCopyPath !== move.toPath) {
          applyMoves([{ file: move.file, fromPath: move.toPath, toPath: result.conflictCopyPath }]);
        }
      }
      setSelectedTreePaths(new Set(resolvedMoves.map((move) => move.destination)));
      setCutTreePaths(new Set());
      setFocusedTreePath(resolvedMoves[0]?.destination ?? null);
      if (resolvedMoves.some((move, index) => move.destination !== moves[index]?.toPath)) setNotice("Name conflict resolved while moving items.");
      else if (linksUpdated) setNotice(`Updated links in ${linksUpdated} note${linksUpdated === 1 ? "" : "s"}.`);
    } catch (cause) {
      try {
        const snapshot = await api<{ files: FileRecord[] }>(`/api/workspaces/${activeWorkspace.id}/snapshot`);
        setFiles(snapshot.files);
        setSelectedTreePaths(new Set());
        setCurrentFolder((path) => { let next = path; while (next && !snapshot.files.some((file) => file.kind === "folder" && file.path === next)) next = parentPath(next); return next; });
        const current = activeFile ? snapshot.files.find((file) => file.id === activeFile.id) : null;
        if (current && current.path !== activeFile?.path) {
          setActiveFile(current);
          const target = fileLocationPath(activeWorkspace.id, current.path);
          routedPath.current = target;
          navigate(target, { replace: true, preventScrollReset: true });
        }
      } catch { /* Keep the original operation error visible. */ }
      setError(`${resolvedMoves.length ? "Some items may have moved. The tree was refreshed. " : ""}${cause instanceof Error ? cause.message : "Could not move selected items"}`);
    }
  };

  const renameActiveFile = async () => {
    if (!activeFile) return;
    const name = await requestName("Rename", entryName(activeFile.path));
    if (!name?.trim() || name.trim() === entryName(activeFile.path)) return;
    const parent = parentPath(activeFile.path);
    void updateFilePath(activeFile, `${parent ? `${parent}/` : ""}${name.trim()}`);
  };

  const renameCurrentFolder = async () => {
    const folder = files.find((file) => file.kind === "folder" && file.path === currentFolder);
    if (!folder) return;
    const name = await requestName("Rename", entryName(currentFolder));
    if (!name?.trim() || name.trim() === entryName(currentFolder)) return;
    void updateFilePath(folder, `${parentPath(currentFolder) ? `${parentPath(currentFolder)}/` : ""}${name.trim()}`);
  };

  const renameTreeItem = async (file: FileRecord) => {
    setTreeContextMenu(null);
    const currentName = entryName(file.path);
    const name = await requestName("Rename", currentName);
    if (!name?.trim() || name.trim() === currentName) return;
    const parent = parentPath(file.path);
    void updateFilePath(file, `${parent ? `${parent}/` : ""}${name.trim()}`);
  };

  const renameTreeItemTo = (file: FileRecord, name: string) => {
    const nextName = name.trim();
    if (!nextName || nextName === entryName(file.path)) return;
    const parent = parentPath(file.path);
    void updateFilePath(file, `${parent ? `${parent}/` : ""}${nextName}`);
  };

  const deleteTreeItems = async (filesToDelete: FileRecord[]): Promise<boolean> => {
    setTreeContextMenu(null);
    if (!activeWorkspace || !filesToDelete.length) return false;
    const roots = treeSelectionRoots(filesToDelete, new Set(filesToDelete.map((file) => file.path)));
    const message = roots.length === 1 ? `Delete ${entryName(roots[0].path)}?` : `Delete ${roots.length} selected items?`;
    if (!await confirm(message)) return false;
    if (beforeDelete && !beforeDelete(roots)) return false;
    const previousFiles = files;
    const isInsideDeleted = (path: string) => roots.some((file) => path === file.path || (file.kind === "folder" && path.startsWith(`${file.path}/`)));
    setFiles((current) => current.filter((entry) => !isInsideDeleted(entry.path)));
    setExpandedFolders((current) => new Set([...current].filter((path) => !isInsideDeleted(path))));
    setLoadedFolders((current) => new Set([...current].filter((path) => !isInsideDeleted(path))));
    if (currentFolder && isInsideDeleted(currentFolder)) setCurrentFolder(parentPath(roots.find((file) => currentFolder === file.path || currentFolder.startsWith(`${file.path}/`))?.path ?? currentFolder));
    if (activeFile && isInsideDeleted(activeFile.path)) {
      clearActiveFile();
      routedPath.current = null;
      navigate("/", { replace: true, preventScrollReset: true });
    }
    setSelectedTreePaths(new Set());
    try {
      for (const file of roots) {
        await submitWorkspaceOperation(api, activeWorkspace, { type: "delete", fileId: file.id });
      }
      afterDelete?.(roots);
      return true;
    } catch (cause) {
      try {
        const snapshot = await api<{ files: FileRecord[] }>(`/api/workspaces/${activeWorkspace.id}/snapshot`);
        const removedRoots = roots.filter((root) => !snapshot.files.some((file) => file.id === root.id));
        setFiles(snapshot.files);
        if (removedRoots.length) afterDelete?.(removedRoots);
        setSelectedTreePaths(new Set());
        setExpandedFolders((current) => new Set([...current].filter((path) => snapshot.files.some((file) => file.kind === "folder" && file.path === path))));
        setLoadedFolders((current) => new Set([...current].filter((path) => snapshot.files.some((file) => file.kind === "folder" && file.path === path))));
        if (activeFile && isInsideDeleted(activeFile.path)) {
          const restored = snapshot.files.find((file) => file.id === activeFile.id);
          if (restored) void openFile(restored, "none");
          else { clearActiveFile(); routedPath.current = null; navigate("/", { replace: true, preventScrollReset: true }); }
        }
        setCurrentFolder((path) => { let next = path; while (next && !snapshot.files.some((file) => file.kind === "folder" && file.path === next)) next = parentPath(next); return next; });
      } catch {
        setFiles(previousFiles);
        if (activeFile && isInsideDeleted(activeFile.path)) void openFile(activeFile, "none");
      }
      setError(`${roots.length > 1 ? "Some selected items may have been deleted. " : ""}${cause instanceof Error ? cause.message : "Could not delete item"}`);
      return false;
    }
  };

  const deleteTreeItem = (file: FileRecord) => void deleteTreeItems(selectedTreePaths.has(file.path)
    ? treeRows.filter((row) => selectedTreePaths.has(row.file.path)).map((row) => row.file)
    : [file]);

  const openTreeItem = (file: FileRecord) => {
    setTreeContextMenu(null);
    if (file.kind !== "folder") { void openFile(file); return; }
    setCurrentFolder(file.path);
    setFocusedTreePath(file.path);
    if (!expandedFolders.has(file.path)) void toggleFolder(file);
  };

  const deleteActiveFile = async () => {
    if (!activeWorkspace || !activeFile || !await confirm(`Delete ${entryName(activeFile.path)}?`)) return;
    const deleted = activeFile;
    clearActiveFile();
    routedPath.current = null;
    navigate("/", { replace: true, preventScrollReset: true });
    setFiles((current) => current.filter((file) => file.id !== deleted.id));
    try {
      await submitWorkspaceOperation(api, activeWorkspace, { type: "delete", fileId: deleted.id });
    } catch (cause) {
      setFiles((current) => [...current, deleted]);
      void openFile(deleted, "none");
      setError(cause instanceof Error ? cause.message : "Could not delete item");
    }
  };

  const deleteCurrentFolder = async () => {
    const folder = files.find((file) => file.kind === "folder" && file.path === currentFolder);
    if (!activeWorkspace || !folder || !await confirm(`Delete ${entryName(currentFolder)}?`)) return;
    const deletedPath = currentFolder;
    const previousFiles = files;
    const deletedActive = activeFile && (activeFile.path === deletedPath || activeFile.path.startsWith(`${deletedPath}/`)) ? activeFile : null;
    setFiles((current) => current.filter((file) => file.path !== deletedPath && !file.path.startsWith(`${deletedPath}/`)));
    setExpandedFolders((current) => new Set([...current].filter((path) => path !== deletedPath && !path.startsWith(`${deletedPath}/`))));
    setLoadedFolders((current) => new Set([...current].filter((path) => path !== deletedPath && !path.startsWith(`${deletedPath}/`))));
    setCurrentFolder(parentFolder);
    if (deletedActive) {
      clearActiveFile();
      routedPath.current = null;
      navigate("/", { replace: true, preventScrollReset: true });
    }
    try {
      await submitWorkspaceOperation(api, activeWorkspace, { type: "delete", fileId: folder.id });
    } catch (cause) {
      setFiles(previousFiles);
      setCurrentFolder(deletedPath);
      setExpandedFolders((current) => new Set(current).add(deletedPath));
      setLoadedFolders((current) => new Set(current).add(deletedPath));
      if (deletedActive) void openFile(deletedActive, "none");
      setError(cause instanceof Error ? cause.message : "Could not delete folder");
    }
  };

  return { updateFilePath, moveTreeItems, renameActiveFile, renameCurrentFolder, renameTreeItem, renameTreeItemTo, deleteTreeItems, deleteTreeItem, openTreeItem, deleteActiveFile, deleteCurrentFolder };
}
