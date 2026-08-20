import { useEffect, useRef, useState } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { listDir, readFile, writeFile } from "../tauri";
import { columnGuideTheme, workspaceEditorTheme } from "../codemirrorTheme";
import { workspaceSearch } from "../codemirrorSearch";
import { markdownLivePreview } from "../markdownLivePreview";
import { wikiLinkExtension } from "../markdownWikilink";
import { TreeView } from "../components/TreeView";

interface Props {
  filePath: string | null;
  tabId: number;
}

async function findAvailableUntitledName(tabId: number): Promise<string> {
  const entries = await listDir(tabId, "").catch(() => []);
  const names = new Set(entries.filter((e) => !e.is_dir).map((e) => e.name));
  if (!names.has("untitled.md")) return "untitled.md";
  let i = 1;
  while (names.has(`untitled ${i}.md`)) i++;
  return `untitled ${i}.md`;
}

export function MarkdownPane({ filePath, tabId }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const pathRef = useRef(filePath);
  const [currentPath, setCurrentPath] = useState(filePath);
  const [treeOpen, setTreeOpen] = useState(filePath === null);
  const [creating, setCreating] = useState(false);

  pathRef.current = currentPath;

  useEffect(() => {
    setCurrentPath(filePath);
  }, [filePath]);

  // The editor itself only exists once a file is open — no CM instance
  // (and so no hardcoded placeholder doc) is mounted for an empty pane;
  // the "New File" prompt renders in its place instead. Keyed on whether
  // a path exists (not on the path's value) so switching between two
  // already-open files doesn't tear the view down, only reloads content
  // via the effect below.
  const hasPath = currentPath !== null;
  useEffect(() => {
    if (!hasPath || !hostRef.current) return;

    const view = new EditorView({
      state: EditorState.create({
        doc: "",
        extensions: [
          // `markdown()`'s default base is strict CommonMark, which
          // doesn't parse strikethrough/task-lists/tables at all —
          // `markdownLanguage` is CodeMirror's GFM-flavored base.
          markdown({ base: markdownLanguage, extensions: [wikiLinkExtension] }),
          ...markdownLivePreview,
          ...workspaceSearch,
          history(),
          keymap.of([indentWithTab, ...historyKeymap]),
          EditorView.lineWrapping,
          workspaceEditorTheme,
          columnGuideTheme,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on hasPath, not currentPath (see comment above)
  }, [tabId, hasPath]);

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

  const createNewFile = async () => {
    setCreating(true);
    try {
      const name = await findAvailableUntitledName(tabId);
      await writeFile(tabId, name, "");
      setCurrentPath(name);
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

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
        {hasPath ? (
          <div className="md-editor" ref={hostRef} />
        ) : (
          <div className="md-empty-state">
            <button type="button" onClick={createNewFile} disabled={creating}>
              {creating ? "Creating…" : "New File"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
