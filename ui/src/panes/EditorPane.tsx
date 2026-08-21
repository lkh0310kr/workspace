import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import type { TabNode } from "flexlayout-react";
import { Compartment, EditorState, Transaction } from "@codemirror/state";
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
import { closeSearchPanel, openSearchPanel, searchPanelOpen } from "@codemirror/search";
import { listDir, onFileChanged, readFile, writeFile } from "../tauri";
import { getStoredAutoSave, subscribeAutoSave } from "../autosave";
import { columnGuideTheme, markdownProseTheme, workspaceEditorTheme } from "../codemirrorTheme";
import { syntaxTheme } from "../codemirrorSyntax";
import { workspaceSearch } from "../codemirrorSearch";
import { markdownLivePreview, markdownRootPath, HEADING_TYPES } from "../markdownLivePreview";
import { wikiLinkExtension } from "../markdownWikilink";
import { TreeView } from "../components/TreeView";
import { EditorTab, EditorTabBar } from "../components/EditorTabBar";
import { PaneActions } from "../components/PaneActions";
import { PaneComponent } from "../layout/paneTypes";
import { popOverlayBlock, pushOverlayBlock } from "../browser/overlayBarrier";
import { startPaneDrag } from "../layout/layoutRef";

interface Props {
  filePath: string | null;
  tabId: number;
  rootPath: string;
  component: PaneComponent;
  tabNode?: TabNode;
  onSplit: (mode: "split-right" | "split-down", paneType: PaneComponent) => void;
  onTypeChange: (component: PaneComponent) => void;
  onClose: () => void;
}

interface OutlineItem {
  level: number;
  text: string;
  pos: number;
}

let nextEditorTabId = 0;

function makeEditorTab(path: string | null): EditorTab {
  nextEditorTabId += 1;
  return { id: `editor-tab-${nextEditorTabId}`, path };
}

