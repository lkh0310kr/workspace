import { afterEach, describe, expect, it, vi } from "vitest";
import { epubZipEntryUrl, protocolLoader } from "./epubLoader";

describe("epubZipEntryUrl", () => {
  it("encodes zip paths for the privileged workspace-epub protocol", () => {
    expect(epubZipEntryUrl("book-id", "OEBPS/ch 1.xhtml")).toBe(
      "workspace-epub://book-id/OEBPS/ch%201.xhtml",
    );
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("protocolLoader", () => {
  it("answers optional-file probes from the zip listing instead of a 404 fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const loader = protocolLoader("book-id", { "OEBPS/ch1.xhtml": 120 });

    expect(await loader.loadText("META-INF/encryption.xml")).toBeNull();
    expect(await loader.loadBlob("META-INF/com.apple.ibooks.display-options.xml")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fetches entries the zip actually has", async () => {
    const fetchSpy = vi.fn(async () => new Response("<html/>", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const loader = protocolLoader("book-id", { "OEBPS/ch1.xhtml": 120 });

    expect(await loader.loadText("OEBPS/ch1.xhtml")).toBe("<html/>");
    expect(loader.getSize("OEBPS/ch1.xhtml")).toBe(120);
    expect(fetchSpy).toHaveBeenCalledWith("workspace-epub://book-id/OEBPS/ch1.xhtml");
  });
});
