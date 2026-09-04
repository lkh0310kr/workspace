import { useEffect, type RefObject } from "react";
import type { DirEntry } from "../fileSystem";

export interface ExplorerKeyboardHandlers {
  onDelete: () => void;
  onRename: () => void;
  onEnter: (entry: DirEntry) => void;
  onMoveSelection: (delta: number) => void;
  onCollapse: () => void;
  onExpand: () => void;
  getFocusedEntry: () => DirEntry | null;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

/** VS Code-style explorer keys when the tree (or its pane host) has focus. */
export function useExplorerKeyboard(
  hostRef: RefObject<HTMLElement | null>,
  treeRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  handlers: ExplorerKeyboardHandlers,
): void {
  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(e: KeyboardEvent): void {
      if (isTypingTarget(e.target)) return;
      const host = hostRef.current;
      const tree = treeRef.current;
      if (!host?.contains(document.activeElement) && document.activeElement !== tree) return;
      if (!tree) return;

      const entry = handlers.getFocusedEntry();
      if (!entry && e.key !== "ArrowUp" && e.key !== "ArrowDown") return;

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        handlers.onDelete();
        return;
      }
      if (e.key === "F2") {
        e.preventDefault();
        handlers.onRename();
        return;
      }
      if (e.key === "Enter" && entry) {
        e.preventDefault();
        handlers.onEnter(entry);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        handlers.onMoveSelection(-1);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        handlers.onMoveSelection(1);
        return;
      }
      if (e.key === "ArrowLeft" && entry?.is_dir) {
        e.preventDefault();
        handlers.onCollapse();
        return;
      }
      if (e.key === "ArrowRight" && entry?.is_dir) {
        e.preventDefault();
        handlers.onExpand();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, hostRef, treeRef, handlers]);
}
