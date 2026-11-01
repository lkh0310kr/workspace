import { lazy, Suspense, useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";
import { PKMSRealtimeSocket } from "./realtime";
import { desktopBridge } from "./platform/desktopApi";
import { requestPkmsApi } from "./client/api";
import { submitWorkspaceOperation } from "./client/workspaceOperations";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import type { FileNavigation, FileRecord, Peer, RealtimeMessage, Repository, SyncStatus, TreeContextMenu, TreeRow, User, Workspace } from "./domain/types";
import { fromBase64, toBase64, createOperationId } from "./domain/encoding";
import { entryName, flattenTree, mergeFileRecords, parentPath, treeSelectionRoots } from "./domain/fileTree";
import { fileLocationPath, parseFileLocation } from "./domain/fileLocation";
import { matchesExcludePattern } from "./domain/excludePattern";
import { applyTextDiff } from "./domain/yjsText";
import { AppIcon, GitHubIcon } from "./components/Icons";
import { FileTreeList } from "./components/FileTreeList";
import { useFileTreeSelection } from "./features/files/useFileTreeSelection";
import { useWorkspaceDirectory } from "./features/files/useWorkspaceDirectory";
import { useDocumentSync } from "./features/editor/useDocumentSync";

const MarkdownCodeEditor = lazy(() => import("./MarkdownCodeEditor").then((module) => ({ default: module.MarkdownCodeEditor })));
const api = requestPkmsApi;

export function meta() {
  return [{ title: "PKMS — Markdown workspace" }];
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);
  const [treeContextMenu, setTreeContextMenu] = useState<TreeContextMenu | null>(null);
  const [treeDropTarget, setTreeDropTarget] = useState<string | null>(null);
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
  const [sync, setSync] = useState<SyncStatus>({ githubStatus: "pending", pendingFiles: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [showRepositories, setShowRepositories] = useState(false);
  const [saving, setSaving] = useState(false);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [deviceFlow, setDeviceFlow] = useState<{ deviceCode: string; userCode: string; verificationUri: string; interval: number; expiresAt: number } | null>(null);
  const [assetPreviewUrl, setAssetPreviewUrl] = useState<string | null>(null);
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
  const visibleFiles = files.filter((file) => showIgnoredFiles || (
    !file.path.split("/").some((part) => part.startsWith(".")) &&
    !excludedPatterns.split("\n").some((pattern) => matchesExcludePattern(file.path, pattern))
  ));
  const treeRows = flattenTree(visibleFiles, expandedFolders);
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
  const mounted = useRef(true);
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

  const clearActiveFile = () => {
    openFileSequence.current++;
    hydrating.current = false;
    setOpeningFileId(null);
    const current = activeRef.current;
    if (current.file && current.text) {
      const entry = docs.current.get(current.file.id);
      if (entry?.observer) current.text.unobserve(entry.observer);
      if (entry) entry.observer = undefined;
    }
    activeRef.current = { file: null, doc: null, text: null, value: "" };
    setActiveFile(null);
    setText("");
  };

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    const desktop = desktopBridge();
    if (!desktop || !activeWorkspace || !activeFile || activeFile.kind !== "asset") {
      setAssetPreviewUrl(null);
      return;
    }
    let alive = true;
    let objectUrl: string | null = null;
    void desktop.fetchAsset(`/api/workspaces/${encodeURIComponent(activeWorkspace.id)}/assets/${encodeURIComponent(activeFile.id)}`)
      .then(({ bytes, contentType }) => {
        if (!alive) return;
        const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        objectUrl = URL.createObjectURL(new Blob([data], { type: contentType }));
        setAssetPreviewUrl(objectUrl);
      })
      .catch((cause: unknown) => {
        if (alive) setError(cause instanceof Error ? cause.message : "Could not open attachment");
      });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setAssetPreviewUrl(null);
    };
  }, [activeWorkspace?.id, activeFile?.id, activeFile?.kind]);

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

  const refreshWorkspaces = useCallback(async () => {
    const result = await api<{ workspaces: Workspace[] }>("/api/workspaces");
    setWorkspaces(result.workspaces);
    setActiveWorkspace((previous) => previous ? result.workspaces.find((item) => item.id === previous.id) ?? previous : result.workspaces[0] ?? null);
  }, [api]);

  const beginDesktopSignIn = useCallback(async () => {
    const desktop = desktopBridge();
    if (!desktop) return;
    setError("");
    setDeviceFlow(null);
    try {
      const flow = await api<{ device_code: string; user_code: string; verification_uri: string; expires_in: number; interval: number }>(
        "/api/auth/device/start",
        { method: "POST" },
      );
      const expiresAt = Date.now() + flow.expires_in * 1000;
      setDeviceFlow({ deviceCode: flow.device_code, userCode: flow.user_code, verificationUri: flow.verification_uri, interval: flow.interval, expiresAt });
      await desktop.openVerification(flow.verification_uri);
      let delay = Math.max(flow.interval, 5);
      while (mounted.current && Date.now() < expiresAt) {
        await new Promise((resolve) => window.setTimeout(resolve, delay * 1000));
        if (!mounted.current) return;
        const result = await api<{ pending?: boolean; interval?: number; user?: User }>(
          "/api/auth/device/poll",
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceCode: flow.device_code }) },
        );
        if (result.pending) {
          delay = Math.max(result.interval ?? flow.interval, 5);
          continue;
        }
        if (!result.user) throw new Error("Device authorization returned no user");
        setDeviceFlow(null);
        setUser(result.user);
        await refreshWorkspaces();
        return;
      }
      if (mounted.current) {
        setDeviceFlow(null);
        setError("GitHub sign-in expired. Try again.");
      }
    } catch (cause) {
      if (mounted.current) {
        setDeviceFlow(null);
        setError(cause instanceof Error ? cause.message : "GitHub sign-in failed");
      }
    }
  }, [api, refreshWorkspaces]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const result = await api<{ user: User | null }>("/api/session");
        if (!alive) return;
        setUser(result.user);
        if (result.user) await refreshWorkspaces();
      } catch (cause) {
        if (alive) setError(cause instanceof Error ? cause.message : "Could not load your session");
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [api, refreshWorkspaces]);

  useEffect(() => {
    const reason = searchParams.get("auth_error");
    if (!reason) return;
    const requestId = searchParams.get("request_id");
    const messages: Record<string, string> = {
      github_access_denied: "GitHub access was declined.",
      github_account_not_allowed: "This GitHub account is not allowed.",
      github_authorization_failed: "GitHub authorization failed.",
      invalid_oauth_state: "Sign-in expired. Try again.",
      github_code_rejected: "GitHub rejected the sign-in code.",
      github_token_missing: "GitHub did not return an access token.",
      github_user_lookup_failed: "Could not read the GitHub account.",
      github_credentials_store_failed: "Could not save GitHub credentials.",
      session_create_failed: "Could not create a session.",
      github_token_exchange_failed: "Could not exchange the GitHub sign-in code.",
      oauth_callback_internal_error: "GitHub sign-in failed. Check the request log.",
    };
    setError(`${messages[reason] ?? "GitHub sign-in failed."}${requestId ? ` · ${requestId}` : ""}`);
    const next = new URLSearchParams(searchParams);
    next.delete("auth_error");
    next.delete("request_id");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

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
        const current = activeRef.current;
        if (current.file && current.doc) {
          const operationId = createOperationId();
          ws.send(JSON.stringify({ type: "document-update", operationId, fileId: current.file.id, update: toBase64(Y.encodeStateAsUpdate(current.doc)) }));
          pending.current.set(operationId, { type: "document-update", operationId, fileId: current.file.id });
        }
      };
      ws.onmessage = (event) => {
      let message: RealtimeMessage;
      try { message = JSON.parse(String(event.data)) as RealtimeMessage; } catch { return; }
      if (message.type === "presence-state") {
        setPeers((message as RealtimeMessage & { peers?: Peer[] }).peers ?? []);
      } else if (message.type === "presence") {
        const presence = message as RealtimeMessage & { action?: string; peer?: Peer; clientId?: string };
        if (presence.action === "leave") setPeers((current) => current.filter((peer) => peer.clientId !== presence.clientId));
        else if (presence.peer) setPeers((current) => [...current.filter((peer) => peer.clientId !== presence.peer!.clientId), presence.peer!]);
      } else if (message.type === "document-state" && message.fileId && message.update) {
        const document = docs.current.get(message.fileId)?.doc;
        if (document) Y.applyUpdate(document, fromBase64(message.update), "server");
        else pending.current.set(`state:${message.fileId}`, message);
      } else if (message.type === "document-update" && message.fileId && message.update) {
        const document = docs.current.get(message.fileId)?.doc;
        if (document) Y.applyUpdate(document, fromBase64(message.update), "server");
      } else if (message.type === "ack" && message.operationId) {
        pending.current.delete(message.operationId);
        setSaving(pending.current.size > 0);
        if (message.conflictCopyPath) {
          void api<{ files: FileRecord[] }>(`/api/workspaces/${activeWorkspace.id}/snapshot`).then(async (snapshot) => {
            setFiles(snapshot.files);
            const conflict = snapshot.files.find((file) => file.path === message.conflictCopyPath);
            if (conflict) await openFileRef.current?.(conflict);
          }).catch(() => {});
        }
      } else if (message.type === "error") {
        setError(message.message ?? "Collaboration sync failed");
      } else if (typeof message.acceptedRevision === "number") {
        void api<{ files: FileRecord[] }>(`/api/workspaces/${activeWorkspace.id}/snapshot`).then(async (snapshot) => {
          setFiles(snapshot.files);
          if (message.conflictCopyPath) {
            const conflict = snapshot.files.find((file) => file.path === message.conflictCopyPath);
            if (conflict) await openFileRef.current?.(conflict);
          }
        }).catch(() => {});
      }
      };
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
  }, [activeWorkspace, api, restoreWorkspaceTree, user]);

  useEffect(() => {
    if (!activeWorkspace || !loadedFolders.has("")) return;
    localStorage.setItem(`pkms:tree:${activeWorkspace.id}`, JSON.stringify({ expanded: [...expandedFolders].filter(Boolean), currentFolder }));
  }, [activeWorkspace?.id, currentFolder, expandedFolders, loadedFolders]);

  const openFile = useCallback(async (file: FileRecord, historyAction: FileNavigation = "push") => {
    const request = ++openFileSequence.current;
    hydrating.current = false;
    if (activeWorkspace && historyAction !== "none") {
      const target = fileLocationPath(activeWorkspace.id, file.path);
      if (location.pathname !== target) {
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
    const previous = activeRef.current;
    if (previous.file && previous.text) {
      const oldEntry = docs.current.get(previous.file.id);
      if (oldEntry?.observer) previous.text.unobserve(oldEntry.observer);
      if (oldEntry) oldEntry.observer = undefined;
    }
    setActiveFile(file);
    setText("");
    setOpeningFileId(file.id);
    activeRef.current = { file, doc: null, text: null, value: "" };
    if (file.kind !== "markdown") {
      setOpeningFileId(null);
      return;
    }
    setError(""); setSaving(false); hydrating.current = true;
    let entry = docs.current.get(file.id);
    try {
      if (!entry) {
        const doc = new Y.Doc({ guid: file.id });
        const persistence = new IndexeddbPersistence(`pkms:${activeWorkspace?.id}:${file.id}`, doc);
        entry = { doc, persistence };
        docs.current.set(file.id, entry);
        await persistence.whenSynced;
        if (request !== openFileSequence.current) return;
      }
      let currentText = entry.doc.getText("markdown");
      if (!currentText.length) {
        const server = await api<{ update: string }>(`/api/workspaces/${activeWorkspace?.id}/files/${file.id}/updates`);
        if (request !== openFileSequence.current) return;
        Y.applyUpdate(entry.doc, fromBase64(server.update), "server");
      }
    } catch (cause) {
      if (request === openFileSequence.current) { setError(cause instanceof Error ? cause.message : "Could not open file"); setOpeningFileId(null); }
      hydrating.current = false;
      return;
    }
    if (request !== openFileSequence.current) return;
    let currentText = entry.doc.getText("markdown");
    const queuedState = pending.current.get(`state:${file.id}`);
    if (queuedState?.update) {
      Y.applyUpdate(entry.doc, fromBase64(queuedState.update), "server");
      pending.current.delete(`state:${file.id}`);
    }
    currentText = entry.doc.getText("markdown");
    activeRef.current = { file, doc: entry.doc, text: currentText, value: currentText.toString() };
    setText(currentText.toString());
    const update = () => {
      const value = currentText.toString();
      activeRef.current.value = value;
      setText(value);
    };
    currentText.observe(update);
    entry.observer = update;
    const currentSocket = socket.current;
    const cacheKey = `pkms:${activeWorkspace?.id}:${file.id}`;
    const stored = JSON.parse(localStorage.getItem("pkms:recent-files") ?? "[]") as Array<{ key: string; lastOpened: number }>;
    const recent = [{ key: cacheKey, lastOpened: Date.now() }, ...stored.filter((item) => item.key !== cacheKey)].slice(0, 20);
    localStorage.setItem("pkms:recent-files", JSON.stringify(recent));
    const evicted = stored.filter((item) => !recent.some((kept) => kept.key === item.key));
    for (const item of evicted) {
      const fileId = item.key.split(":").at(-1) ?? "";
      const old = docs.current.get(fileId);
      if (old && activeRef.current.file?.id !== fileId) {
        old.doc.destroy();
        old.persistence.destroy();
        docs.current.delete(fileId);
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
    if (request === openFileSequence.current) setOpeningFileId(null);
  }, [activeWorkspace, api, location.pathname, navigate, scheduleAutoSave]);
  openFileRef.current = openFile;

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

  const newNote = async (directory = currentFolder) => {
    if (!activeWorkspace) return;
    const path = `${directory ? `${directory}/` : ""}Untitled ${new Date().toLocaleString("sv-SE").replaceAll(":", "-")}.md`;
    try {
      const result = await submitWorkspaceOperation(api, activeWorkspace, {
        type: "create-file", path, fileId: createOperationId(), content: "# Untitled\n\n",
      }, "web");
      const snapshot = await api<{ files: FileRecord[] }>(`/api/workspaces/${activeWorkspace.id}/snapshot`);
      setFiles(snapshot.files);
      const created = snapshot.files.find((item) => item.path === (result.conflictCopyPath ?? path));
      if (created) await openFile(created);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create note"); }
  };

  const newFolder = async (directory = currentFolder) => {
    if (!activeWorkspace) return;
    const name = window.prompt("New folder");
    if (!name?.trim()) return;
    try {
      await submitWorkspaceOperation(api, activeWorkspace, { type: "create-folder", path: `${directory ? `${directory}/` : ""}${name.trim()}` });
      const snapshot = await api<{ files: FileRecord[] }>(`/api/workspaces/${activeWorkspace.id}/snapshot`);
      setFiles(snapshot.files);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create folder"); }
  };

  const uploadFile = async (file?: File) => {
    if (!file || !activeWorkspace) return;
    const form = new FormData(); form.set("file", file); form.set("path", `${currentFolder ? `${currentFolder}/` : ""}${file.name}`); form.set("clientId", `web-${createOperationId()}`);
    try {
      await api(`/api/workspaces/${activeWorkspace.id}/upload`, { method: "POST", body: form });
      const snapshot = await api<{ files: FileRecord[] }>(`/api/workspaces/${activeWorkspace.id}/snapshot`);
      setFiles(snapshot.files);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Upload failed"); }
  };

  const handleText = (next: string) => {
    const current = activeRef.current;
    if (!current.text || hydrating.current) { setText(next); return; }
    const previous = current.text.toString();
    applyTextDiff(current.text, previous, next);
    activeRef.current.value = next;
    setText(next);
  };

  const outlineItems = text.split("\n").flatMap((line, index) => {
    const heading = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    return heading ? [{ line: index + 1, level: heading[1].length, title: heading[2] }] : [];
  });
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
    if (!row) return;
    const focusRow = (next: TreeRow | undefined) => {
      if (!next) return;
      setFocusedTreePath(next.file.path);
      requestAnimationFrame(() => treeRef.current?.querySelector<HTMLElement>(`[data-tree-path="${CSS.escape(next.file.path)}"]`)?.focus());
    };
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      setSelectedTreePaths(new Set(treeRows.map((item) => item.file.path)));
      setSelectionAnchorPath(row.file.path);
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "x") {
      event.preventDefault();
      setCutTreePaths(new Set(selectedTreePaths));
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "v" && cutTreePaths.size) {
      event.preventDefault();
      void moveTreeItems(files.filter((file) => cutTreePaths.has(file.path)), currentFolder);
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      if (selectedTreePaths.size) { event.preventDefault(); void deleteTreeItems(treeRows.filter((item) => selectedTreePaths.has(item.file.path)).map((item) => item.file)); }
      return;
    }
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

  const quickOpenResults = [...new Map(visibleFiles.filter((file) => file.kind !== "folder").map((file) => [file.id, file])).values()]
    .filter((file) => !quickQuery.trim() || file.path.toLocaleLowerCase().includes(quickQuery.trim().toLocaleLowerCase()))
    .slice(0, 30);
  const contextMoveSources = treeRows.filter((row) => selectedTreePaths.has(row.file.path)).map((row) => row.file);
  const contextMoveRoots = treeSelectionRoots(contextMoveSources, new Set(contextMoveSources.map((file) => file.path)));

  const updateFilePath = async (file: FileRecord, toPath: string) => {
    if (!activeWorkspace) return;
    try {
      const result = await submitWorkspaceOperation(api, activeWorkspace, { type: "move", fileId: file.id, toPath });
      const snapshot = await api<{ files: FileRecord[] }>(`/api/workspaces/${activeWorkspace.id}/snapshot`);
      setFiles(snapshot.files);
      const activeMovesWithItem = activeFile && (activeFile.id === file.id || (file.kind === "folder" && activeFile.path.startsWith(`${file.path}/`)));
      const renamedActive = activeMovesWithItem ? snapshot.files.find((entry) => entry.id === activeFile.id) : null;
      if (renamedActive) {
        setActiveFile(renamedActive);
        const target = fileLocationPath(activeWorkspace.id, renamedActive.path);
        routedPath.current = target;
        navigate(target, { replace: true, preventScrollReset: true });
      }
      const destination = result.conflictCopyPath ?? toPath;
      const movePath = (path: string) => file.kind === "folder"
        ? (path === file.path || path.startsWith(`${file.path}/`) ? `${destination}${path.slice(file.path.length)}` : path)
        : path === file.path ? destination : path;
      if (file.kind === "folder" && (currentFolder === file.path || currentFolder.startsWith(`${file.path}/`))) {
        setCurrentFolder(`${destination}${currentFolder.slice(file.path.length)}`);
      }
      if (file.kind === "folder") {
        setExpandedFolders((current) => new Set([...current].map(movePath)));
        setLoadedFolders((current) => new Set([...current].map(movePath)));
      }
      setSelectedTreePaths((current) => new Set([...current].map(movePath)));
      setCutTreePaths((current) => new Set([...current].map(movePath)));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not rename item"); }
  };

  const moveTreeItems = async (items: FileRecord[], destination: string) => {
    if (!activeWorkspace || !items.length) return;
    const roots = treeSelectionRoots(items, new Set(items.map((file) => file.path)));
    const moves = roots.map((file) => ({ file, toPath: `${destination ? `${destination}/` : ""}${entryName(file.path)}` }))
      .filter(({ file, toPath }) => toPath !== file.path);
    if (!moves.length) { setTreeContextMenu(null); return; }
    const invalid = moves.find(({ file }) => file.kind === "folder" && destination.startsWith(`${file.path}/`));
    if (invalid) { setError("A folder cannot be moved into itself or one of its subfolders."); setTreeContextMenu(null); return; }
    if (destination && !files.some((file) => file.path === destination && file.kind === "folder")) {
      setError("Destination folder is not available in the file tree."); setTreeContextMenu(null); return;
    }
    setTreeContextMenu(null);
    setError("");
    const resolvedMoves: Array<{ file: FileRecord; destination: string }> = [];
    try {
      for (const move of moves) {
        const result = await submitWorkspaceOperation(api, activeWorkspace, { type: "move", fileId: move.file.id, toPath: move.toPath });
        resolvedMoves.push({ file: move.file, destination: result.conflictCopyPath ?? move.toPath });
      }
      const snapshot = await api<{ files: FileRecord[] }>(`/api/workspaces/${activeWorkspace.id}/snapshot`);
      setFiles(snapshot.files);
      const pathAfterMove = (path: string) => {
        const move = resolvedMoves.find(({ file }) => file.kind === "folder" && (path === file.path || path.startsWith(`${file.path}/`)));
        if (move) return `${move.destination}${path.slice(move.file.path.length)}`;
        const exact = resolvedMoves.find(({ file }) => file.path === path);
        return exact?.destination ?? path;
      };
      setCurrentFolder((path) => pathAfterMove(path));
      setExpandedFolders((paths) => new Set([...paths].map(pathAfterMove)));
      setLoadedFolders((paths) => new Set([...paths].map(pathAfterMove)));
      const movedActive = activeFile ? snapshot.files.find((file) => file.id === activeFile.id) : null;
      if (movedActive && movedActive.path !== activeFile?.path) {
        setActiveFile(movedActive);
        const target = fileLocationPath(activeWorkspace.id, movedActive.path);
        routedPath.current = target;
        navigate(target, { replace: true, preventScrollReset: true });
      }
      setSelectedTreePaths(new Set(resolvedMoves.map((move) => move.destination)));
      setCutTreePaths(new Set());
      setFocusedTreePath(resolvedMoves[0]?.destination ?? null);
      if (resolvedMoves.some((move, index) => move.destination !== moves[index]?.toPath)) setNotice("Name conflict resolved while moving items.");
    } catch (cause) {
      try {
        const snapshot = await api<{ files: FileRecord[] }>(`/api/workspaces/${activeWorkspace.id}/snapshot`);
        setFiles(snapshot.files);
        setSelectedTreePaths(new Set());
        setCurrentFolder((path) => { let next = path; while (next && !snapshot.files.some((file) => file.kind === "folder" && file.path === next)) next = parentPath(next); return next; });
        const current = activeFile ? snapshot.files.find((file) => file.id === activeFile.id) : null;
        if (current && current.path !== activeFile?.path) {
          setActiveFile(current);
          const target = fileLocationPath(activeWorkspace.id, current.path);
          routedPath.current = target;
          navigate(target, { replace: true, preventScrollReset: true });
        }
      } catch { /* Keep the original operation error visible. */ }
      setError(`${resolvedMoves.length ? "Some items may have moved. The tree was refreshed. " : ""}${cause instanceof Error ? cause.message : "Could not move selected items"}`);
    }
  };

  const renameActiveFile = () => {
    if (!activeFile) return;
    const name = window.prompt("Rename", entryName(activeFile.path));
    if (!name?.trim() || name.trim() === entryName(activeFile.path)) return;
    const parent = parentPath(activeFile.path);
    void updateFilePath(activeFile, `${parent ? `${parent}/` : ""}${name.trim()}`);
  };

  const renameCurrentFolder = () => {
    const folder = files.find((file) => file.kind === "folder" && file.path === currentFolder);
    if (!folder) return;
    const name = window.prompt("Rename", entryName(currentFolder));
    if (!name?.trim() || name.trim() === entryName(currentFolder)) return;
    void updateFilePath(folder, `${parentPath(currentFolder) ? `${parentPath(currentFolder)}/` : ""}${name.trim()}`);
  };

  const renameTreeItem = (file: FileRecord) => {
    setTreeContextMenu(null);
    const currentName = entryName(file.path);
    const name = window.prompt("Rename", currentName);
    if (!name?.trim() || name.trim() === currentName) return;
    const parent = parentPath(file.path);
    void updateFilePath(file, `${parent ? `${parent}/` : ""}${name.trim()}`);
  };

  const deleteTreeItems = async (filesToDelete: FileRecord[]) => {
    setTreeContextMenu(null);
    if (!activeWorkspace || !filesToDelete.length) return;
    const roots = treeSelectionRoots(filesToDelete, new Set(filesToDelete.map((file) => file.path)));
    const prompt = roots.length === 1 ? `Delete ${entryName(roots[0].path)}?` : `Delete ${roots.length} selected items?`;
    if (!window.confirm(prompt)) return;
    try {
      for (const file of roots) {
        await submitWorkspaceOperation(api, activeWorkspace, { type: "delete", fileId: file.id });
      }
      const isInsideDeleted = (path: string) => roots.some((file) => path === file.path || (file.kind === "folder" && path.startsWith(`${file.path}/`)));
      setFiles((current) => current.filter((entry) => !isInsideDeleted(entry.path)));
      setExpandedFolders((current) => new Set([...current].filter((path) => !isInsideDeleted(path))));
      setLoadedFolders((current) => new Set([...current].filter((path) => !isInsideDeleted(path))));
      if (currentFolder && isInsideDeleted(currentFolder)) setCurrentFolder(parentPath(roots.find((file) => currentFolder === file.path || currentFolder.startsWith(`${file.path}/`))?.path ?? currentFolder));
      if (activeFile && isInsideDeleted(activeFile.path)) {
        clearActiveFile();
        routedPath.current = null;
        navigate("/", { replace: true, preventScrollReset: true });
      }
      setSelectedTreePaths(new Set());
    } catch (cause) {
      try {
        const snapshot = await api<{ files: FileRecord[] }>(`/api/workspaces/${activeWorkspace.id}/snapshot`);
        setFiles(snapshot.files);
        setSelectedTreePaths(new Set());
        setExpandedFolders((current) => new Set([...current].filter((path) => snapshot.files.some((file) => file.kind === "folder" && file.path === path))));
        setLoadedFolders((current) => new Set([...current].filter((path) => snapshot.files.some((file) => file.kind === "folder" && file.path === path))));
        if (activeFile && !snapshot.files.some((file) => file.id === activeFile.id)) {
          clearActiveFile(); routedPath.current = null; navigate("/", { replace: true, preventScrollReset: true });
        }
        setCurrentFolder((path) => { let next = path; while (next && !snapshot.files.some((file) => file.kind === "folder" && file.path === next)) next = parentPath(next); return next; });
      } catch { /* Keep the original operation error visible. */ }
      setError(`${roots.length > 1 ? "Some selected items may have been deleted. " : ""}${cause instanceof Error ? cause.message : "Could not delete item"}`);
    }
  };

  const deleteTreeItem = (file: FileRecord) => void deleteTreeItems(selectedTreePaths.has(file.path)
    ? treeRows.filter((row) => selectedTreePaths.has(row.file.path)).map((row) => row.file)
    : [file]);

  const openTreeItem = (file: FileRecord) => {
    setTreeContextMenu(null);
    if (file.kind !== "folder") { void openFile(file); return; }
    setCurrentFolder(file.path);
    setFocusedTreePath(file.path);
    if (!expandedFolders.has(file.path)) void toggleFolder(file);
  };

  const deleteActiveFile = async () => {
    if (!activeWorkspace || !activeFile || !window.confirm(`Delete ${entryName(activeFile.path)}?`)) return;
    try {
      await submitWorkspaceOperation(api, activeWorkspace, { type: "delete", fileId: activeFile.id });
      clearActiveFile();
      routedPath.current = null;
      navigate("/", { replace: true, preventScrollReset: true });
      setFiles((current) => current.filter((file) => file.id !== activeFile.id));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete item"); }
  };

  const deleteCurrentFolder = async () => {
    const folder = files.find((file) => file.kind === "folder" && file.path === currentFolder);
    if (!activeWorkspace || !folder || !window.confirm(`Delete ${entryName(currentFolder)}?`)) return;
    try {
      await submitWorkspaceOperation(api, activeWorkspace, { type: "delete", fileId: folder.id });
      setFiles((current) => current.filter((file) => file.path !== currentFolder && !file.path.startsWith(`${currentFolder}/`)));
      setExpandedFolders((current) => new Set([...current].filter((path) => path !== currentFolder && !path.startsWith(`${currentFolder}/`))));
      setCurrentFolder(parentFolder);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete folder"); }
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
            <button className="mini-button" title="New note" onClick={() => void newNote()}><AppIcon name="filePlus" /></button>
            <button className="mini-button" title="New folder" onClick={() => void newFolder()}><AppIcon name="folderPlus" /></button>
            <label className="mini-button upload-button" title="Upload file"><AppIcon name="upload" /><input type="file" onChange={(event) => { void uploadFile(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>
            {activeFile && <button className="mini-button" title="Rename" onClick={renameActiveFile}><AppIcon name="pencil" /></button>}
            {activeFile && <button className="mini-button" title="Delete" onClick={() => void deleteActiveFile()}><AppIcon name="trash" /></button>}
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
            onActivate={(file) => { if (file.kind === "folder") void toggleFolder(file); else void openFile(file); }}
          />
          {treeContextMenu && <div ref={treeContextMenuRef} className="tree-context-menu" role="menu" aria-label={`${entryName(treeContextMenu.file.path)} actions`} style={{ left: treeContextMenu.x, top: treeContextMenu.y }}>
            <button role="menuitem" onClick={() => openTreeItem(treeContextMenu.file)}>{treeContextMenu.file.kind === "folder" ? "Open folder" : "Open"}</button>
            {treeContextMenu.file.kind === "folder" && <>
              <button role="menuitem" onClick={() => { const directory = treeContextMenu.file.path; setTreeContextMenu(null); void newNote(directory); }}>New note</button>
              <button role="menuitem" onClick={() => { const directory = treeContextMenu.file.path; setTreeContextMenu(null); void newFolder(directory); }}>New folder</button>
              {contextMoveRoots.some((item) => item.path !== treeContextMenu.file.path && parentPath(item.path) !== treeContextMenu.file.path && !(item.kind === "folder" && treeContextMenu.file.path.startsWith(`${item.path}/`))) && <button role="menuitem" onClick={() => void moveTreeItems(contextMoveRoots, treeContextMenu.file.path)}>Move selection here</button>}
            </>}
            <button role="menuitem" onClick={() => { setCutTreePaths(new Set(contextMoveRoots.map((item) => item.path))); setTreeContextMenu(null); }}>Cut</button>
            <button role="menuitem" onClick={() => renameTreeItem(treeContextMenu.file)}>Rename</button>
            <button className="danger" role="menuitem" onClick={() => void deleteTreeItem(treeContextMenu.file)}>Delete</button>
          </div>}
        </>}
        <div className="sidebar-bottom">
          <div className="account-row"><img src={user.avatarUrl} alt="" /><span>@{user.login}</span><button className="icon-button logout-button" title="Sign out" onClick={() => void api("/api/logout", { method: "POST" }).then(() => { if (desktopBridge()) { setUser(null); setWorkspaces([]); setActiveWorkspace(null); } else window.location.reload(); })}><AppIcon name="logout" /></button></div>
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
        {!activeWorkspace ? <div className="empty-workspace"><h2>No workspace</h2><button className="primary-button" onClick={openRepositoryPicker}>Connect repository</button></div> : !activeFile ? <div className="empty-workspace"><h2>No file open</h2><button className="primary-button" onClick={() => void newNote()}>New note</button></div> : openingFileId === activeFile.id ? <div className="file-opening" role="status"><span className="file-opening-spinner" />Opening note…</div> : activeFile.kind === "markdown" ? <div className="editor-layout" onPointerMove={(event) => { const next = event.currentTarget.getBoundingClientRect().right - event.clientX < 48; setOutlineHover((current) => current === next ? current : next); }} onPointerLeave={() => setOutlineHover(false)}>
          <div className="editor-heading"><div className="editor-title-block"><h1>{activeFile.path.split("/").at(-1)?.replace(/\.md$/i, "")}</h1>{peers.length > 1 && <div className="live-presence">{peers.length} editing</div>}</div></div>
          <div className="outline-control outline-rail"><button className={`mini-button outline-button${outlineOpen ? " active" : ""}${outlineHover || outlineOpen ? " revealed" : ""}`} title="Note outline" aria-label="Note outline" aria-expanded={outlineOpen} onClick={() => setOutlineOpen((open) => !open)}><AppIcon name="list" /></button>{outlineOpen && <div className="outline-popover" role="navigation" aria-label="Note outline">{outlineItems.length ? outlineItems.map((item) => <button key={`${item.line}-${item.title}`} style={{ paddingLeft: 8 + (item.level - 1) * 11 }} title={item.title} onClick={() => { setOutlineOpen(false); requestAnimationFrame(() => editorNavigate.current?.(item.line)); }}>{item.title}</button>) : <span>No headings</span>}</div>}</div>
          <div className="editor-columns"><div className="source-column"><Suspense fallback={<div className="editor-loading">Opening editor…</div>}><MarkdownCodeEditor key={activeFile.id} value={text} onChange={handleText} onNavigateReady={registerEditorNavigator} /></Suspense></div></div>
        </div> : <div className="asset-view"><div className="file-icon large"><AppIcon name="file" /></div><h2>{activeFile.path.split("/").at(-1)}</h2><p>{activeFile.size ? `${(activeFile.size / 1024).toFixed(1)} KB` : "Attachment"}</p>{desktopBridge() ? assetPreviewUrl ? <iframe className="asset-preview-frame" src={assetPreviewUrl} title={activeFile.path} /> : <span className="file-opening-spinner" aria-label="Loading attachment" /> : <a className="primary-button" href={`/api/workspaces/${activeWorkspace.id}/assets/${activeFile.id}`} target="_blank" rel="noreferrer">Open file</a>}</div>}
        {sync.githubStatus === "external-change" && <div className="external-warning"><strong>GitHub branch changed outside PKMS.</strong><span>PKMS paused its commit so it won’t overwrite that change. {sync.message}</span></div>}
      </section>
    </main>
  );
}
