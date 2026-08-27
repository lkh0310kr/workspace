import { VectorEditorContent } from "../VectorEditorContent";
import type { PaneKindDefinition } from "../paneKindRegistry";

export const vectorPaneKind: PaneKindDefinition = {
  kind: "vector",
  label: "Vector",
  icon: "◆",
  hasFileExplorer: true,
  pickerEntries: [{ label: "Vector", icon: "◆" }],
  createItem(id, source) {
    return { id, kind: "vector", filePath: source?.filePath ?? null };
  },
  tabLabel(item) {
    const path = item.filePath;
    return path ? path.split("/").pop() || path : "New tab";
  },
  render(ctx) {
    return (
      <VectorEditorContent
        tabId={ctx.workspaceTabId}
        filePath={ctx.item.filePath ?? null}
        onAssignPath={(path) => ctx.updateItem({ filePath: path })}
        treeOpen={ctx.treeOpen}
        onToggleTree={ctx.onToggleTree}
      />
    );
  },
};
