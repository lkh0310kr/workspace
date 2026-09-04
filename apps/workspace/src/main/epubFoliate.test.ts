import { JSDOM } from "jsdom";
import AdmZip from "adm-zip";
import { describe, expect, it } from "vitest";
import { buildMiniEpubBuffer } from "./miniEpub";
import { EPUB } from "../renderer/src/vendor/foliate-js/epub.js";

const { window } = new JSDOM("<!DOCTYPE html><html></html>");
globalThis.DOMParser = window.DOMParser;
globalThis.CSS = window.CSS;
globalThis.NodeFilter = window.NodeFilter;

function zipFiles(zip: AdmZip): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    files.set(entry.entryName.replace(/\\/g, "/"), entry.getData());
  }
  return files;
}

describe("foliate-js EPUB loader", () => {
  it("reads both spine sections and the nav TOC from the mini fixture", async () => {
    const files = zipFiles(new AdmZip(buildMiniEpubBuffer()));
    expect(files.has("META-INF/container.xml")).toBe(true);
    const book = (await new EPUB({
      loadText: async (name: string) => {
        const buf = files.get(name.replace(/\\/g, "/"));
        return buf ? buf.toString("utf8") : null;
      },
      loadBlob: async (name: string) => {
        const buf = files.get(name.replace(/\\/g, "/"));
        return buf ? new Blob([new Uint8Array(buf)]) : null;
      },
      getSize: (name: string) => files.get(name.replace(/\\/g, "/"))?.length ?? 0,
    }).init()) as { sections: { linear?: string }[]; toc?: { label?: string }[] };

    expect(book.sections.filter((section) => section.linear !== "no")).toHaveLength(2);
    expect(book.toc?.some((item) => item.label === "Chapter One")).toBe(true);
    expect(book.toc?.some((item) => item.label === "Chapter Two")).toBe(true);
  });
});
