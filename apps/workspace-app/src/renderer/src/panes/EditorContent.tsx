import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, drawSelection } from "@codemirror/view";
import { editorDocumentKey, editorOutlineEntries, editorSavePhaseLabel, editorSupportsCodeLanguage, editorSupportsOperation, EditorBreadcrumbs, EditorMarkdownEditor, EditorMarkdownTitle, EditorTextSurface, externalEditorChange, isEditorAbortError, markdownRootPath, markdownTitleFor, replaceEditorDocument, resolveEditorRelativeLink, resolveEditorTreeDirectory, resolveEditorTreePath, resolveMarkdownTitleRenameTarget, useEditorDocumentSnapshot, validateTitleInput, wikiLinkExtension, type EditorBreadcrumbEntry, type EditorDocumentSession, type MarkdownHeading } from "@workspace/editor";
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
import { getStoredAutoSave, subscribeAutoSave } from "../autosave";
import { workspaceEditorTheme } from "../codemirrorTheme";
import { indentGuides } from "../indentGuides";
import { syntaxTheme } from "../codemirrorSyntax";
import { pastePlainTextCommand } from "../editorPlainPaste";
import { getFocusedEditorView } from "../activeEditorView";
import { clearFocusedEditorView, setFocusedEditorView } from "../activeEditorView";
import type { TabKind } from "../layout/paneTypes";

const workspaceMarkdownParserExtensions = [wikiLinkExtension] as const;

// The per-file content half of what used to be ui/EditorPane.tsx — tab strip
// and multi-file routing live in PaneGroup; TreeView/explorer sidebar renders
// inside this component when the editor chip is active (not beside browser tabs).

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
  onDirtyChange: (dirty: boolean, viewStateKey?: string) => void;
  /** 1-based line to scroll to and select, e.g. from a Find-in-Files result
   * click — ephemeral (not persisted layout state), consumed once via
   * onJumpConsumed so PaneGroup can clear it. */
  jumpToLine?: number | null;
  onJumpConsumed?: () => void;
}

function getEditorViewStateStorage(): Storage | undefined {
  try { return window.localStorage; } catch { return undefined; }
}

type LocalProvider = ReturnType<typeof acquireLocalEditorProvider>["provider"];

async function findAvailableUntitledName(provider: LocalProvider): Promise<string> {
  const entries = await provider.listChildren(null);
  const names = new Set(entries.filter((entry) => entry.kind !== "directory").map((entry) => entry.name.toLowerCase()));
  if (!names.has("untitled.md")) return "untitled.md";
  let i = 1;
  while (names.has(`untitled ${i}.md`)) i++;
  return `untitled ${i}.md`;
}

