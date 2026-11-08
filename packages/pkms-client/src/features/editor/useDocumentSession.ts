import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";
import type { NavigateFunction } from "react-router";
import type { FileNavigation, FileRecord, RealtimeMessage, Workspace } from "../../domain/types";
import { createOperationId, fromBase64, toBase64 } from "../../domain/encoding";
import { parentPath } from "../../domain/fileTree";
import { fileLocationPath } from "../../domain/fileLocation";
import type { PKMSRealtimeSocket } from "../../realtime";

interface DocumentEntry {
  doc: Y.Doc;
  persistence: IndexeddbPersistence;
  observer?: () => void;
  updateHandler?: (update: Uint8Array, origin: unknown) => void;
}
interface ActiveDocument { file: FileRecord | null; doc: Y.Doc | null; text: Y.Text | null; value: string }
interface Options {
  workspace: Workspace | null;
  api: <T = unknown>(path: string, options?: RequestInit) => Promise<T>;
  pathname: string;
  navigate: NavigateFunction;
  routedPath: MutableRefObject<string | null>;
  documents: MutableRefObject<Map<string, DocumentEntry>>;
  activeDocument: MutableRefObject<ActiveDocument>;
  pending: MutableRefObject<Map<string, RealtimeMessage>>;
  socket: MutableRefObject<PKMSRealtimeSocket | null>;
  openSequence: MutableRefObject<number>;
  hydrating: MutableRefObject<boolean>;
  scheduleAutoSave: (fileId: string, doc: Y.Doc, save?: () => Promise<unknown>) => void;
  setCurrentFolder: Dispatch<SetStateAction<string>>;
  setExpandedFolders: Dispatch<SetStateAction<Set<string>>>;
  setActiveFile: Dispatch<SetStateAction<FileRecord | null>>;
  setText: Dispatch<SetStateAction<string>>;
  setOpeningFileId: Dispatch<SetStateAction<string | null>>;
  setError: Dispatch<SetStateAction<string>>;
  setSaving: Dispatch<SetStateAction<boolean>>;
  setSidebarOpen: Dispatch<SetStateAction<boolean>>;
  setNotice: Dispatch<SetStateAction<string>>;
}

