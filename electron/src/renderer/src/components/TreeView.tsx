import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react";
import {
  DirEntry,
  createDir,
  deletePath,
  listDir,
  onFileChanged,
  renamePath,
  revealItemInDir,
  writeFile,
} from "../electron";
import { TextPrompt } from "./TextPrompt";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";
import type { AnchorRect } from "./Popover";
import { onWorkspaceDismissPortals } from "../workspacePortalDismiss";

interface Props {
  tabId: number;
  rootPath: string;
  selectedPath?: string | null;
  paneVisible?: boolean;
  onOpenFile: (path: string, kind: "code" | "markdown" | "viewer" | "vector", openInNewTab?: boolean) => void;
  // Lets the pane hosting this tree keep any open tab's filePath in sync
  // with what actually happened on disk — without these, renaming/moving/
  // deleting a file out from under an open tab leaves that tab pointing
  // at a path that no longer exists, and the *next* save on it recreates
  // the old file (looks like the file got "copied back").
  onPathRenamed?: (from: string, to: string) => void;
  onPathDeleted?: (path: string) => void;
}

interface DirState {
  entries: DirEntry[];
  loaded: boolean;
}

interface MenuState {
  x: number;
  y: number;
  // The directory this menu applies to when acting "on the folder itself"
  // (New File/New Folder go *inside* it) — root ("") when right-clicking
  // empty tree space.
  dir: string;
  // The specific entry right-clicked, if any (for Rename/Delete/Copy
  // Path/Reveal) — absent for the empty-space/root case. Delete/Copy Path
  // act on the whole multi-selection (`selected`) when there is one and
  // this entry is part of it; Rename only ever targets this single entry.
  entry: DirEntry | null;
}

const VIEWER_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".bmp",
  ".pdf",
  ".mp4",
  ".webm",
  ".mov",
  ".mkv",
  ".mp3",
  ".wav",
  ".m4a",
  ".ogg",
  ".epub",
  ".flac",
];

