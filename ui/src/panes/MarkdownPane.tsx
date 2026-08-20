import { useEffect, useRef, useState } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { syntaxTree } from "@codemirror/language";
import { listDir, onFileChanged, readFile, writeFile } from "../tauri";
import { getStoredAutoSave, subscribeAutoSave } from "../autosave";
import { markdownProseTheme, workspaceEditorTheme } from "../codemirrorTheme";
import { workspaceSearch } from "../codemirrorSearch";
import { markdownLivePreview, markdownRootPath, HEADING_TYPES } from "../markdownLivePreview";
import { wikiLinkExtension } from "../markdownWikilink";
import { TreeView } from "../components/TreeView";

interface Props {
  filePath: string | null;
  tabId: number;
  rootPath: string;
}

interface OutlineItem {
  level: number;
  text: string;
  pos: number;
}

async function findAvailableUntitledName(tabId: number): Promise<string> {
  const entries = await listDir(tabId, "").catch(() => []);
  // Lowercased on purpose: macOS's default filesystem (APFS/HFS+) is
  // case-insensitive, so an existing "Untitled.md" and a write to
  // "untitled.md" are the *same file* at the OS level. Comparing names
  // case-sensitively here missed that "Untitled.md" already existed,
  // returned "untitled.md" as "available", and writeFile silently
  // truncated the existing file to empty — this is exactly that bug.
  const names = new Set(entries.filter((e) => !e.is_dir).map((e) => e.name.toLowerCase()));
  if (!names.has("untitled.md")) return "untitled.md";
  let i = 1;
  while (names.has(`untitled ${i}.md`)) i++;
  return `untitled ${i}.md`;
}

// Obsidian resolves a wikilink by filename anywhere in the vault, not by
// exact relative path — mirrors that with a bounded breadth-first search
// (capped so a pathological/huge tree can't hang the click) rather than
// requiring the link to already know its target's folder. Creates the
// note at the workspace root if nothing matches, same as Obsidian's
// default "create if missing" behavior.
async function resolveWikiLinkTarget(tabId: number, target: string): Promise<string> {
  const base = target.split("/").pop()?.trim() || target;
  const wanted = `${base.toLowerCase()}.md`;
  const queue: string[] = [""];
  let visited = 0;
  while (queue.length > 0 && visited < 500) {
    const dir = queue.shift()!;
    visited++;
    const entries = await listDir(tabId, dir).catch(() => []);
    for (const entry of entries) {
      if (entry.is_dir) {
        queue.push(entry.path);
      } else if (entry.name.toLowerCase() === wanted) {
        return entry.path;
      }
    }
  }
  const created = `${base}.md`;
  await writeFile(tabId, created, "");
  return created;
}

