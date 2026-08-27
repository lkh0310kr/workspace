import { RssReaderContent } from "../RssReaderContent";
import type { PaneKindDefinition } from "../paneKindRegistry";

export const rssPaneKind: PaneKindDefinition = {
  kind: "rss",
  label: "RSS",
  icon: "📰",
  pickerEntries: [{ label: "RSS", icon: "📰" }],
  createItem(id, source) {
    return { id, kind: "rss", feedUrl: source?.feedUrl };
  },
  tabLabel(item) {
    if (item.title?.trim()) return item.title.trim();
    if (!item.feedUrl) return "RSS";
    try {
      return new URL(item.feedUrl).hostname;
    } catch {
      return item.feedUrl;
    }
  },
  render(ctx) {
    return (
      <RssReaderContent
        item={ctx.item}
        onUpdate={ctx.updateItem}
        onOpenArticle={(link) => ctx.openNewTab("browser", { url: link })}
      />
    );
  },
};
