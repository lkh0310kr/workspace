import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { readFile, writeFile } from "../tauri";
import { workspaceEditorTheme } from "../codemirrorTheme";
import { workspaceSearch } from "../codemirrorSearch";
import { markdownLivePreview } from "../markdownLivePreview";

interface Props {
  filePath: string | null;
}

export function MarkdownPane({ filePath }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const pathRef = useRef(filePath);

  pathRef.current = filePath;

  useEffect(() => {
    if (!hostRef.current) return;

    const view = new EditorView({
      state: EditorState.create({
        doc: "# Markdown\n\nEdit here — live preview.\n",
        extensions: [
          markdown(),
          markdownLivePreview,
          ...workspaceSearch,
          EditorView.lineWrapping,
          workspaceEditorTheme,
        ],
      }),
      parent: hostRef.current,
    });
    viewRef.current = view;

    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        const path = pathRef.current;
        if (!path || !viewRef.current) return;
        writeFile(path, viewRef.current.state.doc.toString()).catch(console.error);
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!filePath || !viewRef.current) return;
    readFile(filePath)
      .then((content) => {
        viewRef.current?.dispatch({
          changes: { from: 0, to: viewRef.current.state.doc.length, insert: content },
        });
      })
      .catch(console.error);
  }, [filePath]);

  return <div className="md-editor" ref={hostRef} />;
}
