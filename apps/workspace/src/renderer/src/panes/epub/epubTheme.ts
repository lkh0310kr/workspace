import type { EbookTheme, ResolvedEbookTheme } from "../../../../shared/ebookState";
import type { ResolvedTheme } from "../../theme";

const THEMES: Record<ResolvedEbookTheme, { bg: string; fg: string; link: string }> = {
  light: { bg: "#fff", fg: "#1a1a1a", link: "#0b57d0" },
  sepia: { bg: "#f4ecd8", fg: "#5c4b37", link: "#8a4b08" },
  dark: { bg: "#1c1c1c", fg: "#e8e8e8", link: "#9ecbff" },
};

/** Sepia has no counterpart in the app's light/dark preference, so it is
 * only ever reached by picking it explicitly. */
export function resolveEbookTheme(theme: EbookTheme, app: ResolvedTheme): ResolvedEbookTheme {
  return theme === "auto" ? app : theme;
}

export function ebookReaderCss(options: {
  theme: ResolvedEbookTheme;
  fontScale: number;
  lineHeight: number;
}): string {
  const colors = THEMES[options.theme];
  const size = Math.round(18 * options.fontScale);
  return `
    @namespace epub "http://www.idpf.org/2007/ops";
    html {
      background: ${colors.bg} !important;
      color: ${colors.fg} !important;
    }
    /* No margin/padding here: the paginator sizes columns off the body box
       and re-measures it through a ResizeObserver, so a padding of our own
       makes that measurement oscillate. Gutters come from the renderer's
       own margin / max-inline-size instead. */
    body {
      background: transparent !important;
      color: inherit !important;
      font-size: ${size}px !important;
    }
    a:link, a:visited { color: ${colors.link}; }
    p, li, blockquote, dd {
      line-height: ${options.lineHeight};
      text-align: justify;
      hanging-punctuation: allow-end last;
      widows: 2;
    }
    [align="left"] { text-align: left; }
    [align="right"] { text-align: right; }
    [align="center"] { text-align: center; }
    [align="justify"] { text-align: justify; }
    pre { white-space: pre-wrap !important; }
    aside[epub|type~="endnote"],
    aside[epub|type~="footnote"],
    aside[epub|type~="note"],
    aside[epub|type~="rearnote"] {
      display: none;
    }
  `;
}

export function formatEbookTitle(title: unknown): string {
  if (!title) return "Untitled";
  if (typeof title === "string") return title;
  if (typeof title === "object") {
    const values = Object.values(title as Record<string, unknown>);
    const first = values.find((value) => typeof value === "string");
    if (typeof first === "string") return first;
  }
  return "Untitled";
}
