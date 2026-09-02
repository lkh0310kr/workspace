import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Compartment, EditorSelection, EditorState, Transaction } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, drawSelection } from "@codemirror/view";
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
import { closeSearchPanel, openSearchPanel, searchPanelOpen, selectNextOccurrence } from "@codemirror/search";
import { listDir, onFileChanged, readFile, renamePath, writeFile } from "../electron";
import { getStoredAutoSave, subscribeAutoSave } from "../autosave";
import { markdownProseTheme, workspaceEditorTheme } from "../codemirrorTheme";
import { indentGuides } from "../indentGuides";
import { syntaxTheme } from "../codemirrorSyntax";
import { workspaceSearch } from "../codemirrorSearch";
import { markdownLivePreview, markdownRootPath, HEADING_TYPES } from "../markdownLivePreview";
import { wikiLinkExtension } from "../markdownWikilink";
import { buildRenamedPath, markdownTitleFor, validateTitleInput } from "../markdownTitleRename";
import { pastePlainTextCommand } from "../editorPlainPaste";
import { buildJapaneseStudyContextMenuItems } from "../japanese/studyAssistCommands";
import { clearFocusedEditorView, setFocusedEditorView } from "../activeEditorView";
import { ContextMenu } from "../components/ContextMenu";
import type { TabKind } from "../layout/paneTypes";
import { Popover, type AnchorRect } from "../components/Popover";

// The per-file content half of what used to be ui/EditorPane.tsx — tab strip
// and multi-file routing live in PaneGroup; TreeView/explorer sidebar renders
// inside this component when the editor chip is active (not beside browser tabs).
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
  treeOpen: boolean;
  onToggleTree: () => void;
  /** 1-based line to scroll to and select, e.g. from a Find-in-Files result
   * click — ephemeral (not persisted layout state), consumed once via
   * onJumpConsumed so PaneGroup can clear it. */
  jumpToLine?: number | null;
  onJumpConsumed?: () => void;
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

function jumpToPos(view: EditorView, pos: number): void {
  view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
  view.focus();
}

/** 1-based line number to a doc offset, clamped to the doc's actual line
 * count — a Find-in-Files result can point past the end of a file that
 * changed on disk since the search ran. */
