import { useCallback, useEffect, useMemo, useRef } from "react";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { EditorView } from "@codemirror/view";
import { Compartment, type Extension } from "@codemirror/state";
import type { MarkdownConfig } from "@lezer/markdown";
import { createMarkdownEditorExtensions } from "./markdownEditor";
import { markdownLinkNavigation, type EditorMarkdownLink } from "./markdownLinkNavigation";
import { markdownDocumentPath, markdownImageResolver, type MarkdownImageResolver } from "./markdownLivePreview";
import { markdownEditorTheme, markdownProseTheme } from "./themes";
import { EditorTextSurface, type EditorTextSurfaceProps } from "./EditorTextSurface";

const emptyExtensions: readonly Extension[] = [];

// CodeMirror's default theme is light-only and underlines headings and links.
// Markdown visuals are owned by the shared product CSS and semantic tokens.
const markdownSyntaxHighlight = HighlightStyle.define([
  { tag: tags.heading, textDecoration: "none" },
  { tag: tags.meta, color: "inherit" },
  { tag: tags.link, color: "inherit", textDecoration: "none" },
  { tag: [tags.keyword, tags.modifier, tags.controlKeyword, tags.operatorKeyword], color: "var(--syntax-keyword, var(--accent, #8d63b5))" },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], color: "var(--syntax-string, color-mix(in srgb, var(--text) 68%, #16824b))" },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: "var(--syntax-comment, var(--text-muted, var(--muted)))", fontStyle: "italic" },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], color: "var(--syntax-number, color-mix(in srgb, var(--text) 68%, #c17d16))" },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: "var(--syntax-function, var(--accent, #9a6d22))" },
  { tag: [tags.typeName, tags.className, tags.namespace], color: "var(--syntax-type, var(--link, #397f91))" },
  { tag: tags.propertyName, color: "var(--syntax-property, color-mix(in srgb, var(--text) 68%, #2874c7))" },
  { tag: [tags.definition(tags.variableName), tags.variableName], color: "var(--text)" },
  { tag: [tags.operator, tags.punctuation, tags.bracket], color: "var(--text-muted)" },
  { tag: tags.tagName, color: "var(--syntax-keyword, var(--accent, #8d63b5))" },
  { tag: tags.attributeName, color: "var(--syntax-function, var(--accent, #9a6d22))" },
  { tag: tags.invalid, color: "var(--syntax-invalid, var(--danger, #cf5555))" },
]);

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
  /** Provider-relative path of this document, used to resolve relative images. */
  documentPath?: string;
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
  documentPath,
  ...surfaceProps
}: EditorMarkdownSurfaceProps) {
  const baseExtensions = useMemo<readonly Extension[]>(() => [
    ...createMarkdownEditorExtensions({ parserExtensions }),
    syntaxHighlighting(markdownSyntaxHighlight, { fallback: true }),
    markdownEditorTheme,
    markdownProseTheme,
  ], [parserExtensions]);
  const documentPathCompartment = useMemo(() => new Compartment(), []);
  const viewRef = useRef<EditorView | null>(null);
  const onActivateLinkRef = useRef(onActivateLink);
  onActivateLinkRef.current = onActivateLink;
  const resolveImageRef = useRef(resolveImage);
  resolveImageRef.current = resolveImage;
  const linkNavigation = useMemo(() => markdownLinkNavigation((link) => onActivateLinkRef.current?.(link) ?? false), []);
  const imageResolver = useMemo(
    () => markdownImageResolver.of((url) => resolveImageRef.current?.(url) ?? null),
    [],
  );
  useEffect(() => {
    viewRef.current?.dispatch({ effects: documentPathCompartment.reconfigure(markdownDocumentPath.of(documentPath ?? "")) });
  }, [documentPath, documentPathCompartment]);
  const sharedExtensions = useMemo(() => [
    ...baseExtensions,
    documentPathCompartment.of(markdownDocumentPath.of(documentPath ?? "")),
    ...extensions,
    linkNavigation,
    imageResolver,
  ], [baseExtensions, documentPath, documentPathCompartment, extensions, imageResolver, linkNavigation]);
  const onViewReady = useCallback((view: EditorView | null) => {
    viewRef.current = view;
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
