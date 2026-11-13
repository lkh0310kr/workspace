import { describe, expect, it } from "vitest";
import { parseRipgrepMatchLine, resolveSearchBinaryPath } from "./search";

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

  it("resolves ripgrep's relative paths against the workspace root", () => {
    const relativeMatch = JSON.stringify({
      type: "match",
      data: {
        path: { text: "./notes/todo.md" },
        lines: { text: "hello world\n" },
        line_number: 3,
        submatches: [{ start: 0, end: 5 }],
      },
    });
    expect(parseRipgrepMatchLine(relativeMatch, ROOT)?.path).toBe("notes/todo.md");
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

describe("resolveSearchBinaryPath", () => {
  it("uses the unpacked executable when the module resolves inside an asar", () => {
    const virtualPath = "/Applications/Workspace.app/Contents/Resources/app.asar/node_modules/@vscode/ripgrep-darwin-arm64/bin/rg";
    const unpackedPath = virtualPath.replace("app.asar/", "app.asar.unpacked/");
    expect(resolveSearchBinaryPath(virtualPath, (candidate) => candidate === unpackedPath)).toBe(unpackedPath);
  });

  it("keeps normal and already-unpacked paths unchanged", () => {
    const normalPath = "/opt/workspace/node_modules/rg";
    const unpackedPath = "/Applications/Workspace.app/Contents/Resources/app.asar.unpacked/node_modules/rg";
    expect(resolveSearchBinaryPath(normalPath, () => true)).toBe(normalPath);
    expect(resolveSearchBinaryPath(unpackedPath, () => true)).toBe(unpackedPath);
  });
});
