import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { listAllFiles } from "../electron";
import { fuzzyFilter } from "../quickOpenFuzzy";
import { classifyFile } from "./TreeView";

// Cmd+P fuzzy file switcher — a centered modal, not anchor-rect-based like
// Popover.tsx (nothing to anchor to; it's summoned from anywhere).
interface Props {
  tabId: number;
  onOpenFile: (path: string, kind: "code" | "markdown" | "viewer" | "vector") => void;
  onClose: () => void;
}

export function QuickOpen({ tabId, onOpenFile, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    listAllFiles(tabId).then(setFiles).catch(console.error);
  }, [tabId]);

  const filtered = useMemo(() => fuzzyFilter(files, query, (f) => f, 100), [files, query]);

  // React's documented "adjusting state without an Effect" pattern for
  // resetting derived state when an input changes — a setState call here
  // bails out and re-renders synchronously before the browser paints,
  // instead of the extra committed render + cascading update an effect
  // doing the same reset would cause.
  const [prevFiltered, setPrevFiltered] = useState(filtered);
  if (filtered !== prevFiltered) {
    setPrevFiltered(filtered);
    setSelectedIndex(0);
  }

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${selectedIndex}"]`)?.scrollIntoView({
      block: "nearest",
    });
  }, [selectedIndex]);

  const openSelected = (path: string): void => {
    onOpenFile(path, classifyFile(path));
    onClose();
  };

  return createPortal(
    <div className="quick-open-backdrop" onClick={onClose}>
      <div className="quick-open-modal" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="quick-open-input"
          placeholder="Go to file…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSelectedIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              const path = filtered[selectedIndex];
              if (path) openSelected(path);
            }
          }}
        />
        <div className="quick-open-results" ref={listRef}>
          {filtered.length === 0 ? (
            <div className="quick-open-empty">No matching files</div>
          ) : (
            filtered.map((path, i) => (
              <div
                key={path}
                data-index={i}
                className={`quick-open-row${i === selectedIndex ? " active" : ""}`}
                onMouseEnter={() => setSelectedIndex(i)}
                onClick={() => openSelected(path)}
              >
                {path}
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
