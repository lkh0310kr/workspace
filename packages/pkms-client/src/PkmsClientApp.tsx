import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import * as Y from "yjs";
import type { IndexeddbPersistence } from "y-indexeddb";
import { PKMSRealtimeSocket } from "./realtime";
import { desktopBridge } from "./platform/desktopApi";
import { requestPkmsApi } from "./client/api";
import { flushQueuedWorkspaceAssets, flushQueuedWorkspaceOperations, WORKSPACE_OPERATION_QUEUE_EVENT } from "./client/workspaceOperations";
import { useLocation, useNavigate } from "react-router";
import type { FileNavigation, FileRecord, Peer, RealtimeMessage, Repository, SyncStatus, TreeContextMenu, TreeRow, Workspace } from "./domain/types";
import { toBase64, createOperationId } from "./domain/encoding";
import { entryName, flattenTree, mergeFileRecords, parentPath, treeSelectionRoots } from "./domain/fileTree";
import { fileLocationPath, parseFileLocation } from "./domain/fileLocation";
import { matchesExcludePattern } from "./domain/excludePattern";
import { applyTextDiff } from "./domain/yjsText";
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

const MarkdownCodeEditor = lazy(() => import("./MarkdownCodeEditor").then((module) => ({ default: module.MarkdownCodeEditor })));
const api = requestPkmsApi;
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

