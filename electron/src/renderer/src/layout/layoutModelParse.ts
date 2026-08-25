import { IJsonModel, Model } from "flexlayout-react";
import { PaneGroupConfig, PaneTabItem, TabKind } from "./paneTypes";

function migrateLegacyTabNode(record: Record<string, unknown>): void {
  if (record.component === "tabgroup") return;
  const legacyKind = record.component as TabKind | undefined;
  if (!legacyKind) return;
  const legacyConfig = (record.config ?? {}) as Record<string, unknown>;
  const id = (record.id as string | undefined) ?? `legacy-${legacyKind}`;
  const item: PaneTabItem = {
    id,
    kind: legacyKind,
    terminalId: legacyConfig.terminalId as number | undefined,
    filePath: legacyConfig.filePath as string | null | undefined,
    url: legacyConfig.url as string | undefined,
  };
  const groupConfig: PaneGroupConfig = {
    tabs: [item],
    activeTabId: id,
    zoom: legacyConfig.zoom as number | undefined,
  };
  record.component = "tabgroup";
  record.config = groupConfig;
}

function normalizeLayoutNode(node: unknown) {
  if (!node || typeof node !== "object") return;
  const record = node as Record<string, unknown>;
  if (record.type === "tabset") {
    record.enableTabStrip = false;
    record.enableSingleTabStretch = false;
  }
  if (record.type === "tab") {
    migrateLegacyTabNode(record);
  }
  const children = record.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      normalizeLayoutNode(child);
    }
  }
}

export function parseLayoutJson(json: string): IJsonModel {
  const model = JSON.parse(json) as IJsonModel;
  const savedGlobal = model.global ?? {};
  model.global = {
    ...savedGlobal,
    tabEnableClose: true,
    tabSetEnableMaximize: false,
    tabSetEnableDrop: savedGlobal.tabSetEnableDrop ?? true,
    tabSetEnableTabStrip: false,
    tabSetEnableSingleTabStretch: false,
    tabEnableRenderOnDemand: false,
    tabEnableRename: false,
  };
  normalizeLayoutNode(model.layout);
  const layout = model.layout as { type?: string } | undefined;
  if (layout?.type === "tabset") {
    model.layout = {
      type: "row",
      children: [layout],
    } as IJsonModel["layout"];
  }
  return model;
}

export function modelFromLayoutJson(json: string): Model {
  return Model.fromJson(parseLayoutJson(json));
}

export function countLayoutTabs(model: Model): number {
  let n = 0;
  model.visitNodes((node) => {
    if (node.getType() === "tab") n += 1;
  });
  return n;
}
