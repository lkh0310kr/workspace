import { useEffect, useRef, useState } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { readFile, writeFile } from "../tauri";
import { workspaceEditorTheme } from "../codemirrorTheme";
import { workspaceSearch } from "../codemirrorSearch";
import { markdownLivePreview } from "../markdownLivePreview";
import { wikiLinkExtension } from "../markdownWikilink";
import { TreeView } from "../components/TreeView";

interface Props {
  filePath: string | null;
  tabId: number;
}

export function MarkdownPane({ filePath, tabId }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const pathRef = useRef(filePath);
  const [currentPath, setCurrentPath] = useState(filePath);
  const [treeOpen, setTreeOpen] = useState(false);

  pathRef.current = currentPath;

  useEffect(() => {
    setCurrentPath(filePath);
  }, [filePath]);

  useEffect(() => {
    if (!hostRef.current) return;

    const view = new EditorView({
      state: EditorState.create({
        doc: "# Markdown\n\nEdit here — live preview.\n",
        extensions: [
          // `markdown()`'s default base is strict CommonMark, which
          // doesn't parse strikethrough/task-lists/tables at all —
          // `markdownLanguage` is CodeMirror's GFM-flavored base.
          markdown({ base: markdownLanguage, extensions: [wikiLinkExtension] }),
          ...markdownLivePreview,
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
        writeFile(tabId, path, viewRef.current.state.doc.toString()).catch(console.error);
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
      view.destroy();
      viewRef.current = null;
    };
  }, [tabId]);

  useEffect(() => {
    if (!currentPath || !viewRef.current) return;
    readFile(tabId, currentPath)
      .then((content) => {
        viewRef.current?.dispatch({
          changes: { from: 0, to: viewRef.current.state.doc.length, insert: content },
        });
      })
      .catch(console.error);
  }, [currentPath, tabId]);

  return (
    <div className="md-pane">
      {treeOpen && (
        <div className="md-pane-sidebar">
          <TreeView tabId={tabId} onOpenFile={(path) => setCurrentPath(path)} />
        </div>
      )}
      <div className="md-pane-body">
        <div className="md-pane-toolbar">
          <button
            type="button"
            className={`md-pane-tree-toggle${treeOpen ? " active" : ""}`}
            title="Toggle file explorer"
            onClick={() => setTreeOpen((v) => !v)}
          >
            📁
          </button>
        </div>
        <div className="md-editor" ref={hostRef} />
      </div>
    </div>
  );
}
