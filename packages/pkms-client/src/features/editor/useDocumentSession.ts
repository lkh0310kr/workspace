import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";
import type { NavigateFunction } from "react-router";
import type { FileNavigation, FileRecord, RealtimeMessage, Workspace } from "../../domain/types";
import { createOperationId, fromBase64, toBase64 } from "../../domain/encoding";
import { parentPath } from "../../domain/fileTree";
import { fileLocationPath } from "../../domain/fileLocation";
import { editorDocumentKey } from "@workspace/editor";
import type { PKMSRealtimeSocket } from "../../realtime";

interface DocumentEntry {
  doc: Y.Doc;
  persistence?: IndexeddbPersistence;
  persistenceOpening?: Promise<void>;
  updateHandler?: (update: Uint8Array, origin: unknown) => void;
}
interface ActiveDocument { file: FileRecord | null; documentKey: string | null; doc: Y.Doc | null; text: Y.Text | null }
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
  scheduleAutoSave: (fileId: string, doc: Y.Doc, documentKey?: string) => void;
  setCurrentFolder: Dispatch<SetStateAction<string>>;
  setExpandedFolders: Dispatch<SetStateAction<Set<string>>>;
  setActiveFile: Dispatch<SetStateAction<FileRecord | null>>;
  setOpeningFileId: Dispatch<SetStateAction<string | null>>;
  setError: Dispatch<SetStateAction<string>>;
  setSaving: Dispatch<SetStateAction<boolean>>;
  setSidebarOpen: Dispatch<SetStateAction<boolean>>;
  setNotice: Dispatch<SetStateAction<string>>;
}

/** Open/initialize the Yjs database before constructing y-indexeddb. Its open rejection
 * is otherwise left unhandled internally by y-indexeddb and `whenSynced` never settles. */
function prepareYjsDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(name);
    } catch (cause) {
      reject(cause);
      return;
    }
    let settled = false;
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("updates")) db.createObjectStore("updates", { autoIncrement: true });
      if (!db.objectStoreNames.contains("custom")) db.createObjectStore("custom");
    };
    request.onblocked = () => {
      if (settled) return;
      settled = true;
      reject(new Error("Local document storage is still open in another Workspace window"));
    };
    request.onerror = () => {
      if (settled) return;
      settled = true;
      reject(request.error ?? new Error("Could not open local document storage"));
    };
    request.onsuccess = () => {
      request.result.close();
      if (settled) return;
      settled = true;
      resolve();
    };
  });
}

function yjsDatabaseAliasKey(documentKey: string): string {
  return `pkms:yjs-database:${documentKey}`;
}

function readYjsDatabaseName(documentKey: string): string {
  try {
    return localStorage.getItem(yjsDatabaseAliasKey(documentKey)) || documentKey;
  } catch {
    return documentKey;
  }
}

function rememberYjsDatabaseName(documentKey: string, databaseName: string): void {
  try {
    localStorage.setItem(yjsDatabaseAliasKey(documentKey), databaseName);
  } catch {
    // The current session can still use IndexedDB even if the alias cannot persist.
  }
}

async function openYjsPersistence(databaseName: string, doc: Y.Doc): Promise<IndexeddbPersistence> {
  await prepareYjsDatabase(databaseName);
  const persistence = new IndexeddbPersistence(databaseName, doc);
  try {
    await persistence._db;
    await persistence.whenSynced;
    return persistence;
  } catch (cause) {
    await persistence.destroy().catch(() => {});
    throw cause;
  }
}

