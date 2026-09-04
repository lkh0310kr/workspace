import { IJsonModel, Model } from "flexlayout-react";
import { salvageLayoutJson } from "../../../shared/layoutSalvage";

function normalizeLayoutNode(node: unknown) {
  if (!node || typeof node !== "object") return;
  const record = node as Record<string, unknown>;
  if (record.type === "tabset") {
    record.enableTabStrip = false;
    record.enableSingleTabStretch = false;
  }
  const children = record.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      normalizeLayoutNode(child);
    }
  }
}

export function parseLayoutJson(json: string): IJsonModel {
  const { json: salvaged } = salvageLayoutJson(json);
  const model = JSON.parse(salvaged) as IJsonModel;
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

export function countLayoutTabSets(model: Model): number {
  let n = 0;
  model.visitNodes((node) => {
    if (node.getType() === "tabset") n += 1;
  });
  return n;
}
