/**
 * Layout / flexlayout / pane drag-drop debug logging — NDJSON file (main) + ring buffer.
 * File: {userData}/logs/layout.ndjson
 */

import type { Model, TabNode } from "flexlayout-react";
import type { PaneGroupConfig } from "./paneTypes";

const MAX_RING = 500;

export type LayoutLogEntry = {
  sessionId: string;
  timestamp: number;
  location: string;
  message: string;
  workspaceTabId?: number;
  data?: Record<string, unknown>;
};

const ring: LayoutLogEntry[] = [];

export type LayoutPaneSummary = {
  nodeId: string;
  name: string;
  tabs: Array<{ id: string; kind: string }>;
  activeTabId: string;
};

export type LayoutSummary = {
  paneCount: number;
  panes: LayoutPaneSummary[];
};

export function summarizeLayoutModel(model: Model | undefined | null): LayoutSummary | null {
  if (!model) return null;
  const panes: LayoutPaneSummary[] = [];
  model.visitNodes((node) => {
    if (node.getType() !== "tab") return;
    const tabNode = node as TabNode;
    if (tabNode.getComponent() !== "tabgroup") return;
    const config = (tabNode.getConfig() ?? { tabs: [], activeTabId: "" }) as PaneGroupConfig;
    panes.push({
      nodeId: tabNode.getId(),
      name: tabNode.getName(),
      tabs: config.tabs.map((t) => ({ id: t.id, kind: t.kind })),
      activeTabId: config.activeTabId,
    });
  });
  return { paneCount: panes.length, panes };
}

export function layoutLog(
  location: string,
  message: string,
  data?: Record<string, unknown>,
  workspaceTabId?: number,
): void {
  const entry: LayoutLogEntry = {
    sessionId: "layout",
    timestamp: Date.now(),
    location,
    message,
    workspaceTabId,
    data,
  };
  ring.push(entry);
  if (ring.length > MAX_RING) ring.shift();
  try {
    window.api?.debug?.layoutLog(entry as Record<string, unknown>);
  } catch {
    /* ignore */
  }
}

export function layoutLogModel(
  location: string,
  message: string,
  model: Model | undefined | null,
  extra?: Record<string, unknown>,
  workspaceTabId?: number,
): void {
  layoutLog(location, message, { ...extra, layout: summarizeLayoutModel(model) }, workspaceTabId);
}

export function layoutLogMutation(
  location: string,
  message: string,
  layoutBefore: LayoutSummary | null,
  layoutAfter: LayoutSummary | null,
  extra?: Record<string, unknown>,
  workspaceTabId?: number,
): void {
  layoutLog(
    location,
    message,
    {
      ...extra,
      layoutBefore,
      layoutAfter,
    },
    workspaceTabId,
  );
}

export function getLayoutLogRing(): readonly LayoutLogEntry[] {
  return ring;
}