export function useDocumentSession(options: Options) {
  const { workspace, api, pathname, navigate, routedPath, documents, activeDocument, pending, socket, openSequence, hydrating, scheduleAutoSave,
    setCurrentFolder, setExpandedFolders, setActiveFile, setText, setOpeningFileId, setError, setSaving, setSidebarOpen, setNotice } = options;

  const clearActiveFile = () => {
    openSequence.current++;
    hydrating.current = false;
    setOpeningFileId(null);
    const current = activeDocument.current;
    if (current.file && current.text) {
      const entry = documents.current.get(current.file.id);
      if (entry?.observer) current.text.unobserve(entry.observer);
      if (entry) entry.observer = undefined;
    }
    activeDocument.current = { file: null, doc: null, text: null, value: "" };
    setActiveFile(null);
    setText("");
  };

  const openFile = useCallback(async (file: FileRecord, historyAction: FileNavigation = "push", signal?: AbortSignal) => {
    const request = ++openSequence.current;
    hydrating.current = false;
    if (workspace && historyAction !== "none") {
      const target = fileLocationPath(workspace.id, file.path);
      if (pathname !== target) {
        routedPath.current = target;
        navigate(target, { replace: historyAction === "replace", preventScrollReset: true });
      }
    }
    setNotice("");
    if (window.matchMedia("(max-width: 580px)").matches) setSidebarOpen(false);
    const parent = parentPath(file.path);
    setCurrentFolder(parent);
    setExpandedFolders((current) => {
      const next = new Set(current).add("");
      let ancestor = parent;
      while (ancestor) { next.add(ancestor); ancestor = parentPath(ancestor); }
      return next;
    });
    const previous = activeDocument.current;
    if (previous.file && previous.text) {
      const oldEntry = documents.current.get(previous.file.id);
      if (oldEntry?.observer) previous.text.unobserve(oldEntry.observer);
      if (oldEntry) oldEntry.observer = undefined;
    }
    setActiveFile(file);
    setText("");
    setOpeningFileId(file.id);
    activeDocument.current = { file, doc: null, text: null, value: "" };
    if (file.kind !== "markdown") { setOpeningFileId(null); return; }
    setError(""); setSaving(false); hydrating.current = true;
    let entry = documents.current.get(file.id);
    try {
      if (!entry) {
        const doc = new Y.Doc({ guid: file.id });
        const persistence = new IndexeddbPersistence(`pkms:${workspace?.id}:${file.id}`, doc);
        entry = { doc, persistence };
        documents.current.set(file.id, entry);
        await persistence.whenSynced;
        if (request !== openSequence.current) return;
        if (signal?.aborted) { hydrating.current = false; setOpeningFileId(null); return; }
      }
      const cachedText = entry.doc.getText("markdown");
      if (!cachedText.length) {
        if (typeof file.content === "string") {
          if (file.content) entry.doc.transact(() => cachedText.insert(0, file.content!), "server");
        } else {
          const server = await api<{ update: string }>(`/api/workspaces/${workspace?.id}/files/${file.id}/updates`, { signal });
          if (request !== openSequence.current) return;
          if (signal?.aborted) { hydrating.current = false; setOpeningFileId(null); return; }
          Y.applyUpdate(entry.doc, fromBase64(server.update), "server");
        }
      }
    } catch (cause) {
      if (request === openSequence.current) {
        if (!signal?.aborted) setError(cause instanceof Error ? cause.message : "Could not open file");
        setOpeningFileId(null);
        hydrating.current = false;
      }
      return;
    }
    if (request !== openSequence.current) return;
    if (signal?.aborted) { hydrating.current = false; setOpeningFileId(null); return; }
    let currentText = entry.doc.getText("markdown");
    const queuedState = pending.current.get(`state:${file.id}`);
    if (queuedState?.update) {
      Y.applyUpdate(entry.doc, fromBase64(queuedState.update), "server");
      pending.current.delete(`state:${file.id}`);
    }
    currentText = entry.doc.getText("markdown");
    activeDocument.current = { file, doc: entry.doc, text: currentText, value: currentText.toString() };
    setText(currentText.toString());
    const update = () => {
      const value = currentText.toString();
      activeDocument.current.value = value;
      setText(value);
    };
    currentText.observe(update);
    entry.observer = update;
    const currentSocket = socket.current;
    const cacheKey = `pkms:${workspace?.id}:${file.id}`;
    const stored = JSON.parse(localStorage.getItem("pkms:recent-files") ?? "[]") as Array<{ key: string; lastOpened: number }>;
    const recent = [{ key: cacheKey, lastOpened: Date.now() }, ...stored.filter((item) => item.key !== cacheKey)].slice(0, 20);
    localStorage.setItem("pkms:recent-files", JSON.stringify(recent));
    const evicted = stored.filter((item) => !recent.some((kept) => kept.key === item.key));
    for (const item of evicted) {
      const fileId = item.key.split(":").at(-1) ?? "";
      const old = documents.current.get(fileId);
      if (old && activeDocument.current.file?.id !== fileId) {
        old.doc.destroy(); old.persistence.destroy(); documents.current.delete(fileId);
      }
      const deletion = indexedDB.deleteDatabase(item.key);
      deletion.onerror = () => {};
    }
    if (entry.updateHandler) entry.doc.off("update", entry.updateHandler);
    const updateHandler = (updateBytes: Uint8Array, origin: unknown) => {
      if (origin === "server") return;
      scheduleAutoSave(file.id, entry.doc);
      const current = socket.current;
      if (!current || current.readyState !== WebSocket.OPEN) return;
      const operationId = createOperationId();
      pending.current.set(operationId, { type: "document-update", operationId, fileId: file.id });
      setSaving(true);
      current.send(JSON.stringify({ type: "document-update", operationId, fileId: file.id, update: toBase64(updateBytes) }));
    };
    entry.doc.on("update", updateHandler);
    entry.updateHandler = updateHandler;
    if (currentSocket?.readyState === WebSocket.OPEN) {
      currentSocket.send(JSON.stringify({ type: "presence", fileId: file.id }));
      const operationId = createOperationId();
      pending.current.set(operationId, { type: "document-update", operationId, fileId: file.id });
      setSaving(true);
      currentSocket.send(JSON.stringify({ type: "document-update", operationId, fileId: file.id, update: toBase64(Y.encodeStateAsUpdate(entry.doc)) }));
    }
    hydrating.current = false;
    if (request === openSequence.current) setOpeningFileId(null);
  }, [workspace, api, pathname, navigate, routedPath, scheduleAutoSave]);

  return { openFile, clearActiveFile };
}
