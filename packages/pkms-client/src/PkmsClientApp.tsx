import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from "react";
import * as Y from "yjs";
import type { IndexeddbPersistence } from "y-indexeddb";
import { PKMSRealtimeSocket } from "./realtime";
import { clearEditorDocumentDirty, confirmDirtyEditorDocumentsInPaths, discardEditorViewState, EDITOR_TREE_DRAG_MIME_TYPE, EDITOR_TREE_ROW_HEIGHT, EditorBreadcrumbs, EditorMarkdownEditor, EditorMarkdownTitle, EditorMenuList, EditorProviderError, EditorQuickOpenDialog, editorCodeMirrorHostExtensions, editorDocumentKey, editorMarkdownParserExtensions, editorSupportsOperation, editorSupportsSearch, editorTreeSelectionRoots, markdownTitleFor, nextEditorItemNameInDirectory, projectEditorTreeRows, resolveEditorRelativeLink, resolveEditorTreeDirectory, resolveEditorTreePath, resolveEditorTreeKeyboardAction, resolveMarkdownTitleRenameTarget, setEditorDocumentDirty, useEditorQuickOpenSearch, useEditorTreeSelection, validateTitleInput, type EditorBreadcrumbEntry, type EditorDocumentSession, type EditorItemRef, type EditorMenuItem, type EditorTreeNavigationRow } from "@workspace/editor";
import { createPkmsEditorProvider } from "./features/editor/pkmsEditorProvider";
import { createPkmsLocalEditorSession } from "./features/editor/pkmsLocalEditorSession";
import { createPkmsAssetEditorSession, createPkmsYjsEditorSession, pkmsItemForFile } from "./features/editor/pkmsYjsEditorSession";
import { desktopBridge, type PkmsSyncBridgeStatus } from "./platform/desktopApi";
import { requestPkmsApi } from "./client/api";
import { flushQueuedWorkspaceAssets, flushQueuedWorkspaceOperations, submitWorkspaceOperation, WORKSPACE_OPERATION_QUEUE_EVENT } from "./client/workspaceOperations";
import { useLocation, useNavigate } from "react-router";
import type { FileNavigation, FileRecord, Peer, RealtimeMessage, Repository, SyncStatus, TreeContextMenu, TreeRow, Workspace } from "./domain/types";
import { toBase64, createOperationId } from "./domain/encoding";
import { entryName, flattenTree, mergeFileRecords, parentPath } from "./domain/fileTree";
import { fileLocationPath, parseFileLocation } from "./domain/fileLocation";
import { matchesExcludePattern } from "./domain/excludePattern";
import { PKMS_QUICK_OPEN_EVENT } from "./hostEvents";
import { AppIcon, GitHubIcon } from "./components/Icons";
import { PkmsDialog, type PkmsDialogRequest } from "./components/PkmsDialog";
import { FileTreeList } from "./components/FileTreeList";
import { SyncBridgePanel } from "./components/SyncBridgePanel";
import { useWorkspaceDirectory } from "./features/files/useWorkspaceDirectory";
import { useDocumentSync } from "./features/editor/useDocumentSync";
import { useRealtimeMessages } from "./features/editor/useRealtimeMessages";
import { useAccountSession } from "./features/account/useAccountSession";
import { useWorkspaceFileCreation } from "./features/files/useWorkspaceFileCreation";
import { useWorkspaceFileActions } from "./features/files/useWorkspaceFileActions";
import { useDocumentSession } from "./features/editor/useDocumentSession";

