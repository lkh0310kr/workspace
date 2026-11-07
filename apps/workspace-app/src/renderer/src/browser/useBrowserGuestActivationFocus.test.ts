/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import { useBrowserGuestActivationFocus } from "./useBrowserGuestActivationFocus";

vi.mock("./useWebviewDragPassthroughActive", () => ({
  useWebviewDragPassthroughActive: () => false,
}));

describe("useBrowserGuestActivationFocus", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exports the activation focus hook", () => {
    expect(typeof useBrowserGuestActivationFocus).toBe("function");
  });
});