function lineStartPos(view: EditorView, line: number): number {
  const clamped = Math.min(Math.max(1, line), view.state.doc.lines);
  return view.state.doc.line(clamped).from;
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

export function EditorContent({
  tabId,
  rootPath,
  filePath,
  kind,
  zoom,
  onOpenFile,
  onAssignPath,
  onDirtyChange,
  treeOpen,
  onToggleTree,
  jumpToLine,
  onJumpConsumed,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const pathRef = useRef<string | null>(filePath);
  pathRef.current = filePath;
  const lastLoadedContentRef = useRef<string | null>(null);
  const contentLoadedRef = useRef(false);
  const onJumpConsumedRef = useRef(onJumpConsumed);
  onJumpConsumedRef.current = onJumpConsumed;
  const [outlineAnchor, setOutlineAnchor] = useState<AnchorRect | null>(null);
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
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [titleError, setTitleError] = useState<string | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [studyContextMenu, setStudyContextMenu] = useState<{ x: number; y: number } | null>(null);
  const setStudyContextMenuRef = useRef(setStudyContextMenu);
  setStudyContextMenuRef.current = setStudyContextMenu;

  const closeStudyContextMenu = useCallback(() => setStudyContextMenu(null), []);
  const japaneseStudyContextMenuItems = useMemo(
    () => buildJapaneseStudyContextMenuItems(() => viewRef.current, closeStudyContextMenu),
    [closeStudyContextMenu],
  );

  const setDirtyState = useCallback((next: boolean) => {
    if (dirtyRef.current === next) return;
    dirtyRef.current = next;
    setDirty(next);
    onDirtyChangeRef.current(next);
  }, []);

  const applyLoadedFileContent = useCallback(
    (view: EditorView, content: string, jumpLine?: number | null) => {
      lastLoadedContentRef.current = content;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: content },
        annotations: Transaction.addToHistory.of(false),
      });
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      setDirtyState(false);
      contentLoadedRef.current = true;
      if (jumpLine != null) {
        jumpToPos(view, lineStartPos(view, jumpLine));
        onJumpConsumedRef.current?.();
      }
    },
    [setDirtyState],
  );

  const loadFileContent = useCallback(
    (path: string, jumpLine?: number | null): boolean => {
      const view = viewRef.current;
      if (!view) return false;
      readFile(tabId, path)
        .then((content) => {
          const activeView = viewRef.current;
          if (!activeView || pathRef.current !== path) return;
          applyLoadedFileContent(activeView, content, jumpLine);
        })
        .catch(console.error);
      return true;
    },
    [tabId, applyLoadedFileContent],
  );

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

  const enterTitleEdit = useCallback(() => {
    setTitleDraft(markdownTitleFor(pathRef.current));
    setTitleError(null);
    setTitleEditing(true);
  }, []);

  useEffect(() => {
    if (!titleEditing) return;
    titleInputRef.current?.focus();
    titleInputRef.current?.select();
  }, [titleEditing]);

  // Obsidian-style click-to-rename: commits by renaming the real file
  // (existing-file case) or writing it for the first time (untitled tab —
  // same Save-As path saveActiveFile above uses). Rejects a collision with
  // an inline error instead of silently overwriting or auto-suffixing —
  // auto-suffix stays reserved for TreeView's "New File" flow, a different
  // action from renaming something that already has a name.
  const commitTitleRename = useCallback(async () => {
    const validation = validateTitleInput(titleDraft);
    if ("error" in validation) {
      if (validation.error === "empty") {
        setTitleEditing(false);
        setTitleError(null);
        return;
      }
      setTitleError('Title can’t contain "/" or "\\".');
      titleInputRef.current?.focus();
      return;
    }

    const nextTitle = validation.title;
    if (nextTitle === markdownTitleFor(pathRef.current)) {
      setTitleEditing(false);
      setTitleError(null);
      return;
    }

    const targetPath = buildRenamedPath(pathRef.current, nextTitle);
    const targetDir = targetPath.includes("/") ? targetPath.slice(0, targetPath.lastIndexOf("/")) : "";
    const targetBase = (targetPath.split("/").pop() ?? targetPath).toLowerCase();
    const entries = await listDir(tabId, targetDir).catch(() => []);
    const collision = entries.some(
      (e) => !e.is_dir && e.name.toLowerCase() === targetBase && targetPath !== pathRef.current,
    );
    if (collision) {
      setTitleError(`"${nextTitle}" already exists.`);
      titleInputRef.current?.focus();
      return;
    }

    setTitleEditing(false);
    setTitleError(null);

    if (!pathRef.current) {
      const content = viewRef.current?.state.doc.toString() ?? "";
      await writeFile(tabId, targetPath, content);
      lastLoadedContentRef.current = content;
      setDirtyState(false);
      onAssignPathRef.current(targetPath);
      return;
    }

    try {
      await renamePath(tabId, pathRef.current, targetPath);
      onAssignPathRef.current(targetPath);
    } catch (err) {
      setTitleDraft(nextTitle);
      setTitleEditing(true);
      setTitleError(String(err));
    }
  }, [tabId, titleDraft, setDirtyState]);

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

    const japaneseStudyMenuHandler = EditorView.domEventHandlers({
      contextmenu(event, view) {
        const { from, to } = view.state.selection.main;
        if (from === to) return false;
        const text = view.state.sliceDoc(from, to).trim();
        if (!text) return false;
        event.preventDefault();
        event.stopPropagation();
        setFocusedEditorView(view);
        setStudyContextMenuRef.current({ x: event.clientX, y: event.clientY });
        void import("../electron").then(({ japaneseStudyLog }) =>
          japaneseStudyLog("context_menu_open", { textLength: text.length, from, to }),
        );
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
            { key: "Mod-Shift-v", run: pastePlainTextCommand },
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
            { key: "Mod-Shift-v", run: pastePlainTextCommand },
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
          japaneseStudyMenuHandler,
          ...workspaceSearch,
          indentUnit.of("    "),
          history(),
          // Alt/Cmd-click already added a second cursor's *range* via
          // clickAddsSelectionRange below, but without this the editor
          // silently collapsed it back to one selection on the next edit —
          // CodeMirror only keeps multiple selection ranges alive when this
          // is explicitly opted into. Mod-d (select-next-occurrence) is the
          // other half of "real" multi-select — VS Code/Sublime convention.
          EditorState.allowMultipleSelections.of(true),
          drawSelection(),
          keymap.of([indentWithTab, ...historyKeymap, { key: "Mod-d", run: selectNextOccurrence }]),
          EditorView.lineWrapping,
          workspaceEditorTheme,
          indentGuides,
          // Option+click (altKey) adds another cursor — VS Code/Obsidian on macOS.
          EditorView.clickAddsSelectionRange.of((event) => event.altKey),
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

    const onEditorFocus = (): void => setFocusedEditorView(view);
    const onEditorBlur = (): void => clearFocusedEditorView(view);
    view.dom.addEventListener("focus", onEditorFocus, true);
    view.dom.addEventListener("blur", onEditorBlur, true);

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
      view.dom.removeEventListener("focus", onEditorFocus, true);
      view.dom.removeEventListener("blur", onEditorBlur, true);
      setStudyContextMenuRef.current(null);
      clearFocusedEditorView(view);
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
    if (!filePath) return;
    contentLoadedRef.current = false;
    let cancelled = false;
    let frameId = 0;
    let attempts = 0;
    const run = (): void => {
      if (cancelled) return;
      attempts += 1;
      if (loadFileContent(filePath, jumpToLine)) return;
      if (attempts < 12) frameId = window.requestAnimationFrame(run);
    };
    run();
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
    };
    // jumpToLine handled inside the initial load when present; the effect
    // below covers jumps on an already-loaded file only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, filePath, loadFileContent]);

  useEffect(() => {
    if (jumpToLine == null) return;
    if (!contentLoadedRef.current) return;
    const view = viewRef.current;
    if (!view) return;
    jumpToPos(view, lineStartPos(view, jumpToLine));
    onJumpConsumedRef.current?.();
  }, [jumpToLine]);

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
          const selection = view.state.selection;
          lastLoadedContentRef.current = content;
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
    setOutlineAnchor(null);
    if (!view) return;
    jumpToPos(view, pos);
  };

  // Markdown's .md-scroll-container switched CodeMirror to auto-height
  // (see its CSS comment) so the title can scroll away with the content —
  // but that also shrank .cm-editor's own clickable area down to exactly
  // the text's height, leaving the blank space below the last line (most
  // notes don't fill the pane) dead: clicking there used to land inside
  // CodeMirror's own full-height box and just move the cursor to the
  // nearest position (ordinary editor behavior), now it hits nothing.
  // Restores that by focusing and moving the cursor to the end of the
  // document whenever the click didn't actually land inside CodeMirror's
  // own DOM (the title input and any of its own content still handle
  // their own clicks normally).
  const onScrollContainerClick = (e: ReactMouseEvent) => {
    // Not just .cm-editor — .md-title/.md-title-edit sit in this same
    // scroll container as a sibling of .md-editor now, and without this
    // a title click would bubble up here too and immediately steal focus
    // back from the rename input it just opened.
    if ((e.target as HTMLElement).closest(".cm-editor, .md-title, .md-title-edit")) return;
    const view = viewRef.current;
    if (!view) return;
    jumpToPos(view, view.state.doc.length);
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
                className={`obsidian-topbar-icon${outlineAnchor ? " active" : ""}`}
                title="Toggle outline"
                onClick={(e) => {
                  if (outlineAnchor) {
                    setOutlineAnchor(null);
                    return;
                  }
                  setOutlineAnchor(e.currentTarget.getBoundingClientRect());
                }}
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
            <button
              type="button"
              className={`obsidian-topbar-icon${treeOpen ? " active" : ""}`}
              title="Toggle file explorer"
              onClick={onToggleTree}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M1.5 2.5A1.5 1.5 0 0 1 3 1h4.586a1 1 0 0 1 .707.293l1.414 1.414A1 1 0 0 0 10.414 3.5H13A1.5 1.5 0 0 1 14.5 5v8.5A1.5 1.5 0 0 1 13 15H3A1.5 1.5 0 0 1 1.5 13.5v-11Z"
                />
              </svg>
            </button>
          </div>
          {isMarkdown ? (
            // Obsidian-style: the title lives in the same scroll container
            // as the editor content (not a fixed header above it) so it
            // scrolls away with the rest of the note instead of staying
            // pinned — see .md-scroll-container's CSS for how CodeMirror
            // itself is switched to auto-height/no-internal-scroll to make
            // that possible. Code files (below) keep the ordinary
            // internally-scrolling .md-editor unchanged.
            <div className="md-scroll-container" onClick={onScrollContainerClick}>
              {titleEditing ? (
                <div className="md-title-edit">
                  <input
                    ref={titleInputRef}
                    className={`md-title md-title-input${titleError ? " error" : ""}`}
                    value={titleDraft}
                    onChange={(e) => {
                      setTitleDraft(e.target.value);
                      setTitleError(null);
                    }}
                    onBlur={() => void commitTitleRename()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        titleInputRef.current?.blur();
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        setTitleEditing(false);
                        setTitleError(null);
                      }
                    }}
                  />
                  {titleError && <div className="md-title-error">{titleError}</div>}
                </div>
              ) : (
                <div className="md-title" title={filePath ?? undefined} onClick={enterTitleEdit}>
                  {markdownTitleFor(filePath)}
                </div>
              )}
              <div
                className="md-editor"
                ref={hostRef}
                style={{ "--editor-font-size": `${13 * zoom}px` } as CSSProperties}
              />
            </div>
          ) : (
            <div
              className="md-editor"
              ref={hostRef}
              style={{ "--editor-font-size": `${13 * zoom}px` } as CSSProperties}
            />
          )}
        </div>
        {isMarkdown && outlineAnchor && (
          <Popover anchorRect={outlineAnchor} onClose={() => setOutlineAnchor(null)} align="end" className="md-pane-outline-popover">
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
          </Popover>
        )}
        {studyContextMenu ? (
          <ContextMenu
            x={studyContextMenu.x}
            y={studyContextMenu.y}
            items={japaneseStudyContextMenuItems}
            onClose={closeStudyContextMenu}
          />
        ) : null}
      </div>
    </div>
  );
}
