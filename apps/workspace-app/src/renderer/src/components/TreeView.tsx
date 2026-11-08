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
  revealItemInDir,
} from "../fileSystem";
import { interactionCoordinator } from "../interaction/InteractionCoordinator";
import { moveFocusToRendererBeforeFocusedWebviewHidden } from "../layout/browserWebviewRegistry";
import { finishPaneDrag } from "../layout/layoutRef";
import { classifyAssetType } from "../../../shared/asset";
import { TextPrompt } from "./TextPrompt";
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
import { WorkbenchIcon, type WorkbenchIconName } from "./WorkbenchIcon";
import { confirmDirtyEditorDocumentsInPaths, EditorTreeRow, EditorTreeVirtualList, editorTreeSelectionRoots, flattenEditorTree, isEditorProviderError, nextEditorItemNameInDirectory, projectEditorTreeRows, resolveEditorTreeDirectory, resolveEditorTreePath, useEditorTreeSelection, type EditorTreeArrowAction, type EditorTreeNavigationRow } from "@workspace/editor";
import { acquireLocalEditorProvider } from "../editor/localEditorProvider";

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
}

interface DirState {
  entries: EditorDirEntry[];
  loaded: boolean;
}

interface EditorDirEntry extends DirEntry {
  editorItemId: string;
}

interface MenuState {
  x: number;
  y: number;
  dir: string;
  entry: DirEntry | null;
}

export function classifyFile(name: string): "code" | "markdown" | "viewer" {
  const type = classifyAssetType(name);
  if (type === "markdown") return "markdown";
  if (type === "unknown") return "code";
  return "viewer";
}

function treeEntryIconName(entry: DirEntry): WorkbenchIconName {
  if (entry.is_dir) return "explorer";
  const kind = classifyFile(entry.name);
  return kind === "markdown" ? "book" : kind === "viewer" ? "viewer" : "code";
}

