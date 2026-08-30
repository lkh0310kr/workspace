import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type RefObject,
} from "react";
import {
  DirEntry,
  createDir,
  deletePath,
  listDir,
  onFileChanged,
  renamePath,
  revealItemInDir,
  writeFile,
} from "../fileSystem";
import { classifyAssetType } from "../../../shared/asset";
import { TextPrompt } from "./TextPrompt";
import { ConfirmPrompt } from "./ConfirmPrompt";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";
import type { AnchorRect } from "./Popover";
import { onWorkspaceDismissPortals } from "../workspacePortalDismiss";
import {
  ancestorDirPaths,
  loadExplorerTreeState,
  resetExplorerTreeState,
  saveExplorerExpanded,
  saveExplorerScrollTop,
} from "../explorer/explorerState";
import { dirsToReloadForChange } from "../explorer/treeReload";
import { useExplorerKeyboard } from "../explorer/useExplorerKeyboard";
import { projectVisibleRows } from "../explorer/useTreeProjection";

interface Props {
  tabId: number;
  rootPath: string;
  explorerStateKey: string;
  scrollContainerRef?: RefObject<HTMLElement | null>;
  paneHostRef?: RefObject<HTMLElement | null>;
  selectedPath?: string | null;
  paneVisible?: boolean;
  explorerModeActive?: boolean;
  onOpenFile: (path: string, kind: "code" | "markdown" | "viewer", pin?: boolean) => void;
  onPathRenamed?: (from: string, to: string) => void;
  onPathDeleted?: (path: string) => void;
  onOpenAsApp?: (path: string) => void;
  onExportGodotWeb?: (path: string) => void;
  onOpenWorldEngineProject?: (path: string) => void;
}

interface DirState {
  entries: DirEntry[];
  loaded: boolean;
}

interface MenuState {
  x: number;
  y: number;
  dir: string;
  entry: DirEntry | null;
}

interface ConfirmState {
  anchor: AnchorRect;
  title: string;
  message: string;
  onConfirm: () => void;
}

export function classifyFile(name: string): "code" | "markdown" | "viewer" {
  const type = classifyAssetType(name);
  if (type === "markdown") return "markdown";
  if (type === "unknown") return "code";
  return "viewer";
}

function dirOf(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "" : path.slice(0, idx);
}

function baseName(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? path : path.slice(idx + 1);
}

function joinPath(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name;
}

function rowAnchor(entry: DirEntry, treeEl: HTMLElement | null): AnchorRect {
  const row = treeEl?.querySelector<HTMLElement>(`[data-tree-path="${entry.path.replace(/"/g, '\\"')}"]`);
  if (row) {
    const r = row.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
  }
  return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 };
}

async function findAvailableName(tabId: number, dir: string, base: string, ext: string) {
  const entries = await listDir(tabId, dir).catch(() => []);
  const names = new Set(entries.map((e) => e.name.toLowerCase()));
  const first = `${base}${ext}`;
  if (!names.has(first.toLowerCase())) return first;
  let i = 1;
  while (names.has(`${base} ${i}${ext}`.toLowerCase())) i++;
  return `${base} ${i}${ext}`;
}

const TREE_DRAG_MIME = "application/x-workspace-tree-paths";

interface FlatRow {
  entry: DirEntry;
  depth: number;
}

function flattenVisible(dirs: Map<string, DirState>, expanded: Set<string>, dir: string, depth: number, out: FlatRow[]): void {
  const state = dirs.get(dir);
  if (!state) return;
  for (const entry of state.entries) {
    out.push({ entry, depth });
    if (entry.is_dir && expanded.has(entry.path)) {
      flattenVisible(dirs, expanded, entry.path, depth + 1, out);
    }
  }
}

