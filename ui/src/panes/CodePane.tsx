import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { readFile, writeFile } from "../tauri";
import { workspaceEditorTheme } from "../codemirrorTheme";
import { workspaceSearch } from "../codemirrorSearch";

interface Props {
  filePath: string | null;
  onFileSaved?: (path: string) => void;
}

export function CodePane({ filePath, onFileSaved }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const pathRef = useRef(filePath);

  pathRef.current = filePath;

  useEffect(() => {
    if (!hostRef.current) return;

    const view = new EditorView({
      state: EditorState.create({
        doc: "// Open a file from the tree\n",
        extensions: [
          javascript(),
          history(),
          ...workspaceSearch,
          keymap.of([...defaultKeymap, ...historyKeymap]),
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
        writeFile(path, viewRef.current.state.doc.toString())
          .then(() => onFileSaved?.(path))
          .catch(console.error);
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
      view.destroy();
      viewRef.current = null;
    };
  }, [onFileSaved]);

  useEffect(() => {
    if (!filePath || !viewRef.current) return;
    readFile(filePath)
      .then((content) => {
        viewRef.current?.dispatch({
          changes: {
            from: 0,
            to: viewRef.current.state.doc.length,
            insert: content,
          },
        });
      })
      .catch(console.error);
  }, [filePath]);

  return <div className="code-editor" ref={hostRef} />;
}
