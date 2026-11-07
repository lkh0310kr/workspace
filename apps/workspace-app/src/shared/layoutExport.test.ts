import { describe, expect, it } from "vitest";
import { buildLayoutExportFile, layoutExportPath } from "./layoutExport";

const tabs = [
  { id: 0, title: "A", layoutJson: "{}", rootPath: "/proj" },
  { id: 1, title: "B", layoutJson: "{}", rootPath: "/proj" },
  { id: 2, title: "Other", layoutJson: "{}", rootPath: "/other" },
];

describe("layoutExport", () => {
  it("builds per-root export with active tab fallback", () => {
    const file = buildLayoutExportFile(tabs, 99, "/proj", "2026-01-01T00:00:00.000Z");
    expect(file).toEqual({
      schemaVersion: 1,
      exportedAt: "2026-01-01T00:00:00.000Z",
      activeTabId: 0,
      tabs: [
        { id: 0, title: "A", layoutJson: "{}" },
        { id: 1, title: "B", layoutJson: "{}" },
      ],
    });
  });

  it("returns null when no tabs match root", () => {
    expect(buildLayoutExportFile(tabs, 0, "/missing")).toBeNull();
  });

  it("resolves export path under workspace root", () => {
    expect(layoutExportPath("/proj")).toBe("/proj/.workspace/layout.json");
  });
});
