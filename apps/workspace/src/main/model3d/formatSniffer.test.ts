import { describe, expect, it } from "vitest";
import { sniffModelFormat } from "./formatSniffer";

describe("sniffModelFormat", () => {
  it("detects step by extension and ISO header", () => {
    expect(sniffModelFormat(new Uint8Array(), "part.step")).toBe("step");
    expect(sniffModelFormat(new Uint8Array(), "part.stp")).toBe("step");
    const header = new TextEncoder().encode("ISO-10303-21;\nHEADER;\n");
    expect(sniffModelFormat(header, "unknown")).toBe("step");
  });
});
