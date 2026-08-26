import { describe, expect, it } from "vitest";
import { defaultLayoutJson } from "./layoutDefaults";
import { salvageLayoutJson, salvagePaneGroupConfig, salvagePaneTabItem } from "./layoutSalvage";

describe("layoutSalvage", () => {
  it("salvagePaneTabItem accepts valid terminal tab", () => {
    expect(salvagePaneTabItem({ id: "t1", kind: "terminal", terminalId: 3 })).toEqual({
      id: "t1",
      kind: "terminal",
      terminalId: 3,
    });
  });

  it("salvagePaneTabItem rejects terminal without terminalId", () => {
    expect(salvagePaneTabItem({ id: "t1", kind: "terminal" })).toBeNull();
  });

  it("salvagePaneGroupConfig picks first tab when activeTabId is invalid", () => {
    const config = salvagePaneGroupConfig({
      tabs: [
        { id: "a", kind: "browser", url: "https://example.com" },
        { id: "b", kind: "terminal", terminalId: 1 },
      ],
      activeTabId: "missing",
    });
    expect(config?.activeTabId).toBe("a");
  });

  it("salvageLayoutJson replaces corrupt JSON with default layout", () => {
    const { json, salvaged } = salvageLayoutJson("{not json", 7);
    expect(salvaged).toBe(true);
    expect(json).toContain('"terminalId":7');
    expect(JSON.parse(json).layout).toBeTruthy();
  });

  it("salvageLayoutJson drops invalid tabs but keeps valid ones", () => {
    const base = JSON.parse(defaultLayoutJson(2)) as Record<string, unknown>;
    const layout = base.layout as Record<string, unknown>;
    const tabset = (layout.children as Record<string, unknown>[])[0];
    const tab = (tabset.children as Record<string, unknown>[])[0];
    const config = tab.config as Record<string, unknown>;
    config.tabs = [
      { id: "bad", kind: "terminal" },
      { id: "good", kind: "terminal", terminalId: 2 },
    ];
    config.activeTabId = "bad";

    const { json, salvaged } = salvageLayoutJson(JSON.stringify(base));
    expect(salvaged).toBe(true);
    const parsed = JSON.parse(json);
    const salvagedConfig = (
      parsed.layout.children[0].children[0] as {
        config: { tabs: unknown[]; activeTabId: string; schemaVersion: number };
      }
    ).config;
    expect(salvagedConfig.tabs).toHaveLength(1);
    expect(salvagedConfig.activeTabId).toBe("good");
    expect(salvagedConfig.schemaVersion).toBe(1);
  });
});