export function TreeView({
  tabId,
  rootPath,
  explorerStateKey,
  scrollContainerRef,
  paneHostRef,
  selectedPath,
  paneVisible = true,
  explorerModeActive = true,
  onOpenFile,
  onPathRenamed,
  onPathDeleted,
  onOpenAsApp,
  onExportGodotWeb,
  onOpenWorldEngineProject,
}: Props) {
  const treeRef = useRef<HTMLDivElement>(null);
  const suppressRevealPathRef = useRef<string | null>(null);
  const pendingRevealPathRef = useRef<string | null>(null);
  const [dirs, setDirs] = useState<Map<string, DirState>>(new Map());
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(loadExplorerTreeState(explorerStateKey, rootPath).expanded));
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [prompt, setPrompt] = useState<{
    anchor: AnchorRect;
    title: string;
    defaultValue: string;
    onSubmit: (value: string) => void;
  } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectionAnchor, setSelectionAnchor] = useState<string | null>(null);
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  const loadDir = useCallback(
    (path: string) => {
      listDir(tabId, path)
        .then((entries) => {
          setDirs((prev) => new Map(prev).set(path, { entries, loaded: true }));
        })
        .catch(console.error);
    },
    [tabId],
  );

  const setExpandedPersisted = useCallback(
    (updater: (prev: Set<string>) => Set<string>) => {
      setExpanded((prev) => {
        const next = updater(prev);
        saveExplorerExpanded(explorerStateKey, rootPath, next);
        return next;
      });
    },
    [explorerStateKey, rootPath],
  );

  const prevRootRef = useRef<string | null>(null);

  useEffect(() => {
    if (prevRootRef.current !== null && prevRootRef.current !== rootPath) {
      resetExplorerTreeState(explorerStateKey, rootPath);
    }
    prevRootRef.current = rootPath;
    const restored = loadExplorerTreeState(explorerStateKey, rootPath);
    setDirs(new Map());
    setExpanded(new Set(restored.expanded));
    setSelected(new Set());
    setSelectionAnchor(null);
    loadDir("");
  }, [tabId, rootPath, explorerStateKey, loadDir]);

  useEffect(() => {
    const el = scrollContainerRef?.current;
    if (!el) return;
    const restored = loadExplorerTreeState(explorerStateKey, rootPath);
    el.scrollTop = restored.scrollTop;
    const onScroll = () => {
      setScrollTop(el.scrollTop);
      saveExplorerScrollTop(explorerStateKey, rootPath, el.scrollTop);
    };
    const onResize = () => setViewportHeight(el.clientHeight);
    onResize();
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(onResize);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, [scrollContainerRef, explorerStateKey, rootPath]);

  useEffect(() => {
    const unlisten = onFileChanged((paths) => {
      const fullReload = paths.length === 0 || paths.every((p) => !p);
      if (fullReload) {
        loadDir("");
        for (const path of expanded) loadDir(path);
        return;
      }
      const toReload = new Set<string>();
      for (const p of paths) {
        for (const d of dirsToReloadForChange(p, expanded)) toReload.add(d);
      }
      for (const d of toReload) loadDir(d);
    });
    return unlisten;
  }, [loadDir, expanded]);

  useEffect(() => {
    if (!selectedPath || !explorerModeActive) return;
    if (suppressRevealPathRef.current === selectedPath) {
      suppressRevealPathRef.current = null;
      return;
    }
    const ancestors = ancestorDirPaths(selectedPath);
    if (ancestors.length > 0) {
      setExpandedPersisted((prev) => {
        const next = new Set(prev);
        for (const a of ancestors) next.add(a);
        return next;
      });
      for (const a of ancestors) {
        if (!dirs.get(a)?.loaded) loadDir(a);
      }
    }
    pendingRevealPathRef.current = selectedPath;
  }, [selectedPath, explorerModeActive, dirs, loadDir, setExpandedPersisted]);

  useEffect(() => {
    const dismissOverlayUi = () => {
      setMenu(null);
      setPrompt(null);
      setConfirm(null);
    };
    return onWorkspaceDismissPortals(dismissOverlayUi);
  }, []);

  useEffect(() => {
    if (paneVisible) return;
    setMenu(null);
    setPrompt(null);
    setConfirm(null);
  }, [paneVisible]);

  const flatList = useMemo(() => {
    const out: FlatRow[] = [];
    flattenVisible(dirs, expanded, "", 0, out);
    return out;
  }, [dirs, expanded]);

  const projection = useMemo(
    () => projectVisibleRows(flatList, scrollTop, viewportHeight),
    [flatList, scrollTop, viewportHeight],
  );

  useEffect(() => {
    const path = pendingRevealPathRef.current;
    if (!path) return;
    const row = treeRef.current?.querySelector<HTMLElement>(`[data-tree-path="${path.replace(/"/g, '\\"')}"]`);
    if (row) {
      row.scrollIntoView({ block: "nearest" });
      pendingRevealPathRef.current = null;
    }
  }, [flatList, dirs, projection]);

  const toggle = (path: string) => {
    setExpandedPersisted((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
        if (!dirs.get(path)?.loaded) loadDir(path);
      }
      return next;
    });
  };

  const refresh = (dir: string) => loadDir(dir);

  const focusedEntry = useCallback((): DirEntry | null => {
    const path = selectionAnchor ?? selectedPath ?? [...selected][0] ?? null;
    if (!path) return flatList[0]?.entry ?? null;
    return flatList.find((r) => r.entry.path === path)?.entry ?? flatList[0]?.entry ?? null;
  }, [selectionAnchor, selectedPath, selected, flatList]);

  const scrollRowIntoView = (path: string) => {
    treeRef.current
      ?.querySelector<HTMLElement>(`[data-tree-path="${path.replace(/"/g, '\\"')}"]`)
      ?.scrollIntoView({ block: "nearest" });
  };

  const handleRowClick = (
    e: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean },
    entry: DirEntry,
    action: (pin: boolean) => void,
  ) => {
    const path = entry.path;
    treeRef.current?.focus();
    if ((e.metaKey || e.ctrlKey) && !entry.is_dir) {
      setSelected(new Set([path]));
      setSelectionAnchor(path);
      suppressRevealPathRef.current = path;
      action(true);
      return;
    }
    if (e.shiftKey && selectionAnchor) {
      const fromIdx = flatList.findIndex((r) => r.entry.path === selectionAnchor);
      const toIdx = flatList.findIndex((r) => r.entry.path === path);
      if (fromIdx !== -1 && toIdx !== -1) {
        const [lo, hi] = fromIdx <= toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
        setSelected(new Set(flatList.slice(lo, hi + 1).map((r) => r.entry.path)));
        return;
      }
    }
    setSelected(new Set([path]));
    setSelectionAnchor(path);
    if (!entry.is_dir) suppressRevealPathRef.current = path;
    action(false);
  };

  const newFile = async (dir: string) => {
    setMenu(null);
    const name = await findAvailableName(tabId, dir, "untitled", ".md");
    const path = joinPath(dir, name);
    await writeFile(tabId, path, "").catch(console.error);
    onOpenFile(path, "markdown");
    refresh(dir);
  };

  const newFolder = (dir: string, anchor: AnchorRect) => {
    setMenu(null);
    setPrompt({
      anchor,
      title: "Folder name",
      defaultValue: "",
      onSubmit: async (name) => {
        await createDir(tabId, joinPath(dir, name)).catch((err) => alert(String(err)));
        setExpandedPersisted((prev) => new Set(prev).add(dir));
        refresh(dir);
      },
    });
  };

  const rename = (entry: DirEntry, anchor: AnchorRect) => {
    setMenu(null);
    setPrompt({
      anchor,
      title: "Rename to",
      defaultValue: entry.name,
      onSubmit: async (name) => {
        if (name === entry.name) return;
        const to = joinPath(dirOf(entry.path), name);
        await renamePath(tabId, entry.path, to).catch((err) => alert(String(err)));
        onPathRenamed?.(entry.path, to);
        refresh(dirOf(entry.path));
      },
    });
  };

  const targetPaths = (entry: DirEntry): string[] =>
    selected.has(entry.path) && selected.size > 1 ? [...selected] : [entry.path];

  const remove = async (entry: DirEntry, anchor?: AnchorRect) => {
    setMenu(null);
    const paths = targetPaths(entry);
    const label =
      paths.length > 1 ? `${paths.length} items` : `this ${entry.is_dir ? "folder (and everything in it)" : "file"}`;
    const scrollEl = scrollContainerRef?.current;
    const prevScroll = scrollEl?.scrollTop ?? 0;

    const runDelete = async () => {
      for (const p of paths) {
        await deletePath(tabId, p).catch((err) => alert(String(err)));
        onPathDeleted?.(p);
      }
      for (const d of new Set(paths.map(dirOf))) refresh(d);
      setSelected(new Set());
      requestAnimationFrame(() => {
        if (scrollEl) {
          scrollEl.scrollTop = Math.min(prevScroll, Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight));
        }
      });
    };

    const rect = anchor ?? rowAnchor(entry, treeRef.current);
    setConfirm({
      anchor: rect,
      title: "Delete",
      message: `Delete ${label}?\n\n${paths.join("\n")}`,
      onConfirm: () => void runDelete(),
    });
  };

  const copyPath = (entry: DirEntry, relative: boolean) => {
    setMenu(null);
    const paths = targetPaths(entry);
    const text = paths
      .map((p) => (relative ? p : `${rootPath.replace(/\/+$/, "")}/${p}`))
      .join("\n");
    navigator.clipboard.writeText(text).catch(console.error);
  };

  const reveal = (entry: DirEntry) => {
    setMenu(null);
    revealItemInDir(`${rootPath.replace(/\/+$/, "")}/${entry.path}`).catch(console.error);
  };

  const moveEntries = async (paths: string[], targetDir: string) => {
    for (const p of paths) {
      if (dirOf(p) === targetDir) continue;
      if (targetDir === p || targetDir.startsWith(`${p}/`)) continue;
      const to = joinPath(targetDir, baseName(p));
      await renamePath(tabId, p, to).catch((err) => alert(String(err)));
      onPathRenamed?.(p, to);
    }
    for (const d of new Set([...paths.map(dirOf), targetDir])) refresh(d);
    setSelected(new Set());
  };

  const onEntryDragStart = (e: DragEvent, entry: DirEntry) => {
    const paths = selected.has(entry.path) && selected.size > 1 ? [...selected] : [entry.path];
    e.dataTransfer.setData(TREE_DRAG_MIME, JSON.stringify(paths));
    e.dataTransfer.effectAllowed = "move";
  };

  const onFolderDragOver = (e: DragEvent, targetDir: string) => {
    if (!e.dataTransfer.types.includes(TREE_DRAG_MIME)) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOverPath(targetDir);
  };

  const onFolderDrop = (e: DragEvent, targetDir: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverPath(null);
    const raw = e.dataTransfer.getData(TREE_DRAG_MIME);
    if (!raw) return;
    try {
      const paths: string[] = JSON.parse(raw);
      void moveEntries(paths, targetDir);
    } catch (err) {
      console.error("tree-view: bad drag payload", err);
    }
  };

  const keyboardHandlers = useMemo(
    () => ({
      getFocusedEntry: focusedEntry,
      onDelete: () => {
        const entry = focusedEntry();
        if (entry) void remove(entry);
      },
      onRename: () => {
        const entry = focusedEntry();
        if (entry) rename(entry, rowAnchor(entry, treeRef.current));
      },
      onEnter: (entry: DirEntry) => {
        if (entry.is_dir) toggle(entry.path);
        else onOpenFile(entry.path, classifyFile(entry.name), true);
      },
      onMoveSelection: (delta: number) => {
        const entry = focusedEntry();
        const idx = entry ? flatList.findIndex((r) => r.entry.path === entry.path) : -1;
        const nextIdx = idx === -1 ? (delta > 0 ? 0 : flatList.length - 1) : Math.max(0, Math.min(flatList.length - 1, idx + delta));
        const next = flatList[nextIdx];
        if (!next) return;
        setSelected(new Set([next.entry.path]));
        setSelectionAnchor(next.entry.path);
        scrollRowIntoView(next.entry.path);
      },
      onCollapse: () => {
        const entry = focusedEntry();
        if (entry?.is_dir) {
          setExpandedPersisted((prev) => {
            const next = new Set(prev);
            next.delete(entry.path);
            return next;
          });
        }
      },
      onExpand: () => {
        const entry = focusedEntry();
        if (entry?.is_dir) {
          setExpandedPersisted((prev) => {
            const next = new Set(prev);
            next.add(entry.path);
            return next;
          });
          if (!dirs.get(entry.path)?.loaded) loadDir(entry.path);
        }
      },
    }),
    [focusedEntry, flatList, onOpenFile, dirs, loadDir, setExpandedPersisted],
  );

  useExplorerKeyboard(
    paneHostRef ?? { current: null },
    treeRef,
    paneVisible && explorerModeActive,
    keyboardHandlers,
  );

  const menuItems = useMemo((): ContextMenuItem[] => {
    if (!menu) return [];
    const clickAnchor: AnchorRect = {
      left: menu.x,
      right: menu.x,
      top: menu.y,
      bottom: menu.y,
      width: 0,
      height: 0,
    };
    const items: ContextMenuItem[] = [
      { type: "button", label: "New File", onClick: () => void newFile(menu.dir) },
      { type: "button", label: "New Folder", onClick: () => newFolder(menu.dir, clickAnchor) },
    ];
    if (!menu.entry) return items;

    if (menu.entry.is_dir && onOpenAsApp) {
      const dirEntries = dirs.get(menu.entry.path)?.entries;
      const hasWebBundle = dirEntries?.some(
        (e) => !e.is_dir && (e.name === "index.html" || e.name === "index.htm"),
      );
      if (hasWebBundle) {
        items.push({ type: "separator" });
        items.push({
          type: "button",
          label: "Open as App",
          onClick: () => {
            setMenu(null);
            onOpenAsApp(menu.entry!.path);
          },
        });
      }
    }
    if (
      menu.entry.is_dir &&
      onExportGodotWeb &&
      dirs.get(menu.entry.path)?.entries.some((e) => e.name === "project.godot")
    ) {
      items.push({
        type: "button",
        label: "Export Godot (Web) & Open",
        onClick: () => {
          setMenu(null);
          onExportGodotWeb(menu.entry!.path);
        },
      });
    }
    if (
      menu.entry.is_dir &&
      onOpenWorldEngineProject &&
      dirs.get(menu.entry.path)?.entries.some((e) => e.name === "world-engine.json")
    ) {
      items.push({
        type: "button",
        label: "Open in World Engine",
        onClick: () => {
          setMenu(null);
          onOpenWorldEngineProject(menu.entry!.path);
        },
      });
    }

    items.push({ type: "separator" });
    if (selected.size <= 1) {
      items.push({
        type: "button",
        label: "Rename",
        onClick: () => rename(menu.entry!, clickAnchor),
      });
    }
    items.push({
      type: "button",
      label: selected.size > 1 ? `Delete ${selected.size} items` : "Delete",
      onClick: () => void remove(menu.entry!, clickAnchor),
    });
    items.push({ type: "separator" });
    items.push({
      type: "button",
      label: "Copy Path",
      onClick: () => copyPath(menu.entry!, false),
    });
    items.push({
      type: "button",
      label: "Copy Relative Path",
      onClick: () => copyPath(menu.entry!, true),
    });
    if (selected.size <= 1) {
      items.push({
        type: "button",
        label: "Reveal in Finder",
        onClick: () => void reveal(menu.entry!),
      });
    }
    return items;
  }, [menu, selected, tabId, rootPath, onOpenAsApp, onExportGodotWeb, onOpenWorldEngineProject, dirs]);

  return (
    <div
      ref={treeRef}
      className="tree-view"
      tabIndex={0}
      onClick={() => setSelected(new Set())}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY, dir: "", entry: null });
      }}
      onDragOver={(e) => onFolderDragOver(e, "")}
      onDragLeave={() => setDragOverPath((p) => (p === "" ? null : p))}
      onDrop={(e) => onFolderDrop(e, "")}
    >
      <div style={{ paddingTop: projection.paddingTop, paddingBottom: projection.paddingBottom, minHeight: projection.totalHeight }}>
        {projection.rows.map(({ entry, depth }) => (
          <div
            key={entry.path}
            data-tree-path={entry.path}
            className={`tree-view-item${entry.path === selectedPath ? " active" : ""}${selected.has(entry.path) ? " selected" : ""}${dragOverPath === entry.path ? " drag-over" : ""}`}
            style={{ paddingLeft: depth * 14 + 8 }}
            draggable
            onDragStart={(e) => onEntryDragStart(e, entry)}
            onDragOver={entry.is_dir ? (e) => onFolderDragOver(e, entry.path) : undefined}
            onDragLeave={entry.is_dir ? () => setDragOverPath((p) => (p === entry.path ? null : p)) : undefined}
            onDrop={entry.is_dir ? (e) => onFolderDrop(e, entry.path) : undefined}
            onClick={(e) => {
              e.stopPropagation();
              handleRowClick(e, entry, (pin) =>
                entry.is_dir ? toggle(entry.path) : onOpenFile(entry.path, classifyFile(entry.name), pin),
              );
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (!entry.is_dir) onOpenFile(entry.path, classifyFile(entry.name), true);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!selected.has(entry.path)) {
                setSelected(new Set([entry.path]));
                setSelectionAnchor(entry.path);
              }
              setMenu({
                x: e.clientX,
                y: e.clientY,
                dir: entry.is_dir ? entry.path : dirOf(entry.path),
                entry,
              });
              if (entry.is_dir && !dirs.get(entry.path)?.loaded) loadDir(entry.path);
            }}
          >
            {Array.from({ length: depth }, (_, level) => (
              <span key={level} className="tree-view-guide" style={{ left: level * 14 + 14 }} />
            ))}
            <span className="tree-view-icon">
              {entry.is_dir ? (expanded.has(entry.path) ? "▾" : "▸") : "·"}
            </span>
            <span className="tree-view-name">{entry.name}</span>
          </div>
        ))}
      </div>
      {menu ? <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} /> : null}
      {prompt && (
        <TextPrompt
          anchorRect={prompt.anchor}
          title={prompt.title}
          defaultValue={prompt.defaultValue}
          onSubmit={prompt.onSubmit}
          onClose={() => setPrompt(null)}
        />
      )}
      {confirm && (
        <ConfirmPrompt
          anchorRect={confirm.anchor}
          title={confirm.title}
          message={confirm.message}
          onConfirm={confirm.onConfirm}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
