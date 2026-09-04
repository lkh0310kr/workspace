import { JapanesePaneContent } from "../JapanesePaneContent";
import type { PaneKindDefinition } from "../paneKindRegistry";

export const japanesePaneKind: PaneKindDefinition = {
  kind: "japanese",
  label: "Japanese",
  icon: "日",
  pickerEntries: [{ label: "Japanese", icon: "日" }],
  createItem(id) {
    return { id, kind: "japanese" };
  },
  tabLabel() {
    return "Japanese";
  },
  tabContextMenuItems(_item, { updateItem }) {
    return [
      {
        type: "button",
        label: "설정",
        onClick: () => updateItem({ japaneseSettingsOpen: true }),
      },
    ];
  },
  render(ctx) {
    return <JapanesePaneContent item={ctx.item} onUpdateItem={ctx.updateItem} />;
  },
};
