import { describe, expect, it } from "vitest";
import { isBenignBrowserNotice } from "./errorLog";

describe("isBenignBrowserNotice", () => {
  it("ignores the ResizeObserver layout notice foliate's paginator provokes", () => {
    expect(
      isBenignBrowserNotice("ResizeObserver loop completed with undelivered notifications."),
    ).toBe(true);
    expect(isBenignBrowserNotice("ResizeObserver loop limit exceeded")).toBe(true);
  });

  it("keeps real errors, including ones that merely mention ResizeObserver", () => {
    expect(isBenignBrowserNotice("Should not already be working")).toBe(false);
    expect(isBenignBrowserNotice("TypeError: ResizeObserver is not a constructor")).toBe(false);
    expect(isBenignBrowserNotice("ENOENT: no such file or directory")).toBe(false);
  });
});
