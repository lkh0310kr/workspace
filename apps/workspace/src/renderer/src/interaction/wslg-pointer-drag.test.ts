import { describe, expect, it } from "vitest";
import { isActivePointerDragEvent } from "./wslg-pointer-drag";

function pointer(
  partial: Partial<PointerEvent> & Pick<PointerEvent, "pointerId">,
): PointerEvent {
  return {
    pointerType: "mouse",
    isPrimary: true,
    ...partial,
  } as PointerEvent;
}

describe("isActivePointerDragEvent", () => {
  it("matches the captured pointer id", () => {
    const active = { pointerId: 1, pointerType: "mouse" };
    expect(isActivePointerDragEvent(pointer({ pointerId: 1 }), active)).toBe(true);
  });

  it("accepts a different primary pen id during a mouse drag (WSLg relay)", () => {
    const active = { pointerId: 1, pointerType: "mouse" };
    expect(
      isActivePointerDragEvent(
        pointer({ pointerId: 19, pointerType: "pen", isPrimary: true }),
        active,
      ),
    ).toBe(true);
  });

  it("rejects unrelated non-primary pointers", () => {
    const active = { pointerId: 1, pointerType: "mouse" };
    expect(
      isActivePointerDragEvent(
        pointer({ pointerId: 9, pointerType: "mouse", isPrimary: false }),
        active,
      ),
    ).toBe(false);
  });

  it("does not let touch hijack a mouse drag", () => {
    const active = { pointerId: 1, pointerType: "mouse" };
    expect(
      isActivePointerDragEvent(
        pointer({ pointerId: 2, pointerType: "touch", isPrimary: true }),
        active,
      ),
    ).toBe(false);
  });
});
