import { FileViewerContent } from "../FileViewerContent";
import type { PaneKindDefinition } from "../paneKindRegistry";

export const viewerPaneKind: PaneKindDefinition = {
  kind: "viewer",
  label: "Viewer",
  icon: "▣",
  hasFileExplorer: true,
  // Video/Audio/Ebook go straight to a Browse dialog instead of only
  // being reachable by clicking a file already in the workspace tree —
  // all three create a "viewer" tab (FileViewerContent already dispatches
  // by extension); the source's viewerHint just decides the blank
  // state's Browse-dialog filter.
  pickerEntries: [
    { label: "Video", icon: "🎬", source: { viewerHint: "video" } },
    { label: "Audio", icon: "🎵", source: { viewerHint: "audio" } },
    { label: "Ebook", icon: "📖", source: { viewerHint: "ebook" } },
  ],
  createItem(id, source) {
    return {
      id,
      kind: "viewer",
      filePath: source?.filePath ?? null,
      absolutePath: source?.absolutePath,
      viewerHint: source?.viewerHint,
    };
  },
  tabLabel(item) {
    const path = item.filePath ?? item.absolutePath;
    if (!path) {
      if (item.viewerHint === "video") return "Video";
      if (item.viewerHint === "audio") return "Audio";
      if (item.viewerHint === "ebook") return "Ebook";
      return "New tab";
    }
    return path.split("/").pop() || path;
  },
  render(ctx) {
    return (
      <FileViewerContent
        tabId={ctx.workspaceTabId}
        filePath={ctx.item.filePath ?? null}
        absolutePath={ctx.item.absolutePath ?? null}
        viewerHint={ctx.item.viewerHint}
        onAssignAbsolutePath={(path) => ctx.updateItem({ absolutePath: path })}
        treeOpen={ctx.treeOpen}
        onToggleTree={ctx.onToggleTree}
        paneActive={ctx.chipShown}
      />
    );
  },
};