function computeOutline(view: EditorView): OutlineItem[] {
  const items: OutlineItem[] = [];
  syntaxTree(view.state).iterate({
    enter: (node) => {
      if (!HEADING_TYPES.has(node.type.name)) return;
      const level = Number(node.type.name[node.type.name.length - 1]);
      const text = view.state.doc
        .sliceString(node.from, node.to)
        .replace(/^#+\s*/, "")
        .trim();
      items.push({ level, text, pos: node.from });
    },
  });
  return items;
}

export function MarkdownPane({ filePath, tabId, rootPath }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const pathRef = useRef(filePath);
  const [currentPath, setCurrentPath] = useState(filePath);
  const [treeOpen, setTreeOpen] = useState(filePath === null);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [creating, setCreating] = useState(false);
  const [history_, setHistory] = useState<string[]>(filePath ? [filePath] : []);
  const [historyIndex, setHistoryIndex] = useState(filePath ? 0 : -1);
  // The content last loaded from (or saved to) disk, so an external-change
  // notification can tell "someone else edited this file" apart from "the
  // file-changed event our own save just triggered" — reloading in the
  // latter case would reset the cursor/undo-history for no reason, and
  // reloading over *unsaved local edits* would silently discard them.
  const lastLoadedContentRef = useRef<string | null>(null);
  const [autoSave, setAutoSave] = useState(getStoredAutoSave);
  const autoSaveRef = useRef(autoSave);
  autoSaveRef.current = autoSave;
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [unsaved, setUnsaved] = useState(false);

  pathRef.current = currentPath;

  useEffect(() => subscribeAutoSave(setAutoSave), []);

  const saveNow = (view: EditorView, path: string) => {
    const content = view.state.doc.toString();
    return writeFile(tabId, path, content).then(() => {
      lastLoadedContentRef.current = content;
      setUnsaved(false);
    });
  };

  useEffect(() => {
    setCurrentPath(filePath);
    setHistory(filePath ? [filePath] : []);
    setHistoryIndex(filePath ? 0 : -1);
  }, [filePath]);

  const navigateTo = (path: string) => {
    setHistory((prev) => [...prev.slice(0, historyIndex + 1), path]);
    setHistoryIndex((i) => i + 1);
    setCurrentPath(path);
  };
  // The CM view (and any extensions closed over at creation time, like
  // the wikilink click handler below) is only rebuilt when [tabId,
  // hasPath] changes — not on every render — so a click handler that
  // called `navigateTo` directly would keep calling whichever version
  // was current at mount, with `historyIndex` frozen from back then.
  // Routing through a ref kept fresh every render (same pattern as
  // `pathRef` above) sidesteps that staleness.
  const navigateToRef = useRef(navigateTo);
  navigateToRef.current = navigateTo;

  const goBack = () => {
    if (historyIndex <= 0) return;
    const i = historyIndex - 1;
    setHistoryIndex(i);
    setCurrentPath(history_[i]);
  };

  const goForward = () => {
    if (historyIndex >= history_.length - 1) return;
    const i = historyIndex + 1;
    setHistoryIndex(i);
    setCurrentPath(history_[i]);
  };

  // The editor itself only exists once a file is open — no CM instance
  // (and so no hardcoded placeholder doc) is mounted for an empty pane;
  // the "New File" prompt renders in its place instead. Keyed on whether
  // a path exists (not on the path's value) so switching between two
  // already-open files doesn't tear the view down, only reloads content
  // via the effect below.
  const hasPath = currentPath !== null;
  useEffect(() => {
    if (!hasPath || !hostRef.current) return;

    const wikiLinkClickHandler = EditorView.domEventHandlers({
      click(event, view) {
        const target = event.target as HTMLElement | null;
        if (!target?.classList.contains("cm-md-wikilink")) return false;
        const pos = view.posAtDOM(target);
        let node = syntaxTree(view.state).resolveInner(pos, 1);
        while (node && node.type.name !== "WikiLink" && node.parent) node = node.parent;
        if (!node || node.type.name !== "WikiLink") return false;
        const full = view.state.doc.sliceString(node.from, node.to);
        const noteName = (full.slice(2, -2).split("|")[0] ?? "").trim();
        if (!noteName) return false;
        event.preventDefault();
        resolveWikiLinkTarget(tabId, noteName)
          .then((path) => navigateToRef.current(path))
          .catch(console.error);
        return true;
      },
    });

    const view = new EditorView({
      state: EditorState.create({
        doc: "",
        extensions: [
          // `markdown()`'s default base is strict CommonMark, which
          // doesn't parse strikethrough/task-lists/tables at all —
          // `markdownLanguage` is CodeMirror's GFM-flavored base.
          markdown({ base: markdownLanguage, extensions: [wikiLinkExtension] }),
          markdownRootPath.of(rootPath),
          ...markdownLivePreview,
          ...workspaceSearch,
          history(),
          keymap.of([indentWithTab, ...historyKeymap]),
          EditorView.lineWrapping,
          workspaceEditorTheme,
          markdownProseTheme,
          wikiLinkClickHandler,
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return;
            setOutline(computeOutline(update.view));
            setUnsaved(true);
            // Debounced auto-save: only scheduled while the "Auto-save"
            // setting is on (checked live via the ref, not the value
            // captured when this listener was created — the setting can
            // change while a pane is already open). A manual Cmd+S save,
            // or this pane loading a *different* file, both explicitly
            // cancel any pending timer below so a stale save can't fire
            // after either.
            if (!autoSaveRef.current) return;
            if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
            autoSaveTimerRef.current = setTimeout(() => {
              const path = pathRef.current;
              if (path) saveNow(update.view, path).catch(console.error);
            }, 600);
          }),
        ],
      }),
      parent: hostRef.current,
    });
    viewRef.current = view;

    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        const path = pathRef.current;
        if (!path || !viewRef.current) return;
        if (autoSaveTimerRef.current) {
          clearTimeout(autoSaveTimerRef.current);
          autoSaveTimerRef.current = null;
        }
        saveNow(viewRef.current, path).catch(console.error);
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      view.destroy();
      viewRef.current = null;
    };
    // Also recreated when rootPath changes (e.g. via Settings) — image
    // paths need to re-resolve against the new root, and there's no
    // cheaper way to update a Facet value than reconfiguring the view.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on hasPath, not currentPath (see comment above)
  }, [tabId, hasPath, rootPath]);

  useEffect(() => {
    if (!currentPath || !viewRef.current) return;
    readFile(tabId, currentPath)
      .then((content) => {
        lastLoadedContentRef.current = content;
        viewRef.current?.dispatch({
          changes: { from: 0, to: viewRef.current.state.doc.length, insert: content },
        });
        // This dispatch is a docChanged event like any other from the CM
        // view's perspective, so the updateListener above just marked
        // this "unsaved" — it's freshly loaded *from* disk, so it isn't.
        if (autoSaveTimerRef.current) {
          clearTimeout(autoSaveTimerRef.current);
          autoSaveTimerRef.current = null;
        }
        setUnsaved(false);
      })
      .catch(console.error);
  }, [currentPath, tabId]);

  // Live-reload when the currently open file changes on disk outside this
  // pane (another editor, git checkout, etc). Skipped when there are
  // unsaved local edits (current doc differs from what was last loaded/
  // saved) so an external change can't silently clobber in-progress
  // typing, and naturally a no-op when the change was our *own* save
  // (content already matches, so the diff-check below is false and
  // nothing is re-dispatched — no cursor/undo-history reset on save).
  useEffect(() => {
    if (!currentPath) return;
    const unlisten = onFileChanged(() => {
      const view = viewRef.current;
      if (!view) return;
      const current = view.state.doc.toString();
      if (lastLoadedContentRef.current !== null && current !== lastLoadedContentRef.current) {
        return;
      }
      readFile(tabId, currentPath)
        .then((content) => {
          if (content === view.state.doc.toString()) return;
          lastLoadedContentRef.current = content;
          const selection = view.state.selection;
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: content },
            selection: selection.main.to <= content.length ? selection : undefined,
          });
          if (autoSaveTimerRef.current) {
            clearTimeout(autoSaveTimerRef.current);
            autoSaveTimerRef.current = null;
          }
          setUnsaved(false);
        })
        .catch(console.error);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [currentPath, tabId]);

  const createNewFile = async () => {
    setCreating(true);
    try {
      const name = await findAvailableUntitledName(tabId);
      await writeFile(tabId, name, "");
      navigateTo(name);
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  const jumpToHeading = (pos: number) => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
    view.focus();
  };

  return (
    <div className="md-pane">
      {treeOpen && (
        <div className="md-pane-sidebar">
          <TreeView
            tabId={tabId}
            rootPath={rootPath}
            selectedPath={currentPath}
            onOpenFile={(path) => navigateTo(path)}
          />
        </div>
      )}
      <div className="md-pane-body">
        <div className="md-pane-toolbar">
          <button type="button" onClick={goBack} disabled={historyIndex <= 0} title="Back">
            ←
          </button>
          <button
            type="button"
            onClick={goForward}
            disabled={historyIndex >= history_.length - 1}
            title="Forward"
          >
            →
          </button>
          <span className="md-pane-toolbar-spacer" />
          {hasPath && !autoSave && (
            <span className={`md-pane-save-status${unsaved ? " unsaved" : ""}`}>
              {unsaved ? "Unsaved" : "Saved"}
            </span>
          )}
          <button
            type="button"
            className={`md-pane-tree-toggle${outlineOpen ? " active" : ""}`}
            title="Toggle outline"
            onClick={() => setOutlineOpen((v) => !v)}
          >
            ☰
          </button>
          <button
            type="button"
            className={`md-pane-tree-toggle${treeOpen ? " active" : ""}`}
            title="Toggle file explorer"
            onClick={() => setTreeOpen((v) => !v)}
          >
            📁
          </button>
        </div>
        {hasPath ? (
          <div className="md-editor" ref={hostRef} />
        ) : (
          <div className="md-empty-state">
            <button type="button" onClick={createNewFile} disabled={creating}>
              {creating ? "Creating…" : "New File"}
            </button>
          </div>
        )}
      </div>
      {outlineOpen && (
        <div className="md-pane-sidebar md-pane-outline">
          {outline.length === 0 ? (
            <div className="md-pane-outline-empty">No headings</div>
          ) : (
            outline.map((item, i) => (
              <div
                key={i}
                className="tree-view-item"
                style={{ paddingLeft: (item.level - 1) * 14 + 8 }}
                onClick={() => jumpToHeading(item.pos)}
              >
                {item.text || "(empty heading)"}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
