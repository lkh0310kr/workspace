/** Per-pane explorer tree UI state (expand + scroll), keyed by workspaceTabId:flexlayoutNodeId. */

export interface ExplorerTreeState {
  rootPath: string;
  expanded: string[];
  scrollTop: number;
}

const session = new Map<string, ExplorerTreeState>();
const EXPANDED_KEY = "workspace.explorerExpanded";
const SCROLL_KEY = "workspace.explorerScroll";
const ROOT_KEY = "workspace.explorerRoot";

function expandedStorageKey(stateKey: string): string {
  return `${EXPANDED_KEY}.${stateKey}`;
}

function scrollStorageKey(stateKey: string): string {
  return `${SCROLL_KEY}.${stateKey}`;
}

function rootStorageKey(stateKey: string): string {
  return `${ROOT_KEY}.${stateKey}`;
}

function readExpanded(stateKey: string, rootPath: string): string[] {
  try {
    if (localStorage.getItem(rootStorageKey(stateKey)) !== rootPath) return [];
    const raw = localStorage.getItem(expandedStorageKey(stateKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === "string") : [];
  } catch {
    return [];
  }
}

function readScroll(stateKey: string, rootPath: string): number {
  if (localStorage.getItem(rootStorageKey(stateKey)) !== rootPath) return 0;
  const raw = Number(localStorage.getItem(scrollStorageKey(stateKey)));
  return Number.isFinite(raw) && raw >= 0 ? raw : 0;
}

export function loadExplorerTreeState(stateKey: string, rootPath: string): ExplorerTreeState {
  const cached = session.get(stateKey);
  if (cached && cached.rootPath === rootPath) return cached;
  const next: ExplorerTreeState = {
    rootPath,
    expanded: readExpanded(stateKey, rootPath),
    scrollTop: readScroll(stateKey, rootPath),
  };
  session.set(stateKey, next);
  return next;
}

export function saveExplorerExpanded(stateKey: string, rootPath: string, expanded: Iterable<string>): void {
  const list = [...expanded];
  const next: ExplorerTreeState = {
    rootPath,
    expanded: list,
    scrollTop: session.get(stateKey)?.scrollTop ?? readScroll(stateKey, rootPath),
  };
  session.set(stateKey, next);
  try {
    localStorage.setItem(rootStorageKey(stateKey), rootPath);
    localStorage.setItem(expandedStorageKey(stateKey), JSON.stringify(list));
  } catch {
    // ignore quota errors
  }
}

export function saveExplorerScrollTop(stateKey: string, rootPath: string, scrollTop: number): void {
  const prev = session.get(stateKey);
  const next: ExplorerTreeState = {
    rootPath,
    expanded: prev?.expanded ?? readExpanded(stateKey, rootPath),
    scrollTop,
  };
  session.set(stateKey, next);
  try {
    localStorage.setItem(rootStorageKey(stateKey), rootPath);
    localStorage.setItem(scrollStorageKey(stateKey), String(scrollTop));
  } catch {
    // ignore
  }
}

export function resetExplorerTreeState(stateKey: string, rootPath: string): ExplorerTreeState {
  const next: ExplorerTreeState = { rootPath, expanded: [], scrollTop: 0 };
  session.set(stateKey, next);
  try {
    localStorage.removeItem(expandedStorageKey(stateKey));
    localStorage.removeItem(scrollStorageKey(stateKey));
    localStorage.removeItem(rootStorageKey(stateKey));
  } catch {
    // ignore
  }
  return next;
}

/** Parent directory paths to expand so `relativePath` is visible (excluding the file itself). */
export function ancestorDirPaths(relativePath: string): string[] {
  if (!relativePath) return [];
  const parts = relativePath.split("/").filter(Boolean);
  if (parts.length <= 1) return [];
  const out: string[] = [];
  let acc = "";
  for (let i = 0; i < parts.length - 1; i++) {
    acc = acc ? `${acc}/${parts[i]}` : parts[i];
    out.push(acc);
  }
  return out;
}
