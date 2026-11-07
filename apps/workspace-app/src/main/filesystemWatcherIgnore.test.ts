import { describe, expect, it } from "vitest";
import { shouldIgnoreWatcherPath } from "./filesystemWatcherIgnore";

describe("shouldIgnoreWatcherPath", () => {
  it("ignores changes under node_modules", () => {
    expect(shouldIgnoreWatcherPath("packages/app/node_modules/foo/index.js")).toBe(true);
  });

  it("allows normal source paths", () => {
    expect(shouldIgnoreWatcherPath("src/components/TreeView.tsx")).toBe(false);
  });
});
