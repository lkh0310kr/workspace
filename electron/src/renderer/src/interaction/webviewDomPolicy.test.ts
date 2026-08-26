import { describe, expect, it } from "vitest";
import { resolveWebviewDomShown } from "./webviewDomPolicy";

describe("webviewDomPolicy", () => {
  it("shows webview only when visible and interactive", () => {
    expect(resolveWebviewDomShown({ visible: true, interactive: true })).toBe(true);
    expect(resolveWebviewDomShown({ visible: true, interactive: false })).toBe(false);
    expect(resolveWebviewDomShown({ visible: false, interactive: false })).toBe(false);
  });
});
