/** Mirrors foliate-js `paginator.js` `#turnPage` / `#adjacentIndex`. */

export function nextLinearSectionIndex(
  sections: { linear?: string }[],
  index: number,
  dir: 1 | -1,
): number | null {
  for (let cursor = index + dir; cursor >= 0 && cursor < sections.length; cursor += dir) {
    if (sections[cursor]?.linear !== "no") return cursor;
  }
  return null;
}

export function ebookTurnAfterPage(options: {
  atEndOfSection: boolean;
  nextLinearSectionIndex: number | null;
}): "page" | "section" | "end" {
  if (!options.atEndOfSection) return "page";
  if (options.nextLinearSectionIndex == null) return "end";
  return "section";
}
