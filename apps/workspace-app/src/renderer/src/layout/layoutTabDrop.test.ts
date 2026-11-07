import { DockLocation } from "flexlayout-react";
import { describe, expect, it } from "vitest";
import { resolveDockLocation } from "./layoutTabDrop";

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return { left, top, right: left + width, bottom: top + height, width, height, x: left, y: top, toJSON: () => ({}) };
}

describe("layoutTabDrop.resolveDockLocation", () => {
  const pane = rect(100, 100, 200, 100);

  it("maps left edge to LEFT", () => {
    expect(resolveDockLocation(pane, 110, 150).getName()).toBe(DockLocation.LEFT.getName());
  });

  it("maps right edge to RIGHT", () => {
    expect(resolveDockLocation(pane, 285, 150).getName()).toBe(DockLocation.RIGHT.getName());
  });

  it("maps top edge to TOP", () => {
    expect(resolveDockLocation(pane, 200, 110).getName()).toBe(DockLocation.TOP.getName());
  });

  it("maps bottom edge to BOTTOM", () => {
    expect(resolveDockLocation(pane, 200, 185).getName()).toBe(DockLocation.BOTTOM.getName());
  });

  it("maps center to CENTER", () => {
    expect(resolveDockLocation(pane, 200, 150).getName()).toBe(DockLocation.CENTER.getName());
  });
});
