import * as fs from "node:fs";
import * as path from "node:path";
import { Pty } from "./pty";
import { PtySession } from "./ptySession";
import { defaultLayout, extractTerminalIds } from "./layout";
import { salvageLayoutJson } from "../shared/layoutSalvage";
import * as files from "./files";
import type { DirEntry } from "./files";
import * as search from "./search";
import { MEDIA_MIME_TYPES, toMediaUrl } from "./mediaProtocol";
import { openEpub, type EpubBook } from "./epub";
import { toEngineBundleUrl } from "./engineBundlePaths";
import { registerProjectApp as registerProjectApp_ } from "./projectManifest";
import type { ProjectManifest } from "../shared/projectManifest";

// Direct port of crates/workspace-core/src/workspace.rs.

export interface TabInfo {
  id: number;
  title: string;
  layoutJson: string;
  rootPath: string;
}

export interface WorkspaceState {
  tabs: TabInfo[];
  activeTabId: number;
}

interface Tab {
  id: number;
  title: string;
  layoutJson: string;
  rootPath: string;
}

interface TerminalEntry {
  session: PtySession;
}

export class Workspace {
  /** Root new tabs are seeded with. Each tab can then repoint its own
   * rootPath independently via setTabRootPath — this is only the
   * starting point for tabs created after that point. */
  defaultRootPath: string;
  private tabs: Tab[] = [];
  private activeTabId = 0;
  private terminals = new Map<number, TerminalEntry>();
  private nextTerminalId = 0;
  private nextTabId = 0;
  /** Fired whenever a terminal produces output for an attached renderer. */
  onTerminalData: ((id: number, seq: number, data: Buffer) => void) | null = null;

  private constructor(rootPath: string) {
    this.defaultRootPath = rootPath;
  }

  static withRoot(rootPath: string): Workspace {
    const ws = new Workspace(rootPath);
    ws.addTab();
    return ws;
  }

  /** Rebuilds a Workspace from a previously-persisted WorkspaceState
   * instead of starting with a single fresh tab. Reuses every tab's
   * original id and spawns a terminal for each id actually referenced in
   * that tab's layoutJson. PtySession replay restores output while the
   * app is running; across a full app restart, each terminal instead
   * reattaches to its own tmux session (see pty.ts) — the shell and
   * everything running in it survived the restart on the OS side, so
   * there's no scrollback to replay, just a live reattach. */
  static fromSnapshot(rootPath: string, snapshot: WorkspaceState): Workspace {
    if (snapshot.tabs.length === 0) return Workspace.withRoot(rootPath);

    const ws = new Workspace(rootPath);
    let nextTabId = 0;
    let nextTerminalId = 0;

    for (const tab of snapshot.tabs) {
      nextTabId = Math.max(nextTabId, tab.id + 1);
      const tabRoot = isDir(tab.rootPath) ? tab.rootPath : rootPath;
      const { json: layoutJson } = salvageLayoutJson(tab.layoutJson);

      for (const terminalId of extractTerminalIds(layoutJson)) {
        nextTerminalId = Math.max(nextTerminalId, terminalId + 1);
        ws.spawnTerminalWithId(terminalId, 120, 40, tabRoot);
      }

      ws.tabs.push({ id: tab.id, title: tab.title, layoutJson, rootPath: tabRoot });
    }

    ws.nextTabId = nextTabId;
    ws.nextTerminalId = nextTerminalId;
    ws.activeTabId = ws.tabs.some((t) => t.id === snapshot.activeTabId)
      ? snapshot.activeTabId
      : ws.tabs[0].id;

    return ws;
  }

  addTab(): number {
    const id = this.nextTabId++;
    const rootPath = this.defaultRootPath;
    const terminalId = this.spawnTerminalIn(rootPath, 120, 40);
    this.tabs.push({ id, title: `Tab ${id + 1}`, layoutJson: defaultLayout(terminalId), rootPath });
    this.activeTabId = id;
    return id;
  }

