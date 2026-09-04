import { describe, it, expect } from "vitest";
import { normalizeBrowserNavigationUrl } from "./browserUrl";

describe("normalizeBrowserNavigationUrl", () => {
  it("passes through a normal https URL", () => {
    expect(normalizeBrowserNavigationUrl("https://example.com", false)).toBe("https://example.com/");
  });

  it("rejects an arbitrary unknown scheme", () => {
    expect(normalizeBrowserNavigationUrl("ftp://example.com", false)).toBeNull();
  });

  it("allows workspace-engine: — the engine-bundle-hosting scheme (engineBundleProtocol.ts) set programmatically via TreeView's Open as App, not typed by a user", () => {
    const url = "workspace-engine://local/Users/kh/proj/export/web/index.html";
    expect(normalizeBrowserNavigationUrl(url, false)).toBe(url);
  });
});