export function classifyFile(name: string): "code" | "markdown" | "viewer" | "vector" {
  const lower = name.toLowerCase();
  if (lower.endsWith(".vec.json")) return "vector";
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "markdown";
  if (VIEWER_EXTENSIONS.some((ext) => lower.endsWith(ext))) return "viewer";
  return "code";
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

async function findAvailableName(tabId: number, dir: string, base: string, ext: string) {
  const entries = await listDir(tabId, dir).catch(() => []);
  const names = new Set(entries.map((e) => e.name.toLowerCase()));
  const first = `${base}${ext}`;
  if (!names.has(first.toLowerCase())) return first;
  let i = 1;
  while (names.has(`${base} ${i}${ext}`.toLowerCase())) i++;
  return `${base} ${i}${ext}`;
}

// Drag payload for moving files/folders — plain dataTransfer text (JSON
// array of paths) is enough here, unlike PaneTabStrip's tab drag: this
// only needs to be read once, on drop, not live during dragover (no
// insertion-line hint to keep updating), so dataTransfer.getData()'s
// "only readable on drop" limitation doesn't apply.
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
  selectedPath,
  paneVisible = true,
  onOpenFile,
  onPathRenamed,
  onPathDeleted,
}: Props) {
  const [dirs, setDirs] = useState<Map<string, DirState>>(new Map());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [prompt, setPrompt] = useState<{
    anchor: AnchorRect;
    title: string;
    defaultValue: string;
    onSubmit: (value: string) => void;
  } | null>(null);
  // Multi-selection (VSCode-style: Cmd/Ctrl+click toggles, Shift+click
  // selects the range from the last plain-clicked anchor). Separate from
  // `selectedPath` (the prop — the file that's actually open in the
  // active editor tab), which stays a single path regardless of this.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectionAnchor, setSelectionAnchor] = useState<string | null>(null);
  // Folder currently being dragged over as a move target ("" for the root
  // background) — drives the drop-target highlight.
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);

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

  // Re-list from scratch whenever the tab's root_path itself changes (not
  // just when switching to a different tab) — a Settings-dialog path
  // change doesn't remount this component (same tabId), so without
  // `rootPath` in the dependency list the tree would keep showing the
  // previous root's stale listing indefinitely.
  useEffect(() => {
    setDirs(new Map());
    setExpanded(new Set());
    setSelected(new Set());
    setSelectionAnchor(null);
    loadDir("");
  }, [tabId, rootPath, loadDir]);

  useEffect(() => {
    const unlisten = onFileChanged(() => {
      loadDir("");
      for (const path of expanded) loadDir(path);
    });
    return unlisten;
  }, [loadDir, expanded]);

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
    const out: FlatRow[] = [];
    flattenVisible(dirs, expanded, "", 0, out);
    return out;
  }, [dirs, expanded]);

  const toggle = (path: string) => {
    setExpanded((prev) => {
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

  // Click handling shared by file/folder rows. Cmd/Ctrl+click on a *file*
  // opens it in a new tab (browser-style "open link in new tab"), same as
  // this app's own PaneTabStrip convention elsewhere — it does not toggle
  // multi-select the way Finder/VSCode's Cmd+click does; Shift+click's
  // range-select (below) is this tree's only multi-select path now. Shift
  // extends the range from the fixed anchor (doesn't move it, matching
  // Finder/VSCode); a plain click replaces the selection with just this
  // entry and *then* runs `action` (open file / expand folder).
  const handleRowClick = (
    e: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean },
    entry: DirEntry,
    action: (openInNewTab: boolean) => void,
  ) => {
    const path = entry.path;
    if ((e.metaKey || e.ctrlKey) && !entry.is_dir) {
      setSelected(new Set([path]));
      setSelectionAnchor(path);
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
    action(false);
  };

  const newFile = async (dir: string) => {
    setMenu(null);
    const name = await findAvailableName(tabId, dir, "untitled", ".md");
    const path = joinPath(dir, name);
    // Reuses writeFile (not a dedicated "touch") — same as MarkdownPane's
    // own New File flow, and creating an empty file this way is exactly
    // what write_file already supports.
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
        setExpanded((prev) => new Set(prev).add(dir));
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

  // Operates on the whole multi-selection when `entry` is part of one,
  // otherwise just on `entry` itself — same "select just this one first"
  // semantics VSCode uses for a right-click landing outside the current
  // selection (handled by the onContextMenu handler below, before this
  // ever runs).
  const targetPaths = (entry: DirEntry): string[] => (selected.has(entry.path) && selected.size > 1 ? [...selected] : [entry.path]);

  const remove = async (entry: DirEntry) => {
    setMenu(null);
    const paths = targetPaths(entry);
    const label = paths.length > 1 ? `${paths.length} items` : `this ${entry.is_dir ? "folder (and everything in it)" : "file"}`;
    if (!window.confirm(`Delete ${label}?\n\n${paths.join("\n")}`)) return;
    for (const p of paths) {
      await deletePath(tabId, p).catch((err) => alert(String(err)));
      onPathDeleted?.(p);
    }
    for (const d of new Set(paths.map(dirOf))) refresh(d);
    setSelected(new Set());
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

  // Moves every path in `paths` into `targetDir` (renamePath is a plain
  // rename on the backend — moving is just renaming to a path under a
  // different parent). Skips a path that's already directly in
  // targetDir, and skips dropping a folder into itself or one of its own
  // descendants (which renamePath would otherwise happily corrupt into a
  // folder trying to contain itself).
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
  }, [menu, selected, tabId, rootPath]);

  return (
    <div
      className="tree-view"
      onClick={() => setSelected(new Set())}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY, dir: "", entry: null });
      }}
      onDragOver={(e) => onFolderDragOver(e, "")}
      onDragLeave={() => setDragOverPath((p) => (p === "" ? null : p))}
      onDrop={(e) => onFolderDrop(e, "")}
    >
      {flatList.map(({ entry, depth }) => (
        <div
          key={entry.path}
          className={`tree-view-item${entry.path === selectedPath ? " active" : ""}${selected.has(entry.path) ? " selected" : ""}${dragOverPath === entry.path ? " drag-over" : ""}`}
          style={{ paddingLeft: depth * 14 + 8 }}
          draggable
          onDragStart={(e) => onEntryDragStart(e, entry)}
          onDragOver={entry.is_dir ? (e) => onFolderDragOver(e, entry.path) : undefined}
          onDragLeave={entry.is_dir ? () => setDragOverPath((p) => (p === entry.path ? null : p)) : undefined}
          onDrop={entry.is_dir ? (e) => onFolderDrop(e, entry.path) : undefined}
          onClick={(e) => {
            e.stopPropagation();
            handleRowClick(e, entry, (openInNewTab) =>
              entry.is_dir ? toggle(entry.path) : onOpenFile(entry.path, classifyFile(entry.name), openInNewTab),
            );
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            // Right-clicking outside the current multi-selection replaces
            // it with just this entry — matches remove()/copyPath()'s
            // targetPaths() falling back to [entry.path] in that case too.
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
          }}
        >
          {/* One guide per ancestor level, not this row's own depth — each
              row only draws its own row-height segment of every ancestor's
              line; stacked across siblings/descendants at the same
              indentation they read as one continuous vertical line down
              through the whole expanded subtree, the same effect VS
              Code/Zed produce without needing to size a line to an entire
              (variable, expand/collapse-dependent) subtree's height. */}
          {Array.from({ length: depth }, (_, level) => (
            <span key={level} className="tree-view-guide" style={{ left: level * 14 + 14 }} />
          ))}
          <span className="tree-view-icon">
            {entry.is_dir ? (expanded.has(entry.path) ? "▾" : "▸") : "·"}
          </span>
          <span className="tree-view-name">{entry.name}</span>
        </div>
      ))}
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