  closeTab(tabId: number): void {
    if (this.tabs.length <= 1) throw new Error("cannot close the last tab");
    const idx = this.tabs.findIndex((t) => t.id === tabId);
    if (idx === -1) throw new Error("tab not found");

    const [tab] = this.tabs.splice(idx, 1);
    this.releaseTerminalsOnlyInTab(tab.layoutJson);

    if (this.activeTabId === tabId) {
      const next = Math.min(idx, this.tabs.length - 1);
      this.activeTabId = this.tabs[next].id;
    }
  }

  selectTab(tabId: number): void {
    if (this.tabs.some((t) => t.id === tabId)) this.activeTabId = tabId;
  }

  renameTab(tabId: number, title: string): void {
    const tab = this.tabs.find((t) => t.id === tabId);
    if (!tab) throw new Error("tab not found");
    const trimmed = title.trim();
    if (!trimmed) throw new Error("title cannot be empty");
    tab.title = trimmed;
  }

  /** Reorders tabs to match `orderedIds` — must be exactly the current
   * tab ids, just permuted (a drag-and-drop reorder never adds/removes a
   * tab). Silently ignored if it isn't, rather than partially applying a
   * stale drag payload from before a tab closed mid-drag. */
  reorderTabs(orderedIds: number[]): void {
    if (orderedIds.length !== this.tabs.length) return;
    const byId = new Map(this.tabs.map((t) => [t.id, t]));
    const reordered = orderedIds.map((id) => byId.get(id));
    if (reordered.some((t) => !t)) return;
    this.tabs = reordered as Tab[];
  }

  setTabLayout(tabId: number, layoutJson: string): void {
    const tab = this.tabs.find((t) => t.id === tabId);
    if (!tab) return;

    const oldIds = new Set(extractTerminalIds(tab.layoutJson));
    tab.layoutJson = layoutJson;
    const newIds = new Set(extractTerminalIds(layoutJson));

    for (const id of oldIds) {
      if (!newIds.has(id) && !this.isTerminalReferenced(id)) {
        this.terminals.get(id)?.session.disposeAndDestroySession();
        this.terminals.delete(id);
      }
    }
  }

  spawnTerminal(cols: number, rows: number): number {
    const root = this.tabs.find((t) => t.id === this.activeTabId)?.rootPath ?? this.defaultRootPath;
    return this.spawnTerminalIn(root, cols, rows);
  }

  private spawnTerminalIn(root: string, cols: number, rows: number): number {
    const id = this.nextTerminalId++;
    this.spawnTerminalWithId(id, cols, rows, root);
    return id;
  }

  private spawnTerminalWithId(id: number, cols: number, rows: number, root: string): void {
    const pty = new Pty({ cols, rows, cwd: root });
    pty.start();
    const session = new PtySession(id, pty, cols, rows);
    session.setOnData((terminalId, seq, data) => {
      this.onTerminalData?.(terminalId, seq, data);
    });
    this.terminals.set(id, { session });
  }

  connectTerminal(id: number, webContentsId: number) {
    const entry = this.terminals.get(id);
    if (!entry) throw new Error("terminal not found");
    return entry.session.connect(webContentsId);
  }

  disconnectTerminal(id: number, webContentsId: number): void {
    const entry = this.terminals.get(id);
    if (!entry) return;
    entry.session.disconnect(webContentsId);
  }

  getTerminalSession(id: number): PtySession | undefined {
    return this.terminals.get(id)?.session;
  }

  /** Existing terminals keep their own cwd — only ones spawned after this
   * takes effect. Rejects anything that isn't an existing directory. */
  setTabRootPath(tabId: number, rootPath: string): void {
    if (!isDir(rootPath)) throw new Error(`not a directory: ${rootPath}`);
    const tab = this.tabs.find((t) => t.id === tabId);
    if (!tab) throw new Error("tab not found");
    tab.rootPath = rootPath;
  }

  tabRootPath(tabId: number): string | undefined {
    return this.tabs.find((t) => t.id === tabId)?.rootPath;
  }

  terminalWrite(id: number, data: Buffer): void {
    this.terminals.get(id)?.session.write(data);
  }

  terminalResize(id: number, cols: number, rows: number): void {
    const entry = this.terminals.get(id);
    if (!entry) return;
    entry.session.resize(cols, rows);
  }