async function resolveWikiLinkTarget(provider: LocalProvider, target: string): Promise<string> {
  const base = target.split("/").pop()?.trim() || target;
  const wanted = `${base.toLowerCase()}.md`;
  const queue: Array<{ parentId: string | null }> = [{ parentId: null }];
  let visited = 0;
  while (queue.length > 0 && visited < 500) {
    const dir = queue.shift()!;
    visited++;
    const entries = await provider.listChildren(dir.parentId);
    for (const entry of entries) {
      if (entry.kind === "directory") {
        queue.push({ parentId: entry.itemId });
      } else if (entry.kind === "markdown" && entry.name.toLowerCase() === wanted) {
        return entry.path;
      }
    }
  }
  const created = `${base}.md`;
  if (!editorSupportsOperation(provider, "createFile")) throw new Error("File creation is not supported by this provider");
  const item = await provider.create!(null, "file", created);
  return item.path;
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
  jumpToLine,
  onJumpConsumed,
}: Props) {
  const editorProviderLease = useMemo(() => acquireLocalEditorProvider(tabId), [tabId]);
  const editorProvider = editorProviderLease.provider;
  const loadBreadcrumbChildren = useCallback(async (directoryPath: string): Promise<EditorBreadcrumbEntry[]> => {
    const parent = await resolveEditorTreeDirectory(editorProvider, directoryPath);
    const items = await editorProvider.listChildren(parent?.itemId ?? null);
    return items.map((item) => ({
      name: item.name,
      path: item.path,
      kind: item.kind === "directory" ? "directory" : item.kind === "asset" ? "viewer" : item.kind,
    }));
  }, [editorProvider]);
  const documentSessionRef = useRef<EditorDocumentSession | null>(null);
  const [activeDocumentSession, setActiveDocumentSession] = useState<EditorDocumentSession | null>(null);
  const documentSnapshot = useEditorDocumentSnapshot(activeDocumentSession);
  const documentLoadSequenceRef = useRef(0);
  const documentLoadControllerRef = useRef<AbortController | null>(null);
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
  const [outline, setOutline] = useState<MarkdownHeading[]>([]);
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
  const showMarkdownOutline = isMarkdown && filePath?.toLowerCase().endsWith(".md") === true;
  const documentCacheKey = activeDocumentSession
    ? editorDocumentKey(activeDocumentSession.item)
    : resolvedDocumentIdentity?.path === filePath
      ? resolvedDocumentIdentity.key
      : `${editorProvider.id}:path:${filePath ?? `untitled:${tabId}`}`;
  const documentCacheKeyRef = useRef(documentCacheKey);
  documentCacheKeyRef.current = documentCacheKey;
  const pendingViewStateMigrationRef = useRef<{ from: string; to: string } | null>(null);
  const requestViewStateMigration = useCallback((nextKey: string) => {
    const currentKey = documentCacheKeyRef.current;
    pendingViewStateMigrationRef.current = currentKey && currentKey !== nextKey ? { from: currentKey, to: nextKey } : null;
  }, []);
  const onDocumentKeyChange = useCallback((previousKey: string | undefined, nextKey: string | undefined) => {
    const pending = pendingViewStateMigrationRef.current;
    if (!pending || pending.from !== previousKey || pending.to !== nextKey) return false;
    pendingViewStateMigrationRef.current = null;
    return true;
  }, []);
  const setDirtyState = useCallback((next: boolean) => {
    if (dirtyRef.current === next) return;
    dirtyRef.current = next;
    setDirty(next);
    onDirtyChangeRef.current(next, documentCacheKeyRef.current);
  }, []);

  useEffect(() => {
    onDirtyChangeRef.current(dirtyRef.current, documentCacheKey);
  }, [documentCacheKey]);

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
      documentLoadControllerRef.current?.abort();
      const controller = new AbortController();
      documentLoadControllerRef.current = controller;
      if (documentSessionRef.current?.item.path !== path) {
        const previous = documentSessionRef.current;
        documentSessionRef.current = null;
        setActiveDocumentSession(null);
        if (previous) void previous.close();
      }
      resolveEditorTreePath(editorProvider, path, controller.signal)
        .then((item) => {
          if (!item) throw new Error(`File not found: ${path}`);
          if (sequence === documentLoadSequenceRef.current && pathRef.current === path) {
            const identityKey = editorDocumentKey(item);
            requestViewStateMigration(identityKey);
            setResolvedDocumentIdentity({ path, key: identityKey });
          }
          return editorProvider.openDocument(item, controller.signal);
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
        .catch((error) => {
          if (sequence !== documentLoadSequenceRef.current || controller.signal.aborted || isEditorAbortError(error)) return;
          setSaveError(error instanceof Error ? error.message : String(error));
        })
        .finally(() => {
          if (documentLoadControllerRef.current === controller) documentLoadControllerRef.current = null;
        });
      return true;
    },
    [editorProvider, applyLoadedFileContent, requestViewStateMigration, setDirtyState],
  );

  useEffect(() => () => {
    documentLoadSequenceRef.current += 1;
    documentLoadControllerRef.current?.abort();
    documentLoadControllerRef.current = null;
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
          let targetSession = session;
          if (!targetSession || targetSession.item.path !== path) {
            let item = await resolveEditorTreePath(editorProvider, path);
            if (!item) {
              const slash = path.lastIndexOf("/");
              const parentPath = slash < 0 ? "" : path.slice(0, slash);
              const parent = parentPath ? await resolveEditorTreePath(editorProvider, parentPath) : null;
              const name = slash < 0 ? path : path.slice(slash + 1);
              if (!editorSupportsOperation(editorProvider, "createFile")) throw new Error("File creation is not supported by this provider");
              item = await editorProvider.create!(parent?.itemId ?? null, "file", name);
            }
            targetSession = await editorProvider.openDocument(item);
            requestViewStateMigration(editorDocumentKey(targetSession.item));
            documentSessionRef.current = targetSession;
            setActiveDocumentSession(targetSession);
          }
          const snapshot = targetSession.snapshot();
          if (snapshot.content.type !== "text") throw new Error("This file cannot be edited as text");
          if (snapshot.content.text !== content) await targetSession.replaceText(content, snapshot.revision);
          await targetSession.save();
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
    [editorProvider, requestViewStateMigration, setDirtyState],
  );

  const saveActiveFile = useCallback(
    async (view: EditorView) => {
      const path = pathRef.current;
      if (path) {
        await saveNow(view, path);
        return;
      }
      const name = await findAvailableUntitledName(editorProvider);
      await saveNow(view, name);
      onAssignPathRef.current(name);
    },
    [editorProvider, saveNow],
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
          rootCompartment.of(markdownRootPath.of(rootPath)),
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
      indentUnit.of("    "),
      EditorState.allowMultipleSelections.of(true),
      drawSelection(),
      workspaceEditorTheme,
      indentGuides,
      EditorView.clickAddsSelectionRange.of((event) => event.altKey),
      EditorView.updateListener.of((update) => {
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

    const currentPath = pathRef.current;
    let target: Awaited<ReturnType<typeof resolveMarkdownTitleRenameTarget>>;
    try {
      const session = documentSessionRef.current;
      target = await resolveMarkdownTitleRenameTarget(
        editorProvider,
        currentPath,
        nextTitle,
        session?.item.path === currentPath ? session.item : undefined,
      );
    } catch (error) {
      setTitleError(error instanceof Error ? error.message : String(error));
      titleInputRef.current?.focus();
      return;
    }
    const targetPath = target.path;

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
      if (!target.currentItem || !editorSupportsOperation(editorProvider, "rename")) throw new Error("Renaming is not supported by this provider");
      await editorProvider.rename!(target.currentItem, target.name);
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
    if (!view || !compartment) return;
    const desc = LanguageDescription.matchFilename(languageData, filePath);
    const support = desc && editorSupportsCodeLanguage(editorProvider, desc.name)
      ? desc.load()
      : Promise.resolve([]);
    support.then((extensions) => {
      if (!cancelled && viewRef.current === view) {
        view.dispatch({ effects: compartment.reconfigure(extensions) });
      }
    }).catch(console.error);
    return () => { cancelled = true; };
  }, [editorProvider, filePath, isMarkdown]);

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

  // The shared Markdown document frame scrolls CodeMirror at auto-height
  // so the title moves away with the content —
  // but that also shrank .cm-editor's own clickable area down to exactly
  // the text's height, leaving the blank space below the last line (most
  // notes don't fill the pane) dead: clicking there used to land inside
  // CodeMirror's own full-height box and just move the cursor to the
  // nearest position (ordinary editor behavior), now it hits nothing.
  // Restores that by focusing and moving the cursor to the end of the
  // document when the shared frame reports a click on blank document space.
  const onScrollContainerClick = () => {
    const view = viewRef.current;
    if (!view) return;
    jumpToPos(view, view.state.doc.length);
  };

  const editorFontStyle = { "--editor-font-size": `${13 * zoom}px` } as CSSProperties;
  const editorActions = dirty || saveError
    ? <span className={`md-pane-save-status${saveError ? " error" : " unsaved"}`} role="status" aria-live="polite" title={saveError ?? undefined}>{editorSavePhaseLabel(saveError ? "error" : "dirty")}</span>
    : null;

  return (
    <div className="obsidian-editor-shell">
      <div className="obsidian-body">
        <div className="obsidian-editor-column">
          <EditorBreadcrumbs path={filePath} onLoadChildren={loadBreadcrumbChildren} onOpenFile={(path, nextKind) => onOpenFileRef.current(path, nextKind)} />
          {!isMarkdown && editorActions && <div className="obsidian-float-actions">{editorActions}</div>}
          {isMarkdown ? (
            // The shared Markdown frame keeps the title in the document
            // scroll; code files below keep their internally scrolling editor.
            <EditorMarkdownEditor
              actions={editorActions}
              outlineItems={showMarkdownOutline ? editorOutlineEntries(outline) : undefined}
              outlineKey={documentCacheKey}
              onOutlineNavigate={(position) => { const view = viewRef.current; if (view) jumpToPos(view, position); }}
              title={<EditorMarkdownTitle path={filePath} title={markdownTitleFor(filePath)} editing={titleEditing} draft={titleDraft} error={titleError} inputRef={titleInputRef} onStartEditing={editorSupportsOperation(editorProvider, "rename") ? enterTitleEdit : undefined} onChange={(value) => { setTitleDraft(value); setTitleError(null); }} onCommit={() => void commitTitleRename()} onCancel={() => { setTitleEditing(false); setTitleError(null); }} />}
              onBackgroundClick={onScrollContainerClick}
              surfaceContainerClassName="md-editor"
              surfaceContainerStyle={editorFontStyle}
              surfaceKey={`${tabId}:${isMarkdown}`}
              surfaceProps={{ documentKey: documentCacheKey, onDocumentKeyChange, viewStateStorage: getEditorViewStateStorage(), session: activeDocumentSession, initialValue: "", parserExtensions: workspaceMarkdownParserExtensions, extensions: editorExtensions, onViewReady, onOutlineChange: setOutline, onActivateLink: (link) => {
                  if (link.kind === "wikilink") {
                    void resolveWikiLinkTarget(editorProvider, link.target).then((path) => onOpenFileRef.current(path, "markdown")).catch(console.error);
                    return true;
                  }
                  const path = resolveEditorRelativeLink(filePath ?? "", link.target);
                  if (!path) return false;
                  const extension = path.split(".").at(-1)?.toLowerCase() ?? "";
                  const kind = ["md", "markdown", "mdown"].includes(extension) ? "markdown"
                    : ["png", "jpg", "jpeg", "gif", "webp", "svg", "pdf", "zip", "7z", "glb", "gltf", "stl", "step", "stp", "epub"].includes(extension) ? "viewer" : "code";
                  onOpenFileRef.current(path, kind);
                  return true;
                }, onSessionError: (error) => setSaveError(error instanceof Error ? error.message : String(error)), className: "md-editor-host", ariaLabel: "Markdown editor" }}
            />
          ) : (
            <div className="md-editor" style={editorFontStyle}>
              <EditorTextSurface key={`${tabId}:${isMarkdown}`} documentKey={documentCacheKey} onDocumentKeyChange={onDocumentKeyChange} viewStateStorage={getEditorViewStateStorage()} session={activeDocumentSession} initialValue="" extensions={editorExtensions} onViewReady={onViewReady} onSessionError={(error) => setSaveError(error instanceof Error ? error.message : String(error))} className="md-editor-host" ariaLabel="Code editor" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
