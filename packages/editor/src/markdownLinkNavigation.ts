import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

export interface EditorMarkdownLink {
  kind: "markdown" | "wikilink";
  target: string;
}

function linkAtPosition(view: EditorView, position: number): EditorMarkdownLink | null {
  const tree = syntaxTree(view.state);
  let node: SyntaxNode | null = null;
  for (const side of [-1, 1] as const) {
    let candidate = tree.resolveInner(position, side);
    while (candidate && candidate.type.name !== "Link" && candidate.type.name !== "WikiLink" && candidate.parent) candidate = candidate.parent;
    if (candidate && (candidate.type.name === "Link" || candidate.type.name === "WikiLink")) {
      node = candidate;
      break;
    }
  }
  if (!node) return null;

  if (node.type.name === "WikiLink") {
    const source = view.state.doc.sliceString(node.from, node.to);
    const targetName = source.slice(2, -2).split("|")[0]?.trim();
    return targetName ? { kind: "wikilink", target: targetName } : null;
  }
  const url = node.getChild("URL");
  const href = url ? view.state.doc.sliceString(url.from, url.to).trim() : "";
  return href ? { kind: "markdown", target: href } : null;
}

function linkAt(view: EditorView, target: Element | null, event?: MouseEvent): EditorMarkdownLink | null {
  const element = target?.closest(".cm-md-link");
  if (element) {
    const link = linkAtPosition(view, view.posAtDOM(element));
    if (link) return link;
  }
  const position = event ? view.posAtCoords({ x: event.clientX, y: event.clientY }) : null;
  return position == null ? null : linkAtPosition(view, position);
}

/** Shared hit-testing and syntax lookup for rendered Markdown links. */
export function markdownLinkNavigation(onActivate: (link: EditorMarkdownLink) => boolean): Extension {
  let pressedLink: { link: EditorMarkdownLink; time: number } | null = null;
  let lastActivated: { target: string; time: number } | null = null;
  const activate = (link: EditorMarkdownLink, event: MouseEvent): boolean => {
    if (lastActivated?.target === link.target && Date.now() - lastActivated.time < 450) {
      event.preventDefault();
      return true;
    }
    if (link.kind === "markdown") {
      try {
        const url = new URL(link.target);
        if (url.protocol === "http:" || url.protocol === "https:") {
          window.open(url.toString(), "_blank", "noopener,noreferrer");
          event.preventDefault();
          lastActivated = { target: link.target, time: Date.now() };
          return true;
        }
      } catch {
        // Relative/provider links are resolved by the host callback below.
      }
    }
    if (!onActivate(link)) return false;
    event.preventDefault();
    lastActivated = { target: link.target, time: Date.now() };
    return true;
  };
  return EditorView.domEventHandlers({
    mousedown(event, view) {
      if (event.button !== 0) return false;
      const link = linkAt(view, event.target as Element | null, event);
      pressedLink = link ? { link, time: Date.now() } : null;
      return link ? activate(link, event) : false;
    },
    click(event, view) {
      const current = linkAt(view, event.target as Element | null, event);
      const pressed = pressedLink && Date.now() - pressedLink.time < 1000
        ? pressedLink.link
        : null;
      pressedLink = null;
      const link = current ?? pressed;
      return link ? activate(link, event) : false;
    },
  });
}
