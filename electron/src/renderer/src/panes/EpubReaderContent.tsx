// EPUB reader: MIT foliate-js paginator over workspace-epub://. Toolbar,
// click halves, and Foliate/Thorium keys turn CSS-column pages; the last
// page of a spine item loads the next linear section.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  getEbookState,
  openEpub,
  openEpubAbsolute,
  saveEbookState,
} from "../electron";
import { DEFAULT_EBOOK_STATE, type EbookBookState, type EbookTheme } from "../../../shared/ebookState";
import { Popover, type AnchorRect } from "../components/Popover";
import { getCurrentResolvedTheme, subscribeThemeChange, type ResolvedTheme } from "../theme";
import { ebookTurnFromKey, ebookTurnFromPageClick, isTypingTarget } from "./epub/epubKeys";
import { ebookReaderCss, formatEbookTitle, resolveEbookTheme } from "./epub/epubTheme";
import { protocolLoader } from "./epub/epubLoader";
import "../vendor/foliate-js/view.js";
import { EPUB } from "../vendor/foliate-js/epub.js";
import { createTOCView } from "../vendor/foliate-js/ui/tree.js";

type FoliateView = HTMLElement & {
  book: { dir?: string; toc?: unknown; metadata?: { title?: unknown } };
  renderer: {
    setAttribute(name: string, value: string): void;
    setStyles?(styles: string): void;
    getBoundingClientRect?(): DOMRect;
  };
  lastLocation?: {
    fraction?: number;
    location?: { current?: number; total?: number };
    tocItem?: { label?: string; href?: string };
    cfi?: string;
  };
  open(book: unknown): Promise<void>;
  close(): void;
  init(options: { lastLocation?: unknown; showTextStart?: boolean }): Promise<void>;
  goLeft(): Promise<unknown>;
  goRight(): Promise<unknown>;
  goTo(target: unknown): Promise<unknown>;
  goToFraction(fraction: number): Promise<void>;
  search(options: { query: string }): AsyncGenerator<unknown>;
  clearSearch(): void;
};

interface Chrome {
  paneActive?: boolean;
  treeOpen?: boolean;
  onToggleTree?: () => void;
}

type Props =
  | ({ tabId: number; filePath: string; absolutePath?: undefined } & Chrome)
  | ({ tabId?: undefined; filePath?: undefined; absolutePath: string } & Chrome);

interface SearchHit {
  cfi: string;
  label: string;
  excerpt: string;
}