const api = requestPkmsApi;
function getEditorViewStateStorage(): Storage | undefined {
  if (typeof window === "undefined") return undefined;
  try { return window.localStorage; } catch { return undefined; }
}
const pkmsEditorFontStyle = { "--editor-font-size": "13px" } as CSSProperties;

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
function localItemIdForPath(path: string): string {
  const bytes = new TextEncoder().encode(path);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `local-${btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")}`;
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
  const [activeEditorSession, setActiveEditorSession] = useState<EditorDocumentSession | null>(null);
  const [openingFileId, setOpeningFileId] = useState<string | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickQuery, setQuickQuery] = useState("");
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [sync, setSync] = useState<SyncStatus>({ serverRevision: 0, githubStatus: "pending", pendingFiles: 0 });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dialogRequest, setDialogRequest] = useState<PkmsDialogRequest | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const account = useAccountSession({ request: api, setError, setActiveWorkspace });
  const { user, workspaces, loading, deviceFlow, refreshWorkspaces, beginDesktopSignIn } = account;
  const [showRepositories, setShowRepositories] = useState(false);
  const [, setSaving] = useState(false);
  const [, setPeers] = useState<Peer[]>([]);
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
  const [localFolderEnabled, setLocalFolderEnabled] = useState(false);
  const [localCloudSyncing, setLocalCloudSyncing] = useState(false);
  const [localSyncState, setLocalSyncState] = useState<PkmsSyncBridgeStatus["state"]>("disconnected");
  const [localSyncItemStates, setLocalSyncItemStates] = useState<PkmsSyncBridgeStatus["itemStates"]>({});
  const [localSyncExcludedPaths, setLocalSyncExcludedPaths] = useState<string[]>([]);
  const [localCloudTree, setLocalCloudTree] = useState<Array<FileRecord & { upToDate?: boolean }>>([]);
  const [showSyncSettings, setShowSyncSettings] = useState(false);
  const localCloudTreeRevision = useRef(-1);
  const pendingLocalDeletePaths = useRef(new Set<string>());
  const completedLocalDeletePaths = useRef(new Set<string>());
  const confirmedCloudDeletePaths = useRef(new Set<string>());
  const localTreeGeneration = useRef(0);
  const pendingEmptyTreeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    let alive = true;
    setLocalFolderEnabled(false);
    setLocalCloudSyncing(false);
    setLocalSyncState("disconnected");
    setLocalSyncItemStates({});
    setLocalSyncExcludedPaths([]);
    setLocalCloudTree([]);
    localCloudTreeRevision.current = -1;
    setShowSyncSettings(false);
    const desktop = desktopBridge();
    if (!desktop || !activeWorkspace) return () => { alive = false; };
    const refresh = () => void desktop.syncBridgeStatus(activeWorkspace.id).then(async (status) => {
      if (alive) {
        setLocalFolderEnabled(status.enabled);
        setLocalCloudSyncing(status.state === "syncing");
        setLocalSyncState(status.state);
        setLocalSyncItemStates(status.itemStates ?? {});
        setLocalSyncExcludedPaths(status.excludedPaths ?? []);
      }
      const tree = await desktop.syncBridgeTree(activeWorkspace.id, localCloudTreeRevision.current);
      if (!alive || tree.revision === localCloudTreeRevision.current) return;
      localCloudTreeRevision.current = tree.revision;
      if (tree.files) {
        const remotePaths = new Set(tree.files.map((file) => file.path));
        for (const pendingPath of pendingLocalDeletePaths.current) {
          if (!remotePaths.has(pendingPath)) {
            confirmedCloudDeletePaths.current.add(pendingPath);
            if (completedLocalDeletePaths.current.has(pendingPath)) pendingLocalDeletePaths.current.delete(pendingPath);
          }
        }
        setLocalCloudTree(tree.files.map((file) => ({
        id: file.id, path: file.path, kind: file.kind, revision: file.revision,
        ...(file.size !== undefined ? { size: file.size } : {}),
        ...(file.sha ? { sha256: file.sha } : {}),
        ...(file.upToDate !== undefined ? { upToDate: file.upToDate } : {}),
        })));
      }
    }).catch(() => {});
    refresh();
    const timer = setInterval(refresh, 2000);
    return () => { alive = false; clearInterval(timer); };
  }, [activeWorkspace?.id]);
  useEffect(() => {
    const desktop = desktopBridge();
    if (!desktop || !activeWorkspace || !localFolderEnabled) return;
    let alive = true;
    let inFlight = false;
    let refreshAgain = false;
    const generation = ++localTreeGeneration.current;
    const refreshLocalTree = async () => {
      if (inFlight) { refreshAgain = true; return; }
      inFlight = true;
      try {
        const directories = [...new Set(["", ...expandedFolders])];
        const items = new Map<string, FileRecord>();
        // Root is the commit point for a tree snapshot. If it cannot be read,
        // retain the last good tree instead of replacing it with an empty one.
        const rootEntries = await desktop.listLocalDirectory(activeWorkspace.id, "");
        if (!alive || generation !== localTreeGeneration.current) return;
        const isPendingDelete = (path: string) => [...pendingLocalDeletePaths.current].some((root) => path === root || path.startsWith(`${root}/`));
        for (const entry of rootEntries) if (!isPendingDelete(entry.path)) items.set(entry.id, entry);
        const loaded = new Set([""]);
        const children = await Promise.allSettled(directories.slice(1).map((directory) =>
          desktop.listLocalDirectory(activeWorkspace.id, directory).then((entries) => ({ directory, entries })),
        ));
        if (!alive || generation !== localTreeGeneration.current) return;
        for (const result of children) {
          if (result.status !== "fulfilled") continue; // A folder may have been renamed or removed externally.
          loaded.add(result.value.directory);
          for (const entry of result.value.entries) if (!isPendingDelete(entry.path)) items.set(entry.id, entry);
        }
        const localPaths = new Set([...items.values()].map((entry) => entry.path));
        for (const cloudEntry of localCloudTree) {
          if (isPendingDelete(cloudEntry.path)) continue;
          if (!localPaths.has(cloudEntry.path)) items.set(cloudEntry.id, cloudEntry);
        }
        const nextFiles = [...items.values()];
        if (!nextFiles.length && treeFilesRef.current.length) {
          // A transient empty response must not flash "Empty folder" over a
          // populated tree. Confirm it once after the filesystem settles.
          if (pendingEmptyTreeTimer.current) clearTimeout(pendingEmptyTreeTimer.current);
          pendingEmptyTreeTimer.current = setTimeout(() => {
            pendingEmptyTreeTimer.current = null;
            void desktop.listLocalDirectory(activeWorkspace.id, "").then((confirmed) => {
              if (!alive || generation !== localTreeGeneration.current || confirmed.length) return;
              setFiles([]);
              setLoadedFolders(new Set([""]));
            }).catch(() => {});
          }, 350);
          return;
        }
        if (pendingEmptyTreeTimer.current) {
          clearTimeout(pendingEmptyTreeTimer.current);
          pendingEmptyTreeTimer.current = null;
        }
        setFiles(nextFiles);
        setLoadedFolders(loaded);
      } catch {
        // Keep the last successful snapshot on transient filesystem/IPC errors.
      } finally {
        inFlight = false;
        if (refreshAgain && alive && generation === localTreeGeneration.current) {
          refreshAgain = false;
          queueMicrotask(() => void refreshLocalTree());
        }
      }
    };
    void refreshLocalTree();
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = desktop.onLocalTreeChanged((change) => {
      if (change.workspaceId !== activeWorkspace.id) return;
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => { refreshTimer = null; void refreshLocalTree(); }, 60);
    });
    const timer = setInterval(() => void refreshLocalTree(), 30_000);
    return () => {
      alive = false;
      clearInterval(timer);
      unsubscribe();
      if (refreshTimer) clearTimeout(refreshTimer);
      if (generation === localTreeGeneration.current) localTreeGeneration.current++;
      if (pendingEmptyTreeTimer.current) {
        clearTimeout(pendingEmptyTreeTimer.current);
        pendingEmptyTreeTimer.current = null;
      }
    };
  }, [activeWorkspace?.id, expandedFolders, localCloudTree, localFolderEnabled, setFiles, setLoadedFolders]);
  const treeSyncItemStates = useMemo(() => {
    const states: PkmsSyncBridgeStatus["itemStates"] = { ...localSyncItemStates };
    for (const file of localCloudTree) {
      const excluded = localSyncExcludedPaths.some((pattern) => matchesExcludePattern(file.path, pattern));
      if (file.kind === "markdown" && !file.upToDate && !excluded) states[file.path] ??= "pending";
    }
    return states;
  }, [localCloudTree, localSyncExcludedPaths, localSyncItemStates]);
  const treeFilesRef = useRef(files);
  const activeFileStateRef = useRef(activeFile);
  treeFilesRef.current = files;
  activeFileStateRef.current = activeFile;
  const visibleFiles = useMemo(() => files.filter((file) => showIgnoredFiles || (
    !excludedPatterns.split("\n").some((pattern) => matchesExcludePattern(file.path, pattern))
  )), [excludedPatterns, files, showIgnoredFiles]);
  const treeRows = useMemo(() => flattenTree(visibleFiles, expandedFolders), [expandedFolders, visibleFiles]);
  const [treeScrollTop, setTreeScrollTop] = useState(0);
  const [treeViewportHeight, setTreeViewportHeight] = useState(0);
  const treeProjection = useMemo(
    () => projectEditorTreeRows(treeRows, treeScrollTop, treeViewportHeight, EDITOR_TREE_ROW_HEIGHT),
    [treeRows, treeScrollTop, treeViewportHeight],
  );
  const treeSelectionPaths = useMemo(() => treeRows.map((row) => row.file.path), [treeRows]);
  const treeSelection = useEditorTreeSelection(treeSelectionPaths);
  const focusedTreePath = treeSelection.focusedPath;
  const setFocusedTreePath = treeSelection.setFocusedPath;
  const selectedTreePaths = treeSelection.selectedPaths;
  const setSelectedTreePaths = treeSelection.setSelectedPaths;
  const setSelectionAnchorPath = treeSelection.setAnchorPath;
  const [cutTreePaths, setCutTreePaths] = useState<Set<string>>(() => new Set());
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
  const titleCaretPositionRef = useRef<number | null>(null);
  const titleEditFileIdRef = useRef<string | null>(null);
  const editorNavigate = useRef<((position: number) => void) | null>(null);
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
  const rekeyPkmsEditorSession = useCallback((oldKey: string, nextItem: EditorDocumentSession["item"], session: EditorDocumentSession) => {
    const nextKey = editorDocumentKey(nextItem);
    if (oldKey === nextKey) { session.updateItem?.(nextItem); return; }
    pkmsDirtySubscriptions.current.get(oldKey)?.();
    pkmsDirtySubscriptions.current.delete(oldKey);
    clearEditorDocumentDirty(oldKey);
    session.updateItem?.(nextItem);
    pkmsEditorSessions.current.delete(oldKey);
    pkmsEditorSessions.current.set(nextKey, session);
    trackPkmsEditorSession(nextKey, session);
  }, [trackPkmsEditorSession]);
  const openFileRef = useRef<((file: FileRecord, historyAction?: FileNavigation) => Promise<void>) | null>(null);
  const docs = useRef(new Map<string, { doc: Y.Doc; persistence?: IndexeddbPersistence; persistenceOpening?: Promise<void>; updateHandler?: (update: Uint8Array, origin: unknown) => void }>());
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
    const input = titleInputRef.current;
    if (!input) return;
    input.focus();
    const caretPosition = titleCaretPositionRef.current;
    if (caretPosition !== null) {
      const position = Math.max(0, Math.min(caretPosition, input.value.length));
      input.setSelectionRange(position, position);
      titleCaretPositionRef.current = null;
    }
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
    if (fileId.startsWith("local-")) {
      const local = await desktopBridge()?.getLocalFile(activeWorkspace.id, fileId);
      if (signal?.aborted) throw new DOMException("The operation was aborted", "AbortError");
      return local ?? null;
    }
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
      const desktop = desktopBridge();
      if (desktop && (await desktop.syncBridgeStatus(activeWorkspace.id)).enabled) {
        return desktop.listLocalDirectory(activeWorkspace.id, path);
      }
      await refreshDirectory(path, true);
      return getFiles().filter((file) => parentPath(file.path) === path);
    },
    getFile: getPkmsFileById,
    openSession: async (file, signal) => {
      const desktop = desktopBridge();
      if (desktop && file.kind === "markdown") {
        const local = await desktop.syncBridgeStatus(activeWorkspace.id);
        if (local.enabled) {
          if (signal?.aborted) throw new DOMException("The operation was aborted", "AbortError");
          return createPkmsLocalEditorSession(activeWorkspace.id, file);
        }
      }
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
      const desktop = desktopBridge();
      let poll: ReturnType<typeof setInterval> | undefined;
      if (desktop) {
        poll = setInterval(() => {
          void desktop.syncBridgeStatus(activeWorkspace.id).then((status) => {
            if (status.enabled && treeProviderListeners.current.has(listener)) listener([...loadedFolders]);
          }).catch(() => {});
        }, 2000);
      }
      return () => { if (poll) clearInterval(poll); treeProviderListeners.current.delete(listener); };
    },
    listLoadedFiles: getFiles,
    capabilities: { operations: new Set(["createFile", "createDirectory", "rename", "move", "delete"]) },
    operations: {
      async create(parentId, kind, name) {
        const parent = parentId ? await getPkmsFileById(parentId) : null;
        if (parentId && (!parent || parent.kind !== "folder")) throw new EditorProviderError("notFound", "Parent folder no longer exists");
        const parentPathValue = parent?.path ?? "";
        const desktop = desktopBridge();
        if (desktop && (await desktop.syncBridgeStatus(activeWorkspace.id)).enabled) {
          const created = await desktop.createLocalItem(activeWorkspace.id, parentPathValue, kind === "directory" ? "folder" : "markdown", name);
          treeProviderListeners.current.forEach((listener) => listener([parentPathValue]));
          return pkmsItemForFile(activeWorkspace.id, created);
        }
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
        const desktop = desktopBridge();
        if (desktop && file.id.startsWith("local-") && (await desktop.syncBridgeStatus(activeWorkspace.id)).enabled) {
          const renamed = await desktop.renameLocalItem(activeWorkspace.id, file.id, name);
          const oldToNew = new Map<string, FileRecord>();
          const remapped = getFiles().map((entry) => {
            if (entry.path !== file.path && !(file.kind === "folder" && entry.path.startsWith(`${file.path}/`))) return entry;
            const nextPath = renamed.path + entry.path.slice(file.path.length);
            const next = { ...entry, id: localItemIdForPath(nextPath), path: nextPath };
            oldToNew.set(entry.id, next);
            return next;
          });
          for (const [sessionKey, session] of [...pkmsEditorSessions.current]) {
            const nextFile = oldToNew.get(session.item.itemId);
            if (!nextFile) continue;
            const nextItem = pkmsItemForFile(activeWorkspace.id, nextFile);
            rekeyPkmsEditorSession(sessionKey, nextItem, session);
          }
          setFiles(remapped);
          setActiveFile((current) => current ? oldToNew.get(current.id) ?? current : current);
          if (file.kind === "folder") {
            setExpandedFolders((current) => new Set([...current].map((item) => item === file.path || item.startsWith(`${file.path}/`) ? `${renamed.path}${item.slice(file.path.length)}` : item)));
            setCurrentFolder((current) => current === file.path || current.startsWith(`${file.path}/`) ? `${renamed.path}${current.slice(file.path.length)}` : current);
          }
          treeProviderListeners.current.forEach((listener) => listener([parent]));
          return pkmsItemForFile(activeWorkspace.id, renamed);
        }
        if (!await treeOperationsRef.current.rename(file, path)) throw new EditorProviderError("unknown", "Could not rename PKMS item");
        await refreshOpenEditorItemMetadata([file]);
        return pkmsItemForFile(activeWorkspace.id, { ...file, path });
      },
      async move(refs, parentId) {
        const moving = await Promise.all(refs.map((ref) => getPkmsFileById(ref.itemId)));
        if (moving.some((file) => !file)) throw new EditorProviderError("notFound", "A PKMS move source no longer exists");
        const parent = parentId ? await getPkmsFileById(parentId) : null;
        if (parentId && (!parent || parent.kind !== "folder")) throw new EditorProviderError("notFound", "Destination folder no longer exists");
        const desktop = desktopBridge();
        if (desktop && moving.every((file) => file?.id.startsWith("local-")) && (await desktop.syncBridgeStatus(activeWorkspace.id)).enabled) {
          await desktop.moveLocalItems(activeWorkspace.id, moving.map((file) => file!.id), parent?.path ?? "");
          const roots = moving.filter((file): file is FileRecord => file !== null);
          const oldToNew = new Map<string, FileRecord>();
          const remapped = getFiles().map((file) => {
            const root = roots.find((candidate) => candidate.path === file.path || (candidate.kind === "folder" && file.path.startsWith(`${candidate.path}/`)));
            if (!root) return file;
            const suffix = file.path.slice(root.path.length);
            const destination = [parent?.path, entryName(root.path)].filter(Boolean).join("/") + suffix;
            const next = { ...file, id: localItemIdForPath(destination), path: destination };
            oldToNew.set(file.id, next);
            return next;
          });
          const remappedById = new Map(remapped.map((file) => [file.id, file]));
          for (const [sessionKey, session] of [...pkmsEditorSessions.current]) {
            const old = roots.find((root) => session.item.itemId === root.id || (root.kind === "folder" && session.item.path.startsWith(`${root.path}/`)));
            if (!old) continue;
            const suffix = session.item.path.slice(old.path.length);
            const nextPath = [parent?.path ?? "", entryName(old.path)].filter(Boolean).join("/") + suffix;
            const nextId = localItemIdForPath(nextPath);
            const nextFile = remappedById.get(nextId) ?? { ...old, id: nextId, path: nextPath };
            const nextItem = pkmsItemForFile(activeWorkspace.id, nextFile);
            rekeyPkmsEditorSession(sessionKey, nextItem, session);
          }
          setFiles(remapped);
          setActiveFile((current) => current ? oldToNew.get(current.id) ?? current : current);
          setExpandedFolders((current) => new Set([...current].map((currentPath) => {
            const root = roots.find((candidate) => candidate.kind === "folder" && (currentPath === candidate.path || currentPath.startsWith(`${candidate.path}/`)));
            return root ? [parent?.path, entryName(root.path)].filter(Boolean).join("/") + currentPath.slice(root.path.length) : currentPath;
          })));
          setCurrentFolder((current) => {
            const root = roots.find((candidate) => candidate.kind === "folder" && (current === candidate.path || current.startsWith(`${candidate.path}/`)));
            return root ? [parent?.path, entryName(root.path)].filter(Boolean).join("/") + current.slice(root.path.length) : current;
          });
          treeProviderListeners.current.forEach((listener) => listener(["", parent?.path ?? ""]));
          return;
        }
        if (!await treeOperationsRef.current.move(moving.filter((file): file is FileRecord => file !== null), parent?.path ?? "")) {
          throw new EditorProviderError("unknown", "Could not move PKMS items");
        }
        await refreshOpenEditorItemMetadata(moving.filter((file): file is FileRecord => file !== null));
      },
      async delete(refs) {
        const deleting = await Promise.all(refs.map((ref) => getPkmsFileById(ref.itemId)));
        if (deleting.some((file) => !file)) throw new EditorProviderError("notFound", "A PKMS delete target no longer exists");
        const targets = deleting.filter((file): file is FileRecord => file !== null);
        const desktop = desktopBridge();
        if (desktop && targets.every((file) => file.id.startsWith("local-")) && (await desktop.syncBridgeStatus(activeWorkspace.id)).enabled) {
          const roots = editorTreeSelectionRoots(targets, new Set(targets.map((file) => file.path)), (file) => file.kind === "folder");
          const message = roots.length === 1 ? `Delete ${entryName(roots[0].path)}?` : `Delete ${roots.length} selected items?`;
          if (!await confirm(message)) {
            console.info("[pkms-delete] cancelled", { workspaceId: activeWorkspace.id, paths: roots.map((file) => file.path) });
            return;
          }
          if (!confirmDirtyEditorDocumentsInPaths(roots.map((root) => root.path), (dirtyMessage) => window.confirm(dirtyMessage))) return;
          const paths = roots.map((file) => parentPath(file.path));
          const previousFiles = getFiles();
          for (const root of roots) pendingLocalDeletePaths.current.add(root.path);
          const isInsideDeleted = (path: string) => roots.some((root) => path === root.path || (root.kind === "folder" && path.startsWith(`${root.path}/`)));
          // Hide the selected roots immediately. Filesystem and cloud work can take longer.
          setFiles((current) => current.filter((file) => !isInsideDeleted(file.path)));
          setExpandedFolders((current) => new Set([...current].filter((path) => !isInsideDeleted(path))));
          setLoadedFolders((current) => new Set([...current].filter((path) => !isInsideDeleted(path))));
          treeProviderListeners.current.forEach((listener) => listener(paths));
          console.info("[pkms-delete] started", { workspaceId: activeWorkspace.id, paths: roots.map((file) => file.path) });
          try {
            // Remove the cloud manifest entry first; otherwise the next sync pass recreates the local folder.
            for (const root of roots) {
              const remote = localCloudTree.find((entry) => entry.path === root.path && entry.kind === root.kind);
              if (remote) {
                const result = await submitWorkspaceOperation(api, activeWorkspace, { type: "delete", fileId: remote.id, ...(remote.kind === "markdown" ? { expectedRevision: remote.revision } : { protectSubtree: true }) }, `desktop-${createOperationId()}`);
                if (!result.queued) confirmedCloudDeletePaths.current.add(root.path);
              } else confirmedCloudDeletePaths.current.add(root.path);
            }
            await desktop.deleteLocalItems(activeWorkspace.id, roots.map((file) => file.id));
            for (const root of roots) {
              completedLocalDeletePaths.current.add(root.path);
              if (confirmedCloudDeletePaths.current.has(root.path)) pendingLocalDeletePaths.current.delete(root.path);
            }
          } catch (cause) {
            for (const root of roots) {
              pendingLocalDeletePaths.current.delete(root.path);
              completedLocalDeletePaths.current.delete(root.path);
              confirmedCloudDeletePaths.current.delete(root.path);
            }
            setFiles(previousFiles);
            treeProviderListeners.current.forEach((listener) => listener(paths));
            console.error("[pkms-delete] failed", { workspaceId: activeWorkspace.id, paths: roots.map((file) => file.path), error: cause instanceof Error ? cause.message : String(cause) });
            setError(cause instanceof Error ? `Could not delete item: ${cause.message}` : "Could not delete item");
            throw new EditorProviderError("unknown", cause instanceof Error ? cause.message : "Could not delete PKMS items");
          }
          console.info("[pkms-delete] completed", { workspaceId: activeWorkspace.id, paths: roots.map((file) => file.path) });
          const removed = (file: FileRecord) => isInsideDeleted(file.path);
          const deletedIds = new Set(getFiles().filter(removed).map((file) => file.id));
          for (const [sessionKey, session] of [...pkmsEditorSessions.current]) {
            if (!deleting.some((root) => root && (session.item.path === root.path || (root.kind === "folder" && session.item.path.startsWith(`${root.path}/`)))) && !deletedIds.has(session.item.itemId)) continue;
            deletedIds.add(session.item.itemId);
            closePkmsEditorSession(sessionKey, session);
          }
          setFiles((current) => current.filter((file) => !removed(file)));
          setActiveFile((current) => current && removed(current) ? null : current);
          setActiveEditorSession((current) => current && roots.some((root) => current.item.path === root.path || (root.kind === "folder" && current.item.path.startsWith(`${root.path}/`))) ? null : current);
          treeProviderListeners.current.forEach((listener) => listener(paths));
          return;
        }
        await treeOperationsRef.current.delete(deleting.filter((file): file is FileRecord => file !== null));
      },
    },
  }) : null, [activeWorkspace, confirm, localCloudTree, getPkmsFileById, getFiles, loadedFolders, rekeyPkmsEditorSession, refreshDirectory, refreshOpenEditorItemMetadata]);
  const canCreateFile = editorSupportsOperation(editorProvider, "createFile");
  const canCreateDirectory = editorSupportsOperation(editorProvider, "createDirectory");
  const canRename = editorSupportsOperation(editorProvider, "rename");
  const canDelete = editorSupportsOperation(editorProvider, "delete");
  const canMove = Boolean(editorProvider?.capabilities.dragMove && editorSupportsOperation(editorProvider, "move"));
  const canMultiSelect = Boolean(editorProvider?.capabilities.multiSelect);
  const selectTreeRow = (path: string, index: number, additive = false, range = false) =>
    treeSelection.selectRow(path, index, canMultiSelect && additive, canMultiSelect && range);
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
    const sourceFileId = file.id;
    const previousSession = activeEditorSession;
    if (previousSession && previousSession.item.path !== file.path) {
      const previousKey = editorDocumentKey(previousSession.item);
      try {
        if (previousSession.snapshot().savePhase !== "clean") await previousSession.save({ flushSync: true });
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not save the current PKMS document");
        if (editorSessionOpenController.current === controller) editorSessionOpenController.current = null;
        return;
      }
      closePkmsEditorSession(previousKey, previousSession);
      setActiveEditorSession(null);
    }
    if (activeWorkspace && file.kind === "markdown" && !file.id.startsWith("local-")) {
      const desktop = desktopBridge();
      if (desktop) {
        try {
          const bridge = await desktop.syncBridgeStatus(activeWorkspace.id);
          if (bridge.enabled) {
            let localFile = (await desktop.listLocalDirectory(activeWorkspace.id, parentPath(file.path)))
              .find((entry) => entry.path === file.path && entry.kind === "markdown");
            let currentBridge = bridge;
            for (let attempt = 0; !localFile && currentBridge.state === "syncing" && attempt < 60; attempt++) {
              await new Promise((resolve) => setTimeout(resolve, 500));
              currentBridge = await desktop.syncBridgeStatus(activeWorkspace.id);
              localFile = (await desktop.listLocalDirectory(activeWorkspace.id, parentPath(file.path)))
                .find((entry) => entry.path === file.path && entry.kind === "markdown");
            }
            const cloudKey = pkmsDocumentKey(activeWorkspace.id, sourceFileId);
            const cloudSession = pkmsEditorSessions.current.get(cloudKey);
            if (cloudSession && cloudSession.snapshot().savePhase !== "clean") {
              await cloudSession.save({ flushSync: false });
              await desktop.scanSyncBridge(activeWorkspace.id);
              let synced = await desktop.syncBridgeStatus(activeWorkspace.id);
              for (let attempt = 0; synced.state === "syncing" && attempt < 60; attempt++) {
                await new Promise((resolve) => setTimeout(resolve, 500));
                synced = await desktop.syncBridgeStatus(activeWorkspace.id);
              }
              if (synced.state !== "synced") throw new Error("Cloud changes are still syncing. Reopen this note after folder sync finishes.");
              localFile = (await desktop.listLocalDirectory(activeWorkspace.id, parentPath(file.path)))
                .find((entry) => entry.path === file.path && entry.kind === "markdown");
            }
            if (!localFile) throw new Error("This note is not available in the connected local folder yet. Wait for folder sync or check its exclude paths.");
            if (cloudSession) {
              closePkmsEditorSession(cloudKey, cloudSession);
              if (activeEditorSession === cloudSession) setActiveEditorSession(null);
            }
            file = localFile;
          }
        } catch (cause) {
          if (controller.signal.aborted) return;
          setError(cause instanceof Error ? cause.message : "Could not switch this note to the connected local folder.");
          if (editorSessionOpenController.current === controller) editorSessionOpenController.current = null;
          return;
        }
      }
    }
    const isLocalFile = file.id.startsWith("local-");
    if (isLocalFile && activeWorkspace) {
      const target = fileLocationPath(activeWorkspace.id, file.path);
      if (historyAction !== "none" && location.pathname !== target) {
        routedPath.current = target;
        navigate(target, { replace: historyAction === "replace", preventScrollReset: true });
      }
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
      setSaving(false);
      setError("");
      activeRef.current = { file, documentKey: editorDocumentKey({ providerId: `pkms:${activeWorkspace.id}`, itemId: file.id }), doc: null, text: null };
    }
    if (editorProvider && file.kind === "markdown") {
      const sessionKey = editorDocumentKey({ providerId: editorProvider.id, itemId: file.id });
      const existingSession = pkmsEditorSessions.current.get(sessionKey);
      if (existingSession) {
        if (!isLocalFile) await openDocumentSession(file, historyAction, controller.signal);
        else { setActiveFile(file); setOpeningFileId(null); }
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
          if (isLocalFile) setOpeningFileId(null);
        } catch (cause) {
          if (controller.signal.aborted) return;
          if (isLocalFile) setOpeningFileId(null);
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
  }, [activeEditorSession, activeWorkspace, closePkmsEditorSession, editorProvider, location.pathname, navigate, openDocumentSession, setCurrentFolder, setExpandedFolders, setError, trackPkmsEditorSession]);
  useEffect(() => {
    const desktop = desktopBridge();
    const current = activeFile;
    const workspaceId = activeWorkspace?.id;
    if (!desktop || !workspaceId || !localFolderEnabled || !current || current.kind !== "markdown" || current.id.startsWith("local-")) return;
    let alive = true;
    void desktop.listLocalDirectory(workspaceId, parentPath(current.path)).then(async (entries) => {
      if (!alive || activeFileStateRef.current?.id !== current.id) return;
      const localFile = entries.find((entry) => entry.path === current.path && entry.kind === "markdown");
      if (!localFile) return;
      for (const [sessionKey, session] of [...pkmsEditorSessions.current]) {
        if (session.item.itemId === current.id) closePkmsEditorSession(sessionKey, session);
      }
      setActiveEditorSession(null);
      setActiveFile(localFile);
      await openFile(localFile, "none");
    }).catch(() => {});
    return () => { alive = false; };
  }, [activeFile, activeWorkspace?.id, closePkmsEditorSession, files, localFolderEnabled, openFile]);
  openFileRef.current = openFile;
  const loadEditorBreadcrumbChildren = useCallback(async (directoryPath: string): Promise<EditorBreadcrumbEntry[]> => {
    if (!editorProvider) return [];
    const parent = await resolveEditorTreeDirectory(editorProvider, directoryPath);
    const children = await editorProvider.listChildren(parent?.itemId ?? null);
    return children.map((item) => ({
      name: item.name,
      path: item.path,
      kind: item.kind === "directory" ? "directory" : item.kind === "asset" ? "viewer" : item.kind,
    }));
  }, [editorProvider]);
  const openEditorBreadcrumbFile = useCallback((path: string) => {
    void (async () => {
      if (!editorProvider) return;
      const item = await resolveEditorTreePath(editorProvider, path);
      if (!item || item.kind === "directory") return;
      const file = await getPkmsFileById(item.itemId);
      if (!file) {
        setError(`Could not find file: ${path}`);
        return;
      }
      void openFileRef.current?.(file);
    })().catch((cause) => setError(cause instanceof Error ? cause.message : "Could not open PKMS file"));
  }, [editorProvider, getPkmsFileById, setError]);
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
    localFolderEnabled,
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
          if (!detail.hasPending && !localFolderEnabled) {
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
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "p" && activeWorkspace && editorSupportsSearch(editorProvider, "names")) {
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
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && (event.key === "\\" || event.code === "Backslash")) {
        event.preventDefault();
        event.stopImmediatePropagation();
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
  }, [activeWorkspace, editorProvider, localFolderEnabled, saveActiveFileNow, setError]);

  useEffect(() => {
    const openQuickOpen = () => {
      setQuickQuery("");
      setQuickOpen(true);
    };
    window.addEventListener(PKMS_QUICK_OPEN_EVENT, openQuickOpen);
    return () => window.removeEventListener(PKMS_QUICK_OPEN_EVENT, openQuickOpen);
  }, []);

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
        const activeFileId = activeRef.current.file?.id;
        ws.send(JSON.stringify({ type: "hello", protocolVersion: 1, clientId, afterRevision: workspaceRef.current?.revision ?? activeWorkspace.revision, user: userRef.current, fileId: activeFileId?.startsWith("local-") ? undefined : activeFileId }));
        void flushQueuedWorkspaceOperations(activeWorkspace.id, api)
          .then((queueDrained) => queueDrained ? flushQueuedWorkspaceAssets(activeWorkspace.id, api) : false)
          .then((queueDrained) => {
            if (!queueDrained || !alive || socket.current !== ws || ws.readyState !== WebSocket.OPEN) return;
            const current = activeRef.current;
            if (!current.file || current.file.id.startsWith("local-") || !current.doc) return;
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
      treeSelection.clear(); setCutTreePaths(new Set());
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
          if (!localFolderEnabled && loadedFolders.has(prefix)) continue;
          const desktop = desktopBridge();
          const entries = localFolderEnabled && desktop
            ? await desktop.listLocalDirectory(workspace.id, prefix)
            : (await api<{ files: FileRecord[] }>(`/api/workspaces/${workspace.id}/directory?path=${encodeURIComponent(prefix)}`)).files;
          records = mergeFileRecords(records, entries);
          setFiles((current) => mergeFileRecords(current, entries));
          setLoadedFolders((current) => new Set(current).add(prefix));
        }
        if (routedPath.current !== location.pathname) return;
        let target = records.find((file) => file.path === fileLocation.path && file.kind !== "folder");
        if (!target) {
          if (localFolderEnabled && localCloudSyncing) { routedPath.current = null; return; }
          // Cached tree state may lag a title rename or an external move. Read
          // the exact parent once before treating a missing cached row as a
          // deleted file; otherwise an old cache ejects the editor to Home.
          const directory = parentPath(fileLocation.path);
          const desktop = desktopBridge();
          const entries = localFolderEnabled && desktop
            ? await desktop.listLocalDirectory(workspace.id, directory)
            : (await api<{ files: FileRecord[] }>(`/api/workspaces/${workspace.id}/directory${directory ? `?path=${encodeURIComponent(directory)}` : ""}`)).files;
          if (routedPath.current !== location.pathname) return;
          records = mergeFileRecords(records, entries);
          setFiles((current) => mergeFileRecords(current, entries));
          setLoadedFolders((current) => new Set(current).add(directory));
          target = records.find((file) => file.path === fileLocation.path && file.kind !== "folder");
          if (!target) {
            setError(`File not found in this repository: ${fileLocation.path}`);
            routedPath.current = null;
            return;
          }
        }
        if (activeRef.current.file?.id !== target.id) await openFileRef.current?.(target, "none");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not open file from URL");
        // Keep the route and existing editor state visible when a refresh
        // fails. A transient network/cache error should not discard the tab.
        routedPath.current = null;
      }
    })();
  }, [activeWorkspace?.id, api, fileLocation?.path, fileLocation?.workspaceId, files, loadedFolders, loading, localCloudSyncing, localFolderEnabled, location.pathname, navigate, treeSelection.clear, user, workspaces]);

  const toggleFolder = async (file: FileRecord) => {
    if (!activeWorkspace || !editorProvider) return;
    setCurrentFolder(file.path);
    setFocusedTreePath(file.path);
    await toggleDirectory(file, () => editorProvider.listChildren(file.id));
  };

  const chooseWorkspace = (workspace: Workspace) => {
    setActiveEditorSession(null); setActiveWorkspace(workspace); clearActiveFile(); setFiles([]); setLoadingFolder(true); setLoadingFolderPaths(new Set()); setCurrentFolder(""); setExpandedFolders(new Set([""])); setLoadedFolders(new Set());
    treeSelection.clear(); setCutTreePaths(new Set());
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
      treeSelection.clear(); setCutTreePaths(new Set());
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
      const { parent, name } = await nextEditorItemNameInDirectory(provider, parentPath, "untitled", ".md");
      if (!editorSupportsOperation(provider, "createFile")) throw new EditorProviderError("unsupported", "PKMS note creation is unavailable");
      const item = await provider.create!(parent?.itemId ?? null, "file", name);
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
      const parent = await resolveEditorTreeDirectory(provider, parentPath, "Parent folder no longer exists");
      if (!editorSupportsOperation(provider, "createDirectory")) throw new EditorProviderError("unsupported", "PKMS folder creation is unavailable");
      await provider.create!(parent?.itemId ?? null, "directory", name);
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
    if (canMove && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "x") {
      event.preventDefault();
      setCutTreePaths(new Set(editorTreeSelectionRoots(commandFiles, new Set(commandFiles.map((file) => file.path)), (file) => file.kind === "folder").map((file) => file.path)));
      return;
    }
    if (canMove && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "v" && cutTreePaths.size) {
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
      if (canDelete && commandFiles.length) { event.preventDefault(); void deleteThroughEditorProvider(commandFiles); }
      return;
    }
    if (keyAction?.type === "rename" && row && selectedTreePaths.size === 1) {
      if (!canRename) return;
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

  const { items: quickOpenMatches, loading: quickOpenLoading, error: quickOpenError } = useEditorQuickOpenSearch({ provider: editorProvider, query: quickQuery, enabled: quickOpen, errorMessage: "Could not search PKMS files" });
  const quickOpenResults = useMemo(() => {
    const byId = new Map(visibleFiles.map((file) => [file.id, file]));
    return quickOpenMatches.map((item) => byId.get(item.itemId)).filter((file): file is FileRecord => Boolean(file)).slice(0, 30);
  }, [quickOpenMatches, visibleFiles]);
  const quickOpenItems = useMemo(() => quickOpenResults.map((file) => ({ id: file.id, label: entryName(file.path), description: file.path })), [quickOpenResults]);
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

  const { updateFilePath, moveTreeItems, deleteTreeItems, openTreeItem } = useWorkspaceFileActions({
    workspace: activeWorkspace, activeFile, currentFolder, files, expandedFolders,
    api, navigate, routedPath, clearActiveFile, openFile, toggleFolder, setFiles, setActiveFile, setCurrentFolder, setExpandedFolders,
    setLoadedFolders, setSelectedTreePaths, setCutTreePaths, setFocusedTreePath, setTreeContextMenu, setError, setNotice, confirm,
    beforeDelete: (roots) => confirmDirtyEditorDocumentsInPaths(roots.map((root) => root.path), (message) => window.confirm(message)),
    afterDelete: (roots) => {
      const deletedIds = new Set<string>();
      for (const [sessionKey, session] of [...pkmsEditorSessions.current]) {
        if (!roots.some((root) => session.item.path === root.path || (root.kind === "folder" && session.item.path.startsWith(`${root.path}/`)))) continue;
        deletedIds.add(session.item.itemId);
        discardEditorViewState(sessionKey);
        closePkmsEditorSession(sessionKey, session);
      }
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
    if (!editorSupportsOperation(editorProvider, "move") || !editorProvider?.move) throw new EditorProviderError("unsupported", "Moving is not supported by this provider");
    const parent = await resolveEditorTreeDirectory(editorProvider, destination, "Destination folder no longer exists");
    await editorProvider.move(items.map((file) => ({ providerId: editorProvider.id, itemId: file.id })), parent?.itemId ?? null);
  };
  const deleteThroughEditorProvider = async (items: FileRecord[]) => {
    if (!editorSupportsOperation(editorProvider, "delete") || !editorProvider?.delete) throw new EditorProviderError("unsupported", "Deletion is not supported by this provider");
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
    if (!editorSupportsOperation(editorProvider, "rename") || !editorProvider?.rename) throw new EditorProviderError("unsupported", "Renaming is not supported by this provider");
    await editorProvider.rename({ providerId: editorProvider.id, itemId: file.id }, name);
  };
  const renameActiveFileThroughEditorProvider = async () => {
    if (!activeFile) return;
    const currentName = entryName(activeFile.path);
    const name = await requestName("Rename", currentName);
    if (!name?.trim() || name.trim() === currentName) return;
    await renameThroughEditorProvider(activeFile, name.trim());
  };
  const enterTitleEdit = (caretPosition: number) => {
    if (!activeFile || activeFile.kind !== "markdown") return;
    titleCaretPositionRef.current = caretPosition;
    titleEditFileIdRef.current = activeFile.id;
    setTitleDraft(markdownTitleFor(activeFile.path));
    setTitleError(null);
    setTitleEditing(true);
  };
  const commitTitleRename = async () => {
    const file = activeFile;
    if (!file || titleEditFileIdRef.current !== file.id || !editorSupportsOperation(editorProvider, "rename") || !editorProvider?.rename) return;
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
      if (!editorSupportsOperation(editorProvider, "rename") || !editorProvider.rename || !target.currentItem) throw new Error("Renaming is not supported by this provider");
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
          <div className="file-toolbar"><div className="file-toolbar-heading"><span className="eyebrow">Files</span><button type="button" className="sync-compact-state" onClick={() => setShowSyncSettings(true)} aria-label="Open sync settings" title="Open sync settings"><span className={`sync-bridge-indicator sync-bridge-indicator--${localSyncState}`} />{!desktopBridge() ? "GitHub backup" : !localFolderEnabled ? "Connect folder" : localSyncState === "syncing" ? "Syncing" : localSyncState === "offline" ? "Offline" : localSyncState === "error" ? "Needs attention" : "Up to date"}</button></div><div className="toolbar-actions">
            <button className={`mini-button visibility-button${showFileFilters ? " active" : ""}`} title="File filter settings" aria-label="File filter settings" aria-expanded={showFileFilters} onClick={() => setShowFileFilters((open) => !open)}><AppIcon name="filter" /></button>
            {canCreateFile && <button className="mini-button" title="New note" onClick={() => beginTreeCreation("file", toolbarCreationFolder)}><AppIcon name="filePlus" /></button>}
            {canCreateDirectory && <button className="mini-button" title="New folder" onClick={() => beginTreeCreation("folder", toolbarCreationFolder)}><AppIcon name="folderPlus" /></button>}
            <label className="mini-button upload-button" title="Upload file"><AppIcon name="upload" /><input type="file" onChange={(event) => { void uploadFile(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>
            {canRename && activeFile && <button className="mini-button" title="Rename" onClick={() => void renameActiveFileThroughEditorProvider()}><AppIcon name="pencil" /></button>}
            {canDelete && (selectedTreePaths.size > 0 || activeFile) && <button className="mini-button" title={selectedTreePaths.size > 0 ? "Delete selected items" : "Delete open file"} aria-label={selectedTreePaths.size > 0 ? "Delete selected items" : "Delete open file"} onClick={() => selectedTreePaths.size > 0 ? void deleteThroughEditorProvider(treeRows.filter((row) => selectedTreePaths.has(row.file.path)).map((row) => row.file)) : deleteActiveFileThroughEditorProvider()}><AppIcon name="trash" /></button>}
            {canRename && !activeFile && currentFolder && <button className="mini-button" title="Rename folder" onClick={() => void renameCurrentFolderThroughEditorProvider()}><AppIcon name="pencil" /></button>}
            {canDelete && !activeFile && currentFolder && <button className="mini-button" title="Delete folder" onClick={deleteCurrentFolderThroughEditorProvider}><AppIcon name="trash" /></button>}
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
            syncItemStates={treeSyncItemStates}
            cutPaths={cutTreePaths}
            dropTarget={treeDropTarget}
            loadingFolders={loadingFolderPaths}
            busy={loadingFolder || loadingFolderPaths.size > 0}
            loading={loadingFolder}
            canMove={canMove}
            canMultiSelect={canMultiSelect}
            onKeyDown={handleTreeKeyDown}
            onScroll={persistTreeScroll}
            onSetDropTarget={setTreeDropTarget}
            onDropItems={(paths, destination) => void moveThroughEditorProvider(files.filter((file) => paths.includes(file.path)), destination)}
            onFocusPath={setFocusedTreePath}
            onDragStart={canMove ? (file, index, event) => {
              const selected = selectedTreePaths.has(file.path) ? treeRows.filter((row) => selectedTreePaths.has(row.file.path)).map((row) => row.file) : [file];
              const roots = editorTreeSelectionRoots(selected, new Set(selected.map((entry) => entry.path)), (entry) => entry.kind === "folder");
              event.dataTransfer.setData(EDITOR_TREE_DRAG_MIME_TYPE, JSON.stringify(roots.map((entry) => entry.path)));
              event.dataTransfer.effectAllowed = "move";
              if (!selectedTreePaths.has(file.path)) selectTreeRow(file.path, index);
            } : undefined}
            onContextMenu={(file, event) => {
              setFocusedTreePath(file.path);
              if (!selectedTreePaths.has(file.path)) { setSelectedTreePaths(new Set([file.path])); setSelectionAnchorPath(file.path); }
              const menuHeight = file.kind === "folder" ? 240 : 136;
              setTreeContextMenu({ file, x: Math.max(8, Math.min(event.clientX, window.innerWidth - 196)), y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8)) });
            }}
            onSelectRow={selectTreeRow}
            onClearSelection={treeSelection.clear}
            onActivate={(file) => { if (file.kind === "folder") void toggleFolder(file); else void openFile(file); }}
          />
          {treeContextMenu && (() => {
            const file = treeContextMenu.file;
            const canMoveSelection = contextMoveRoots.some((item) => item.path !== file.path && parentPath(item.path) !== file.path && !(item.kind === "folder" && file.path.startsWith(`${item.path}/`)));
            const menuItems: EditorMenuItem[] = [
              { type: "item", id: "open", label: file.kind === "folder" ? "Open folder" : "Open", onSelect: () => void openTreeItem(file) },
              ...(file.kind === "folder" ? [
                ...(canCreateFile ? [{ type: "item" as const, id: "new-note", label: "New note", onSelect: () => beginTreeCreation("file", file.path) }] : []),
                ...(canCreateDirectory ? [{ type: "item" as const, id: "new-folder", label: "New folder", onSelect: () => beginTreeCreation("folder", file.path) }] : []),
                ...(canMove && cutMoveRoots.length ? [{ type: "item" as const, id: "paste", label: "Paste into folder", onSelect: () => void moveThroughEditorProvider(cutMoveRoots, file.path) }] : []),
                ...(canMove && canMoveSelection ? [{ type: "item" as const, id: "move-selection", label: "Move selection here", onSelect: () => void moveThroughEditorProvider(contextMoveRoots, file.path) }] : []),
              ] : []),
              ...(canMove ? [{ type: "item" as const, id: "cut", label: "Cut", onSelect: () => setCutTreePaths(new Set(contextMoveRoots.map((item) => item.path))) }] : []),
              ...(canRename ? [{ type: "item" as const, id: "rename", label: "Rename", onSelect: () => beginTreeRename(file) }] : []),
              ...(canDelete ? [{ type: "item" as const, id: "delete", label: "Delete", danger: true, onSelect: () => void deleteThroughEditorProvider(selectedTreePaths.has(file.path) ? treeRows.filter((row) => selectedTreePaths.has(row.file.path)).map((row) => row.file) : [file]) }] : []),
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
        {showSyncSettings && activeWorkspace && <div className="sync-settings-surface" role="dialog" aria-modal="true" aria-label="Sync settings" onKeyDown={(event) => { if (event.key === "Escape") setShowSyncSettings(false); }}>
          <SyncBridgePanel workspaceId={activeWorkspace.id} githubStatus={sync.githubStatus} githubLastCommitAt={sync.lastGitHubCommitAt} githubPendingFiles={sync.pendingFiles} githubMessage={sync.message} onClose={() => setShowSyncSettings(false)} onResumeGithubBackup={async () => { const status = await api<SyncStatus>(`/api/workspaces/${activeWorkspace.id}/flush`, { method: "POST" }); setSync(status); return status; }} />
        </div>}
      </aside>

      <section className="main-panel">
        {notice && <div className="notice sync-notice" role="status" aria-live="polite">{notice}</div>}
        {error && <button className="notice error dismissible" onClick={() => setError("")}>{error}<AppIcon name="close" /></button>}
        {showRepositories && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowRepositories(false); }}><section className="repository-modal">
          <button className="modal-close" onClick={() => setShowRepositories(false)} aria-label="Close"><AppIcon name="close" /></button><span className="eyebrow">GitHub</span><h2>Choose a repository</h2>
          <div className="repository-list">{repositories.map((repository) => <button key={repository.fullName} className="repository-option" onClick={() => void connectRepository(repository)}><span className="repo-icon"><AppIcon name={repository.private ? "lock" : "folder"} /></span><span><strong>{repository.fullName}</strong><small>{repository.defaultBranch} · {repository.private ? "Private" : "Public"}</small></span><span className="option-arrow"><AppIcon name="arrowRight" /></span></button>)}{!repositories.length && <p className="empty-hint">No writable repositories found.</p>}</div>
        </section></div>}
        {quickOpen && editorSupportsSearch(editorProvider, "names") && <EditorQuickOpenDialog
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
        {activeFile?.kind === "markdown" && <EditorBreadcrumbs path={activeFile.path} onLoadChildren={loadEditorBreadcrumbChildren} onOpenFile={openEditorBreadcrumbFile} />}
        {!activeWorkspace ? <div className="empty-workspace"><h2>No workspace</h2><button className="primary-button" onClick={openRepositoryPicker}>Connect repository</button></div> : !activeFile ? <div className="empty-workspace"><h2>No file open</h2><button className="primary-button" onClick={() => beginTreeCreation("file", currentFolder)}>New note</button></div> : openingFileId === activeFile.id ? <div className="file-opening" role="status"><span className="file-opening-spinner" />Opening note…</div> : activeFile.kind === "markdown" ? <EditorMarkdownEditor
            title={<EditorMarkdownTitle path={activeFile.path} title={markdownTitleFor(activeFile.path)} editing={titleEditing} draft={titleDraft} error={titleError} inputRef={titleInputRef} onStartEditing={canRename ? enterTitleEdit : undefined} onChange={(value) => { setTitleDraft(value); setTitleError(null); }} onCommit={() => void commitTitleRename()} onCancel={() => { titleEditFileIdRef.current = null; setTitleEditing(false); setTitleError(null); }} />}
            onBackgroundClick={() => {
              const content = activeEditorSession?.snapshot().content;
              if (content?.type === "text") editorNavigate.current?.(content.text.length);
            }}
            surfaceKey={activeFile.id}
            surfaceContainerClassName="md-editor"
            surfaceContainerStyle={pkmsEditorFontStyle}
            surfaceProps={{ documentKey: pkmsDocumentKey(activeWorkspace.id, activeFile.id), viewStateStorage: getEditorViewStateStorage(), session: activeEditorSession, documentPath: activeFile.path, parserExtensions: editorMarkdownParserExtensions, extensions: editorCodeMirrorHostExtensions, onNavigateReady: registerEditorNavigator, onActivateLink: activateMarkdownLink, resolveImage: resolveMarkdownImage, onSessionError: (cause) => setError(cause instanceof Error ? cause.message : "Could not update PKMS document"), ariaLabel: "Markdown editor" }}
          /> : <div className="asset-view">
          <div className="asset-heading"><div><h2>{activeFile.path.split("/").at(-1)}</h2><p>{activeFile.size ? `${(activeFile.size / 1024).toFixed(1)} KB` : "Attachment"}</p></div>{assetPreviewUrl && <button className="primary-button" onClick={saveAttachment}>Save</button>}</div>
          {assetPreviewUrl ? assetPreviewType.startsWith("image/") ? <img className="asset-image-preview" src={assetPreviewUrl} alt={activeFile.path} /> : <iframe className="asset-preview-frame" src={assetPreviewUrl} title={activeFile.path} /> : <span className="file-opening-spinner" aria-label="Loading attachment" />}
        </div>}
        {sync.githubStatus === "external-change" && <div className="external-warning"><strong>GitHub branch changed outside PKMS.</strong><span>PKMS paused its commit so it won’t overwrite that change. {sync.message}</span></div>}
      </section>
      <PkmsDialog request={dialogRequest} onClose={closeDialog} />
    </main>
  );
}
