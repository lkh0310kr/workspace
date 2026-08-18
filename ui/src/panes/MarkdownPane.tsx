import { useEffect, useMemo, useRef, useState } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { marked } from "marked";
import { readFile, writeFile } from "../tauri";
import { workspaceEditorTheme } from "../codemirrorTheme";

interface Props {
  filePath: string | null;
}

export function MarkdownPane({ filePath }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [markdownText, setMarkdownText] = useState("# Markdown\n\nEdit here, preview on the right.\n");

  const previewHtml = useMemo(() => marked.parse(markdownText) as string, [markdownText]);

  useEffect(() => {
    if (!hostRef.current) return;

    const view = new EditorView({
      state: EditorState.create({
        doc: markdownText,
        extensions: [
          markdown(),
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              setMarkdownText(update.state.doc.toString());
            }
          }),
          workspaceEditorTheme,
        ],
      }),
      parent: hostRef.current,
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!filePath || !viewRef.current) return;
    readFile(filePath)
      .then((content) => {
        setMarkdownText(content);
        viewRef.current?.dispatch({
          changes: { from: 0, to: viewRef.current.state.doc.length, insert: content },
        });
      })
      .catch(console.error);
  }, [filePath]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s" && filePath && viewRef.current) {
        e.preventDefault();
        writeFile(filePath, viewRef.current.state.doc.toString()).catch(console.error);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filePath]);

  return (
    <div className="md-split">
      <div className="code-editor" ref={hostRef} />
      <div className="md-preview" dangerouslySetInnerHTML={{ __html: previewHtml }} />
    </div>
  );
}
