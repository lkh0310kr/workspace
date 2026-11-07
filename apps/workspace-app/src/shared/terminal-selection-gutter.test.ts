import { describe, expect, it } from "vitest";
import { stripTerminalSelectionGutter } from "./terminal-selection-gutter";

const AGENT_MESSAGE_BODY = [
  "  Thanks for flagging this. The retry limit is now 5, and the backoff",
  "  starts at 2s instead of 500ms.",
  "",
  "  Let me know if anything still looks off.",
].join("\n");

describe("stripTerminalSelectionGutter", () => {
  it("drops the gutter agent output is painted behind", () => {
    expect(stripTerminalSelectionGutter(AGENT_MESSAGE_BODY)).toBe(
      [
        "Thanks for flagging this. The retry limit is now 5, and the backoff",
        "starts at 2s instead of 500ms.",
        "",
        "Let me know if anything still looks off.",
      ].join("\n"),
    );
  });

  it("leaves unindented shell output untouched", () => {
    const shellOutput = ["$ git status", "On branch main", "nothing to commit"].join("\n");
    expect(stripTerminalSelectionGutter(shellOutput)).toBe(shellOutput);
  });
});
