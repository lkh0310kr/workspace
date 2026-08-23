import { Actions, DockLocation, Model } from "flexlayout-react";
import { spawnTerminal } from "../tauri";
import { PaneComponent, PaneConfig, paneLabel } from "./paneTypes";

let paneCounter = 0;

function nextPaneId(component: PaneComponent): string {
  paneCounter += 1;
  return `${component}-${paneCounter}`;
}

async function buildPaneConfig(
  component: PaneComponent,
  source?: PaneConfig,
): Promise<PaneConfig> {
  switch (component) {
    case "terminal":
      return { terminalId: await spawnTerminal() };
    case "browser":
      return { url: source?.url ?? "https://www.google.com" };
    case "code":
    case "markdown":
      return source?.filePath ? { filePath: source.filePath } : {};
    default:
      return {};
  }
}

export async function createTabJson(
  component: PaneComponent,
  config?: PaneConfig,
  source?: PaneConfig,
) {
  const paneConfig = config ?? (await buildPaneConfig(component, source));
  return {
    type: "tab" as const,
    id: nextPaneId(component),
    name: paneLabel(component),
    component,
    config: paneConfig,
  };
}

export async function addPaneToTabSet(
  model: Model,
  tabSetId: string,
  component: PaneComponent,
  source?: PaneConfig,
) {
  const tabJson = await createTabJson(component, undefined, source);
  model.doAction(
    Actions.addNode(tabJson, tabSetId, DockLocation.CENTER, -1, true),
  );
}

export async function replacePane(
  model: Model,
  tabNodeId: string,
  component: PaneComponent,
  source?: PaneConfig,
) {
  const config = await buildPaneConfig(component, source);
  model.doAction(
    Actions.updateNodeAttributes(tabNodeId, {
      component,
      name: paneLabel(component),
      config,
    }),
  );
}

export async function splitTabSet(
  model: Model,
  tabSetId: string,
  direction: "right" | "down",
  component: PaneComponent,
  source?: PaneConfig,
) {
  const tabJson = await createTabJson(component, undefined, source);
  const location = direction === "right" ? DockLocation.RIGHT : DockLocation.BOTTOM;
  model.doAction(Actions.addNode(tabJson, tabSetId, location, -1, true));
}
