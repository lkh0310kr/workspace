import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import * as Y from "yjs";
import type { IndexeddbPersistence } from "y-indexeddb";
import type { EditorView } from "@codemirror/view";
import { PKMSRealtimeSocket } from "./realtime";
import { clearEditorDocumentDirty, confirmDirtyEditorDocumentsInPaths, confirmEditorDocumentCloseById, discardEditorDocumentViewState, discardEditorViewState, EDITOR_TREE_ROW_HEIGHT, EditorDocumentTabBar, EditorMarkdownDocument, EditorMarkdownTitle, EditorMenuList, EditorProviderError, EditorQuickOpenDialog, EditorSearchButton, editorDocumentKey, editorOutlineEntries, editorSavePhaseLabel, editorTreeSelectionRoots, markdownTitleFor, nextEditorItemName, projectEditorTreeRows, resolveEditorRelativeLink, resolveEditorTreeKeyboardAction, resolveEditorTreePath, resolveMarkdownTitleRenameTarget, setEditorDocumentDirty, toggleEditorSearch, validateTitleInput, type EditorDocumentSession, type EditorItemRef, type EditorMenuItem, type EditorTreeNavigationRow, type MarkdownHeading } from "@workspace/editor";
import { createPkmsEditorProvider } from "./features/editor/pkmsEditorProvider";
import { createPkmsAssetEditorSession, createPkmsYjsEditorSession, pkmsItemForFile } from "./features/editor/pkmsYjsEditorSession";
import { desktopBridge } from "./platform/desktopApi";
import { requestPkmsApi } from "./client/api";
import { flushQueuedWorkspaceAssets, flushQueuedWorkspaceOperations, WORKSPACE_OPERATION_QUEUE_EVENT } from "./client/workspaceOperations";
import { useLocation, useNavigate } from "react-router";
import type { FileNavigation, FileRecord, Peer, RealtimeMessage, Repository, SyncStatus, TreeContextMenu, TreeRow, Workspace } from "./domain/types";
import { toBase64, createOperationId } from "./domain/encoding";
import { entryName, flattenTree, mergeFileRecords, parentPath } from "./domain/fileTree";
import { fileLocationPath, parseFileLocation } from "./domain/fileLocation";
import { matchesExcludePattern } from "./domain/excludePattern";
import { AppIcon, GitHubIcon } from "./components/Icons";
import { PkmsDialog, type PkmsDialogRequest } from "./components/PkmsDialog";
import { FileTreeList } from "./components/FileTreeList";
import { useFileTreeSelection } from "./features/files/useFileTreeSelection";
import { useWorkspaceDirectory } from "./features/files/useWorkspaceDirectory";
import { useDocumentSync } from "./features/editor/useDocumentSync";
import { useRealtimeMessages } from "./features/editor/useRealtimeMessages";
import { useAccountSession } from "./features/account/useAccountSession";
import { useWorkspaceFileCreation } from "./features/files/useWorkspaceFileCreation";
import { useWorkspaceFileActions } from "./features/files/useWorkspaceFileActions";
import { useDocumentSession } from "./features/editor/useDocumentSession";

const MarkdownCodeEditor = lazy(() => import("@workspace/editor/EditorMarkdownSurface").then((module) => ({ default: module.EditorMarkdownSurface })));
const api = requestPkmsApi;
function getEditorViewStateStorage(): Storage | undefined {
  if (typeof window === "undefined") return undefined;
  try { return window.localStorage; } catch { return undefined; }
}

function attachmentContentType(path: string, contentType: string): string {
  if (contentType.startsWith("image/")) return contentType;
  const extension = path.split(".").at(-1)?.toLowerCase();
  const imageTypes: Record<string, string> = {
    avif: "image/avif", gif: "image/gif", jpeg: "image/jpeg", jpg: "image/jpeg",
    png: "image/png", svg: "image/svg+xml", webp: "image/webp",
  };
  return imageTypes[extension ?? ""] ?? contentType;
}

export function meta() {
  return [{ title: "PKMS — Markdown workspace" }];
}

function pkmsDocumentKey(workspaceId: string, fileId: string): string {
  return editorDocumentKey({ providerId: `pkms:${workspaceId}`, itemId: fileId });
}

interface PkmsTreeOperations {
  createFile: (parentPath: string, name: string) => Promise<FileRecord | undefined>;
  createFolder: (parentPath: string, name: string) => Promise<FileRecord | undefined>;
  rename: (file: FileRecord, path: string) => Promise<boolean>;
  move: (files: FileRecord[], parentPath: string) => Promise<boolean>;
  delete: (files: FileRecord[]) => Promise<boolean>;
}

