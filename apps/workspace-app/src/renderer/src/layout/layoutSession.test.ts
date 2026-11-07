import { describe, expect, it } from "vitest";
import { resolveActivePaneTabId } from "./layoutSession";

describe("layoutSession", () => {
  it("keeps a valid activeTabId", () => {
    expect(
      resolveActivePaneTabId({
        tabs: [{ id: "a", kind: "terminal", terminalId: 1 }],
        activeTabId: "a",
      }),
    ).toBe("a");
  });

  it("falls back to the first tab when activeTabId is stale", () => {
    expect(
      resolveActivePaneTabId({
        tabs: [
          { id: "a", kind: "code", filePath: "a.ts" },
          { id: "b", kind: "code", filePath: "b.ts" },
        ],
        activeTabId: "missing",
      }),
    ).toBe("a");
  });
});
