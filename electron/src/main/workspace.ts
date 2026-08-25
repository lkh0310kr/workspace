import * as fs from "node:fs";
import { Pty } from "./pty";
import { PtySession } from "./ptySession";
import { defaultLayout, extractTerminalIds } from "./layout";
import * as files from "./files";
import type { DirEntry } from "./files";

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
   * that tab's layoutJson — this is what makes a terminal's tmux
   * session-key-by-id reattach to the *same* session it had before. */
  static fromSnapshot(rootPath: string, snapshot: WorkspaceState): Workspace {
    if (snapshot.tabs.length === 0) return Workspace.withRoot(rootPath);

    const ws = new Workspace(rootPath);
    let nextTabId = 0;
    let nextTerminalId = 0;

    for (const tab of snapshot.tabs) {
      nextTabId = Math.max(nextTabId, tab.id + 1);
      const tabRoot = isDir(tab.rootPath) ? tab.rootPath : rootPath;

      for (const terminalId of extractTerminalIds(tab.layoutJson)) {
        nextTerminalId = Math.max(nextTerminalId, terminalId + 1);
        ws.spawnTerminalWithId(terminalId, 120, 40, tabRoot);
      }

      ws.tabs.push({ id: tab.id, title: tab.title, layoutJson: tab.layoutJson, rootPath: tabRoot });
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

  setTabLayout(tabId: number, layoutJson: string): void {
    const tab = this.tabs.find((t) => t.id === tabId);
    if (!tab) return;

    const oldIds = new Set(extractTerminalIds(tab.layoutJson));
    tab.layoutJson = layoutJson;
    const newIds = new Set(extractTerminalIds(layoutJson));

    for (const id of oldIds) {
      if (!newIds.has(id) && !this.isTerminalReferenced(id)) {
        this.terminals.get(id)?.session.dispose();
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
    // `workspace-term-<id>` — the session-key convention every terminal's
    // tmux reattachment depends on (see pty.ts).
    const pty = new Pty({ cols, rows, cwd: root, sessionKey: `workspace-term-${id}` });
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
        this.terminals.get(id)?.session.dispose();
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
