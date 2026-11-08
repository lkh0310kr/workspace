import { useCallback, useMemo, useRef } from "react";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { createMarkdownEditorExtensions } from "./markdownEditor";
import { markdownLinkNavigation, type EditorMarkdownLink } from "./markdownLinkNavigation";
import { markdownImageResolver, type MarkdownImageResolver } from "./markdownLivePreview";
import { markdownEditorTheme } from "./themes";
import { EditorTextSurface, type EditorTextSurfaceProps } from "./EditorTextSurface";
import { markdownOutlineFromState, type MarkdownHeading } from "./markdownOutline";

export interface EditorMarkdownSurfaceProps extends Omit<EditorTextSurfaceProps, "extensions" | "onViewReady"> {
  /** Product-specific language, link, and interaction extensions. */
  extensions?: readonly Extension[];
  onViewReady?: EditorTextSurfaceProps["onViewReady"];
  onNavigateReady?: (navigate: ((line: number) => void) | null) => void;
  onOutlineChange?: (headings: MarkdownHeading[]) => void;
  onActivateLink?: (link: EditorMarkdownLink) => boolean;
  resolveImage?: MarkdownImageResolver;
}

const baseMarkdownExtensions: readonly Extension[] = [
  ...createMarkdownEditorExtensions(),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  markdownEditorTheme,
];

/** Shared Markdown editing surface; hosts supply provider sessions and product extensions. */
export function EditorMarkdownSurface({
  extensions = baseMarkdownExtensions,
  onViewReady: onViewReadyProp,
  onNavigateReady,
  onOutlineChange,
  onActivateLink,
  resolveImage,
  ...surfaceProps
}: EditorMarkdownSurfaceProps) {
  const onOutlineChangeRef = useRef(onOutlineChange);
  onOutlineChangeRef.current = onOutlineChange;
  const onActivateLinkRef = useRef(onActivateLink);
  onActivateLinkRef.current = onActivateLink;
  const resolveImageRef = useRef(resolveImage);
  resolveImageRef.current = resolveImage;
  const linkNavigation = useMemo(() => markdownLinkNavigation((link) => onActivateLinkRef.current?.(link) ?? false), []);
  const imageResolver = useMemo(() => resolveImage ? markdownImageResolver.of((url) => resolveImageRef.current?.(url) ?? null) : [], []);
  const sharedExtensions = useMemo(() => [
    ...extensions,
    linkNavigation,
    imageResolver,
    EditorView.updateListener.of((update) => {
      if (update.docChanged) onOutlineChangeRef.current?.(markdownOutlineFromState(update.state));
    }),
  ], [extensions, imageResolver, linkNavigation]);
  const onViewReady = useCallback((view: EditorView | null) => {
    onViewReadyProp?.(view);
    if (!view) {
      onNavigateReady?.(null);
      return;
    }
    onOutlineChangeRef.current?.(markdownOutlineFromState(view.state));
    onNavigateReady?.((line) => {
      const position = view.state.doc.line(Math.max(1, Math.min(line, view.state.doc.lines))).from;
      view.dispatch({ selection: { anchor: position }, scrollIntoView: true });
      view.focus();
    });
  }, [onNavigateReady, onViewReadyProp]);

  return <EditorTextSurface {...surfaceProps} extensions={sharedExtensions} onViewReady={onViewReady} />;
}
