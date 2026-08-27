import { useEffect, useState } from "react";
import { epubResourceUrl, openEpub, type EpubBook } from "../electron";

// Minimal v1 EPUB reader (confirmed scope): unzip, walk the OPF spine in
// order, one chapter per iframe with prev/next — no bookmarks, no
// pagination, no TOC panel. Reuses the "viewer" TabKind (FileViewerContent
// dispatches here the same way it already dispatches to video/audio/pdf
// by extension).
interface Props {
  tabId: number;
  filePath: string;
}

export function EpubReaderContent({ tabId, filePath }: Props) {
  const [book, setBook] = useState<EpubBook | null>(null);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBook(null);
    setChapterIndex(0);
    setError(null);
    let cancelled = false;
    openEpub(tabId, filePath)
      .then((result) => {
        if (!cancelled) setBook(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "failed to open EPUB");
      });
    return () => {
      cancelled = true;
    };
  }, [tabId, filePath]);

  if (error) {
    return <div className="file-viewer-empty">{error}</div>;
  }
  if (!book) {
    return <div className="file-viewer-empty">Loading…</div>;
  }

  const chapter = book.spine[chapterIndex];

  return (
    <div className="epub-reader">
      <div className="epub-reader-toolbar">
        <button
          type="button"
          className="obsidian-topbar-icon"
          title="Previous chapter"
          disabled={chapterIndex === 0}
          onClick={() => setChapterIndex((i) => Math.max(0, i - 1))}
        >
          ‹
        </button>
        <span className="epub-reader-title" title={book.title}>
          {book.title}
        </span>
        <span className="epub-reader-progress">
          {chapterIndex + 1} / {book.spine.length}
        </span>
        <button
          type="button"
          className="obsidian-topbar-icon"
          title="Next chapter"
          disabled={chapterIndex >= book.spine.length - 1}
          onClick={() => setChapterIndex((i) => Math.min(book.spine.length - 1, i + 1))}
        >
          ›
        </button>
      </div>
      {/* Why sandbox="allow-same-origin" with no allow-scripts: EPUB
          chapter XHTML is untrusted content that could contain <script> —
          the sandbox strips script execution while still letting the
          document load its own same-origin (workspace-epub://<bookId>/...)
          images/CSS via relative URLs. */}
      <iframe
        key={chapter.href}
        className="epub-reader-frame"
        src={epubResourceUrl(book.bookId, chapter.href)}
        sandbox="allow-same-origin"
        title={book.title}
      />
    </div>
  );
}
