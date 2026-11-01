// @vitest-environment jsdom
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { indentGuides } from "./indentGuides";

describe("indent guides", () => {
  it("paints guides on the full line box at each indentation depth", () => {
    const parent = document.createElement("div");
    document.body.append(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: "root\n    @State private var child = false\n        nested\n            deeper\n  partial",
        extensions: indentGuides,
      }),
    });

    try {
      const lines = Array.from(parent.querySelectorAll<HTMLElement>(".cm-indent-guide-line"));
      expect(lines).toHaveLength(2);
      expect(lines[0].textContent).toBe("        nested");
      expect(lines[1].textContent).toBe("            deeper");
      expect(lines[0].style.getPropertyValue("--indent-guide-width")).toBe("4.1ch");
      expect(lines[1].style.getPropertyValue("--indent-guide-width")).toBe("8.1ch");
    } finally {
      view.destroy();
      parent.remove();
    }
  });
});