export function useDocumentSession(options: Options) {
  const { workspace, api, pathname, navigate, routedPath, documents, activeDocument, pending, socket, openSequence, hydrating, scheduleAutoSave,
    setCurrentFolder, setExpandedFolders, setActiveFile, setOpeningFileId, setError, setSaving, setSidebarOpen, setNotice } = options;

  const clearActiveFile = () => {
    openSequence.current++;
    hydrating.current = false;
    setOpeningFileId(null);
    activeDocument.current = { file: null, documentKey: null, doc: null, text: null };
    setActiveFile(null);
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
    setActiveFile(file);
    setOpeningFileId(file.id);
    const documentKey = editorDocumentKey({ providerId: `pkms:${workspace?.id ?? ""}`, itemId: file.id });
    activeDocument.current = { file, documentKey, doc: null, text: null };
    setSaving(false);
    if (file.kind !== "markdown") { setOpeningFileId(null); return; }
    setError(""); hydrating.current = true;
    let entry = documents.current.get(documentKey);
    try {
      if (!entry) {
        entry = { doc: new Y.Doc({ guid: documentKey }) };
        documents.current.set(documentKey, entry);
      }
      // IndexedDB is a local cache, not a prerequisite for opening a PKMS note.
      // Chromium can reject open() when its backing store is unavailable or damaged.
      // Keep the Y.Doc alive and hydrate it from the server instead of failing the editor.
      if (!entry.persistence && !entry.persistenceOpening) {
        const currentEntry = entry;
        currentEntry.persistenceOpening = (async () => {
          const primaryDatabaseName = readYjsDatabaseName(documentKey);
          try {
            currentEntry.persistence = await openYjsPersistence(primaryDatabaseName, currentEntry.doc);
          } catch (primaryCause) {
            // Preserve the inaccessible database and switch this document to a fresh
            // local cache. This recovers from per-database backing-store failures
            // without erasing potentially recoverable offline updates.
            const recoveryDatabaseName = `${documentKey}:recovery:${Date.now()}`;
            try {
              currentEntry.persistence = await openYjsPersistence(recoveryDatabaseName, currentEntry.doc);
              rememberYjsDatabaseName(documentKey, recoveryDatabaseName);
              setNotice("This note is using a fresh local cache because its previous cache could not be opened. The previous cache was preserved.");
              console.warn("PKMS switched to a fresh local document cache; the previous database was preserved.", primaryCause);
            } catch (recoveryCause) {
              currentEntry.persistence = undefined;
              setNotice("Local document storage is unavailable. This note is open from the server; local offline recovery is paused.");
              console.warn("PKMS could not open either local document cache; continuing from the server.", primaryCause, recoveryCause);
            }
          } finally {
            currentEntry.persistenceOpening = undefined;
          }
        })();
      }
      if (entry.persistenceOpening) await entry.persistenceOpening;
      if (request !== openSequence.current) return;
      if (signal?.aborted) { hydrating.current = false; setOpeningFileId(null); return; }
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
    const queuedState = pending.current.get(`state:${documentKey}`);
    if (queuedState?.update) {
      Y.applyUpdate(entry.doc, fromBase64(queuedState.update), "server");
      pending.current.delete(`state:${documentKey}`);
    }
    currentText = entry.doc.getText("markdown");
    activeDocument.current = { file, documentKey, doc: entry.doc, text: currentText };
    const currentSocket = socket.current;
    const cacheKey = documentKey;
    const stored = JSON.parse(localStorage.getItem("pkms:recent-files") ?? "[]") as Array<{ key: string; lastOpened: number }>;
    const recent = [{ key: cacheKey, lastOpened: Date.now() }, ...stored.filter((item) => item.key !== cacheKey)].slice(0, 20);
    localStorage.setItem("pkms:recent-files", JSON.stringify(recent));
    const evicted = stored.filter((item) => !recent.some((kept) => kept.key === item.key));
    for (const item of evicted) {
      const old = documents.current.get(item.key);
      if (old && activeDocument.current.documentKey !== item.key) {
        await old.persistence?.destroy().catch(() => {});
        old.doc.destroy();
        documents.current.delete(item.key);
      }
    }
    if (entry.updateHandler) entry.doc.off("update", entry.updateHandler);
    const updateHandler = (updateBytes: Uint8Array, origin: unknown) => {
      if (origin === "server") return;
      scheduleAutoSave(file.id, entry.doc, documentKey);
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
