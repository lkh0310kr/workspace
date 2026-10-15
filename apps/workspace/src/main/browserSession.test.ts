import { describe, expect, it } from "vitest";
import { isAutoGrantedBrowserSessionPermission } from "./browserSession";

describe("browser session permissions", () => {
  it("auto-grants clipboard permissions for guest web pages", () => {
    expect(isAutoGrantedBrowserSessionPermission("clipboard-read")).toBe(true);
    expect(isAutoGrantedBrowserSessionPermission("clipboard-sanitized-write")).toBe(true);
  });
});
