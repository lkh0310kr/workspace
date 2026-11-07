/** Keys that turn a page in Foliate/Thorium-style readers. */
export function ebookTurnFromKey(key: string, shift: boolean): "left" | "right" | null {
  if (key === "ArrowLeft" || key === "h" || key === "PageUp") return "left";
  if (key === "ArrowRight" || key === "l" || key === "PageDown") return "right";
  if (key === " " || key === "Spacebar") return shift ? "left" : "right";
  return null;
}

/** Narrow edge strips turn pages; the whole middle is inert so that
 * tapping to dismiss a popover, or starting a selection, never costs the
 * reader their place. */
export const EBOOK_CLICK_ZONE = 0.1;

export function ebookTurnFromClick(clientX: number, width: number): "left" | "right" | null {
  if (width <= 0) return null;
  if (clientX < width * EBOOK_CLICK_ZONE) return "left";
  if (clientX > width * (1 - EBOOK_CLICK_ZONE)) return "right";
  return null;
}

/** A paginated section's iframe is laid out at its *full* width — every
 * column of the chapter side by side (paginator.js `expand()`) — and the
 * renderer scrolls across it. So a click's `clientX` is an offset into
 * the whole chapter, not the visible page, and grows by a page width with
 * every turn. Rebasing it through the iframe's on-screen position, which
 * carries that scroll, gives the position the reader actually sees. */
export function ebookTurnFromPageClick(options: {
  clientX: number;
  frameLeft: number;
  pageLeft: number;
  pageWidth: number;
}): "left" | "right" | null {
  return ebookTurnFromClick(
    options.frameLeft + options.clientX - options.pageLeft,
    options.pageWidth,
  );
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object" || !("tagName" in target)) return false;
  const element = target as { tagName?: string; isContentEditable?: boolean };
  const tag = element.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || Boolean(element.isContentEditable);
}
