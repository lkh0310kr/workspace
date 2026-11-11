import { useCallback, useMemo, useRef } from "react";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import type { MarkdownConfig } from "@lezer/markdown";
import { createMarkdownEditorExtensions } from "./markdownEditor";
import { markdownLinkNavigation, type EditorMarkdownLink } from "./markdownLinkNavigation";
import { markdownImageResolver, type MarkdownImageResolver } from "./markdownLivePreview";
import { markdownEditorTheme, markdownProseTheme } from "./themes";
import { EditorTextSurface, type EditorTextSurfaceProps } from "./EditorTextSurface";

const emptyExtensions: readonly Extension[] = [];

export interface EditorMarkdownSurfaceProps extends Omit<EditorTextSurfaceProps, "extensions" | "onViewReady"> {
  /** Product-specific syntax additions to the shared Markdown parser. */
  parserExtensions?: readonly MarkdownConfig[];
  /** Product-specific link, styling, and interaction extensions. */
  extensions?: readonly Extension[];
  onViewReady?: EditorTextSurfaceProps["onViewReady"];
  onNavigateReady?: (navigate: ((position: number) => void) | null) => void;
  onSearchPanelChange?: EditorTextSurfaceProps["onSearchPanelChange"];
  onActivateLink?: (link: EditorMarkdownLink) => boolean;
  resolveImage?: MarkdownImageResolver;
}

/** Shared Markdown editing surface; hosts supply provider sessions and product extensions. */
export function EditorMarkdownSurface({
  parserExtensions,
  extensions = emptyExtensions,
  onViewReady: onViewReadyProp,
  onNavigateReady,
  onSearchPanelChange,
  onActivateLink,
  resolveImage,
  ...surfaceProps
}: EditorMarkdownSurfaceProps) {
  const baseExtensions = useMemo<readonly Extension[]>(() => [
    ...createMarkdownEditorExtensions({ parserExtensions }),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    markdownEditorTheme,
    markdownProseTheme,
  ], [parserExtensions]);
  const onActivateLinkRef = useRef(onActivateLink);
  onActivateLinkRef.current = onActivateLink;
  const resolveImageRef = useRef(resolveImage);
  resolveImageRef.current = resolveImage;
  const linkNavigation = useMemo(() => markdownLinkNavigation((link) => onActivateLinkRef.current?.(link) ?? false), []);
  const imageResolver = useMemo(
    () => markdownImageResolver.of((url) => resolveImageRef.current?.(url) ?? null),
    [],
  );
  const sharedExtensions = useMemo(() => [
    ...baseExtensions,
    ...extensions,
    linkNavigation,
    imageResolver,
  ], [baseExtensions, extensions, imageResolver, linkNavigation]);
  const onViewReady = useCallback((view: EditorView | null) => {
    onViewReadyProp?.(view);
    if (!view) {
      onNavigateReady?.(null);
      return;
    }
    onNavigateReady?.((position) => {
      const target = Math.max(0, Math.min(position, view.state.doc.length));
      view.dispatch({ selection: { anchor: target }, scrollIntoView: true });
      view.focus();
    });
  }, [onNavigateReady, onViewReadyProp]);

  const { className, ...textSurfaceProps } = surfaceProps;
  return <EditorTextSurface {...textSurfaceProps} className={["editor-markdown-surface", className].filter(Boolean).join(" ")} extensions={sharedExtensions} onViewReady={onViewReady} onSearchPanelChange={onSearchPanelChange} />;
}
