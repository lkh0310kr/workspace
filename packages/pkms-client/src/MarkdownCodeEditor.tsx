import { useCallback, useEffect, useRef } from "react";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import {
  EditorTextSurface,
  createMarkdownEditorExtensions,
  markdownEditorTheme,
  type EditorDocumentSession,
} from "@workspace/editor";

export function MarkdownCodeEditor({
  documentKey,
  session,
  onNavigateReady,
  onSessionError,
}: {
  documentKey: string;
  session: EditorDocumentSession | null;
  onNavigateReady?: (navigate: ((line: number) => void) | null) => void;
  onSessionError?: (error: unknown) => void;
}) {
  const view = useRef<EditorView | null>(null);
  const onViewReady = useCallback((editor: EditorView | null) => { view.current = editor; }, []);

  useEffect(() => {
    if (!view.current || !onNavigateReady) return;
    const navigate = (line: number) => {
      const editor = view.current;
      if (!editor) return;
      const position = editor.state.doc.line(Math.max(1, Math.min(line, editor.state.doc.lines))).from;
      editor.dispatch({ selection: { anchor: position }, scrollIntoView: true });
      editor.focus();
    };
    onNavigateReady(navigate);
    return () => onNavigateReady(null);
  }, [onNavigateReady]);

  return <EditorTextSurface
    session={session}
    documentKey={documentKey}
    extensions={markdownSurfaceExtensions}
    onSessionError={onSessionError}
    onViewReady={onViewReady}
    className="markdown-code-editor"
    ariaLabel="Markdown editor"
    autocapitalize="sentences"
    spellcheck
  />;
}

const markdownSurfaceExtensions = [
  ...createMarkdownEditorExtensions(),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  markdownEditorTheme,
];
