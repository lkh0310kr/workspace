import { spawnTerminal } from "../../electron";
import { TerminalPane } from "../TerminalPane";
import type { PaneKindDefinition } from "../paneKindRegistry";

export const terminalPaneKind: PaneKindDefinition = {
  kind: "terminal",
  label: "Terminal",
  icon: "⌘",
  pickerEntries: [{ label: "Terminal", icon: "⌘" }],
  async createItem(id) {
    return { id, kind: "terminal", terminalId: await spawnTerminal() };
  },
  tabLabel() {
    return "Terminal";
  },
  render(ctx) {
    return (
      <TerminalPane
        terminalId={ctx.item.terminalId ?? 0}
        visible={ctx.chipShown}
        active={ctx.active}
        zoom={ctx.zoom}
      />
    );
  },
};
