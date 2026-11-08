import type {
  EditorDocumentSession,
  EditorDocumentSnapshot,
  EditorItemRef,
  EditorProvider,
  EditorProviderCapabilities,
  EditorReplaceOptions,
  EditorSearchResult,
  EditorTreeItem,
} from "@workspace/editor";
import { cancelSearch, createDir, deletePath, getMediaUrl, listDir, onFileChanged, onSearchDone, onSearchResult, readFile, renamePath, searchInFiles, writeFile, type SearchFileResult } from "../electron";

const capabilities: EditorProviderCapabilities = {
  operations: new Set(["createFile", "createDirectory", "rename", "move", "delete"]),
  searchNames: true,
  searchContents: true,
  replaceContents: true,
  multiSelect: true,
  dragMove: true,
  codeLanguages: new Set(["*"]),
  collaborativeDocuments: false,
};

function findMatch(text: string, query: string, options: { caseSensitive: boolean; regex: boolean; wholeWord: boolean }): number {
  if (!query) return -1;
  const flags = options.caseSensitive ? "gu" : "giu";
  const matcher = options.regex
    ? new RegExp(query, flags)
    : new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags);
  let match: RegExpExecArray | null;
  while ((match = matcher.exec(text))) {
    const before = text[match.index - 1] ?? "";
    const after = text[match.index + match[0].length] ?? "";
    const word = /[\p{L}\p{N}_]/u;
    if (!options.wholeWord || (!word.test(before) && !word.test(after))) return match.index;
    if (!match[0].length) matcher.lastIndex++;
  }
  return -1;
}

function replaceRegex(query: string, options: EditorReplaceOptions): RegExp {
  const source = options.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const bounded = options.wholeWord ? `\\b(?:${source})\\b` : source;
  return new RegExp(bounded, `g${options.caseSensitive ? "" : "i"}`);
}

type LocalEditorProvider = Omit<EditorProvider, "create" | "rename" | "delete" | "move"> & Required<Pick<EditorProvider, "create" | "rename" | "delete" | "move">> & {
  dispose: () => void;
  itemRefForPath: (path: string) => Promise<EditorItemRef | null>;
  pathForItemId: (itemId: string) => string | null;
};

function kindFor(path: string, directory: boolean): EditorTreeItem["kind"] {
  if (directory) return "directory";
  const extension = path.split(".").at(-1)?.toLowerCase();
  if (["md", "markdown", "mdown"].includes(extension ?? "")) return "markdown";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "pdf", "zip", "7z", "glb", "gltf", "stl", "step", "stp", "epub"].includes(extension ?? "")) return "asset";
  return "code";
}

function parentOf(path: string): string | null {
  const slash = path.lastIndexOf("/");
  return slash < 0 ? "" : path.slice(0, slash);
}

function abortIfNeeded(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("The operation was aborted", "AbortError");
}

