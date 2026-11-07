import { describe, expect, it } from "vitest";
import { trimTerminalSessionBufferToByteLimit, utf8ByteLength } from "./terminal-session-buffers";

describe("trimTerminalSessionBufferToByteLimit", () => {
  it("keeps short buffers unchanged", () => {
    expect(trimTerminalSessionBufferToByteLimit("hello")).toBe("hello");
  });

  it("trims from the front to respect the byte budget", () => {
    const head = "a".repeat(1000);
    const tail = "SCROLLBACK_MARKER";
    const serialized = head + tail;
    const maxBytes = utf8ByteLength(tail) + 10;
    const trimmed = trimTerminalSessionBufferToByteLimit(serialized, maxBytes);
    expect(trimmed.includes("SCROLLBACK_MARKER")).toBe(true);
    expect(utf8ByteLength(trimmed)).toBeLessThanOrEqual(maxBytes);
  });

  it("does not split multibyte UTF-8 characters at the trim boundary", () => {
    const hangul = "한글";
    const serialized = "x".repeat(200) + hangul;
    const maxBytes = utf8ByteLength(hangul) + 4;
    const trimmed = trimTerminalSessionBufferToByteLimit(serialized, maxBytes);
    expect(trimmed.endsWith(hangul)).toBe(true);
    expect(trimmed.includes("\uFFFD")).toBe(false);
  });
});
