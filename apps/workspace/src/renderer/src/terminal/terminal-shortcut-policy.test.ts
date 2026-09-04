import { describe, expect, it } from "vitest";
import { resolveTerminalShortcutAction } from "./terminal-shortcut-policy";

function event(
  overrides: Partial<{
    key: string;
    code: string;
    metaKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
    repeat: boolean;
    isComposing: boolean;
    altModifierActive: boolean;
  }> = {},
) {
  return {
    key: "",
    code: "",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...overrides,
  };
}

describe("resolveTerminalShortcutAction macOS Option", () => {
  it("maps Option+Backspace to backward-kill-word (^W)", () => {
    expect(
      resolveTerminalShortcutAction(
        event({ key: "Backspace", code: "Backspace", altKey: true }),
        true,
      ),
    ).toEqual({ type: "sendInput", data: "\x17" });
  });

  it("maps Option+arrow via altModifierActive when altKey is false", () => {
    expect(
      resolveTerminalShortcutAction(
        event({
          key: "ArrowLeft",
          code: "ArrowLeft",
          altKey: false,
          altModifierActive: true,
        }),
        true,
      ),
    ).toEqual({ type: "sendInput", data: "\x1bb" });
  });

  it("maps Option+arrow to readline word-nav bytes", () => {
    expect(
      resolveTerminalShortcutAction(event({ key: "ArrowLeft", code: "ArrowLeft", altKey: true }), true),
    ).toEqual({ type: "sendInput", data: "\x1bb" });
    expect(
      resolveTerminalShortcutAction(
        event({ key: "ArrowRight", code: "ArrowRight", altKey: true }),
        true,
      ),
    ).toEqual({ type: "sendInput", data: "\x1bf" });
  });

  it("maps Option+B/F/D via physical code when key is a composed glyph", () => {
    expect(
      resolveTerminalShortcutAction(event({ key: "∫", code: "KeyB", altKey: true }), true),
    ).toEqual({ type: "sendInput", data: "\x1bb" });
    expect(
      resolveTerminalShortcutAction(event({ key: "ƒ", code: "KeyF", altKey: true }), true),
    ).toEqual({ type: "sendInput", data: "\x1bf" });
    expect(
      resolveTerminalShortcutAction(event({ key: "∂", code: "KeyD", altKey: true }), true),
    ).toEqual({ type: "sendInput", data: "\x1bd" });
  });

  it("defers Option+arrow to xterm when kitty flags are active", () => {
    expect(
      resolveTerminalShortcutAction(
        event({ key: "ArrowLeft", code: "ArrowLeft", altKey: true }),
        true,
        0,
        () => 1,
      ),
    ).toBeNull();
    expect(
      resolveTerminalShortcutAction(
        event({ key: "Backspace", code: "Backspace", altKey: true }),
        true,
        0,
        () => 1,
      ),
    ).toBeNull();
  });

  it("ignores stale option tracker for letter keys without alt active", () => {
    expect(
      resolveTerminalShortcutAction(
        event({ key: "d", code: "KeyD", altKey: false }),
        true,
        1,
      ),
    ).toBeNull();
  });

  it("maps arrows with stale option tracker when altKey is false", () => {
    expect(
      resolveTerminalShortcutAction(
        event({ key: "ArrowLeft", code: "ArrowLeft", altKey: false }),
        true,
        1,
      ),
    ).toEqual({ type: "sendInput", data: "\x1bb" });
  });

  it("keeps Cmd+arrow scroll and line navigation", () => {
    expect(
      resolveTerminalShortcutAction(event({ key: "ArrowUp", code: "ArrowUp", metaKey: true }), true),
    ).toEqual({ type: "scrollViewport", position: "top" });
    expect(
      resolveTerminalShortcutAction(event({ key: "ArrowLeft", code: "ArrowLeft", metaKey: true }), true),
    ).toEqual({ type: "sendInput", data: "\x01" });
  });

  it("selects all with Cmd+A on macOS and Ctrl+Shift+A elsewhere", () => {
    expect(
      resolveTerminalShortcutAction(event({ key: "a", code: "KeyA", metaKey: true }), true),
    ).toEqual({ type: "selectAll" });
    expect(
      resolveTerminalShortcutAction(event({ key: "a", code: "KeyA", ctrlKey: true }), false),
    ).toBeNull();
    expect(
      resolveTerminalShortcutAction(
        event({ key: "A", code: "KeyA", ctrlKey: true, shiftKey: true }),
        false,
      ),
    ).toEqual({ type: "selectAll" });
  });

  it("pastes with Cmd+V on macOS and Ctrl+V elsewhere", () => {
    expect(
      resolveTerminalShortcutAction(event({ key: "v", code: "KeyV", metaKey: true }), true),
    ).toEqual({ type: "paste" });
    expect(
      resolveTerminalShortcutAction(event({ key: "v", code: "KeyV", ctrlKey: true }), false),
    ).toEqual({ type: "paste" });
    expect(
      resolveTerminalShortcutAction(
        event({ key: "V", code: "KeyV", metaKey: true, shiftKey: true }),
        true,
      ),
    ).toBeNull();
  });
});
