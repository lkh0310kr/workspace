import { useCallback, useEffect, useRef } from "react";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import {
  EditorTextSurface,
  createMarkdownEditorExtensions,
  markdownEditorTheme,
} from "@workspace/editor";

export function MarkdownCodeEditor({
  value,
  onChange,
  documentKey,
  onNavigateReady,
}: {
  value: string;
  onChange: (value: string) => void;
  documentKey: string;
  onNavigateReady?: (navigate: ((line: number) => void) | null) => void;
}) {
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
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
    value={value}
    documentKey={documentKey}
    extensions={markdownSurfaceExtensions}
    onChange={(next) => onChangeRef.current(next)}
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
