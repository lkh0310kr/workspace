import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { NavigateFunction } from "react-router";
import type { FileRecord, TreeContextMenu, TreeRow, Workspace } from "../../domain/types";
import { entryName, parentPath, treeSelectionRoots } from "../../domain/fileTree";
import { fileLocationPath } from "../../domain/fileLocation";
import { submitWorkspaceOperation } from "../../client/workspaceOperations";

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
}

export function useWorkspaceFileActions(options: Options) {
  const { workspace: activeWorkspace, activeFile, currentFolder, parentFolder, files, selectedTreePaths, treeRows, expandedFolders, api, navigate, routedPath, clearActiveFile, openFile, toggleFolder, setFiles, setActiveFile, setCurrentFolder, setExpandedFolders, setLoadedFolders, setSelectedTreePaths, setCutTreePaths, setFocusedTreePath, setTreeContextMenu, setError, setNotice } = options;
  const updateFilePath = async (file: FileRecord, toPath: string) => {
    if (!activeWorkspace) return;
    try {
      const result = await submitWorkspaceOperation(api, activeWorkspace, { type: "move", fileId: file.id, toPath });
      const snapshot = await api<{ files: FileRecord[] }>(`/api/workspaces/${activeWorkspace.id}/snapshot`);
      setFiles(snapshot.files);
      const activeMovesWithItem = activeFile && (activeFile.id === file.id || (file.kind === "folder" && activeFile.path.startsWith(`${file.path}/`)));
      const renamedActive = activeMovesWithItem ? snapshot.files.find((entry) => entry.id === activeFile.id) : null;
      if (renamedActive) {
        setActiveFile(renamedActive);
        const target = fileLocationPath(activeWorkspace.id, renamedActive.path);
        routedPath.current = target;
        navigate(target, { replace: true, preventScrollReset: true });
      }
      const destination = result.conflictCopyPath ?? toPath;
      const movePath = (path: string) => file.kind === "folder"
        ? (path === file.path || path.startsWith(`${file.path}/`) ? `${destination}${path.slice(file.path.length)}` : path)
        : path === file.path ? destination : path;
      if (file.kind === "folder" && (currentFolder === file.path || currentFolder.startsWith(`${file.path}/`))) {
        setCurrentFolder(`${destination}${currentFolder.slice(file.path.length)}`);
      }
      if (file.kind === "folder") {
        setExpandedFolders((current) => new Set([...current].map(movePath)));
        setLoadedFolders((current) => new Set([...current].map(movePath)));
      }
      setSelectedTreePaths((current) => new Set([...current].map(movePath)));
      setCutTreePaths((current) => new Set([...current].map(movePath)));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not rename item"); }
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
    const resolvedMoves: Array<{ file: FileRecord; destination: string }> = [];
    try {
      for (const move of moves) {
        const result = await submitWorkspaceOperation(api, activeWorkspace, { type: "move", fileId: move.file.id, toPath: move.toPath });
        resolvedMoves.push({ file: move.file, destination: result.conflictCopyPath ?? move.toPath });
      }
      const snapshot = await api<{ files: FileRecord[] }>(`/api/workspaces/${activeWorkspace.id}/snapshot`);
      setFiles(snapshot.files);
      const pathAfterMove = (path: string) => {
        const move = resolvedMoves.find(({ file }) => file.kind === "folder" && (path === file.path || path.startsWith(`${file.path}/`)));
        if (move) return `${move.destination}${path.slice(move.file.path.length)}`;
        const exact = resolvedMoves.find(({ file }) => file.path === path);
        return exact?.destination ?? path;
      };
      setCurrentFolder((path) => pathAfterMove(path));
      setExpandedFolders((paths) => new Set([...paths].map(pathAfterMove)));
      setLoadedFolders((paths) => new Set([...paths].map(pathAfterMove)));
      const movedActive = activeFile ? snapshot.files.find((file) => file.id === activeFile.id) : null;
      if (movedActive && movedActive.path !== activeFile?.path) {
        setActiveFile(movedActive);
        const target = fileLocationPath(activeWorkspace.id, movedActive.path);
        routedPath.current = target;
        navigate(target, { replace: true, preventScrollReset: true });
      }
      setSelectedTreePaths(new Set(resolvedMoves.map((move) => move.destination)));
      setCutTreePaths(new Set());
      setFocusedTreePath(resolvedMoves[0]?.destination ?? null);
      if (resolvedMoves.some((move, index) => move.destination !== moves[index]?.toPath)) setNotice("Name conflict resolved while moving items.");
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

  const renameActiveFile = () => {
    if (!activeFile) return;
    const name = window.prompt("Rename", entryName(activeFile.path));
    if (!name?.trim() || name.trim() === entryName(activeFile.path)) return;
    const parent = parentPath(activeFile.path);
    void updateFilePath(activeFile, `${parent ? `${parent}/` : ""}${name.trim()}`);
  };

  const renameCurrentFolder = () => {
    const folder = files.find((file) => file.kind === "folder" && file.path === currentFolder);
    if (!folder) return;
    const name = window.prompt("Rename", entryName(currentFolder));
    if (!name?.trim() || name.trim() === entryName(currentFolder)) return;
    void updateFilePath(folder, `${parentPath(currentFolder) ? `${parentPath(currentFolder)}/` : ""}${name.trim()}`);
  };

  const renameTreeItem = (file: FileRecord) => {
    setTreeContextMenu(null);
    const currentName = entryName(file.path);
    const name = window.prompt("Rename", currentName);
    if (!name?.trim() || name.trim() === currentName) return;
    const parent = parentPath(file.path);
    void updateFilePath(file, `${parent ? `${parent}/` : ""}${name.trim()}`);
  };

  const deleteTreeItems = async (filesToDelete: FileRecord[]) => {
    setTreeContextMenu(null);
    if (!activeWorkspace || !filesToDelete.length) return;
    const roots = treeSelectionRoots(filesToDelete, new Set(filesToDelete.map((file) => file.path)));
    const prompt = roots.length === 1 ? `Delete ${entryName(roots[0].path)}?` : `Delete ${roots.length} selected items?`;
    if (!window.confirm(prompt)) return;
    try {
      for (const file of roots) {
        await submitWorkspaceOperation(api, activeWorkspace, { type: "delete", fileId: file.id });
      }
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
    } catch (cause) {
      try {
        const snapshot = await api<{ files: FileRecord[] }>(`/api/workspaces/${activeWorkspace.id}/snapshot`);
        setFiles(snapshot.files);
        setSelectedTreePaths(new Set());
        setExpandedFolders((current) => new Set([...current].filter((path) => snapshot.files.some((file) => file.kind === "folder" && file.path === path))));
        setLoadedFolders((current) => new Set([...current].filter((path) => snapshot.files.some((file) => file.kind === "folder" && file.path === path))));
        if (activeFile && !snapshot.files.some((file) => file.id === activeFile.id)) {
          clearActiveFile(); routedPath.current = null; navigate("/", { replace: true, preventScrollReset: true });
        }
        setCurrentFolder((path) => { let next = path; while (next && !snapshot.files.some((file) => file.kind === "folder" && file.path === next)) next = parentPath(next); return next; });
      } catch { /* Keep the original operation error visible. */ }
      setError(`${roots.length > 1 ? "Some selected items may have been deleted. " : ""}${cause instanceof Error ? cause.message : "Could not delete item"}`);
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
    if (!activeWorkspace || !activeFile || !window.confirm(`Delete ${entryName(activeFile.path)}?`)) return;
    try {
      await submitWorkspaceOperation(api, activeWorkspace, { type: "delete", fileId: activeFile.id });
      clearActiveFile();
      routedPath.current = null;
      navigate("/", { replace: true, preventScrollReset: true });
      setFiles((current) => current.filter((file) => file.id !== activeFile.id));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete item"); }
  };

  const deleteCurrentFolder = async () => {
    const folder = files.find((file) => file.kind === "folder" && file.path === currentFolder);
    if (!activeWorkspace || !folder || !window.confirm(`Delete ${entryName(currentFolder)}?`)) return;
    try {
      await submitWorkspaceOperation(api, activeWorkspace, { type: "delete", fileId: folder.id });
      setFiles((current) => current.filter((file) => file.path !== currentFolder && !file.path.startsWith(`${currentFolder}/`)));
      setExpandedFolders((current) => new Set([...current].filter((path) => path !== currentFolder && !path.startsWith(`${currentFolder}/`))));
      setCurrentFolder(parentFolder);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete folder"); }
  };

  return { updateFilePath, moveTreeItems, renameActiveFile, renameCurrentFolder, renameTreeItem, deleteTreeItems, deleteTreeItem, openTreeItem, deleteActiveFile, deleteCurrentFolder };
}
