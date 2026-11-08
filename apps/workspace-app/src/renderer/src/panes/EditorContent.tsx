import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, drawSelection } from "@codemirror/view";
import { createMarkdownEditorExtensions, EditorMarkdownDocument, EditorMarkdownSurface, EditorTextSurface, externalEditorChange, markdownRootPath, replaceEditorDocument, resolveEditorRelativeLink, useEditorDocumentSnapshot, wikiLinkExtension, type EditorDocumentSession } from "@workspace/editor";
import { acquireLocalEditorProvider } from "../editor/localEditorProvider";
import { toggleComment } from "@codemirror/commands";
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
  indentUnit,
  LanguageDescription,
} from "@codemirror/language";
import { languages as languageData } from "@codemirror/language-data";
import { closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap } from "@codemirror/autocomplete";
import { closeSearchPanel, openSearchPanel, searchPanelOpen, selectNextOccurrence } from "@codemirror/search";
import { listDir, writeFile } from "../electron";
import { getStoredAutoSave, subscribeAutoSave } from "../autosave";
import { markdownProseTheme, workspaceEditorTheme } from "../codemirrorTheme";
import { indentGuides } from "../indentGuides";
import { syntaxTheme } from "../codemirrorSyntax";
import { workspaceSearch } from "../codemirrorSearch";
import { buildRenamedPath, markdownTitleFor, validateTitleInput } from "../markdownTitleRename";
import { pastePlainTextCommand } from "../editorPlainPaste";
import { getFocusedEditorView } from "../activeEditorView";
import { clearFocusedEditorView, setFocusedEditorView } from "../activeEditorView";
import type { TabKind } from "../layout/paneTypes";

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
  onOpenFile: (path: string, kind: "code" | "markdown" | "viewer") => void;
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
  const editorProviderLease = useMemo(() => acquireLocalEditorProvider(tabId), [tabId]);
  const editorProvider = editorProviderLease.provider;
  const documentSessionRef = useRef<EditorDocumentSession | null>(null);
  const [activeDocumentSession, setActiveDocumentSession] = useState<EditorDocumentSession | null>(null);
  const documentSnapshot = useEditorDocumentSnapshot(activeDocumentSession);
  const documentLoadSequenceRef = useRef(0);
  const editorShellRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const viewCleanupRef = useRef<(() => void) | null>(null);
  const languageCompartmentRef = useRef<Compartment | null>(null);
  const markdownRootCompartmentRef = useRef<Compartment | null>(null);
  const pathRef = useRef<string | null>(filePath);
  pathRef.current = filePath;
  const contentLoadedRef = useRef(false);
  const suppressProviderEditRef = useRef(false);
  const onJumpConsumedRef = useRef(onJumpConsumed);
  onJumpConsumedRef.current = onJumpConsumed;
  const [searchOpen, setSearchOpen] = useState(false);
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [resolvedDocumentIdentity, setResolvedDocumentIdentity] = useState<{ path: string; key: string } | null>(null);
  const [autoSave, setAutoSave] = useState(getStoredAutoSave);
  const autoSaveRef = useRef(autoSave);
  autoSaveRef.current = autoSave;
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathRenameInFlightRef = useRef(false);
  const skipPathLoadRef = useRef<string | null>(null);
  const editRevisionRef = useRef(0);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
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
  const isMarkdown = kind === "markdown";
  const documentCacheKey = activeDocumentSession
    ? `${activeDocumentSession.item.providerId}:${activeDocumentSession.item.itemId}`
    : resolvedDocumentIdentity?.path === filePath
      ? resolvedDocumentIdentity.key
      : `${editorProvider.id}:path:${filePath ?? `untitled:${tabId}`}`;
  const setDirtyState = useCallback((next: boolean) => {
    if (dirtyRef.current === next) return;
    dirtyRef.current = next;
    setDirty(next);
    onDirtyChangeRef.current(next);
  }, []);

  const applyLoadedFileContent = useCallback(
    (view: EditorView, content: string, jumpLine?: number | null) => {
      suppressProviderEditRef.current = true;
      replaceEditorDocument(view, content, externalEditorChange);
      suppressProviderEditRef.current = false;
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
      const sequence = ++documentLoadSequenceRef.current;
      if (documentSessionRef.current?.item.path !== path) {
        const previous = documentSessionRef.current;
        documentSessionRef.current = null;
        setActiveDocumentSession(null);
        if (previous) void previous.close();
      }
      editorProvider.itemRefForPath(path)
        .then((item) => {
          if (!item) throw new Error(`File not found: ${path}`);
          if (sequence === documentLoadSequenceRef.current && pathRef.current === path) {
            setResolvedDocumentIdentity({ path, key: `${item.providerId}:${item.itemId}` });
          }
          return editorProvider.openDocument(item);
        })
        .then(async (session) => {
          if (sequence !== documentLoadSequenceRef.current || pathRef.current !== path) {
            await session.close();
            return;
          }
          const previous = documentSessionRef.current;
          documentSessionRef.current = session;
          setActiveDocumentSession(session);
          if (previous && previous !== session) await previous.close();
          const snapshot = session.snapshot();
          if (snapshot.content.type === "text") {
            const activeView = viewRef.current;
            if (activeView) applyLoadedFileContent(activeView, snapshot.content.text, jumpLine);
          }
        })
        .catch((error) => setSaveError(error instanceof Error ? error.message : String(error)));
      return true;
    },
    [editorProvider, applyLoadedFileContent, setDirtyState],
  );

  useEffect(() => () => {
    documentLoadSequenceRef.current += 1;
    void documentSessionRef.current?.close();
    editorProviderLease.release();
  }, [editorProviderLease]);

  useEffect(() => {
    if (documentSnapshot?.savePhase === "conflict") {
      setSaveError(documentSnapshot.message ?? "The file changed on disk.");
    } else if (documentSnapshot?.savePhase === "clean") {
      setSaveError(null);
      setDirtyState(false);
    }
  }, [documentSnapshot, setDirtyState]);

  useEffect(() => subscribeAutoSave(setAutoSave), []);

  const saveNow = useCallback(
    (view: EditorView, path: string) => {
      const content = view.state.doc.toString();
      const revision = editRevisionRef.current;
      setSaveError(null);
      const session = documentSessionRef.current;
      const write = saveQueueRef.current.catch(() => {}).then(async () => {
        if (session && session.item.path === path) {
          await session.save();
        } else {
          await writeFile(tabId, path, content);
        }
      });
      saveQueueRef.current = write.then(() => {}, () => {});
      return write.then(() => {
        if (
          viewRef.current === view &&
          (pathRef.current === path || pathRef.current === null) &&
          editRevisionRef.current === revision
        ) {
          setDirtyState(false);
        }
      }).catch((error: unknown) => {
        setSaveError(error instanceof Error ? error.message : String(error));
        throw error;
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
      await saveNow(view, name);
      onAssignPathRef.current(name);
    },
    [tabId, saveNow, setDirtyState],
  );

  const scheduleAutoSave = useCallback((view: EditorView) => {
    if (!pathRef.current || !autoSaveRef.current || pathRenameInFlightRef.current) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      const path = pathRef.current;
      if (path) saveNow(view, path).catch(console.error);
    }, 600);
  }, [saveNow]);

  const editorExtensions = useMemo(() => {
    const rootCompartment = new Compartment();
    const languageCompartment = new Compartment();
    markdownRootCompartmentRef.current = rootCompartment;
    languageCompartmentRef.current = languageCompartment;
    const modeExtensions = isMarkdown
      ? [
          ...createMarkdownEditorExtensions({ parserExtensions: [wikiLinkExtension] }),
          rootCompartment.of(markdownRootPath.of(rootPath)),
          markdownProseTheme,
          keymap.of([
            { key: "Mod-Shift-v", run: pastePlainTextCommand },
          ]),
        ]
      : [
          languageCompartment.of([]),
          lineNumbers(), highlightActiveLineGutter(), foldGutter(), bracketMatching(), closeBrackets(),
          autocompletion(), indentOnInput(), syntaxTheme,
          keymap.of([
            { key: "Mod-/", run: toggleComment },
            { key: "Mod-Shift-v", run: pastePlainTextCommand },
            ...closeBracketsKeymap, ...completionKeymap, ...foldKeymap,
          ]),
        ];

    return [
      ...modeExtensions,
      ...workspaceSearch,
      indentUnit.of("    "),
      EditorState.allowMultipleSelections.of(true),
      drawSelection(),
      keymap.of([{ key: "Mod-d", run: selectNextOccurrence }]),
      workspaceEditorTheme,
      indentGuides,
      EditorView.clickAddsSelectionRange.of((event) => event.altKey),
      EditorView.updateListener.of((update) => {
        setSearchOpen(searchPanelOpen(update.view.state));
        if (!update.docChanged) return;
        editRevisionRef.current += 1;
        if (suppressProviderEditRef.current || update.transactions.some((transaction) => transaction.annotation(externalEditorChange))) return;
        setDirtyState(true);
        const path = pathRef.current;
        if (!path || !autoSaveRef.current || pathRenameInFlightRef.current) return;
        scheduleAutoSave(update.view);
      }),
    ];
    // rootPath is updated through its compartment below; mode-specific extensions remount on kind changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMarkdown, scheduleAutoSave, setDirtyState, tabId]);

  const onViewReady = useCallback((view: EditorView | null) => {
    viewCleanupRef.current?.();
    viewCleanupRef.current = null;
    viewRef.current = view;
    if (!view) return;
    if (isMarkdown) setOutline([]);
    const onEditorFocus = (): void => setFocusedEditorView(view);
    const onEditorBlur = (): void => clearFocusedEditorView(view);
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "s") {
        if (getFocusedEditorView() !== view) return;
        event.preventDefault();
        if (pathRenameInFlightRef.current || !viewRef.current) return;
        if (autoSaveTimerRef.current) {
          clearTimeout(autoSaveTimerRef.current);
          autoSaveTimerRef.current = null;
        }
        void saveActiveFile(view).catch(console.error);
      }
    };
    view.dom.addEventListener("focus", onEditorFocus, true);
    view.dom.addEventListener("blur", onEditorBlur, true);
    window.addEventListener("keydown", onKey);
    viewCleanupRef.current = () => {
      window.removeEventListener("keydown", onKey);
      view.dom.removeEventListener("focus", onEditorFocus, true);
      view.dom.removeEventListener("blur", onEditorBlur, true);
      clearFocusedEditorView(view);
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [isMarkdown, saveActiveFile]);

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
    const view = viewRef.current;
    if (!view) return;
    pathRenameInFlightRef.current = true;
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    if (!pathRef.current) {
      try {
        await saveNow(view, targetPath);
        skipPathLoadRef.current = targetPath;
        pathRef.current = targetPath;
        onAssignPathRef.current(targetPath);
      } catch (err) {
        setTitleDraft(nextTitle);
        setTitleEditing(true);
        setTitleError(String(err));
      } finally {
        pathRenameInFlightRef.current = false;
        if (dirtyRef.current) scheduleAutoSave(view);
      }
      return;
    }

    const sourcePath = pathRef.current;
    try {
      if (autoSaveRef.current && dirtyRef.current) await saveNow(view, sourcePath);
      const session = documentSessionRef.current;
      if (session && session.item.path === sourcePath) {
        await editorProvider.rename(session.item, targetPath.split("/").at(-1) ?? targetPath);
      } else {
        const item = await editorProvider.itemRefForPath(sourcePath);
        if (!item) throw new Error("File no longer exists");
        await editorProvider.rename(item, targetPath.split("/").at(-1) ?? targetPath);
      }
      skipPathLoadRef.current = targetPath;
      pathRef.current = targetPath;
      onAssignPathRef.current(targetPath);
    } catch (err) {
      setTitleDraft(nextTitle);
      setTitleEditing(true);
      setTitleError(String(err));
    } finally {
      pathRenameInFlightRef.current = false;
      if (dirtyRef.current) scheduleAutoSave(view);
    }
  }, [tabId, titleDraft, saveNow, scheduleAutoSave, editorProvider]);

  useEffect(() => {
    if (!isMarkdown) return;
    const view = viewRef.current;
    const compartment = markdownRootCompartmentRef.current;
    if (view && compartment) view.dispatch({ effects: compartment.reconfigure(markdownRootPath.of(rootPath)) });
  }, [isMarkdown, rootPath]);

  useEffect(() => {
    if (isMarkdown || !filePath) return;
    let cancelled = false;
    const view = viewRef.current;
    const compartment = languageCompartmentRef.current;
    const desc = LanguageDescription.matchFilename(languageData, filePath);
    desc?.load().then((support) => {
      if (!cancelled && view && viewRef.current === view && compartment) {
        view.dispatch({ effects: compartment.reconfigure(support) });
      }
    }).catch(console.error);
    return () => { cancelled = true; };
  }, [filePath, isMarkdown]);

  useEffect(() => {
    setSaveError(null);
    if (!filePath) return;
    if (skipPathLoadRef.current === filePath) {
      skipPathLoadRef.current = null;
      contentLoadedRef.current = true;
      return;
    }
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

  // The shared Markdown document frame scrolls CodeMirror at auto-height
  // so the title moves away with the content —
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
    if ((e.target as HTMLElement).closest(".cm-editor, .editor-markdown-title, .md-title-edit")) {
      return;
    }
    const view = viewRef.current;
    if (!view) return;
    jumpToPos(view, view.state.doc.length);
  };

  const editorFontStyle = { "--editor-font-size": `${13 * zoom}px` } as CSSProperties;
  const editorActions = (
    <>
      {(!autoSave || saveError) && <span className={`md-pane-save-status${saveError ? " error" : dirty ? " unsaved" : ""}`} role="status" aria-live="polite" title={saveError ?? undefined}>{saveError ? "Save failed" : dirty ? "Unsaved" : "Saved"}</span>}
      <button type="button" className={`obsidian-topbar-icon${searchOpen ? " active" : ""}`} title="Search" onClick={toggleSearch}><svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85Zm-5.242 1.156a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z" /></svg></button>
      <button type="button" className={`obsidian-topbar-icon${treeOpen ? " active" : ""}`} title="Toggle file explorer" onClick={onToggleTree}><svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M1.5 2.5A1.5 1.5 0 0 1 3 1h4.586a1 1 0 0 1 .707.293l1.414 1.414A1 1 0 0 0 10.414 3.5H13A1.5 1.5 0 0 1 14.5 5v8.5A1.5 1.5 0 0 1 13 15H3A1.5 1.5 0 0 1 1.5 13.5v-11Z" /></svg></button>
    </>
  );

  return (
    <div className="obsidian-editor-shell">
      <div className="obsidian-body">
        <div className="obsidian-editor-column">
          {!isMarkdown && <div className="obsidian-float-actions">{editorActions}</div>}
          {isMarkdown ? (
            // The shared Markdown frame keeps the title in the document
            // scroll; code files below keep their internally scrolling editor.
            <EditorMarkdownDocument
              actions={editorActions}
              outlineItems={outline.map((item) => ({ id: String(item.pos), level: item.level, label: item.text, position: item.pos }))}
              outlineKey={documentCacheKey}
              onOutlineNavigate={(position) => { const view = viewRef.current; if (view) jumpToPos(view, position); }}
              title={titleEditing ? (
                <div className="md-title-edit">
                  <input
                    ref={titleInputRef}
                    className={`editor-markdown-title md-title-input${titleError ? " error" : ""}`}
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
                <div className="editor-markdown-title" title={filePath ?? undefined} onClick={enterTitleEdit}>
                  {markdownTitleFor(filePath)}
                </div>
              )}
              onBackgroundClick={onScrollContainerClick}
            >
              <div className="md-editor" ref={editorShellRef} style={editorFontStyle}>
                <EditorMarkdownSurface key={`${tabId}:${isMarkdown}`} documentKey={documentCacheKey} session={activeDocumentSession} initialValue="" extensions={editorExtensions} onViewReady={onViewReady} onOutlineChange={(headings) => setOutline(headings.map(({ level, title, position }) => ({ level, text: title, pos: position })))} onActivateLink={(link) => {
                  if (link.kind === "wikilink") {
                    void resolveWikiLinkTarget(tabId, link.target).then((path) => onOpenFileRef.current(path, "markdown")).catch(console.error);
                    return true;
                  }
                  const path = resolveEditorRelativeLink(filePath ?? "", link.target);
                  if (!path) return false;
                  const extension = path.split(".").at(-1)?.toLowerCase() ?? "";
                  const kind = ["md", "markdown", "mdown"].includes(extension) ? "markdown"
                    : ["png", "jpg", "jpeg", "gif", "webp", "svg", "pdf", "zip", "7z", "glb", "gltf", "stl", "step", "stp", "epub"].includes(extension) ? "viewer" : "code";
                  onOpenFileRef.current(path, kind);
                  return true;
                }} onSessionError={(error) => setSaveError(error instanceof Error ? error.message : String(error))} className="md-editor-host" ariaLabel="Markdown editor" />
              </div>
            </EditorMarkdownDocument>
          ) : (
            <div className="md-editor" ref={editorShellRef} style={editorFontStyle}>
              <EditorTextSurface key={`${tabId}:${isMarkdown}`} documentKey={documentCacheKey} session={activeDocumentSession} initialValue="" extensions={editorExtensions} onViewReady={onViewReady} onSessionError={(error) => setSaveError(error instanceof Error ? error.message : String(error))} className="md-editor-host" ariaLabel="Code editor" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
