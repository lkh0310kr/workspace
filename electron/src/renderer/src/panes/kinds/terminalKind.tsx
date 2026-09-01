import { spawnTerminal } from "../../electron";
import { normalizeTerminalTitle } from "../../../../shared/agent/agent-title-status";
import { getAgentLabel } from "../../agent/agent-catalog";
import { TerminalPane } from "../TerminalPane";
import type { PaneKindDefinition } from "../paneKindRegistry";
import type { PaneTabItem } from "../../layout/paneTypes";

function terminalTabLabel(item: PaneTabItem): string {
  const title = item.title?.trim();
  if (title) {
    const normalized = normalizeTerminalTitle(title);
    if (normalized) return normalized;
  }
  if (item.terminalAgent) return getAgentLabel(item.terminalAgent);
  return "Terminal";
}

export const terminalPaneKind: PaneKindDefinition = {
  kind: "terminal",
  label: "Terminal",
  icon: "⌘",
  pickerEntries: [{ label: "Terminal", icon: "⌘" }],
  async createItem(id, _source, workspaceTabId) {
    return { id, kind: "terminal", terminalId: await spawnTerminal(120, 40, workspaceTabId) };
  },
  tabLabel: terminalTabLabel,
  render(ctx) {
    return (
      <TerminalPane
        terminalId={ctx.item.terminalId ?? 0}
        visible={ctx.chipShown}
        active={ctx.active}
        zoom={ctx.zoom}
        onTerminalTabUpdate={(patch) => {
          const next: Partial<PaneTabItem> = {
            ...(patch.title !== undefined ? { title: patch.title } : {}),
            ...(patch.terminalAgent !== undefined
              ? { terminalAgent: patch.terminalAgent ?? undefined }
              : {}),
          };
          if (Object.keys(next).length > 0) ctx.updateItem(next);
        }}
      />
    );
  },
};
