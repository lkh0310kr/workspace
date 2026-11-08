import type { Extension } from "@codemirror/state";

export type EditorItemKind = "directory" | "markdown" | "code" | "asset";
export type EditorOperation = "createFile" | "createDirectory" | "rename" | "move" | "delete";
export type EditorSavePhase = "clean" | "dirty" | "saving" | "conflict" | "error";
export type EditorSyncPhase = "idle" | "pending" | "synced" | "blocked";
export type EditorProviderErrorCode =
  | "notFound"
  | "readOnly"
  | "conflict"
  | "offline"
  | "unauthorized"
  | "unsupported"
  | "unknown";

export interface EditorItemRef {
  /** Stable ID of a provider instance, such as one local workspace or PKMS vault. */
  providerId: string;
  /** Stable within the provider across rename and move operations. */
  itemId: string;
}

export interface EditorTreeItem extends EditorItemRef {
  parentId: string | null;
  name: string;
  path: string;
  kind: EditorItemKind;
  readOnly: boolean;
}

export interface EditorProviderCapabilities {
  operations: ReadonlySet<EditorOperation>;
  searchNames: boolean;
  searchContents: boolean;
  replaceContents: boolean;
  multiSelect: boolean;
  dragMove: boolean;
  codeLanguages: ReadonlySet<string>;
  collaborativeDocuments: boolean;
}

export interface EditorSearchOptions {
  target: "names" | "contents";
  caseSensitive: boolean;
  regex: boolean;
  wholeWord: boolean;
}

export interface EditorSearchResult {
  item: EditorTreeItem;
  line?: number;
  column?: number;
  preview?: string;
}

export interface EditorProvider {
  /** Stable for a mounted source and persisted editor state. */
  readonly id: string;
  readonly capabilities: EditorProviderCapabilities;
  listChildren(parentId: string | null, signal?: AbortSignal): Promise<EditorTreeItem[]>;
  /** Invalidate affected parent IDs; the Workbench reloads only those branches. */
  /** `null` identifies the provider root. */
  subscribeTree(listener: (changedParentIds: readonly (string | null)[]) => void): () => void;
  openDocument(item: EditorItemRef, signal?: AbortSignal): Promise<EditorDocumentSession>;
  search(
    query: string,
    options: EditorSearchOptions,
    signal?: AbortSignal,
  ): Promise<EditorSearchResult[]>;
  create?(
    parentId: string | null,
    kind: "file" | "directory",
    name: string,
  ): Promise<EditorTreeItem>;
  rename?(item: EditorItemRef, name: string): Promise<EditorTreeItem>;
  move?(items: readonly EditorItemRef[], parentId: string | null): Promise<void>;
  delete?(items: readonly EditorItemRef[]): Promise<void>;
}

export interface EditorDocumentSnapshot {
  content:
    | { type: "text"; text: string }
    | { type: "asset"; previewUrl: string; mediaType: string };
  /** Opaque to the Workbench. Providers use it to detect/reconcile stale edits. */
  revision: string;
  savePhase: EditorSavePhase;
  message?: string;
  /** Optional remote mirror status, e.g. PKMS GitHub synchronization. */
  syncPhase?: EditorSyncPhase;
}

export interface EditorDocumentSession {
  readonly item: EditorTreeItem;
  readonly readOnly: boolean;
  /** Synchronization extensions only; shared editing UI remains in @workspace/editor. */
  readonly extensions?: readonly Extension[];
  snapshot(): EditorDocumentSnapshot;
  subscribe(listener: (snapshot: EditorDocumentSnapshot) => void): () => void;
  replaceText(text: string, baseRevision: string): Promise<void>;
  /** Flushes pending durable writes. */
  save(): Promise<EditorDocumentSnapshot>;
  /** Releases provider subscriptions and session resources. */
  close(): Promise<void>;
}
