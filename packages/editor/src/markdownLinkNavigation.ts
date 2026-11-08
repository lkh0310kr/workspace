import { syntaxTree } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

export interface EditorMarkdownLink {
  kind: "markdown" | "wikilink";
  target: string;
}

/** Shared hit-testing and syntax lookup for rendered Markdown links. */
export function markdownLinkNavigation(onActivate: (link: EditorMarkdownLink) => boolean): Extension {
  return EditorView.domEventHandlers({
    click(event, view) {
      const target = (event.target as Element | null)?.closest(".cm-md-link");
      if (!target) return false;
      const position = view.posAtDOM(target);
      let node = syntaxTree(view.state).resolveInner(position, 1);
      while (node && node.type.name !== "Link" && node.type.name !== "WikiLink" && node.parent) node = node.parent;
      if (!node) return false;

      let link: EditorMarkdownLink | null = null;
      if (node.type.name === "WikiLink") {
        const source = view.state.doc.sliceString(node.from, node.to);
        const targetName = source.slice(2, -2).split("|")[0]?.trim();
        if (targetName) link = { kind: "wikilink", target: targetName };
      } else if (node.type.name === "Link") {
        const url = node.getChild("URL");
        const href = url ? view.state.doc.sliceString(url.from, url.to).trim() : "";
        if (href) link = { kind: "markdown", target: href };
      }
      if (!link || !onActivate(link)) return false;
      event.preventDefault();
      return true;
    },
  });
}