export function EpubReaderContent({
  tabId,
  filePath,
  absolutePath,
  paneActive = true,
  treeOpen = false,
  onToggleTree,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<FoliateView | null>(null);
  // The TOC tree is imperative DOM built once per book (foliate's
  // createTOCView), but its host div unmounts whenever the sidebar is
  // closed — which would discard the tree and leave an empty panel on
  // reopen. Hold the element here and re-append it on every remount.
  const tocTreeRef = useRef<HTMLElement | null>(null);
  const tocHostRef = useRef<HTMLDivElement | null>(null);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPatch = useRef<Partial<EbookBookState>>({});
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("Loading…");
  const [chapter, setChapter] = useState("");
  const [progress, setProgress] = useState(0);
  const [locationLabel, setLocationLabel] = useState("");
  const [sidebar, setSidebar] = useState<"toc" | "search" | "marks" | null>("toc");
  const [prefs, setPrefs] = useState<EbookBookState>(DEFAULT_EBOOK_STATE);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [settingsAnchor, setSettingsAnchor] = useState<AnchorRect | null>(null);
  const [appTheme, setAppTheme] = useState<ResolvedTheme>(getCurrentResolvedTheme);

  useEffect(() => subscribeThemeChange(setAppTheme), []);

  const readerTheme = resolveEbookTheme(prefs.theme, appTheme);

  const attachTocHost = useCallback((node: HTMLDivElement | null) => {
    tocHostRef.current = node;
    if (node && tocTreeRef.current) node.replaceChildren(tocTreeRef.current);
  }, []);

  const flushPersist = useCallback(() => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = null;
    const patch = pendingPatch.current;
    pendingPatch.current = {};
    if (Object.keys(patch).length === 0) return;
    void saveEbookState(tabId ?? null, filePath ?? null, absolutePath, patch);
  }, [absolutePath, filePath, tabId]);

  // Debounced because `relocate` fires on every page turn. Patches
  // accumulate rather than replace: a bookmark added moments before the
  // next turn would otherwise be dropped by that turn's cfi-only patch,
  // since only the final patch is ever sent.
  const persist = useCallback(
    (patch: Partial<EbookBookState>) => {
      setPrefs((current) => ({ ...current, ...patch }));
      pendingPatch.current = { ...pendingPatch.current, ...patch };
      if (persistTimer.current) clearTimeout(persistTimer.current);
      persistTimer.current = setTimeout(flushPersist, 400);
    },
    [flushPersist],
  );

  // Closing the pane within the debounce window must not lose the edit.
  useEffect(() => flushPersist, [flushPersist]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    const view = document.createElement("foliate-view") as FoliateView;
    view.style.display = "block";
    view.style.height = "100%";
    view.style.minHeight = "0";
    host.replaceChildren(view);
    viewRef.current = view;

    const onRelocate = (): void => {
      const location = view.lastLocation;
      if (!location) return;
      setProgress(location.fraction ?? 0);
      setChapter(location.tocItem?.label ?? "");
      const current = location.location?.current;
      const total = location.location?.total;
      setLocationLabel(
        current != null && total != null ? `${current} / ${total}` : `${Math.round((location.fraction ?? 0) * 100)}%`,
      );
      persist({ cfi: location.cfi, fraction: location.fraction });
    };

    const onLoad = (event: Event): void => {
      const doc = (event as CustomEvent).detail?.doc as Document | undefined;
      if (!doc) return;
      doc.addEventListener("keydown", (keydown) => {
        const turn = ebookTurnFromKey(keydown.key, keydown.shiftKey);
        if (!turn) return;
        keydown.preventDefault();
        void (turn === "left" ? view.goLeft() : view.goRight());
      });
      doc.addEventListener("click", (click) => {
        if (click.defaultPrevented || (click.target as Element | null)?.closest?.("a")) return;
        const selection = doc.getSelection();
        if (selection && !selection.isCollapsed) return;
        const frame = doc.defaultView?.frameElement?.getBoundingClientRect();
        const page = view.renderer?.getBoundingClientRect?.();
        if (!frame || !page) return;
        const turn = ebookTurnFromPageClick({
          clientX: click.clientX,
          frameLeft: frame.left,
          pageLeft: page.left,
          pageWidth: page.width,
        });
        if (!turn) return;
        void (turn === "left" ? view.goLeft() : view.goRight());
      });
    };

    view.addEventListener("relocate", onRelocate);
    view.addEventListener("load", onLoad);

    void (async () => {
      try {
        const opened =
          absolutePath !== undefined ? await openEpubAbsolute(absolutePath) : await openEpub(tabId, filePath);
        const stored = await getEbookState(tabId ?? null, filePath ?? null, absolutePath);
        if (cancelled) return;
        setPrefs(stored);
        const book = await new EPUB(protocolLoader(opened.bookId, opened.sizes)).init();
        if (cancelled) return;
        await view.open(book);
        view.renderer.setAttribute("flow", stored.flow);
        view.renderer.setAttribute("max-inline-size", "720px");
        view.renderer.setAttribute("margin", "36px");
        view.renderer.setAttribute("gap", "6%");
        view.renderer.setStyles?.(
          ebookReaderCss({
            // Read live rather than through the appTheme state, so the
            // effect need not re-open the book on every theme flip.
            theme: resolveEbookTheme(stored.theme, getCurrentResolvedTheme()),
            fontScale: stored.fontScale,
            lineHeight: stored.lineHeight,
          }),
        );
        await view.init({ lastLocation: stored.cfi, showTextStart: !stored.cfi });
        if (cancelled) return;
        setTitle(formatEbookTitle(view.book.metadata?.title) || opened.title);
        if (view.book.toc) {
          const toc = createTOCView(view.book.toc, (href) => {
            void view.goTo(href);
          });
          tocTreeRef.current = toc.element;
          tocHostRef.current?.replaceChildren(toc.element);
          view.addEventListener("relocate", () => {
            const href = view.lastLocation?.tocItem?.href;
            if (href) toc.setCurrentHref?.(href);
          });
        }
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "failed to open EPUB");
      }
    })();

    return () => {
      cancelled = true;
      view.removeEventListener("relocate", onRelocate);
      view.removeEventListener("load", onLoad);
      view.close();
      view.remove();
      viewRef.current = null;
      tocTreeRef.current = null;
      tocHostRef.current?.replaceChildren();
    };
  }, [absolutePath, filePath, persist, tabId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!paneActive || isTypingTarget(event.target)) return;
      const turn = ebookTurnFromKey(event.key, event.shiftKey);
      if (!turn || !viewRef.current) return;
      event.preventDefault();
      void (turn === "left" ? viewRef.current.goLeft() : viewRef.current.goRight());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paneActive]);

  // Restyling is driven by the resolved values rather than by the change
  // handler, so an app-level light/dark flip repaints an open book the
  // same way an explicit pick does.
  useEffect(() => {
    viewRef.current?.renderer?.setStyles?.(
      ebookReaderCss({
        theme: readerTheme,
        fontScale: prefs.fontScale,
        lineHeight: prefs.lineHeight,
      }),
    );
  }, [readerTheme, prefs.fontScale, prefs.lineHeight]);

  const applyPrefs = (patch: Partial<EbookBookState>): void => {
    if (patch.flow) viewRef.current?.renderer?.setAttribute("flow", patch.flow);
    persist(patch);
  };

  const currentCfi = prefs.cfi;
  const bookmarkedHere =
    currentCfi != null && prefs.bookmarks.some((mark) => mark.cfi === currentCfi);

  const toggleBookmark = (): void => {
    const cfi = viewRef.current?.lastLocation?.cfi ?? currentCfi;
    if (!cfi) return;
    persist({
      bookmarks: prefs.bookmarks.some((mark) => mark.cfi === cfi)
        ? prefs.bookmarks.filter((mark) => mark.cfi !== cfi)
        : [
            ...prefs.bookmarks,
            { cfi, label: chapter || title, createdAt: new Date().toISOString() },
          ],
    });
  };

  const runSearch = async (): Promise<void> => {
    const view = viewRef.current;
    const needle = query.trim();
    if (!view || !needle) {
      view?.clearSearch();
      setHits([]);
      return;
    }
    setSearching(true);
    setSidebar("search");
    const nextHits: SearchHit[] = [];
    try {
      for await (const result of view.search({ query: needle })) {
        if (result === "done") break;
        if (result && typeof result === "object" && "subitems" in result) {
          const group = result as {
            label?: string;
            subitems?: { cfi: string; excerpt?: { pre?: string; match?: string; post?: string } }[];
          };
          for (const item of group.subitems ?? []) {
            nextHits.push({
              cfi: item.cfi,
              label: group.label || "Match",
              excerpt: `${item.excerpt?.pre ?? ""}${item.excerpt?.match ?? ""}${item.excerpt?.post ?? ""}`,
            });
          }
        }
      }
      setHits(nextHits);
    } finally {
      setSearching(false);
    }
  };

  if (error) {
    return <div className="file-viewer-empty">{error}</div>;
  }

  return (
    <div className={`epub-reader theme-${readerTheme}`}>
      <div className="obsidian-float-actions">
        <button
          type="button"
          className={`obsidian-topbar-icon${settingsAnchor ? " active" : ""}`}
          title="Reader settings"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            setSettingsAnchor((current) => (current ? null : rect));
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
            <path
              fill="currentColor"
              d="M8 4.75a3.25 3.25 0 1 0 0 6.5 3.25 3.25 0 0 0 0-6.5ZM3.2 8a4.8 4.8 0 0 1 .08-.86l-1.5-.87a.75.75 0 0 1-.28-1.02l1.3-2.25a.75.75 0 0 1 1.02-.28l1.5.87a4.9 4.9 0 0 1 1.48-.86V1.75a.75.75 0 0 1 .75-.75h2.6a.75.75 0 0 1 .75.75v1.38c.53.2 1.02.5 1.48.86l1.5-.87a.75.75 0 0 1 1.02.28l1.3 2.25a.75.75 0 0 1-.28 1.02l-1.5.87c.05.28.08.56.08.86s-.03.58-.08.86l1.5.87a.75.75 0 0 1 .28 1.02l-1.3 2.25a.75.75 0 0 1-1.02.28l-1.5-.87a4.9 4.9 0 0 1-1.48.86v1.38a.75.75 0 0 1-.75.75H9.35a.75.75 0 0 1-.75-.75v-1.38a4.9 4.9 0 0 1-1.48-.86l-1.5.87a.75.75 0 0 1-1.02-.28l-1.3-2.25a.75.75 0 0 1 .28-1.02l1.5-.87A4.8 4.8 0 0 1 3.2 8Z"
            />
          </svg>
        </button>
        {onToggleTree ? (
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
        ) : null}
      </div>
      <div className="epub-reader-toolbar">
        <button type="button" className="obsidian-topbar-icon" title="Previous page" onClick={() => void viewRef.current?.goLeft()}>
          ‹
        </button>
        <button
          type="button"
          className={`obsidian-topbar-icon${sidebar === "toc" ? " active" : ""}`}
          title="Contents"
          onClick={() => setSidebar((value) => (value === "toc" ? null : "toc"))}
        >
          ≡
        </button>
        <button
          type="button"
          className={`obsidian-topbar-icon${sidebar === "search" ? " active" : ""}`}
          title="Search in book"
          onClick={() => setSidebar((value) => (value === "search" ? null : "search"))}
        >
          ⌕
        </button>
        <button
          type="button"
          className={`obsidian-topbar-icon${sidebar === "marks" ? " active" : ""}`}
          title={`Bookmarks (${prefs.bookmarks.length})`}
          onClick={() => setSidebar((value) => (value === "marks" ? null : "marks"))}
        >
          {bookmarkedHere ? "★" : "☆"}
        </button>
        <span className="epub-reader-title" title={title}>
          {title}
          {chapter ? ` · ${chapter}` : ""}
        </span>
        <span className="epub-reader-progress">{locationLabel}</span>
        <button type="button" className="obsidian-topbar-icon" title="Next page" onClick={() => void viewRef.current?.goRight()}>
          ›
        </button>
      </div>
      <div className="epub-reader-body">
        {sidebar ? (
          <aside className="epub-reader-sidebar">
            {sidebar === "toc" ? <div ref={attachTocHost} className="epub-reader-toc" /> : null}
            {sidebar === "search" ? (
              <div className="epub-reader-hits">
                <input
                  className="epub-reader-search"
                  value={query}
                  placeholder="Search in book"
                  autoFocus
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void runSearch();
                  }}
                />
                {searching ? <p>Searching…</p> : null}
                {hits.map((hit) => (
                  <button
                    key={hit.cfi}
                    type="button"
                    onClick={() => void viewRef.current?.goTo(hit.cfi)}
                  >
                    <strong>{hit.label}</strong>
                    <span>{hit.excerpt}</span>
                  </button>
                ))}
              </div>
            ) : null}
            {sidebar === "marks" ? (
              <div className="epub-reader-hits">
                <button
                  type="button"
                  className="epub-reader-mark-toggle"
                  onClick={toggleBookmark}
                >
                  {bookmarkedHere ? "★ Remove this page" : "☆ Bookmark this page"}
                </button>
                {prefs.bookmarks.length === 0 ? (
                  <p className="epub-reader-empty">No bookmarks yet.</p>
                ) : null}
                {prefs.bookmarks.map((mark) => (
                  <div
                    key={mark.cfi}
                    className={`epub-reader-mark${mark.cfi === currentCfi ? " current" : ""}`}
                  >
                    <button type="button" onClick={() => void viewRef.current?.goTo(mark.cfi)}>
                      <strong>{mark.label}</strong>
                      <span>{new Date(mark.createdAt).toLocaleDateString()}</span>
                    </button>
                    <button
                      type="button"
                      className="epub-reader-mark-remove"
                      title="Remove bookmark"
                      onClick={() =>
                        persist({
                          bookmarks: prefs.bookmarks.filter((entry) => entry.cfi !== mark.cfi),
                        })
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </aside>
        ) : null}
        <div ref={hostRef} className="epub-reader-view" />
      </div>
      {settingsAnchor ? (
        <Popover
          anchorRect={settingsAnchor}
          onClose={() => setSettingsAnchor(null)}
          align="end"
          className="epub-reader-settings"
        >
          <label>
            <span>Theme</span>
            <select
              value={prefs.theme}
              onChange={(event) => applyPrefs({ theme: event.target.value as EbookTheme })}
            >
              <option value="auto">Match app</option>
              <option value="light">Light</option>
              <option value="sepia">Sepia</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <label>
            <span>Layout</span>
            <select
              value={prefs.flow}
              onChange={(event) => applyPrefs({ flow: event.target.value as EbookBookState["flow"] })}
            >
              <option value="paginated">Pages</option>
              <option value="scrolled">Scroll</option>
            </select>
          </label>
          <label>
            <span>Text size</span>
            <input
              type="range"
              min={0.8}
              max={1.6}
              step={0.1}
              value={prefs.fontScale}
              onChange={(event) => applyPrefs({ fontScale: Number(event.target.value) })}
            />
            <em>{Math.round(prefs.fontScale * 100)}%</em>
          </label>
          <label>
            <span>Line height</span>
            <input
              type="range"
              min={1.2}
              max={2}
              step={0.1}
              value={prefs.lineHeight}
              onChange={(event) => applyPrefs({ lineHeight: Number(event.target.value) })}
            />
            <em>{prefs.lineHeight.toFixed(1)}</em>
          </label>
        </Popover>
      ) : null}
      <input
        className="epub-reader-slider"
        type="range"
        min={0}
        max={1}
        step={0.001}
        value={progress}
        onChange={(event) => {
          const fraction = Number(event.target.value);
          setProgress(fraction);
          void viewRef.current?.goToFraction(fraction);
        }}
      />
    </div>
  );
}
