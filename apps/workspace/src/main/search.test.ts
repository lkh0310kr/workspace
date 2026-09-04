import { describe, expect, it } from "vitest";
import { parseRipgrepMatchLine } from "./search";

const ROOT = "/root/workspace";

function matchLine(overrides: Partial<{ path: string; lineNumber: number; text: string }> = {}) {
  return JSON.stringify({
    type: "match",
    data: {
      path: { text: overrides.path ?? "/root/workspace/notes/todo.md" },
      lines: { text: `${overrides.text ?? "hello world"}\n` },
      line_number: overrides.lineNumber ?? 3,
      submatches: [{ start: 0, end: 5 }],
    },
  });
}

describe("parseRipgrepMatchLine", () => {
  it("parses a match event into a root-relative path and match", () => {
    const result = parseRipgrepMatchLine(matchLine(), ROOT);
    expect(result).toEqual({
      path: "notes/todo.md",
      match: {
        lineNumber: 3,
        lineText: "hello world",
        ranges: [{ start: 0, end: 5 }],
      },
    });
  });

  it("strips the trailing newline from the line text", () => {
    const result = parseRipgrepMatchLine(matchLine({ text: "line with match" }), ROOT);
    expect(result?.match.lineText).toBe("line with match");
  });

  it("ignores begin/end/summary events", () => {
    expect(parseRipgrepMatchLine(JSON.stringify({ type: "begin", data: {} }), ROOT)).toBeNull();
    expect(parseRipgrepMatchLine(JSON.stringify({ type: "end", data: {} }), ROOT)).toBeNull();
    expect(parseRipgrepMatchLine(JSON.stringify({ type: "summary", data: {} }), ROOT)).toBeNull();
  });

  it("returns null for empty or malformed lines instead of throwing", () => {
    expect(parseRipgrepMatchLine("", ROOT)).toBeNull();
    expect(parseRipgrepMatchLine("not json", ROOT)).toBeNull();
  });
});
