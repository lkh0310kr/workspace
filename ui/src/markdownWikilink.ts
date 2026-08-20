import type { InlineParser, MarkdownConfig } from "@lezer/markdown";

// Obsidian's `[[Note]]` / `[[Note|Alias]]` syntax has no CommonMark/GFM
// equivalent, so there's no existing @lezer/markdown extension for it —
// this is a small custom InlineParser. Installed `before: "Link"` so it
// gets first look at a `[` — otherwise the built-in Link parser would try
// (and fail) to parse the outer `[` as a normal link bracket first.
const wikiLinkParser: InlineParser = {
  name: "WikiLink",
  before: "Link",
  parse(cx, next, pos) {
    if (next !== 91 /* '[' */ || cx.char(pos + 1) !== 91) return -1;
    const rest = cx.slice(pos, cx.end);
    const close = rest.indexOf("]]", 2);
    if (close < 0) return -1;
    const end = pos + close + 2;
    return cx.addElement(cx.elt("WikiLink", pos, end));
  },
};

export const wikiLinkExtension: MarkdownConfig = {
  defineNodes: ["WikiLink"],
  parseInline: [wikiLinkParser],
};
