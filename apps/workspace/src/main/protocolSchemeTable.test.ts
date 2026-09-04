import { describe, expect, it } from "vitest";
import { EPUB_SCHEME, MEDIA_SCHEME, PRIVILEGED_SCHEMES } from "./protocolSchemeTable";
import { ENGINE_SCHEME } from "./engineBundlePaths";
import { MODEL_SCHEME } from "./model3d/modelProtocolUrl";

describe("privileged scheme table", () => {
  it("carries every workspace scheme, since Electron only accepts one registration call", () => {
    expect(PRIVILEGED_SCHEMES.map((entry) => entry.scheme).sort()).toEqual(
      [MEDIA_SCHEME, MODEL_SCHEME, EPUB_SCHEME, ENGINE_SCHEME].sort(),
    );
  });

  it("keeps every scheme fetchable from the renderer", () => {
    for (const entry of PRIVILEGED_SCHEMES) {
      expect(entry.privileges?.supportFetchAPI, entry.scheme).toBe(true);
      expect(entry.privileges?.standard, entry.scheme).toBe(true);
      expect(entry.privileges?.corsEnabled, entry.scheme).toBe(true);
    }
  });
});
