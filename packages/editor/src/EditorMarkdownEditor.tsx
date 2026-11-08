import { lazy, Suspense, type CSSProperties, type Key, type ReactNode } from "react";
import type { EditorMarkdownDocumentProps } from "./EditorMarkdownDocument";
import type { EditorMarkdownSurfaceProps } from "./EditorMarkdownSurface";
import { EditorMarkdownDocument } from "./EditorMarkdownDocument";

const EditorMarkdownSurface = lazy(() => import("./EditorMarkdownSurface").then((module) => ({ default: module.EditorMarkdownSurface })));

export interface EditorMarkdownEditorProps extends Omit<EditorMarkdownDocumentProps, "children"> {
  surfaceProps: EditorMarkdownSurfaceProps;
  surfaceKey?: Key;
  surfaceContainerClassName?: string;
  surfaceContainerStyle?: CSSProperties;
  loadingFallback?: ReactNode;
}

/** Shared Markdown frame and lazy editor-surface composition for product hosts. */
export function EditorMarkdownEditor({
  surfaceProps,
  surfaceKey,
  surfaceContainerClassName,
  surfaceContainerStyle,
  loadingFallback = <div className="editor-loading">Opening editor…</div>,
  ...documentProps
}: EditorMarkdownEditorProps) {
  const surface = (
    <Suspense fallback={loadingFallback}>
      <EditorMarkdownSurface key={surfaceKey} {...surfaceProps} />
    </Suspense>
  );

  return (
    <EditorMarkdownDocument {...documentProps}>
      {surfaceContainerClassName || surfaceContainerStyle
        ? <div className={surfaceContainerClassName} style={surfaceContainerStyle}>{surface}</div>
        : surface}
    </EditorMarkdownDocument>
  );
}
