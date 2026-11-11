import { codeFolding, foldEffect, foldable, foldedRanges, syntaxTree, unfoldEffect } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, WidgetType } from "@codemirror/view";

class MarkdownFoldControl extends WidgetType {
  constructor(readonly anchor: number, readonly from: number, readonly to: number, readonly folded: boolean) { super(); }

  eq(other: MarkdownFoldControl): boolean {
    return this.anchor === other.anchor && this.from === other.from && this.to === other.to && this.folded === other.folded;
  }

  toDOM(view: EditorView): HTMLElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cm-md-fold-control";
    button.innerHTML = this.folded
      ? '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg>'
      : '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 6 5 5 5-5" /></svg>';
    button.setAttribute("aria-label", this.folded ? "Expand section" : "Collapse section");
    button.title = this.folded ? "Expand section" : "Collapse section";
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      view.dispatch({ effects: this.folded
        ? unfoldEffect.of({ from: this.from, to: this.to })
        : foldEffect.of({ from: this.from, to: this.to }) });
    });
    return button;
  }

  ignoreEvent(): boolean { return false; }
}

function controlsFor(state: EditorState): DecorationSet {
  const ranges: Array<{ anchor: number; from: number; to: number; folded: boolean }> = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (!/^(?:ATX|Setext)Heading[1-6]$/.test(node.type.name) && node.type.name !== "ListItem") return;
      const line = state.doc.lineAt(node.from);
      const range = foldable(state, line.from, line.to);
      if (!range) return;
      let folded = false;
      foldedRanges(state).between(range.from, range.to, () => { folded = true; });
      ranges.push({ anchor: node.from, from: range.from, to: range.to, folded });
    },
  });
  return Decoration.set(ranges.map(({ anchor, from, to, folded }) =>
    Decoration.widget({ widget: new MarkdownFoldControl(anchor, from, to, folded), side: -1 }).range(anchor),
  ), true);
}

export const markdownFolding = [
  codeFolding({ placeholderText: "..." }),
  ViewPlugin.fromClass(class {
    decorations: DecorationSet;

    constructor(view: EditorView) { this.decorations = controlsFor(view.state); }

    update(update: import("@codemirror/view").ViewUpdate) {
      if (update.docChanged || update.transactions.some((transaction) => transaction.effects.length > 0)) {
        this.decorations = controlsFor(update.state);
      }
    }
  }, { decorations: (plugin) => plugin.decorations }),
];
