import { BrowserContent } from "../BrowserContent";
import type { PaneKindDefinition } from "../paneKindRegistry";

export const browserPaneKind: PaneKindDefinition = {
  kind: "browser",
  label: "Browser",
  icon: "🌐",
  pickerEntries: [{ label: "Browser", icon: "🌐" }],
  createItem(id, source) {
    return { id, kind: "browser", url: source?.url ?? "https://www.google.com" };
  },
  tabLabel(item) {
    if (item.title?.trim()) return item.title.trim();
    try {
      return item.url ? new URL(item.url).hostname : "New Tab";
    } catch {
      return item.url || "New Tab";
    }
  },
  render(ctx) {
    return (
      <BrowserContent
        tabId={ctx.workspaceTabId}
        paneNodeId={ctx.nodeId}
        item={ctx.item}
        paneVisible={ctx.paneVisible}
        chipActive={ctx.active}
        onUpdate={ctx.updateItem}
        onOpenNewTab={(url) => ctx.openNewTab("browser", { url })}
        onFocusPaneGroup={ctx.focusPaneGroup}
        onSelectPaneTab={ctx.selectPaneTab}
      />
    );
  },
};
