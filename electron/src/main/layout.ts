// Direct port of crates/workspace-core/src/layout.rs.

export function defaultLayout(terminalId: number): string {
  return JSON.stringify({
    global: {
      tabEnableClose: true,
      tabSetEnableMaximize: false,
      tabSetEnableDrop: true,
      tabSetEnableTabStrip: false,
      tabSetEnableSingleTabStretch: false,
      tabEnableRenderOnDemand: false,
      tabEnableRename: false,
      splitterSize: 1,
      splitterExtra: 8,
      tabDragSpeed: 0,
    },
    borders: [],
    layout: {
      type: "row",
      children: [
        {
          type: "tabset",
          weight: 100,
          children: [
            {
              type: "tab",
              id: `terminal-${terminalId}`,
              name: "Terminal",
              component: "terminal",
              config: { terminalId },
            },
          ],
        },
      ],
    },
  });
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
    if (obj.component === "terminal") {
      const config = obj.config as Record<string, unknown> | undefined;
      const terminalId = config?.terminalId;
      if (typeof terminalId === "number") ids.push(terminalId);
    }
    for (const child of Object.values(obj)) walkLayout(child, ids);
  }
}
