import { describe, expect, it } from "vitest";
import {
  isAppOwnedCopyChord,
  shouldBypassXtermClipboardKeyboardEvent,
} from "./xterm-clipboard-bypass-policy";

describe("shouldBypassXtermClipboardKeyboardEvent", () => {
  const withSel = { isMac: true, hasSelection: true };
  const noSel = { isMac: true, hasSelection: false };

  it("bubbles Cmd+C so Chromium copy can run when kitty would block it", () => {
    expect(
      shouldBypassXtermClipboardKeyboardEvent(
        { type: "keydown", key: "c", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false },
        withSel,
      ),
    ).toBe(true);
    expect(
      shouldBypassXtermClipboardKeyboardEvent(
        { type: "keydown", key: "c", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false },
        noSel,
      ),
    ).toBe(true);
  });

  it("lets unselected Cmd+C reach Kitty when flags are active", () => {
    const chord = {
      type: "keydown",
      key: "c",
      metaKey: true,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
    };
    expect(
      shouldBypassXtermClipboardKeyboardEvent(chord, { ...noSel, kittyKeyboardFlags: 1 }),
    ).toBe(false);
    expect(isAppOwnedCopyChord(chord, { ...noSel, kittyKeyboardFlags: 1 })).toBe(true);
  });

  it("bubbles Ctrl+C on Linux only with a selection", () => {
    const chord = {
      type: "keydown",
      key: "c",
      metaKey: false,
      ctrlKey: true,
      altKey: false,
      shiftKey: false,
    };
    expect(shouldBypassXtermClipboardKeyboardEvent(chord, { isMac: false, hasSelection: true })).toBe(
      true,
    );
    expect(shouldBypassXtermClipboardKeyboardEvent(chord, { isMac: false, hasSelection: false })).toBe(
      false,
    );
  });
});
