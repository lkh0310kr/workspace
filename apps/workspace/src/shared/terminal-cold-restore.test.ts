import { Terminal } from "@xterm/headless";
import { describe, expect, it } from "vitest";
import { prepareTerminalColdRestoreSnapshot } from "./terminal-cold-restore";

function write(terminal: Terminal, data: string): Promise<void> {
  return new Promise((resolve) => terminal.write(data, resolve));
}

describe("terminal cold restore", () => {
  it("leaves a serialized Codex alternate screen scrollable after a full restart", async () => {
    const terminal = new Terminal({ cols: 40, rows: 5, scrollback: 100 });
    try {
      const history = [
        "shell history 1",
        "shell history 2",
        "shell history 3",
        "shell history 4",
        "shell history 5",
        "shell history 6",
        "shell history 7",
        "shell history 8",
      ].join("\r\n");
      await write(
        terminal,
        `${history}\x1b[?1049h\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1006hCodex screen`,
      );
      expect(terminal.buffer.active.type).toBe("alternate");
      expect(terminal.modes.mouseTrackingMode).not.toBe("none");

      await write(terminal, prepareTerminalColdRestoreSnapshot("serialized Codex screen"));

      expect(terminal.buffer.active.type).toBe("normal");
      expect(terminal.modes.mouseTrackingMode).toBe("none");
      expect(terminal.modes.bracketedPasteMode).toBe(false);
      expect(terminal.buffer.active.length).toBeGreaterThan(terminal.rows);
    } finally {
      terminal.dispose();
    }
  });
});
