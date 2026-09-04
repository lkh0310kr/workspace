import { afterEach, describe, expect, it, vi } from "vitest";
import { clearShortcutRegistry, dispatchShortcut, registerShortcut } from "./shortcutRegistry";

function keyEvent(key: string): KeyboardEvent {
  return { key } as KeyboardEvent;
}

describe("shortcutRegistry", () => {
  afterEach(() => {
    clearShortcutRegistry();
  });

  it("runs higher-scope handlers before lower-scope handlers", () => {
    const order: string[] = [];
    registerShortcut({
      id: "document",
      scope: "document",
      handle: () => {
        order.push("document");
        return false;
      },
    });
    registerShortcut({
      id: "workspace",
      scope: "workspace",
      handle: () => {
        order.push("workspace");
        return true;
      },
    });
    expect(dispatchShortcut(keyEvent("k"))).toBe(true);
    expect(order).toEqual(["workspace"]);
  });

  it("skips handlers whose when() returns false", () => {
    const handler = vi.fn(() => true);
    registerShortcut({
      id: "blocked",
      scope: "app",
      when: () => false,
      handle: handler,
    });
    dispatchShortcut(keyEvent("w"));
    expect(handler).not.toHaveBeenCalled();
  });
});