export default function Home() {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);
  const [treeContextMenu, setTreeContextMenu] = useState<TreeContextMenu | null>(null);
  const [treeDropTarget, setTreeDropTarget] = useState<string | null>(null);
  const [treeCreation, setTreeCreation] = useState<{ kind: "file" | "folder"; parentPath: string } | null>(null);
  const [showIgnoredFiles, setShowIgnoredFiles] = useState(false);
  const [excludedPatterns, setExcludedPatterns] = useState("");
  const [showFileFilters, setShowFileFilters] = useState(false);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [outlineHover, setOutlineHover] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeFile, setActiveFile] = useState<FileRecord | null>(null);
  const [openingFileId, setOpeningFileId] = useState<string | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickQuery, setQuickQuery] = useState("");
  const [text, setText] = useState("");
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
  const treeContextMenuRef = useRef<HTMLDivElement>(null);
  const quickOpenInput = useRef<HTMLInputElement>(null);
  const editorNavigate = useRef<((line: number) => void) | null>(null);
  const routedPath = useRef<string | null>(null);
  const openFileSequence = useRef(0);
  const openFileRef = useRef<((file: FileRecord, historyAction?: FileNavigation) => Promise<void>) | null>(null);
  const docs = useRef(new Map<string, { doc: Y.Doc; persistence: IndexeddbPersistence; observer?: () => void; updateHandler?: (update: Uint8Array, origin: unknown) => void }>());
  const activeRef = useRef<{ file: FileRecord | null; doc: Y.Doc | null; text: Y.Text | null; value: string }>({ file: null, doc: null, text: null, value: "" });
  const pending = useRef(new Map<string, RealtimeMessage>());
  const hydrating = useRef(false);
  const registerEditorNavigator = useCallback((navigate: ((line: number) => void) | null) => { editorNavigate.current = navigate; }, []);
  const { scheduleAutoSave, saveActiveFileNow } = useDocumentSync({
    workspaceId: activeWorkspace?.id,
    activeDocument: activeRef,
    request: api,
    setSaving,
    setError,
    setSync,
    setNotice,
  });
  const { openFile, clearActiveFile } = useDocumentSession({
    workspace: activeWorkspace, api, pathname: location.pathname, navigate, routedPath,
    documents: docs, activeDocument: activeRef, pending, socket, openSequence: openFileSequence, hydrating,
    scheduleAutoSave, setCurrentFolder, setExpandedFolders, setActiveFile, setText, setOpeningFileId,
    setError, setSaving, setSidebarOpen, setNotice,
  });
  openFileRef.current = openFile;
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
      if (!treeContextMenuRef.current?.contains(event.target as Node)) setTreeContextMenu(null);
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

  useEffect(() => { setOutlineOpen(false); }, [activeFile?.id]);

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
        saveActiveFileNow();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [activeWorkspace, saveActiveFileNow]);

  useEffect(() => { if (quickOpen) quickOpenInput.current?.focus(); }, [quickOpen]);


  useEffect(() => {
    if (!activeWorkspace) {
      setFiles([]); setActiveFile(null); setText("");
      return;
    }
    let alive = true;
    const clientId = `web-${createOperationId()}`;
    let retryTimer = 0;
    let stableTimer = 0;
    let retries = 0;
    const connect = () => {
      if (!alive) return;
      const ws = new PKMSRealtimeSocket(activeWorkspace.id, clientId, user ?? { login: "Guest" }, api);
      socket.current = ws;
      ws.onopen = () => {
        window.clearTimeout(stableTimer);
        stableTimer = window.setTimeout(() => { retries = 0; }, 30_000);
        setError((current) => current.startsWith("Live sync disconnected") ? "" : current);
        ws.send(JSON.stringify({ type: "hello", protocolVersion: 1, clientId, afterRevision: activeWorkspace.revision, user, fileId: activeRef.current.file?.id }));
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
      ws.onmessage = handleRealtimeMessage;
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
      const scrollTop = await restoreWorkspaceTree(() => alive);
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
  }, [activeWorkspace, api, handleRealtimeMessage, restoreWorkspaceTree, user]);

  useEffect(() => {
    if (!activeWorkspace || !loadedFolders.has("")) return;
    localStorage.setItem(`pkms:tree:${activeWorkspace.id}`, JSON.stringify({ expanded: [...expandedFolders].filter(Boolean), currentFolder }));
  }, [activeWorkspace?.id, currentFolder, expandedFolders, loadedFolders]);


  const fileLocation = parseFileLocation(location.pathname);
  useEffect(() => {
    if (loading || !user) return;
    if (!fileLocation) {
      if (location.pathname === "/" && activeRef.current.file) clearActiveFile();
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
    if (!activeWorkspace) return;
    setCurrentFolder(file.path);
    setFocusedTreePath(file.path);
    await toggleDirectory(file);
  };

  const chooseWorkspace = (workspace: Workspace) => {
    setActiveWorkspace(workspace); clearActiveFile(); setFiles([]); setLoadingFolder(true); setLoadingFolderPaths(new Set()); setCurrentFolder(""); setExpandedFolders(new Set([""])); setLoadedFolders(new Set());
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
      clearActiveFile(); setFiles([]); setLoadingFolder(true); setLoadingFolderPaths(new Set()); setCurrentFolder(""); setExpandedFolders(new Set([""])); setLoadedFolders(new Set());
      setSelectedTreePaths(new Set()); setCutTreePaths(new Set()); setSelectionAnchorPath(null);
      await refreshWorkspaces();
      setActiveWorkspace(result.workspace);
      routedPath.current = null;
      navigate("/", { preventScrollReset: true });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not connect repository"); }
  };

  const { createNote, createFolder, uploadFile } = useWorkspaceFileCreation({ workspace: activeWorkspace, files, currentFolder, request: api, setFiles, setLoadedFolders, setError, openFile });
  const beginTreeCreation = (kind: "file" | "folder", parentPath = currentFolder) => {
    setTreeCreation({ kind, parentPath });
    if (parentPath) setExpandedFolders((current) => new Set(current).add(parentPath));
  };
  const submitTreeCreation = (kind: "file" | "folder", parentPath: string, name: string) => {
    setTreeCreation(null);
    if (kind === "file") void createNote(parentPath, name);
    else void createFolder(parentPath, name);
  };
  const toolbarCreationFolder = selectedTreePaths.size === 1
    ? files.find((file) => file.path === [...selectedTreePaths][0] && file.kind === "folder")?.path ?? currentFolder
    : currentFolder;

  const handleText = (next: string) => {
    const current = activeRef.current;
    if (!current.text || hydrating.current) { setText(next); return; }
    const previous = current.text.toString();
    applyTextDiff(current.text, previous, next);
    activeRef.current.value = next;
    setText(next);
  };

  const outlineItems = useMemo(() => text.split("\n").flatMap((line, index) => {
    const heading = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    return heading ? [{ line: index + 1, level: heading[1].length, title: heading[2] }] : [];
  }), [text]);
  const parentFolder = parentPath(currentFolder);
  const persistTreeScroll = (scrollTop: number) => {
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
      setCutTreePaths(new Set(treeSelectionRoots(commandFiles, new Set(commandFiles.map((file) => file.path))).map((file) => file.path)));
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "v" && cutTreePaths.size) {
      event.preventDefault();
      const target = selectedFiles.length === 1 && selectedFiles[0].kind === "folder"
        ? selectedFiles[0].path
        : row ? (row.file.kind === "folder" ? row.file.path : parentPath(row.file.path)) : currentFolder;
      void moveTreeItems(files.filter((file) => cutTreePaths.has(file.path)), target);
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      if (commandFiles.length) { event.preventDefault(); void deleteTreeItems(commandFiles); }
      return;
    }
    if (!row) return;
    if (event.key === "F2" && selectedTreePaths.size === 1) {
      event.preventDefault();
      const selected = files.find((file) => selectedTreePaths.has(file.path));
      if (selected) renameTreeItem(selected);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const nextIndex = index + (event.key === "ArrowDown" ? 1 : -1);
      const next = treeRows[nextIndex];
      if (event.shiftKey && next) selectTreeRow(next.file.path, nextIndex, true, true);
      else if (next) selectTreeRow(next.file.path, nextIndex);
      focusRow(next);
    } else if (event.key === "ArrowRight" && row.file.kind === "folder") {
      event.preventDefault();
      if (!expandedFolders.has(row.file.path)) void toggleFolder(row.file);
      else if (treeRows[index + 1]?.depth === row.depth + 1) focusRow(treeRows[index + 1]);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (row.file.kind === "folder" && expandedFolders.has(row.file.path)) void toggleFolder(row.file);
      else focusRow(treeRows.find((candidate) => candidate.file.path === parentPath(row.file.path)));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (row.file.kind === "folder") void toggleFolder(row.file);
      else void openFile(row.file);
    }
  };

  const quickOpenResults = useMemo(() => [...new Map(visibleFiles.filter((file) => file.kind !== "folder").map((file) => [file.id, file])).values()]
    .filter((file) => !quickQuery.trim() || file.path.toLocaleLowerCase().includes(quickQuery.trim().toLocaleLowerCase()))
    .slice(0, 30), [quickQuery, visibleFiles]);
  const contextMoveSources = treeRows.filter((row) => selectedTreePaths.has(row.file.path)).map((row) => row.file);
  const contextMoveRoots = treeSelectionRoots(contextMoveSources, new Set(contextMoveSources.map((file) => file.path)));
  const cutMoveRoots = treeSelectionRoots(files.filter((file) => cutTreePaths.has(file.path)), cutTreePaths);
  const saveAttachment = () => {
    if (!assetPreviewUrl || !activeFile) return;
    const link = document.createElement("a");
    link.href = assetPreviewUrl;
    link.download = activeFile.path.split("/").at(-1) ?? "attachment";
    document.body.append(link);
    link.click();
    link.remove();
  };

  const { moveTreeItems, renameActiveFile, renameCurrentFolder, renameTreeItem, deleteTreeItems, deleteTreeItem, openTreeItem, deleteActiveFile, deleteCurrentFolder } = useWorkspaceFileActions({
    workspace: activeWorkspace, activeFile, currentFolder, parentFolder, files, selectedTreePaths, treeRows, expandedFolders,
    api, navigate, routedPath, clearActiveFile, openFile, toggleFolder, setFiles, setActiveFile, setCurrentFolder, setExpandedFolders,
    setLoadedFolders, setSelectedTreePaths, setCutTreePaths, setFocusedTreePath, setTreeContextMenu, setError, setNotice, requestName, confirm,
  });

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
            {activeFile && <button className="mini-button" title="Rename" onClick={renameActiveFile}><AppIcon name="pencil" /></button>}
            {(selectedTreePaths.size > 0 || activeFile) && <button className="mini-button" title={selectedTreePaths.size > 0 ? "Delete selected items" : "Delete open file"} aria-label={selectedTreePaths.size > 0 ? "Delete selected items" : "Delete open file"} onClick={() => selectedTreePaths.size > 0 ? void deleteTreeItems(treeRows.filter((row) => selectedTreePaths.has(row.file.path)).map((row) => row.file)) : void deleteActiveFile()}><AppIcon name="trash" /></button>}
            {!activeFile && currentFolder && <button className="mini-button" title="Rename folder" onClick={renameCurrentFolder}><AppIcon name="pencil" /></button>}
            {!activeFile && currentFolder && <button className="mini-button" title="Delete folder" onClick={() => void deleteCurrentFolder()}><AppIcon name="trash" /></button>}
          </div></div>
          {showFileFilters && <div className="file-filter-panel"><div className="file-filter-heading"><span>Ignored files</span><span className="filter-state">{showIgnoredFiles ? "Shown" : "Hidden"} · ⌘⇧.</span></div><label htmlFor="excluded-files">Exclude paths</label><textarea id="excluded-files" value={excludedPatterns} placeholder={"*.tmp\n**/drafts/**"} spellCheck={false} onChange={(event) => { const next = event.target.value; setExcludedPatterns(next); localStorage.setItem(`pkms:excluded-files:${activeWorkspace.id}`, next); }} /><p>Press ⌘⇧. to show ignored files</p></div>}
          <FileTreeList
            treeRef={treeRef}
            rows={treeRows}
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
            onDropItems={(paths, destination) => void moveTreeItems(files.filter((file) => paths.includes(file.path)), destination)}
            onFocusPath={setFocusedTreePath}
            onDragStart={(file, index, event) => {
              const selected = selectedTreePaths.has(file.path) ? treeRows.filter((row) => selectedTreePaths.has(row.file.path)).map((row) => row.file) : [file];
              const roots = treeSelectionRoots(selected, new Set(selected.map((entry) => entry.path)));
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
            creation={treeCreation}
            onCreate={submitTreeCreation}
            onCancelCreate={() => setTreeCreation(null)}
          />
          {treeContextMenu && <div ref={treeContextMenuRef} className="tree-context-menu" role="menu" aria-label={`${entryName(treeContextMenu.file.path)} actions`} style={{ left: treeContextMenu.x, top: treeContextMenu.y }}>
            <button role="menuitem" onClick={() => openTreeItem(treeContextMenu.file)}>{treeContextMenu.file.kind === "folder" ? "Open folder" : "Open"}</button>
            {treeContextMenu.file.kind === "folder" && <>
              <button role="menuitem" onClick={() => { const directory = treeContextMenu.file.path; setTreeContextMenu(null); beginTreeCreation("file", directory); }}>New note</button>
              <button role="menuitem" onClick={() => { const directory = treeContextMenu.file.path; setTreeContextMenu(null); beginTreeCreation("folder", directory); }}>New folder</button>
              {cutMoveRoots.length > 0 && <button role="menuitem" onClick={() => void moveTreeItems(cutMoveRoots, treeContextMenu.file.path)}>Paste into folder</button>}
              {contextMoveRoots.some((item) => item.path !== treeContextMenu.file.path && parentPath(item.path) !== treeContextMenu.file.path && !(item.kind === "folder" && treeContextMenu.file.path.startsWith(`${item.path}/`))) && <button role="menuitem" onClick={() => void moveTreeItems(contextMoveRoots, treeContextMenu.file.path)}>Move selection here</button>}
            </>}
            <button role="menuitem" onClick={() => { setCutTreePaths(new Set(contextMoveRoots.map((item) => item.path))); setTreeContextMenu(null); }}>Cut</button>
            <button role="menuitem" onClick={() => renameTreeItem(treeContextMenu.file)}>Rename</button>
            <button className="danger" role="menuitem" onClick={() => void deleteTreeItem(treeContextMenu.file)}>Delete</button>
          </div>}
        </>}
        <div className="sidebar-bottom">
          <div className="account-row"><img src={user.avatarUrl} alt="" /><span>@{user.login}</span><button className="icon-button logout-button" title="Sign out" onClick={() => void api("/api/logout", { method: "POST" }).then(() => { if (desktopBridge()) { account.clearAccount(); } else window.location.reload(); })}><AppIcon name="logout" /></button></div>
        </div>
      </aside>

      <section className="main-panel">
        <header className="topbar">
          <div className="topbar-left"><button className="sidebar-toggle" onClick={() => setSidebarOpen((open) => !open)} aria-expanded={sidebarOpen} aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"} title={sidebarOpen ? "Hide sidebar (⌘\\)" : "Show sidebar (⌘\\)"}><AppIcon name="menu" /></button><div className="breadcrumbs"><span>{activeWorkspace?.repository ?? "No workspace"}</span>{(activeFile || currentFolder) && <><span className="crumb-slash">/</span><span>{activeFile?.path ?? currentFolder}</span></>}</div></div>
          <div className="topbar-right">
            <span className={`save-label ${saving ? "active" : ""}`}><span className="status-dot" />{saving ? "Saving" : notice || (sync.githubStatus === "synced" ? "Synced" : "Saved")}</span>
            {peers.length > 1 && <div className="collaborators" aria-label="Collaborators"><span>{peers.length} here</span></div>}
          </div>
        </header>
        {error && <button className="notice error dismissible" onClick={() => setError("")}>{error}<AppIcon name="close" /></button>}
        {showRepositories && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowRepositories(false); }}><section className="repository-modal">
          <button className="modal-close" onClick={() => setShowRepositories(false)} aria-label="Close"><AppIcon name="close" /></button><span className="eyebrow">GitHub</span><h2>Choose a repository</h2>
          <div className="repository-list">{repositories.map((repository) => <button key={repository.fullName} className="repository-option" onClick={() => void connectRepository(repository)}><span className="repo-icon"><AppIcon name={repository.private ? "lock" : "folder"} /></span><span><strong>{repository.fullName}</strong><small>{repository.defaultBranch} · {repository.private ? "Private" : "Public"}</small></span><span className="option-arrow"><AppIcon name="arrowRight" /></span></button>)}{!repositories.length && <p className="empty-hint">No writable repositories found.</p>}</div>
        </section></div>}
        {quickOpen && <div className="modal-backdrop quick-open-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setQuickOpen(false); }}><section className="quick-open-modal" role="dialog" aria-modal="true" aria-label="Quick open"><input ref={quickOpenInput} value={quickQuery} onChange={(event) => setQuickQuery(event.target.value)} placeholder="Search open and loaded files…" onKeyDown={(event) => { if (event.key === "Escape") setQuickOpen(false); else if (event.key === "Enter" && quickOpenResults[0]) { void openFile(quickOpenResults[0]); setQuickOpen(false); } }} /><div className="quick-open-results">{quickOpenResults.map((file) => <button key={file.id} onClick={() => { void openFile(file); setQuickOpen(false); }}><span>{entryName(file.path)}</span><small>{file.path}</small></button>)}{!quickOpenResults.length && <p className="empty-hint">No loaded files found</p>}</div></section></div>}
        {!activeWorkspace ? <div className="empty-workspace"><h2>No workspace</h2><button className="primary-button" onClick={openRepositoryPicker}>Connect repository</button></div> : !activeFile ? <div className="empty-workspace"><h2>No file open</h2><button className="primary-button" onClick={() => beginTreeCreation("file", currentFolder)}>New note</button></div> : openingFileId === activeFile.id ? <div className="file-opening" role="status"><span className="file-opening-spinner" />Opening note…</div> : activeFile.kind === "markdown" ? <div className="editor-layout" onPointerMove={(event) => { const next = event.currentTarget.getBoundingClientRect().right - event.clientX < 48; setOutlineHover((current) => current === next ? current : next); }} onPointerLeave={() => setOutlineHover(false)}>
          <div className="editor-heading"><div className="editor-title-block"><h1>{activeFile.path.split("/").at(-1)?.replace(/\.md$/i, "")}</h1>{peers.length > 1 && <div className="live-presence">{peers.length} editing</div>}</div></div>
          <div className="outline-control outline-rail"><button className={`mini-button outline-button${outlineOpen ? " active" : ""}${outlineHover || outlineOpen ? " revealed" : ""}`} title="Note outline" aria-label="Note outline" aria-expanded={outlineOpen} onClick={() => setOutlineOpen((open) => !open)}><AppIcon name="list" /></button>{outlineOpen && <div className="outline-popover" role="navigation" aria-label="Note outline">{outlineItems.length ? outlineItems.map((item) => <button key={`${item.line}-${item.title}`} style={{ paddingLeft: 8 + (item.level - 1) * 11 }} title={item.title} onClick={() => { setOutlineOpen(false); requestAnimationFrame(() => editorNavigate.current?.(item.line)); }}>{item.title}</button>) : <span>No headings</span>}</div>}</div>
          <div className="editor-columns"><div className="source-column"><Suspense fallback={<div className="editor-loading">Opening editor…</div>}><MarkdownCodeEditor key={activeFile.id} value={text} onChange={handleText} onNavigateReady={registerEditorNavigator} /></Suspense></div></div>
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
