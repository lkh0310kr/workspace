import { FileViewerContent } from "../FileViewerContent";
import type { PaneKindDefinition } from "../paneKindRegistry";

export const viewerPaneKind: PaneKindDefinition = {
  kind: "viewer",
  // Kept as an internal renderer kind for files opened from the explorer.
  // Users create the single Editor entry; this kind is selected by extension.
  label: "Editor",
  icon: "viewer",
  hasFileExplorer: true,
  // FileViewerContent remains the format-specific renderer for media,
  // EPUB, images, PDF, and 3D/CAD assets. Files reach it by extension
  // through TreeView/Quick Open; it is not a separate picker destination.
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
