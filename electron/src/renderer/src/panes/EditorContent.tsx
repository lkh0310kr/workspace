import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Compartment, EditorSelection, EditorState, Transaction } from "@codemirror/state";
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
  indentUnit,
  syntaxTree,
  LanguageDescription,
} from "@codemirror/language";
import { languages as languageData } from "@codemirror/language-data";
import { closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap } from "@codemirror/autocomplete";
import { closeSearchPanel, openSearchPanel, searchPanelOpen } from "@codemirror/search";
import { listDir, onFileChanged, readFile, writeFile } from "../electron";
import { getStoredAutoSave, subscribeAutoSave } from "../autosave";
import { markdownProseTheme, workspaceEditorTheme } from "../codemirrorTheme";
import { indentGuides } from "../indentGuides";
import { syntaxTheme } from "../codemirrorSyntax";
import { workspaceSearch } from "../codemirrorSearch";
import { markdownLivePreview, markdownRootPath, HEADING_TYPES } from "../markdownLivePreview";
import { wikiLinkExtension } from "../markdownWikilink";
import type { TabKind } from "../layout/paneTypes";

// The per-file content half of what used to be ui/EditorPane.tsx — the
// other half (multi-file tabs, TreeView/explorer sidebar) moved up to
// PaneGroup.tsx as part of globalizing the tab system across every pane
// kind. What's genuinely file-specific stays here: the CodeMirror view
// itself, its outline sidebar, search, and autosave/save. The old
// back/forward *file history* navigation is gone entirely — that was this
// pane's own stand-in for "switch to a different open file" before real
// tabs existed here; clicking a different open tab in PaneTabStrip is that
// feature now, so keeping a second parallel history-nav UI would be
// redundant.
interface OutlineItem {
  level: number;
  text: string;
  pos: number;
}

interface Props {
  tabId: number;
  rootPath: string;
  filePath: string | null;
  kind: TabKind;
  zoom: number;
  /** Wikilink click ([[Note]]) — open (or switch to) that file as a tab. */
  onOpenFile: (path: string) => void;
  /** "Save" on an untitled tab assigns it a real path — bubbles up so the
   * tab strip / persisted layout reflect it. */
  onAssignPath: (path: string) => void;
  onDirtyChange: (dirty: boolean) => void;
}

async function findAvailableUntitledName(tabId: number): Promise<string> {
  const entries = await listDir(tabId, "").catch(() => []);
  const names = new Set(entries.filter((e) => !e.is_dir).map((e) => e.name.toLowerCase()));
  if (!names.has("untitled.md")) return "untitled.md";
  let i = 1;
  while (names.has(`untitled ${i}.md`)) i++;
  return `untitled ${i}.md`;
}

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

