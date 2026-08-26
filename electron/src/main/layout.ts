// Direct port of crates/workspace-core/src/layout.rs.

import { defaultLayoutJson } from "../shared/layoutDefaults";

// Every flexlayout tab node holds a PaneGroupConfig (a list of
// heterogeneous terminal/browser/editor tabs, see renderer/layout/
// paneTypes.ts) rather than a single component+config pair — the
// "globalize the editor's multi-tab system" rework. A fresh workspace tab
// still starts with just one terminal, now wrapped in that shape.
export function defaultLayout(terminalId: number): string {
  return defaultLayoutJson(terminalId);
}

export function extractTerminalIds(layoutJson: string): number[] {
  let value: unknown;
  try {
    value = JSON.parse(layoutJson);
  } catch {
    return [];
  }
  const ids: number[] = [];
  walkLayout(value, ids);
  return Array.from(new Set(ids)).sort((a, b) => a - b);
}

function walkLayout(value: unknown, ids: number[]): void {
  if (Array.isArray(value)) {
    for (const item of value) walkLayout(item, ids);
    return;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    // "component === terminal" is the legacy (pre-tab-group) shape, still
    // handled here so a layoutJson persisted before that rework still
    // resolves its terminals on this launch — the renderer's own
    // migrateLegacyTabNode (App.tsx) rewrites it to the new shape once
    // loaded, but this file reads the on-disk JSON directly, before that.
    // "kind === terminal" is a PaneTabItem inside a tab group's
    // config.tabs — this same generic walk already recurses into that
    // array via Object.values below, so no shape-specific traversal is
    // needed beyond checking both field names.
    if (obj.component === "terminal") {
      const config = obj.config as Record<string, unknown> | undefined;
      const terminalId = config?.terminalId;
      if (typeof terminalId === "number") ids.push(terminalId);
    }
    if (obj.kind === "terminal" && typeof obj.terminalId === "number") {
      ids.push(obj.terminalId);
    }
    for (const child of Object.values(obj)) walkLayout(child, ids);
  }
}