/** Obsidian-style tree label: hide the `.md` suffix for markdown files. */
export function treeEntryDisplayName(name: string): string {
  return /\.md$/i.test(name) ? name.slice(0, -3) : name;
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

const TREE_DRAG_MIME = "application/x-workspace-tree-paths";

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
}: Props) {
  const editorProviderLease = useMemo(() => acquireLocalEditorProvider(tabId), [tabId]);
  const editorProvider = editorProviderLease.provider;
  const treeRef = useRef<HTMLDivElement>(null);
  const [dirs, setDirs] = useState<Map<string, DirState>>(new Map());
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(loadExplorerTreeState(explorerStateKey, rootPath).expanded));
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [prompt, setPrompt] = useState<{
    anchor: AnchorRect;
    title: string;
    defaultValue: string;
    onSubmit: (value: string) => void;
  } | null>(null);
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  const loadDir = useCallback(
    (path: string) => {
      const load = async () => {
        let parent: Awaited<ReturnType<typeof resolveEditorTreeDirectory>>;
        try {
          parent = await resolveEditorTreeDirectory(editorProvider, path);
        } catch (error) {
          if (isEditorProviderError(error) && error.code === "notFound") return;
          throw error;
        }
        const items = await editorProvider.listChildren(parent?.itemId ?? null);
        const entries: EditorDirEntry[] = items.map((item) => ({ name: item.name, path: item.path, is_dir: item.kind === "directory", editorItemId: item.itemId }));
        setDirs((prev) => new Map(prev).set(path, { entries, loaded: true }));
      };
      void load().catch(console.error);
    },
    [editorProvider],
  );

  useEffect(() => () => editorProviderLease.release(), [editorProviderLease]);

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
    for (const path of restored.expanded) {
      loadDir(path);
    }
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
    return editorProvider.subscribeTree((parentIds) => {
      const parentPaths = parentIds.map((parentId) => parentId === null ? "" : editorProvider.pathForItemId(parentId) ?? "");
      const fullReload = parentPaths.includes("");
      if (fullReload) {
        loadDir("");
        for (const path of expanded) loadDir(path);
        return;
      }
      const toReload = new Set<string>();
      for (const p of parentPaths) {
        for (const d of dirsToReloadForChange(p, expanded)) toReload.add(d);
      }
      for (const d of toReload) loadDir(d);
    });
  }, [editorProvider, loadDir, expanded]);

  useEffect(() => {
    const clearDrag = () => setDragOverPath(null);
    window.addEventListener("dragend", clearDrag);
    return () => window.removeEventListener("dragend", clearDrag);
  }, []);

  const revealAncestors = useCallback(
    (path: string) => {
      const ancestors = ancestorDirPaths(path);
      if (ancestors.length === 0) return;
      setExpandedPersisted((prev) => {
        const next = new Set(prev);
        for (const a of ancestors) next.add(a);
        return next;
      });
      for (const a of ancestors) {
        if (!dirs.get(a)?.loaded) loadDir(a);
      }
    },
    [dirs, loadDir, setExpandedPersisted],
  );

  const openFileFromTree = useCallback(
    (path: string, kind: "code" | "markdown" | "viewer", pin?: boolean) => {
      revealAncestors(path);
      onOpenFile(path, kind, pin);
    },
    [onOpenFile, revealAncestors],
  );

  useEffect(() => {
    const dismissOverlayUi = () => {
      setMenu(null);
      setPrompt(null);
    };
    return onWorkspaceDismissPortals(dismissOverlayUi);
  }, []);

  useEffect(() => {
    if (paneVisible) return;
    setMenu(null);
    setPrompt(null);
  }, [paneVisible]);

  const flatList = useMemo(() => {
    return flattenEditorTree(
      new Map([...dirs].map(([path, state]) => [path, state.entries.map((entry) => ({
        ...entry,
        name: entry.name,
        directory: entry.is_dir,
      }))])),
      expanded,
    ).map(({ item, depth }) => ({ entry: item, depth }));
  }, [dirs, expanded]);

  const treePaths = useMemo(() => flatList.map(({ entry }) => entry.path), [flatList]);
  const treeSelection = useEditorTreeSelection(treePaths);
  const selected = treeSelection.selectedPaths;
  const setSelected = treeSelection.setSelectedPaths;
  const selectionAnchor = treeSelection.anchorPath;
  const setSelectionAnchor = treeSelection.setAnchorPath;
  const keyboardFocusPath = treeSelection.focusedPath && treePaths.includes(treeSelection.focusedPath)
    ? treeSelection.focusedPath
    : null;

  useEffect(() => {
    if (!selectedPath || !explorerModeActive) return;
    setSelected(new Set([selectedPath]));
    setSelectionAnchor(selectedPath);
    treeSelection.setFocusedPath(selectedPath);
  }, [selectedPath, explorerModeActive, treeSelection.setFocusedPath]);

  const projection = useMemo(
    () => projectEditorTreeRows(flatList, scrollTop, viewportHeight),
    [flatList, scrollTop, viewportHeight],
  );

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
    const path = keyboardFocusPath ?? selectionAnchor ?? selectedPath ?? [...selected][0] ?? null;
    if (!path) return flatList[0]?.entry ?? null;
    return flatList.find((r) => r.entry.path === path)?.entry ?? flatList[0]?.entry ?? null;
  }, [keyboardFocusPath, selectionAnchor, selectedPath, selected, flatList]);

  const scrollRowIntoView = (path: string) => {
    treeRef.current
      ?.querySelector<HTMLElement>(`[data-tree-path="${path.replace(/"/g, '\\"')}"]`)
      ?.scrollIntoView({ block: "nearest" });
  };

  const handleRowClick = (
    e: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean },
    entry: DirEntry,
  ) => {
    const path = entry.path;
    treeRef.current?.focus();
    const modifiers = { additive: e.metaKey || e.ctrlKey, range: e.shiftKey };
    treeSelection.select(path, focusedEntry()?.path ?? null, modifiers);
    if (modifiers.additive || modifiers.range) return;
    if (entry.is_dir) {
      toggle(path);
    } else {
      openFileFromTree(path, classifyFile(entry.name), false);
    }
  };

  const newFile = async (dir: string) => {
    setMenu(null);
    let name: string;
    try {
      const result = await nextEditorItemNameInDirectory(editorProvider, dir, "untitled", ".md");
      name = result.name;
      const parent = result.parent;
      await editorProvider.create(parent?.itemId ?? null, "file", name);
    } catch (err) {
      window.alert(String(err));
      return;
    }
    const path = joinPath(dir, name);
    openFileFromTree(path, "markdown");
    refresh(dir);
  };

  const newFolder = (dir: string, anchor: AnchorRect) => {
    setMenu(null);
    setPrompt({
      anchor,
      title: "Folder name",
      defaultValue: "",
      onSubmit: async (name) => {
        try {
          const parent = await resolveEditorTreeDirectory(editorProvider, dir, "Parent directory no longer exists");
          await editorProvider.create(parent?.itemId ?? null, "directory", name);
          setExpandedPersisted((prev) => new Set(prev).add(dir));
          refresh(dir);
        } catch (error) {
          window.alert(String(error));
        }
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
        try {
          const ref = await resolveEditorTreePath(editorProvider, entry.path);
          if (!ref) throw new Error("Item no longer exists");
          await editorProvider.rename(ref, name);
        } catch (err) {
          window.alert(String(err));
          return;
        }
        onPathRenamed?.(entry.path, to);
        refresh(dirOf(entry.path));
      },
    });
  };

  const selectionRootPaths = (paths: readonly string[]): string[] => {
    const selectedPaths = new Set(paths);
    const knownEntries = new Map([...dirs.values()].flatMap((state) => state.entries).map((entry) => [entry.path, entry]));
    const candidates = paths.map((path) => knownEntries.get(path) ?? { path, is_dir: false, name: path.split("/").at(-1) ?? path });
    return editorTreeSelectionRoots(candidates, selectedPaths, (item) => item.is_dir).map((item) => item.path);
  };

  const targetPaths = (entry: DirEntry): string[] => {
    const paths = selected.has(entry.path) && selected.size > 1 ? [...selected] : [entry.path];
    return selectionRootPaths(paths);
  };

  const remove = async (entry: DirEntry) => {
    setMenu(null);
    const paths = targetPaths(entry);
    const label =
      paths.length > 1 ? `${paths.length} items` : `this ${entry.is_dir ? "folder (and everything in it)" : "file"}`;
    const scrollEl = scrollContainerRef?.current;
    const prevScroll = scrollEl?.scrollTop ?? 0;

    const confirmed = window.confirm(`Delete ${label}?\n\n${paths.join("\n")}`);
    if (!confirmed) return;
    if (!confirmDirtyEditorDocumentsInPaths(paths, (message) => window.confirm(message))) return;

    const deleted: string[] = [];
    for (const p of paths) {
      try {
        const ref = await resolveEditorTreePath(editorProvider, p);
        if (!ref) throw new Error("Item no longer exists");
        await editorProvider.delete([ref]);
        deleted.push(p);
        onPathDeleted?.(p);
      } catch (err) {
        window.alert(String(err));
        break;
      }
    }
    if (deleted.length === 0) return;
    for (const d of new Set(deleted.map(dirOf))) refresh(d);
    const remaining = paths.filter((path) => !deleted.includes(path));
    setSelected(new Set(remaining));
    if (selectionAnchor && deleted.includes(selectionAnchor)) {
      setSelectionAnchor(remaining[0] ?? null);
    }
    if (treeSelection.focusedPath && deleted.includes(treeSelection.focusedPath)) {
      treeSelection.setFocusedPath(remaining[0] ?? null);
    }
    moveFocusToRendererBeforeFocusedWebviewHidden();
    interactionCoordinator.reconcile("tree-delete-complete");
    finishPaneDrag();
    requestAnimationFrame(() => {
      if (scrollEl) {
        scrollEl.scrollTop = Math.min(prevScroll, Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight));
      }
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
    paths = selectionRootPaths(paths);
    const moved: string[] = [];
    for (const p of paths) {
      if (dirOf(p) === targetDir) continue;
      if (targetDir === p || targetDir.startsWith(`${p}/`)) continue;
      const to = joinPath(targetDir, baseName(p));
      try {
        const ref = await resolveEditorTreePath(editorProvider, p);
        if (!ref) throw new Error("Item no longer exists");
        const parent = await resolveEditorTreeDirectory(editorProvider, targetDir, "Destination directory no longer exists");
        await editorProvider.move([ref], parent?.itemId ?? null);
      } catch (err) {
        window.alert(String(err));
        continue;
      }
      moved.push(p);
      onPathRenamed?.(p, to);
    }
    if (moved.length === 0) return;
    for (const d of new Set([...moved.map(dirOf), targetDir])) refresh(d);
    setSelected((prev) => new Set([...prev].filter((path) => !moved.includes(path))));
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
    e.dataTransfer.dropEffect = "move";
    setDragOverPath(targetDir);
  };

  const onTreeDragOver = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes(TREE_DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverPath("");
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
        else openFileFromTree(entry.path, classifyFile(entry.name), true);
      },
      getVisibleRows: (): EditorTreeNavigationRow[] => flatList.map(({ entry, depth }) => ({
        path: entry.path,
        kind: entry.is_dir ? "directory" : classifyFile(entry.name) === "markdown" ? "markdown" : "code",
        depth,
      })),
      getExpandedPaths: () => expanded,
      onArrowAction: (action: EditorTreeArrowAction, extendSelection: boolean) => {
        if (action.type === "focus") {
          const next = flatList[action.index];
          if (!next) return;
          treeSelection.select(action.path, focusedEntry()?.path ?? null, { range: extendSelection });
          scrollRowIntoView(next.entry.path);
          requestAnimationFrame(() => treeRef.current?.querySelector<HTMLElement>(`[data-tree-path="${CSS.escape(next.entry.path)}"]`)?.focus());
          return;
        }
        const path = action.path;
        if (action.type === "collapse") {
          setExpandedPersisted((prev) => {
            const next = new Set(prev);
            next.delete(path);
            return next;
          });
          return;
        }
        setExpandedPersisted((prev) => new Set(prev).add(path));
        if (!dirs.get(path)?.loaded) loadDir(path);
      },
    }),
    [focusedEntry, flatList, openFileFromTree, dirs, loadDir, setExpandedPersisted, expanded, selectionAnchor, selected],
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
      onClick: () => void remove(menu.entry!),
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
  }, [menu, selected, tabId, rootPath, dirs]);

  return (
    <div
      ref={treeRef}
      className={`tree-view${dragOverPath === "" ? " drag-over-root" : ""}`}
      tabIndex={0}
      role="tree"
      aria-label="Files"
      aria-multiselectable="true"
      onClick={() => treeSelection.clear()}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY, dir: "", entry: null });
      }}
      onDragOver={onTreeDragOver}
      onDrop={(e) => onFolderDrop(e, "")}
    >
      <div className="tree-view-rows" onDragOver={onTreeDragOver} onDrop={(e) => onFolderDrop(e, "")}>
        <EditorTreeVirtualList
          projection={projection}
          itemKey={({ entry }) => entry.path}
          renderItem={({ entry, depth }) => (
          <EditorTreeRow
            id={entry.editorItemId}
            path={entry.path}
            name={treeEntryDisplayName(entry.name)}
            kind={entry.is_dir ? "directory" : classifyFile(entry.name) === "markdown" ? "markdown" : classifyFile(entry.name) === "code" ? "code" : "asset"}
            depth={depth}
            icon={<WorkbenchIcon name={treeEntryIconName(entry)} size={16} />}
            disclosure={<WorkbenchIcon name="chevron-right" size={12} />}
            expandable={entry.is_dir}
            expanded={expanded.has(entry.path)}
            active={entry.path === selectedPath}
            selected={selected.has(entry.path)}
            multiSelected={selected.size > 1 && selected.has(entry.path)}
            dropTarget={dragOverPath === entry.path}
            showGuides
            tabIndex={(keyboardFocusPath ?? selectionAnchor ?? selectedPath ?? [...selected][0] ?? flatList[0]?.entry.path) === entry.path ? 0 : -1}
            onDragStart={(e) => onEntryDragStart(e, entry)}
            onDragOver={(e) => {
              if (entry.is_dir) onFolderDragOver(e, entry.path);
              else onTreeDragOver(e);
            }}
            onDrop={entry.is_dir ? (e) => onFolderDrop(e, entry.path) : (e) => onFolderDrop(e, dirOf(entry.path))}
            onClick={(e) => {
              e.stopPropagation();
              handleRowClick(e, entry);
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (!entry.is_dir) openFileFromTree(entry.path, classifyFile(entry.name), true);
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
          />
          )}
        />
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
    </div>
  );
}