// Cmd+B/Cmd+I: wrap the selection in `marker` (**bold**/*italic*), or
// unwrap it if it's already exactly wrapped (toggle, matching every other
// editor's bold/italic shortcut behavior). CodeMirror 6 ships no built-in
// markdown formatting commands, so this is a small hand-rolled one.
function toggleMarkdownWrap(marker: string) {
  return (view: EditorView): boolean => {
    const { state } = view;
    const changes = state.changeByRange((range) => {
      const { from, to } = range;
      const before = state.sliceDoc(Math.max(0, from - marker.length), from);
      const after = state.sliceDoc(to, Math.min(state.doc.length, to + marker.length));
      if (from !== to && before === marker && after === marker) {
        return {
          changes: [
            { from: from - marker.length, to: from },
            { from: to, to: to + marker.length },
          ],
          range: EditorSelection.range(from - marker.length, to - marker.length),
        };
      }
      return {
        changes: [
          { from, insert: marker },
          { from: to, insert: marker },
        ],
        range: EditorSelection.range(from + marker.length, to + marker.length),
      };
    });
    view.dispatch(state.update(changes, { scrollIntoView: true, userEvent: "input" }));
    return true;
  };
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

export function EditorContent({ tabId, rootPath, filePath, kind, zoom, onOpenFile, onAssignPath, onDirtyChange }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const pathRef = useRef<string | null>(filePath);
  pathRef.current = filePath;
  const lastLoadedContentRef = useRef<string | null>(null);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [autoSave, setAutoSave] = useState(getStoredAutoSave);
  const autoSaveRef = useRef(autoSave);
  autoSaveRef.current = autoSave;
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const onOpenFileRef = useRef(onOpenFile);
  onOpenFileRef.current = onOpenFile;
  const onAssignPathRef = useRef(onAssignPath);
  onAssignPathRef.current = onAssignPath;
  const onDirtyChangeRef = useRef(onDirtyChange);
  onDirtyChangeRef.current = onDirtyChange;

  const setDirtyState = useCallback((next: boolean) => {
    if (dirtyRef.current === next) return;
    dirtyRef.current = next;
    setDirty(next);
    onDirtyChangeRef.current(next);
  }, []);

  useEffect(() => subscribeAutoSave(setAutoSave), []);

  const isMarkdown = kind === "markdown";

  const saveNow = useCallback(
    (view: EditorView, path: string) => {
      const content = view.state.doc.toString();
      return writeFile(tabId, path, content).then(() => {
        lastLoadedContentRef.current = content;
        setDirtyState(false);
      });
    },
    [tabId, setDirtyState],
  );

  const saveActiveFile = useCallback(
    async (view: EditorView) => {
      const path = pathRef.current;
      if (path) {
        await saveNow(view, path);
        return;
      }
      const name = await findAvailableUntitledName(tabId);
      const content = view.state.doc.toString();
      await writeFile(tabId, name, content);
      lastLoadedContentRef.current = content;
      setDirtyState(false);
      onAssignPathRef.current(name);
    },
    [tabId, saveNow, setDirtyState],
  );

  useEffect(() => {
    if (!hostRef.current) return;

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
          .then((path) => onOpenFileRef.current(path))
          .catch(console.error);
        return true;
      },
    });

    const langCompartment = new Compartment();

    const kindExtensions = isMarkdown
      ? [
          markdown({ base: markdownLanguage, extensions: [wikiLinkExtension], addKeymap: false }),
          markdownRootPath.of(rootPath),
          ...markdownLivePreview,
          markdownProseTheme,
          wikiLinkClickHandler,
          keymap.of([
            { key: "Enter", run: insertNewlineContinueMarkupCommand({ nonTightLists: false }) },
            { key: "Enter", run: insertNewlineAndIndent },
            { key: "Backspace", run: deleteMarkupBackward },
            { key: "Mod-b", run: toggleMarkdownWrap("**") },
            { key: "Mod-i", run: toggleMarkdownWrap("*") },
            ...defaultKeymap,
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
          indentUnit.of("    "),
          history(),
          keymap.of([indentWithTab, ...historyKeymap]),
          EditorView.lineWrapping,
          workspaceEditorTheme,
          indentGuides,
          EditorView.clickAddsSelectionRange.of((event) => event.altKey || event.metaKey),
          EditorView.updateListener.of((update) => {
            setSearchOpen(searchPanelOpen(update.view.state));
            if (!update.docChanged) return;
            if (isMarkdown) setOutline(computeOutline(update.view));
            setDirtyState(true);
            const path = pathRef.current;
            if (!path || !autoSaveRef.current) return;
            if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
            autoSaveTimerRef.current = setTimeout(() => {
              const savePath = pathRef.current;
              if (savePath) saveNow(update.view, savePath).catch(console.error);
            }, 600);
          }),
        ],
      }),
      parent: hostRef.current,
    });
    viewRef.current = view;
    if (isMarkdown) setOutline([]);

    if (!isMarkdown && filePath) {
      const desc = LanguageDescription.matchFilename(languageData, filePath);
      desc
        ?.load()
        .then((support) => {
          if (viewRef.current === view) view.dispatch({ effects: langCompartment.reconfigure(support) });
        })
        .catch(console.error);
    }

    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (!viewRef.current) return;
        if (autoSaveTimerRef.current) {
          clearTimeout(autoSaveTimerRef.current);
          autoSaveTimerRef.current = null;
        }
        saveActiveFile(viewRef.current).catch(console.error);
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      view.destroy();
      viewRef.current = null;
    };
    // Deliberately excludes filePath/rootPath from deps beyond first mount
    // — this component is mounted once per open editor tab (keyed by tab
    // id at the call site), and the load effect below handles switching
    // *content* when filePath changes (e.g. Save-As on an untitled tab).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, isMarkdown]);

  useEffect(() => {
    if (!viewRef.current) return;
    if (filePath) {
      readFile(tabId, filePath)
        .then((content) => {
          lastLoadedContentRef.current = content;
          viewRef.current?.dispatch({
            changes: { from: 0, to: viewRef.current.state.doc.length, insert: content },
            annotations: Transaction.addToHistory.of(false),
          });
          if (autoSaveTimerRef.current) {
            clearTimeout(autoSaveTimerRef.current);
            autoSaveTimerRef.current = null;
          }
          setDirtyState(false);
        })
        .catch(console.error);
    }
  }, [tabId, filePath, setDirtyState]);

  useEffect(() => {
    if (!filePath) return;
    const unlisten = onFileChanged(() => {
      const view = viewRef.current;
      if (!view) return;
      const current = view.state.doc.toString();
      if (lastLoadedContentRef.current !== null && current !== lastLoadedContentRef.current) return;
      readFile(tabId, filePath)
        .then((content) => {
          if (content === view.state.doc.toString()) return;
          lastLoadedContentRef.current = content;
          const selection = view.state.selection;
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: content },
            selection: selection.main.to <= content.length ? selection : undefined,
            annotations: Transaction.addToHistory.of(false),
          });
          if (autoSaveTimerRef.current) {
            clearTimeout(autoSaveTimerRef.current);
            autoSaveTimerRef.current = null;
          }
          setDirtyState(false);
        })
        .catch(console.error);
    });
    return unlisten;
  }, [filePath, tabId, setDirtyState]);

  const toggleSearch = () => {
    const view = viewRef.current;
    if (!view) return;
    if (searchPanelOpen(view.state)) {
      closeSearchPanel(view);
      setSearchOpen(false);
    } else {
      openSearchPanel(view);
      setSearchOpen(true);
      view.focus();
    }
  };

  const jumpToHeading = (pos: number) => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
    view.focus();
  };

  return (
    <div className="obsidian-editor-shell">
      <div className="obsidian-body">
        <div className="obsidian-editor-column">
          {/* Floats over the editor's top-right corner instead of taking
              its own chrome row — PaneTabStrip is already a full row of
              chrome above this, so a second full-width topbar just for
              two icons + a save-status label was redundant vertical
              space, and not how VS Code/Obsidian place these either. */}
          <div className="obsidian-float-actions">
            {!autoSave && (
              <span className={`md-pane-save-status${dirty ? " unsaved" : ""}`}>
                {dirty ? "Unsaved" : "Saved"}
              </span>
            )}
            {isMarkdown && (
              <button
                type="button"
                className={`obsidian-topbar-icon${outlineOpen ? " active" : ""}`}
                title="Toggle outline"
                onClick={() => setOutlineOpen((v) => !v)}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                  <path fill="currentColor" d="M2 3h12v1H2V3Zm0 4h12v1H2V7Zm0 4h8v1H2v-1Z" />
                </svg>
              </button>
            )}
            <button
              type="button"
              className={`obsidian-topbar-icon${searchOpen ? " active" : ""}`}
              title="Search"
              onClick={toggleSearch}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85Zm-5.242 1.156a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z"
                />
              </svg>
            </button>
          </div>
          <div
            className="md-editor"
            ref={hostRef}
            style={{ "--editor-font-size": `${13 * zoom}px` } as CSSProperties}
          />
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
    </div>
  );
}