  state(): WorkspaceState {
    return {
      tabs: this.tabs.map((t) => ({ id: t.id, title: t.title, layoutJson: t.layoutJson, rootPath: t.rootPath })),
      activeTabId: this.activeTabId,
    };
  }

  listDir(tabId: number, rel: string): DirEntry[] {
    return files.listDir(this.tabRoot(tabId), rel);
  }
  readFile(tabId: number, rel: string): string {
    return files.readFile(this.tabRoot(tabId), rel);
  }
  readFileBinaryPreview(tabId: number, rel: string): files.BinaryFilePreview | null {
    return files.readFileBinaryPreview(this.tabRoot(tabId), rel);
  }
  writeFile(tabId: number, rel: string, content: string): void {
    files.writeFile(this.tabRoot(tabId), rel, content);
  }
  createDir(tabId: number, rel: string): void {
    files.createDir(this.tabRoot(tabId), rel);
  }
  deletePath(tabId: number, rel: string): void {
    files.deletePath(this.tabRoot(tabId), rel);
  }
  renamePath(tabId: number, fromRel: string, toRel: string): void {
    files.renamePath(this.tabRoot(tabId), fromRel, toRel);
  }

  searchInFiles(
    tabId: number,
    query: string,
    opts: search.SearchOptions,
    onFile: (result: search.SearchFileResult) => void,
    onDone: (error?: string) => void,
  ): search.ActiveSearch {
    return search.searchInFiles(this.tabRoot(tabId), query, opts, onFile, onDone);
  }
  listAllFiles(tabId: number): Promise<string[]> {
    return search.listAllFiles(this.tabRoot(tabId));
  }

  /** Every currently-open tab's root — the media protocol handler confines
   * requests against all of them, not just the tab active when playback
   * started (a media file's owning tab may not be the visible one). */
  allTabRootPaths(): string[] {
    return [this.defaultRootPath, ...this.tabs.map((t) => t.rootPath)];
  }

  mediaUrl(tabId: number, rel: string): string | null {
    const ext = path.extname(rel).toLowerCase();
    if (!(ext in MEDIA_MIME_TYPES)) return null;
    const resolved = files.resolveUnderRoot(this.tabRoot(tabId), rel);
    return toMediaUrl(resolved);
  }

  openEpub(tabId: number, rel: string): Promise<EpubBook> {
    return openEpub(this.tabRoot(tabId), rel);
  }

  /** `rel` is a workspace-relative *directory* holding an already-built
   * engine Web export (index.html + its .js/.wasm/.pck siblings) — see
   * engineBundleProtocol.ts. Resolved through the same
   * files.resolveUnderRoot confinement every other file op here uses. */
  engineBundleUrl(tabId: number, rel: string, entry?: string): string {
    const resolved = files.resolveUnderRoot(this.tabRoot(tabId), rel);
    return toEngineBundleUrl(resolved, entry);
  }

  /** Registers one app/document entry into `tabId`'s project (keyed by
   * its rootPath) — see projectManifest.ts. `rel` is stored as-given
   * (workspace-relative), not resolved to an absolute path, so the entry
   * stays valid if the project ever moves on disk. */
  registerProjectApp(tabId: number, kind: string, rel: string, title?: string): ProjectManifest {
    return registerProjectApp_(this.tabRoot(tabId), { id: rel, kind, path: rel, title });
  }

  disposeAllTerminals(): void {
    for (const entry of this.terminals.values()) entry.session.dispose();
    this.terminals.clear();
  }

  private tabRoot(tabId: number): string {
    const root = this.tabs.find((t) => t.id === tabId)?.rootPath;
    if (!root) throw new Error("tab not found");
    return root;
  }

  private isTerminalReferenced(terminalId: number): boolean {
    return this.tabs.some((t) => extractTerminalIds(t.layoutJson).includes(terminalId));
  }

  private releaseTerminalsOnlyInTab(layoutJson: string): void {
    for (const id of extractTerminalIds(layoutJson)) {
      if (!this.isTerminalReferenced(id)) {
        this.terminals.get(id)?.session.disposeAndDestroySession();
        this.terminals.delete(id);
      }
    }
  }
}

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}
