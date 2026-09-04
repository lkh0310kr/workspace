import { describe, expect, it } from "vitest";
import { createMarkdownSlashCommands, filterSlashCommands } from "./markdownSlashCommands";

describe("markdownSlashCommands", () => {
  const commands = createMarkdownSlashCommands({ onAugment: () => {} });

  it("shows all commands for empty query", () => {
    expect(filterSlashCommands("", commands)).toHaveLength(1);
    expect(filterSlashCommands("/", commands)).toHaveLength(1);
  });

  it("filters ai category commands", () => {
    const filtered = filterSlashCommands("ai", commands);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe("ai.augment");
  });

  it("matches 증강 label directly", () => {
    const filtered = filterSlashCommands("증강", commands);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.label).toBe("증강");
  });
});
