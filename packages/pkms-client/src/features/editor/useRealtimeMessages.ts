import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import * as Y from "yjs";
import type { FileRecord, Peer, RealtimeMessage } from "../../domain/types";
import { fromBase64 } from "../../domain/encoding";

interface DocumentEntry { doc: Y.Doc }
interface ActiveFile { file: FileRecord | null; doc: Y.Doc | null }
type OpenFile = (file: FileRecord, historyAction?: "push" | "replace" | "none") => Promise<void>;

interface Options {
  workspaceId: string;
  documents: MutableRefObject<Map<string, DocumentEntry>>;
  pending: MutableRefObject<Map<string, RealtimeMessage>>;
  activeDocument: MutableRefObject<ActiveFile>;
  openFileRef: MutableRefObject<OpenFile | null>;
  request: <T = unknown>(path: string, options?: RequestInit) => Promise<T>;
  setPeers: Dispatch<SetStateAction<Peer[]>>;
  setSaving: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string>>;
  setFiles: Dispatch<SetStateAction<FileRecord[]>>;
}

export function useRealtimeMessages({ workspaceId, documents, pending, activeDocument, openFileRef, request, setPeers, setSaving, setError, setFiles }: Options) {
  return useCallback((event: MessageEvent) => {
    let message: RealtimeMessage;
    try { message = JSON.parse(String(event.data)) as RealtimeMessage; } catch { return; }
    if (message.type === "presence-state") {
      setPeers((message as RealtimeMessage & { peers?: Peer[] }).peers ?? []);
    } else if (message.type === "presence") {
      const presence = message as RealtimeMessage & { action?: string; peer?: Peer; clientId?: string };
      if (presence.action === "leave") setPeers((current) => current.filter((peer) => peer.clientId !== presence.clientId));
      else if (presence.peer) setPeers((current) => [...current.filter((peer) => peer.clientId !== presence.peer!.clientId), presence.peer!]);
    } else if (message.type === "document-state" && message.fileId && message.update) {
      const document = documents.current.get(message.fileId)?.doc;
      if (document) Y.applyUpdate(document, fromBase64(message.update), "server");
      else pending.current.set(`state:${message.fileId}`, message);
    } else if (message.type === "document-update" && message.fileId && message.update) {
      const document = documents.current.get(message.fileId)?.doc;
      if (document) Y.applyUpdate(document, fromBase64(message.update), "server");
    } else if (message.type === "ack" && message.operationId) {
      pending.current.delete(message.operationId);
      setSaving(pending.current.size > 0);
      if (message.conflictCopyPath) void refreshSnapshot(message.conflictCopyPath);
    } else if (message.type === "error") {
      setError(message.message ?? "Collaboration sync failed");
    } else if (typeof message.acceptedRevision === "number") {
      void refreshSnapshot(message.conflictCopyPath);
    }

    async function refreshSnapshot(conflictCopyPath?: string) {
      try {
        const snapshot = await request<{ files: FileRecord[] }>(`/api/workspaces/${workspaceId}/snapshot`);
        setFiles(snapshot.files);
        if (conflictCopyPath) {
          const conflict = snapshot.files.find((file) => file.path === conflictCopyPath);
          if (conflict && activeDocument.current.file?.id !== conflict.id) await openFileRef.current?.(conflict);
        }
      } catch { /* A later snapshot refresh will reconcile transient failures. */ }
    }
  }, [activeDocument, documents, openFileRef, pending, request, setError, setFiles, setPeers, setSaving, workspaceId]);
}
