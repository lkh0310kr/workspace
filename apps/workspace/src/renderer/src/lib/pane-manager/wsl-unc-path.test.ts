import { describe, expect, it } from "vitest";
import { isWslUncPath } from "./wsl-unc-path";

describe("isWslUncPath", () => {
  it("detects wsl.localhost UNC paths", () => {
    expect(isWslUncPath("\\\\wsl.localhost\\Ubuntu\\home\\me\\workspace")).toBe(true);
    expect(isWslUncPath("//wsl.localhost/Ubuntu/home/me/workspace")).toBe(true);
  });

  it("detects wsl$ UNC paths", () => {
    expect(isWslUncPath("\\\\wsl$\\Debian\\home\\me\\repo")).toBe(true);
  });

  it("rejects ordinary Windows paths", () => {
    expect(isWslUncPath("C:\\Users\\me\\project")).toBe(false);
  });
});
