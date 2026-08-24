import { useCallback, useEffect, useState } from "react";
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
import type { AnchorRect } from "./Popover";

interface Props {
  tabId: number;
  rootPath: string;
  selectedPath?: string | null;
  onOpenFile: (path: string, kind: "code" | "markdown") => void;
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
  // Path/Reveal) — absent for the empty-space/root case.
  entry: DirEntry | null;
}

function classifyFile(name: string): "code" | "markdown" {
  const lower = name.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".markdown") ? "markdown" : "code";
}

function dirOf(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "" : path.slice(0, idx);
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

export function TreeView({ tabId, rootPath, selectedPath, onOpenFile }: Props) {
  const [dirs, setDirs] = useState<Map<string, DirState>>(new Map());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [prompt, setPrompt] = useState<{
    anchor: AnchorRect;
    title: string;
    defaultValue: string;
    onSubmit: (value: string) => void;
  } | null>(null);

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
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("click", close);
    window.addEventListener("blur", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

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
        refresh(dirOf(entry.path));
      },
    });
  };

  const remove = async (entry: DirEntry) => {
    setMenu(null);
    const kind = entry.is_dir ? "folder (and everything in it)" : "file";
    if (!window.confirm(`Delete this ${kind}?\n\n${entry.path}`)) return;
    await deletePath(tabId, entry.path).catch((err) => alert(String(err)));
    refresh(dirOf(entry.path));
  };

  const copyPath = (entry: DirEntry, relative: boolean) => {
    setMenu(null);
    const text = relative ? entry.path : `${rootPath.replace(/\/+$/, "")}/${entry.path}`;
    navigator.clipboard.writeText(text).catch(console.error);
  };

  const reveal = (entry: DirEntry) => {
    setMenu(null);
    revealItemInDir(`${rootPath.replace(/\/+$/, "")}/${entry.path}`).catch(console.error);
  };

  const renderDir = (path: string, depth: number) => {
    const state = dirs.get(path);
    if (!state) return null;
    return state.entries.map((entry) => (
      <div key={entry.path}>
        <div
          className={`tree-view-item${entry.path === selectedPath ? " active" : ""}`}
          style={{ paddingLeft: depth * 14 + 8 }}
          onClick={() =>
            entry.is_dir ? toggle(entry.path) : onOpenFile(entry.path, classifyFile(entry.name))
          }
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
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
        {entry.is_dir && expanded.has(entry.path) && renderDir(entry.path, depth + 1)}
      </div>
    ));
  };

  return (
    <div
      className="tree-view"
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY, dir: "", entry: null });
      }}
    >
      {renderDir("", 0)}
      {menu && (
        <div
          className="tree-view-menu"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button type="button" onClick={() => newFile(menu.dir)}>
            New File
          </button>
          <button
            type="button"
            onClick={() =>
              newFolder(menu.dir, { left: menu.x, right: menu.x, top: menu.y, bottom: menu.y, width: 0, height: 0 })
            }
          >
            New Folder
          </button>
          {menu.entry && (
            <>
              <div className="tree-view-menu-sep" />
              <button
                type="button"
                onClick={() =>
                  rename(menu.entry!, {
                    left: menu.x,
                    right: menu.x,
                    top: menu.y,
                    bottom: menu.y,
                    width: 0,
                    height: 0,
                  })
                }
              >
                Rename
              </button>
              <button type="button" onClick={() => remove(menu.entry!)}>
                Delete
              </button>
              <div className="tree-view-menu-sep" />
              <button type="button" onClick={() => copyPath(menu.entry!, false)}>
                Copy Path
              </button>
              <button type="button" onClick={() => copyPath(menu.entry!, true)}>
                Copy Relative Path
              </button>
              <button type="button" onClick={() => reveal(menu.entry!)}>
                Reveal in Finder
              </button>
            </>
          )}
        </div>
      )}
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
