import { spawnTerminal } from "../../electron";
import {
  detectAgentStatusFromTitle,
  normalizeTerminalTitle,
} from "../../../../shared/agent/agent-title-status";
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
  icon: "terminal",
  pickerEntries: [{ label: "Terminal", icon: "terminal" }],
  async createItem(id, _source, workspaceTabId) {
    return { id, kind: "terminal", terminalId: await spawnTerminal(120, 40, workspaceTabId) };
  },
  tabLabel: terminalTabLabel,
  render(ctx) {
    return (
      <TerminalPane
        terminalId={ctx.item.terminalId ?? 0}
        workspaceTabId={ctx.workspaceTabId}
        paneTabId={ctx.item.id}
        rootPath={ctx.rootPath}
        visible={ctx.chipShown}
        active={ctx.active}
        zoom={ctx.zoom}
        terminalAgent={ctx.item.terminalAgent}
        onTerminalTabUpdate={(patch) => {
          const next: Partial<PaneTabItem> = {
            ...(patch.title !== undefined ? { title: patch.title } : {}),
            ...(patch.terminalAgent !== undefined
              ? { terminalAgent: patch.terminalAgent ?? undefined }
              : {}),
          };
          if (patch.title !== undefined) {
            next.terminalAgentStatus = detectAgentStatusFromTitle(patch.title) ?? undefined;
          }
          if (Object.keys(next).length > 0) ctx.updateItem(next);
        }}
      />
    );
  },
};
