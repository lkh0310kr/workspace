import { describe, expect, it } from "vitest";
import { fuzzyFilter } from "./quickOpenFuzzy";

const identity = (s: string): string => s;

describe("fuzzyFilter", () => {
  it("returns everything (up to the limit) for an empty query", () => {
    expect(fuzzyFilter(["a", "b", "c"], "", identity)).toEqual(["a", "b", "c"]);
  });

  it("matches a contiguous substring case-insensitively", () => {
    expect(fuzzyFilter(["README.md", "src/index.ts"], "readme", identity)).toEqual(["README.md"]);
  });

  it("matches a scattered subsequence", () => {
    expect(fuzzyFilter(["src/toolOrder.ts"], "tor", identity)).toEqual(["src/toolOrder.ts"]);
  });

  it("excludes items missing a query character", () => {
    expect(fuzzyFilter(["foo.ts", "bar.ts"], "xyz", identity)).toEqual([]);
  });

  it("ranks a contiguous match above a scattered one", () => {
    const result = fuzzyFilter(["src/tool/order.ts", "TODO.md"], "todo", identity);
    expect(result[0]).toBe("TODO.md");
  });

  it("ranks an earlier contiguous match above a later one", () => {
    const result = fuzzyFilter(["src/notes/todo.md", "todo.md"], "todo", identity);
    expect(result[0]).toBe("todo.md");
  });

  it("respects the limit", () => {
    const items = Array.from({ length: 10 }, (_, i) => `file${i}.md`);
    expect(fuzzyFilter(items, "file", identity, 3)).toHaveLength(3);
  });
});
