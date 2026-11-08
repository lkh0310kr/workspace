import type {
  EditorDocumentSession,
  EditorItemRef,
  EditorProvider,
  EditorProviderCapabilities,
  EditorSearchOptions,
  EditorSearchResult,
  EditorTreeItem,
} from "@workspace/editor";
import type { FileRecord } from "../../domain/types";
import { entryName } from "../../domain/fileTree";

export interface PkmsEditorProviderOptions {
  workspaceId: string;
  /** Loads one repository directory, including its folders and files. */
  listDirectory: (path: string, signal?: AbortSignal) => Promise<FileRecord[]>;
  /** Looks up a stable PKMS file ID, including files outside loaded branches. */
  getFile: (fileId: string, signal?: AbortSignal) => Promise<FileRecord | null>;
  /** Keeps login, Yjs, cache and server synchronization in pkms-client. */
  openSession: (file: FileRecord, signal?: AbortSignal) => Promise<EditorDocumentSession>;
  /** Emits affected parent paths after repository mutations or remote refreshes. */
  subscribeTree: (listener: (parentPaths: readonly string[]) => void) => () => void;
  listLoadedFiles: () => readonly FileRecord[];
  capabilities?: Partial<EditorProviderCapabilities>;
  operations?: Pick<EditorProvider, "create" | "rename" | "move" | "delete">;
}

const defaultCapabilities: EditorProviderCapabilities = {
  operations: new Set(),
  searchNames: true,
  searchContents: false,
  replaceContents: false,
  multiSelect: true,
  dragMove: true,
  codeLanguages: new Set(),
  collaborativeDocuments: true,
};

function treeItem(workspaceId: string, file: FileRecord): EditorTreeItem {
  const kind: EditorTreeItem["kind"] = file.kind === "folder" ? "directory" : file.kind === "markdown" ? "markdown" : "asset";
  return {
    providerId: `pkms:${workspaceId}`,
    itemId: file.id,
    parentId: null,
    name: entryName(file.path),
    path: file.path,
    kind,
    readOnly: file.kind === "asset",
  };
}

function abortIfNeeded(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("The operation was aborted", "AbortError");
}

/** PKMS adapter: the shared Editor sees stable file IDs, never API/Yjs details. */
export function createPkmsEditorProvider(options: PkmsEditorProviderOptions): EditorProvider {
  const { workspaceId } = options;
  const id = `pkms:${workspaceId}`;
  const capabilities: EditorProviderCapabilities = {
    ...defaultCapabilities,
    ...options.capabilities,
    operations: options.capabilities?.operations ?? defaultCapabilities.operations,
  };

  return {
    id,
    capabilities,
    async listChildren(parentId, signal) {
      abortIfNeeded(signal);
      const parent = parentId ? await options.getFile(parentId, signal) : null;
      if (parentId && (!parent || parent.kind !== "folder")) return [];
      const parentPathValue = parent?.path ?? "";
      const files = await options.listDirectory(parentPathValue, signal);
      abortIfNeeded(signal);
      return files.map((file) => ({ ...treeItem(workspaceId, file), parentId: parent?.id ?? null }));
    },
    subscribeTree(listener) {
      return options.subscribeTree((paths) => {
        const parentIds = paths.map((path) => {
          if (!path) return "";
          const folder = options.listLoadedFiles().find((file) => file.kind === "folder" && file.path === path);
          return folder?.id ?? "";
        });
        listener([...new Set(parentIds)]);
      });
    },
    async openDocument(ref: EditorItemRef, signal) {
      abortIfNeeded(signal);
      if (ref.providerId !== id) throw new Error("Document belongs to a different PKMS workspace");
      const file = await options.getFile(ref.itemId, signal);
      abortIfNeeded(signal);
      if (!file || file.kind === "folder") throw new Error("PKMS document no longer exists");
      return options.openSession(file, signal);
    },
    async search(query: string, searchOptions: EditorSearchOptions, signal) {
      if (searchOptions.target !== "names") return [];
      const needle = searchOptions.caseSensitive ? query : query.toLocaleLowerCase();
      const results: EditorSearchResult[] = [];
      for (const file of options.listLoadedFiles()) {
        abortIfNeeded(signal);
        if (file.kind === "folder") continue;
        const candidate = searchOptions.caseSensitive ? file.path : file.path.toLocaleLowerCase();
        let match = candidate.indexOf(needle);
        let matchLength = query.length;
        if (searchOptions.regex) {
          const regex = new RegExp(query, searchOptions.caseSensitive ? "" : "i");
          const found = regex.exec(file.path);
          match = found?.index ?? -1;
          matchLength = found?.[0].length ?? 0;
        }
        if (match >= 0 && searchOptions.wholeWord) {
          const before = file.path[match - 1] ?? "";
          const after = file.path[match + matchLength] ?? "";
          if (/[\p{L}\p{N}_]/u.test(before) || /[\p{L}\p{N}_]/u.test(after)) match = -1;
        }
        if (match >= 0) results.push({ item: treeItem(workspaceId, file) });
      }
      return results;
    },
    ...options.operations,
  };
}
