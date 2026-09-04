import { describe, expect, it } from "vitest";
import { projectVisibleRows } from "./useTreeProjection";

describe("projectVisibleRows", () => {
  const rows = Array.from({ length: 200 }, (_, i) => i);

  it("returns a window around the scroll position", () => {
    const { rows: visible, paddingTop, startIndex } = projectVisibleRows(rows, 480, 240);
    expect(startIndex).toBeGreaterThan(0);
    expect(visible.length).toBeLessThan(rows.length);
    expect(paddingTop).toBe(startIndex * 24);
  });
});
