import { useEffect, useRef, useState } from "react";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter } from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  insertNewlineAndIndent,
  toggleComment,
} from "@codemirror/commands";
import {
  deleteMarkupBackward,
  insertNewlineContinueMarkupCommand,
  markdown,
  markdownLanguage,
} from "@codemirror/lang-markdown";
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
  syntaxTree,
  LanguageDescription,
} from "@codemirror/language";
import { languages as languageData } from "@codemirror/language-data";
import { closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap } from "@codemirror/autocomplete";
import { listDir, onFileChanged, readFile, writeFile } from "../tauri";
import { getStoredAutoSave, subscribeAutoSave } from "../autosave";
import { columnGuideTheme, markdownProseTheme, workspaceEditorTheme } from "../codemirrorTheme";
import { syntaxTheme } from "../codemirrorSyntax";
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

function isMarkdownPath(path: string | null): boolean {
  return !!path && /\.(md|markdown)$/i.test(path);
}

async function findAvailableUntitledName(tabId: number): Promise<string> {
  const entries = await listDir(tabId, "").catch(() => []);
  // Lowercased: macOS's default filesystem (APFS/HFS+) is case-
  // insensitive, so an existing "Untitled.md" and a write to
  // "untitled.md" are the same file at the OS level.
  const names = new Set(entries.filter((e) => !e.is_dir).map((e) => e.name.toLowerCase()));
  if (!names.has("untitled.md")) return "untitled.md";
  let i = 1;
  while (names.has(`untitled ${i}.md`)) i++;
  return `untitled ${i}.md`;
}

// Obsidian resolves a wikilink by filename anywhere in the vault, not by
// exact relative path — mirrors that with a bounded breadth-first search
// (capped so a pathological/huge tree can't hang the click).
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

export function EditorPane({ filePath, tabId, rootPath }: Props) {
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

  const hasPath = currentPath !== null;
  const isMarkdown = isMarkdownPath(currentPath);

  // Recreated on every file switch (not just the empty<->open boundary
  // MarkdownPane used to key on) — a code file needs its own language
  // extension, which is resolved per-path below, so the view has to be
  // rebuilt per file regardless of markdown/code kind.
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

    const langCompartment = new Compartment();

    const kindExtensions = isMarkdown
      ? [
          markdown({
            base: markdownLanguage,
            extensions: [wikiLinkExtension],
            addKeymap: false,
          }),
          markdownRootPath.of(rootPath),
          ...markdownLivePreview,
          markdownProseTheme,
          wikiLinkClickHandler,
          keymap.of([
            { key: "Enter", run: insertNewlineContinueMarkupCommand({ nonTightLists: false }) },
            { key: "Enter", run: insertNewlineAndIndent },
            { key: "Backspace", run: deleteMarkupBackward },
          ]),
        ]
      : [
          langCompartment.of([]),
          lineNumbers(),
          highlightActiveLineGutter(),
          foldGutter(),
          bracketMatching(),
          closeBrackets(),
          autocompletion(),
          indentOnInput(),
          syntaxTheme,
          keymap.of([
            { key: "Mod-/", run: toggleComment },
            ...closeBracketsKeymap,
            ...completionKeymap,
            ...foldKeymap,
            ...defaultKeymap,
          ]),
        ];

    const view = new EditorView({
      state: EditorState.create({
        doc: "",
        extensions: [
          ...kindExtensions,
          ...workspaceSearch,
          history(),
          keymap.of([indentWithTab, ...historyKeymap]),
          EditorView.lineWrapping,
          workspaceEditorTheme,
          columnGuideTheme,
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return;
            if (isMarkdown) setOutline(computeOutline(update.view));
            setUnsaved(true);
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
    if (isMarkdown) setOutline([]);

    // Language loading is async (dynamically imported per-language by
    // @codemirror/language-data) — the view mounts first with no
    // highlighting for code files, then reconfigures via the compartment
    // once the matching language resolves. Falls back to plain text
    // (still gets line numbers/brackets/etc, just no coloring) for an
    // unrecognized or missing extension.
    if (!isMarkdown && currentPath) {
      const desc = LanguageDescription.matchFilename(languageData, currentPath);
      desc
        ?.load()
        .then((support) => {
          if (viewRef.current === view) {
            view.dispatch({ effects: langCompartment.reconfigure(support) });
          }
        })
        .catch(console.error);
    }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, hasPath, rootPath, currentPath, isMarkdown]);

  useEffect(() => {
    if (!currentPath || !viewRef.current) return;
    readFile(tabId, currentPath)
      .then((content) => {
        lastLoadedContentRef.current = content;
        viewRef.current?.dispatch({
          changes: { from: 0, to: viewRef.current.state.doc.length, insert: content },
        });
        if (autoSaveTimerRef.current) {
          clearTimeout(autoSaveTimerRef.current);
          autoSaveTimerRef.current = null;
        }
        setUnsaved(false);
      })
      .catch(console.error);
  }, [currentPath, tabId]);

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
          {isMarkdown && (
            <button
              type="button"
              className={`md-pane-tree-toggle${outlineOpen ? " active" : ""}`}
              title="Toggle outline"
              onClick={() => setOutlineOpen((v) => !v)}
            >
              ☰
            </button>
          )}
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
      {isMarkdown && outlineOpen && (
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
