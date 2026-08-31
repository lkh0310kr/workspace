import { Actions, TabNode } from "flexlayout-react";
import type { PaneGroupConfig } from "./paneTypes";

export type RecordedAction = {
  type: string;
  data?: {
    node?: string;
    json?: { config?: PaneGroupConfig };
    attributes?: { config?: PaneGroupConfig };
    config?: PaneGroupConfig;
  };
};

export function makePaneNode(id: string, config: PaneGroupConfig, parentId = "tabset-1") {
  return Object.assign(Object.create(TabNode.prototype), {
    getType: () => "tab",
    getId: () => id,
    getConfig: () => config,
    getParent: () => ({ getType: () => "tabset", getId: () => parentId }),
  });
}

export function makeActionModel(panes: ReturnType<typeof makePaneNode>[]) {
  const actions: RecordedAction[] = [];
  const model = {
    getNodeById: (id: string) => panes.find((pane) => pane.getId() === id) ?? null,
    visitNodes: (visit: (node: { getType: () => string }) => void) => {
      for (const pane of panes) visit(pane);
    },
    getActiveTabset: () => null,
    doAction: (action: RecordedAction) => {
      actions.push(action);
    },
  };
  return { model, actions };
}

export function updateConfigs(actions: RecordedAction[]): PaneGroupConfig[] {
  return actions
    .filter((action) => action.type === Actions.UPDATE_NODE_ATTRIBUTES)
    .map((action) => action.data?.json?.config ?? action.data?.attributes?.config ?? action.data?.config)
    .filter((config): config is PaneGroupConfig => config != null);
}

export function lastUpdateConfig(actions: RecordedAction[]): PaneGroupConfig | undefined {
  const configs = updateConfigs(actions);
  return configs[configs.length - 1];
}
