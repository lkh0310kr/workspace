import { describe, expect, it } from "vitest";
import type { TabInfo } from "../electron";
import { projectVisibleWorkspaceTabId } from "./workspaceScope";

const tabs: TabInfo[] = [
  { id: 1, title: "a", root_path: "/a", layout_json: "{}" },
  { id: 2, title: "b", root_path: "/b", layout_json: "{}" },
];

describe("workspaceScope", () => {
  it("prefers optimistic tab during rail switch", () => {
    expect(projectVisibleWorkspaceTabId(1, 1, 2, tabs)).toBe(2);
  });

  it("falls back to store active tab when coordinator is null", () => {
    expect(projectVisibleWorkspaceTabId(2, null, null, tabs)).toBe(2);
  });

  it("uses store when coordinator matches store", () => {
    expect(projectVisibleWorkspaceTabId(2, 2, null, tabs)).toBe(2);
  });

  it("uses coordinator when store tab was closed", () => {
    expect(projectVisibleWorkspaceTabId(99, 2, null, tabs)).toBe(2);
  });

  it("uses store when coordinator tab was closed", () => {
    expect(projectVisibleWorkspaceTabId(1, 99, null, tabs)).toBe(1);
  });

  it("prefers store when both ids are open but disagree", () => {
    expect(projectVisibleWorkspaceTabId(1, 2, null, tabs)).toBe(1);
  });
});
