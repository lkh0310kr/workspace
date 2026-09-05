import { describe, expect, it } from "vitest";
import { buildTerminalKeyboardProtocolOptions } from "./terminal-keyboard-protocol";
import { buildWindowsPtyCompatibilityOptions } from "./windows-pty-compatibility";
import { buildTerminalPaneOptions } from "./build-terminal-pane-options";

const WINDOWS_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

describe("buildTerminalKeyboardProtocolOptions", () => {
  it("withholds kitty keyboard for local Windows PowerShell panes", () => {
    expect(
      buildTerminalKeyboardProtocolOptions({
        userAgent: WINDOWS_UA,
        cwd: "C:\\repo",
        shellIsWsl: false,
      }),
    ).toEqual({ vtExtensions: { kittyKeyboard: false } });
  });

  it("withholds kitty keyboard for WSL tab roots on Windows", () => {
    expect(
      buildTerminalKeyboardProtocolOptions({
        userAgent: WINDOWS_UA,
        cwd: "\\\\wsl.localhost\\Ubuntu\\home\\me\\repo",
        shellIsWsl: true,
      }),
    ).toEqual({ vtExtensions: { kittyKeyboard: false } });
  });

  it("keeps kitty keyboard for Grok on Windows ConPTY", () => {
    expect(
      buildTerminalKeyboardProtocolOptions({
        userAgent: WINDOWS_UA,
        cwd: "C:\\repo",
        shellIsWsl: false,
        tuiAgent: "grok",
      }),
    ).toEqual({});
  });
});

describe("buildWindowsPtyCompatibilityOptions", () => {
  it("enables ConPTY backend for local Windows panes", () => {
    expect(
      buildWindowsPtyCompatibilityOptions({
        userAgent: WINDOWS_UA,
        osRelease: "10.0.26100",
        cwd: "C:\\repo",
      }),
    ).toEqual({ windowsPty: { backend: "conpty", buildNumber: 26100 } });
  });

  it("enables ConPTY backend for WSL tab roots on Windows", () => {
    expect(
      buildWindowsPtyCompatibilityOptions({
        userAgent: WINDOWS_UA,
        osRelease: "10.0.26100",
        cwd: "\\\\wsl.localhost\\Ubuntu\\home\\me\\repo",
        shellIsWsl: true,
      }),
    ).toEqual({ windowsPty: { backend: "conpty", buildNumber: 26100 } });
  });
});

describe("buildTerminalPaneOptions", () => {
  it("merges Windows overrides into default terminal options", () => {
    const options = buildTerminalPaneOptions({
      userAgent: WINDOWS_UA,
      osRelease: "10.0.26100",
      rootPath: "C:\\Users\\me\\project",
      zoom: 1,
    });
    expect(options.vtExtensions?.kittyKeyboard).toBe(false);
    expect(options.windowsPty).toEqual({ backend: "conpty", buildNumber: 26100 });
  });
});
