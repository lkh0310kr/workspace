import type { Model, TabNode } from "flexlayout-react";
import type { PaneTabItem } from "../layout/paneTypes";
import { readPaneGroupConfig } from "../layout/layoutSession";

export function collectTerminalPaneTabs(model: Model): PaneTabItem[] {
  const terminals: PaneTabItem[] = [];
  model.visitNodes((node) => {
    if (node.getType() !== "tab") return;
    const config = readPaneGroupConfig(node as TabNode);
    for (const tab of config.tabs) {
      if (tab.kind === "terminal") terminals.push(tab);
    }
  });
  return terminals;
}
