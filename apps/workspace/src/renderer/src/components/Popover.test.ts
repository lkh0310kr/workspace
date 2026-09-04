import { describe, expect, it } from "vitest";
import { shouldDismissPopoverPointerDown, type AnchorRect } from "./Popover";

const anchor: AnchorRect = {
  left: 100,
  top: 10,
  right: 130,
  bottom: 38,
  width: 30,
  height: 28,
};

function mockTarget(closestSelector: string | null): Node {
  return {
    closest: (selector: string) =>
      closestSelector && selector.includes(closestSelector) ? ({} as Element) : null,
  } as unknown as Node;
}

describe("shouldDismissPopoverPointerDown", () => {
  it("ignores presses inside the popover root", () => {
    const button = {} as Node;
    const popover = { contains: (node: Node) => node === button } as HTMLElement;
    expect(shouldDismissPopoverPointerDown(button, popover, 0, 0, anchor)).toBe(false);
  });

  it("ignores presses on the anchor trigger rect", () => {
    expect(shouldDismissPopoverPointerDown({} as Node, null, 110, 20, anchor)).toBe(false);
  });

  it("ignores presses inside another portaled popover or context menu", () => {
    const item = mockTarget("context-menu");
    expect(shouldDismissPopoverPointerDown(item, null, 0, 0, anchor)).toBe(false);
  });

  it("dismisses true outside presses", () => {
    const body = mockTarget(null);
    expect(shouldDismissPopoverPointerDown(body, null, 0, 0, anchor)).toBe(true);
  });
});