export default function Home() {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);
  const [treeContextMenu, setTreeContextMenu] = useState<TreeContextMenu | null>(null);
  const [treeDropTarget, setTreeDropTarget] = useState<string | null>(null);
  const [showIgnoredFiles, setShowIgnoredFiles] = useState(false);
  const [excludedPatterns, setExcludedPatterns] = useState("");
  const [showFileFilters, setShowFileFilters] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeFile, setActiveFile] = useState<FileRecord | null>(null);
  const [openDocuments, setOpenDocuments] = useState<Array<{ workspaceId: string; file: FileRecord }>>([]);
  const [activeEditorSession, setActiveEditorSession] = useState<EditorDocumentSession | null>(null);
  const [openingFileId, setOpeningFileId] = useState<string | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickQuery, setQuickQuery] = useState("");
  const [quickOpenLoading, setQuickOpenLoading] = useState(false);
  const [quickOpenError, setQuickOpenError] = useState<string | null>(null);
  const [quickOpenResults, setQuickOpenResults] = useState<FileRecord[]>([]);
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [sync, setSync] = useState<SyncStatus>({ serverRevision: 0, githubStatus: "pending", pendingFiles: 0 });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dialogRequest, setDialogRequest] = useState<PkmsDialogRequest | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const account = useAccountSession({ request: api, setError, setActiveWorkspace });
  const { user, workspaces, loading, deviceFlow, refreshWorkspaces, beginDesktopSignIn } = account;
  const [showRepositories, setShowRepositories] = useState(false);
  const [saving, setSaving] = useState(false);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [assetPreviewUrl, setAssetPreviewUrl] = useState<string | null>(null);
  const [assetPreviewType, setAssetPreviewType] = useState("");
  const requestName = useCallback((title: string, initialValue = "") => new Promise<string | null>((resolve) => {
    setDialogRequest({ kind: "name", title, initialValue, resolve });
  }), []);
  const confirm = useCallback((message: string) => new Promise<boolean>((resolve) => {
    setDialogRequest({ kind: "confirm", message, resolve });
  }), []);
  const closeDialog = useCallback(() => setDialogRequest(null), []);
  const {
    currentFolder,
    setCurrentFolder,
    files,
    setFiles,
    loadingFolder,
    setLoadingFolder,
    loadingFolderPaths,
    setLoadingFolderPaths,
    expandedFolders,
    setExpandedFolders,
    loadedFolders,
    setLoadedFolders,
    toggleDirectory,
    restoreWorkspaceTree,
    refreshDirectory,
    getFiles,
  } = useWorkspaceDirectory(activeWorkspace, api, setError);
  const treeFilesRef = useRef(files);
  const activeFileStateRef = useRef(activeFile);
  treeFilesRef.current = files;
  activeFileStateRef.current = activeFile;
  const visibleFiles = useMemo(() => files.filter((file) => showIgnoredFiles || (
    !file.path.split("/").some((part) => part.startsWith(".")) &&
    !excludedPatterns.split("\n").some((pattern) => matchesExcludePattern(file.path, pattern))
  )), [excludedPatterns, files, showIgnoredFiles]);
  const treeRows = useMemo(() => flattenTree(visibleFiles, expandedFolders), [expandedFolders, visibleFiles]);
  const [treeScrollTop, setTreeScrollTop] = useState(0);
  const [treeViewportHeight, setTreeViewportHeight] = useState(0);
  const treeProjection = useMemo(
    () => projectEditorTreeRows(treeRows, treeScrollTop, treeViewportHeight, EDITOR_TREE_ROW_HEIGHT),
    [treeRows, treeScrollTop, treeViewportHeight],
  );
  const {
    focusedPath: focusedTreePath,
    setFocusedPath: setFocusedTreePath,
    selectedPaths: selectedTreePaths,
    setSelectedPaths: setSelectedTreePaths,
    setSelectionAnchorPath,
    cutPaths: cutTreePaths,
    setCutPaths: setCutTreePaths,
    selectRow: selectTreeRow,
  } = useFileTreeSelection(treeRows);
  const socket = useRef<PKMSRealtimeSocket | null>(null);
  const treeRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = treeRef.current;
    if (!element) return;
    const updateHeight = () => setTreeViewportHeight(element.clientHeight);
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);
    return () => observer.disconnect();
  }, [activeWorkspace?.id]);
  const treeContextMenuRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const titleEditFileIdRef = useRef<string | null>(null);
  const editorNavigate = useRef<((position: number) => void) | null>(null);
  const markdownView = useRef<EditorView | null>(null);
  const routedPath = useRef<string | null>(null);
  const openFileSequence = useRef(0);
  const editorNavigationRef = useRef<FileNavigation>("none");
  const editorSessionOpenController = useRef<AbortController | null>(null);
  const pkmsEditorSessions = useRef(new Map<string, EditorDocumentSession>());
  const pkmsDirtySubscriptions = useRef(new Map<string, () => void>());
  const trackPkmsEditorSession = useCallback((sessionKey: string, session: EditorDocumentSession) => {
    pkmsDirtySubscriptions.current.get(sessionKey)?.();
    const unsubscribe = session.subscribe((snapshot) => {
      const item = session.item;
      setEditorDocumentDirty(sessionKey, snapshot.savePhase !== "clean", entryName(item.path), item.path, sessionKey);
    });
    pkmsDirtySubscriptions.current.set(sessionKey, unsubscribe);
  }, []);
  const closePkmsEditorSession = useCallback((sessionKey: string, session: EditorDocumentSession) => {
    pkmsDirtySubscriptions.current.get(sessionKey)?.();
    pkmsDirtySubscriptions.current.delete(sessionKey);
    clearEditorDocumentDirty(sessionKey);
    pkmsEditorSessions.current.delete(sessionKey);
    void session.close();
  }, []);
  const openFileRef = useRef<((file: FileRecord, historyAction?: FileNavigation) => Promise<void>) | null>(null);
  const docs = useRef(new Map<string, { doc: Y.Doc; persistence: IndexeddbPersistence; updateHandler?: (update: Uint8Array, origin: unknown) => void }>());
  const activeRef = useRef<{ file: FileRecord | null; documentKey: string | null; doc: Y.Doc | null; text: Y.Text | null }>({ file: null, documentKey: null, doc: null, text: null });
  const pending = useRef(new Map<string, RealtimeMessage>());
  const hydrating = useRef(false);
  const registerEditorNavigator = useCallback((navigate: ((position: number) => void) | null) => { editorNavigate.current = navigate; }, []);
  useEffect(() => {
    titleEditFileIdRef.current = null;
    setTitleEditing(false);
    setTitleError(null);
  }, [activeWorkspace?.id, activeFile?.id]);
  useEffect(() => {
    if (!titleEditing) return;
    titleInputRef.current?.focus();
    titleInputRef.current?.select();
  }, [titleEditing]);
  const { scheduleAutoSave, saveActiveFileNow, saveDocument } = useDocumentSync({
    workspaceId: activeWorkspace?.id,
    activeDocument: activeRef,
    request: api,
    setSaving,
    setError,
    setSync,
    setNotice,
  });
  const scheduleEditorAutoSave = useCallback((fileId: string, doc: Y.Doc, documentKey?: string) => {
    scheduleAutoSave(fileId, doc, () => {
      const session = documentKey ? pkmsEditorSessions.current.get(documentKey) : undefined;
      return session ? session.save({ flushSync: false }) : saveDocument(fileId, doc, false, documentKey);
    }, documentKey);
  }, [saveDocument, scheduleAutoSave]);
  const { openFile: openDocumentSession, clearActiveFile } = useDocumentSession({
    workspace: activeWorkspace, api, pathname: location.pathname, navigate, routedPath,
    documents: docs, activeDocument: activeRef, pending, socket, openSequence: openFileSequence, hydrating,
    scheduleAutoSave: scheduleEditorAutoSave, setCurrentFolder, setExpandedFolders, setActiveFile, setOpeningFileId,
    setError, setSaving, setSidebarOpen, setNotice,
  });
  const openDocumentSessionRef = useRef(openDocumentSession);
  const saveDocumentRef = useRef(saveDocument);
  const treeOperationsRef = useRef<PkmsTreeOperations>({
    createFile: async () => undefined,
    createFolder: async () => undefined,
    rename: async () => { throw new Error("PKMS tree is not ready"); },
    move: async () => { throw new Error("PKMS tree is not ready"); },
    delete: async () => { throw new Error("PKMS tree is not ready"); },
  });
  openDocumentSessionRef.current = openDocumentSession;
  saveDocumentRef.current = saveDocument;
  const treeProviderListeners = useRef(new Set<(paths: readonly string[]) => void>());
  const getPkmsFileById = useCallback(async (fileId: string, signal?: AbortSignal) => {
    if (!activeWorkspace) return null;
    if (signal?.aborted) throw new DOMException("The operation was aborted", "AbortError");
    try {
      const file = await api<FileRecord>(`/api/workspaces/${encodeURIComponent(activeWorkspace.id)}/files/${encodeURIComponent(fileId)}?metadata=1`, { signal });
      if (signal?.aborted) throw new DOMException("The operation was aborted", "AbortError");
      return file;
    } catch (cause) {
      if (cause && typeof cause === "object" && "code" in cause && cause.code === "not_found") return null;
      throw cause;
    }
  }, [activeWorkspace?.id]);
  const refreshOpenEditorItemMetadata = useCallback(async (roots: readonly FileRecord[]) => {
    if (!activeWorkspace) return;
    const affected = [...pkmsEditorSessions.current.entries()].filter(([, session]) => roots.some((root) =>
      session.item.itemId === root.id || (root.kind === "folder" && session.item.path.startsWith(`${root.path}/`)),
    ));
    await Promise.all(affected.map(async ([, session]) => {
      const fileId = session.item.itemId;
      const optimistic = getFiles().find((file) => file.id === fileId);
      if (optimistic) session.updateItem?.(pkmsItemForFile(activeWorkspace.id, optimistic));
      const latest = await getPkmsFileById(fileId);
      if (!latest) return;
      // An offline move may be queued while the metadata endpoint still returns
      // the previous server path. Keep the optimistic path until replay applies.
      if (optimistic && optimistic.path !== latest.path) return;
      session.updateItem?.(pkmsItemForFile(activeWorkspace.id, latest));
    }));
  }, [activeWorkspace?.id, getFiles, getPkmsFileById]);
  const editorProvider = useMemo(() => activeWorkspace ? createPkmsEditorProvider({
    workspaceId: activeWorkspace.id,
    listDirectory: async (path) => {
      await refreshDirectory(path, true);
      return getFiles().filter((file) => parentPath(file.path) === path);
    },
    getFile: getPkmsFileById,
    openSession: async (file, signal) => {
      await openDocumentSessionRef.current(file, editorNavigationRef.current, signal);
      if (signal?.aborted) throw new DOMException("The operation was aborted", "AbortError");
      if (file.kind === "asset") {
        const path = `/api/workspaces/${encodeURIComponent(activeWorkspace.id)}/assets/${encodeURIComponent(file.id)}`;
        const desktop = desktopBridge();
        const asset = desktop
          ? await desktop.fetchAsset(path)
          : await fetch(path, { credentials: "same-origin" }).then(async (response) => {
            if (!response.ok) throw new Error(`Could not open attachment (${response.status})`);
            return { bytes: new Uint8Array(await response.arrayBuffer()), contentType: response.headers.get("content-type") ?? "" };
          });
        const data = asset.bytes.buffer.slice(asset.bytes.byteOffset, asset.bytes.byteOffset + asset.bytes.byteLength) as ArrayBuffer;
        const mediaType = attachmentContentType(file.path, asset.contentType);
        const previewUrl = URL.createObjectURL(new Blob([data], { type: mediaType }));
        return createPkmsAssetEditorSession(activeWorkspace.id, file, previewUrl, mediaType, () => URL.revokeObjectURL(previewUrl));
      }
      const current = activeRef.current;
      if (!current.doc || !current.text) throw new Error("Could not activate the PKMS document");
      return createPkmsYjsEditorSession(activeWorkspace.id, file, current.doc, current.text, saveDocumentRef.current);
    },
    subscribeTree: (listener) => {
      treeProviderListeners.current.add(listener);
      return () => treeProviderListeners.current.delete(listener);
    },
    listLoadedFiles: getFiles,
    capabilities: { operations: new Set(["createFile", "createDirectory", "rename", "move", "delete"]) },
    operations: {
      async create(parentId, kind, name) {
        const parent = parentId ? await getPkmsFileById(parentId) : null;
        if (parentId && (!parent || parent.kind !== "folder")) throw new EditorProviderError("notFound", "Parent folder no longer exists");
        const parentPathValue = parent?.path ?? "";
        const created = kind === "directory"
          ? await treeOperationsRef.current.createFolder(parentPathValue, name)
          : await treeOperationsRef.current.createFile(parentPathValue, name);
        if (!created) throw new Error("Could not create PKMS item");
        return pkmsItemForFile(activeWorkspace.id, created);
      },
      async rename(ref: EditorItemRef, name) {
        const file = await getPkmsFileById(ref.itemId);
        if (!file) throw new EditorProviderError("notFound", "PKMS item no longer exists");
        const parent = parentPath(file.path);
        const path = `${parent ? `${parent}/` : ""}${name}`;
        if (!await treeOperationsRef.current.rename(file, path)) throw new EditorProviderError("unknown", "Could not rename PKMS item");
        await refreshOpenEditorItemMetadata([file]);
        return pkmsItemForFile(activeWorkspace.id, { ...file, path });
      },
      async move(refs, parentId) {
        const moving = await Promise.all(refs.map((ref) => getPkmsFileById(ref.itemId)));
        if (moving.some((file) => !file)) throw new EditorProviderError("notFound", "A PKMS move source no longer exists");
        const parent = parentId ? await getPkmsFileById(parentId) : null;
        if (parentId && (!parent || parent.kind !== "folder")) throw new EditorProviderError("notFound", "Destination folder no longer exists");
        if (!await treeOperationsRef.current.move(moving.filter((file): file is FileRecord => file !== null), parent?.path ?? "")) {
          throw new EditorProviderError("unknown", "Could not move PKMS items");
        }
        await refreshOpenEditorItemMetadata(moving.filter((file): file is FileRecord => file !== null));
      },
      async delete(refs) {
        const deleting = await Promise.all(refs.map((ref) => getPkmsFileById(ref.itemId)));
        if (deleting.some((file) => !file)) throw new EditorProviderError("notFound", "A PKMS delete target no longer exists");
        await treeOperationsRef.current.delete(deleting.filter((file): file is FileRecord => file !== null));
      },
    },
  }) : null, [activeWorkspace?.id, getPkmsFileById, getFiles, refreshDirectory, refreshOpenEditorItemMetadata]);
  useEffect(() => {
    if (!editorProvider) return;
    const providerId = editorProvider.id;
    return () => {
      editorSessionOpenController.current?.abort();
      editorSessionOpenController.current = null;
      for (const [fileId, session] of pkmsEditorSessions.current) {
        if (session.item.providerId === providerId) {
          closePkmsEditorSession(fileId, session);
        }
      }
    };
  }, [closePkmsEditorSession, editorProvider]);
  const openFile = useCallback(async (file: FileRecord, historyAction: FileNavigation = "push") => {
    editorSessionOpenController.current?.abort();
    const controller = new AbortController();
    editorSessionOpenController.current = controller;
    if (activeWorkspace) {
      setOpenDocuments((current) => {
        const index = current.findIndex((tab) => tab.workspaceId === activeWorkspace.id && tab.file.id === file.id);
        if (index < 0) return [...current, { workspaceId: activeWorkspace.id, file }];
        const next = [...current];
        next[index] = { workspaceId: activeWorkspace.id, file };
        return next;
      });
    }
    if (editorProvider && file.kind === "markdown") {
      const sessionKey = editorDocumentKey({ providerId: editorProvider.id, itemId: file.id });
      const existingSession = pkmsEditorSessions.current.get(sessionKey);
      if (existingSession) {
        await openDocumentSession(file, historyAction, controller.signal);
        if (!controller.signal.aborted) setActiveEditorSession(existingSession);
      }
      else {
        setActiveEditorSession(null);
        editorNavigationRef.current = historyAction;
        try {
          const session = await editorProvider.openDocument({ providerId: editorProvider.id, itemId: file.id }, controller.signal);
          if (controller.signal.aborted) {
            await session.close();
            return;
          }
          trackPkmsEditorSession(sessionKey, session);
          pkmsEditorSessions.current.set(sessionKey, session);
          setActiveEditorSession(session);
        } catch (cause) {
          if (controller.signal.aborted) return;
          setOpenDocuments((current) => current.filter((tab) => !(tab.workspaceId === activeWorkspace?.id && tab.file.id === file.id)));
          setError(cause instanceof Error ? cause.message : "Could not open PKMS document");
        } finally {
          if (editorSessionOpenController.current === controller) {
            editorNavigationRef.current = "none";
            editorSessionOpenController.current = null;
          }
        }
      }
      if (editorSessionOpenController.current === controller) editorSessionOpenController.current = null;
      return;
    }
    setActiveEditorSession(null);
    try {
      await openDocumentSession(file, historyAction, controller.signal);
    } finally {
      if (editorSessionOpenController.current === controller) editorSessionOpenController.current = null;
    }
  }, [activeWorkspace, editorProvider, openDocumentSession, trackPkmsEditorSession]);
  const visibleOpenDocuments = useMemo(
    () => activeWorkspace ? openDocuments.filter((tab) => tab.workspaceId === activeWorkspace.id) : [],
    [activeWorkspace?.id, openDocuments],
  );
  const closeOpenDocument = useCallback((fileId: string) => {
    const tabs = visibleOpenDocuments;
    const index = tabs.findIndex((tab) => tab.file.id === fileId);
    if (index < 0) return;
    const sessionKey = activeWorkspace ? pkmsDocumentKey(activeWorkspace.id, fileId) : "";
    const session = pkmsEditorSessions.current.get(sessionKey);
    const savePhase = session?.snapshot().savePhase;
    const discardingUnsaved = Boolean(savePhase && savePhase !== "clean");
    if (!confirmEditorDocumentCloseById(sessionKey)) return;
    if (discardingUnsaved) discardEditorDocumentViewState(sessionKey);
    const closingActive = activeFile?.id === fileId;
    const nextTab = tabs[index + 1] ?? tabs[index - 1] ?? null;
    setOpenDocuments((current) => current.filter((tab) => !(tab.workspaceId === activeWorkspace?.id && tab.file.id === fileId)));
    if (session) closePkmsEditorSession(sessionKey, session);
    if (!closingActive) return;
    setActiveEditorSession(null);
    if (nextTab) void openFile(nextTab.file, "replace");
    else {
      clearActiveFile();
      navigate("/", { replace: true, preventScrollReset: true });
    }
  }, [activeFile?.id, activeWorkspace?.id, clearActiveFile, closePkmsEditorSession, navigate, openFile, visibleOpenDocuments]);
  openFileRef.current = openFile;
  const activateMarkdownLink = useCallback((link: { kind: "markdown" | "wikilink"; target: string }) => {
    if (link.kind !== "markdown" || link.target.startsWith("#") || !activeWorkspace || !activeFile) return false;
    const targetPath = resolveEditorRelativeLink(activeFile.path, link.target);
    if (!targetPath) return false;
    const openTarget = (file: FileRecord | undefined) => {
      if (!file || file.kind === "folder") {
        setError(`Could not find linked file: ${targetPath}`);
        return;
      }
      void openFileRef.current?.(file);
    };
    const loaded = getFiles().find((file) => file.path === targetPath);
    if (loaded) {
      openTarget(loaded);
    } else {
      void refreshDirectory(parentPath(targetPath), true)
        .then(() => openTarget(getFiles().find((file) => file.path === targetPath)))
        .catch((cause) => setError(cause instanceof Error ? cause.message : `Could not load linked file: ${targetPath}`));
    }
    return true;
  }, [activeWorkspace, activeFile, getFiles, refreshDirectory, setError]);
  const resolveMarkdownImage = useCallback(async (source: string) => {
    if (/^https?:\/\//i.test(source)) return { src: source };
    if (!activeWorkspace || !activeFile) return null;
    const assetPath = resolveEditorRelativeLink(activeFile.path, source);
    if (!assetPath) return null;
    let assetFile = getFiles().find((file) => file.path === assetPath);
    if (!assetFile) {
      await refreshDirectory(parentPath(assetPath), false).catch(() => {});
      assetFile = getFiles().find((file) => file.path === assetPath);
    }
    if (!assetFile || assetFile.kind !== "asset") return null;
    try {
      const endpoint = `/api/workspaces/${encodeURIComponent(activeWorkspace.id)}/assets/${encodeURIComponent(assetFile.id)}`;
      const desktop = desktopBridge();
      const asset = desktop
        ? await desktop.fetchAsset(endpoint)
        : await fetch(endpoint, { credentials: "same-origin" }).then(async (response) => {
          if (!response.ok) throw new Error(`Could not load embedded attachment (${response.status})`);
          return { bytes: new Uint8Array(await response.arrayBuffer()), contentType: response.headers.get("content-type") ?? "" };
        });
      const data = asset.bytes.buffer.slice(asset.bytes.byteOffset, asset.bytes.byteOffset + asset.bytes.byteLength) as ArrayBuffer;
      const mediaType = attachmentContentType(assetFile.path, asset.contentType);
      const src = URL.createObjectURL(new Blob([data], { type: mediaType }));
      return { src, release: () => URL.revokeObjectURL(src) };
    } catch {
      return null;
    }
  }, [activeWorkspace?.id, activeFile?.path, getFiles, refreshDirectory]);

  useEffect(() => {
    if (!activeWorkspace) return;
    const byId = new Map(files.map((file) => [file.id, file]));
    setOpenDocuments((current) => current.map((tab) => {
      if (tab.workspaceId !== activeWorkspace.id) return tab;
      const updated = byId.get(tab.file.id);
      return updated ? { ...tab, file: updated } : tab;
    }));
  }, [activeWorkspace?.id, files]);
  useEffect(() => {
    for (const listener of treeProviderListeners.current) listener([""]);
  }, [files]);
  const handleRealtimeMessage = useRealtimeMessages({
    workspaceId: activeWorkspace?.id ?? "",
    documents: docs,
    pending,
    activeDocument: activeRef,
    openFileRef,
    request: api,
    setPeers,
    setSaving,
    setError,
    setFiles,
  });

  useEffect(() => {
    if (!treeContextMenu) return;
    const dismissOutside = (event: PointerEvent) => {
      // The pane renders in a shadow root, so document-level listeners see a retargeted event.target.
      const menu = treeContextMenuRef.current;
      if (!menu || !event.composedPath().includes(menu)) setTreeContextMenu(null);
    };
    const dismissEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") { setTreeContextMenu(null); treeRef.current?.focus(); }
    };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissEscape);
    requestAnimationFrame(() => treeContextMenuRef.current?.querySelector<HTMLButtonElement>("button")?.focus());
    return () => { document.removeEventListener("pointerdown", dismissOutside); document.removeEventListener("keydown", dismissEscape); };
  }, [treeContextMenu]);

  useEffect(() => {
    if (!activeWorkspace) return;
    setShowIgnoredFiles(localStorage.getItem(`pkms:show-ignored:${activeWorkspace.id}`) === "true");
    setExcludedPatterns(localStorage.getItem(`pkms:excluded-files:${activeWorkspace.id}`) ?? "");
    setShowFileFilters(false);
  }, [activeWorkspace?.id]);

  useEffect(() => { setOutlineItems([]); }, [activeFile?.id]);

  useEffect(() => {
    if (!activeWorkspace) return;
    const workspaceId = activeWorkspace.id;
    const flush = () => {
      void flushQueuedWorkspaceOperations(workspaceId, api)
        .then((drained) => drained ? flushQueuedWorkspaceAssets(workspaceId, api) : false)
        .catch(() => {});
    };
    const onQueueEvent = (event: Event) => {
      const detail = (event as CustomEvent<{
        state?: string;
        workspaceId?: string;
        operation?: { type?: string; path?: string; fileId?: string; toPath?: string };
        result?: { conflictCopyPath?: string; path?: string };
        kind?: string;
        fileId?: string;
        path?: string;
        message?: string;
        hasPending?: boolean;
      }>).detail;
      if (detail?.workspaceId !== workspaceId) return;
      if (detail.state === "queued") {
        setNotice("Saved on this device. Waiting for connection…");
        return;
      }
      if (detail.state === "rejected") {
        setError(detail.message ?? "A local change could not be synced.");
        if (!detail.hasPending) {
          void api<{ files: FileRecord[] }>(`/api/workspaces/${workspaceId}/snapshot`).then((snapshot) => {
            if (activeWorkspace?.id === workspaceId) setFiles(snapshot.files);
          }).catch(() => {});
        }
        return;
      }
      if (detail.state !== "applied") return;
      if (detail.kind === "asset" && detail.fileId) {
        const actualPath = detail.result?.path ?? detail.result?.conflictCopyPath ?? detail.path;
        if (actualPath) setFiles((current) => current.map((file) => file.id === detail.fileId ? { ...file, path: actualPath } : file));
        setNotice("Local changes synced.");
        return;
      }
      const conflictPath = detail.result?.conflictCopyPath;
      const operation = detail.operation;
      if (conflictPath && operation) {
        const moved = operation.type === "create-file"
          ? treeFilesRef.current.find((file) => file.id === operation.fileId)
          : operation.type === "create-folder"
            ? treeFilesRef.current.find((file) => file.path === operation.path && file.kind === "folder")
            : operation.type === "move" ? treeFilesRef.current.find((file) => file.id === operation.fileId) : undefined;
        const fromPath = operation.type === "create-file" || operation.type === "create-folder" ? operation.path : moved?.path;
        if (moved && fromPath) {
          const remap = (path: string) => path === fromPath ? conflictPath : moved.kind === "folder" && path.startsWith(`${fromPath}/`) ? `${conflictPath}${path.slice(fromPath.length)}` : path;
          setFiles((current) => current.map((file) => {
            const path = remap(file.path);
            const id = operation.type === "create-folder" && file.id === moved.id ? `folder-${conflictPath}` : file.id;
            return path === file.path && id === file.id ? file : { ...file, id, path };
          }));
          if (moved.kind === "folder") {
            setExpandedFolders((current) => new Set([...current].map(remap)));
            setLoadedFolders((current) => new Set([...current].map(remap)));
            setCurrentFolder((current) => remap(current));
          }
          const active = activeFileStateRef.current;
          if (active && (active.id === moved.id || (moved.kind === "folder" && active.path.startsWith(`${fromPath}/`)))) {
            const path = remap(active.path);
            setActiveFile((current) => current?.id === active.id ? { ...current, path } : current);
            const target = fileLocationPath(workspaceId, path);
            routedPath.current = target;
            navigate(target, { replace: true, preventScrollReset: true });
          }
        }
      }
      setNotice("Local changes synced.");
    };
    window.addEventListener("online", flush);
    window.addEventListener(WORKSPACE_OPERATION_QUEUE_EVENT, onQueueEvent);
    flush();
    return () => {
      window.removeEventListener("online", flush);
      window.removeEventListener(WORKSPACE_OPERATION_QUEUE_EVENT, onQueueEvent);
    };
  }, [activeWorkspace?.id, api, navigate, setActiveFile, setCurrentFolder, setError, setExpandedFolders, setFiles, setLoadedFolders, setNotice]);


  useEffect(() => {
    if (!activeWorkspace || !activeFile || activeFile.kind !== "asset") {
      setAssetPreviewUrl(null);
      setAssetPreviewType("");
      return;
    }
    let alive = true;
    let objectUrl: string | null = null;
    const path = `/api/workspaces/${encodeURIComponent(activeWorkspace.id)}/assets/${encodeURIComponent(activeFile.id)}`;
    const desktop = desktopBridge();
    const loadAsset = desktop
      ? desktop.fetchAsset(path)
      : fetch(path, { credentials: "same-origin" }).then(async (response) => {
        if (!response.ok) throw new Error(`Could not open attachment (${response.status})`);
        return { bytes: new Uint8Array(await response.arrayBuffer()), contentType: response.headers.get("content-type") ?? "" };
      });
    void loadAsset
      .then(({ bytes, contentType }) => {
        if (!alive) return;
        const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        const previewType = attachmentContentType(activeFile.path, contentType);
        objectUrl = URL.createObjectURL(new Blob([data], { type: previewType }));
        setAssetPreviewType(previewType);
        setAssetPreviewUrl(objectUrl);
      })
      .catch((cause: unknown) => {
        if (alive) setError(cause instanceof Error ? cause.message : "Could not open attachment");
      });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setAssetPreviewUrl(null);
      setAssetPreviewType("");
    };
  }, [activeWorkspace?.id, activeFile?.id, activeFile?.kind, activeFile?.path]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "p" && activeWorkspace) {
        event.preventDefault();
        setQuickQuery("");
        setQuickOpen(true);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && (event.key === "." || event.code === "Period")) {
        event.preventDefault();
        setShowIgnoredFiles((current) => {
          const next = !current;
          if (activeWorkspace) localStorage.setItem(`pkms:show-ignored:${activeWorkspace.id}`, String(next));
          return next;
        });
        return;
      }
      if ((event.metaKey || event.ctrlKey) && (event.key === "\\" || event.code === "Backslash")) {
        event.preventDefault();
        setSidebarOpen((open) => !open);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s" && activeRef.current.file?.kind === "markdown") {
        event.preventDefault();
        const documentKey = activeRef.current.documentKey;
        const session = documentKey ? pkmsEditorSessions.current.get(documentKey) : undefined;
        if (session) void session.save().catch((cause) => setError(cause instanceof Error ? cause.message : "Could not save PKMS document"));
        else saveActiveFileNow();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [activeWorkspace, saveActiveFileNow, setError]);

  const workspaceRef = useRef(activeWorkspace);
  const userRef = useRef(user);
  const realtimeHandlerRef = useRef(handleRealtimeMessage);
  const restoreTreeRef = useRef(restoreWorkspaceTree);
  workspaceRef.current = activeWorkspace;
  userRef.current = user;
  realtimeHandlerRef.current = handleRealtimeMessage;
  restoreTreeRef.current = restoreWorkspaceTree;
  useEffect(() => {
    if (!activeWorkspace) {
      setFiles([]); setActiveFile(null);
      return;
    }
    let alive = true;
    const clientId = `web-${createOperationId()}`;
    let retryTimer = 0;
    let stableTimer = 0;
    let retries = 0;
    const connect = () => {
      if (!alive) return;
      const ws = new PKMSRealtimeSocket(activeWorkspace.id, clientId, userRef.current ?? { login: "Guest" }, api);
      socket.current = ws;
      ws.onopen = () => {
        window.clearTimeout(stableTimer);
        stableTimer = window.setTimeout(() => { retries = 0; }, 30_000);
        setError((current) => current.startsWith("Live sync disconnected") ? "" : current);
        ws.send(JSON.stringify({ type: "hello", protocolVersion: 1, clientId, afterRevision: workspaceRef.current?.revision ?? activeWorkspace.revision, user: userRef.current, fileId: activeRef.current.file?.id }));
        void flushQueuedWorkspaceOperations(activeWorkspace.id, api)
          .then((queueDrained) => queueDrained ? flushQueuedWorkspaceAssets(activeWorkspace.id, api) : false)
          .then((queueDrained) => {
            if (!queueDrained || !alive || socket.current !== ws || ws.readyState !== WebSocket.OPEN) return;
            const current = activeRef.current;
            if (!current.file || !current.doc) return;
            const operationId = createOperationId();
            ws.send(JSON.stringify({ type: "document-update", operationId, fileId: current.file.id, update: toBase64(Y.encodeStateAsUpdate(current.doc)) }));
            pending.current.set(operationId, { type: "document-update", operationId, fileId: current.file.id });
          }).catch(() => {});
      };
      ws.onmessage = (event) => realtimeHandlerRef.current(event);
      ws.onclose = () => {
        window.clearTimeout(stableTimer);
        if (socket.current === ws) socket.current = null;
        setPeers([]);
        pending.current.clear();
        setSaving(false);
        if (alive) {
          const delay = Math.min(30_000, 1_000 * 2 ** Math.min(retries++, 5));
          setError("Live sync disconnected. Reconnecting…");
          retryTimer = window.setTimeout(connect, delay);
        }
      };
      void ws.connect();
    };
    connect();
    const loadSnapshot = async () => {
      const scrollTop = await restoreTreeRef.current(() => alive);
      if (!alive || scrollTop === null) return;
      setFocusedTreePath(null);
      requestAnimationFrame(() => { if (treeRef.current) treeRef.current.scrollTop = scrollTop; });
      try {
        const state = await api<SyncStatus>(`/api/workspaces/${activeWorkspace.id}/sync-status`);
        if (alive) setSync(state);
      } catch (cause) {
        if (alive) {
          setLoadingFolder(false);
          setError(cause instanceof Error ? cause.message : "Could not load workspace");
        }
      }
    };
    void loadSnapshot();
    // Mirror GitHub into the server cache in bounded steps (tree, then note bodies) so links and notes resolve without GitHub.
    const runMirror = async () => {
      for (let step = 0; step < 60 && alive; step++) {
        const result = await api<{ status: string }>(`/api/workspaces/${activeWorkspace.id}/mirror`, { method: "POST" });
        if (result.status !== "progress") return;
      }
    };
    void runMirror().catch(() => {});
    let syncTimer = 0;
    const pollSyncStatus = (delay: number) => {
      syncTimer = window.setTimeout(() => {
        void api<SyncStatus>(`/api/workspaces/${activeWorkspace.id}/sync-status`).then((status) => {
          void flushQueuedWorkspaceOperations(activeWorkspace.id, api)
            .then((drained) => drained ? flushQueuedWorkspaceAssets(activeWorkspace.id, api) : false)
            .catch(() => {});
          setSync(status);
          pollSyncStatus(15_000);
        }).catch((cause) => {
          if (!alive) return;
          setError(cause instanceof Error ? cause.message : "동기화 상태를 확인하지 못했습니다.");
          const retrySeconds = (cause as Error & { retryAfterSeconds?: number }).retryAfterSeconds;
          if (retrySeconds) {
            window.clearTimeout(retryTimer);
            retryTimer = window.setTimeout(connect, retrySeconds * 1000);
          }
          pollSyncStatus(retrySeconds ? retrySeconds * 1000 : 15_000);
        });
      }, delay);
    };
    pollSyncStatus(15_000);
    return () => { alive = false; window.clearTimeout(syncTimer); window.clearTimeout(retryTimer); window.clearTimeout(stableTimer); socket.current?.close(); socket.current = null; setPeers([]); };
    // Reconnect only when the workspace (or signed-in login) changes; callbacks and revisions are read through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspace?.id, api, user?.login]);

  useEffect(() => {
    if (!activeWorkspace || !loadedFolders.has("")) return;
    localStorage.setItem(`pkms:tree:${activeWorkspace.id}`, JSON.stringify({ expanded: [...expandedFolders].filter(Boolean), currentFolder }));
  }, [activeWorkspace?.id, currentFolder, expandedFolders, loadedFolders]);


  const fileLocation = parseFileLocation(location.pathname);
  useEffect(() => {
    if (loading || !user) return;
    if (!fileLocation) {
      if (location.pathname === "/" && activeRef.current.file) {
        setActiveEditorSession(null);
        clearActiveFile();
      }
      routedPath.current = null;
      return;
    }
    if (!workspaces.length) return;
    const workspace = workspaces.find((item) => item.id === fileLocation.workspaceId);
    if (!workspace) {
      routedPath.current = null;
      navigate("/", { replace: true });
      return;
    }
    if (activeWorkspace?.id !== workspace.id) {
      setActiveEditorSession(null);
      clearActiveFile();
      setFiles([]); setLoadingFolder(true); setLoadingFolderPaths(new Set());
      setCurrentFolder("");
      setSelectedTreePaths(new Set()); setCutTreePaths(new Set()); setSelectionAnchorPath(null);
      setExpandedFolders(new Set([""]));
      setLoadedFolders(new Set());
      setActiveWorkspace(workspace);
      routedPath.current = null;
      return;
    }
    if (!loadedFolders.has("")) return;
    if (routedPath.current === location.pathname) return;
    routedPath.current = location.pathname;
    let records = files;
    const parent = parentPath(fileLocation.path);
    const folders = parent ? parent.split("/") : [];
    let prefix = "";
    void (async () => {
      try {
        for (const folder of folders) {
          prefix = prefix ? `${prefix}/${folder}` : folder;
          if (loadedFolders.has(prefix)) continue;
          const result = await api<{ files: FileRecord[] }>(`/api/workspaces/${workspace.id}/directory?path=${encodeURIComponent(prefix)}`);
          records = mergeFileRecords(records, result.files);
          setFiles(records);
          setLoadedFolders((current) => new Set(current).add(prefix));
        }
        if (routedPath.current !== location.pathname) return;
        const target = records.find((file) => file.path === fileLocation.path && file.kind !== "folder");
        if (!target) {
          setError("File not found in this repository.");
          navigate("/", { replace: true });
          return;
        }
        if (activeRef.current.file?.id !== target.id) await openFileRef.current?.(target, "none");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not open file from URL");
        navigate("/", { replace: true });
      }
    })();
  }, [activeWorkspace?.id, api, fileLocation?.path, fileLocation?.workspaceId, files, loadedFolders, loading, location.pathname, navigate, user, workspaces]);

  const toggleFolder = async (file: FileRecord) => {
    if (!activeWorkspace || !editorProvider) return;
    setCurrentFolder(file.path);
    setFocusedTreePath(file.path);
    await toggleDirectory(file, () => editorProvider.listChildren(file.id));
  };

  const chooseWorkspace = (workspace: Workspace) => {
    setActiveEditorSession(null); setActiveWorkspace(workspace); clearActiveFile(); setFiles([]); setLoadingFolder(true); setLoadingFolderPaths(new Set()); setCurrentFolder(""); setExpandedFolders(new Set([""])); setLoadedFolders(new Set());
    setSelectedTreePaths(new Set()); setCutTreePaths(new Set()); setSelectionAnchorPath(null);
    routedPath.current = null;
    navigate("/", { preventScrollReset: true });
  };

  const openRepositoryPicker = async () => {
    setError("");
    try {
      const result = await api<{ repositories: Repository[] }>("/api/repositories");
      setRepositories(result.repositories.filter((repository) => repository.canWrite));
      setShowRepositories(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not list repositories"); }
  };

  const connectRepository = async (repository: Repository) => {
    setError("");
    try {
      const result = await api<{ workspace: Workspace }>("/api/workspaces", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ repository: repository.fullName, branch: repository.defaultBranch }) });
      setShowRepositories(false);
      setActiveEditorSession(null);
      clearActiveFile(); setFiles([]); setLoadingFolder(true); setLoadingFolderPaths(new Set()); setCurrentFolder(""); setExpandedFolders(new Set([""])); setLoadedFolders(new Set());
      setSelectedTreePaths(new Set()); setCutTreePaths(new Set()); setSelectionAnchorPath(null);
      await refreshWorkspaces();
      setActiveWorkspace(result.workspace);
      routedPath.current = null;
      navigate("/", { preventScrollReset: true });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not connect repository"); }
  };

  const { createNote, createFolder, uploadFile } = useWorkspaceFileCreation({ workspace: activeWorkspace, files, currentFolder, request: api, setFiles, setLoadedFolders, setError, openFile });
  const createTreeNote = async (parentPath: string) => {
    const provider = editorProvider;
    if (!provider) { setError("PKMS editor is not ready"); return; }
    try {
      const parent = parentPath ? await resolveEditorTreePath(provider, parentPath) : null;
      if (parentPath && (!parent || parent.kind !== "directory")) throw new EditorProviderError("notFound", "Parent folder no longer exists");
      const children = await provider.listChildren(parent?.itemId ?? null);
      const name = nextEditorItemName(children.map((item) => item.name), "untitled", ".md");
      if (!provider.create) throw new EditorProviderError("unsupported", "PKMS note creation is unavailable");
      const item = await provider.create(parent?.itemId ?? null, "file", name);
      const file: FileRecord = { id: item.itemId, path: item.path, kind: "markdown", revision: 0, content: "# Untitled\n\n" };
      await openFile(file);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create PKMS note");
    }
  };
  const createTreeFolder = async (parentPath: string) => {
    const name = await requestName("Folder name");
    if (!name) return;
    const provider = editorProvider;
    if (!provider) { setError("PKMS editor is not ready"); return; }
    try {
      const parent = parentPath ? await resolveEditorTreePath(provider, parentPath) : null;
      if (parentPath && (!parent || parent.kind !== "directory")) throw new EditorProviderError("notFound", "Parent folder no longer exists");
      if (!provider.create) throw new EditorProviderError("unsupported", "PKMS folder creation is unavailable");
      await provider.create(parent?.itemId ?? null, "directory", name);
      if (parentPath) setExpandedFolders((current) => new Set(current).add(parentPath));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create PKMS folder");
    }
  };
  const beginTreeCreation = (kind: "file" | "folder", parentPath = currentFolder) => {
    setTreeContextMenu(null);
    if (parentPath) setExpandedFolders((current) => new Set(current).add(parentPath));
    if (kind === "file") void createTreeNote(parentPath);
    else void createTreeFolder(parentPath);
  };
  const beginTreeRename = async (file: FileRecord) => {
    setTreeContextMenu(null);
    const name = await requestName("Rename to", entryName(file.path));
    if (!name?.trim() || name.trim() === entryName(file.path)) return;
    try {
      await renameThroughEditorProvider(file, name.trim());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not rename PKMS item");
    }
  };
  const toolbarCreationFolder = selectedTreePaths.size === 1
    ? files.find((file) => file.path === [...selectedTreePaths][0] && file.kind === "folder")?.path ?? currentFolder
    : currentFolder;

  const [outlineItems, setOutlineItems] = useState<MarkdownHeading[]>([]);
  const persistTreeScroll = (scrollTop: number) => {
    setTreeScrollTop(scrollTop);
    if (!activeWorkspace) return;
    const key = `pkms:tree:${activeWorkspace.id}`;
    let saved: Record<string, unknown> = {};
    try { saved = JSON.parse(localStorage.getItem(key) ?? "{}"); } catch { saved = {}; }
    localStorage.setItem(key, JSON.stringify({ ...saved, scrollTop }));
  };

  const handleTreeKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    const index = treeRows.findIndex((row) => row.file.path === focusedTreePath);
    const row = treeRows[index];
    const selectedFiles = treeRows.filter((item) => selectedTreePaths.has(item.file.path)).map((item) => item.file);
    const commandFiles = selectedFiles.length ? selectedFiles : row ? [row.file] : [];
    const focusRow = (next: TreeRow | undefined) => {
      if (!next) return;
      setFocusedTreePath(next.file.path);
      const nextIndex = treeRows.findIndex((item) => item.file.id === next.file.id);
      const element = treeRef.current;
      if (element && nextIndex >= 0) {
        const top = nextIndex * EDITOR_TREE_ROW_HEIGHT;
        if (top < element.scrollTop || top + EDITOR_TREE_ROW_HEIGHT > element.scrollTop + element.clientHeight) element.scrollTop = top;
      }
      requestAnimationFrame(() => treeRef.current?.querySelector<HTMLElement>(`[data-tree-path="${CSS.escape(next.file.path)}"]`)?.focus());
    };
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      setSelectedTreePaths(new Set(treeRows.map((item) => item.file.path)));
      if (row) setSelectionAnchorPath(row.file.path);
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "x") {
      event.preventDefault();
      setCutTreePaths(new Set(editorTreeSelectionRoots(commandFiles, new Set(commandFiles.map((file) => file.path)), (file) => file.kind === "folder").map((file) => file.path)));
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "v" && cutTreePaths.size) {
      event.preventDefault();
      const target = selectedFiles.length === 1 && selectedFiles[0].kind === "folder"
        ? selectedFiles[0].path
        : row ? (row.file.kind === "folder" ? row.file.path : parentPath(row.file.path)) : currentFolder;
      void moveThroughEditorProvider(files.filter((file) => cutTreePaths.has(file.path)), target);
      return;
    }
    const navigationRows: EditorTreeNavigationRow[] = treeRows.map(({ file, depth }) => ({
      path: file.path,
      kind: file.kind === "folder" ? "directory" : file.kind === "markdown" ? "markdown" : "asset",
      depth,
    }));
    const keyAction = resolveEditorTreeKeyboardAction(event.key, navigationRows, row?.file.path ?? null, expandedFolders);
    if (keyAction?.type === "delete") {
      if (commandFiles.length) { event.preventDefault(); void deleteThroughEditorProvider(commandFiles); }
      return;
    }
    if (keyAction?.type === "rename" && row && selectedTreePaths.size === 1) {
      event.preventDefault();
      const selected = files.find((file) => selectedTreePaths.has(file.path));
      if (selected) beginTreeRename(selected);
      return;
    }
    if (keyAction?.type === "navigate") {
      const action = keyAction.action;
      event.preventDefault();
      if (action.type === "focus") {
        const next = treeRows[action.index];
        if (event.shiftKey) selectTreeRow(action.path, action.index, true, true);
        else selectTreeRow(action.path, action.index);
        focusRow(next);
      } else {
        const folder = files.find((file) => file.path === action.path && file.kind === "folder");
        if (folder) void toggleFolder(folder);
      }
      return;
    }
    if (row && keyAction?.type === "activate") {
      event.preventDefault();
      if (row.file.kind === "folder") void toggleFolder(row.file);
      else void openFile(row.file);
    }
  };

  const quickOpenItems = useMemo(() => quickOpenResults.map((file) => ({ id: file.id, label: entryName(file.path), description: file.path })), [quickOpenResults]);
  useEffect(() => {
    if (!quickOpen || !editorProvider) {
      setQuickOpenResults([]);
      setQuickOpenLoading(false);
      setQuickOpenError(null);
      return;
    }
    const controller = new AbortController();
    setQuickOpenResults([]);
    setQuickOpenLoading(true);
    setQuickOpenError(null);
    void editorProvider.search(quickQuery, {
      target: "names",
      caseSensitive: false,
      regex: false,
      wholeWord: false,
      fuzzy: true,
    }, controller.signal).then((results) => {
      if (controller.signal.aborted) return;
      const byId = new Map(visibleFiles.map((file) => [file.id, file]));
      setQuickOpenResults(results.map(({ item }) => byId.get(item.itemId)).filter((file): file is FileRecord => Boolean(file)).slice(0, 30));
      setQuickOpenLoading(false);
    }).catch((cause: unknown) => {
      if (controller.signal.aborted) return;
      setQuickOpenResults([]);
      setQuickOpenError(cause instanceof Error ? cause.message : "Could not search PKMS files");
      setQuickOpenLoading(false);
    });
    return () => controller.abort();
  }, [editorProvider, visibleFiles, quickOpen, quickQuery]);
  const contextMoveSources = treeRows.filter((row) => selectedTreePaths.has(row.file.path)).map((row) => row.file);
  const contextMoveRoots = editorTreeSelectionRoots(contextMoveSources, new Set(contextMoveSources.map((file) => file.path)), (file) => file.kind === "folder");
  const cutMoveRoots = editorTreeSelectionRoots(files.filter((file) => cutTreePaths.has(file.path)), cutTreePaths, (file) => file.kind === "folder");
  const saveAttachment = () => {
    if (!assetPreviewUrl || !activeFile) return;
    const link = document.createElement("a");
    link.href = assetPreviewUrl;
    link.download = activeFile.path.split("/").at(-1) ?? "attachment";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const { updateFilePath, moveTreeItems, renameTreeItemTo, deleteTreeItems, openTreeItem } = useWorkspaceFileActions({
    workspace: activeWorkspace, activeFile, currentFolder, files, expandedFolders,
    api, navigate, routedPath, clearActiveFile, openFile, toggleFolder, setFiles, setActiveFile, setCurrentFolder, setExpandedFolders,
    setLoadedFolders, setSelectedTreePaths, setCutTreePaths, setFocusedTreePath, setTreeContextMenu, setError, setNotice, confirm,
    beforeDelete: (roots) => confirmDirtyEditorDocumentsInPaths(roots.map((root) => root.path)),
    afterDelete: (roots) => {
      const deletedIds = new Set(openDocuments.filter((tab) => tab.workspaceId === activeWorkspace?.id && roots.some((root) =>
        tab.file.path === root.path || (root.kind === "folder" && tab.file.path.startsWith(`${root.path}/`)),
      )).map((tab) => tab.file.id));
      for (const fileId of deletedIds) {
        if (activeWorkspace) discardEditorViewState(pkmsDocumentKey(activeWorkspace.id, fileId));
        const sessionKey = activeWorkspace ? pkmsDocumentKey(activeWorkspace.id, fileId) : "";
        const session = pkmsEditorSessions.current.get(sessionKey);
        if (session) closePkmsEditorSession(sessionKey, session);
      }
      setOpenDocuments((current) => current.filter((tab) => !(tab.workspaceId === activeWorkspace?.id && deletedIds.has(tab.file.id))));
      setActiveEditorSession((current) => current?.item.providerId === `pkms:${activeWorkspace?.id}` && deletedIds.has(current.item.itemId) ? null : current);
    },
  });
  treeOperationsRef.current = {
    createFile: (directory, name) => createNote(directory, name, false),
    createFolder,
    rename: updateFilePath,
    move: moveTreeItems,
    delete: (items) => deleteTreeItems(items),
  };
  const moveThroughEditorProvider = async (items: FileRecord[], destination: string) => {
    if (!editorProvider?.move) { await moveTreeItems(items, destination); return; }
    const parent = destination ? await resolveEditorTreePath(editorProvider, destination) : null;
    if (destination && (!parent || parent.kind !== "directory")) {
      throw new EditorProviderError("notFound", "Destination folder no longer exists");
    }
    await editorProvider.move(items.map((file) => ({ providerId: editorProvider.id, itemId: file.id })), parent?.itemId ?? null);
  };
  const deleteThroughEditorProvider = async (items: FileRecord[]) => {
    if (!editorProvider?.delete) return deleteTreeItems(items);
    return editorProvider.delete(items.map((file) => ({ providerId: editorProvider.id, itemId: file.id })));
  };
  const deleteActiveFileThroughEditorProvider = () => {
    if (activeFile) void deleteThroughEditorProvider([activeFile]);
  };
  const deleteCurrentFolderThroughEditorProvider = () => {
    const folder = files.find((file) => file.kind === "folder" && file.path === currentFolder);
    if (folder) void deleteThroughEditorProvider([folder]);
  };
  const renameThroughEditorProvider = async (file: FileRecord, name: string) => {
    if (!editorProvider?.rename) return renameTreeItemTo(file, name);
    await editorProvider.rename({ providerId: editorProvider.id, itemId: file.id }, name);
  };
  const renameActiveFileThroughEditorProvider = async () => {
    if (!activeFile) return;
    const currentName = entryName(activeFile.path);
    const name = await requestName("Rename", currentName);
    if (!name?.trim() || name.trim() === currentName) return;
    await renameThroughEditorProvider(activeFile, name.trim());
  };
  const enterTitleEdit = () => {
    if (!activeFile || activeFile.kind !== "markdown") return;
    titleEditFileIdRef.current = activeFile.id;
    setTitleDraft(markdownTitleFor(activeFile.path));
    setTitleError(null);
    setTitleEditing(true);
  };
  const commitTitleRename = async () => {
    const file = activeFile;
    if (!file || titleEditFileIdRef.current !== file.id || !editorProvider?.rename) return;
    const validation = validateTitleInput(titleDraft);
    if ("error" in validation) {
      if (validation.error === "empty") {
        titleEditFileIdRef.current = null;
        setTitleEditing(false);
        setTitleError(null);
        return;
      }
      setTitleError('Title can’t contain "/" or "\\".');
      titleInputRef.current?.focus();
      return;
    }

    const title = validation.title;
    if (title === markdownTitleFor(file.path)) {
      titleEditFileIdRef.current = null;
      setTitleEditing(false);
      setTitleError(null);
      return;
    }
    try {
      const target = await resolveMarkdownTitleRenameTarget(editorProvider, file.path, title);
      if (!editorProvider.rename || !target.currentItem) throw new Error("Renaming is not supported by this provider");
      await editorProvider.rename(target.currentItem, target.name);
      if (activeFileStateRef.current?.id !== file.id) return;
      titleEditFileIdRef.current = null;
      setTitleEditing(false);
      setTitleError(null);
    } catch (cause) {
      if (activeFileStateRef.current?.id !== file.id) return;
      setTitleError(cause instanceof Error ? cause.message : "Could not rename PKMS note");
      titleInputRef.current?.focus();
    }
  };
  const renameCurrentFolderThroughEditorProvider = async () => {
    const folder = files.find((file) => file.kind === "folder" && file.path === currentFolder);
    if (!folder) return;
    const currentName = entryName(folder.path);
    const name = await requestName("Rename folder", currentName);
    if (!name?.trim() || name.trim() === currentName) return;
    await renameThroughEditorProvider(folder, name.trim());
  };

  if (loading) return <main className="loading-screen"><div className="brand-mark">P</div><span>Opening your workspace…</span></main>;
  if (!user) return (
    <main className="welcome-screen">
      <div className="welcome-card">
        <h1>Sign in to PKMS</h1>
        {error && <div className="notice error">{error}</div>}
        {desktopBridge() ? (
          <>
            <button className="primary-button github-button" onClick={() => void beginDesktopSignIn()}>
              <GitHubIcon /> Continue with GitHub
            </button>
            {deviceFlow && <p className="device-code-instructions">Enter <strong>{deviceFlow.userCode}</strong> at GitHub to finish signing in.</p>}
          </>
        ) : <a className="primary-button github-button" href="/api/auth/github"><GitHubIcon /> Continue with GitHub</a>}
      </div>
    </main>
  );

  return (
    <main className={`app-shell${sidebarOpen ? "" : " sidebar-collapsed"}`}>
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="brand-lockup"><div className="brand-mark small">P</div><span>PKMS</span></div>
        </div>
        <div className="workspace-select">
          <div className="workspace-heading"><span className="eyebrow">Workspace</span><button className="icon-button" title="Add workspace" aria-label="Add workspace" onClick={openRepositoryPicker}><AppIcon name="plus" /></button></div>
          {workspaces.length ? <select value={activeWorkspace?.id ?? ""} onChange={(event) => { const workspace = workspaces.find((item) => item.id === event.target.value); if (workspace) chooseWorkspace(workspace); }}>
            {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.repository}</option>)}
          </select> : <button className="connect-link" onClick={openRepositoryPicker}>Connect a repository <span>↗</span></button>}
        </div>
        {activeWorkspace && <>
          <div className="file-toolbar"><span className="eyebrow">Files</span><div className="toolbar-actions">
            <button className={`mini-button visibility-button${showFileFilters ? " active" : ""}`} title="File filter settings" aria-label="File filter settings" aria-expanded={showFileFilters} onClick={() => setShowFileFilters((open) => !open)}><AppIcon name="filter" /></button>
            <button className="mini-button" title="New note" onClick={() => beginTreeCreation("file", toolbarCreationFolder)}><AppIcon name="filePlus" /></button>
            <button className="mini-button" title="New folder" onClick={() => beginTreeCreation("folder", toolbarCreationFolder)}><AppIcon name="folderPlus" /></button>
            <label className="mini-button upload-button" title="Upload file"><AppIcon name="upload" /><input type="file" onChange={(event) => { void uploadFile(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>
            {activeFile && <button className="mini-button" title="Rename" onClick={() => void renameActiveFileThroughEditorProvider()}><AppIcon name="pencil" /></button>}
            {(selectedTreePaths.size > 0 || activeFile) && <button className="mini-button" title={selectedTreePaths.size > 0 ? "Delete selected items" : "Delete open file"} aria-label={selectedTreePaths.size > 0 ? "Delete selected items" : "Delete open file"} onClick={() => selectedTreePaths.size > 0 ? void deleteThroughEditorProvider(treeRows.filter((row) => selectedTreePaths.has(row.file.path)).map((row) => row.file)) : deleteActiveFileThroughEditorProvider()}><AppIcon name="trash" /></button>}
            {!activeFile && currentFolder && <button className="mini-button" title="Rename folder" onClick={() => void renameCurrentFolderThroughEditorProvider()}><AppIcon name="pencil" /></button>}
            {!activeFile && currentFolder && <button className="mini-button" title="Delete folder" onClick={deleteCurrentFolderThroughEditorProvider}><AppIcon name="trash" /></button>}
          </div></div>
          {showFileFilters && <div className="file-filter-panel"><div className="file-filter-heading"><span>Ignored files</span><span className="filter-state">{showIgnoredFiles ? "Shown" : "Hidden"} · ⌘⇧.</span></div><label htmlFor="excluded-files">Exclude paths</label><textarea id="excluded-files" value={excludedPatterns} placeholder={"*.tmp\n**/drafts/**"} spellCheck={false} onChange={(event) => { const next = event.target.value; setExcludedPatterns(next); localStorage.setItem(`pkms:excluded-files:${activeWorkspace.id}`, next); }} /><p>Press ⌘⇧. to show ignored files</p></div>}
          <FileTreeList
            treeRef={treeRef}
            projection={treeProjection}
            selectedPaths={selectedTreePaths}
            expandedFolders={expandedFolders}
            focusedPath={focusedTreePath}
            currentFolder={currentFolder}
            activeFileId={activeFile?.id ?? null}
            cutPaths={cutTreePaths}
            dropTarget={treeDropTarget}
            loadingFolders={loadingFolderPaths}
            busy={loadingFolder || loadingFolderPaths.size > 0}
            loading={loadingFolder}
            onKeyDown={handleTreeKeyDown}
            onScroll={persistTreeScroll}
            onSetDropTarget={setTreeDropTarget}
            onDropItems={(paths, destination) => void moveThroughEditorProvider(files.filter((file) => paths.includes(file.path)), destination)}
            onFocusPath={setFocusedTreePath}
            onDragStart={(file, index, event) => {
              const selected = selectedTreePaths.has(file.path) ? treeRows.filter((row) => selectedTreePaths.has(row.file.path)).map((row) => row.file) : [file];
              const roots = editorTreeSelectionRoots(selected, new Set(selected.map((entry) => entry.path)), (entry) => entry.kind === "folder");
              event.dataTransfer.setData("application/x-pkms-tree-paths", JSON.stringify(roots.map((entry) => entry.path)));
              event.dataTransfer.effectAllowed = "move";
              if (!selectedTreePaths.has(file.path)) selectTreeRow(file.path, index);
            }}
            onContextMenu={(file, event) => {
              setFocusedTreePath(file.path);
              if (!selectedTreePaths.has(file.path)) { setSelectedTreePaths(new Set([file.path])); setSelectionAnchorPath(file.path); }
              const menuHeight = file.kind === "folder" ? 240 : 136;
              setTreeContextMenu({ file, x: Math.max(8, Math.min(event.clientX, window.innerWidth - 196)), y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8)) });
            }}
            onSelectRow={selectTreeRow}
            onClearSelection={() => { setSelectedTreePaths(new Set()); setSelectionAnchorPath(null); setFocusedTreePath(null); }}
            onActivate={(file) => { if (file.kind === "folder") void toggleFolder(file); else void openFile(file); }}
          />
          {treeContextMenu && (() => {
            const file = treeContextMenu.file;
            const canMoveSelection = contextMoveRoots.some((item) => item.path !== file.path && parentPath(item.path) !== file.path && !(item.kind === "folder" && file.path.startsWith(`${item.path}/`)));
            const menuItems: EditorMenuItem[] = [
              { type: "item", id: "open", label: file.kind === "folder" ? "Open folder" : "Open", onSelect: () => void openTreeItem(file) },
              ...(file.kind === "folder" ? [
                { type: "item" as const, id: "new-note", label: "New note", onSelect: () => beginTreeCreation("file", file.path) },
                { type: "item" as const, id: "new-folder", label: "New folder", onSelect: () => beginTreeCreation("folder", file.path) },
                ...(cutMoveRoots.length ? [{ type: "item" as const, id: "paste", label: "Paste into folder", onSelect: () => void moveThroughEditorProvider(cutMoveRoots, file.path) }] : []),
                ...(canMoveSelection ? [{ type: "item" as const, id: "move-selection", label: "Move selection here", onSelect: () => void moveThroughEditorProvider(contextMoveRoots, file.path) }] : []),
              ] : []),
              { type: "item", id: "cut", label: "Cut", onSelect: () => setCutTreePaths(new Set(contextMoveRoots.map((item) => item.path))) },
              { type: "item", id: "rename", label: "Rename", onSelect: () => beginTreeRename(file) },
              { type: "item", id: "delete", label: "Delete", danger: true, onSelect: () => void deleteThroughEditorProvider(selectedTreePaths.has(file.path) ? treeRows.filter((row) => selectedTreePaths.has(row.file.path)).map((row) => row.file) : [file]) },
            ];
            return <EditorMenuList
              ref={treeContextMenuRef}
              className="tree-context-menu"
              ariaLabel={`${entryName(file.path)} actions`}
              dangerClassName="danger"
              items={menuItems}
              style={{ left: treeContextMenu.x, top: treeContextMenu.y }}
              onClose={() => setTreeContextMenu(null)}
            />;
          })()}
        </>}
        <div className="sidebar-bottom">
          <div className="account-row"><img src={user.avatarUrl} alt="" /><span>@{user.login}</span><button className="icon-button logout-button" title="Sign out" onClick={() => void api("/api/logout", { method: "POST" }).then(() => { if (desktopBridge()) { account.clearAccount(); } else window.location.reload(); })}><AppIcon name="logout" /></button></div>
        </div>
      </aside>

      <section className="main-panel">
        <header className="topbar">
          <div className="topbar-left"><button className="sidebar-toggle" onClick={() => setSidebarOpen((open) => !open)} aria-expanded={sidebarOpen} aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"} title={sidebarOpen ? "Hide sidebar (⌘\\)" : "Show sidebar (⌘\\)"}><AppIcon name="menu" /></button><div className="breadcrumbs"><span>{activeWorkspace?.repository ?? "No workspace"}</span>{(activeFile || currentFolder) && <><span className="crumb-slash">/</span><span>{activeFile?.path ?? currentFolder}</span></>}</div></div>
          <div className="topbar-right">
            <span className={`save-label ${saving ? "active" : ""}`}><span className="status-dot" />{saving ? editorSavePhaseLabel("saving") : notice || (sync.githubStatus === "synced" ? "Synced" : editorSavePhaseLabel(activeEditorSession?.snapshot().savePhase ?? "clean"))}</span>
            {peers.length > 1 && <div className="collaborators" aria-label="Collaborators"><span>{peers.length} here</span></div>}
          </div>
        </header>
        {error && <button className="notice error dismissible" onClick={() => setError("")}>{error}<AppIcon name="close" /></button>}
        {showRepositories && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowRepositories(false); }}><section className="repository-modal">
          <button className="modal-close" onClick={() => setShowRepositories(false)} aria-label="Close"><AppIcon name="close" /></button><span className="eyebrow">GitHub</span><h2>Choose a repository</h2>
          <div className="repository-list">{repositories.map((repository) => <button key={repository.fullName} className="repository-option" onClick={() => void connectRepository(repository)}><span className="repo-icon"><AppIcon name={repository.private ? "lock" : "folder"} /></span><span><strong>{repository.fullName}</strong><small>{repository.defaultBranch} · {repository.private ? "Private" : "Public"}</small></span><span className="option-arrow"><AppIcon name="arrowRight" /></span></button>)}{!repositories.length && <p className="empty-hint">No writable repositories found.</p>}</div>
        </section></div>}
        {quickOpen && <EditorQuickOpenDialog
          query={quickQuery}
          items={quickOpenItems}
          placeholder="Search open and loaded files…"
          loading={quickOpenLoading}
          error={quickOpenError}
          emptyMessage="No loaded files found"
          onQueryChange={setQuickQuery}
          onClose={() => setQuickOpen(false)}
          onSelect={(id) => {
            const file = quickOpenResults.find((result) => result.id === id);
            if (file) void openFile(file);
            setQuickOpen(false);
          }}
        />}
        {activeWorkspace && visibleOpenDocuments.length > 0 && <EditorDocumentTabBar
          tabs={visibleOpenDocuments.map(({ file }) => {
            const phase = pkmsEditorSessions.current.get(pkmsDocumentKey(activeWorkspace.id, file.id))?.snapshot().savePhase;
            return { id: file.id, label: entryName(file.path), title: file.path, dirty: phase ? phase !== "clean" : file.id === activeFile?.id && (saving || notice === "Unsaved") };
          })}
          activeId={activeFile?.id ?? null}
          onSelect={(id) => { const tab = visibleOpenDocuments.find((item) => item.file.id === id); if (tab) void openFile(tab.file); }}
          onClose={closeOpenDocument}
        />}
        {!activeWorkspace ? <div className="empty-workspace"><h2>No workspace</h2><button className="primary-button" onClick={openRepositoryPicker}>Connect repository</button></div> : !activeFile ? <div className="empty-workspace"><h2>No file open</h2><button className="primary-button" onClick={() => beginTreeCreation("file", currentFolder)}>New note</button></div> : openingFileId === activeFile.id ? <div className="file-opening" role="status"><span className="file-opening-spinner" />Opening note…</div> : activeFile.kind === "markdown" ? <div className="editor-layout">
          <EditorMarkdownDocument
            actions={<EditorSearchButton active={searchOpen} onClick={() => { const view = markdownView.current; if (view) setSearchOpen(toggleEditorSearch(view)); }} />}
            title={<EditorMarkdownTitle path={activeFile.path} title={markdownTitleFor(activeFile.path)} editing={titleEditing} draft={titleDraft} error={titleError} inputRef={titleInputRef} trailing={peers.length > 1 && <div className="live-presence">{peers.length} editing</div>} onStartEditing={enterTitleEdit} onChange={(value) => { setTitleDraft(value); setTitleError(null); }} onCommit={() => void commitTitleRename()} onCancel={() => { titleEditFileIdRef.current = null; setTitleEditing(false); setTitleError(null); }} />}
            outlineItems={editorOutlineEntries(outlineItems)}
            outlineKey={`${activeWorkspace.id}:${activeFile.id}`}
            onOutlineNavigate={(position) => requestAnimationFrame(() => editorNavigate.current?.(position))}
            onBackgroundClick={() => {
              const content = activeEditorSession?.snapshot().content;
              if (content?.type === "text") editorNavigate.current?.(content.text.length);
            }}
          >
            <Suspense fallback={<div className="editor-loading">Opening editor…</div>}><MarkdownCodeEditor key={activeFile.id} documentKey={pkmsDocumentKey(activeWorkspace.id, activeFile.id)} viewStateStorage={getEditorViewStateStorage()} session={activeEditorSession} onNavigateReady={registerEditorNavigator} onViewReady={(view) => { markdownView.current = view; if (!view) setSearchOpen(false); }} onSearchPanelChange={setSearchOpen} onOutlineChange={setOutlineItems} onActivateLink={activateMarkdownLink} resolveImage={resolveMarkdownImage} onSessionError={(cause) => setError(cause instanceof Error ? cause.message : "Could not update PKMS document")} className="markdown-code-editor" ariaLabel="Markdown editor" /></Suspense>
          </EditorMarkdownDocument>
        </div> : <div className="asset-view">
          <div className="asset-heading"><div><h2>{activeFile.path.split("/").at(-1)}</h2><p>{activeFile.size ? `${(activeFile.size / 1024).toFixed(1)} KB` : "Attachment"}</p></div>{assetPreviewUrl && <button className="primary-button" onClick={saveAttachment}>Save</button>}</div>
          {assetPreviewUrl ? assetPreviewType.startsWith("image/") ? <img className="asset-image-preview" src={assetPreviewUrl} alt={activeFile.path} /> : <iframe className="asset-preview-frame" src={assetPreviewUrl} title={activeFile.path} /> : <span className="file-opening-spinner" aria-label="Loading attachment" />}
        </div>}
        {sync.githubStatus === "external-change" && <div className="external-warning"><strong>GitHub branch changed outside PKMS.</strong><span>PKMS paused its commit so it won’t overwrite that change. {sync.message}</span></div>}
      </section>
      <PkmsDialog request={dialogRequest} onClose={closeDialog} />
    </main>
  );
}
