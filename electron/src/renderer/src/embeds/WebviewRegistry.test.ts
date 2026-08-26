import { describe, expect, it, beforeEach } from "vitest";
import {
  WEBVIEW_LRU_CAPACITY,
  clearWebviewSlotsForTests,
  getWebviewSlotCount,
  requestWebviewSlot,
  touchWebviewSlot,
  webviewSessionKey,
} from "./WebviewRegistry";

describe("WebviewRegistry", () => {
  beforeEach(() => {
    clearWebviewSlotsForTests();
  });

  it("builds stable session keys", () => {
    expect(webviewSessionKey(2, "browser-abc")).toBe("2:browser-abc");
  });

  it("evicts LRU slot when capacity exceeded", () => {
    const evicted: string[] = [];
    const releases: Array<() => void> = [];

    for (let i = 0; i < WEBVIEW_LRU_CAPACITY; i++) {
      const key = `1:tab-${i}`;
      releases.push(
        requestWebviewSlot(key, () => {
          evicted.push(key);
        }),
      );
    }
    expect(getWebviewSlotCount()).toBe(WEBVIEW_LRU_CAPACITY);

    requestWebviewSlot("1:tab-new", () => {});
    expect(evicted).toEqual(["1:tab-0"]);
    expect(getWebviewSlotCount()).toBe(WEBVIEW_LRU_CAPACITY);

    releases.forEach((r) => r());
  });

  it("touching a slot protects it from LRU eviction", () => {
    const evicted: string[] = [];
    requestWebviewSlot("1:a", () => evicted.push("1:a"));
    requestWebviewSlot("1:b", () => evicted.push("1:b"));
    requestWebviewSlot("1:c", () => evicted.push("1:c"));
    requestWebviewSlot("1:d", () => evicted.push("1:d"));

    touchWebviewSlot("1:a");
    requestWebviewSlot("1:e", () => {});

    expect(evicted).toEqual(["1:b"]);
  });
});
