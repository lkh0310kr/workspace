import { describe, expect, it } from "vitest";
import {
  ebookTurnFromClick,
  ebookTurnFromKey,
  ebookTurnFromPageClick,
  isTypingTarget,
} from "./epubKeys";
import { ebookTurnAfterPage, nextLinearSectionIndex } from "./epubPageTurn";
import { ebookReaderCss, formatEbookTitle } from "./epubTheme";

describe("ebookTurnFromKey", () => {
  it("maps Foliate/Thorium paging keys", () => {
    expect(ebookTurnFromKey("ArrowRight", false)).toBe("right");
    expect(ebookTurnFromKey("ArrowLeft", false)).toBe("left");
    expect(ebookTurnFromKey(" ", false)).toBe("right");
    expect(ebookTurnFromKey(" ", true)).toBe("left");
    expect(ebookTurnFromKey("PageDown", false)).toBe("right");
    expect(ebookTurnFromKey("a", false)).toBeNull();
  });
});

describe("ebookTurnFromClick", () => {
  it("turns from the outer tenth on each side", () => {
    expect(ebookTurnFromClick(50, 1000)).toBe("left");
    expect(ebookTurnFromClick(950, 1000)).toBe("right");
  });

  it("leaves the middle eight tenths inert, edges included", () => {
    expect(ebookTurnFromClick(100, 1000)).toBeNull();
    expect(ebookTurnFromClick(500, 1000)).toBeNull();
    expect(ebookTurnFromClick(900, 1000)).toBeNull();
  });

  it("does nothing before the view has been measured", () => {
    expect(ebookTurnFromClick(0, 0)).toBeNull();
  });
});

describe("ebookTurnFromPageClick", () => {
  // A 10-page chapter: the iframe is 8000px wide and slides left by one
  // 800px page per turn, so the same on-screen spot arrives with a
  // clientX that keeps growing.
  const onPage = (index: number, clientX: number) =>
    ebookTurnFromPageClick({
      clientX,
      frameLeft: -800 * index,
      pageLeft: 0,
      pageWidth: 800,
    });

  it("reads the same on-screen spot the same way on every page", () => {
    for (const page of [0, 1, 2, 9]) {
      expect(onPage(page, 800 * page + 790)).toBe("right");
      expect(onPage(page, 800 * page + 10)).toBe("left");
      expect(onPage(page, 800 * page + 400)).toBeNull();
    }
  });

  it("measures from the reader's own box, not the window", () => {
    const withSidebar = (clientX: number) =>
      ebookTurnFromPageClick({ clientX, frameLeft: 220, pageLeft: 220, pageWidth: 800 });
    expect(withSidebar(790)).toBe("right");
    expect(withSidebar(10)).toBe("left");
  });
});

describe("isTypingTarget", () => {
  it("ignores non-elements", () => {
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("ebookReaderCss", () => {
  it("injects theme colors and type scale", () => {
    const css = ebookReaderCss({ theme: "sepia", fontScale: 1.2, lineHeight: 1.6 });
    expect(css).toContain("#f4ecd8");
    expect(css).toContain("line-height: 1.6");
    expect(css).toContain("font-size: 22px");
  });
});

describe("ebookTurnAfterPage", () => {
  it("stays in the section until the last column, then advances the spine", () => {
    const sections = [{ linear: "yes" }, { linear: "yes" }];
    expect(ebookTurnAfterPage({ atEndOfSection: false, nextLinearSectionIndex: 1 })).toBe("page");
    expect(
      ebookTurnAfterPage({
        atEndOfSection: true,
        nextLinearSectionIndex: nextLinearSectionIndex(sections, 0, 1),
      }),
    ).toBe("section");
    expect(
      ebookTurnAfterPage({
        atEndOfSection: true,
        nextLinearSectionIndex: nextLinearSectionIndex(sections, 1, 1),
      }),
    ).toBe("end");
  });
});

describe("formatEbookTitle", () => {
  it("reads language maps", () => {
    expect(formatEbookTitle({ en: "Grass Pillow", ja: "草枕" })).toBe("Grass Pillow");
    expect(formatEbookTitle("Plain")).toBe("Plain");
  });
});
