/** Default flexlayout JSON for a fresh workspace tab with one terminal pane. */
export function defaultLayoutJson(terminalId: number): string {
  const itemId = `terminal-${terminalId}`;
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
              id: `tabgroup-${itemId}`,
              name: "Terminal",
              component: "tabgroup",
              config: {
                tabs: [{ id: itemId, kind: "terminal", terminalId }],
                activeTabId: itemId,
              },
            },
          ],
        },
      ],
    },
  });
}
