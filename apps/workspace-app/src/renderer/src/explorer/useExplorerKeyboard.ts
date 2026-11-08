import { useEffect, type RefObject } from "react";
import type { DirEntry } from "../fileSystem";
import { resolveEditorTreeArrowKey, type EditorTreeArrowAction, type EditorTreeNavigationRow } from "@workspace/editor";

export interface ExplorerKeyboardHandlers {
  onDelete: () => void;
  onRename: () => void;
  onEnter: (entry: DirEntry) => void;
  getFocusedEntry: () => DirEntry | null;
  getVisibleRows: () => readonly EditorTreeNavigationRow[];
  getExpandedPaths: () => ReadonlySet<string>;
  onArrowAction: (action: EditorTreeArrowAction, extendSelection: boolean) => void;
}

function isTypingTarget(event: KeyboardEvent): boolean {
  return event.composedPath().some((target) => {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
  });
}

function isOutsideTreeShadowRoot(event: KeyboardEvent, tree: HTMLElement | null): boolean {
  const origin = event.composedPath()[0];
  if (!(origin instanceof Node)) return false;
  const root = origin.getRootNode();
  return root instanceof ShadowRoot && !tree?.contains(origin);
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
      const host = hostRef.current;
      const tree = treeRef.current;
      // Events from embedded panes (such as PKMS) are retargeted to their host
      // outside Shadow DOM. Do not treat them as explorer navigation keys.
      if (isTypingTarget(e) || isOutsideTreeShadowRoot(e, tree)) return;
      if (!host?.contains(document.activeElement) && document.activeElement !== tree) return;
      if (!tree) return;

      const entry = handlers.getFocusedEntry();
      if (!entry && e.key !== "ArrowUp" && e.key !== "ArrowDown") return;

      if (e.key.startsWith("Arrow")) {
        const action = resolveEditorTreeArrowKey(handlers.getVisibleRows(), entry?.path ?? null, handlers.getExpandedPaths(), e.key);
        if (action) {
          e.preventDefault();
          handlers.onArrowAction(action, e.shiftKey);
        }
        return;
      }

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
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, hostRef, treeRef, handlers]);
}
