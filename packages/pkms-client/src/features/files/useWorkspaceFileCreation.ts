import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { FileRecord, Workspace } from "../../domain/types";
import { createOperationId } from "../../domain/encoding";
import { submitWorkspaceOperation } from "../../client/workspaceOperations";

interface Options {
  workspace: Workspace | null;
  currentFolder: string;
  request: <T = unknown>(path: string, options?: RequestInit) => Promise<T>;
  setFiles: Dispatch<SetStateAction<FileRecord[]>>;
  setError: Dispatch<SetStateAction<string>>;
  openFile: (file: FileRecord) => Promise<void>;
  requestName: (title: string, initialValue?: string) => Promise<string | null>;
}

export function useWorkspaceFileCreation({ workspace, currentFolder, request, setFiles, setError, openFile, requestName }: Options) {
  const refreshFiles = useCallback(async (workspaceId: string) => {
    const snapshot = await request<{ files: FileRecord[] }>(`/api/workspaces/${workspaceId}/snapshot`);
    setFiles(snapshot.files);
    return snapshot.files;
  }, [request, setFiles]);

  const newNote = useCallback(async (directory = currentFolder) => {
    if (!workspace) return;
    const path = `${directory ? `${directory}/` : ""}Untitled ${new Date().toLocaleString("sv-SE").replaceAll(":", "-")}.md`;
    try {
      const result = await submitWorkspaceOperation(request, workspace, { type: "create-file", path, fileId: createOperationId(), content: "# Untitled\n\n" }, "web");
      const files = await refreshFiles(workspace.id);
      const created = files.find((item) => item.path === (result.conflictCopyPath ?? path));
      if (created) await openFile(created);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create note"); }
  }, [currentFolder, openFile, refreshFiles, request, setError, workspace]);

  const newFolder = useCallback(async (directory = currentFolder) => {
    if (!workspace) return;
    const name = await requestName("New folder");
    if (!name?.trim()) return;
    try {
      await submitWorkspaceOperation(request, workspace, { type: "create-folder", path: `${directory ? `${directory}/` : ""}${name.trim()}` });
      await refreshFiles(workspace.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create folder"); }
  }, [currentFolder, refreshFiles, request, requestName, setError, workspace]);

  const uploadFile = useCallback(async (file?: File) => {
    if (!file || !workspace) return;
    const form = new FormData();
    form.set("file", file);
    form.set("path", `${currentFolder ? `${currentFolder}/` : ""}${file.name}`);
    form.set("clientId", `web-${createOperationId()}`);
    try {
      await request(`/api/workspaces/${workspace.id}/upload`, { method: "POST", body: form });
      await refreshFiles(workspace.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Upload failed"); }
  }, [currentFolder, refreshFiles, request, setError, workspace]);

  return { newNote, newFolder, uploadFile };
}
