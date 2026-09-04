import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  ancestorDirPaths,
  loadExplorerTreeState,
  resetExplorerTreeState,
  saveExplorerExpanded,
  saveExplorerScrollTop,
} from "./explorerState";

function createStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

describe("ancestorDirPaths", () => {
  it("returns parent folders for a nested file", () => {
    expect(ancestorDirPaths("src/components/TreeView.tsx")).toEqual(["src", "src/components"]);
  });

  it("returns empty for a root-level file", () => {
    expect(ancestorDirPaths("README.md")).toEqual([]);
  });
});

describe("explorer tree state", () => {
  const key = "test-pane-key";
  const root = "/home/me/workspace";

  beforeEach(() => {
    vi.stubGlobal("localStorage", createStorage());
    resetExplorerTreeState(key, root);
  });

  it("persists expanded paths and scroll across loads", () => {
    saveExplorerExpanded(key, root, ["src", "src/lib"]);
    saveExplorerScrollTop(key, root, 120);
    const loaded = loadExplorerTreeState(key, root);
    expect(loaded.expanded).toEqual(["src", "src/lib"]);
    expect(loaded.scrollTop).toBe(120);
  });

  it("resets when rootPath changes", () => {
    saveExplorerExpanded(key, root, ["src"]);
    const other = loadExplorerTreeState(key, "/other/root");
    expect(other.expanded).toEqual([]);
    expect(other.rootPath).toBe("/other/root");
    const back = loadExplorerTreeState(key, root);
    expect(back.expanded).toEqual(["src"]);
  });
});
