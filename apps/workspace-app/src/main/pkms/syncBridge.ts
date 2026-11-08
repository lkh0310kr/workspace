import { app } from "electron";
import { randomUUID, createHash } from "node:crypto";
import { promises as fs, watch, type FSWatcher } from "node:fs";
import path from "node:path";
import * as Y from "yjs";
import { requestPkmsApi } from "./api";
import type { PkmsSyncBridgeStatus } from "../../shared/pkmsSyncBridge";

type BridgeFile = { id: string; path: string; kind: string; revision: number };
type BridgeSnapshot = { revision: number; files: BridgeFile[] };
type Baseline = { fileId: string; hash: string; revision: number };
type Persisted = { configs: Record<string, { folderPath: string; excludedPaths: string[] }>; baselines: Record<string, Record<string, Baseline>> };
const EMPTY: Persisted = { configs: {}, baselines: {} };
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const pollers = new Map<string, ReturnType<typeof setInterval>>();
const watchers = new Map<string, FSWatcher>();
const statuses = new Map<string, PkmsSyncBridgeStatus>();
const running = new Map<string, Promise<void>>();
let persisted: Persisted | null = null;

function statePath(): string { return path.join(app.getPath("userData"), "pkms-sync-bridge.json"); }
async function load(): Promise<Persisted> {
  if (persisted) return persisted;
  try { persisted = { ...EMPTY, ...(JSON.parse(await fs.readFile(statePath(), "utf8")) as Partial<Persisted>) }; }
  catch { persisted = structuredClone(EMPTY); }
  return persisted;
}
async function save(): Promise<void> {
  const state = await load();
  await fs.mkdir(path.dirname(statePath()), { recursive: true });
  const temp = `${statePath()}.${randomUUID()}.tmp`;
  await fs.writeFile(temp, JSON.stringify(state), { mode: 0o600 });
  await fs.rename(temp, statePath());
}
function hash(content: string): string { return createHash("sha256").update(content).digest("hex"); }
function safePath(root: string, relative: string): string {
  const target = path.resolve(root, relative);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error("invalid_sync_path");
  return target;
}
function status(workspaceId: string): PkmsSyncBridgeStatus {
  return statuses.get(workspaceId) ?? {
    workspaceId, enabled: false, folderPath: null, state: "disconnected",
    excludedPaths: [], progress: null, lastScannedAt: null, lastSyncedAt: null, pendingFiles: 0, conflictFiles: [], error: null,
  };
}
function setStatus(workspaceId: string, patch: Partial<PkmsSyncBridgeStatus>): PkmsSyncBridgeStatus {
  const next = { ...status(workspaceId), ...patch };
  statuses.set(workspaceId, next);
  return next;
}

async function request<T>(pathName: string, method: "GET" | "POST", value?: unknown): Promise<T> {
  const response = await requestPkmsApi<T>(pathName, {
    method,
    ...(value === undefined ? {} : { body: { kind: "json", value: JSON.stringify(value) } }),
  });
  if (response.status < 200 || response.status >= 300) {
    const detail = response.body && typeof response.body === "object" ? (response.body as { message?: string; error?: string }) : {};
    throw new Error(detail.message ?? detail.error ?? `PKMS request failed (${response.status})`);
  }
  return response.body;
}
function b64(bytes: Uint8Array): string { return Buffer.from(bytes).toString("base64"); }
function fromB64(value: string): Uint8Array { return new Uint8Array(Buffer.from(value, "base64")); }