function isMarkdownPath(path: string | null): boolean {
  return !!path && /\.(md|markdown)$/i.test(path);
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

export function EditorPane({
  filePath,
  tabId,
  rootPath,
  component,
  tabNode,
  onSplit,
  onTypeChange,
  onClose,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const pathRef = useRef<string | null>(filePath);
  const activeTabIdRef = useRef<string | null>(null);
  const tabDraftsRef = useRef<Map<string, string>>(new Map());
  const historyIndexRef = useRef(filePath ? 0 : -1);

  const initialTabs = filePath ? [makeEditorTab(filePath)] : [];
  const [openTabs, setOpenTabs] = useState<EditorTab[]>(initialTabs);
  const [activeTabId, setActiveTabId] = useState<string | null>(initialTabs[0]?.id ?? null);
  const [currentPath, setCurrentPath] = useState<string | null>(filePath);
  const [treeOpen, setTreeOpen] = useState(true);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [history_, setHistory] = useState<string[]>(filePath ? [filePath] : []);
  const [historyIndex, setHistoryIndex] = useState(filePath ? 0 : -1);
  const lastLoadedContentRef = useRef<string | null>(null);
  const [autoSave, setAutoSave] = useState(getStoredAutoSave);
  const autoSaveRef = useRef(autoSave);
  autoSaveRef.current = autoSave;
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [unsavedPaths, setUnsavedPaths] = useState<Set<string>>(new Set());
  const [dirtyTabIds, setDirtyTabIds] = useState<Set<string>>(new Set());

  pathRef.current = currentPath;
  activeTabIdRef.current = activeTabId;
  historyIndexRef.current = historyIndex;

  useEffect(() => subscribeAutoSave(setAutoSave), []);

  const markSaved = useCallback((path: string) => {
    setUnsavedPaths((prev) => {
      if (!prev.has(path)) return prev;
      const next = new Set(prev);
      next.delete(path);
      return next;
    });
  }, []);

  const markUnsaved = useCallback((path: string) => {
    setUnsavedPaths((prev) => {
      if (prev.has(path)) return prev;
      const next = new Set(prev);
      next.add(path);
      return next;
    });
  }, []);

  const markTabDirty = useCallback((id: string) => {
    setDirtyTabIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const markTabClean = useCallback((id: string) => {
    setDirtyTabIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const isTabDirty = useCallback(
    (tab: EditorTab) => {
      if (tab.path) return unsavedPaths.has(tab.path);
      return dirtyTabIds.has(tab.id);
    },
    [unsavedPaths, dirtyTabIds],
  );

  const saveNow = (view: EditorView, path: string) => {
    const content = view.state.doc.toString();
    return writeFile(tabId, path, content).then(() => {
      lastLoadedContentRef.current = content;
      markSaved(path);
    });
  };

  const assignPathToActiveTab = useCallback((path: string, content: string) => {
    const id = activeTabIdRef.current;
    if (!id) return;
    setOpenTabs((prev) => prev.map((t) => (t.id === id ? { ...t, path } : t)));
    setCurrentPath(path);
    lastLoadedContentRef.current = content;
    markSaved(path);
    markTabClean(id);
  }, [markSaved, markTabClean]);

  const saveActiveTab = async (view: EditorView) => {
    const path = pathRef.current;
    if (path) {
      await saveNow(view, path);
      return;
    }
    const id = activeTabIdRef.current;
    if (!id) return;
    const name = await findAvailableUntitledName(tabId);
    const content = view.state.doc.toString();
    await writeFile(tabId, name, content);
    assignPathToActiveTab(name, content);
  };

  const openFile = useCallback((path: string, pushHistory = true) => {
    setOpenTabs((prev) => {
      const existing = prev.find((t) => t.path === path);
      if (existing) {
        setActiveTabId(existing.id);
        return prev;
      }
      const tab = makeEditorTab(path);
      setActiveTabId(tab.id);
      return [...prev, tab];
    });
    if (pushHistory) {
      setHistory((prev) => [...prev.slice(0, historyIndexRef.current + 1), path]);
      setHistoryIndex((i) => i + 1);
    }
    setCurrentPath(path);
  }, []);

  const openFileRef = useRef(openFile);
  openFileRef.current = openFile;

  useEffect(() => {
    if (!filePath) return;
    openFileRef.current(filePath, false);
    setHistory([filePath]);
    setHistoryIndex(0);
  }, [filePath]);

  const selectTab = (id: string) => {
    const view = viewRef.current;
    if (view && activeTabId) {
      tabDraftsRef.current.set(activeTabId, view.state.doc.toString());
    }
    const tab = openTabs.find((t) => t.id === id);
    if (!tab) return;
    setActiveTabId(id);
    setCurrentPath(tab.path);
  };

  const openNewTab = () => {
    const existingEmpty = openTabs.find((t) => t.path === null && !dirtyTabIds.has(t.id));
    if (existingEmpty) {
      setActiveTabId(existingEmpty.id);
      setCurrentPath(null);
      return;
    }
    const tab = makeEditorTab(null);
    setOpenTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
    setCurrentPath(null);
  };

  const closeTab = (id: string) => {
    setOpenTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      if (idx === -1) return prev;
      const closing = prev[idx];
      const next = prev.filter((t) => t.id !== id);
      if (id === activeTabId) {
        const neighbor = next[idx] ?? next[idx - 1];
        if (neighbor) {
          setActiveTabId(neighbor.id);
          setCurrentPath(neighbor.path);
        } else {
          setActiveTabId(null);
          setCurrentPath(null);
        }
      }
      if (closing.path) {
        setUnsavedPaths((unsaved) => {
          if (!unsaved.has(closing.path!)) return unsaved;
          const updated = new Set(unsaved);
          updated.delete(closing.path!);
          return updated;
        });
      }
      tabDraftsRef.current.delete(id);
      setDirtyTabIds((dirty) => {
        if (!dirty.has(id)) return dirty;
        const updated = new Set(dirty);
        updated.delete(id);
        return updated;
      });
      return next;
    });
  };

  const goBack = () => {
    if (historyIndex <= 0) return;
    const i = historyIndex - 1;
    const path = history_[i];
    setHistoryIndex(i);
    openFile(path, false);
  };

  const goForward = () => {
    if (historyIndex >= history_.length - 1) return;
    const i = historyIndex + 1;
    const path = history_[i];
    setHistoryIndex(i);
    openFile(path, false);
  };

  const activeTab = openTabs.find((t) => t.id === activeTabId);
  const hasActiveTab = activeTabId !== null;
  const isMarkdown = currentPath ? isMarkdownPath(currentPath) : component === "markdown";
  const currentDirty = activeTab ? isTabDirty(activeTab) : false;

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

  const dragProps = tabNode
    ? {
        draggable: true,
        onDragStart: (e: DragEvent) => {
          pushOverlayBlock();
          startPaneDrag(e, tabNode);
        },
        onDragEnd: () => popOverlayBlock(),
      }
    : {};

  useEffect(() => {
    if (!hasActiveTab || !hostRef.current) return;

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
          .then((path) => openFileRef.current(path))
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
          history(),
          keymap.of([indentWithTab, ...historyKeymap]),
          EditorView.lineWrapping,
          workspaceEditorTheme,
          columnGuideTheme,
          EditorView.clickAddsSelectionRange.of((event) => event.altKey || event.metaKey),
          EditorView.updateListener.of((update) => {
            setSearchOpen(searchPanelOpen(update.view.state));
            if (!update.docChanged) return;
            if (isMarkdown) setOutline(computeOutline(update.view));
            const path = pathRef.current;
            const tabId_ = activeTabIdRef.current;
            if (path) {
              markUnsaved(path);
            } else if (tabId_) {
              markTabDirty(tabId_);
              tabDraftsRef.current.set(tabId_, update.view.state.doc.toString());
            }
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
        if (!viewRef.current) return;
        if (autoSaveTimerRef.current) {
          clearTimeout(autoSaveTimerRef.current);
          autoSaveTimerRef.current = null;
        }
        saveActiveTab(viewRef.current).catch(console.error);
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
  }, [tabId, hasActiveTab, rootPath, currentPath, isMarkdown, activeTabId]);

  useEffect(() => {
    if (!activeTabId || !viewRef.current) return;
    if (currentPath) {
      readFile(tabId, currentPath)
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
          markSaved(currentPath);
        })
        .catch(console.error);
      return;
    }
    const draft = tabDraftsRef.current.get(activeTabId) ?? "";
    lastLoadedContentRef.current = draft;
    viewRef.current.dispatch({
      changes: { from: 0, to: viewRef.current.state.doc.length, insert: draft },
      annotations: Transaction.addToHistory.of(false),
    });
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
  }, [currentPath, activeTabId, tabId, markSaved]);

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
            annotations: Transaction.addToHistory.of(false),
          });
          if (autoSaveTimerRef.current) {
            clearTimeout(autoSaveTimerRef.current);
            autoSaveTimerRef.current = null;
          }
          markSaved(currentPath);
        })
        .catch(console.error);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [currentPath, tabId, markSaved]);

  const jumpToHeading = (pos: number) => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
    view.focus();
  };

  return (
    <div className="obsidian-editor-shell">
      <div className="obsidian-topbar" {...dragProps}>
        <div className="obsidian-topbar-icons">
          <button
            type="button"
            className={`obsidian-topbar-icon${treeOpen ? " active" : ""}`}
            title="Toggle file explorer"
            onClick={() => setTreeOpen((v) => !v)}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
              <path
                fill="currentColor"
                d="M1.5 2.5A1.5 1.5 0 0 1 3 1h4.586a1 1 0 0 1 .707.293l1.414 1.414A1 1 0 0 0 10.414 3.5H13A1.5 1.5 0 0 1 14.5 5v8.5A1.5 1.5 0 0 1 13 15H3A1.5 1.5 0 0 1 1.5 13.5v-11Z"
              />
            </svg>
          </button>
          <button
            type="button"
            className={`obsidian-topbar-icon${searchOpen ? " active" : ""}`}
            title="Search"
            onClick={toggleSearch}
            disabled={!hasActiveTab}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
              <path
                fill="currentColor"
                d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85Zm-5.242 1.156a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z"
              />
            </svg>
          </button>
          {isMarkdown && (
            <button
              type="button"
              className={`obsidian-topbar-icon${outlineOpen ? " active" : ""}`}
              title="Toggle outline"
              onClick={() => setOutlineOpen((v) => !v)}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M2 3h12v1H2V3Zm0 4h12v1H2V7Zm0 4h8v1H2v-1Z"
                />
              </svg>
            </button>
          )}
        </div>
        <EditorTabBar
          tabs={openTabs}
          activeTabId={activeTabId}
          isTabDirty={isTabDirty}
          onSelect={selectTab}
          onClose={closeTab}
          onNewTab={openNewTab}
        />
        <PaneActions
          component={component}
          onSplit={onSplit}
          onTypeChange={onTypeChange}
          onClose={onClose}
        />
      </div>
      <div className="obsidian-body">
        <div className={`obsidian-explorer${treeOpen ? "" : " collapsed"}`}>
          <TreeView
            tabId={tabId}
            rootPath={rootPath}
            selectedPath={currentPath}
            onOpenFile={(path) => openFile(path)}
          />
        </div>
        <div className="obsidian-editor-column">
          <div className="obsidian-nav-row">
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
            <span className="obsidian-nav-spacer" />
            {hasActiveTab && !autoSave && (
              <span className={`md-pane-save-status${currentDirty ? " unsaved" : ""}`}>
                {currentDirty ? "Unsaved" : "Saved"}
              </span>
            )}
          </div>
          {hasActiveTab ? (
            <div className="md-editor" ref={hostRef} />
          ) : (
            <div className="md-empty-state">
              <button type="button" onClick={openNewTab}>
                New tab
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
    </div>
  );
}
