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
  render(ctx) {
    return <JapanesePaneContent item={ctx.item} />;
  },
};
