import { useCallback } from "react";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { createMarkdownEditorExtensions } from "./markdownEditor";
import { markdownEditorTheme } from "./themes";
import { EditorTextSurface, type EditorTextSurfaceProps } from "./EditorTextSurface";

export interface EditorMarkdownSurfaceProps extends Omit<EditorTextSurfaceProps, "extensions" | "onViewReady"> {
  /** Product-specific language, link, and interaction extensions. */
  extensions?: readonly Extension[];
  onViewReady?: EditorTextSurfaceProps["onViewReady"];
  onNavigateReady?: (navigate: ((line: number) => void) | null) => void;
}

const baseMarkdownExtensions: readonly Extension[] = [
  ...createMarkdownEditorExtensions(),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  markdownEditorTheme,
];

/** Shared Markdown and code editing surface; hosts supply provider sessions and product extensions. */
export function EditorMarkdownSurface({
  extensions = baseMarkdownExtensions,
  onViewReady: onViewReadyProp,
  onNavigateReady,
  ...surfaceProps
}: EditorMarkdownSurfaceProps) {
  const onViewReady = useCallback((view: EditorView | null) => {
    onViewReadyProp?.(view);
    if (!view) {
      onNavigateReady?.(null);
      return;
    }
    onNavigateReady?.((line) => {
      const position = view.state.doc.line(Math.max(1, Math.min(line, view.state.doc.lines))).from;
      view.dispatch({ selection: { anchor: position }, scrollIntoView: true });
      view.focus();
    });
  }, [onNavigateReady, onViewReadyProp]);

  return <EditorTextSurface {...surfaceProps} extensions={extensions} onViewReady={onViewReady} />;
}