function matchesExclusion(relative: string, patterns: string[]): boolean {
  return patterns.some((raw) => {
    const pattern = raw.trim().replaceAll("\\", "/").replace(/\/$/, "");
    if (!pattern) return false;
    let source = "";
    for (let index = 0; index < pattern.length; index++) {
      const char = pattern[index];
      if (char === "*" && pattern[index + 1] === "*" && pattern[index + 2] === "/") { source += "(?:.*/)?"; index += 2; }
      else if (char === "*" && pattern[index + 1] === "*") { source += ".*"; index++; }
      else if (char === "*") source += "[^/]*";
      else if (char === "?") source += "[^/]";
      else source += /[\\^$+?.()|{}\[\]]/.test(char) ? `\\${char}` : char;
    }
    try { return new RegExp(`^${source}(?:/.*)?$`).test(relative); } catch { return false; }
  });
}
async function markdownFiles(root: string, excludedPaths: string[]): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  const visit = async (dir: string): Promise<void> => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink() || [".git", ".obsidian", "node_modules", ".pkms"].includes(entry.name)) continue;
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        const relative = path.relative(root, absolute).split(path.sep).join("/");
        if (matchesExclusion(relative, excludedPaths)) continue;
        found.set(relative, await fs.readFile(absolute, "utf8"));
      }
    }
  };
  await visit(root);
  return found;
}
function isReservedSyncPath(relative: string): boolean {
  return relative.split("/").some((part) => [".git", ".obsidian", "node_modules", ".pkms"].includes(part));
}
async function writeAtomic(root: string, relative: string, content: string): Promise<void> {
  const target = safePath(root, relative);
  const parentParts = path.posix.dirname(relative).split("/").filter((part) => part && part !== ".");
  let current = root;
  for (const part of parentParts) {
    current = path.join(current, part);
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("unsafe_sync_path");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await fs.mkdir(current);
    }
  }
  let mode = 0o666;
  try {
    const existing = await fs.lstat(target);
    if (existing.isSymbolicLink() || !existing.isFile()) throw new Error("unsafe_sync_path");
    mode = existing.mode & 0o777;
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const temp = `${target}.${randomUUID()}.pkms-tmp`;
  await fs.writeFile(temp, content, { encoding: "utf8", mode });
  await fs.rename(temp, target);
}
async function removeLocalFile(root: string, relative: string): Promise<void> {
  const target = safePath(root, relative);
  let current = root;
  for (const part of path.posix.dirname(relative).split("/").filter((item) => item && item !== ".")) {
    current = path.join(current, part);
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("unsafe_sync_path");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
  }
  try { if ((await fs.lstat(target)).isSymbolicLink()) throw new Error("unsafe_sync_path"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
  await fs.rm(target, { force: true });
}
async function readRemoteText(workspaceId: string, file: BridgeFile): Promise<{ text: string; revision: number }> {
  const data = await request<{ update: string; revision: number }>(`/api/workspaces/${encodeURIComponent(workspaceId)}/files/${encodeURIComponent(file.id)}/updates`, "GET");
  const doc = new Y.Doc({ guid: file.id });
  Y.applyUpdate(doc, fromB64(data.update));
  return { text: doc.getText("markdown").toString(), revision: data.revision };
}
async function readRemoteTexts(workspaceId: string, files: BridgeFile[]): Promise<Map<string, { text: string; revision: number }>> {
  const batches: BridgeFile[][] = [];
  for (let index = 0; index < files.length; index += 4) batches.push(files.slice(index, index + 4));
  const documents = new Map<string, { text: string; revision: number }>();
  let nextBatch = 0;
  const worker = async () => {
    while (true) {
      const batch = batches[nextBatch++];
      if (!batch) return;
      const result = await request<{ documents: Array<{ id: string; path: string; revision: number; text?: string; error?: string }> }>(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/sync/download`, "POST", { fileIds: batch.map((file) => file.id) },
      );
      for (const document of result.documents) {
        if (document.error || typeof document.text !== "string") throw new Error(document.error ?? "document_load_failed");
        documents.set(document.id, { text: document.text, revision: document.revision });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, batches.length) }, () => worker()));
  return documents;
}
async function createRemoteFile(workspaceId: string, snapshotRevision: number, relative: string, content: string): Promise<BridgeFile> {
  const fileId = randomUUID();
  const doc = new Y.Doc({ guid: fileId });
  if (content) doc.getText("markdown").insert(0, content);
  const result = await request<{ file?: BridgeFile; path?: string; fileId?: string; acceptedRevision?: number; conflictCopyPath?: string }>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/operations`, "POST", {
      operationId: randomUUID(), baseRevision: snapshotRevision, clientId: "desktop-sync-bridge",
      operation: { type: "create-file", path: relative, fileId, content }, initialState: b64(Y.encodeStateAsUpdate(doc)),
    },
  );
  return { id: result.file?.id ?? result.fileId ?? fileId, path: result.file?.path ?? result.conflictCopyPath ?? result.path ?? relative, kind: "markdown", revision: result.file?.revision ?? 0 };
}
async function replaceRemoteText(workspaceId: string, file: BridgeFile, currentRemote: string, nextText: string): Promise<number> {
  const latest = await request<{ update: string; revision: number }>(`/api/workspaces/${encodeURIComponent(workspaceId)}/files/${encodeURIComponent(file.id)}/updates`, "GET");
  const doc = new Y.Doc({ guid: file.id });
  Y.applyUpdate(doc, fromB64(latest.update));
  const text = doc.getText("markdown");
  if (text.toString() !== currentRemote) throw new Error("remote_changed_retry");
  const vector = Y.encodeStateVector(doc);
  let prefix = 0;
  while (prefix < currentRemote.length && prefix < nextText.length && currentRemote[prefix] === nextText[prefix]) prefix++;
  let suffix = 0;
  while (suffix < currentRemote.length - prefix && suffix < nextText.length - prefix && currentRemote[currentRemote.length - 1 - suffix] === nextText[nextText.length - 1 - suffix]) suffix++;
  const removed = currentRemote.length - prefix - suffix;
  const inserted = nextText.slice(prefix, nextText.length - suffix);
  doc.transact(() => { if (removed) text.delete(prefix, removed); if (inserted) text.insert(prefix, inserted); });
  const result = await request<{ acceptedRevision?: number }>(`/api/workspaces/${encodeURIComponent(workspaceId)}/files/${encodeURIComponent(file.id)}/updates`, "POST", {
    operationId: randomUUID(), update: b64(Y.encodeStateAsUpdate(doc, vector)),
  });
  return result.acceptedRevision ?? latest.revision;
}
async function conflictCopy(root: string, relative: string, content: string): Promise<string> {
  const ext = path.posix.extname(relative);
  const base = ext ? relative.slice(0, -ext.length) : relative;
  const conflict = `${base}.local-conflict-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}${ext || ".md"}`;
  await writeAtomic(root, conflict, content);
  return conflict;
}

async function syncOnce(workspaceId: string): Promise<void> {
  const config = (await load()).configs[workspaceId];
  if (!config) return;
  const active = running.get(workspaceId);
  if (active) return active;
  const job = (async () => {
    const root = path.resolve(config.folderPath);
    setStatus(workspaceId, { state: "syncing", progress: { completed: 0, total: 0, percent: 0 }, error: null });
    try {
      const local = await markdownFiles(root, config.excludedPaths ?? []);
      const snapshot = await request<BridgeSnapshot>(`/api/workspaces/${encodeURIComponent(workspaceId)}/snapshot`, "GET");
      const remoteByPath = new Map(snapshot.files.filter((file) => file.kind === "markdown").map((file) => [file.path, file]));
      const baselines = (await load()).baselines[workspaceId] ??= {};
      const paths = [...new Set([...local.keys(), ...remoteByPath.keys(), ...Object.keys(baselines)])]
        .filter((relative) => !isReservedSyncPath(relative) && !matchesExclusion(relative, config.excludedPaths ?? []));
      let completed = 0;
      const total = paths.length;
      const reportProgress = () => setStatus(workspaceId, {
        state: "syncing",
        progress: { completed, total, percent: total === 0 ? 100 : Math.floor((completed / total) * 100) },
      });
      reportProgress();
      const remoteReads = await readRemoteTexts(workspaceId, paths.flatMap((relative) => {
        const remote = remoteByPath.get(relative);
        const baseline = baselines[relative];
        return remote && (!baseline || baseline.fileId !== remote.id || baseline.revision !== remote.revision) ? [remote] : [];
      }));
      const reconcilePath = async (relative: string): Promise<void> => {
        let itemComplete = false;
        try {
        const localText = local.get(relative);
        const remote = remoteByPath.get(relative);
        const baseline = baselines[relative];
        if (!remote && localText !== undefined) {
          if (baseline) {
            if (hash(localText) !== baseline.hash) {
              const conflict = await conflictCopy(root, relative, localText);
              const created = await createRemoteFile(workspaceId, snapshot.revision, conflict, localText);
              baselines[created.path] = { fileId: created.id, hash: hash(localText), revision: created.revision };
            }
            await removeLocalFile(root, relative);
            delete baselines[relative];
          } else {
            const created = await createRemoteFile(workspaceId, snapshot.revision, relative, localText);
            baselines[created.path] = { fileId: created.id, hash: hash(localText), revision: created.revision };
          }
          itemComplete = true;
          return;
        }
        if (!remote) { delete baselines[relative]; itemComplete = true; return; }
        const remoteNeedsRead = !baseline || baseline.fileId !== remote.id || baseline.revision !== remote.revision;
        const remoteContent = remoteNeedsRead ? (remoteReads.get(remote.id) ?? await readRemoteText(workspaceId, remote)) : null;
        const remoteText = remoteContent?.text;
        const actualLocal = localText;
        if (actualLocal === undefined) {
          if (baseline) {
            await request(`/api/workspaces/${encodeURIComponent(workspaceId)}/operations`, "POST", {
              operationId: randomUUID(), baseRevision: snapshot.revision, clientId: "desktop-sync-bridge",
              operation: { type: "delete", fileId: remote.id },
            });
            delete baselines[relative];
          } else {
            const text = remoteText ?? (await readRemoteText(workspaceId, remote)).text;
            await writeAtomic(root, relative, text);
            baselines[relative] = { fileId: remote.id, hash: hash(text), revision: remoteContent?.revision ?? remote.revision };
          }
          itemComplete = true;
          return;
        }
        const localHash = hash(actualLocal);
        if (!baseline) {
          if (localHash === hash(remoteText ?? "")) {
            baselines[relative] = { fileId: remote.id, hash: localHash, revision: remoteContent?.revision ?? remote.revision };
          } else {
            const conflict = await conflictCopy(root, relative, actualLocal);
            const created = await createRemoteFile(workspaceId, snapshot.revision, conflict, actualLocal);
            baselines[created.path] = { fileId: created.id, hash: localHash, revision: created.revision };
            await writeAtomic(root, relative, remoteText ?? "");
            baselines[relative] = { fileId: remote.id, hash: hash(remoteText ?? ""), revision: remoteContent?.revision ?? remote.revision };
          }
          itemComplete = true;
          return;
        }
        const localChanged = localHash !== baseline.hash;
        const remoteChanged = remote.id !== baseline.fileId || (remoteContent !== null && remoteContent.revision !== baseline.revision);
        if (localChanged && remoteChanged) {
          const localCopy = await conflictCopy(root, relative, actualLocal);
          const created = await createRemoteFile(workspaceId, snapshot.revision, localCopy, actualLocal);
          baselines[created.path] = { fileId: created.id, hash: localHash, revision: created.revision };
          const text = remoteText ?? (await readRemoteText(workspaceId, remote)).text;
          await writeAtomic(root, relative, text);
          baselines[relative] = { fileId: remote.id, hash: hash(text), revision: remoteContent?.revision ?? remote.revision };
        } else if (localChanged) {
          const nextRevision = await replaceRemoteText(workspaceId, remote, remoteText ?? (await readRemoteText(workspaceId, remote)).text, actualLocal);
          baselines[relative] = { fileId: remote.id, hash: localHash, revision: nextRevision };
        } else if (remoteChanged) {
          const text = remoteText ?? (await readRemoteText(workspaceId, remote)).text;
          await writeAtomic(root, relative, text);
          baselines[relative] = { fileId: remote.id, hash: hash(text), revision: remoteContent?.revision ?? remote.revision };
        }
        itemComplete = true;
        } finally {
          if (itemComplete) completed++;
          reportProgress();
        }
      };
      let nextPath = 0;
      let firstError: unknown;
      const worker = async () => {
        while (true) {
          const index = nextPath++;
          if (index >= total) return;
          try { await reconcilePath(paths[index]); }
          catch (error) { firstError ??= error; }
        }
      };
      await Promise.all(Array.from({ length: Math.min(6, total) }, () => worker()));
      await save();
      if (firstError) throw firstError;
      const conflictFiles = [...new Set([...local.keys(), ...Object.keys(baselines)])].filter((relative) => /\.local-conflict-[^/]+\.md$/i.test(relative));
      setStatus(workspaceId, { state: "synced", progress: { completed: total, total, percent: 100 }, enabled: true, folderPath: root, lastScannedAt: Date.now(), lastSyncedAt: Date.now(), pendingFiles: 0, conflictFiles, error: null });
    } catch (error) {
      await save().catch(() => {});
      const message = error instanceof Error ? error.message : "Folder sync failed";
      setStatus(workspaceId, { state: /fetch|network|offline|connection/i.test(message) ? "offline" : "error", enabled: true, folderPath: config.folderPath, lastScannedAt: Date.now(), pendingFiles: 1, error: message });
    }
  })().finally(() => running.delete(workspaceId));
  running.set(workspaceId, job);
  return job;
}

function schedule(workspaceId: string): void {
  const previous = timers.get(workspaceId);
  if (previous) clearTimeout(previous);
  timers.set(workspaceId, setTimeout(() => { timers.delete(workspaceId); void syncOnce(workspaceId); }, 800));
}
function stopRuntime(workspaceId: string): void {
  watchers.get(workspaceId)?.close(); watchers.delete(workspaceId);
  const poll = pollers.get(workspaceId); if (poll) clearInterval(poll); pollers.delete(workspaceId);
  const timer = timers.get(workspaceId); if (timer) clearTimeout(timer); timers.delete(workspaceId);
}
function startRuntime(workspaceId: string, folderPath: string): void {
  stopRuntime(workspaceId);
  try {
    const watcher = watch(folderPath, { recursive: true }, () => schedule(workspaceId));
    watcher.on("error", () => { watcher.close(); watchers.delete(workspaceId); schedule(workspaceId); });
    watchers.set(workspaceId, watcher);
  }
  catch { /* Periodic reconciliation remains available if native recursive watching is unsupported. */ }
  pollers.set(workspaceId, setInterval(() => schedule(workspaceId), 15_000));
  schedule(workspaceId);
}

export async function configurePkmsSyncBridge(workspaceId: string, folderPath: string, excludedPaths: string[] = []): Promise<PkmsSyncBridgeStatus> {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(workspaceId)) throw new Error("invalid_workspace_id");
  const root = await fs.realpath(path.resolve(folderPath));
  const stat = await fs.stat(root);
  if (!stat.isDirectory()) throw new Error("folder_required");
  const state = await load();
  state.configs[workspaceId] = { folderPath: root, excludedPaths: excludedPaths.map((item) => item.trim()).filter(Boolean).slice(0, 100) };
  state.baselines[workspaceId] ??= {};
  await save();
  setStatus(workspaceId, { enabled: true, folderPath: root, excludedPaths: state.configs[workspaceId].excludedPaths, state: "syncing", error: null });
  startRuntime(workspaceId, root);
  return status(workspaceId);
}
export async function disconnectPkmsSyncBridge(workspaceId: string): Promise<PkmsSyncBridgeStatus> {
  stopRuntime(workspaceId);
  const state = await load(); delete state.configs[workspaceId];
  await save();
  return setStatus(workspaceId, { enabled: false, folderPath: null, excludedPaths: [], state: "disconnected", progress: null, pendingFiles: 0, conflictFiles: [], error: null });
}
export async function getPkmsSyncBridgeStatus(workspaceId: string): Promise<PkmsSyncBridgeStatus> {
  const config = (await load()).configs[workspaceId];
  if (config && !pollers.has(workspaceId)) {
    setStatus(workspaceId, { enabled: true, folderPath: config.folderPath, excludedPaths: config.excludedPaths ?? [], state: "offline" });
    startRuntime(workspaceId, config.folderPath);
  }
  return status(workspaceId);
}
export async function scanPkmsSyncBridge(workspaceId: string): Promise<PkmsSyncBridgeStatus> {
  await syncOnce(workspaceId);
  return status(workspaceId);
}
export async function updatePkmsSyncBridgeExclusions(workspaceId: string, excludedPaths: string[]): Promise<PkmsSyncBridgeStatus> {
  const state = await load();
  const config = state.configs[workspaceId];
  if (!config) throw new Error("sync_bridge_not_connected");
  config.excludedPaths = excludedPaths.map((item) => item.trim()).filter(Boolean).slice(0, 100);
  await save();
  setStatus(workspaceId, { excludedPaths: config.excludedPaths });
  schedule(workspaceId);
  return status(workspaceId);
}

export async function startConfiguredPkmsSyncBridges(): Promise<void> {
  const config = await load();
  for (const [workspaceId, value] of Object.entries(config.configs)) {
    try { await fs.access(value.folderPath); setStatus(workspaceId, { enabled: true, folderPath: value.folderPath, excludedPaths: value.excludedPaths ?? [], state: "syncing" }); startRuntime(workspaceId, value.folderPath); }
    catch { setStatus(workspaceId, { enabled: true, folderPath: value.folderPath, excludedPaths: value.excludedPaths ?? [], state: "error", error: "Connected folder is unavailable." }); }
  }
}
export function stopPkmsSyncBridges(): void { for (const workspaceId of [...watchers.keys(), ...pollers.keys()]) stopRuntime(workspaceId); }