/** Workspace filesystem adapter. Electron IPC remains behind the renderer shim. */
function buildLocalEditorProvider(tabId: number): LocalEditorProvider {
  const id = `workspace:${tabId}`;
  const pathByItemId = new Map<string, string>();
  const itemIdByPath = new Map<string, string>();
  const itemIdStorageKey = `workspace:editor-item-ids:${tabId}`;
  try {
    const saved = JSON.parse(localStorage.getItem(itemIdStorageKey) ?? "{}") as Record<string, unknown>;
    for (const [path, value] of Object.entries(saved)) {
      if (typeof value !== "string" || value.length === 0) continue;
      const itemId = value.startsWith(`${id}:item:`) ? value : `${id}:item:${value}`;
      if (pathByItemId.has(itemId)) continue;
      itemIdByPath.set(path, itemId);
      pathByItemId.set(itemId, path);
    }
  } catch {
    // A corrupt or unavailable identity cache must not prevent the Explorer from opening.
  }
  const persistItemIds = () => {
    try {
      localStorage.setItem(itemIdStorageKey, JSON.stringify(Object.fromEntries(itemIdByPath)));
    } catch {
      // Storage quota/private mode can disable persistence; current provider IDs remain valid in memory.
    }
  };
  const listeners = new Set<(parents: readonly (string | null)[]) => void>();
  const sessions = new Set<LocalDocumentSession>();

  const itemFor = (path: string, directory: boolean, name = path.split("/").at(-1) ?? ""): EditorTreeItem => {
    let itemId = itemIdByPath.get(path);
    if (!itemId) {
      itemId = `${id}:item:${crypto.randomUUID()}`;
      itemIdByPath.set(path, itemId);
      pathByItemId.set(itemId, path);
    }
    const parentPath = parentOf(path);
    const parentId = parentPath ? itemIdByPath.get(parentPath) ?? itemFor(parentPath, true).itemId : null;
    return { providerId: id, itemId, parentId, name, path, kind: kindFor(path, directory), readOnly: false };
  };
  const parentItemId = (path: string): string | null => {
    const parentPath = parentOf(path);
    return parentPath ? itemFor(parentPath, true).itemId : null;
  };

  const unsubscribeFiles = onFileChanged((changedPaths) => {
    if (changedPaths.length === 0 || changedPaths.every((path) => !path)) {
      for (const listener of listeners) listener([null]);
      return;
    }
    const parentPaths = [...new Set(changedPaths.map(parentOf))];
    const parents = [...new Set(parentPaths.map((path) => path ? itemFor(path, true).itemId : null))];
    for (const session of sessions) session.externalChange(changedPaths);
    if (parents.length) for (const listener of listeners) listener(parents);
  });

  const provider: LocalEditorProvider = {
    id,
    capabilities,
    async listChildren(parentId, signal) {
      abortIfNeeded(signal);
      const parentPath = parentId === null ? "" : pathByItemId.get(parentId);
      if (parentPath === undefined) return [];
      const entries = await listDir(tabId, parentPath);
      abortIfNeeded(signal);
      const items = entries.map((entry) => itemFor(entry.path, entry.is_dir, entry.name));
      persistItemIds();
      return items;
    },
    async itemRefForPath(path) {
      const parentPath = parentOf(path);
      const parentRef = parentPath ? await provider.itemRefForPath(parentPath) : null;
      if (parentPath && !parentRef) return null;
      const entries = await provider.listChildren(parentRef?.itemId ?? null);
      const item = entries.find((entry) => entry.path === path);
      return item ? { providerId: id, itemId: item.itemId } : null;
    },
    pathForItemId(itemId) {
      return pathByItemId.get(itemId) ?? null;
    },
    subscribeTree(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async openDocument(ref: EditorItemRef, signal) {
      abortIfNeeded(signal);
      if (ref.providerId !== id) throw new Error("Document belongs to a different provider");
      const path = pathByItemId.get(ref.itemId);
      if (path === undefined) throw new Error("Document no longer exists");
      const item = itemFor(path, false);
      const session = new LocalDocumentSession(item, tabId, () => sessions.delete(session));
      sessions.add(session);
      try {
        await session.load();
        abortIfNeeded(signal);
        return session;
      } catch (error) {
        await session.close();
        throw error;
      }
    },
    async search(query, options, signal) {
      if (!query) return [];
      if (options.target === "names") {
        const paths = await window.api.fs.listAllFiles(tabId);
        abortIfNeeded(signal);
        const results: EditorSearchResult[] = [];
        for (const path of paths) {
          abortIfNeeded(signal);
          const item = itemFor(path, false);
          if (findMatch(item.name, query, options) >= 0) results.push({ item });
        }
        persistItemIds();
        return results;
      }
      return new Promise<EditorSearchResult[]>((resolve, reject) => {
        const requestId = crypto.randomUUID();
        const files = new Map<string, SearchFileResult>();
        let settled = false;
        const cleanup = () => {
          offResult();
          offDone();
          signal?.removeEventListener("abort", abort);
        };
        const finish = (error?: string) => {
          if (settled) return;
          settled = true;
          cleanup();
          if (error) { reject(new Error(error)); return; }
          const results = [...files.values()].map((file) => ({
            item: itemFor(file.path, false),
            matches: file.matches.map((match) => ({
              line: match.lineNumber,
              column: match.ranges[0]?.start + 1 || 1,
              preview: match.lineText,
              ranges: match.ranges,
            })),
          }));
          persistItemIds();
          resolve(results);
        };
        const abort = () => {
          cancelSearch(requestId);
          finish("Search aborted");
        };
        const offResult = onSearchResult((id, result) => {
          if (id === requestId) files.set(result.path, result);
        });
        const offDone = onSearchDone((id, error) => { if (id === requestId) finish(error); });
        if (signal?.aborted) { abort(); return; }
        signal?.addEventListener("abort", abort, { once: true });
        try {
          searchInFiles(requestId, tabId, query, {
            caseSensitive: options.caseSensitive,
            regex: options.regex,
            wholeWord: options.wholeWord,
          });
        } catch (error) {
          settled = true;
          cleanup();
          reject(error);
        }
      });
    },
    async replaceContents(ref, query, replacement, options, expectedMatchCount) {
      if (ref.providerId !== id) throw new Error("Item belongs to a different provider");
      const path = pathByItemId.get(ref.itemId);
      if (path === undefined) throw new Error("Item no longer exists");
      const openSession = [...sessions].find((session) => session.item.itemId === ref.itemId);
      if (openSession && openSession.snapshot().savePhase !== "clean") return false;
      const current = await readFile(tabId, path);
      if (current == null) return false;
      const matcher = replaceRegex(query, options);
      const currentCount = [...current.matchAll(matcher)].length;
      if (currentCount !== expectedMatchCount) return false;
      const next = current.replace(matcher, replacement);
      if (next !== current) await writeFile(tabId, path, next);
      return true;
    },
    async create(parentId, kind, name) {
      const parentPath = parentId === null ? "" : pathByItemId.get(parentId);
      if (parentPath === undefined) throw new Error("Parent directory no longer exists");
      const path = [parentPath, name].filter(Boolean).join("/");
      if (kind === "directory") await createDir(tabId, path);
      else await writeFile(tabId, path, "");
      const item = itemFor(path, kind === "directory", name);
      persistItemIds();
      return item;
    },
    async rename(ref, name) {
      if (ref.providerId !== id) throw new Error("Item belongs to a different provider");
      const from = pathByItemId.get(ref.itemId);
      if (from === undefined) throw new Error("Item no longer exists");
      const oldEntries = await listDir(tabId, parentOf(from) ?? "");
      const isDirectory = oldEntries.find((entry) => entry.path === from)?.is_dir ?? false;
      const to = [parentOf(from) ?? "", name].filter(Boolean).join("/");
      await renamePath(tabId, from, to);
      const affected = [...pathByItemId.entries()].filter(([, path]) => path === from || (isDirectory && path.startsWith(`${from}/`)));
      for (const [itemId, oldPath] of affected) {
        const nextPath = `${to}${oldPath.slice(from.length)}`;
        itemIdByPath.delete(oldPath);
        itemIdByPath.set(nextPath, itemId);
        pathByItemId.set(itemId, nextPath);
        for (const session of sessions) session.renamePath(oldPath, nextPath, nextPath.split("/").at(-1) ?? "", parentItemId(nextPath));
      }
      persistItemIds();
      for (const listener of listeners) listener([...new Set([parentItemId(from), parentItemId(to)])]);
      return itemFor(to, isDirectory, name);
    },
    async delete(refs) {
      for (const ref of refs) {
        if (ref.providerId !== id) continue;
        const path = pathByItemId.get(ref.itemId);
        if (path === undefined) continue;
        await deletePath(tabId, path);
        const affected = [...pathByItemId.entries()].filter(([, candidate]) => candidate === path || candidate.startsWith(`${path}/`));
        for (const [itemId, candidate] of affected) {
          pathByItemId.delete(itemId);
          itemIdByPath.delete(candidate);
        }
      }
      persistItemIds();
    },
    async move(refs, parentId) {
      const targetDir = parentId === null ? "" : pathByItemId.get(parentId);
      if (targetDir === undefined) throw new Error("Destination directory no longer exists");
      for (const ref of refs) {
        if (ref.providerId !== id) continue;
        const from = pathByItemId.get(ref.itemId);
        if (from === undefined) continue;
        const name = from.split("/").at(-1) ?? from;
        const to = [targetDir, name].filter(Boolean).join("/");
        if (from === to || to.startsWith(`${from}/`)) continue;
        const oldEntries = await listDir(tabId, parentOf(from) ?? "");
        const isDirectory = oldEntries.find((entry) => entry.path === from)?.is_dir ?? false;
        await renamePath(tabId, from, to);
        const affected = [...pathByItemId.entries()].filter(([, path]) => path === from || path.startsWith(`${from}/`));
        for (const [itemId, oldPath] of affected) {
          const nextPath = `${to}${oldPath.slice(from.length)}`;
          itemIdByPath.delete(oldPath);
          itemIdByPath.set(nextPath, itemId);
          pathByItemId.set(itemId, nextPath);
          for (const session of sessions) session.renamePath(oldPath, nextPath, nextPath.split("/").at(-1) ?? "", parentItemId(nextPath));
        }
        persistItemIds();
        for (const listener of listeners) listener([...new Set([parentItemId(from), parentItemId(to)])]);
        // Resolve the moved root again to retain the directory kind in its metadata.
        itemFor(to, isDirectory, name);
      }
    },
    dispose() {
      unsubscribeFiles();
      listeners.clear();
      for (const session of [...sessions]) void session.close();
    },
  };

  // The owner controls provider lifetime; dispose stops the file watcher.
  return provider;
}

const providerPool = new Map<number, { provider: LocalEditorProvider; references: number }>();

/** Share one provider identity across the explorer and editor panes for a workspace tab. */
export function acquireLocalEditorProvider(tabId: number): { provider: LocalEditorProvider; release: () => void } {
  let entry = providerPool.get(tabId);
  if (!entry) {
    entry = { provider: buildLocalEditorProvider(tabId), references: 0 };
    providerPool.set(tabId, entry);
  }
  entry.references++;
  let released = false;
  return {
    provider: entry.provider,
    release: () => {
      if (released) return;
      released = true;
      const current = providerPool.get(tabId);
      if (!current || current !== entry) return;
      current.references--;
      if (current.references <= 0) {
        providerPool.delete(tabId);
        current.provider.dispose();
      }
    },
  };
}

class LocalDocumentSession implements EditorDocumentSession {
  private value = "";
  private previewUrl = "";
  private mediaType = "application/octet-stream";
  private revision = "0";
  private phase: EditorDocumentSnapshot["savePhase"] = "clean";
  private message?: string;
  private listeners = new Set<(snapshot: EditorDocumentSnapshot) => void>();
  private closed = false;

  constructor(public item: EditorTreeItem, private tabId: number, private onClose: () => void) {}

  get readOnly(): boolean { return this.item.kind === "asset"; }

  async load(): Promise<void> {
    if (this.item.kind === "asset") {
      const url = await getMediaUrl(this.tabId, this.item.path);
      if (!url) throw new Error("Could not preview this file");
      this.previewUrl = url;
      this.mediaType = mediaTypeFor(this.item.path);
      this.revision = url;
      this.phase = "clean";
      this.emit();
      return;
    }
    const value = await readFile(this.tabId, this.item.path);
    if (value === null) throw new Error("Document no longer exists");
    this.value = value;
    this.revision = crypto.randomUUID();
    this.emit();
  }

  snapshot(): EditorDocumentSnapshot {
    return { content: this.item.kind === "asset"
      ? { type: "asset", previewUrl: this.previewUrl, mediaType: this.mediaType }
      : { type: "text", text: this.value }, revision: this.revision, savePhase: this.phase, ...(this.message ? { message: this.message } : {}) };
  }

  subscribe(listener: (snapshot: EditorDocumentSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  async replaceText(text: string, baseRevision: string): Promise<void> {
    if (this.closed) throw new Error("Document session is closed");
    if (this.readOnly) throw new Error("Document is read only");
    if (this.phase === "conflict") throw new Error(this.message ?? "The file changed on disk. Reload it before saving.");
    if (baseRevision !== this.revision) {
      this.phase = "conflict";
      this.message = "The file changed on disk. Reload it before saving.";
      this.emit();
      throw new Error(this.message);
    }
    this.value = text;
    this.phase = "dirty";
    this.message = undefined;
    this.emit();
  }

  async save(): Promise<EditorDocumentSnapshot> {
    if (this.phase === "conflict") throw new Error(this.message ?? "File changed on disk");
    if (this.phase !== "dirty") return this.snapshot();
    const savedValue = this.value;
    this.phase = "saving";
    this.emit();
    try {
      await writeFile(this.tabId, this.item.path, savedValue);
      this.revision = crypto.randomUUID();
      this.phase = this.value === savedValue ? "clean" : "dirty";
      this.message = undefined;
    } catch (error) {
      this.phase = "error";
      this.message = error instanceof Error ? error.message : "Could not save file";
      this.emit();
      throw error;
    }
    this.emit();
    return this.snapshot();
  }

  externalChange(paths: string[]): void {
    if (!paths.includes(this.item.path)) return;
    if (this.phase === "dirty" || this.phase === "saving") {
      this.phase = "conflict";
      this.message = "The file changed on disk while you had unsaved edits.";
      this.emit();
      return;
    }
    void this.load().catch((error) => {
      this.phase = "error";
      this.message = error instanceof Error ? error.message : "Could not reload file";
      this.emit();
    });
  }

  renamePath(from: string, to: string, name: string, parentId: string | null): void {
    if (this.item.path !== from) return;
    this.item = { ...this.item, path: to, parentId, name, kind: kindFor(to, false) };
    this.emit();
  }

  async close(): Promise<void> {
    this.closed = true;
    this.listeners.clear();
    this.onClose();
  }

  private emit(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}

function mediaTypeFor(path: string): string {
  const ext = path.split(".").at(-1)?.toLowerCase();
  const types: Record<string, string> = {
    avif: "image/avif", gif: "image/gif", jpeg: "image/jpeg", jpg: "image/jpeg", png: "image/png",
    svg: "image/svg+xml", webp: "image/webp", pdf: "application/pdf",
  };
  return types[ext ?? ""] ?? "application/octet-stream";
}
