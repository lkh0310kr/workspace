import { EditorContent } from "../EditorContent";
import type { PaneKindDefinition, PaneRenderContext } from "../paneKindRegistry";

function fileTabLabel(item: { filePath?: string | null }): string {
  const path = item.filePath;
  return path ? path.split("/").pop() || path : "New tab";
}

function renderEditor(kind: "code" | "markdown") {
  return function render(ctx: PaneRenderContext) {
    return (
      <EditorContent
        tabId={ctx.workspaceTabId}
        rootPath={ctx.rootPath}
        filePath={ctx.item.filePath ?? null}
        kind={kind}
        zoom={ctx.zoom}
        onOpenFile={(path) => ctx.openOrSwitchToFile(path, "markdown")}
        onAssignPath={(path) => ctx.updateItem({ filePath: path })}
        onDirtyChange={ctx.setDirty}
        treeOpen={ctx.treeOpen}
        onToggleTree={ctx.onToggleTree}
        jumpToLine={ctx.jumpToLine}
        onJumpConsumed={ctx.onJumpConsumed}
      />
    );
  };
}

// "code" has no picker entries — deliberately not directly pickable (a
// brand new tab always starts as "markdown"; findAvailableUntitledName
// only ever creates .md files). It's still a real, renderable kind: a
// TreeView/Quick Open click on an existing non-markdown file produces one.
export const codePaneKind: PaneKindDefinition = {
  kind: "code",
  label: "Code",
  icon: "{}",
  hasFileExplorer: true,
  createItem(id, source) {
    return { id, kind: "code", filePath: source?.filePath ?? null };
  },
  tabLabel: fileTabLabel,
  render: renderEditor("code"),
};

export const markdownPaneKind: PaneKindDefinition = {
  kind: "markdown",
  label: "Editor",
  icon: "{}",
  hasFileExplorer: true,
  pickerEntries: [{ label: "Editor", icon: "{}" }],
  createItem(id, source) {
    return { id, kind: "markdown", filePath: source?.filePath ?? null };
  },
  tabLabel: fileTabLabel,
  render: renderEditor("markdown"),
};
